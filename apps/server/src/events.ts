import type { Batter, MatchEvent, MatchEventType, MatchState } from '@cos/shared';

function figures(b: Batter): string {
  return `${b.name} · ${b.runs} (${b.balls})`;
}

/**
 * Diff two consecutive states and return the moments worth a banner.
 * `fired` holds keys of events already emitted, so a re-polled or repeated
 * state never fires the same moment twice.
 */
export function detectEvents(prev: MatchState | null, next: MatchState, fired: Set<string>, now = Date.now()): MatchEvent[] {
  if (!prev || prev.matchId !== next.matchId) return [];
  const out: MatchEvent[] = [];
  const emit = (key: string, type: MatchEventType, title: string, subtitle: string) => {
    if (fired.has(key)) return;
    fired.add(key);
    out.push({ id: key, type, title, subtitle, manual: false, at: now });
  };

  const idx = next.innings.length - 1;
  if (idx < 0) return out;

  if (next.innings.length > prev.innings.length && prev.innings.length > 0) {
    const ended = prev.innings.at(-1);
    const endedFinal = next.innings[prev.innings.length - 1] ?? ended;
    if (endedFinal) {
      emit(
        `INNINGS_END:${prev.innings.length - 1}`,
        'INNINGS_END',
        'INNINGS END',
        `${endedFinal.battingTeam} ${endedFinal.runs}/${endedFinal.wickets} (${endedFinal.overs})`,
      );
    }
  }

  if (next.phase === 'break' && prev.phase === 'live' && next.target !== null && prev.target === null) {
    const ended = next.innings[idx];
    emit(`INNINGS_END:${idx}`, 'INNINGS_END', 'INNINGS END', `${ended.battingTeam} ${ended.runs}/${ended.wickets} (${ended.overs})`);
  }

  const inn = next.innings[idx];
  const prevInn = prev.innings[idx];
  // events are only meaningful within the same innings; a fresh innings has no baseline
  const fromFeed = !!next.ballFeed && !!prev.ballFeed;
  if (fromFeed) {
    const seen = new Set(prev.ballFeed?.map((b) => b.id));
    // oldest first so queued banners play in match order
    for (const ball of [...(next.ballFeed ?? [])].reverse()) {
      if (seen.has(ball.id)) continue;
      const striker = next.batters.find((b) => b.name === ball.batter);
      const before = prev.batters.find((b) => b.name === ball.batter);
      const sub = striker ? figures(striker) : ball.batter;
      if (ball.kind === 'six') emit(`SIX:${ball.id}`, 'SIX', 'SIX', sub);
      else if (ball.kind === 'four') emit(`FOUR:${ball.id}`, 'FOUR', 'FOUR', sub);
      else if (ball.kind === 'wicket') emit(`WICKET:${ball.id}`, 'WICKET', 'WICKET', before ? figures(before) : ball.batter);
    }
  }

  if (prevInn) {
    const prevBatters = new Map(prev.batters.map((b) => [b.name, b]));

    for (const b of next.batters) {
      const pb = prevBatters.get(b.name);
      const pFours = pb?.fours ?? 0;
      const pSixes = pb?.sixes ?? 0;
      const pRuns = pb?.runs ?? 0;
      // a missed poll can hide several boundaries; fire one per boundary, keyed by the count
      if (!fromFeed) {
        for (let n = pSixes + 1; n <= b.sixes; n++) emit(`SIX:${idx}:${b.name}:${n}`, 'SIX', 'SIX', figures(b));
        for (let n = pFours + 1; n <= b.fours; n++) emit(`FOUR:${idx}:${b.name}:${n}`, 'FOUR', 'FOUR', figures(b));
      }
      if (pRuns < 100 && b.runs >= 100) emit(`HUNDRED:${idx}:${b.name}`, 'HUNDRED', 'HUNDRED', figures(b));
      else if (pRuns < 50 && b.runs >= 50) emit(`FIFTY:${idx}:${b.name}`, 'FIFTY', 'FIFTY', figures(b));
    }

    if (!fromFeed && inn.wickets > prevInn.wickets) {
      const stillIn = new Set(next.batters.map((b) => b.name));
      const out_ = prev.batters.find((b) => !stillIn.has(b.name));
      for (let w = prevInn.wickets + 1; w <= inn.wickets; w++) {
        emit(
          `WICKET:${idx}:${w}`,
          'WICKET',
          'WICKET',
          w === inn.wickets && out_ && next.batters.length > 0 ? figures(out_) : `${inn.battingTeam} ${inn.runs}/${inn.wickets}`,
        );
      }
    }

    const prevOvers = Math.floor(prevInn.balls / 6);
    const overs = Math.floor(inn.balls / 6);
    if (overs > prevOvers && inn.balls % 6 === 0) {
      const runsInOver = next.recentOvers.at(-1);
      emit(`OVER_END:${idx}:${overs}`, 'OVER_END', `END OF OVER ${overs}`, `${inn.battingTeam} ${inn.runs}/${inn.wickets}`);
      if (runsInOver === 0 && next.bowler) {
        emit(`MAIDEN:${idx}:${overs}`, 'MAIDEN', 'MAIDEN', `${next.bowler.name} · ${next.bowler.overs}-${next.bowler.maidens}-${next.bowler.runs}-${next.bowler.wickets}`);
      }
    }
  }

  if (next.phase === 'complete' && prev.phase !== 'complete') {
    if (next.innings.length === prev.innings.length) {
      emit(`INNINGS_END:${idx}`, 'INNINGS_END', 'INNINGS END', `${inn.battingTeam} ${inn.runs}/${inn.wickets} (${inn.overs})`);
    }
    emit(`MATCH_RESULT:${next.matchId}`, 'MATCH_RESULT', 'RESULT', next.statusText);
  }

  return out;
}

const MANUAL_TITLES: Record<MatchEventType, string> = {
  FOUR: 'FOUR',
  SIX: 'SIX',
  WICKET: 'WICKET',
  FIFTY: 'FIFTY',
  HUNDRED: 'HUNDRED',
  MAIDEN: 'MAIDEN',
  OVER_END: 'END OF OVER',
  INNINGS_END: 'INNINGS END',
  MATCH_RESULT: 'RESULT',
  DRS: 'DRS REVIEW',
  DRINKS: 'DRINKS BREAK',
  INNINGS_BREAK: 'INNINGS BREAK',
};

/** Event pad / hotkey trigger. Subtitle is filled from the live state when there is one. */
export function manualEvent(type: MatchEventType, state: MatchState | null, now = Date.now()): MatchEvent {
  let subtitle = '';
  const striker = state?.batters.find((b) => b.onStrike) ?? state?.batters[0];
  const inn = state?.innings.at(-1);
  if ((type === 'FOUR' || type === 'SIX' || type === 'FIFTY' || type === 'HUNDRED') && striker) subtitle = figures(striker);
  else if (type === 'WICKET' && inn) subtitle = `${inn.battingTeam} ${inn.runs}/${inn.wickets}`;
  else if (type === 'INNINGS_BREAK' || type === 'MATCH_RESULT') subtitle = state?.statusText ?? '';
  else if (type === 'DRS') subtitle = 'Decision pending';
  return { id: `manual:${type}:${now}`, type, title: MANUAL_TITLES[type], subtitle, manual: true, at: now };
}
