import { ballsToOvers, round2, type BallChip, type MatchFormat, type MatchPhase, type MatchState, type MatchSummary } from '@cos/shared';
import { arr, getJson, num, obj, oversToBalls, str, type Json } from './http';
import type { CricketProvider } from './types';

/**
 * CricketLiveApi adapter.
 *
 * TODO(confirm): their docs sit behind the dashboard login, so every path and
 * field name below is a placeholder until real response samples are pasted in.
 * All guesses live in BASE_URL, PATHS and FIELDS so fixing them is a one-file job.
 */
const BASE_URL = 'https://api.cricketliveapi.com/v1'; // TODO(confirm)

const PATHS = {
  live: '/matches/live', // TODO(confirm)
  match: (id: string) => `/matches/${encodeURIComponent(id)}/live`, // TODO(confirm)
};

/** Dotted paths into their JSON. TODO(confirm) every entry. */
const FIELDS = {
  list: 'data',
  id: 'id',
  title: 'name',
  format: 'format',
  status: 'status',
  statusText: 'status_text',
  teams: 'teams',
  teamName: 'name',
  teamCode: 'short_name',
  teamColor: 'color',
  innings: 'innings',
  inningsTeam: 'batting_team',
  inningsRuns: 'runs',
  inningsWickets: 'wickets',
  inningsOvers: 'overs',
  batters: 'current_batters',
  batterName: 'name',
  batterRuns: 'runs',
  batterBalls: 'balls',
  batterFours: 'fours',
  batterSixes: 'sixes',
  batterOnStrike: 'on_strike',
  bowler: 'current_bowler',
  bowlerName: 'name',
  bowlerOvers: 'overs',
  bowlerMaidens: 'maidens',
  bowlerRuns: 'runs',
  bowlerWickets: 'wickets',
  partnership: 'partnership',
  thisOver: 'this_over',
  recentOvers: 'recent_overs',
  target: 'target',
  toss: 'toss',
  venue: 'venue',
  series: 'series',
} as const;

function at(o: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((cur, k) => obj(cur)[k], o);
}

function phaseFrom(s: string): MatchPhase {
  const v = s.toLowerCase();
  if (/(complete|finished|result|ended)/.test(v)) return 'complete';
  if (/(break|drinks|stumps|rain|delay|interval)/.test(v)) return 'break';
  if (/(live|progress|running)/.test(v)) return 'live';
  return 'upcoming';
}

function formatFrom(s: string): MatchFormat {
  const v = s.toUpperCase();
  if (v.includes('ODI')) return 'ODI';
  if (v.includes('TEST')) return 'TEST';
  return 'T20';
}

function chip(v: unknown): BallChip {
  const label = str(v, '•').trim();
  const l = label.toLowerCase();
  if (l === 'w' || l.includes('wkt')) return { kind: 'wicket', label: 'W', runs: 0 };
  if (l.includes('wd')) return { kind: 'wide', label, runs: num(l.replace('wd', ''), 1) };
  if (l.includes('nb')) return { kind: 'noball', label, runs: num(l.replace('nb', ''), 0) + 1 };
  if (l.includes('lb') || l.endsWith('b')) return { kind: 'bye', label, runs: num(l.replace(/l?b/, ''), 1) };
  const runs = num(l, 0);
  if (runs === 4) return { kind: 'four', label: '4', runs };
  if (runs === 6) return { kind: 'six', label: '6', runs };
  if (runs === 0) return { kind: 'dot', label: '•', runs };
  return { kind: 'run', label: String(runs), runs };
}

export function mapMatchState(raw: unknown, id: string): MatchState {
  const m: Json = obj(obj(raw)['data'] ?? raw);
  const teamsRaw = arr(at(m, FIELDS.teams));
  const team = (t: unknown, i: number) => ({
    name: str(at(t, FIELDS.teamName), `Team ${i + 1}`),
    shortCode: str(at(t, FIELDS.teamCode), `T${i + 1}`).toUpperCase(),
    primaryColor: str(at(t, FIELDS.teamColor), i === 0 ? '#1D4ED8' : '#EAB308'),
  });
  const teams: MatchState['teams'] = [team(teamsRaw[0], 0), team(teamsRaw[1], 1)];
  const innings = arr(at(m, FIELDS.innings)).map((inn) => {
    const balls = oversToBalls(at(inn, FIELDS.inningsOvers));
    const runs = num(at(inn, FIELDS.inningsRuns));
    return {
      battingTeam: str(at(inn, FIELDS.inningsTeam), teams[0].shortCode).toUpperCase(),
      runs,
      wickets: num(at(inn, FIELDS.inningsWickets)),
      overs: ballsToOvers(balls),
      balls,
      runRate: balls ? round2((runs / balls) * 6) : 0,
    };
  });
  const batters = arr(at(m, FIELDS.batters)).map((b) => {
    const runs = num(at(b, FIELDS.batterRuns));
    const balls = num(at(b, FIELDS.batterBalls));
    return {
      name: str(at(b, FIELDS.batterName)),
      runs,
      balls,
      fours: num(at(b, FIELDS.batterFours)),
      sixes: num(at(b, FIELDS.batterSixes)),
      strikeRate: balls ? round2((runs / balls) * 100) : 0,
      onStrike: Boolean(at(b, FIELDS.batterOnStrike)),
    };
  });
  const bw = at(m, FIELDS.bowler);
  const bowlerBalls = oversToBalls(at(bw, FIELDS.bowlerOvers));
  const bowlerRuns = num(at(bw, FIELDS.bowlerRuns));
  const bowler = bw
    ? {
        name: str(at(bw, FIELDS.bowlerName)),
        overs: ballsToOvers(bowlerBalls),
        maidens: num(at(bw, FIELDS.bowlerMaidens)),
        runs: bowlerRuns,
        wickets: num(at(bw, FIELDS.bowlerWickets)),
        economy: bowlerBalls ? round2((bowlerRuns / bowlerBalls) * 6) : 0,
      }
    : null;
  const p = obj(at(m, FIELDS.partnership));
  const targetRaw = at(m, FIELDS.target);
  const target = targetRaw === undefined || targetRaw === null ? null : num(targetRaw);
  const format = formatFrom(str(at(m, FIELDS.format)));
  const cur = innings.at(-1);
  const maxBalls = format === 'ODI' ? 300 : format === 'T20' ? 120 : null;
  const ballsRemaining = target !== null && cur && maxBalls ? maxBalls - cur.balls : null;
  const need = target !== null && cur ? target - cur.runs : null;
  return {
    matchId: id,
    format,
    phase: phaseFrom(str(at(m, FIELDS.status))),
    teams,
    innings,
    batters,
    bowler,
    partnership: { runs: num(p['runs']), balls: num(p['balls']), contributions: [0, 0] },
    thisOver: arr(at(m, FIELDS.thisOver)).map(chip),
    recentOvers: arr(at(m, FIELDS.recentOvers)).map((x) => num(x)).slice(-6),
    target,
    requiredRunRate: need !== null && ballsRemaining ? round2((need / ballsRemaining) * 6) : null,
    ballsRemaining,
    statusText: str(at(m, FIELDS.statusText)),
    toss: str(at(m, FIELDS.toss)),
    venue: str(at(m, FIELDS.venue)),
    series: str(at(m, FIELDS.series)),
    lastUpdated: Date.now(),
    isStale: false,
  };
}

export class CricketLiveApiProvider implements CricketProvider {
  readonly name = 'cricketliveapi';
  readonly countsTowardQuota = true;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error('CRICKET_API_KEY is empty; set it in .env or use CRICKET_PROVIDER=mock');
  }

  private get headers(): Record<string, string> {
    return { 'X-API-Key': this.apiKey };
  }

  async listLiveMatches(): Promise<MatchSummary[]> {
    const raw = await getJson(BASE_URL + PATHS.live, this.headers);
    return arr(at(raw, FIELDS.list)).map((m) => {
      const id = str(at(m, FIELDS.id));
      const s = mapMatchState(m, id);
      const inn = s.innings.at(-1);
      return {
        id,
        title: str(at(m, FIELDS.title), `${s.teams[0].shortCode} v ${s.teams[1].shortCode}`),
        teams: [s.teams[0].shortCode, s.teams[1].shortCode],
        format: s.format,
        phase: s.phase,
        statusText: s.statusText,
        scoreLine: inn ? `${inn.battingTeam} ${inn.runs}/${inn.wickets} (${inn.overs})` : '',
      };
    });
  }

  async getMatchState(id: string): Promise<MatchState> {
    return mapMatchState(await getJson(BASE_URL + PATHS.match(id), this.headers), id);
  }
}
