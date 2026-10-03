import type { Type } from '@angular/core';
import { AUTO_FIRE_EVENTS, WIDGET_DEFAULTS, type WidgetType } from '@cos/shared';
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
import { TimerWidget } from './timer/timer.widget';

export interface SelectOption {
  value: string;
  label: string;
}

/** One settings control. `key` is the prop name (or style key) it edits. */
export type FieldDef =
  | { kind: 'text'; key: string; label: string; placeholder?: string; multiline?: boolean }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: SelectOption[] }
  | { kind: 'color'; key: string; label: string }
  | { kind: 'image'; key: string; label: string }
  | { kind: 'checks'; key: string; label: string; options: SelectOption[] };

export interface WidgetDef {
  type: WidgetType;
  label: string;
  icon: string;
  description: string;
  component: Type<unknown>;
  settingsSchema: FieldDef[];
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

function def(type: WidgetType, component: Type<unknown>, description: string, settingsSchema: FieldDef[]): WidgetDef {
  const d = WIDGET_DEFAULTS[type];
  return { type, label: d.label, icon: d.icon, description, component, settingsSchema };
}

/**
 * type → component, label, settings. Adding a widget = one folder + one entry
 * here + its defaults in packages/shared/src/defaults.ts.
 */
export const WIDGET_REGISTRY: Record<WidgetType, WidgetDef> = {
  scorebug: def('scorebug', ScorebugWidget, 'Team, score, overs, run rate and chase', [
    { kind: 'select', key: 'layout', label: 'Layout', options: opts(['wide', 'Wide'], ['compact', 'Compact']) },
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
    { kind: 'select', key: 'chipStyle', label: 'Chip style', options: opts(['filled', 'Filled'], ['outline', 'Outline']) },
    { kind: 'toggle', key: 'showLabel', label: '"This over" label' },
  ]),
  partnership: def('partnership', PartnershipWidget, 'Current stand with contribution bar', [
    { kind: 'toggle', key: 'showBar', label: 'Contribution bar' },
  ]),
  recentOvers: def('recentOvers', RecentOversWidget, 'Runs in the last six overs', [
    { kind: 'select', key: 'mode', label: 'Display', options: opts(['bars', 'Bars'], ['numbers', 'Numbers']) },
  ]),
  matchInfo: def('matchInfo', MatchInfoWidget, 'Teams, series, venue, toss, status', [
    {
      kind: 'checks',
      key: 'lines',
      label: 'Lines',
      options: opts(['series', 'Series'], ['venue', 'Venue'], ['toss', 'Toss'], ['status', 'Status']),
    },
  ]),
  banner: def('banner', BannerWidget, 'Full-width FOUR / SIX / WICKET moments', [
    { kind: 'checks', key: 'autoFire', label: 'Auto-fire on', options: AUTO_FIRE_EVENTS.map((e) => ({ value: e, label: EVENT_LABELS[e] ?? e })) },
    { kind: 'slider', key: 'duration', label: 'Hold', min: 1, max: 6, step: 0.5, unit: 's' },
    { kind: 'select', key: 'direction', label: 'Wipe from', options: opts(['left', 'Left'], ['right', 'Right']) },
    { kind: 'toggle', key: 'showSubtitle', label: 'Subtitle line' },
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
    { kind: 'slider', key: 'speed', label: 'Speed', min: 30, max: 240, step: 10, unit: 'px/s' },
  ]),
  camera: def('camera', CameraWidget, 'Transparent cutout for your OBS webcam', [
    {
      kind: 'select',
      key: 'shape',
      label: 'Shape',
      options: opts(['rect', 'Rectangle'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['pill', 'Pill']),
    },
    { kind: 'slider', key: 'frameWidth', label: 'Frame width', min: 0, max: 16, step: 1, unit: 'px' },
    { kind: 'toggle', key: 'showPlate', label: 'Name plate' },
    { kind: 'text', key: 'label', label: 'Name' },
    { kind: 'text', key: 'sublabel', label: 'Role' },
  ]),
  text: def('text', TextWidget, 'Free text, e.g. LIVE COMMENTARY', [
    { kind: 'text', key: 'text', label: 'Text', multiline: true },
    { kind: 'slider', key: 'size', label: 'Size', min: 22, max: 120, step: 1, unit: 'px' },
    { kind: 'select', key: 'align', label: 'Align', options: opts(['left', 'Left'], ['center', 'Centre'], ['right', 'Right']) },
    { kind: 'toggle', key: 'uppercase', label: 'Uppercase' },
    { kind: 'toggle', key: 'panel', label: 'Panel background' },
    { kind: 'toggle', key: 'liveDot', label: 'Red live dot' },
  ]),
  image: def('image', ImageWidget, 'Your channel logo', [
    { kind: 'image', key: 'src', label: 'Image' },
    { kind: 'select', key: 'fit', label: 'Fit', options: opts(['contain', 'Contain'], ['cover', 'Cover']) },
    { kind: 'toggle', key: 'panel', label: 'Panel background' },
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
    { kind: 'select', key: 'display', label: 'Display', options: opts(['window', 'Floating window'], ['widget', 'Widget']) },
    { kind: 'toggle', key: 'minimized', label: 'Minimized (floating window only)' },
  ]),
  teamCard: def('teamCard', TeamCardWidget, 'Playing XI with who batted, who is in and who is yet to bat', [
    {
      kind: 'select',
      key: 'side',
      label: 'Team',
      options: opts(['batting', 'Batting side'], ['bowling', 'Bowling side'], ['0', 'First team'], ['1', 'Second team']),
    },
    { kind: 'toggle', key: 'showRoles', label: 'Roles' },
    { kind: 'toggle', key: 'showScores', label: 'Team score' },
    { kind: 'select', key: 'display', label: 'Display', options: opts(['window', 'Floating window'], ['widget', 'Widget']) },
    { kind: 'toggle', key: 'minimized', label: 'Minimized (floating window only)' },
  ]),
  playerCard: def('playerCard', PlayerCardWidget, 'One player: role, styles and this match’s figures', [
    { kind: 'text', key: 'playerName', label: 'Player (pick from the Cards panel)' },
    { kind: 'toggle', key: 'showPhoto', label: 'Show photo (check rights for public streams)' },
    { kind: 'select', key: 'display', label: 'Display', options: opts(['window', 'Floating window'], ['widget', 'Widget']) },
    { kind: 'toggle', key: 'minimized', label: 'Minimized (floating window only)' },
  ]),
  timer: def('timer', TimerWidget, 'Starting in / back in countdown, or a stopwatch', [
    { kind: 'text', key: 'title', label: 'Title (e.g. STARTING IN, BACK IN)' },
    {
      kind: 'select',
      key: 'mode',
      label: 'Mode',
      options: opts(['duration', 'Countdown for a length'], ['until', 'Countdown to a time'], ['stopwatch', 'Stopwatch (counts up)']),
    },
    { kind: 'number', key: 'minutes', label: 'Length in minutes (countdown for a length)', min: 0.5, max: 600, step: 0.5 },
    { kind: 'text', key: 'target', label: 'Time to count to, HH:MM (countdown to a time)', placeholder: '19:30' },
    { kind: 'text', key: 'endText', label: 'Text at zero' },
    { kind: 'toggle', key: 'panel', label: 'Panel background' },
  ]),
  clock: def('clock', ClockWidget, 'Local time or countdown', [
    { kind: 'select', key: 'mode', label: 'Mode', options: opts(['time', 'Local time'], ['countdown', 'Countdown']) },
    { kind: 'toggle', key: 'hour24', label: '24-hour' },
    { kind: 'text', key: 'target', label: 'Countdown to (HH:MM)', placeholder: '19:30' },
    { kind: 'text', key: 'label', label: 'Countdown label' },
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
