import type { MatchState, Squads } from '@cos/shared';

export type PlayerImageSource = 'avatar' | 'photo';

/** Local URL for a player's image (served and cached by our server, never hotlinked). */
export function playerImageUrl(name: string, color: string | null, role: string, source: PlayerImageSource): string {
  const q = new URLSearchParams({ name, color: (color ?? '#1D4ED8').replace('#', ''), role, source });
  return `/api/players/image?${q.toString()}`;
}

/** Role text for the avatar badge: from the playing XI when loaded, else from what they're doing now. */
export function playerRole(squads: Squads | null, name: string, fallback: 'bat' | 'bowl'): string {
  const last = name.toLowerCase().split(/\s+/).at(-1) ?? '';
  for (const t of squads?.teams ?? []) {
    const p = t.playingXI.find((x) => x.name === name || x.name.toLowerCase().split(/\s+/).at(-1) === last);
    if (p) return p.keeper ? 'wk' : p.role;
  }
  return fallback;
}

/** Colour of the team a player is batting or bowling for. */
export function sideColor(m: MatchState | null, side: 'batting' | 'bowling'): string | null {
  if (!m) return null;
  const inn = m.innings.at(-1);
  const bat = m.teams.find((t) => t.shortCode === inn?.battingTeam) ?? m.teams[0];
  const other = m.teams.find((t) => t !== bat) ?? m.teams[1];
  return (side === 'batting' ? bat : other)?.primaryColor ?? null;
}
