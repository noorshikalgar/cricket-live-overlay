import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectEvents } from '../src/events';
import { CricketLiveApiProvider, ballKind, mapCommentary, parseScoreLine, shortCode } from '../src/providers/cricketliveapi';
import { CallBudget } from '../src/usage';
import LIVE_REAL from './fixtures/live-real.json';

// Sample response from the CricketLiveApi docs for GET /cricket/matches/live
const LIVE_SAMPLE = {
  success: true,
  type: 'live',
  count: 3,
  data: [
    {
      match_id: 155409,
      series_name: 'Indian Premier League 2026',
      match_desc: 'Final',
      format: 'T20',
      state: 'In Progress',
      team_a: 'Mumbai Indians',
      team_b: 'Chennai Super Kings',
      score: 'MI 187/4 (18.2 ov)',
      live_inning: 'MI Batting',
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('CricketLiveApiProvider', () => {
  it('maps the documented live list and sends a Bearer token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(LIVE_SAMPLE), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const p = new CricketLiveApiProvider('secret');
    const [m] = await p.listLiveMatches();
    expect(m).toEqual({
      id: '155409',
      title: 'MI v CSK · Final',
      teams: ['MI', 'CSK'],
      format: 'T20',
      phase: 'live',
      statusText: 'MI Batting',
      scoreLine: 'MI 187/4 (18.2 ov)',
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cricketliveapi.com/api/v1/cricket/matches/live');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer secret');
  });

  it('derives short codes', () => {
    expect(shortCode('Mumbai Indians')).toBe('MI');
    expect(shortCode('Chennai Super Kings')).toBe('CSK');
    expect(shortCode('India')).toBe('IND');
  });
});

// Doc samples for scorecard and commentary
const SCORECARD = {
  success: true,
  data: {
    match_id: 155409,
    innings: [
      {
        team: 'Mumbai Indians',
        runs: 187,
        wickets: 4,
        overs: '18.2',
        batters: [
          { name: 'Rohit Sharma', runs: 67, balls: 42, fours: 6, sixes: 3, sr: 159.5 },
          { name: 'Tilak Varma', runs: 30, balls: 20, fours: 2, sixes: 1, sr: 150 },
        ],
        bowlers: [{ name: 'Jadeja', overs: '4.0', wickets: 1, runs: 32, econ: 8.0 }],
      },
    ],
  },
};
const commentary = (balls: { over: string; runs: number; type: string; batsman?: string }[]) => ({
  success: true,
  data: balls.map((b) => ({ ball: b.over.split('.')[1], text: '', bowler: 'Jadeja', batsman: b.batsman ?? 'Rohit Sharma', ...b })),
});

function routed(responses: Record<string, () => unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(responses[key]()), { status: 200 });
  });
}

describe('CricketLiveApi parsing', () => {
  it('parses score lines', () => {
    expect(parseScoreLine('MI 187/4 (18.2 ov)')).toEqual({ code: 'MI', runs: 187, wickets: 4, balls: 110 });
    expect(parseScoreLine('PBKS 162/8 (20 ov) & RCB 163/4 (18.3 ov)')?.code).toBe('RCB');
  });

  it('classifies balls', () => {
    expect(ballKind('SIX', 6, '')).toBe('six');
    expect(ballKind('FOUR', 4, '')).toBe('four');
    expect(ballKind('WICKET', 0, '')).toBe('wicket');
    expect(ballKind('', 1, 'Wide down leg')).toBe('wide');
    expect(ballKind('', 0, 'no run')).toBe('dot');
  });

  it('orders the feed newest first', () => {
    const feed = mapCommentary(commentary([{ over: '18.1', runs: 1, type: 'RUN' }, { over: '18.2', runs: 6, type: 'SIX' }]));
    expect(feed.map((b) => b.over)).toEqual(['18.2', '18.1']);
  });
});

describe('CricketLiveApiProvider.getMatchState', () => {
  it('combines feed, live list and scorecard within budget', async () => {
    vi.useFakeTimers();
    let balls = [{ over: '18.1', runs: 1, type: 'RUN' }];
    vi.stubGlobal(
      'fetch',
      routed({
        '/cricket/matches/live': () => LIVE_SAMPLE,
        '/cricket/scorecard/': () => SCORECARD,
        '/cricket/match-facts/': () => ({ success: true, data: { toss: 'MI won the toss', venue: 'Wankhede' } }),
        '/cricket/commentary/': () => commentary(balls),
      }),
    );
    const budget = new CallBudget(path.join(mkdtempSync(path.join(tmpdir(), 'cos-')), 'u.json'), 100, 5);
    const p = new CricketLiveApiProvider('secret');
    p.attachBudget(budget);
    const first = await p.getMatchState('155409');
    expect(budget.calls).toBe(4);
    expect(first.innings.at(-1)).toMatchObject({ battingTeam: 'MI', runs: 187, wickets: 4, overs: '18.2' });
    expect(first.batters[0]).toMatchObject({ name: 'Rohit Sharma', onStrike: true });
    expect(first.bowler?.name).toBe('Jadeja');
    expect(first.toss).toBe('MI won the toss');
    expect(first.phase).toBe('live');

    // asking again inside the API's 10 s commentary cache costs nothing
    await p.getMatchState('155409');
    expect(budget.calls).toBe(4);

    // next ball is a six: only the feed is due, and it fires a SIX banner
    vi.advanceTimersByTime(11_000);
    balls = [...balls, { over: '18.2', runs: 6, type: 'SIX' }];
    const second = await p.getMatchState('155409');
    expect(budget.calls).toBe(5);
    expect(second.thisOver.map((c) => c.label)).toEqual(['1', '6']);
    const events = detectEvents(first, second, new Set());
    expect(events.map((e) => e.type)).toEqual(['SIX']);

    // budget for this minute is spent: nothing is sent
    vi.advanceTimersByTime(11_000);
    await expect(p.getMatchState('155409')).rejects.toThrow(/Per-minute/);
    expect(budget.calls).toBe(5);
    vi.useRealTimers();
  });
});

describe('CricketLiveApi real live response (2026-10-03)', () => {
  it('maps nested first_team / second_team items', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(LIVE_REAL), { status: 200 })));
    const [legends, women] = await new CricketLiveApiProvider('secret').listLiveMatches();
    expect(legends).toEqual({
      id: '174313',
      title: 'INDCH v AUSCH · 1st Match',
      teams: ['INDCH', 'AUSCH'],
      format: 'T20',
      phase: 'live',
      statusText: 'Australia Champions opt to bowl',
      scoreLine: 'INDCH 192/7 (19.5)',
    });
    // "19.6" is their notation for 20 completed overs; "21/" means no wickets
    expect(women.scoreLine).toBe('WIW 21/0 (2.3)');
  });

  it('builds both innings and the chase from the live item', async () => {
    vi.stubGlobal(
      'fetch',
      routed({
        '/cricket/matches/live': () => LIVE_REAL,
        '/cricket/commentary/': () => commentary([{ over: '2.3', runs: 4, type: 'FOUR', batsman: 'Hayley Matthews' }]),
        '/cricket/scorecard/': () => ({ success: true, data: { innings: [] } }),
        '/cricket/match-facts/': () => ({ success: true, data: {} }),
      }),
    );
    const s = await new CricketLiveApiProvider('secret').getMatchState('173107');
    expect(s.teams.map((t) => [t.shortCode, t.name])).toEqual([
      ['ZIMW', 'Zimbabwe Women'],
      ['WIW', 'West Indies Women'],
    ]);
    expect(s.innings).toEqual([
      { battingTeam: 'ZIMW', runs: 97, wickets: 9, overs: '20.0', balls: 120, runRate: 4.85 },
      { battingTeam: 'WIW', runs: 21, wickets: 0, overs: '2.3', balls: 15, runRate: 8.4 },
    ]);
    expect(s.target).toBe(98);
    expect(s.ballsRemaining).toBe(105);
    expect(s.statusText).toBe('West Indies Women need 77 runs from 105 balls');
    expect(s.venue).toBe('Takashinga Sports Club, Harare');
  });
});

import COMMENTARY_REAL from './fixtures/commentary-real.json';
import { composeFromMiniscore, parseBallText, resultKind, thisOverChips, tokenChip } from '../src/providers/cricketliveapi-miniscore';

describe('CricketLiveApi real commentary response (miniscore shape)', () => {
  const s = composeFromMiniscore('173107', COMMENTARY_REAL, { teamColor: () => '#123456', venue: 'Takashinga Sports Club, Harare' }, 0);

  it('reads batters, bowler, partnership and innings from miniscore', () => {
    expect(s.teams.map((t) => t.shortCode)).toEqual(['ZIMW', 'WIW']);
    expect(s.innings.map((i) => `${i.battingTeam} ${i.runs}/${i.wickets} (${i.overs})`)).toEqual([
      'ZIMW 97/9 (20.0)',
      'WIW 37/0 (3.5)',
    ]);
    expect(s.batters[0]).toMatchObject({ name: 'Eboni Brathwaite', runs: 22, balls: 12, fours: 2, sixes: 2, onStrike: true });
    expect(s.batters[1]).toMatchObject({ name: 'Jahzara Claxton', runs: 8, onStrike: false });
    expect(s.bowler).toMatchObject({ name: 'Nyasha Gwanzura', overs: '1.5', runs: 10, wickets: 0 });
    expect(s.partnership).toMatchObject({ runs: 37, balls: 23 });
    expect(s.target).toBe(98);
    expect(s.statusText).toBe('West Indies Women need 61 runs from 97 balls');
    expect(s.toss).toBe('West Indies Women won the toss and chose to bowl');
    expect(s.venue).toBe('Takashinga Sports Club, Harare');
  });

  it('builds this over and recent overs', () => {
    expect(s.thisOver.map((c) => c.label)).toEqual(['•', '4', '•', '1', '•']);
    expect(s.recentOvers).toEqual([14, 6, 12]);
  });

  it('turns entries into a ball feed with boundaries', () => {
    const feed = s.ballFeed ?? [];
    expect(feed[0]).toMatchObject({ over: '3.5', kind: 'dot', batter: 'Eboni Brathwaite', bowler: 'Nyasha Gwanzura' });
    expect(feed.filter((b) => b.kind === 'four').length).toBe(3);
    expect(feed.filter((b) => b.kind === 'six').length).toBe(1);
    // "X comes into the attack" notes are not balls
    expect(feed.some((b) => /comes into the attack/.test(b.text))).toBe(false);
  });

  it('parses result text and over tokens', () => {
    expect(parseBallText('Nyasha Gwanzura to Eboni Brathwaite, <b>FOUR</b>')).toEqual({
      bowler: 'Nyasha Gwanzura',
      batter: 'Eboni Brathwaite',
      result: 'FOUR',
    });
    expect(resultKind('leg byes, 1 run')).toEqual({ kind: 'bye', runs: 1 });
    expect(resultKind('2 runs')).toEqual({ kind: 'run', runs: 2 });
    expect(resultKind('out Caught by Smith!!')).toMatchObject({ kind: 'wicket' });
    expect(resultKind('wide')).toEqual({ kind: 'wide', runs: 1 });
    expect(thisOverChips('Wd5 Wd 0 6 1 1 0 0').map((c) => c.label)).toEqual(['5wd', 'wd', '•', '6', '1', '1', '•', '•']);
    expect(tokenChip('L1')).toMatchObject({ kind: 'bye', label: '1lb' });
    expect(tokenChip('W')).toMatchObject({ kind: 'wicket' });
  });

  it('fires a SIX from a new feed entry', () => {
    const next = structuredClone(COMMENTARY_REAL) as typeof COMMENTARY_REAL;
    next.data.commentary.unshift({
      timestamp: 1791032399999,
      text: 'Nyasha Gwanzura to Eboni Brathwaite, <b>SIX</b>',
      ball_metric: 3.6,
      innings_id: 2,
      over_separator: null,
    });
    const s2 = composeFromMiniscore('173107', next, { teamColor: () => '#123456' }, 1);
    expect(detectEvents(s, s2, new Set()).map((e) => e.type)).toEqual(['SIX']);
  });
});
