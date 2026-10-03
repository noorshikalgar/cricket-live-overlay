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
  | 'clock'
  | 'timer'
  | 'scorecard'
  | 'teamCard'
  | 'playerCard';

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

export type BackgroundKind = 'transparent' | 'pitch' | 'color' | 'gradient' | 'image';

/** What sits behind the widgets on air. Transparent lets the OBS sources below show through. */
export interface SceneBackground {
  kind: BackgroundKind;
  color: string;
  /** gradient end colour */
  color2: string;
  /** uploaded image URL */
  image: string;
  /** 0–0.8 black overlay so widgets stay legible over busy images */
  dim: number;
}

export const DEFAULT_BACKGROUND: SceneBackground = {
  kind: 'transparent',
  color: '#0B0F17',
  color2: '#1D4ED8',
  image: '',
  dim: 0,
};

export const BACKGROUND_KINDS: { value: BackgroundKind; label: string }[] = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'pitch', label: 'Sample pitch' },
  { value: 'color', label: 'Solid colour' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Image' },
];

export type TransitionKind = 'glide' | 'fade' | 'slide' | 'zoom' | 'wipe' | 'stinger' | 'cut';

/** How the Output switches TO this scene. */
export interface SceneTransition {
  kind: TransitionKind;
  /** stinger panel colour; empty = theme accent */
  color: string;
  /** seconds for the whole switch, before the global speed multiplier */
  duration: number;
  /** stinger only: show the scene name on the panel */
  showName: boolean;
}

export const DEFAULT_TRANSITION: SceneTransition = { kind: 'glide', color: '', duration: 0.8, showName: true };

export const TRANSITION_KINDS: { value: TransitionKind; label: string }[] = [
  { value: 'glide', label: 'Glide (shared widgets move)' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'wipe', label: 'Wipe' },
  { value: 'stinger', label: 'Stinger (colour sweep)' },
  { value: 'cut', label: 'Cut (instant)' },
];

export type PointerStyle = 'dot' | 'ring' | 'ball' | 'bat';

/** On-air pointer, driven live from the Studio canvas. */
export interface ScenePointer {
  enabled: boolean;
  style: PointerStyle;
  color: string;
  /** diameter in canvas px */
  size: number;
  /** fading trail + speed stretch */
  motionBlur: boolean;
}

export const DEFAULT_POINTER: ScenePointer = { enabled: false, style: 'dot', color: '#EF4444', size: 34, motionBlur: true };

export const POINTER_STYLES: { value: PointerStyle; label: string }[] = [
  { value: 'dot', label: 'Dot' },
  { value: 'ring', label: 'Laser ring' },
  { value: 'ball', label: 'Cricket ball' },
  { value: 'bat', label: 'Bat' },
];

export interface Scene {
  id: string;
  name: string;
  canvas: { w: number; h: number };
  theme: ThemeId;
  /** missing on older scenes = transparent */
  background?: SceneBackground;
  /** missing on older scenes = glide */
  transition?: SceneTransition;
  /** missing on older scenes = off */
  pointer?: ScenePointer;
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
  /** auto = poll on a timer; manual = only when "Update now" is pressed */
  pollMode: 'auto' | 'manual';
  /** auto interval in seconds; null = .env POLL_SECONDS, 0 = spread the budget over a match */
  pollSeconds: number | null;
  /** paused: no automatic API calls at all (breaks); "Update now" still works */
  pollPaused: boolean;
  /** emergency blackout: the Output shows only a black screen with the message */
  blackout: boolean;
  blackoutText: string;
  blackoutSubtext: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  activeSceneId: null,
  selectedMatchId: null,
  reduceMotion: false,
  speed: 1,
  obsBridge: false,
  pollMode: 'auto',
  pollSeconds: null,
  pollPaused: false,
  blackout: false,
  blackoutText: "We'll be right back",
  blackoutSubtext: '',
};

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function summarize(scene: Scene): SceneSummary {
  return { id: scene.id, name: scene.name, updatedAt: scene.updatedAt };
}
