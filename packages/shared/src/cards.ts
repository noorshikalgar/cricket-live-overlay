/** Detail data for the on-air cards (full scorecard, team card, player card). */

export interface CardBatter {
  id: string | null;
  name: string;
  /** "c Labuschagne b Hazlewood", "lbw b Lyon", "not out", "batting" */
  dismissal: string;
  status: 'batting' | 'out' | 'not out';
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  captain: boolean;
  keeper: boolean;
}

export interface CardBowler {
  id: string | null;
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noBalls: number;
}

export interface FallOfWicket {
  wicket: number;
  runs: number;
  over: string;
  player: string;
}

export interface CardPartnership {
  bat1: string;
  bat1Runs: number;
  bat2: string;
  bat2Runs: number;
  runs: number;
  balls: number;
}

export interface CardInnings {
  /** short code of the batting team, e.g. "AUS" */
  team: string;
  teamName: string;
  runs: number;
  wickets: number;
  overs: string;
  runRate: number;
  batters: CardBatter[];
  yetToBat: string[];
  bowlers: CardBowler[];
  extras: { total: number; byes: number; legByes: number; wides: number; noBalls: number; penalty: number };
  fallOfWickets: FallOfWicket[];
  partnerships: CardPartnership[];
}

export interface Scorecard {
  matchId: string;
  innings: CardInnings[];
  updatedAt: number;
}

export interface SquadPlayer {
  id: string;
  name: string;
  role: string;
  battingStyle: string;
  bowlingStyle: string;
  captain: boolean;
  keeper: boolean;
  /** remote photo; only shown when a card's "Show photo" is on */
  imageUrl: string | null;
}

export interface TeamSquad {
  code: string;
  name: string;
  playingXI: SquadPlayer[];
  bench: SquadPlayer[];
}

export interface Squads {
  matchId: string;
  teams: TeamSquad[];
  updatedAt: number;
}

export type CardKind = 'scorecard' | 'squads';

/** Card widget types that need detail data while on air. */
export const CARD_WIDGET_TYPES = ['scorecard', 'teamCard', 'playerCard'] as const;
