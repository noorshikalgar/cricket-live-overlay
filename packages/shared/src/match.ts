export type MatchFormat = 'T20' | 'ODI' | 'TEST';

/** Lifecycle as the poller sees it. `break` covers innings breaks, drinks, rain. */
export type MatchPhase = 'upcoming' | 'live' | 'break' | 'complete';

export interface Team {
  name: string;
  shortCode: string;
  primaryColor: string;
}

export interface Innings {
  /** shortCode of the batting team */
  battingTeam: string;
  runs: number;
  wickets: number;
  /** cricket notation, e.g. "12.3" */
  overs: string;
  /** legal balls bowled, the source of truth for `overs` */
  balls: number;
  runRate: number;
}

export interface Batter {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  onStrike: boolean;
}

export interface Bowler {
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

export interface Partnership {
  runs: number;
  balls: number;
  /** runs per batter, same order as `batters` */
  contributions: [number, number];
}

export type BallKind = 'dot' | 'run' | 'four' | 'six' | 'wicket' | 'wide' | 'noball' | 'bye';

export interface BallChip {
  kind: BallKind;
  /** what the chip shows: "•", "1", "4", "W", "1wd" ... */
  label: string;
  runs: number;
}

/** One delivery from a ball-by-ball feed, newest first in MatchState.ballFeed. */
export interface BallEvent {
  /** stable per delivery, used to dedupe events */
  id: string;
  /** "18.2" */
  over: string;
  kind: BallKind;
  runs: number;
  batter: string;
  bowler: string;
  text: string;
}

export interface MatchState {
  matchId: string;
  format: MatchFormat;
  phase: MatchPhase;
  teams: [Team, Team];
  innings: Innings[];
  batters: Batter[];
  bowler: Bowler | null;
  partnership: Partnership;
  thisOver: BallChip[];
  /** runs in each of the last (up to) 6 completed overs, oldest first */
  recentOvers: number[];
  target: number | null;
  requiredRunRate: number | null;
  /** balls remaining in a chase, when known */
  ballsRemaining: number | null;
  statusText: string;
  toss: string;
  venue: string;
  series: string;
  /** epoch ms of the provider data */
  lastUpdated: number;
  isStale: boolean;
  /**
   * Recent deliveries, newest first, when the provider has a ball-by-ball feed.
   * When present, FOUR / SIX / WICKET fire from it instead of from scorecard counts,
   * because the feed usually updates sooner.
   */
  ballFeed?: BallEvent[];
}

export interface MatchSummary {
  id: string;
  title: string;
  teams: [string, string];
  format: MatchFormat;
  phase: MatchPhase;
  statusText: string;
  /** one-line score for tickers, e.g. "IND 182/4 (18.2)" */
  scoreLine: string;
}

export type MatchEventType =
  | 'FOUR'
  | 'SIX'
  | 'WICKET'
  | 'FIFTY'
  | 'HUNDRED'
  | 'MAIDEN'
  | 'OVER_END'
  | 'INNINGS_END'
  | 'MATCH_RESULT'
  // manual-only moments from the event pad
  | 'DRS'
  | 'DRINKS'
  | 'INNINGS_BREAK';

export interface MatchEvent {
  /** unique per real-world moment, used to dedupe */
  id: string;
  type: MatchEventType;
  /** main banner line, e.g. "SIX" */
  title: string;
  /** secondary line, e.g. "Virat Kohli · 64 (41)" */
  subtitle: string;
  manual: boolean;
  at: number;
}

export interface PollStatus {
  provider: string;
  matchId: string | null;
  phase: 'idle' | 'live' | 'break' | 'stopped' | 'error';
  intervalSeconds: number;
  callsToday: number;
  dailyLimit: number;
  lastPollAt: number | null;
  lastError: string | null;
  stale: boolean;
}

/** Convert legal balls to "overs.balls" notation. */
export function ballsToOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function currentInnings(state: MatchState): Innings | null {
  return state.innings.at(-1) ?? null;
}

export function battingTeam(state: MatchState): Team | null {
  const inn = currentInnings(state);
  if (!inn) return null;
  return state.teams.find((t) => t.shortCode === inn.battingTeam) ?? null;
}
