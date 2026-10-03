import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { MatchState, MatchSummary, Scorecard, Squads } from '@cos/shared';
import { generateRecording } from './mock-generator';
import { buildScorecard, buildSquads, buildState, toSummary, type Recording } from './recording';
import type { CricketProvider } from './types';

interface Replay {
  id: string;
  title: string;
  ballSeconds: number;
  startedAt: number;
}

/** Seconds the replay pauses between innings, so break back-off and banners can be tested. */
const INNINGS_BREAK_SECONDS = 20;

/**
 * Replays a recorded match ball by ball. The clock starts when the match is
 * selected, so every selection restarts the replay from the toss.
 */
export class MockProvider implements CricketProvider {
  readonly name = 'mock';
  readonly countsTowardQuota = false;
  readonly fixedIntervalSeconds = 1;
  private readonly rec: Recording;
  private readonly replays: Replay[];

  constructor(recordingsDir: string, ballSeconds: number) {
    this.rec = loadOrCreate(recordingsDir);
    const now = Date.now();
    this.replays = [
      { id: 'mock-t20', title: `${this.title()} (replay)`, ballSeconds, startedAt: now },
      { id: 'mock-t20-fast', title: `${this.title()} (fast replay)`, ballSeconds: 1, startedAt: now },
      // a replay already deep into the chase, handy for designing chase graphics
      { id: 'mock-t20-chase', title: `${this.title()} (chase)`, ballSeconds, startedAt: now - this.chaseOffsetMs(ballSeconds) },
    ];
  }

  private title(): string {
    const [a, b] = this.rec.meta.teams;
    return `${a.shortCode} v ${b.shortCode}`;
  }

  private chaseOffsetMs(ballSeconds: number): number {
    const firstInnings = this.rec.deliveries.filter((d) => d.inn === 0).length;
    return ((firstInnings + 60) * ballSeconds + INNINGS_BREAK_SECONDS) * 1000;
  }

  onSelect(id: string): void {
    const r = this.replays.find((x) => x.id === id);
    if (r && r.id !== 'mock-t20-chase') r.startedAt = Date.now();
  }

  async listLiveMatches(): Promise<MatchSummary[]> {
    const now = Date.now();
    return this.replays.map((r) => toSummary(this.stateFor(r, now), r.title));
  }

  async getMatchState(id: string): Promise<MatchState> {
    const r = this.replays.find((x) => x.id === id);
    if (!r) throw new Error(`Unknown mock match ${id}`);
    return this.stateFor(r, Date.now());
  }

  async getScorecard(id: string): Promise<Scorecard> {
    const r = this.replay(id);
    return { ...buildScorecard(this.rec, this.ballsAt(r, Date.now()), Date.now()), matchId: r.id };
  }

  async getSquads(id: string): Promise<Squads> {
    return { ...buildSquads(this.rec, Date.now()), matchId: this.replay(id).id };
  }

  private replay(id: string): Replay {
    const r = this.replays.find((x) => x.id === id);
    if (!r) throw new Error(`Unknown mock match ${id}`);
    return r;
  }

  private stateFor(r: Replay, now: number): MatchState {
    const s = buildState(this.rec, this.ballsAt(r, now), now);
    return { ...s, matchId: r.id };
  }

  /** Map elapsed time to a delivery count, pausing at the innings break. */
  private ballsAt(r: Replay, now: number): number {
    const elapsed = Math.max(0, (now - r.startedAt) / 1000);
    const first = this.rec.deliveries.filter((d) => d.inn === 0).length;
    const firstEnd = first * r.ballSeconds;
    if (elapsed < firstEnd) return Math.floor(elapsed / r.ballSeconds);
    if (elapsed < firstEnd + INNINGS_BREAK_SECONDS) return first;
    const n = first + Math.floor((elapsed - firstEnd - INNINGS_BREAK_SECONDS) / r.ballSeconds);
    return Math.min(n, this.rec.deliveries.length);
  }
}

function loadOrCreate(dir: string): Recording {
  const file = path.join(dir, 'demo-t20.json');
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, 'utf8')) as Recording;
  }
  const rec = generateRecording();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(rec, null, 1));
  return rec;
}
