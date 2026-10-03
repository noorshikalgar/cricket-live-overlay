import type { MatchState } from '@cos/shared';

/** Shown on the Studio canvas when no match is selected, so layouts can be designed offline. */
export const SAMPLE_MATCH: MatchState = {
  matchId: 'sample',
  format: 'T20',
  phase: 'live',
  teams: [
    { name: 'Mumbai Mariners', shortCode: 'MUM', primaryColor: '#1D4ED8' },
    { name: 'Chennai Chargers', shortCode: 'CHE', primaryColor: '#EAB308' },
  ],
  innings: [
    { battingTeam: 'MUM', runs: 168, wickets: 7, overs: '20.0', balls: 120, runRate: 8.4 },
    { battingTeam: 'CHE', runs: 142, wickets: 4, overs: '17.2', balls: 104, runRate: 8.19 },
  ],
  batters: [
    { name: 'Rahul Varma', runs: 53, balls: 36, fours: 5, sixes: 2, strikeRate: 147.22, onStrike: true },
    { name: 'Naveen Kumar', runs: 31, balls: 22, fours: 2, sixes: 1, strikeRate: 140.91, onStrike: false },
  ],
  bowler: { name: 'Om Bhatt', overs: '3.2', maidens: 0, runs: 27, wickets: 2, economy: 8.1 },
  partnership: { runs: 61, balls: 40, contributions: [36, 25] },
  thisOver: [
    { kind: 'run', label: '1', runs: 1 },
    { kind: 'four', label: '4', runs: 4 },
    { kind: 'wide', label: 'wd', runs: 1 },
    { kind: 'dot', label: '•', runs: 0 },
  ],
  recentOvers: [7, 12, 4, 9, 15, 6],
  target: 169,
  requiredRunRate: 11.57,
  ballsRemaining: 16,
  statusText: 'Chennai Chargers need 27 runs from 16 balls',
  toss: 'Mumbai Mariners won the toss and chose to bat',
  venue: 'Harbour Oval, Mumbai',
  series: 'Demo Premier League · Match 12',
  lastUpdated: 0,
  isStale: false,
};
