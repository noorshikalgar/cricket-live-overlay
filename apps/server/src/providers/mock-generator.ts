import type { Team } from '@cos/shared';
import type { ExtraType, RecordedDelivery, Recording } from './recording';

/** Small seeded PRNG (mulberry32) so the demo match is the same every time. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Side {
  team: Team;
  batters: string[];
  bowlers: string[];
}

const HOME: Side = {
  team: { name: 'Mumbai Mariners', shortCode: 'MUM', primaryColor: '#1D4ED8' },
  batters: [
    'Arjun Mehta',
    'Rohan Desai',
    'Kabir Shah',
    'Vikram Rao',
    'Ishaan Kulkarni',
    'Dev Patil',
    'Aman Joshi',
    'Siddharth Nair',
    'Harsh Gill',
    'Neel Pandey',
    'Om Bhatt',
  ],
  bowlers: ['Om Bhatt', 'Neel Pandey', 'Harsh Gill', 'Siddharth Nair', 'Dev Patil'],
};

const AWAY: Side = {
  team: { name: 'Chennai Chargers', shortCode: 'CHE', primaryColor: '#EAB308' },
  batters: [
    'Karthik Iyer',
    'Pranav Reddy',
    'Surya Menon',
    'Aditya Pillai',
    'Rahul Varma',
    'Naveen Kumar',
    'Ajay Swamy',
    'Manoj Raju',
    'Gokul Das',
    'Hari Prasad',
    'Vijay Selvan',
  ],
  bowlers: ['Vijay Selvan', 'Hari Prasad', 'Gokul Das', 'Manoj Raju', 'Naveen Kumar'],
};

type Outcome = { runs: number; extras: number; extraType?: ExtraType; wicket?: string };

function pick(r: () => number, pressure: number): Outcome {
  // pressure > 0 means a chase that needs quick runs: more boundaries, more wickets
  const x = r();
  const w = 0.042 + pressure * 0.02;
  const six = 0.055 + pressure * 0.03;
  const four = 0.115 + pressure * 0.02;
  let acc = 0;
  if (x < (acc += w)) {
    const kinds = ['bowled', 'caught', 'caught', 'caught', 'lbw', 'run out'];
    return { runs: 0, extras: 0, wicket: kinds[Math.floor(r() * kinds.length)] };
  }
  if (x < (acc += 0.03)) return { runs: 0, extras: 1, extraType: 'wide' };
  if (x < (acc += 0.007)) return { runs: r() < 0.3 ? 4 : 0, extras: 1, extraType: 'noball' };
  if (x < (acc += 0.012)) return { runs: 0, extras: 1, extraType: 'legbye' };
  if (x < (acc += six)) return { runs: 6, extras: 0 };
  if (x < (acc += four)) return { runs: 4, extras: 0 };
  if (x < (acc += 0.31)) return { runs: 0, extras: 0 };
  if (x < (acc += 0.09)) return { runs: 2, extras: 0 };
  if (x < (acc += 0.01)) return { runs: 3, extras: 0 };
  return { runs: 1, extras: 0 };
}

function playInnings(
  r: () => number,
  inn: number,
  bat: Side,
  bowl: Side,
  overs: number,
  target: number | null,
): { deliveries: RecordedDelivery[]; runs: number } {
  const out: RecordedDelivery[] = [];
  let striker = bat.batters[0];
  let non = bat.batters[1];
  let nextIn = 2;
  let runs = 0;
  let wickets = 0;
  const bowlerOvers = new Map<string, number>();
  let prevBowler = '';

  for (let over = 0; over < overs; over++) {
    const choices = bowl.bowlers.filter((b) => b !== prevBowler && (bowlerOvers.get(b) ?? 0) < Math.ceil(overs / 5));
    const bowler = choices[Math.floor(r() * choices.length)] ?? bowl.bowlers[0];
    bowlerOvers.set(bowler, (bowlerOvers.get(bowler) ?? 0) + 1);
    prevBowler = bowler;

    let legal = 0;
    while (legal < 6) {
      const ballsLeft = (overs - over) * 6 - legal;
      const pressure = target !== null ? Math.max(0, Math.min(1, ((target - runs) / Math.max(1, ballsLeft)) * 6 / 12 - 0.4)) : over >= overs - 4 ? 0.5 : 0;
      const o = pick(r, pressure);
      const d: RecordedDelivery = { inn, batter: striker, nonStriker: non, bowler, runs: o.runs, extras: o.extras };
      if (o.extraType) d.extraType = o.extraType;
      if (o.wicket) {
        const runOutNon = o.wicket === 'run out' && r() < 0.4;
        d.wicket = { player: runOutNon ? non : striker, kind: o.wicket };
      }
      out.push(d);
      runs += o.runs + o.extras;
      if (o.extraType !== 'wide' && o.extraType !== 'noball') legal += 1;

      // strike rotates on odd runs actually run (wides/leg byes count their extra minus the penalty run)
      const ran = o.extraType === 'wide' || o.extraType === 'noball' ? o.extras - 1 + o.runs : o.runs + o.extras;
      if (ran % 2 === 1 && o.runs !== 4 && o.runs !== 6) [striker, non] = [non, striker];

      if (d.wicket) {
        wickets += 1;
        if (wickets >= 10) return { deliveries: out, runs };
        const incoming = bat.batters[nextIn++];
        if (d.wicket.player === striker) striker = incoming;
        else non = incoming;
      }
      if (target !== null && runs >= target) return { deliveries: out, runs };
    }
    [striker, non] = [non, striker];
  }
  return { deliveries: out, runs };
}

function roleFor(i: number): string {
  if (i === 0) return 'Batter (c)';
  if (i < 5) return 'Batter';
  if (i === 5) return 'Batting Allrounder';
  if (i === 6) return 'WK-Batter';
  if (i === 7) return 'Bowling Allrounder';
  return 'Bowler';
}

export function generateRecording(seed = 20261003, overs = 20): Recording {
  const r = rng(seed);
  const first = playInnings(r, 0, HOME, AWAY, overs, null);
  const second = playInnings(r, 1, AWAY, HOME, overs, first.runs + 1);
  return {
    meta: {
      id: 'mock-t20',
      series: 'Demo Premier League · Match 12',
      venue: 'Harbour Oval, Mumbai',
      toss: `${HOME.team.name} won the toss and chose to bat`,
      format: 'T20',
      oversPerInnings: overs,
      teams: [HOME.team, AWAY.team],
      battingFirst: HOME.team.shortCode,
      squads: {
        [HOME.team.shortCode]: HOME.batters.map((name, i) => ({ name, role: roleFor(i) })),
        [AWAY.team.shortCode]: AWAY.batters.map((name, i) => ({ name, role: roleFor(i) })),
      },
    },
    deliveries: [...first.deliveries, ...second.deliveries],
  };
}
