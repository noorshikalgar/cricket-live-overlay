import type { CardKind, Scorecard, Squads } from '@cos/shared';
import type { CricketProvider } from './providers';

/** How long each kind stays fresh. Squads barely change; the scorecard follows the game. */
const TTL_MS: Record<CardKind, number> = { scorecard: 60_000, squads: 30 * 60_000 };
/** a forced refresh still waits this long (their scorecard cache is 30 s) */
const FORCE_COOLDOWN_MS = 15_000;

export interface CardHooks {
  onScorecard(s: Scorecard | null): void;
  onSquads(s: Squads | null): void;
  onError(message: string): void;
}

/**
 * Detail data for the on-air cards, fetched on demand and cached. The scorecard
 * only refreshes while a card is visible on air, so idle cards cost no calls.
 */
export class CardService {
  private matchId: string | null = null;
  private scorecard: { at: number; value: Scorecard } | null = null;
  private squads: { at: number; value: Squads } | null = null;
  private readonly inFlight = new Set<CardKind>();

  constructor(
    private readonly provider: CricketProvider,
    private readonly hooks: CardHooks,
  ) {}

  get current(): { scorecard: Scorecard | null; squads: Squads | null } {
    return { scorecard: this.scorecard?.value ?? null, squads: this.squads?.value ?? null };
  }

  /** New match selected: drop everything cached for the old one. */
  reset(matchId: string | null): void {
    if (matchId === this.matchId) return;
    this.matchId = matchId;
    this.scorecard = null;
    this.squads = null;
    this.hooks.onScorecard(null);
    this.hooks.onSquads(null);
  }

  supports(kind: CardKind): boolean {
    return kind === 'scorecard' ? !!this.provider.getScorecard : !!this.provider.getSquads;
  }

  async fetch(kind: CardKind, force = false): Promise<void> {
    const id = this.matchId;
    if (!id || !this.supports(kind) || this.inFlight.has(kind)) return;
    const cached = kind === 'scorecard' ? this.scorecard : this.squads;
    const age = cached ? Date.now() - cached.at : Infinity;
    if (cached && (age < (force ? FORCE_COOLDOWN_MS : TTL_MS[kind]))) {
      this.emit(kind);
      return;
    }
    this.inFlight.add(kind);
    try {
      if (kind === 'scorecard' && this.provider.getScorecard) {
        const value = await this.provider.getScorecard(id);
        if (this.matchId === id) this.scorecard = { at: Date.now(), value };
      } else if (kind === 'squads' && this.provider.getSquads) {
        const value = await this.provider.getSquads(id);
        if (this.matchId === id) this.squads = { at: Date.now(), value };
      }
      if (this.matchId === id) this.emit(kind);
    } catch (err) {
      this.hooks.onError(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.inFlight.delete(kind);
    }
  }

  /** Called after each score poll: keep on-air cards current without extra polling loops. */
  onPoll(cardsOnAir: { scorecard: boolean; squads: boolean }): void {
    if (cardsOnAir.squads && !this.squads) void this.fetch('squads');
    if (cardsOnAir.scorecard) void this.fetch('scorecard');
  }

  private emit(kind: CardKind): void {
    if (kind === 'scorecard') this.hooks.onScorecard(this.scorecard?.value ?? null);
    else this.hooks.onSquads(this.squads?.value ?? null);
  }
}
