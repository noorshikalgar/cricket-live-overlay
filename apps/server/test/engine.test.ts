import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@cos/shared';
import { detectEvents, manualEvent } from '../src/events';
import { budgetInterval } from '../src/poller';
import { generateRecording } from '../src/providers/mock-generator';
import { buildState, isLegal } from '../src/providers/recording';

const rec = generateRecording();

describe('budgetInterval', () => {
  it('spreads 5000 calls over a T20 at ~3.2 s', () => {
    expect(budgetInterval('T20', 5000, 2)).toBeCloseTo(3.2, 1);
  });
  it('gives ~6.8 s for an ODI', () => {
    expect(budgetInterval('ODI', 5000, 2)).toBeCloseTo(6.8, 1);
  });
  it('never goes below the minimum', () => {
    expect(budgetInterval('T20', 1_000_000, 3)).toBe(3);
  });
});

describe('buildState', () => {
  it('starts upcoming and ends complete', () => {
    expect(buildState(rec, 0, 0).phase).toBe('upcoming');
    expect(buildState(rec, rec.deliveries.length, 0).phase).toBe('complete');
  });

  it('pauses in break between innings with a target', () => {
    const first = rec.deliveries.filter((d) => d.inn === 0).length;
    const s = buildState(rec, first, 0);
    expect(s.phase).toBe('break');
    expect(s.target).toBe(s.innings[0].runs + 1);
  });

  it('innings totals equal the sum of deliveries', () => {
    const s = buildState(rec, rec.deliveries.length, 0);
    for (const [i, inn] of s.innings.entries()) {
      const ds = rec.deliveries.filter((d) => d.inn === i);
      expect(inn.runs).toBe(ds.reduce((a, d) => a + d.runs + d.extras, 0));
      expect(inn.balls).toBe(ds.filter(isLegal).length);
    }
  });

  it('this over never holds more than 6 legal balls', () => {
    for (let n = 1; n <= rec.deliveries.length; n++) {
      const legal = buildState(rec, n, 0).thisOver.filter((c) => c.kind !== 'wide' && c.kind !== 'noball');
      expect(legal.length).toBeLessThanOrEqual(6);
    }
  });

  it('always shows one batter on strike while live', () => {
    for (let n = 1; n < rec.deliveries.length; n++) {
      const s = buildState(rec, n, 0);
      if (s.phase !== 'live') continue;
      expect(s.batters.filter((b) => b.onStrike).length).toBe(1);
    }
  });
});

describe('detectEvents', () => {
  function replayEvents(step = 1): MatchEvent[] {
    const fired = new Set<string>();
    const out: MatchEvent[] = [];
    let prev = buildState(rec, 0, 0);
    for (let n = step; n <= rec.deliveries.length + step; n += step) {
      const next = buildState(rec, Math.min(n, rec.deliveries.length), 0);
      out.push(...detectEvents(prev, next, fired, 0));
      prev = next;
    }
    return out;
  }

  it('fires one FOUR per four and one SIX per six off the bat', () => {
    const ev = replayEvents();
    expect(ev.filter((e) => e.type === 'FOUR').length).toBe(rec.deliveries.filter((d) => d.runs === 4).length);
    expect(ev.filter((e) => e.type === 'SIX').length).toBe(rec.deliveries.filter((d) => d.runs === 6).length);
  });

  it('fires one WICKET per wicket', () => {
    const ev = replayEvents();
    expect(ev.filter((e) => e.type === 'WICKET').length).toBe(rec.deliveries.filter((d) => d.wicket).length);
  });

  it('catches every boundary even when polls skip balls', () => {
    const ev = replayEvents(3);
    expect(ev.filter((e) => e.type === 'SIX').length).toBe(rec.deliveries.filter((d) => d.runs === 6).length);
  });

  it('fires innings end twice and the result once', () => {
    const ev = replayEvents();
    expect(ev.filter((e) => e.type === 'INNINGS_END').length).toBe(2);
    expect(ev.filter((e) => e.type === 'MATCH_RESULT').length).toBe(1);
  });

  it('fires fifties', () => {
    expect(replayEvents().filter((e) => e.type === 'FIFTY').length).toBeGreaterThan(0);
  });

  it('never repeats an event for the same state', () => {
    const fired = new Set<string>();
    const a = buildState(rec, 30, 0);
    const b = buildState(rec, 60, 0);
    const first = detectEvents(a, b, fired, 0);
    expect(first.length).toBeGreaterThan(0);
    expect(detectEvents(a, b, fired, 0)).toEqual([]);
  });

  it('builds manual events with the striker', () => {
    const s = buildState(rec, 40, 0);
    const e = manualEvent('SIX', s, 1);
    expect(e.manual).toBe(true);
    expect(e.subtitle).toContain(s.batters.find((b) => b.onStrike)?.name ?? '');
  });
});
