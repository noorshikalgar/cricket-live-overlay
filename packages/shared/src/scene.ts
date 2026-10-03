export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

export type WidgetType =
  | 'scorebug'
  | 'batters'
  | 'bowler'
  | 'thisOver'
  | 'partnership'
  | 'recentOvers'
  | 'matchInfo'
  | 'banner'
  | 'ticker'
  | 'camera'
  | 'text'
  | 'image'
  | 'clock';

export type AnimPreset = 'none' | 'fade' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'wipe';

export const ANIM_PRESETS: readonly AnimPreset[] = [
  'none',
  'fade',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'wipe',
];

export type ThemeId = 'night' | 'clean' | 'team';

export type FontFamily = 'Inter' | 'Barlow Condensed';

/**
 * Per-widget look. Every value field is optional: unset means "inherit from the
 * scene theme", so switching theme restyles everything the user hasn't touched.
 */
export interface WidgetStyle {
  title?: string;
  showTitle: boolean;
  bg?: string;
  bgOpacity?: number;
  blur?: number;
  text?: string;
  accent?: string;
  fontFamily?: FontFamily;
  fontScale?: number;
  radius?: number;
  padding?: number;
  border?: { width: number; color: string };
  shadow?: 'none' | 'soft';
}

/** WidgetStyle with every field filled in from the theme. */
export interface ResolvedStyle {
  title: string;
  showTitle: boolean;
  bg: string;
  bgOpacity: number;
  blur: number;
  text: string;
  textMuted: string;
  accent: string;
  fontFamily: FontFamily;
  fontScale: number;
  radius: number;
  padding: number;
  border: { width: number; color: string };
  shadow: 'none' | 'soft';
  chipBg: string;
  four: string;
  six: string;
  wicket: string;
}

export interface WidgetAnimation {
  enter: AnimPreset;
  exit: AnimPreset;
  /** ms */
  delay: number;
}

export type PropValue = string | number | boolean | null | string[] | Record<string, boolean>;

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
  locked: boolean;
  /** user-facing layer name */
  name: string;
  style: WidgetStyle;
  props: Record<string, PropValue>;
  animation: WidgetAnimation;
}

export interface Scene {
  id: string;
  name: string;
  canvas: { w: number; h: number };
  theme: ThemeId;
  widgets: WidgetInstance[];
  updatedAt: number;
}

export interface SceneSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface AppSettings {
  activeSceneId: string | null;
  selectedMatchId: string | null;
  reduceMotion: boolean;
  /** animation speed multiplier, 0.5 – 2 */
  speed: number;
  obsBridge: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeSceneId: null,
  selectedMatchId: null,
  reduceMotion: false,
  speed: 1,
  obsBridge: false,
};

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function summarize(scene: Scene): SceneSummary {
  return { id: scene.id, name: scene.name, updatedAt: scene.updatedAt };
}
