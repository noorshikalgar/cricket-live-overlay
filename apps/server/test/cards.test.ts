import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardService } from '../src/cards';
import { mapScorecardReal, mapSquadsReal } from '../src/providers/cricketliveapi-cards';
import { generateRecording } from '../src/providers/mock-generator';
import { buildScorecard, buildSquads } from '../src/providers/recording';
import type { CricketProvider } from '../src/providers/types';
import SCORECARD_REAL from './fixtures/scorecard-real.json';
import SQUADS_REAL from './fixtures/squads-real.json';

afterEach(() => vi.useRealTimers());

describe('real scorecard / squads mapping', () => {
  const sc = mapScorecardReal(SCORECARD_REAL, '174923', 0);
  const inn = sc.innings[0];

  it('maps the innings total and batting card', () => {
    expect(inn).toMatchObject({ team: 'CSA Inv XI', runs: 180, wickets: 5, overs: '62.4' });
    expect(inn.batters[0]).toMatchObject({
      name: 'Lesego Senokwane',
      dismissal: 'c Marnus Labuschagne b Josh Hazlewood',
      status: 'out',
      runs: 7,
      balls: 32,
      captain: true,
    });
    expect(inn.batters.filter((b) => b.status === 'batting').map((b) => b.name)).toEqual(['Neil Brand', 'Jean du Plessis']);
    expect(inn.yetToBat.length).toBeGreaterThan(0);
  });

  it('maps bowling, extras, fall of wickets and partnerships', () => {
    expect(inn.bowlers[0]).toMatchObject({ name: 'Mitchell Starc', overs: '7.4', maidens: 3, runs: 12, wickets: 0 });
    expect(inn.extras).toMatchObject({ total: 4, byes: 2, legByes: 2 });
    expect(inn.fallOfWickets[0]).toEqual({ wicket: 1, runs: 21, over: '9.4', player: 'Lesego Senokwane' });
    expect(inn.partnerships[0]).toMatchObject({ bat1: 'Lesego Senokwane', runs: 21, balls: 58 });
  });

  it('maps squads with roles, captain and keeper', () => {
    const sq = mapSquadsReal(SQUADS_REAL, '174923', 0);
    expect(sq.teams.map((t) => t.code)).toEqual(['CSA Inv XI', 'AUS']);
    expect(sq.teams[0].playingXI[0]).toMatchObject({ name: 'Lesego Senokwane', role: 'Batting Allrounder', captain: true, battingStyle: 'Right-hand bat' });
  });
});

describe('mock scorecard', () => {
  const rec = generateRecording();
  it('adds up and lists who is yet to bat', () => {
    const sc = buildScorecard(rec, rec.deliveries.length, 0);
    for (const [i, inn] of sc.innings.entries()) {
      const ds = rec.deliveries.filter((d) => d.inn === i);
      expect(inn.runs).toBe(ds.reduce((a, d) => a + d.runs + d.extras, 0));
      const batRuns = inn.batters.reduce((a, b) => a + b.runs, 0);
      expect(batRuns + inn.extras.total).toBe(inn.runs);
      expect(inn.batters.length + inn.yetToBat.length).toBe(11);
      expect(inn.fallOfWickets.length).toBe(inn.wickets);
    }
  });
  it('builds both squads', () => {
    expect(buildSquads(rec, 0).teams.map((t) => t.playingXI.length)).toEqual([11, 11]);
  });
});

describe('CardService', () => {
  it('caches, refreshes only when stale, and resets per match', async () => {
    vi.useFakeTimers();
    const getScorecard = vi.fn(async (id: string) => ({ matchId: id, innings: [], updatedAt: Date.now() }));
    const provider = { name: 'x', countsTowardQuota: true, listLiveMatches: async () => [], getMatchState: async () => { throw new Error(); }, getScorecard } as unknown as CricketProvider;
    const seen: unknown[] = [];
    const svc = new CardService(provider, { onScorecard: (s) => seen.push(s), onSquads: () => undefined, onError: () => undefined });
    svc.reset('m1');
    await svc.fetch('scorecard');
    await svc.fetch('scorecard');
    expect(getScorecard).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(61_000);
    svc.onPoll({ scorecard: true, squads: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(getScorecard).toHaveBeenCalledTimes(2);
    svc.onPoll({ scorecard: false, squads: false });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(getScorecard).toHaveBeenCalledTimes(2);
  });
});
