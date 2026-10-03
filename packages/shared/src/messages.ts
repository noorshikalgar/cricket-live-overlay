import type { MatchEvent, MatchEventType, MatchState, MatchSummary, PollStatus } from './match';
import type { AppSettings, Scene, SceneSummary } from './scene';
import type { CardKind, Scorecard, Squads } from './cards';

export type ClientRole = 'studio' | 'output';

export interface ObsStatus {
  enabled: boolean;
  connected: boolean;
  error: string | null;
}

/** Messages the server pushes to every client. */
export type ServerMessage =
  | {
      type: 'hello';
      clientId: string;
      scenes: Scene[];
      settings: AppSettings;
      match: MatchState | null;
      poll: PollStatus;
    }
  | { type: 'match:state'; state: MatchState | null }
  | { type: 'match:event'; event: MatchEvent }
  | { type: 'matches:list'; matches: MatchSummary[] }
  | { type: 'scene:update'; scene: Scene; origin: string | null }
  | { type: 'scene:deleted'; sceneId: string }
  | { type: 'scene:list'; scenes: SceneSummary[] }
  | { type: 'scene:switch'; sceneId: string }
  | { type: 'poll:status'; status: PollStatus }
  | { type: 'settings'; settings: AppSettings }
  | { type: 'clients'; outputs: number; studios: number }
  | { type: 'obs:status'; status: ObsStatus }
  | { type: 'pointer'; x: number; y: number; visible: boolean; click: boolean }
  | { type: 'cards:scorecard'; scorecard: Scorecard | null }
  | { type: 'cards:squads'; squads: Squads | null }
  | { type: 'error'; message: string };

/** Messages clients send up. Outputs only ever send `hello`. */
export type ClientMessage =
  | { type: 'hello'; role: ClientRole }
  | { type: 'scene:update'; scene: Scene }
  | { type: 'scene:create'; name: string; copyFrom?: string }
  | { type: 'scene:delete'; sceneId: string }
  | { type: 'scene:switch'; sceneId: string }
  | { type: 'event:manual'; eventType: MatchEventType }
  | { type: 'match:select'; matchId: string | null }
  | { type: 'matches:refresh' }
  /** poll the selected match right now (manual mode or an impatient commentator) */
  | { type: 'poll:now' }
  /** live pointer position in canvas px (relayed, never stored) */
  | { type: 'pointer'; x: number; y: number; visible: boolean; click?: boolean }
  /** fetch detail data for cards (budget-guarded and cached on the server) */
  | { type: 'cards:fetch'; kind: CardKind; force?: boolean }
  | { type: 'settings:update'; settings: Partial<AppSettings> };

export function isClientMessage(v: unknown): v is ClientMessage {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string';
}
