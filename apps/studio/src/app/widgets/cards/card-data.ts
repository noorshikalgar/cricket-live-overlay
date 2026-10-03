import type { CardBatter, CardBowler, MatchState, Scorecard, Squads, SquadPlayer, TeamSquad } from '@cos/shared';

/** Loose name match across sources ("Dithole" ↔ "Tshepang Dithole"). */
export function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === y) return true;
  const lx = x.split(/\s+/).at(-1);
  const ly = y.split(/\s+/).at(-1);
  return !!lx && lx === ly && (x.includes(y) || y.includes(x));
}

/** Squad team for a code or full name, as used by match state / scorecard. */
export function findTeam(squads: Squads | null, codeOrName: string): TeamSquad | null {
  if (!squads) return null;
  return (
    squads.teams.find(
      (t) => t.code.toLowerCase() === codeOrName.toLowerCase() || t.name === codeOrName || sameName(t.name, codeOrName),
    ) ?? null
  );
}

export interface PlayerMatchLine {
  batting: CardBatter | null;
  bowling: CardBowler | null;
}

/** This match's batting and bowling figures for a player, latest innings first. */
export function playerFigures(scorecard: Scorecard | null, id: string, name: string): PlayerMatchLine {
  const out: PlayerMatchLine = { batting: null, bowling: null };
  for (const inn of [...(scorecard?.innings ?? [])].reverse()) {
    const match = (p: { id: string | null; name: string }) => (id && p.id === id) || sameName(p.name, name);
    out.batting ??= inn.batters.find(match) ?? null;
    out.bowling ??= inn.bowlers.find(match) ?? null;
  }
  return out;
}

/** A player from the squads by id or name; falls back to what the live state knows. */
export function findPlayer(squads: Squads | null, id: string, name: string): { player: SquadPlayer; team: TeamSquad } | null {
  for (const team of squads?.teams ?? []) {
    const player = team.playingXI.find((p) => (id && p.id === id) || sameName(p.name, name)) ??
      team.bench.find((p) => (id && p.id === id) || sameName(p.name, name));
    if (player) return { player, team };
  }
  return null;
}

export function teamColorFor(match: MatchState | null, codeOrName: string): string | null {
  return match?.teams.find((t) => t.shortCode === codeOrName || t.name === codeOrName || sameName(t.name, codeOrName))?.primaryColor ?? null;
}
