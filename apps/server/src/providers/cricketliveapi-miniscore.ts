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
  type Team,
} from '@cos/shared';
import { arr, num, obj, oversToBalls, str, type Json } from './http';

/**
 * The real /cricket/commentary/{id} response (seen 2026-10-03), unlike the flat
 * array in their docs:
 *
 *   data.miniscore     striker, non_striker, bowler_striker, partnership,
 *                      innings_scores[], target, crr, rrr, recent_overs ("0 4 0 1 0")
 *   data.match_header  team1/team2 {name, short}, toss_winner/decision, series, format, state
 *   data.commentary[]  {timestamp, text: "Bowler to Batter, <b>FOUR</b>", ball_metric, innings_id,
 *                       over_separator: {over_number, over_runs, ...} on an over's last ball}
 *
 * One call carries almost the whole overlay, so it is the only per-poll request.
 */
export function isMiniscoreResponse(raw: unknown): boolean {
  return !!obj(obj(raw)['data'])['miniscore'];
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** "Nyasha Gwanzura to Eboni Brathwaite, <b>FOUR</b>" → parts, or null for notes like "X comes into the attack". */
export function parseBallText(text: string): { bowler: string; batter: string; result: string } | null {
  const m = /^(.+?) to (.+?), (.+)$/.exec(stripTags(text));
  if (!m) return null;
  return { bowler: m[1].trim(), batter: m[2].trim(), result: m[3].trim() };
}

/** Outcome from the start of the result text ("no run", "2 runs", "FOUR", "leg byes, 1 run", "out Caught by …"). */
export function resultKind(result: string): { kind: BallKind; runs: number } {
  const r = result.toLowerCase();
  const n = /(\d+)\s+runs?/.exec(r);
  const runs = n ? Number(n[1]) : 0;
  if (/^six\b/.test(r)) return { kind: 'six', runs: 6 };
  if (/^four\b/.test(r)) return { kind: 'four', runs: 4 };
  if (/^out\b/.test(r)) return { kind: 'wicket', runs };
  if (/^wides?\b/.test(r)) return { kind: 'wide', runs: Math.max(1, runs) };
  if (/^no ?ball/.test(r)) return { kind: 'noball', runs: runs + 1 };
  if (/^(leg )?byes?\b/.test(r)) return { kind: 'bye', runs };
  if (/^no run/.test(r)) return { kind: 'dot', runs: 0 };
  return { kind: runs ? 'run' : 'dot', runs };
}

export function mapFeed(entries: unknown[]): BallEvent[] {
  const out: BallEvent[] = [];
  for (const e of entries.map(obj)) {
    const parts = parseBallText(str(e['text']));
    if (!parts) continue;
    const { kind, runs } = resultKind(parts.result);
    out.push({
      id: `${num(e['innings_id'])}:${str(e['ball_metric'])}:${str(e['timestamp'])}`,
      over: str(e['ball_metric']),
      kind,
      runs,
      batter: parts.batter,
      bowler: parts.bowler,
      text: stripTags(str(e['text'])),
    });
  }
  return out.slice(0, 24); // API sends newest first
}

/** One token of "0 4 Wd5 L1 W 6" → chip. */
export function tokenChip(t: string): BallChip | null {
  const s = t.trim();
  if (!s) return null;
  const up = s.toUpperCase();
  const n = Number(/\d+/.exec(s)?.[0] ?? '');
  if (up === 'W' || up.startsWith('W') && !up.startsWith('WD')) return { kind: 'wicket', label: 'W', runs: 0 };
  if (up.startsWith('WD')) return { kind: 'wide', label: n > 1 ? `${n}wd` : 'wd', runs: n || 1 };
  if (up.startsWith('NB') || up.startsWith('N')) return { kind: 'noball', label: n ? `${n}nb` : 'nb', runs: (n || 0) + 1 };
  if (up.startsWith('LB') || up.startsWith('L')) return { kind: 'bye', label: `${n || 1}lb`, runs: n || 1 };
  if (up.startsWith('B')) return { kind: 'bye', label: `${n || 1}b`, runs: n || 1 };
  if (up === '4') return { kind: 'four', label: '4', runs: 4 };
  if (up === '6') return { kind: 'six', label: '6', runs: 6 };
  if (up === '0' || up === '.') return { kind: 'dot', label: '•', runs: 0 };
  if (Number.isFinite(n)) return { kind: 'run', label: String(n), runs: n };
  return null;
}

/** Current over from recent_overs; older overs (before a "|") are dropped. */
export function thisOverChips(recent: string): BallChip[] {
  const cur = recent.split('|').at(-1) ?? '';
  return cur.split(/\s+/).map(tokenChip).filter((c): c is BallChip => c !== null);
}

function formatFrom(s: string): MatchFormat {
  const v = s.toUpperCase();
  if (v.includes('ODI')) return 'ODI';
  if (v.includes('TEST')) return 'TEST';
  return 'T20';
}

function phaseFrom(s: string): MatchPhase {
  const v = s.toLowerCase();
  if (/(complete|finished|result|ended|won|abandon|no result)/.test(v)) return 'complete';
  if (/(break|drinks|stumps|rain|delay|interval|lunch|tea)/.test(v)) return 'break';
  if (/(live|progress|running|batting)/.test(v)) return 'live';
  return 'upcoming';
}

function toBatter(b: Json, onStrike: boolean): Batter | null {
  const name = str(b['name']);
  if (!name) return null;
  const runs = num(b['runs']);
  const balls = num(b['balls']);
  return {
    name,
    runs,
    balls,
    fours: num(b['fours']),
    sixes: num(b['sixes']),
    strikeRate: num(b['strike_rate'], balls ? round2((runs / balls) * 100) : 0),
    onStrike,
  };
}

function toBowler(b: Json): Bowler | null {
  const name = str(b['name']);
  if (!name) return null;
  const balls = oversToBalls(str(b['overs'], '0'));
  return {
    name,
    overs: ballsToOvers(balls),
    maidens: num(b['maidens']),
    runs: num(b['runs']),
    wickets: num(b['wickets']),
    economy: num(b['economy']),
  };
}

function chipFromBall(b: BallEvent): BallChip {
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
      return { kind: 'noball', label: 'nb', runs: b.runs };
    case 'bye':
      return { kind: 'bye', label: `${b.runs}b`, runs: b.runs };
    case 'dot':
      return { kind: 'dot', label: '•', runs: 0 };
    default:
      return { kind: 'run', label: String(b.runs), runs: b.runs };
  }
}

/** current over number and the previous over's balls, from the commentary feed (newest first) */
function overContext(feed: BallEvent[]): Pick<MatchState, 'overNumber' | 'prevOver'> {
  const newest = feed[0];
  if (!newest) return {};
  const cur = Math.floor(Number(newest.over));
  const prev = feed.filter((b) => Math.floor(Number(b.over)) === cur - 1).reverse();
  return {
    overNumber: cur + 1,
    prevOver: prev.length ? { number: cur, balls: prev.map(chipFromBall), runs: prev.reduce((a, b) => a + b.runs, 0) } : null,
  };
}

export interface MiniscoreExtras {
  /** colour for a team, keyed by full name */
  teamColor(name: string): string;
  /** venue from the live list when the header leaves it empty */
  venue?: string;
}

export function composeFromMiniscore(id: string, raw: unknown, extras: MiniscoreExtras, now: number): MatchState {
  const data = obj(obj(raw)['data']);
  const ms = obj(data['miniscore']);
  const hd = obj(data['match_header']);
  const t1 = obj(hd['team1']);
  const t2 = obj(hd['team2']);
  const teams: [Team, Team] = [t1, t2].map((t, i) => {
    const name = str(t['name'], i ? 'Team B' : 'Team A');
    return { name, shortCode: str(t['short'], name.slice(0, 3)).toUpperCase(), primaryColor: extras.teamColor(name) };
  }) as [Team, Team];

  const innings: Innings[] = arr(ms['innings_scores'])
    .map(obj)
    .sort((a, b) => num(a['innings_id']) - num(b['innings_id']))
    .map((i) => {
      const balls = oversToBalls(str(i['overs'], '0'));
      const runs = num(i['score']);
      return {
        battingTeam: str(i['bat_team']).toUpperCase(),
        runs,
        wickets: num(i['wickets']),
        overs: ballsToOvers(balls),
        balls,
        runRate: balls ? round2((runs / balls) * 6) : 0,
      };
    });

  const batters = [toBatter(obj(ms['striker']), true), toBatter(obj(ms['non_striker']), false)].filter(
    (b): b is Batter => b !== null,
  );
  const bowler = toBowler(obj(ms['bowler_striker']));
  const feed = mapFeed(arr(data['commentary']));

  const format = formatFrom(str(hd['format'] ?? ms['match_format']));
  const maxBalls = format === 'ODI' ? 300 : format === 'T20' ? 120 : null;
  const cur = innings.at(-1);
  const targetRaw = ms['target'];
  const target = typeof targetRaw === 'number' && targetRaw > 0 ? targetRaw : null;
  const ballsRemaining = target !== null && cur && maxBalls ? Math.max(0, maxBalls - cur.balls) : null;
  const need = target !== null && cur ? target - cur.runs : null;
  const phase = phaseFrom(str(ms['state'] ?? hd['state']));

  const chasing = teams.find((t) => t.shortCode === cur?.battingTeam)?.name ?? cur?.battingTeam ?? '';
  const statusText =
    phase === 'live' && need !== null && need > 0 && ballsRemaining !== null
      ? `${chasing} need ${need} run${need === 1 ? '' : 's'} from ${ballsRemaining} ball${ballsRemaining === 1 ? '' : 's'}`
      : str(ms['custom_status']) || str(ms['status']) || str(hd['status']);

  const tossWinner = str(hd['toss_winner']);
  const decision = str(hd['toss_decision']).toLowerCase();
  const toss = tossWinner ? `${tossWinner} won the toss and chose to ${decision.startsWith('bowl') ? 'bowl' : 'bat'}` : '';

  // completed overs' runs, from the over separators the feed carries (newest first in the API)
  const recentOvers = arr(data['commentary'])
    .map(obj)
    .filter((e) => num(e['innings_id']) === num(ms['innings_id']) && e['over_separator'])
    .map((e) => num(obj(e['over_separator'])['over_runs']))
    .reverse()
    .slice(-6);

  const p = obj(ms['partnership']);
  const rrr = num(ms['rrr'], NaN);

  return {
    matchId: id,
    format,
    phase,
    teams,
    innings,
    batters,
    bowler,
    // per-batter split isn't in the feed; widgets hide the bar when both are 0
    partnership: { runs: num(p['runs']), balls: num(p['balls']), contributions: [0, 0] },
    thisOver: thisOverChips(str(ms['recent_overs'])),
    ...overContext(feed),
    recentOvers,
    target,
    requiredRunRate: Number.isFinite(rrr) && rrr > 0 ? rrr : null,
    ballsRemaining,
    statusText,
    toss,
    venue: str(hd['venue']) || extras.venue || '',
    series: str(hd['series_name']),
    lastUpdated: now,
    isStale: false,
    ballFeed: feed,
  };
}
