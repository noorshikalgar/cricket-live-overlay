import type { MatchState, Scorecard, Squads } from '@cos/shared';

/**
 * Who comes in next, in batting order: from the feed when it says, else the
 * scorecard's "yet to bat", else the batting side's playing XI. Anyone at the
 * crease, already out or just dismissed is left out.
 */
export function nextBatters(m: MatchState | null, scorecard: Scorecard | null, squads: Squads | null): string[] {
  if (!m) return [];
  const inn = m.innings.at(-1);
  const card = scorecard?.innings.find((i, idx, all) => idx === all.length - 1 && i.team === inn?.battingTeam);
  const gone = new Set<string>([
    ...m.batters.map((b) => b.name),
    ...(m.lastWicket?.batter ? [m.lastWicket.batter] : []),
    ...(card?.batters.map((b) => b.name) ?? []),
  ]);
  let list = m.yetToBat ?? card?.yetToBat;
  if (!list?.length) {
    const team = squads?.teams.find((t) => t.code === inn?.battingTeam);
    list = team?.playingXI.map((p) => p.name) ?? [];
  }
  return list.filter((n) => !gone.has(n));
}

/** "Surya Menon 18 (16)": the last dismissal in one short line */
export function lastWicketLine(m: MatchState | null): string {
  const w = m?.lastWicket;
  if (!w?.batter) return '';
  return w.runs !== null ? `${w.batter} ${w.runs} (${w.balls})` : w.batter;
}
