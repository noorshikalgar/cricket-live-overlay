import type { MatchEvent, MatchFormat, MatchState, MatchSummary, PollStatus } from '@cos/shared';
import { detectEvents } from './events';
import type { CricketProvider } from './providers';
import { ProviderHttpError } from './providers/types';
import { BudgetExceededError, type CallBudget } from './usage';

/** Expected playing time per day, used to spread the daily budget across a match. */
export const MATCH_SECONDS: Record<MatchFormat, number> = {
  T20: 4 * 3600,
  ODI: 8.5 * 3600,
  TEST: 7 * 3600,
};

export const BREAK_INTERVAL_SECONDS = 60;
export const STALE_AFTER_MS = 30_000;
/** how often to refresh the live-matches list (match picker, ticker) on big plans */
const LIST_REFRESH_MS = 5 * 60_000;
/** below this daily limit the match list is only fetched when you press ↻ */
const AUTO_LIST_MIN_DAILY = 1000;

/**
 * Seconds between polls so a whole match fits the plan:
 *   max(min, matchSeconds / (daily × 0.9), 60 / (perMinute × 0.75)) × callsPerPoll
 * The 0.9 / 0.75 factors leave room for the match list and retries.
 */
export function budgetInterval(
  format: MatchFormat,
  dailyLimit: number,
  minSeconds: number,
  perMinute = 0,
  callsPerPoll = 1,
): number {
  const spread = dailyLimit > 0 ? MATCH_SECONDS[format] / (dailyLimit * 0.9) : 0;
  const perMinuteFloor = perMinute > 0 ? 60 / (perMinute * 0.75) : 0;
  const perCall = Math.max(spread, perMinuteFloor);
  return Math.max(minSeconds, Math.round(perCall * callsPerPoll * 10) / 10);
}

export interface PollerHooks {
  onState(state: MatchState | null): void;
  onEvent(event: MatchEvent): void;
  onStatus(status: PollStatus): void;
  onMatches(matches: MatchSummary[]): void;
}

export interface PollerOptions {
  minSeconds: number;
  /** POLL_SECONDS: fixed interval instead of the budget formula (budget caps still apply) */
  fixedSeconds: number;
}

export class Poller {
  private matchId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private staleTimer: NodeJS.Timeout | null = null;
  private listTimer: NodeJS.Timeout | null = null;
  private last: MatchState | null = null;
  private lastGoodAt = 0;
  private fired = new Set<string>();
  private backoff = 1;
  private status: PollStatus;
  private matches: MatchSummary[] = [];

  constructor(
    private readonly provider: CricketProvider,
    private readonly budget: CallBudget,
    private readonly opts: PollerOptions,
    private readonly hooks: PollerHooks,
  ) {
    if (provider.countsTowardQuota) provider.attachBudget?.(budget);
    this.status = {
      provider: provider.name,
      matchId: null,
      phase: 'idle',
      intervalSeconds: 0,
      callsToday: budget.calls,
      dailyLimit: budget.dailyLimit,
      lastPollAt: null,
      lastError: null,
      stale: false,
      mode: 'auto',
      paused: false,
      nextPollAt: null,
    };
  }

  private mode: 'auto' | 'manual' = 'auto';
  private paused = false;
  /** runtime override from the Studio; null = opts.fixedSeconds (.env) */
  private overrideSeconds: number | null = null;
  private inFlight = false;

  /** Studio controls: auto/manual and the auto interval. Takes effect immediately. */
  setControl(mode: 'auto' | 'manual', seconds: number | null, paused = false): void {
    const changed = mode !== this.mode || seconds !== this.overrideSeconds || paused !== this.paused;
    this.mode = mode;
    this.overrideSeconds = seconds;
    this.paused = paused;
    if (!changed) return;
    this.patchStatus({ mode, paused });
    if (!this.matchId || this.status.phase === 'stopped') return;
    if (mode === 'manual' || paused) {
      this.clearTimer();
      this.patchStatus({ nextPollAt: null });
    } else if (this.last) {
      this.schedule(this.intervalFor(this.last));
    }
  }

  /** One poll right now, then the normal schedule (auto) or nothing (manual). */
  pollNow(): void {
    if (!this.matchId || this.inFlight) return;
    this.clearTimer();
    void this.tick();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(seconds: number): void {
    this.clearTimer();
    if (this.mode === 'manual' || this.paused) {
      this.patchStatus({ nextPollAt: null, intervalSeconds: seconds });
      return;
    }
    this.timer = setTimeout(() => void this.tick(), seconds * 1000);
    this.patchStatus({ nextPollAt: Date.now() + seconds * 1000, intervalSeconds: seconds });
  }

  /** providers that make several calls per state guard each call themselves */
  private get selfGuarded(): boolean {
    return typeof this.provider.attachBudget === 'function';
  }

  get state(): MatchState | null {
    return this.last;
  }

  get pollStatus(): PollStatus {
    return { ...this.status, callsToday: this.budget.calls };
  }

  get liveMatches(): MatchSummary[] {
    return this.matches;
  }

  private get autoList(): boolean {
    return !this.provider.countsTowardQuota || this.budget.dailyLimit === 0 || this.budget.dailyLimit >= AUTO_LIST_MIN_DAILY;
  }

  start(): void {
    if (this.autoList) {
      void this.refreshMatches();
      this.listTimer = setInterval(() => void this.refreshMatches(), LIST_REFRESH_MS);
    }
    this.staleTimer = setInterval(() => this.checkStale(), 5000);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.listTimer) clearInterval(this.listTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.timer = this.listTimer = this.staleTimer = null;
  }

  select(matchId: string | null): void {
    this.clearTimer();
    this.matchId = matchId;
    this.last = null;
    this.fired = new Set();
    this.backoff = 1;
    this.lastGoodAt = 0;
    this.patchStatus({ matchId, phase: matchId ? 'live' : 'idle', lastError: null, stale: false, intervalSeconds: 0, nextPollAt: null });
    this.hooks.onState(null);
    if (matchId) {
      this.provider.onSelect?.(matchId);
      // one fetch so the overlay has data, even when paused
      void this.tick();
    }
  }

  /** Acquire budget for one call made directly by the poller (providers without their own guard). */
  private acquire(): void {
    if (!this.provider.countsTowardQuota || this.selfGuarded) return;
    if (!this.budget.tryAcquire()) throw new BudgetExceededError(this.budget.blockedReason() ?? 'API budget exhausted');
  }

  async refreshMatches(): Promise<MatchSummary[]> {
    try {
      this.acquire();
      this.matches = await this.provider.listLiveMatches();
      this.hooks.onMatches(this.matches);
      this.patchStatus({});
    } catch (err) {
      this.patchStatus({ lastError: `match list: ${message(err)}` });
    }
    return this.matches;
  }

  private async tick(): Promise<void> {
    const id = this.matchId;
    if (!id) return;
    let delay: number;
    this.inFlight = true;
    try {
      this.acquire();
      const next = await this.provider.getMatchState(id);
      if (this.matchId !== id) return; // selection changed while awaiting
      const events = detectEvents(this.last, next, this.fired);
      this.last = next;
      this.lastGoodAt = Date.now();
      this.backoff = 1;
      this.hooks.onState(next);
      for (const e of events) this.hooks.onEvent(e);
      delay = this.intervalFor(next);
      const phase = next.phase === 'complete' ? 'stopped' : next.phase === 'break' ? 'break' : 'live';
      this.patchStatus({ phase, lastPollAt: Date.now(), lastError: null, stale: false, intervalSeconds: delay });
      if (next.phase === 'complete') {
        this.patchStatus({ nextPollAt: null });
        return; // stop polling a finished match
      }
    } catch (err) {
      if (this.matchId !== id) return;
      if (err instanceof BudgetExceededError && this.budget.remainingToday === 0) {
        // out of calls for today: stop instead of retrying into a wall
        this.patchStatus({ phase: 'error', lastPollAt: Date.now(), lastError: err.message, intervalSeconds: 0, nextPollAt: null });
        this.checkStale();
        return;
      }
      const rateLimited = (err instanceof ProviderHttpError && err.status === 429) || err instanceof BudgetExceededError;
      this.backoff = Math.min(this.backoff * 2, rateLimited ? 16 : 8);
      delay = Math.min(Math.max(BREAK_INTERVAL_SECONDS, this.baseInterval()), this.baseInterval() * this.backoff);
      this.patchStatus({ phase: 'error', lastPollAt: Date.now(), lastError: message(err), intervalSeconds: delay });
      this.checkStale();
    } finally {
      this.inFlight = false;
    }
    if (this.matchId === id) this.schedule(delay);
  }

  private baseInterval(): number {
    if (this.provider.fixedIntervalSeconds) return this.provider.fixedIntervalSeconds;
    const min = Math.max(this.opts.minSeconds, this.provider.minIntervalSeconds ?? 0);
    const fixed = this.overrideSeconds ?? this.opts.fixedSeconds;
    if (fixed > 0) return Math.max(min, fixed);
    const quota = this.provider.countsTowardQuota;
    return budgetInterval(
      this.last?.format ?? 'T20',
      quota ? this.budget.dailyLimit : 0,
      min,
      quota ? this.budget.perMinute : 0,
      this.provider.callsPerPoll ?? 1,
    );
  }

  private intervalFor(state: MatchState): number {
    if (state.phase === 'break' || state.phase === 'upcoming') {
      if (this.provider.fixedIntervalSeconds) return Math.max(this.provider.fixedIntervalSeconds, 2);
      return Math.max(BREAK_INTERVAL_SECONDS, this.baseInterval());
    }
    return this.baseInterval();
  }

  /** Keep serving the last good state; flag it stale when a couple of polls have been missed. */
  private checkStale(): void {
    // in manual mode the commentator decides when data refreshes; old data isn't "stale"
    if (!this.last || !this.lastGoodAt || this.mode === 'manual' || this.paused) return;
    const limit = Math.max(STALE_AFTER_MS, this.baseInterval() * 2500);
    const stale =
      Date.now() - this.lastGoodAt > limit && this.status.phase !== 'stopped' && this.status.phase !== 'break';
    if (stale !== this.last.isStale) {
      this.last = { ...this.last, isStale: stale };
      this.hooks.onState(this.last);
      this.patchStatus({ stale });
    }
  }

  private patchStatus(p: Partial<PollStatus>): void {
    this.status = { ...this.status, ...p, callsToday: this.budget.calls };
    this.hooks.onStatus(this.status);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
