import { ballsToOvers, round2, type CardBatter, type CardInnings, type Scorecard, type Squads } from '@cos/shared';
import { arr, num, obj, oversToBalls, str, type Json } from './http';

/**
 * Real /cricket/scorecard/{id} and /cricket/squads/{id} responses (seen 2026-10-03),
 * which differ from the docs: innings[].batsmen with out_desc ("batting" while in),
 * yet_to_bat names, bowlers with wides/no_balls, extras_detail, fall_of_wickets,
 * partnerships; squads is an array of { team_short, playing_xi[], bench[] }.
 */

/** "180/5 (62.4 ov)" → runs, wickets, balls */
function parseScore(s: string): { runs: number; wickets: number; balls: number } {
  const m = /(\d+)(?:\/(\d*))?\s*\(\s*([\d.]+)/.exec(s);
  if (!m) return { runs: 0, wickets: 0, balls: 0 };
  return { runs: Number(m[1]), wickets: m[2] ? Number(m[2]) : m[2] === '' ? 0 : 10, balls: oversToBalls(m[3]) };
}

function batter(b: Json): CardBatter {
  const out = str(b['out_desc']).trim();
  const lower = out.toLowerCase();
  const status: CardBatter['status'] = lower === 'batting' || lower === '' ? 'batting' : lower === 'not out' ? 'not out' : 'out';
  const runs = num(b['runs']);
  const balls = num(b['balls']);
  return {
    id: str(b['player_id']) || null,
    name: str(b['name']),
    dismissal: out || 'batting',
    status,
    runs,
    balls,
    fours: num(b['fours']),
    sixes: num(b['sixes']),
    strikeRate: num(b['strike_rate'], balls ? round2((runs / balls) * 100) : 0),
    captain: b['is_captain'] === true,
    keeper: b['is_keeper'] === true,
  };
}

export function mapScorecardReal(raw: unknown, matchId: string, now: number): Scorecard {
  const data = obj(obj(raw)['data']);
  const innings: CardInnings[] = arr(data['innings'])
    .map(obj)
    .map((i): CardInnings => {
      const sc = parseScore(str(i['score']));
      const ex = obj(i['extras_detail']);
      return {
        team: str(i['bat_team_short']) || str(i['bat_team']),
        teamName: str(i['bat_team']),
        runs: sc.runs,
        wickets: sc.wickets,
        overs: ballsToOvers(sc.balls),
        runRate: num(i['run_rate'], sc.balls ? round2((sc.runs / sc.balls) * 6) : 0),
        batters: arr(i['batsmen']).map(obj).map(batter),
        yetToBat: arr(i['yet_to_bat']).map((n) => str(n)).filter(Boolean),
        bowlers: arr(i['bowlers'])
          .map(obj)
          .map((b) => ({
            id: str(b['player_id']) || null,
            name: str(b['name']),
            overs: ballsToOvers(oversToBalls(str(b['overs'], '0'))),
            maidens: num(b['maidens']),
            runs: num(b['runs']),
            wickets: num(b['wickets']),
            economy: num(b['economy']),
            wides: num(b['wides']),
            noBalls: num(b['no_balls']),
          })),
        extras: {
          total: num(ex['total']),
          byes: num(ex['byes']),
          legByes: num(ex['leg_byes']),
          wides: num(ex['wides']),
          noBalls: num(ex['no_balls']),
          penalty: num(ex['penalty']),
        },
        fallOfWickets: arr(i['fall_of_wickets'])
          .map(obj)
          .map((f) => ({
            wicket: num(f['wkt_num']),
            runs: num(f['runs']),
            over: ballsToOvers(oversToBalls(str(f['over'], '0'))),
            player: str(f['player']),
          })),
        partnerships: arr(i['partnerships'])
          .map(obj)
          .map((p) => ({
            bat1: str(p['bat1_name']),
            bat1Runs: num(p['bat1_runs']),
            bat2: str(p['bat2_name']),
            bat2Runs: num(p['bat2_runs']),
            runs: num(p['total_runs']),
            balls: num(p['total_balls']),
          })),
      };
    });
  return { matchId, innings, updatedAt: now };
}

function styleLabel(s: string, kind: 'bat' | 'bowl'): string {
  const v = s.trim();
  if (!v) return '';
  if (kind === 'bat') return /^left/i.test(v) ? 'Left-hand bat' : /^right/i.test(v) ? 'Right-hand bat' : v;
  return v;
}

export function mapSquadsReal(raw: unknown, matchId: string, now: number): Squads {
  const player = (p: Json) => ({
    id: str(p['id']),
    name: str(p['name']),
    role: str(p['role']),
    battingStyle: styleLabel(str(p['batting_style']), 'bat'),
    bowlingStyle: styleLabel(str(p['bowling_style']), 'bowl'),
    captain: p['is_captain'] === true,
    keeper: p['is_keeper'] === true,
    imageUrl: str(p['player_image_url']) || null,
  });
  return {
    matchId,
    updatedAt: now,
    teams: arr(obj(raw)['data'])
      .map(obj)
      .map((t) => ({
        code: str(t['team_short']) || str(t['team_name']),
        name: str(t['team_name']),
        playingXI: arr(t['playing_xi']).map(obj).map(player),
        bench: arr(t['bench']).map(obj).map(player),
      })),
  };
}
