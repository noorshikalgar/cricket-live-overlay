import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CardKind, Scorecard, Squads } from '@cos/shared';
import type { CricketProvider } from './providers';

/** a forced reload still waits this long (their scorecard cache is 30 s) */
const FORCE_COOLDOWN_MS = 15_000;

export interface CardHooks {
  onScorecard(s: Scorecard | null): void;
  onSquads(s: Squads | null): void;
  onError(message: string): void;
}

interface CardCacheFile {
  scorecard: Scorecard | null;
  squads: Squads | null;
}

/**
 * Detail data for the on-air cards. Responses are cached per match on disk, so
 * restarts cost nothing. Nothing refreshes on its own: data is fetched once when a
 * card first needs it, then only when the commentator presses ⟳ (reload).
 */
export class CardService {
  private matchId: string | null = null;
  private scorecard: Scorecard | null = null;
  private squads: Squads | null = null;
  private readonly inFlight = new Set<CardKind>();

  constructor(
    private readonly provider: CricketProvider,
    private readonly dir: string,
    private readonly hooks: CardHooks,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  get current(): { scorecard: Scorecard | null; squads: Squads | null } {
    return { scorecard: this.scorecard, squads: this.squads };
  }

  private file(id: string): string {
    return path.join(this.dir, `${id.replace(/[^\w-]/g, '_')}.json`);
  }

  /** Switch match: load whatever was cached for it before. */
  reset(matchId: string | null): void {
    if (matchId === this.matchId) return;
    this.matchId = matchId;
    this.scorecard = null;
    this.squads = null;
    if (matchId && existsSync(this.file(matchId))) {
      try {
        const c = JSON.parse(readFileSync(this.file(matchId), 'utf8')) as Partial<CardCacheFile>;
        this.scorecard = c.scorecard ?? null;
        this.squads = c.squads ?? null;
      } catch {
        // unreadable cache: start empty
      }
    }
    this.hooks.onScorecard(this.scorecard);
    this.hooks.onSquads(this.squads);
  }

  supports(kind: CardKind): boolean {
    return kind === 'scorecard' ? !!this.provider.getScorecard : !!this.provider.getSquads;
  }

  /**
   * `force` = the ⟳ button: fetch fresh data (1 call). Without it, cached data is
   * served and a call is only made when there is nothing cached yet.
   */
  async fetch(kind: CardKind, force = false): Promise<void> {
    const id = this.matchId;
    if (!id || !this.supports(kind) || this.inFlight.has(kind)) return;
    const cached = kind === 'scorecard' ? this.scorecard : this.squads;
    if (cached && (!force || Date.now() - cached.updatedAt < FORCE_COOLDOWN_MS)) {
      this.emit(kind);
      return;
    }
    this.inFlight.add(kind);
    try {
      if (kind === 'scorecard' && this.provider.getScorecard) {
        const value = await this.provider.getScorecard(id);
        if (this.matchId === id) this.scorecard = { ...value, updatedAt: Date.now() };
      } else if (kind === 'squads' && this.provider.getSquads) {
        const value = await this.provider.getSquads(id);
        if (this.matchId === id) this.squads = { ...value, updatedAt: Date.now() };
      }
      if (this.matchId === id) {
        this.save(id);
        this.emit(kind);
      }
    } catch (err) {
      this.hooks.onError(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.inFlight.delete(kind);
    }
  }

  /** A card is on air: make sure it has data, without ever refreshing what is cached. */
  ensure(needs: { scorecard: boolean; squads: boolean }): void {
    if (needs.scorecard && !this.scorecard) void this.fetch('scorecard');
    if (needs.squads && !this.squads) void this.fetch('squads');
  }

  private save(id: string): void {
    const data: CardCacheFile = { scorecard: this.scorecard, squads: this.squads };
    writeFileSync(this.file(id), JSON.stringify(data));
  }

  private emit(kind: CardKind): void {
    if (kind === 'scorecard') this.hooks.onScorecard(this.scorecard);
    else this.hooks.onSquads(this.squads);
  }
}
