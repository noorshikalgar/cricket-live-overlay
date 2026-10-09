import type { Type } from '@angular/core';
import { AUTO_FIRE_EVENTS, WIDGET_DEFAULTS, type ClientMessage, type PropValue, type WidgetType } from '@cos/shared';
import { BannerWidget } from './banner/banner.widget';
import { BattersWidget } from './batters/batters.widget';
import { BowlerWidget } from './bowler/bowler.widget';
import { CameraWidget } from './camera/camera.widget';
import { PlayerCardWidget } from './cards/player-card.widget';
import { TeamCardWidget } from './cards/team-card.widget';
import { ClockWidget } from './clock/clock.widget';
import { ScorecardWidget } from './scorecard/scorecard.widget';
import { ImageWidget } from './image/image.widget';
import { MatchInfoWidget } from './match-info/match-info.widget';
import { PartnershipWidget } from './partnership/partnership.widget';
import { RecentOversWidget } from './recent-overs/recent-overs.widget';
import { ScorebugWidget } from './scorebug/scorebug.widget';
import { TextWidget } from './text/text.widget';
import { ThisOverWidget } from './this-over/this-over.widget';
import { TickerWidget } from './ticker/ticker.widget';
import { TimerWidget, formatClock, timerValue, type TimerProps } from './timer/timer.widget';
import { ChaseBoxWidget } from './broadcast/chase-box.widget';
import { OversStripWidget } from './broadcast/overs-strip.widget';
import { PlayerPanelWidget } from './broadcast/player-panel.widget';
import { ScoreHeaderWidget } from './broadcast/score-header.widget';
import { StatBarWidget } from './broadcast/stat-bar.widget';
import { InfoRailWidget, RAIL_SLIDES } from './broadcast/info-rail.widget';
import { VideoWidget } from './video/video.widget';

export interface SelectOption {
  value: string;
  label: string;
}

type Props = Record<string, PropValue>;

/** Inspector sections for widget fields, in display order. */
export const FIELD_GROUPS = ['Content', 'Behaviour', 'Appearance', 'Window'] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

/** Shared by every field: an optional sub-section and a condition for showing it. */
interface FieldExtras {
  /** the section the field sits in; every widget uses the same sections, in the same order (default Content) */
  group?: FieldGroup;
  /** hide the field unless this returns true for the widget's current props */
  showIf?: (props: Props) => boolean;
}

/** One settings control. `key` is the prop name (or style key) it edits. */
export type FieldDef = FieldExtras &
  (
  | { kind: 'text'; key: string; label: string; placeholder?: string; multiline?: boolean }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: SelectOption[] }
  | { kind: 'color'; key: string; label: string }
  | { kind: 'image'; key: string; label: string }
  | { kind: 'video'; key: string; label: string }
  | { kind: 'checks'; key: string; label: string; options: SelectOption[] }
  );

/** What an action button can see and do: the widget's props, and the ways to change things. */
export interface ActionContext {
  props: Props;
  /** ticks every 250 ms while the panel is open, for live readouts */
  now: number;
  update(patch: Props, coalesceKey?: string): void;
  send(msg: ClientMessage): void;
  hasSquads: boolean;
}

/** A button in the widget's settings, declared next to its fields (timer start, video restart…). */
export interface WidgetAction {
  id: string;
  label: (c: ActionContext) => string;
  title?: string;
  primary?: (c: ActionContext) => boolean;
  when?: (c: ActionContext) => boolean;
  run: (c: ActionContext) => void;
}

export interface WidgetDef {
  type: WidgetType;
  label: string;
  icon: string;
  description: string;
  component: Type<unknown>;
  settingsSchema: FieldDef[];
  actions?: WidgetAction[];
  /** big live value shown above the actions (e.g. the timer's clock) */
  readout?: (c: ActionContext) => string;
}

const opts = (...pairs: [string, string][]): SelectOption[] => pairs.map(([value, label]) => ({ value, label }));

const EVENT_LABELS: Record<string, string> = {
  FOUR: 'Four',
  SIX: 'Six',
  WICKET: 'Wicket',
  FIFTY: 'Fifty',
  HUNDRED: 'Hundred',
  MAIDEN: 'Maiden',
  INNINGS_END: 'Innings end',
  MATCH_RESULT: 'Result',
  DRS: 'DRS',
  DRINKS: 'Drinks',
  INNINGS_BREAK: 'Innings break',
};

function def(
  type: WidgetType,
  component: Type<unknown>,
  description: string,
  settingsSchema: FieldDef[],
  extra: Pick<WidgetDef, 'actions' | 'readout'> = {},
): WidgetDef {
  const d = WIDGET_DEFAULTS[type];
  return { type, label: d.label, icon: d.icon, description, component, settingsSchema, ...extra };
}

const timerProps = (c: ActionContext) => c.props as unknown as TimerProps;

const TIMER_ACTIONS: WidgetAction[] = [
  {
    id: 'start',
    label: (c) => (c.props['elapsed'] ? '▶ Resume' : '▶ Start'),
    primary: () => true,
    when: (c) => !c.props['startedAt'],
    run: (c) => {
      // a finished countdown starts over
      const v = timerValue(timerProps(c), Date.now());
      c.update({ startedAt: Date.now(), elapsed: v.done ? 0 : Number(c.props['elapsed']) || 0 });
    },
  },
  {
    id: 'pause',
    label: () => '⏸ Pause',
    when: (c) => !!c.props['startedAt'],
    run: (c) => {
      const started = Number(c.props['startedAt']) || Date.now();
      c.update({ startedAt: null, elapsed: (Number(c.props['elapsed']) || 0) + (Date.now() - started) });
    },
  },
  { id: 'reset', label: () => '↺ Reset', run: (c) => c.update({ startedAt: null, elapsed: 0 }) },
  {
    id: 'add',
    label: () => '+1m',
    title: 'Add a minute',
    when: (c) => c.props['mode'] === 'duration',
    run: (c) => c.update({ minutes: (Number(c.props['minutes']) || 0) + 1 }, 'timer-add'),
  },
];

const CARD_ACTIONS: WidgetAction[] = [
  {
    id: 'reload',
    label: () => '⟳ Reload card data',
    title: 'Fetch fresh card data (1 API call)',
    run: (c) => {
      c.send({ type: 'cards:fetch', kind: 'scorecard', force: true });
      if (!c.hasSquads) c.send({ type: 'cards:fetch', kind: 'squads', force: true });
    },
  },
];

const VIDEO_ACTIONS: WidgetAction[] = [
  {
    id: 'play',
    label: (c) => (c.props['playing'] === false ? '▶ Play' : '⏸ Pause'),
    primary: (c) => c.props['playing'] === false,
    run: (c) => c.update({ playing: c.props['playing'] === false }),
  },
  { id: 'restart', label: () => '⏮ Restart', run: (c) => c.update({ startedAt: Date.now(), playing: true }) },
  {
    id: 'mute',
    label: (c) => (c.props['muted'] === false ? '🔇 Mute' : '🔊 Unmute'),
    title: 'Sound plays from the OBS Browser Source (enable "Control audio via OBS")',
    run: (c) => c.update({ muted: c.props['muted'] === false }),
  },
];

/**
 * type → component, label, settings. Adding a widget = one folder + one entry
 * here + its defaults in packages/shared/src/defaults.ts.
 */
export const WIDGET_REGISTRY: Record<WidgetType, WidgetDef> = {
  scorebug: def('scorebug', ScorebugWidget, 'Team, score, overs, run rate and chase', [
    { kind: 'select', key: 'layout', group: 'Appearance', label: 'Layout', options: opts(['wide', 'Wide'], ['compact', 'Compact']) },
    { kind: 'toggle', key: 'showTeamColors', label: 'Team colour strip' },
    { kind: 'toggle', key: 'showRunRate', label: 'Run rate' },
    { kind: 'toggle', key: 'showChase', label: 'Chase equation' },
    { kind: 'toggle', key: 'showLive', label: 'Live dot' },
  ]),
  batters: def('batters', BattersWidget, 'Both batters, runs (balls), boundaries', [
    { kind: 'toggle', key: 'showBoundaries', label: 'Fours and sixes' },
    { kind: 'toggle', key: 'showStrikeRate', label: 'Strike rate' },
  ]),
  bowler: def('bowler', BowlerWidget, 'Current bowler figures', [
    { kind: 'toggle', key: 'showEconomy', label: 'Economy' },
    { kind: 'toggle', key: 'showMaidens', label: 'Maidens' },
  ]),
  thisOver: def('thisOver', ThisOverWidget, 'Ball-by-ball chips for this over', [
    { kind: 'select', key: 'chipStyle', group: 'Appearance', label: 'Chip style', options: opts(['filled', 'Filled'], ['outline', 'Outline']) },
    { kind: 'toggle', key: 'showLabel', label: '"This over" label' },
  ]),
  partnership: def('partnership', PartnershipWidget, 'Current stand with contribution bar', [
    { kind: 'toggle', key: 'showBar', label: 'Contribution bar' },
  ]),
  recentOvers: def('recentOvers', RecentOversWidget, 'Runs in the last six overs', [
    { kind: 'select', key: 'mode', group: 'Appearance', label: 'Display', options: opts(['bars', 'Bars'], ['numbers', 'Numbers']) },
  ]),
  matchInfo: def('matchInfo', MatchInfoWidget, 'Teams, series, venue, toss, status', [
    {
      kind: 'checks',
      key: 'lines',
      label: 'Lines',
      options: opts(['series', 'Series'], ['venue', 'Venue'], ['toss', 'Toss'], ['status', 'Status']),
    },
    {
      kind: 'select',
      key: 'layout', group: 'Appearance',
      label: 'Layout',
      options: opts(['auto', 'Auto (fits the box shape)'], ['stack', 'Stacked list'], ['grid', 'Grid (two or three per row)'], ['row', 'Single row']),
    },
    { kind: 'select', key: 'labels', group: 'Appearance', label: 'Labels', options: opts(['side', 'Beside the value'], ['above', 'Above the value'], ['hidden', 'Hidden']) },
    { kind: 'select', key: 'align', group: 'Appearance', label: 'Align', options: opts(['left', 'Left'], ['center', 'Centre']) },
    { kind: 'toggle', key: 'showTeams', group: 'Appearance', label: 'Team names line' },
  ]),
  banner: def('banner', BannerWidget, 'Full-width FOUR / SIX / WICKET moments', [
    { kind: 'checks', key: 'autoFire', group: 'Behaviour', label: 'Auto-fire on', options: AUTO_FIRE_EVENTS.map((e) => ({ value: e, label: EVENT_LABELS[e] ?? e })) },
    { kind: 'select', key: 'look', group: 'Appearance', label: 'Look', options: opts(['blast', 'Blast (giant number, burst, particles)'], ['pop', 'Pop art (centred word, comic burst)'], ['classic', 'Classic (clean wipe)']) },
    { kind: 'slider', key: 'duration', group: 'Appearance', label: 'Hold', min: 1, max: 6, step: 0.5, unit: 's' },
    { kind: 'select', key: 'direction', group: 'Appearance', label: 'Wipe from', options: opts(['left', 'Left'], ['right', 'Right']), showIf: (p) => p['look'] === 'classic' },
    { kind: 'toggle', key: 'showSubtitle', group: 'Appearance', label: 'Subtitle line' },
  ]),
  ticker: def('ticker', TickerWidget, 'Scrolling scores or custom text', [
    {
      kind: 'select',
      key: 'source',
      label: 'Source',
      options: opts(['matches', 'Other live matches'], ['custom', 'Custom text'], ['both', 'Both']),
    },
    { kind: 'text', key: 'label', label: 'Tag' },
    { kind: 'text', key: 'text', label: 'Custom text (· separates items)', multiline: true },
    { kind: 'slider', key: 'speed', group: 'Behaviour', label: 'Speed', min: 30, max: 240, step: 10, unit: 'px/s' },
  ]),
  camera: def('camera', CameraWidget, 'Transparent cutout for your OBS webcam', [
    {
      kind: 'select',
      key: 'shape', group: 'Appearance',
      label: 'Shape',
      options: opts(['rect', 'Rectangle'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['pill', 'Pill']),
    },
    { kind: 'slider', key: 'frameWidth', group: 'Appearance', label: 'Frame width', min: 0, max: 16, step: 1, unit: 'px' },
    { kind: 'toggle', key: 'showPlate', label: 'Name plate' },
    { kind: 'text', key: 'label', label: 'Name' },
    { kind: 'text', key: 'sublabel', label: 'Role' },
  ]),
  text: def('text', TextWidget, 'Free text, e.g. LIVE COMMENTARY', [
    { kind: 'text', key: 'text', label: 'Text', multiline: true },
    { kind: 'slider', key: 'size', group: 'Appearance', label: 'Size', min: 22, max: 120, step: 1, unit: 'px' },
    { kind: 'select', key: 'align', group: 'Appearance', label: 'Align', options: opts(['left', 'Left'], ['center', 'Centre'], ['right', 'Right']) },
    { kind: 'toggle', key: 'uppercase', label: 'Uppercase' },
    { kind: 'toggle', key: 'panel', group: 'Appearance', label: 'Panel background' },
    { kind: 'toggle', key: 'liveDot', label: 'Red live dot' },
  ]),
  image: def('image', ImageWidget, 'Your channel logo', [
    { kind: 'image', key: 'src', label: 'Image' },
    { kind: 'select', key: 'fit', group: 'Appearance', label: 'Fit', options: opts(['contain', 'Contain'], ['cover', 'Cover']) },
    { kind: 'toggle', key: 'panel', group: 'Appearance', label: 'Panel background' },
  ]),
  scorecard: def('scorecard', ScorecardWidget, 'Full batting and bowling card, yet to bat, fall of wickets', [
    {
      kind: 'select',
      key: 'innings',
      label: 'Innings',
      options: opts(['current', 'Current'], ['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['4', '4th']),
    },
    { kind: 'toggle', key: 'showBatting', label: 'Batting' },
    { kind: 'toggle', key: 'showBowling', label: 'Bowling' },
    { kind: 'toggle', key: 'showYetToBat', label: 'Yet to bat' },
    { kind: 'toggle', key: 'showFow', label: 'Fall of wickets' },
    {
      kind: 'select',
      key: 'dismissal', group: 'Appearance',
      label: 'How out',
      options: opts(['column', 'Own column'], ['under', 'Under the name (more room)'], ['hidden', 'Hidden']),
    },
    { kind: 'select', key: 'display', group: 'Window', label: 'Display', options: opts(['window', 'Floating window'], ['widget', 'Widget']) },
    { kind: 'toggle', key: 'minimized', group: 'Window', label: 'Minimized (floating window only)', showIf: (p) => p['display'] !== 'widget' },
  ], { actions: CARD_ACTIONS }),
  teamCard: def('teamCard', TeamCardWidget, 'Playing XI with who batted, who is in and who is yet to bat', [
    {
      kind: 'select',
      key: 'side',
      label: 'Team',
      options: opts(['batting', 'Batting side'], ['bowling', 'Bowling side'], ['0', 'First team'], ['1', 'Second team']),
    },
    { kind: 'toggle', key: 'showRoles', label: 'Roles' },
    { kind: 'toggle', key: 'showScores', label: 'Team score' },
    { kind: 'select', key: 'display', group: 'Window', label: 'Display', options: opts(['window', 'Floating window'], ['widget', 'Widget']) },
    { kind: 'toggle', key: 'minimized', group: 'Window', label: 'Minimized (floating window only)', showIf: (p) => p['display'] !== 'widget' },
  ], { actions: CARD_ACTIONS }),
  playerCard: def('playerCard', PlayerCardWidget, 'One player: role, styles and this match’s figures', [
    { kind: 'text', key: 'playerName', label: 'Player (pick from the Cards panel)' },
    { kind: 'toggle', key: 'showPhoto', label: 'Show photo (check rights for public streams)' },
    { kind: 'select', key: 'display', group: 'Window', label: 'Display', options: opts(['window', 'Floating window'], ['widget', 'Widget']) },
    { kind: 'toggle', key: 'minimized', group: 'Window', label: 'Minimized (floating window only)', showIf: (p) => p['display'] !== 'widget' },
  ], { actions: CARD_ACTIONS }),
  playerPanel: def('playerPanel', PlayerPanelWidget, 'Batter or bowler with image, big figures and stats', [
    {
      kind: 'select',
      key: 'slot',
      label: 'Shows',
      options: opts(['striker', 'Striker'], ['nonStriker', 'Non-striker'], ['bowler', 'Current bowler'], ['name', 'A named player']),
    },
    { kind: 'text', key: 'playerName', label: 'Player name', showIf: (p) => p['slot'] === 'name' },
    { kind: 'toggle', key: 'showImage', label: 'Player image' },
    { kind: 'toggle', key: 'showFooter', label: 'Stats footer' },
  ]),
  scoreHeader: def('scoreHeader', ScoreHeaderWidget, 'Both teams in big colour blocks; the centre flashes FOUR / SIX / WICKET / OVER', [
    { kind: 'text', key: 'centerText', label: 'Centre text between events (empty = VS)' },
    { kind: 'toggle', key: 'showEvents', group: 'Behaviour', label: 'Flash events in the centre' },
  ]),
  oversStrip: def('oversStrip', OversStripWidget, 'Previous and current over, ball by ball, with totals', [
    { kind: 'text', key: 'label', label: 'Label on the left' },
    { kind: 'toggle', key: 'showPrevious', label: 'Show previous over' },
  ]),
  chaseBox: def('chaseBox', ChaseBoxWidget, 'Runs needed vs balls left (or run rate vs projected)', [
    { kind: 'toggle', key: 'showProjection', label: 'Before a chase: run rate vs projected' },
  ]),
  statBar: def('statBar', StatBarWidget, 'CRR, RRR, partnership and the chase sentence on one line', [
    { kind: 'toggle', key: 'showStatus', label: 'Status sentence' },
  ]),
  infoRail: def('infoRail', InfoRailWidget, 'Bottom bar: score stays put while this over, run rates, batters, bowler and more rotate', [
    { kind: 'checks', key: 'slides', label: 'Slides', options: RAIL_SLIDES },
    { kind: 'slider', key: 'seconds', group: 'Behaviour', label: 'Each slide', min: 3, max: 20, step: 1, unit: 's' },
    { kind: 'toggle', key: 'followEvents', group: 'Behaviour', label: 'Jump to the right slide on FOUR / SIX / WICKET' },
    { kind: 'toggle', key: 'showScore', group: 'Appearance', label: 'Score block on the left' },
    { kind: 'toggle', key: 'showProgress', group: 'Appearance', label: 'Progress line' },
  ]),
  video: def('video', VideoWidget, 'A video clip: intro, sponsor loop, replay', [
    { kind: 'video', key: 'src', label: 'Video' },
    { kind: 'select', key: 'fit', group: 'Appearance', label: 'Fit', options: opts(['cover', 'Fill (crop)'], ['contain', 'Fit (letterbox)']) },
    { kind: 'toggle', key: 'loop', group: 'Behaviour', label: 'Loop' },
    { kind: 'toggle', key: 'muted', group: 'Behaviour', label: 'Muted' },
    { kind: 'toggle', key: 'panel', group: 'Appearance', label: 'Panel background' },
  ], { actions: VIDEO_ACTIONS }),
  timer: def('timer', TimerWidget, 'Starting in / back in countdown, or a stopwatch', [
    { kind: 'text', key: 'title', label: 'Title (e.g. STARTING IN, BACK IN)' },
    {
      kind: 'select',
      key: 'mode', group: 'Behaviour',
      label: 'Mode',
      options: opts(['duration', 'Countdown for a length'], ['until', 'Countdown to a time'], ['stopwatch', 'Stopwatch (counts up)']),
    },
    { kind: 'number', key: 'minutes', group: 'Behaviour', label: 'Length in minutes', min: 0.5, max: 600, step: 0.5, showIf: (p) => p['mode'] === 'duration' },
    { kind: 'text', key: 'target', group: 'Behaviour', label: 'Time to count to, HH:MM', placeholder: '19:30', showIf: (p) => p['mode'] === 'until' },
    { kind: 'text', key: 'endText', label: 'Text at zero', showIf: (p) => p['mode'] !== 'stopwatch' },
    { kind: 'toggle', key: 'panel', group: 'Appearance', label: 'Panel background' },
  ], {
    actions: TIMER_ACTIONS,
    readout: (c) => (c.props['mode'] === 'until' ? '' : formatClock(timerValue(timerProps(c), c.now).ms)),
  }),
  clock: def('clock', ClockWidget, 'Local time or countdown', [
    { kind: 'select', key: 'mode', group: 'Behaviour', label: 'Mode', options: opts(['time', 'Local time'], ['countdown', 'Countdown']) },
    { kind: 'toggle', key: 'hour24', group: 'Appearance', label: '24-hour', showIf: (p) => p['mode'] !== 'countdown' },
    { kind: 'text', key: 'target', group: 'Behaviour', label: 'Countdown to (HH:MM)', placeholder: '19:30', showIf: (p) => p['mode'] === 'countdown' },
    { kind: 'text', key: 'label', label: 'Countdown label', showIf: (p) => p['mode'] === 'countdown' },
  ]),
};

export const WIDGET_LIST: WidgetDef[] = Object.values(WIDGET_REGISTRY);

/** Style controls shared by every widget; unset values inherit from the scene theme. */
export const STYLE_SCHEMA: FieldDef[] = [
  { kind: 'color', key: 'bg', label: 'Background' },
  { kind: 'slider', key: 'bgOpacity', label: 'Background opacity', min: 0, max: 1, step: 0.01 },
  { kind: 'slider', key: 'blur', label: 'Backdrop blur', min: 0, max: 40, step: 1, unit: 'px' },
  { kind: 'color', key: 'text', label: 'Text' },
  { kind: 'color', key: 'accent', label: 'Accent' },
  { kind: 'select', key: 'fontFamily', label: 'Font', options: opts(['Inter', 'Inter'], ['Barlow Condensed', 'Barlow Condensed']) },
  { kind: 'slider', key: 'fontScale', label: 'Font scale', min: 0.5, max: 2, step: 0.05, unit: '×' },
  { kind: 'slider', key: 'radius', label: 'Corner radius', min: 0, max: 40, step: 1, unit: 'px' },
  { kind: 'slider', key: 'padding', label: 'Padding', min: 0, max: 48, step: 1, unit: 'px' },
  { kind: 'select', key: 'shadow', label: 'Shadow', options: opts(['soft', 'Soft'], ['none', 'None']) },
];
