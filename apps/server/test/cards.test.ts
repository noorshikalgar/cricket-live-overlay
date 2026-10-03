import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
  function make(dir = mkdtempSync(path.join(tmpdir(), 'cos-cards-'))) {
    const getScorecard = vi.fn(async (id: string) => ({ matchId: id, innings: [], updatedAt: 0 }));
    const provider = {
      name: 'x',
      countsTowardQuota: true,
      listLiveMatches: async () => [],
      getMatchState: async () => {
        throw new Error();
      },
      getScorecard,
    } as unknown as CricketProvider;
    const seen: unknown[] = [];
    const svc = new CardService(provider, dir, { onScorecard: (s) => seen.push(s), onSquads: () => undefined, onError: () => undefined });
    return { svc, getScorecard, dir, seen };
  }

  it('fetches once, then serves the cache; never refreshes by itself', async () => {
    vi.useFakeTimers();
    const { svc, getScorecard } = make();
    svc.reset('m1');
    await svc.fetch('scorecard');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await svc.fetch('scorecard');
    svc.ensure({ scorecard: true, squads: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(getScorecard).toHaveBeenCalledTimes(1);
  });

  it('reload (force) fetches again, with a short cooldown', async () => {
    vi.useFakeTimers();
    const { svc, getScorecard } = make();
    svc.reset('m1');
    await svc.fetch('scorecard');
    await svc.fetch('scorecard', true); // within cooldown: served from cache
    expect(getScorecard).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(16_000);
    await svc.fetch('scorecard', true);
    expect(getScorecard).toHaveBeenCalledTimes(2);
  });

  it('keeps the cache across restarts', async () => {
    const first = make();
    first.svc.reset('m1');
    await first.svc.fetch('scorecard');
    const second = make(first.dir);
    second.svc.reset('m1');
    expect(second.svc.current.scorecard?.matchId).toBe('m1');
    await second.svc.fetch('scorecard');
    expect(second.getScorecard).not.toHaveBeenCalled();
  });
});
