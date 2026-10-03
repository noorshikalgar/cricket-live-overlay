import {
  ballsToOvers,
  round2,
  type BallChip,
  type BallEvent,
  type BallKind,
  type Batter,
  type Bowler,
  type Innings,
  type MatchFormat,
  type MatchPhase,
  type MatchState,
  type MatchSummary,
  type Team,
} from '@cos/shared';
import { arr, getJson, num, obj, oversToBalls, str, type Json } from './http';
import { BudgetExceededError, type CallBudget } from '../usage';
import { composeFromMiniscore, isMiniscoreResponse } from './cricketliveapi-miniscore';
import type { CricketProvider } from './types';

/**
 * CricketLiveApi adapter, mapped from the response samples in their docs
 * (https://cricketliveapi.com, "API Endpoints"). Bearer auth on every call.
 *
 * Their server caches: live list 15 s, commentary 10 s, scorecard 30 s,
 * match-facts 30 s. One getMatchState combines them, refreshing each source only
 * when its cache can have changed:
 *
 *   commentary   every poll        this over, striker, bowler, FOUR/SIX/WICKET feed
 *   live list    every ≥15 s       freshest total ("MI 187/4 (18.2 ov)"), state
 *   scorecard    every ≥30 s       innings, batter and bowler figures
 *   match-facts  once per match    toss, venue, series
 *
 * Every call goes through the shared CallBudget (daily + per-minute caps). The ball
 * feed is required; the other sources are optional and keep one call free for it,
 * so on a tight plan they simply reuse their last response.
 *
 * TODO(verify): fields beyond the doc samples (dismissal text, maidens, commentary
 * ordering, extras types) are read defensively. Check them against a real
 * response saved with `npm run probe -w apps/server -- /cricket/commentary/<id>`.
 */
const DEFAULT_BASE_URL = 'https://cricketliveapi.com/api/v1';

const PATHS = {
  live: '/cricket/matches/live',
  commentary: (id: string) => `/cricket/commentary/${encodeURIComponent(id)}`,
  scorecard: (id: string) => `/cricket/scorecard/${encodeURIComponent(id)}`,
  facts: (id: string) => `/cricket/match-facts/${encodeURIComponent(id)}`,
};

const REFRESH_MS = { live: 15_000, scorecard: 30_000, facts: 10 * 60_000 };
/** optional sources leave this many calls for the next ball-feed request */
const OPTIONAL_KEEP_FREE = 1;

interface LiveInnings {
  id: number;
  runs: number;
  wickets: number;
  /** cricket notation; "19.6" is how they write a completed 20th over */
  overs: string;
}

interface LiveTeam {
  name: string;
  code: string;
  innings: LiveInnings[];
}

/**
 * Teams of one live-list item. The real API nests them as
 * `first_team` / `second_team` ({ name: "INDCH", full_name, innings[] }); their
 * docs show flat `team_a` / `team_b` strings instead, kept as a fallback.
 */
export function liveTeams(o: Json): [LiveTeam, LiveTeam] {
  const nested = (t: unknown, fallback: string): LiveTeam => {
    const x = obj(t);
    const code = str(x['name']);
    const name = str(x['full_name']) || code || fallback;
    return {
      name,
      code: (code || shortCode(name)).toUpperCase(),
      innings: arr(x['innings']).map((i) => {
        const r = obj(i);
        return { id: num(r['innings_id']), runs: num(r['runs']), wickets: num(r['wickets']), overs: str(r['overs'], '0') };
      }),
    };
  };
  if (o['first_team'] || o['second_team']) return [nested(o['first_team'], 'Team A'), nested(o['second_team'], 'Team B')];
  const a = str(o['team_a'], 'Team A');
  const b = str(o['team_b'], 'Team B');
  return [
    { name: a, code: shortCode(a), innings: [] },
    { name: b, code: shortCode(b), innings: [] },
  ];
}

/** Every innings of the match in batting order, from the live list. */
function liveInnings(teams: [LiveTeam, LiveTeam]): Innings[] {
  return teams
    .flatMap((t) => t.innings.map((i) => ({ ...i, code: t.code })))
    .sort((x, y) => x.id - y.id)
    .map((i) => {
      const balls = oversToBalls(i.overs);
      return {
        battingTeam: i.code,
        runs: i.runs,
        wickets: i.wickets,
        overs: ballsToOvers(balls),
        balls,
        runRate: balls ? round2((i.runs / balls) * 6) : 0,
      };
    });
}

/** One item of /cricket/matches/live. */
export function mapLiveItem(m: unknown): MatchSummary {
  const o = obj(m);
  const teams = liveTeams(o);
  const desc = str(o['match_desc']);
  const last = liveInnings(teams).at(-1);
  return {
    id: str(o['match_id']),
    title: `${teams[0].code} v ${teams[1].code}${desc ? ` · ${desc}` : ''}`,
    teams: [teams[0].code, teams[1].code],
    format: formatFrom(str(o['format'])),
    phase: phaseFrom(str(o['state'] ?? o['status'])),
    statusText: str(o['status_detail']) || str(o['short_status']) || str(o['live_inning']),
    scoreLine: last ? `${last.battingTeam} ${last.runs}/${last.wickets} (${last.overs})` : str(o['score']),
  };
}

/** "Mumbai Indians" → "MI", "Chennai Super Kings" → "CSK", "India" → "IND" */
export function shortCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0]).join('').toUpperCase().slice(0, 4);
  return name.slice(0, 3).toUpperCase();
}

function phaseFrom(s: string): MatchPhase {
  const v = s.toLowerCase();
  if (/(complete|finished|result|ended|won|abandon|no result)/.test(v)) return 'complete';
  if (/(break|drinks|stumps|rain|delay|interval|lunch|tea)/.test(v)) return 'break';
  if (/(live|progress|running|batting)/.test(v)) return 'live';
  return 'upcoming';
}

function formatFrom(s: string): MatchFormat {
  const v = s.toUpperCase();
  if (v.includes('ODI')) return 'ODI';
  if (v.includes('TEST')) return 'TEST';
  return 'T20';
}

const PALETTE = ['#1D4ED8', '#EAB308', '#DC2626', '#7C3AED', '#0EA5E9', '#F97316', '#16A34A', '#DB2777'];

/** Stable colour per team name (the API has no team colours outside /graphs). */
function teamColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function team(name: string): Team {
  return { name, shortCode: shortCode(name), primaryColor: teamColor(name) };
}

/** "MI 187/4 (18.2 ov)" → the last innings in the string ("... & CSK 90/2 (11 ov)" works too). */
export function parseScoreLine(s: string): { code: string; runs: number; wickets: number; balls: number } | null {
  const re = /([A-Za-z][\w.&' -]*?)\s+(\d+)(?:\/(\d+))?\s*\(\s*([\d.]+)\s*(?:ov|overs)?\s*\)/g;
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(s); m; m = re.exec(s)) last = m;
  if (!last) return null;
  return {
    code: last[1].trim().split(/\s+/).at(-1)?.toUpperCase() ?? '',
    runs: Number(last[2]),
    wickets: last[3] === undefined ? 10 : Number(last[3]),
    balls: oversToBalls(last[4]),
  };
}

/** Map a commentary entry's type/runs/text to a chip kind. */
export function ballKind(type: string, runs: number, text: string): BallKind {
  const ty = type.toUpperCase();
  const t = `${type} ${text}`.toLowerCase();
  if (ty === 'W' || /\b(WICKET|WKT|OUT)\b/.test(ty)) return 'wicket';
  if (ty === 'SIX' || (runs === 6 && !/wide|no.?ball|bye/.test(t))) return 'six';
  if (ty === 'FOUR' || (runs === 4 && /four|boundary/.test(t) && !/bye/.test(t))) return 'four';
  if (/\bwide|\bwd\b/.test(t)) return 'wide';
  if (/no.?ball|\bnb\b/.test(t)) return 'noball';
  if (/\bbyes?\b|leg.?bye/.test(t)) return 'bye';
  return runs === 0 ? 'dot' : 'run';
}

function chipOf(b: BallEvent): BallChip {
  switch (b.kind) {
    case 'wicket':
      return { kind: 'wicket', label: 'W', runs: b.runs };
    case 'six':
      return { kind: 'six', label: '6', runs: 6 };
    case 'four':
      return { kind: 'four', label: '4', runs: 4 };
    case 'wide':
      return { kind: 'wide', label: b.runs > 1 ? `${b.runs}wd` : 'wd', runs: b.runs };
    case 'noball':
      return { kind: 'noball', label: b.runs > 1 ? `${b.runs - 1}nb` : 'nb', runs: b.runs };
    case 'bye':
      return { kind: 'bye', label: `${b.runs}b`, runs: b.runs };
    case 'dot':
      return { kind: 'dot', label: '•', runs: 0 };
    default:
      return { kind: 'run', label: String(b.runs), runs: b.runs };
  }
}

function overKey(o: string): number {
  const [a, b] = o.split('.');
  return Number(a) * 10 + Number(b);
}

/** Commentary → deliveries, newest first. Entries without an "over" (summaries, notes) are dropped. */
export function mapCommentary(raw: unknown): BallEvent[] {
  const balls = arr(obj(raw)['data'])
    .map(obj)
    .filter((c) => /^\d+\.\d+$/.test(str(c['over']).trim()))
    .map((c): BallEvent => {
      const over = str(c['over']).trim();
      const runs = num(c['runs']);
      const type = str(c['type']);
      const text = str(c['text']);
      return {
        id: `${over}:${type || runs}:${str(c['ball'])}:${text.slice(0, 24)}`,
        over,
        kind: ballKind(type, runs, text),
        runs,
        batter: str(c['batsman'] ?? c['batter']),
        bowler: str(c['bowler']),
        text,
      };
    });
  // newest first, whichever way the API orders them
  if (balls.length > 1 && overKey(balls[0].over) < overKey(balls[balls.length - 1].over)) balls.reverse();
  return balls.slice(0, 18);
}

/** Balls of the over the newest delivery belongs to, oldest first. */
function currentOver(feed: BallEvent[]): BallChip[] {
  const first = feed[0];
  if (!first) return [];
  const overNo = first.over.split('.')[0];
  const out: BallEvent[] = [];
  for (const b of feed) {
    if (b.over.split('.')[0] !== overNo) break;
    out.push(b);
  }
  return out.reverse().map(chipOf);
}

interface ScoreInnings {
  team: string;
  runs: number;
  wickets: number;
  overs: string;
  batters: Json[];
  bowlers: Json[];
}

export function mapScorecard(raw: unknown): ScoreInnings[] {
  return arr(obj(obj(raw)['data'])['innings']).map((i) => {
    const o = obj(i);
    return {
      team: str(o['team']),
      runs: num(o['runs']),
      wickets: num(o['wickets']),
      overs: str(o['overs'], '0'),
      batters: arr(o['batters']).map(obj),
      bowlers: arr(o['bowlers']).map(obj),
    };
  });
}

/** Loose name match: "Jadeja" ↔ "Ravindra Jadeja", "R Sharma" ↔ "Rohit Sharma". */
function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === y) return true;
  const lx = x.split(/\s+/).at(-1);
  const ly = y.split(/\s+/).at(-1);
  return !!lx && lx === ly && (x.includes(y) || y.includes(x) || x[0] === y[0]);
}

function isOut(b: Json): boolean {
  if (b['is_out'] === true || b['out'] === true) return true;
  const d = str(b['dismissal'] ?? b['out_desc'] ?? b['status'] ?? b['how_out']).toLowerCase();
  return d !== '' && !d.includes('not out') && !d.includes('batting');
}

function toBatter(b: Json, onStrike: boolean): Batter {
  const runs = num(b['runs']);
  const balls = num(b['balls']);
  return {
    name: str(b['name']),
    runs,
    balls,
    fours: num(b['fours']),
    sixes: num(b['sixes']),
    strikeRate: num(b['sr'], balls ? round2((runs / balls) * 100) : 0),
    onStrike,
  };
}

function toBowler(b: Json): Bowler {
  return {
    name: str(b['name']),
    overs: str(b['overs'], '0'),
    maidens: num(b['maidens'] ?? b['m']),
    runs: num(b['runs']),
    wickets: num(b['wickets']),
    economy: num(b['econ'] ?? b['economy']),
  };
}

interface Cached<T> {
  at: number;
  value: T;
}

interface MatchCache {
  live?: Cached<Json | null>;
  scorecard?: Cached<ScoreInnings[]>;
  facts?: Cached<Json>;
  everLive: boolean;
}

export class CricketLiveApiProvider implements CricketProvider {
  readonly name = 'cricketliveapi';
  readonly countsTowardQuota = true;
  /** their commentary cache refreshes every 10 s */
  readonly minIntervalSeconds = 10;
  /** the real commentary response carries the whole state in one call */
  readonly callsPerPoll = 1;

  private readonly baseUrl: string;
  private budget: CallBudget | null = null;
  private liveList: Cached<Json[]> | null = null;
  private readonly cache = new Map<string, MatchCache>();

  constructor(
    private readonly apiKey: string,
    baseUrl = '',
  ) {
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
    if (!apiKey) throw new Error('CRICKET_API_KEY is empty; set it in .env or use CRICKET_PROVIDER=mock');
  }

  attachBudget(budget: CallBudget): void {
    this.budget = budget;
  }

  onSelect(id: string): void {
    this.cache.delete(id);
  }

  /** One HTTP call, only if the budget allows it. Refusal means nothing is sent. */
  private async get(path: string, optional = false): Promise<unknown> {
    const b = this.budget;
    if (b && !b.tryAcquire(optional ? OPTIONAL_KEEP_FREE : 0)) {
      throw new BudgetExceededError(b.blockedReason() ?? 'API budget reserved for the ball feed');
    }
    return getJson(this.baseUrl + path, { authorization: `Bearer ${this.apiKey}` });
  }

  private async fetchLiveList(optional: boolean): Promise<Json[]> {
    if (this.liveList && Date.now() - this.liveList.at < REFRESH_MS.live) return this.liveList.value;
    const raw = await this.get(PATHS.live, optional);
    this.liveList = { at: Date.now(), value: arr(obj(raw)['data']).map(obj) };
    return this.liveList.value;
  }

  async listLiveMatches(): Promise<MatchSummary[]> {
    return (await this.fetchLiveList(false)).map(mapLiveItem);
  }

  async getMatchState(id: string): Promise<MatchState> {
    const c = this.cache.get(id) ?? { everLive: false };
    this.cache.set(id, c);
    const now = Date.now();

    // required: the ball feed (10 s cache on their side)
    const commentaryRaw = await this.get(PATHS.commentary(id));

    if (isMiniscoreResponse(commentaryRaw)) {
      // real API shape: one call has everything; the live list is only read for the
      // venue, from the copy the match picker already fetched (no extra call)
      const item = this.liveList?.value.find((m) => str(m['match_id']) === id);
      return composeFromMiniscore(id, commentaryRaw, { teamColor, venue: str(item?.['venue']) }, now);
    }

    // doc shape (flat commentary array): combine with live list, scorecard and facts
    const feed = mapCommentary(commentaryRaw);

    // optional sources: refreshed when stale and the per-minute budget allows
    const due = (x: Cached<unknown> | undefined, ms: number) => !x || now - x.at >= ms;
    const soft = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch {
        return undefined; // keep the previous value; the next poll retries
      }
    };
    // most useful first: totals (live list), then figures (scorecard), then toss/venue once
    if (due(c.live, REFRESH_MS.live)) {
      const list = await soft(() => this.fetchLiveList(true));
      if (list) c.live = { at: now, value: list.find((m) => str(m['match_id']) === id) ?? null };
    }
    if (due(c.scorecard, REFRESH_MS.scorecard)) {
      const raw = await soft(() => this.get(PATHS.scorecard(id), true));
      if (raw !== undefined) c.scorecard = { at: now, value: mapScorecard(raw) };
    }
    if (due(c.facts, REFRESH_MS.facts)) {
      const raw = await soft(() => this.get(PATHS.facts(id), true));
      if (raw !== undefined) c.facts = { at: now, value: obj(obj(raw)['data']) };
    }

    return composeState(id, c, feed, now);
  }
}

/** Merge the cached sources into one MatchState. Exported for tests. */
export function composeState(id: string, c: MatchCache, feed: BallEvent[], now: number): MatchState {
  const live = c.live?.value ?? null;
  const facts = c.facts?.value ?? {};
  const card = c.scorecard?.value ?? [];

  const lt = live ? liveTeams(live) : null;
  const nameA = lt?.[0].name || card[0]?.team || 'Team A';
  const nameB = lt?.[1].name || card.find((i) => i.team && i.team !== nameA)?.team || 'Team B';
  const teams: [Team, Team] = [team(nameA), team(nameB)];
  if (lt) {
    teams[0].shortCode = lt[0].code;
    teams[1].shortCode = lt[1].code;
  }
  const codeOf = (teamName: string) =>
    teams.find((t) => sameName(t.name, teamName) || t.shortCode === teamName.toUpperCase())?.shortCode ??
    shortCode(teamName);

  // the live list carries every innings and refreshes faster than the scorecard
  const fromLive = lt ? liveInnings(lt) : [];
  const innings: Innings[] = fromLive.length ? fromLive : card.map((i) => {
    const balls = oversToBalls(i.overs);
    return {
      battingTeam: codeOf(i.team),
      runs: i.runs,
      wickets: i.wickets,
      overs: ballsToOvers(balls),
      balls,
      runRate: balls ? round2((i.runs / balls) * 6) : 0,
    };
  });

  // doc-shape fallback: a flat "MI 187/4 (18.2 ov)" score line for the current innings
  const line = fromLive.length ? null : parseScoreLine(str(live?.['score']));
  if (line) {
    const code = teams.find((t) => t.shortCode === line.code || sameName(t.name, line.code))?.shortCode ?? line.code;
    const cur = innings.at(-1);
    const fresh: Innings = {
      battingTeam: code,
      runs: line.runs,
      wickets: line.wickets,
      overs: ballsToOvers(line.balls),
      balls: line.balls,
      runRate: line.balls ? round2((line.runs / line.balls) * 6) : 0,
    };
    if (cur && cur.battingTeam === code) innings[innings.length - 1] = fresh.balls >= cur.balls ? fresh : cur;
    else if (!cur || line.balls > 0) innings.push(fresh);
  }

  // current batters: not-out batters of the last innings, most recently seen in the feed first
  const curCard = card.at(-1);
  const striker = feed[0]?.batter ?? '';
  const recentNames = feed.map((b) => b.batter);
  const rank = (b: Json) => {
    const i = recentNames.findIndex((n) => sameName(n, str(b['name'])));
    return i < 0 ? 99 : i;
  };
  const notOut = (curCard?.batters ?? []).filter((b) => !isOut(b)).sort((x, y) => rank(x) - rank(y));
  // no dismissal info in the card: the last two listed are the ones batting
  const chosen = (notOut.length ? notOut : (curCard?.batters ?? []).slice(-2)).slice(0, 2);
  const batters = chosen
    .map((b) => toBatter(b, sameName(str(b['name']), striker)))
    .sort((a, b) => Number(b.onStrike) - Number(a.onStrike));
  if (batters.length && !batters.some((b) => b.onStrike)) batters[0].onStrike = true;

  const bowlerName = feed[0]?.bowler ?? '';
  const bowlerRow = curCard?.bowlers.find((b) => sameName(str(b['name']), bowlerName));
  const bowler: Bowler | null = bowlerRow
    ? toBowler(bowlerRow)
    : bowlerName
      ? { name: bowlerName, overs: '–', maidens: 0, runs: 0, wickets: 0, economy: 0 }
      : null;

  const format = formatFrom(str(live?.['format']));
  const maxBalls = format === 'ODI' ? 300 : format === 'T20' ? 120 : null;
  const curInn = innings.at(-1);
  const target = innings.length >= 2 && format !== 'TEST' ? innings[0].runs + 1 : null;
  const ballsRemaining = target !== null && curInn && maxBalls ? Math.max(0, maxBalls - curInn.balls) : null;
  const need = target !== null && curInn ? target - curInn.runs : null;

  // a match that drops off the live list after being live has finished
  const phase: MatchPhase = live
    ? phaseFrom(str(live['state'] ?? live['status']))
    : c.everLive
      ? 'complete'
      : feed.length
        ? 'live'
        : 'upcoming';
  if (phase === 'live') c.everLive = true;

  const chasing = teams.find((t) => t.shortCode === curInn?.battingTeam)?.name ?? curInn?.battingTeam ?? '';
  const statusText =
    phase === 'live' && need !== null && need > 0 && ballsRemaining !== null
      ? `${chasing} need ${need} run${need === 1 ? '' : 's'} from ${ballsRemaining} ball${ballsRemaining === 1 ? '' : 's'}`
      : str(live?.['status_detail']) ||
        str(live?.['result']) ||
        str(live?.['live_inning']) ||
        str(live?.['short_status']) ||
        str(live?.['state']);

  // runs per completed over, as far back as the feed reaches
  const perOver = new Map<string, number>();
  for (const b of feed) {
    const o = b.over.split('.')[0];
    perOver.set(o, (perOver.get(o) ?? 0) + b.runs);
  }
  const curOverNo = feed[0]?.over.split('.')[0];
  const recentOvers = [...perOver.entries()]
    .filter(([o]) => o !== curOverNo)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, r]) => r)
    .slice(-6);

  return {
    matchId: id,
    format,
    phase,
    teams,
    innings,
    batters,
    bowler,
    partnership: { runs: 0, balls: 0, contributions: [0, 0] }, // not in the API
    thisOver: currentOver(feed),
    recentOvers,
    target,
    requiredRunRate: need !== null && need > 0 && ballsRemaining ? round2((need / ballsRemaining) * 6) : null,
    ballsRemaining,
    statusText,
    toss: str(facts['toss']),
    venue: str(facts['venue']) || str(live?.['venue']),
    series: str(facts['series']) || str(live?.['series_name']),
    lastUpdated: now,
    isStale: false,
    ballFeed: feed,
  };
}
