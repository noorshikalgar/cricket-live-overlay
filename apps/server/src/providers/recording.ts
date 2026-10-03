import {
  ballsToOvers,
  round2,
  type BallChip,
  type Batter,
  type CardInnings,
  type CardPartnership,
  type FallOfWicket,
  type Scorecard,
  type Squads,
  type Bowler,
  type Innings,
  type MatchFormat,
  type MatchPhase,
  type MatchState,
  type MatchSummary,
  type Team,
} from '@cos/shared';

export type ExtraType = 'wide' | 'noball' | 'bye' | 'legbye';

/** One ball as recorded. Mirrors what ball-by-ball feeds give us. */
export interface RecordedDelivery {
  /** innings index, 0-based */
  inn: number;
  batter: string;
  nonStriker: string;
  bowler: string;
  /** runs off the bat */
  runs: number;
  extras: number;
  extraType?: ExtraType;
  wicket?: { player: string; kind: string; fielder?: string };
}

export interface Recording {
  meta: {
    id: string;
    series: string;
    venue: string;
    toss: string;
    format: MatchFormat;
    oversPerInnings: number;
    teams: [Team, Team];
    /** shortCode of the team batting first */
    battingFirst: string;
    /** batting order per team code, with roles; used for squads and "yet to bat" */
    squads?: Record<string, { name: string; role: string }[]>;
  };
  deliveries: RecordedDelivery[];
}

export function isLegal(d: RecordedDelivery): boolean {
  return d.extraType !== 'wide' && d.extraType !== 'noball';
}

/** Runs charged to the bowler. Byes and leg byes are not. */
function bowlerRuns(d: RecordedDelivery): number {
  if (d.extraType === 'bye' || d.extraType === 'legbye') return d.runs;
  return d.runs + d.extras;
}

export function chipFor(d: RecordedDelivery): BallChip {
  const total = d.runs + d.extras;
  if (d.wicket) return { kind: 'wicket', label: 'W', runs: total };
  switch (d.extraType) {
    case 'wide':
      return { kind: 'wide', label: d.extras > 1 ? `${d.extras}wd` : 'wd', runs: total };
    case 'noball':
      return { kind: 'noball', label: d.runs > 0 ? `${d.runs}nb` : 'nb', runs: total };
    case 'bye':
      return { kind: 'bye', label: `${d.extras}b`, runs: total };
    case 'legbye':
      return { kind: 'bye', label: `${d.extras}lb`, runs: total };
    default:
      break;
  }
  if (d.runs === 4) return { kind: 'four', label: '4', runs: 4 };
  if (d.runs === 6) return { kind: 'six', label: '6', runs: 6 };
  if (d.runs === 0) return { kind: 'dot', label: '•', runs: 0 };
  return { kind: 'run', label: String(d.runs), runs: d.runs };
}

interface BatAcc {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
}

interface BowlAcc {
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
}

interface InningsAcc {
  battingTeam: string;
  runs: number;
  wickets: number;
  balls: number;
  bat: Map<string, BatAcc>;
  bowl: Map<string, BowlAcc>;
  /** runs per over, index = over number */
  overRuns: number[];
  /** bowler runs per over, for maidens */
  overBowlerRuns: number[];
  partnership: { runs: number; balls: number; by: Map<string, number> };
  deliveries: RecordedDelivery[];
}

function newInnings(team: string): InningsAcc {
  return {
    battingTeam: team,
    runs: 0,
    wickets: 0,
    balls: 0,
    bat: new Map(),
    bowl: new Map(),
    overRuns: [],
    overBowlerRuns: [],
    partnership: { runs: 0, balls: 0, by: new Map() },
    deliveries: [],
  };
}

function batAcc(inn: InningsAcc, name: string): BatAcc {
  let b = inn.bat.get(name);
  if (!b) {
    b = { runs: 0, balls: 0, fours: 0, sixes: 0, out: false };
    inn.bat.set(name, b);
  }
  return b;
}

function bowlAcc(inn: InningsAcc, name: string): BowlAcc {
  let b = inn.bowl.get(name);
  if (!b) {
    b = { balls: 0, runs: 0, wickets: 0, maidens: 0 };
    inn.bowl.set(name, b);
  }
  return b;
}

function apply(inn: InningsAcc, d: RecordedDelivery): void {
  const over = Math.floor(inn.balls / 6);
  const total = d.runs + d.extras;
  inn.runs += total;
  inn.overRuns[over] = (inn.overRuns[over] ?? 0) + total;
  inn.overBowlerRuns[over] = (inn.overBowlerRuns[over] ?? 0) + bowlerRuns(d);

  const bat = batAcc(inn, d.batter);
  batAcc(inn, d.nonStriker);
  if (d.extraType !== 'wide') bat.balls += 1;
  bat.runs += d.runs;
  if (d.runs === 4) bat.fours += 1;
  if (d.runs === 6) bat.sixes += 1;

  const bowl = bowlAcc(inn, d.bowler);
  bowl.runs += bowlerRuns(d);

  inn.partnership.runs += total;
  inn.partnership.by.set(d.batter, (inn.partnership.by.get(d.batter) ?? 0) + d.runs);

  if (isLegal(d)) {
    inn.balls += 1;
    bowl.balls += 1;
    inn.partnership.balls += 1;
    if (inn.balls % 6 === 0 && inn.overBowlerRuns[over] === 0) bowl.maidens += 1;
  }

  if (d.wicket) {
    inn.wickets += 1;
    batAcc(inn, d.wicket.player).out = true;
    if (d.wicket.kind !== 'run out') bowl.wickets += 1;
    inn.partnership = { runs: 0, balls: 0, by: new Map() };
  }
  inn.deliveries.push(d);
}

function toInnings(inn: InningsAcc): Innings {
  return {
    battingTeam: inn.battingTeam,
    runs: inn.runs,
    wickets: inn.wickets,
    overs: ballsToOvers(inn.balls),
    balls: inn.balls,
    runRate: inn.balls ? round2((inn.runs / inn.balls) * 6) : 0,
  };
}

function toBatter(name: string, b: BatAcc, onStrike: boolean): Batter {
  return {
    name,
    runs: b.runs,
    balls: b.balls,
    fours: b.fours,
    sixes: b.sixes,
    strikeRate: b.balls ? round2((b.runs / b.balls) * 100) : 0,
    onStrike,
  };
}

function toBowler(name: string, b: BowlAcc): Bowler {
  return {
    name,
    overs: ballsToOvers(b.balls),
    maidens: b.maidens,
    runs: b.runs,
    wickets: b.wickets,
    economy: b.balls ? round2((b.runs / b.balls) * 6) : 0,
  };
}

function otherTeam(rec: Recording, code: string): Team {
  const t = rec.meta.teams.find((x) => x.shortCode !== code);
  return t ?? rec.meta.teams[1];
}

function teamName(rec: Recording, code: string): string {
  return rec.meta.teams.find((t) => t.shortCode === code)?.name ?? code;
}

/**
 * Rebuild the full match state after the first `count` deliveries.
 * Pure, so the mock can jump anywhere in the replay and tests can assert on it.
 */
export function buildState(rec: Recording, count: number, now: number): MatchState {
  const all = rec.deliveries;
  const n = Math.max(0, Math.min(count, all.length));
  const first = rec.meta.battingFirst;
  const second = otherTeam(rec, first).shortCode;
  const accs: InningsAcc[] = [];

  for (let i = 0; i < n; i++) {
    const d = all[i];
    while (accs.length <= d.inn) accs.push(newInnings(accs.length === 0 ? first : second));
    apply(accs[d.inn], d);
  }

  const last = n > 0 ? all[n - 1] : undefined;
  const next = n < all.length ? all[n] : undefined;
  const complete = n >= all.length && all.length > 0;
  const inBreak = !!last && !!next && next.inn > last.inn;
  const phase: MatchPhase = n === 0 ? 'upcoming' : complete ? 'complete' : inBreak ? 'break' : 'live';
  const cur = accs.at(-1);

  // Current pair and bowler: take them from the next ball in the same innings so
  // strike rotation and new batters match the recording exactly.
  let batters: Batter[] = [];
  let bowler: Bowler | null = null;
  if (cur && last) {
    const sameNext = next && next.inn === last.inn ? next : undefined;
    let striker = sameNext?.batter ?? last.batter;
    let non = sameNext?.nonStriker ?? last.nonStriker;
    if (!sameNext && last.wicket) {
      // innings over on a wicket: keep the not-out batter only
      if (striker === last.wicket.player) striker = '';
      if (non === last.wicket.player) non = '';
    }
    batters = [striker, non]
      .filter((name) => name !== '')
      .map((name, i) => toBatter(name, cur.bat.get(name) ?? batAcc(cur, name), i === 0));
    const overDone = cur.balls % 6 === 0 && cur.balls > 0 && isLegal(last);
    const bowlerName = overDone && sameNext ? sameNext.bowler : last.bowler;
    bowler = toBowler(bowlerName, cur.bowl.get(bowlerName) ?? bowlAcc(cur, bowlerName));
  }

  // This over: the balls of the over the last delivery belongs to.
  let thisOver: BallChip[] = [];
  let recentOvers: number[] = [];
  if (cur) {
    let legal = 0;
    const overOf: number[] = cur.deliveries.map((d) => {
      const o = Math.floor(legal / 6);
      if (isLegal(d)) legal += 1;
      return o;
    });
    const lastOver = overOf.at(-1) ?? 0;
    thisOver = cur.deliveries.filter((_, i) => overOf[i] === lastOver).map(chipFor);
    const completed = Math.floor(cur.balls / 6);
    recentOvers = cur.overRuns.slice(0, completed).slice(-6);
  }

  const partnership = cur
    ? {
        runs: cur.partnership.runs,
        balls: cur.partnership.balls,
        contributions: [
          cur.partnership.by.get(batters[0]?.name ?? '') ?? 0,
          cur.partnership.by.get(batters[1]?.name ?? '') ?? 0,
        ] as [number, number],
      }
    : { runs: 0, balls: 0, contributions: [0, 0] as [number, number] };

  const maxBalls = rec.meta.oversPerInnings * 6;
  let target: number | null = null;
  let rrr: number | null = null;
  let ballsRemaining: number | null = null;
  if (accs.length >= 2 || inBreak) {
    target = (accs[0]?.runs ?? 0) + 1;
    const chase = accs[1];
    ballsRemaining = maxBalls - (chase?.balls ?? 0);
    const need = target - (chase?.runs ?? 0);
    rrr = ballsRemaining > 0 && need > 0 ? round2((need / ballsRemaining) * 6) : null;
  }

  return {
    matchId: rec.meta.id,
    format: rec.meta.format,
    phase,
    teams: rec.meta.teams,
    innings: accs.map(toInnings),
    batters,
    bowler,
    partnership,
    thisOver,
    recentOvers,
    target,
    requiredRunRate: rrr,
    ballsRemaining,
    statusText: statusText(rec, accs, phase, target, ballsRemaining),
    toss: rec.meta.toss,
    venue: rec.meta.venue,
    series: rec.meta.series,
    lastUpdated: now,
    isStale: false,
  };
}

function statusText(
  rec: Recording,
  accs: InningsAcc[],
  phase: MatchPhase,
  target: number | null,
  ballsRemaining: number | null,
): string {
  if (phase === 'upcoming') return rec.meta.toss;
  const chase = accs[1];
  const first = accs[0];
  if (phase === 'break' && target !== null) {
    return `Innings break · ${teamName(rec, otherTeam(rec, rec.meta.battingFirst).shortCode)} need ${target} to win`;
  }
  if (phase === 'complete' && first && chase && target !== null) {
    if (chase.runs >= target) {
      const w = 10 - chase.wickets;
      return `${teamName(rec, chase.battingTeam)} won by ${w} wicket${w === 1 ? '' : 's'}`;
    }
    if (chase.runs === target - 1) return 'Match tied';
    const r = target - 1 - chase.runs;
    return `${teamName(rec, first.battingTeam)} won by ${r} run${r === 1 ? '' : 's'}`;
  }
  if (chase && target !== null && ballsRemaining !== null) {
    const need = target - chase.runs;
    return `${teamName(rec, chase.battingTeam)} need ${need} run${need === 1 ? '' : 's'} from ${ballsRemaining} ball${ballsRemaining === 1 ? '' : 's'}`;
  }
  return rec.meta.toss;
}

export function summaryLine(state: MatchState): string {
  const inn = state.innings.at(-1);
  if (!inn) return `${state.teams[0].shortCode} v ${state.teams[1].shortCode}`;
  return `${inn.battingTeam} ${inn.runs}/${inn.wickets} (${inn.overs})`;
}

export function toSummary(state: MatchState, title: string): MatchSummary {
  return {
    id: state.matchId,
    title,
    teams: [state.teams[0].shortCode, state.teams[1].shortCode],
    format: state.format,
    phase: state.phase,
    statusText: state.statusText,
    scoreLine: summaryLine(state),
  };
}

/** Dismissal text in scorecard style; the fielder is picked deterministically from the bowling side. */
function dismissal(d: RecordedDelivery, fielders: string[]): string {
  const w = d.wicket;
  if (!w) return '';
  const fielder = fielders.length ? fielders[(d.batter.length + d.bowler.length) % fielders.length] : 'sub';
  switch (w.kind) {
    case 'bowled':
      return `b ${d.bowler}`;
    case 'lbw':
      return `lbw b ${d.bowler}`;
    case 'run out':
      return `run out (${fielder})`;
    default:
      return fielder === d.bowler ? `c & b ${d.bowler}` : `c ${fielder} b ${d.bowler}`;
  }
}

/** Full scorecard after the first `count` deliveries, for the mock provider's cards. */
export function buildScorecard(rec: Recording, count: number, now: number): Scorecard {
  const all = rec.deliveries.slice(0, Math.max(0, Math.min(count, rec.deliveries.length)));
  const first = rec.meta.battingFirst;
  const second = otherTeam(rec, first).shortCode;
  const innings: CardInnings[] = [];
  const state = buildState(rec, count, now);

  for (let i = 0; i <= (all.at(-1)?.inn ?? -1); i++) {
    const code = i === 0 ? first : second;
    const bowlCode = i === 0 ? second : first;
    const ds = all.filter((d) => d.inn === i);
    const lineup = rec.meta.squads?.[code]?.map((p) => p.name) ?? [];
    const fielders = rec.meta.squads?.[bowlCode]?.map((p) => p.name) ?? [];
    const order: string[] = [];
    const bat = new Map<string, { runs: number; balls: number; fours: number; sixes: number; out: string }>();
    const bowl = new Map<string, { balls: number; runs: number; wickets: number; wides: number; noBalls: number; overRuns: number[] }>();
    const extras = { total: 0, byes: 0, legByes: 0, wides: 0, noBalls: 0, penalty: 0 };
    const fow: FallOfWicket[] = [];
    const parts: CardPartnership[] = [];
    let pair = { a: '', aRuns: 0, b: '', bRuns: 0, runs: 0, balls: 0 };
    let runs = 0;
    let wkts = 0;
    let legal = 0;

    const seen = (n: string) => {
      if (!bat.has(n)) {
        bat.set(n, { runs: 0, balls: 0, fours: 0, sixes: 0, out: '' });
        order.push(n);
      }
    };
    for (const d of ds) {
      seen(d.batter);
      seen(d.nonStriker);
      if (!pair.a) pair = { a: d.batter, aRuns: 0, b: d.nonStriker, bRuns: 0, runs: 0, balls: 0 };
      if (pair.a !== d.batter && pair.b !== d.batter) {
        if (pair.a === '' || bat.get(pair.a)?.out) pair = { ...pair, a: d.batter, aRuns: 0 };
        else pair = { ...pair, b: d.batter, bRuns: 0 };
      }
      if (!pair.b && d.nonStriker !== pair.a) pair = { ...pair, b: d.nonStriker };
      const b = bat.get(d.batter)!;
      if (d.extraType !== 'wide') b.balls += 1;
      b.runs += d.runs;
      if (d.runs === 4) b.fours += 1;
      if (d.runs === 6) b.sixes += 1;
      const bw = bowl.get(d.bowler) ?? { balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, overRuns: [] };
      bowl.set(d.bowler, bw);
      const total = d.runs + d.extras;
      runs += total;
      pair.runs += total;
      if (pair.a === d.batter) pair.aRuns += d.runs;
      else pair.bRuns += d.runs;
      const over = Math.floor(bw.balls / 6);
      if (d.extraType === 'bye') extras.byes += d.extras;
      else if (d.extraType === 'legbye') extras.legByes += d.extras;
      else if (d.extraType === 'wide') {
        extras.wides += d.extras;
        bw.wides += d.extras;
      } else if (d.extraType === 'noball') {
        extras.noBalls += d.extras;
        bw.noBalls += d.extras;
      }
      extras.total += d.extras;
      const toBowler = d.extraType === 'bye' || d.extraType === 'legbye' ? d.runs : total;
      bw.runs += toBowler;
      bw.overRuns[over] = (bw.overRuns[over] ?? 0) + toBowler;
      if (isLegal(d)) {
        legal += 1;
        bw.balls += 1;
        pair.balls += 1;
      }
      if (d.wicket) {
        wkts += 1;
        const outName = d.wicket.player;
        const ob = bat.get(outName);
        if (ob) ob.out = dismissal({ ...d, batter: outName }, fielders);
        if (d.wicket.kind !== 'run out') bw.wickets += 1;
        fow.push({ wicket: wkts, runs, over: ballsToOvers(legal), player: outName });
        parts.push({ bat1: pair.a, bat1Runs: pair.aRuns, bat2: pair.b, bat2Runs: pair.bRuns, runs: pair.runs, balls: pair.balls });
        const survivor = outName === pair.a ? pair.b : pair.a;
        pair = { a: survivor, aRuns: 0, b: '', bRuns: 0, runs: 0, balls: 0 };
      }
    }
    if (pair.runs || pair.balls) parts.push({ bat1: pair.a, bat1Runs: pair.aRuns, bat2: pair.b, bat2Runs: pair.bRuns, runs: pair.runs, balls: pair.balls });

    const inningsOver = i < (all.at(-1)?.inn ?? 0) || state.phase === 'complete';
    const captain = lineup[0];
    const keeper = rec.meta.squads?.[code]?.find((p) => p.role.startsWith('WK'))?.name;
    innings.push({
      team: code,
      teamName: rec.meta.teams.find((t) => t.shortCode === code)?.name ?? code,
      runs,
      wickets: wkts,
      overs: ballsToOvers(legal),
      runRate: legal ? round2((runs / legal) * 6) : 0,
      batters: order.map((name) => {
        const b = bat.get(name)!;
        return {
          id: null,
          name,
          dismissal: b.out || (inningsOver ? 'not out' : 'batting'),
          status: b.out ? 'out' : inningsOver ? 'not out' : 'batting',
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          strikeRate: b.balls ? round2((b.runs / b.balls) * 100) : 0,
          captain: name === captain,
          keeper: name === keeper,
        };
      }),
      yetToBat: lineup.filter((n) => !bat.has(n)),
      bowlers: [...bowl.entries()].map(([name, b]) => ({
        id: null,
        name,
        overs: ballsToOvers(b.balls),
        maidens: b.overRuns.filter((r, o) => r === 0 && b.balls >= (o + 1) * 6).length,
        runs: b.runs,
        wickets: b.wickets,
        economy: b.balls ? round2((b.runs / b.balls) * 6) : 0,
        wides: b.wides,
        noBalls: b.noBalls,
      })),
      extras,
      fallOfWickets: fow,
      partnerships: parts,
    });
  }
  return { matchId: rec.meta.id, innings, updatedAt: now };
}

export function buildSquads(rec: Recording, now: number): Squads {
  return {
    matchId: rec.meta.id,
    updatedAt: now,
    teams: rec.meta.teams.map((t) => {
      const list = rec.meta.squads?.[t.shortCode] ?? [];
      return {
        code: t.shortCode,
        name: t.name,
        playingXI: list.map((p, i) => ({
          id: `${t.shortCode}-${i}`,
          name: p.name,
          role: p.role.replace(' (c)', ''),
          battingStyle: i % 3 === 1 ? 'Left-hand bat' : 'Right-hand bat',
          bowlingStyle: i >= 7 ? (i % 2 ? 'Right-arm fast' : 'Left-arm orthodox') : i === 5 ? 'Right-arm off break' : '',
          captain: i === 0,
          keeper: p.role.startsWith('WK'),
          imageUrl: null,
        })),
        bench: [],
      };
    }),
  };
}
