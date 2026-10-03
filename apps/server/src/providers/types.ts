import type { MatchState, MatchSummary } from '@cos/shared';

export interface CricketProvider {
  readonly name: string;
  /** false for providers that cost nothing per call (mock) */
  readonly countsTowardQuota: boolean;
  /** when set, the poller uses this instead of the budget formula */
  readonly fixedIntervalSeconds?: number;
  /** never poll faster than this, e.g. when the provider caches responses server-side */
  readonly minIntervalSeconds?: number;
  listLiveMatches(): Promise<MatchSummary[]>;
  getMatchState(id: string): Promise<MatchState>;
  /** optional hook: a match was (re)selected, e.g. so the mock can restart its replay */
  onSelect?(id: string): void;
}

/** Thrown for HTTP failures so the poller can treat 429 specially. */
export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}
