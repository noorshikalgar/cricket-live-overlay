import type { ResolvedStyle, ThemeId, WidgetStyle } from './scene';

export interface ThemeDef {
  id: ThemeId;
  label: string;
  tokens: Omit<ResolvedStyle, 'title' | 'showTitle'>;
  /** accent follows the batting team's colour */
  accentFromTeam: boolean;
}

const night: ThemeDef = {
  id: 'night',
  label: 'Night',
  accentFromTeam: false,
  tokens: {
    bg: '#0B0F17',
    bgOpacity: 0.78,
    blur: 12,
    text: '#F5F7FA',
    textMuted: '#9AA4B2',
    accent: '#22C55E',
    fontFamily: 'Inter',
    fontScale: 1,
    radius: 10,
    padding: 16,
    border: { width: 0, color: '#FFFFFF' },
    shadow: 'soft',
    chipBg: 'rgba(255,255,255,0.08)',
    four: '#3B82F6',
    six: '#A855F7',
    wicket: '#EF4444',
  },
};

const clean: ThemeDef = {
  id: 'clean',
  label: 'Clean',
  accentFromTeam: false,
  tokens: {
    ...night.tokens,
    bg: '#FFFFFF',
    bgOpacity: 0.94,
    blur: 8,
    text: '#0B0F17',
    textMuted: '#5B6573',
    accent: '#16A34A',
    chipBg: 'rgba(11,15,23,0.07)',
    border: { width: 0, color: '#0B0F17' },
  },
};

const team: ThemeDef = {
  id: 'team',
  label: 'Team',
  accentFromTeam: true,
  tokens: { ...night.tokens },
};

export const THEMES: Record<ThemeId, ThemeDef> = { night, clean, team };

/** Merge theme tokens with a widget's overrides. */
export function resolveStyle(style: WidgetStyle, themeId: ThemeId, teamColor: string | null): ResolvedStyle {
  const theme = THEMES[themeId] ?? night;
  const t = theme.tokens;
  const themeAccent = theme.accentFromTeam && teamColor ? teamColor : t.accent;
  return {
    ...t,
    title: style.title ?? '',
    showTitle: style.showTitle,
    bg: style.bg ?? t.bg,
    bgOpacity: style.bgOpacity ?? t.bgOpacity,
    blur: style.blur ?? t.blur,
    text: style.text ?? t.text,
    accent: style.accent ?? themeAccent,
    fontFamily: style.fontFamily ?? t.fontFamily,
    fontScale: style.fontScale ?? t.fontScale,
    radius: style.radius ?? t.radius,
    padding: style.padding ?? t.padding,
    border: style.border ?? t.border,
    shadow: style.shadow ?? t.shadow,
  };
}

/** "#0B0F17" + 0.78 → "rgba(11, 15, 23, 0.78)" */
export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Pick black or white text for a solid background colour. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#F5F7FA';
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? '#0B0F17' : '#F5F7FA';
}
