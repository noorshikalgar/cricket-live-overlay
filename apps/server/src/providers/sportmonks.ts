import { ballsToOvers, round2, type MatchState, type MatchSummary } from '@cos/shared';
import { arr, getJson, num, obj, oversToBalls, str } from './http';
import type { CricketProvider } from './types';

/**
 * Sportmonks Cricket API v2 adapter (stub).
 *
 * Based on their public docs (livescores + fixtures endpoints with includes),
 * but NOT verified against a live response yet. Player names need the
 * `batting.batsman` / `bowling.bowler` includes; ball chips need `balls`.
 * TODO(verify): run against a real key during a live match and fix field names.
 */
const BASE_URL = 'https://cricket.sportmonks.com/api/v2.0';
const INCLUDES = 'localteam,visitorteam,runs,batting.batsman,bowling.bowler,venue,league,tosswon,balls';

export class SportmonksProvider implements CricketProvider {
  readonly name = 'sportmonks';
  readonly countsTowardQuota = true;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('CRICKET_API_KEY is empty; set it in .env or use CRICKET_PROVIDER=mock');
  }

  private url(path: string): string {
    return `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}api_token=${encodeURIComponent(this.apiKey)}&include=${INCLUDES}`;
  }

  async listLiveMatches(): Promise<MatchSummary[]> {
    const raw = await getJson(this.url('/livescores'));
    return arr(obj(raw)['data']).map((f) => {
      const s = mapFixture(f);
      const inn = s.innings.at(-1);
      return {
        id: s.matchId,
        title: `${s.teams[0].shortCode} v ${s.teams[1].shortCode}`,
        teams: [s.teams[0].shortCode, s.teams[1].shortCode],
        format: s.format,
        phase: s.phase,
        statusText: s.statusText,
        scoreLine: inn ? `${inn.battingTeam} ${inn.runs}/${inn.wickets} (${inn.overs})` : '',
      };
    });
  }

  async getMatchState(id: string): Promise<MatchState> {
    const raw = await getJson(this.url(`/fixtures/${encodeURIComponent(id)}`));
    return mapFixture(obj(raw)['data']);
  }
}

function mapFixture(f: unknown): MatchState {
  const fx = obj(f);
  const lt = obj(obj(fx['localteam']));
  const vt = obj(obj(fx['visitorteam']));
  const teamById = new Map<number, string>([
    [num(lt['id']), str(lt['code'], 'HOME')],
    [num(vt['id']), str(vt['code'], 'AWAY')],
  ]);
  const innings = arr(obj(fx['runs'])['data'] ?? fx['runs']).map((r) => {
    const ro = obj(r);
    const balls = oversToBalls(ro['overs']);
    const runs = num(ro['score']);
    return {
      battingTeam: teamById.get(num(ro['team_id'])) ?? '?',
      runs,
      wickets: num(ro['wickets']),
      overs: ballsToOvers(balls),
      balls,
      runRate: balls ? round2((runs / balls) * 6) : 0,
    };
  });
  const batting = arr(obj(fx['batting'])['data'] ?? fx['batting']).map(obj).filter((b) => b['active'] === true);
  const bowling = arr(obj(fx['bowling'])['data'] ?? fx['bowling']).map(obj).filter((b) => b['active'] === true);
  const bw = bowling[0];
  const status = str(fx['status']);
  const type = str(fx['type']).toUpperCase();
  const cur = innings.at(-1);
  const target = innings.length >= 2 ? (innings[0]?.runs ?? 0) + 1 : null;
  const maxBalls = type.includes('ODI') ? 300 : 120;
  const ballsRemaining = target !== null && cur ? maxBalls - cur.balls : null;
  return {
    matchId: str(fx['id']),
    format: type.includes('ODI') ? 'ODI' : type.includes('TEST') ? 'TEST' : 'T20',
    phase: /finished|aban|cancl/i.test(status)
      ? 'complete'
      : /break|int|lunch|tea|stump|delay/i.test(status)
        ? 'break'
        : /ns|not started/i.test(status)
          ? 'upcoming'
          : 'live',
    teams: [
      { name: str(lt['name'], 'Home'), shortCode: str(lt['code'], 'HOME'), primaryColor: '#1D4ED8' },
      { name: str(vt['name'], 'Away'), shortCode: str(vt['code'], 'AWAY'), primaryColor: '#EAB308' },
    ],
    innings,
    batters: batting.slice(0, 2).map((b, i) => ({
      name: str(obj(obj(b['batsman'])['data'] ?? b['batsman'])['fullname'], `Batter ${i + 1}`),
      runs: num(b['score']),
      balls: num(b['ball']),
      fours: num(b['four_x']),
      sixes: num(b['six_x']),
      strikeRate: num(b['rate']),
      onStrike: i === 0, // TODO(verify): Sportmonks has no explicit on-strike flag in batting
    })),
    bowler: bw
      ? {
          name: str(obj(obj(bw['bowler'])['data'] ?? bw['bowler'])['fullname'], 'Bowler'),
          overs: str(bw['overs'], '0'),
          maidens: num(bw['medians']),
          runs: num(bw['runs']),
          wickets: num(bw['wickets']),
          economy: num(bw['rate']),
        }
      : null,
    partnership: { runs: 0, balls: 0, contributions: [0, 0] },
    thisOver: [],
    recentOvers: [],
    target,
    requiredRunRate:
      target !== null && cur && ballsRemaining ? round2(((target - cur.runs) / ballsRemaining) * 6) : null,
    ballsRemaining,
    statusText: str(fx['note'], status),
    toss: '',
    venue: str(obj(obj(fx['venue'])['data'] ?? fx['venue'])['name']),
    series: str(obj(obj(fx['league'])['data'] ?? fx['league'])['name']),
    lastUpdated: Date.now(),
    isStale: false,
  };
}
