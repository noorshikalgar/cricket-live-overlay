import { afterEach, describe, expect, it, vi } from 'vitest';
import { CricketLiveApiProvider, shortCode } from '../src/providers/cricketliveapi';

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
      title: 'Mumbai Indians v Chennai Super Kings · Final',
      teams: ['MI', 'CSK'],
      format: 'T20',
      phase: 'live',
      statusText: 'MI Batting · Indian Premier League 2026',
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
