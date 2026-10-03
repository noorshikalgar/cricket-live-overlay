import type { MatchEvent, MatchFormat, MatchState, MatchSummary, PollStatus } from '@cos/shared';
import { detectEvents } from './events';
import type { CricketProvider } from './providers';
import { ProviderHttpError } from './providers/types';
import type { UsageCounter } from './usage';

/** Expected playing time per day, used to spread the daily budget across a match. */
export const MATCH_SECONDS: Record<MatchFormat, number> = {
  T20: 4 * 3600,
  ODI: 8.5 * 3600,
  TEST: 7 * 3600,
};

export const BREAK_INTERVAL_SECONDS = 60;
export const STALE_AFTER_MS = 30_000;
/** how often to refresh the live-matches list (match picker, ticker) */
const LIST_REFRESH_MS = 5 * 60_000;

/**
 * interval = max(min, matchSeconds / (dailyCalls × 0.9), 60 / (perMinute × 0.75))
 * The per-minute term keeps a quarter of the minute's calls spare for the match list and retries.
 */
export function budgetInterval(format: MatchFormat, dailyLimit: number, minSeconds: number, perMinute = 0): number {
  const spread = MATCH_SECONDS[format] / Math.max(1, dailyLimit * 0.9);
  const perMinuteFloor = perMinute > 0 ? 60 / (perMinute * 0.75) : 0;
  return Math.max(minSeconds, Math.round(Math.max(spread, perMinuteFloor) * 10) / 10);
}

export interface PollerHooks {
  onState(state: MatchState | null): void;
  onEvent(event: MatchEvent): void;
  onStatus(status: PollStatus): void;
  onMatches(matches: MatchSummary[]): void;
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
    private readonly usage: UsageCounter,
    private readonly opts: { dailyLimit: number; minSeconds: number; perMinute: number },
    private readonly hooks: PollerHooks,
  ) {
    this.status = {
      provider: provider.name,
      matchId: null,
      phase: 'idle',
      intervalSeconds: 0,
      callsToday: usage.calls,
      dailyLimit: opts.dailyLimit,
      lastPollAt: null,
      lastError: null,
      stale: false,
    };
  }

  get state(): MatchState | null {
    return this.last;
  }

  get pollStatus(): PollStatus {
    return { ...this.status, callsToday: this.usage.calls };
  }

  get liveMatches(): MatchSummary[] {
    return this.matches;
  }

  start(): void {
    void this.refreshMatches();
    this.listTimer = setInterval(() => void this.refreshMatches(), LIST_REFRESH_MS);
    this.staleTimer = setInterval(() => this.checkStale(), 5000);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.listTimer) clearInterval(this.listTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.timer = this.listTimer = this.staleTimer = null;
  }

  select(matchId: string | null): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.matchId = matchId;
    this.last = null;
    this.fired = new Set();
    this.backoff = 1;
    this.lastGoodAt = 0;
    this.patchStatus({ matchId, phase: matchId ? 'live' : 'idle', lastError: null, stale: false, intervalSeconds: 0 });
    this.hooks.onState(null);
    if (matchId) {
      this.provider.onSelect?.(matchId);
      void this.tick();
    }
  }

  async refreshMatches(): Promise<MatchSummary[]> {
    if (!this.canSpend()) return this.matches;
    try {
      this.count();
      this.matches = await this.provider.listLiveMatches();
      this.hooks.onMatches(this.matches);
    } catch (err) {
      this.patchStatus({ lastError: `match list: ${message(err)}` });
    }
    return this.matches;
  }

  private canSpend(): boolean {
    return !this.provider.countsTowardQuota || this.usage.calls < this.opts.dailyLimit;
  }

  private count(): void {
    if (this.provider.countsTowardQuota) this.usage.increment();
  }

  private async tick(): Promise<void> {
    const id = this.matchId;
    if (!id) return;
    if (!this.canSpend()) {
      this.patchStatus({ phase: 'error', lastError: `Daily limit of ${this.opts.dailyLimit} calls reached` });
      return;
    }
    let delay: number;
    try {
      this.count();
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
      if (next.phase === 'complete') return; // stop polling a finished match
    } catch (err) {
      if (this.matchId !== id) return;
      const rateLimited = err instanceof ProviderHttpError && err.status === 429;
      this.backoff = Math.min(this.backoff * 2, rateLimited ? 16 : 8);
      delay = Math.min(BREAK_INTERVAL_SECONDS, this.baseInterval() * this.backoff);
      this.patchStatus({ phase: 'error', lastPollAt: Date.now(), lastError: message(err), intervalSeconds: delay });
      this.checkStale();
    }
    this.timer = setTimeout(() => void this.tick(), delay * 1000);
  }

  private baseInterval(): number {
    if (this.provider.fixedIntervalSeconds) return this.provider.fixedIntervalSeconds;
    const min = Math.max(this.opts.minSeconds, this.provider.minIntervalSeconds ?? 0);
    return budgetInterval(this.last?.format ?? 'T20', this.opts.dailyLimit, min, this.opts.perMinute);
  }

  private intervalFor(state: MatchState): number {
    if (state.phase === 'break' || state.phase === 'upcoming') {
      return this.provider.fixedIntervalSeconds ? Math.max(this.provider.fixedIntervalSeconds, 2) : BREAK_INTERVAL_SECONDS;
    }
    return this.baseInterval();
  }

  /** Keep serving the last good state; flag it stale after 30 s without a fresh one. */
  private checkStale(): void {
    if (!this.last || !this.lastGoodAt) return;
    const stale = Date.now() - this.lastGoodAt > STALE_AFTER_MS && this.status.phase !== 'stopped' && this.status.phase !== 'break';
    if (stale !== this.last.isStale) {
      this.last = { ...this.last, isStale: stale };
      this.hooks.onState(this.last);
      this.patchStatus({ stale });
    }
  }

  private patchStatus(p: Partial<PollStatus>): void {
    this.status = { ...this.status, ...p, callsToday: this.usage.calls };
    this.hooks.onStatus(this.status);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
