import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { overRunsSeen, parseLastWicket } from '../src/providers/cricketliveapi-miniscore';
import { generateRecording } from '../src/providers/mock-generator';
import { buildState } from '../src/providers/recording';

describe('parseLastWicket', () => {
  it('splits a miniscore last-wicket line', () => {
    expect(parseLastWicket('Abhishek Sharma c Head b Starc 2(2) - 15/1 in 0.4 ov.')).toEqual({
      batter: 'Abhishek Sharma',
      how: 'c Head b Starc',
      runs: 2,
      balls: 2,
      score: '15/1',
      over: '0.4',
    });
  });
  it('handles lbw and run out', () => {
    expect(parseLastWicket('Rohit Sharma lbw b Lyon 31(24) - 58/2')?.how).toBe('lbw b Lyon');
    expect(parseLastWicket('Virat Kohli run out (Smith) 12(9) - 80/3 in 9.1 ov')).toMatchObject({ batter: 'Virat Kohli', how: 'run out (Smith)', score: '80/3' });
  });
  it('keeps unknown formats whole and ignores empty text', () => {
    expect(parseLastWicket('')).toBeNull();
    expect(parseLastWicket('something else')).toMatchObject({ batter: '', how: 'something else' });
  });
});

describe('mock last wicket and yet to bat', () => {
  const rec = generateRecording();
  it('reports the latest dismissal of the current innings', () => {
    const i = rec.deliveries.findIndex((d) => d.wicket);
    const s = buildState(rec, i + 1, 0);
    expect(s.lastWicket?.batter).toBe(rec.deliveries[i].wicket?.player);
    expect(s.lastWicket?.score).toMatch(/^\d+\/1$/);
    expect(s.lastWicket?.how).not.toBe('');
  });
  it('lists who is still to bat, without the current pair', () => {
    const s = buildState(rec, 20, 0);
    expect(s.yetToBat?.length).toBeGreaterThan(0);
    for (const b of s.batters) expect(s.yetToBat).not.toContain(b.name);
  });
});

describe('overRunsSeen', () => {
  it('reads over totals oldest first from the short feed', () => {
    const raw = JSON.parse(readFileSync(new URL('./fixtures/commentary-real.json', import.meta.url), 'utf8'));
    expect([...overRunsSeen(raw).entries()]).toEqual([
      [1, 14],
      [2, 6],
      [3, 12],
    ]);
  });
});

describe('keepKnown', () => {
  const rec = generateRecording();
  it('keeps the last wicket when a later poll no longer reports it', async () => {
    const { keepKnown } = await import('../src/poller');
    const i = rec.deliveries.findIndex((d) => d.wicket);
    const prev = buildState(rec, i + 1, 0);
    const next = { ...buildState(rec, i + 3, 0), lastWicket: null };
    expect(keepKnown(next, prev).lastWicket).toEqual(prev.lastWicket);
  });
});
