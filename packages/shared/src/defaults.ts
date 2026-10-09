import type { MatchEventType } from './match';
import {
  CANVAS_H,
  CANVAS_W,
  newId,
  type PropValue,
  type Scene,
  type WidgetAnimation,
  type WidgetInstance,
  type WidgetStyle,
  type WidgetType,
} from './scene';

export interface WidgetDefaults {
  label: string;
  /** short glyph shown in the widget library */
  icon: string;
  w: number;
  h: number;
  props: Record<string, PropValue>;
  style?: Partial<WidgetStyle>;
  animation?: Partial<WidgetAnimation>;
}

export const AUTO_FIRE_EVENTS: readonly MatchEventType[] = [
  'FOUR',
  'SIX',
  'WICKET',
  'FIFTY',
  'HUNDRED',
  'MAIDEN',
  'INNINGS_END',
  'MATCH_RESULT',
  'DRS',
  'DRINKS',
  'INNINGS_BREAK',
];

export const WIDGET_DEFAULTS: Record<WidgetType, WidgetDefaults> = {
  scorebug: {
    label: 'Score bug',
    icon: '▤',
    w: 760,
    h: 96,
    props: { layout: 'wide', showTeamColors: true, showRunRate: true, showChase: true, showLive: true },
  },
  batters: {
    label: 'Batters',
    icon: '⚲',
    w: 560,
    h: 96,
    props: { showStrikeRate: false, showBoundaries: true },
  },
  bowler: {
    label: 'Bowler',
    icon: '◎',
    w: 440,
    h: 96,
    props: { showEconomy: true, showMaidens: false },
  },
  thisOver: {
    label: 'This over',
    icon: '●',
    w: 520,
    h: 72,
    props: { chipStyle: 'filled', showLabel: true },
  },
  partnership: {
    label: 'Partnership',
    icon: '⇄',
    w: 460,
    h: 110,
    props: { showBar: true },
  },
  recentOvers: {
    label: 'Recent overs',
    icon: '▥',
    w: 460,
    h: 170,
    props: { mode: 'bars' },
  },
  matchInfo: {
    label: 'Match info',
    icon: 'ℹ',
    w: 640,
    h: 190,
    props: { lines: { series: true, venue: true, toss: true, status: true }, layout: 'auto', labels: 'side', align: 'left', showTeams: true },
  },
  banner: {
    label: 'Event banner',
    icon: '★',
    w: 1080,
    h: 200,
    props: {
      autoFire: Object.fromEntries(AUTO_FIRE_EVENTS.map((e) => [e, e !== 'MAIDEN'])),
      duration: 2.5,
      direction: 'left',
      showSubtitle: true,
      look: 'blast',
    },
    style: { fontFamily: 'Barlow Condensed' },
    animation: { enter: 'none', exit: 'none' },
  },
  ticker: {
    label: 'Ticker',
    icon: '⇢',
    w: 1920,
    h: 56,
    props: { source: 'matches', text: 'Welcome to the stream · Like and subscribe', speed: 90, label: 'LIVE SCORES' },
    style: { radius: 0 },
  },
  camera: {
    label: 'Camera frame',
    icon: '◉',
    w: 400,
    h: 400,
    props: { shape: 'rounded', showPlate: true, label: 'Your Name', sublabel: 'Commentary', frameWidth: 4 },
  },
  text: {
    label: 'Text / Title',
    icon: 'T',
    w: 420,
    h: 64,
    props: { text: 'LIVE COMMENTARY', align: 'left', uppercase: true, panel: true, size: 26, liveDot: false },
  },
  image: {
    label: 'Image / Logo',
    icon: '▣',
    w: 200,
    h: 200,
    props: { src: '', fit: 'contain', panel: false },
  },
  scorecard: {
    label: 'Full scorecard',
    icon: '☰',
    w: 1240,
    h: 780,
    props: {
      innings: 'current',
      showBatting: true,
      showBowling: true,
      dismissal: 'under',
      showYetToBat: true,
      showFow: true,
      minimized: false,
      display: 'window',
    },
    animation: { enter: 'slideUp', exit: 'fade' },
  },
  teamCard: {
    label: 'Team card',
    icon: '⛨',
    w: 560,
    h: 760,
    props: { side: 'batting', showRoles: true, showScores: true, minimized: false, display: 'window' },
    animation: { enter: 'slideRight', exit: 'fade' },
  },
  playerCard: {
    label: 'Player card',
    icon: '☺',
    w: 620,
    h: 330,
    props: { playerId: '', playerName: '', showPhoto: false, minimized: false, display: 'window' },
    animation: { enter: 'slideUp', exit: 'fade' },
  },
  playerPanel: {
    label: 'Player panel',
    icon: '◪',
    w: 540,
    h: 230,
    props: { slot: 'striker', playerName: '', showImage: true, showFooter: true },
    style: { radius: 10 },
  },
  scoreHeader: {
    label: 'Score header',
    icon: '▬',
    w: 1600,
    h: 230,
    props: { centerText: '', showEvents: true },
  },
  oversStrip: {
    label: 'Overs strip',
    icon: '⋯',
    w: 1600,
    h: 80,
    props: { showPrevious: true, label: '' },
  },
  chaseBox: {
    label: 'Chase box',
    icon: '⇆',
    w: 420,
    h: 220,
    props: { showProjection: true },
  },
  statBar: {
    label: 'Stat bar',
    icon: '≡',
    w: 1600,
    h: 64,
    props: { showStatus: true },
  },
  video: {
    label: 'Video',
    icon: '▶',
    w: 640,
    h: 360,
    props: { src: '', fit: 'cover', loop: true, muted: true, playing: true, startedAt: null, panel: false },
  },
  timer: {
    label: 'Timer',
    icon: '⏱',
    w: 600,
    h: 240,
    props: {
      title: 'STARTING IN',
      mode: 'duration',
      target: '19:30',
      minutes: 5,
      startedAt: null,
      elapsed: 0,
      endText: 'STARTING NOW',
      panel: true,
    },
  },
  clock: {
    label: 'Clock',
    icon: '◷',
    w: 260,
    h: 80,
    props: { mode: 'time', target: '19:30', label: 'STARTS IN', hour24: true },
  },
};

export const WIDGET_TYPES = Object.keys(WIDGET_DEFAULTS) as WidgetType[];

export function createWidget(type: WidgetType, over: Partial<WidgetInstance> = {}): WidgetInstance {
  const d = WIDGET_DEFAULTS[type];
  return {
    id: newId(),
    type,
    x: Math.round((CANVAS_W - d.w) / 2),
    y: Math.round((CANVAS_H - d.h) / 2),
    w: d.w,
    h: d.h,
    z: 1,
    visible: true,
    locked: false,
    name: d.label,
    style: { showTitle: false, ...d.style },
    props: structuredClone(d.props),
    animation: { enter: 'slideUp', exit: 'fade', delay: 0, ...d.animation },
    ...over,
  };
}

function scene(name: string, widgets: WidgetInstance[]): Scene {
  return {
    id: newId(),
    name,
    canvas: { w: CANVAS_W, h: CANVAS_H },
    theme: 'night',
    widgets: widgets.map((w, i) => ({ ...w, z: i + 1 })),
    updatedAt: Date.now(),
  };
}

/** A bold broadcast layout (score header, stat bar, overs strip, player panels, chase box). */
export function createBroadcastScene(name = 'Broadcast'): Scene {
  return scene(name, [
    createWidget('scoreHeader', { x: 160, y: 12 }),
    createWidget('statBar', { x: 160, y: 250 }),
    createWidget('oversStrip', { x: 160, y: 322, props: { ...WIDGET_DEFAULTS.oversStrip.props, label: 'LIVE' } }),
    createWidget('chaseBox', { x: 1340, y: 610 }),
    createWidget('playerPanel', { x: 160, y: 836, props: { ...WIDGET_DEFAULTS.playerPanel.props, slot: 'striker' } }),
    createWidget('playerPanel', { x: 712, y: 836, props: { ...WIDGET_DEFAULTS.playerPanel.props, slot: 'nonStriker' } }),
    createWidget('playerPanel', { x: 1264, y: 836, w: 496, props: { ...WIDGET_DEFAULTS.playerPanel.props, slot: 'bowler' } }),
    createWidget('banner', { x: 420, y: 480 }),
  ]);
}

/** The three starter scenes created on first run. */
export function createStarterScenes(): Scene[] {
  const innings = scene('Innings', [
    createWidget('text', { x: 64, y: 48 }),
    createWidget('thisOver', { x: 64, y: 848 }),
    createWidget('scorebug', { x: 64, y: 936 }),
    createWidget('batters', { x: 840, y: 936 }),
    createWidget('bowler', { x: 1416, y: 936 }),
    createWidget('camera', { x: 1456, y: 456, w: 400, h: 400 }),
    createWidget('banner', { x: 360, y: 360 }),
  ]);
  const brk = scene('Break', [
    createWidget('text', { x: 64, y: 48, props: { ...WIDGET_DEFAULTS.text.props, text: 'INNINGS BREAK' } }),
    createWidget('matchInfo', { x: 64, y: 600 }),
    createWidget('partnership', { x: 720, y: 600, w: 460 }),
    createWidget('recentOvers', { x: 720, y: 726, w: 460 }),
    createWidget('scorebug', { x: 64, y: 936 }),
    createWidget('camera', { x: 1216, y: 140, w: 640, h: 640, props: { ...WIDGET_DEFAULTS.camera.props } }),
    createWidget('ticker', { x: 0, y: 1024 }),
  ]);
  const face = scene('Face-cam full', [
    createWidget('camera', {
      x: 160,
      y: 90,
      w: 1600,
      h: 820,
      props: { ...WIDGET_DEFAULTS.camera.props, shape: 'rounded' },
    }),
    createWidget('scorebug', { x: 160, y: 950, w: 520, props: { ...WIDGET_DEFAULTS.scorebug.props, layout: 'compact' } }),
    createWidget('thisOver', { x: 696, y: 962 }),
    createWidget('banner', { x: 360, y: 360 }),
  ]);
  return [innings, brk, face];
}
