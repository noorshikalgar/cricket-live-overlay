import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  CANVAS_H,
  CANVAS_W,
  createWidget,
  newId,
  type CardKind,
  type PropValue,
  type Scene,
  type WidgetInstance,
  type WidgetType,
} from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { WIDGET_REGISTRY } from '../widgets/widget-registry';
import { findTeam, sameName } from '../widgets/cards/card-data';
import { EditorStore } from './editor.store';

type CardType = 'scorecard' | 'teamCard' | 'playerCard';
const CARD_TYPES: CardType[] = ['scorecard', 'teamCard', 'playerCard'];
const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/**
 * Left-panel tab for talking over the game: open a scorecard, team or player
 * card on the ON-AIR scene in one click, then minimise or close it. Cards are
 * ordinary widgets, so they can be moved and resized on the canvas too.
 */
const CARDS_OPEN_KEY = 'cos.cards.open';

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CARDS_OPEN_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

@Component({
  selector: 'cos-cards-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!live.match()) {
      <p class="hint">Select a match in the top bar to open live cards.</p>
    } @else {
      <p class="intro">Full-screen cards for breaks and replays: the scorecard, a team's XI, one player. They show on the <b>on-air</b> scene.</p>
      @if (onAirCards().length) {
      <details class="grp" [open]="isOpen('onair')" (toggle)="onToggle('onair', $event)">
        <summary>On air now <span class="n">{{ onAirCards().length }}</span></summary>
        <ul class="onair">
          @for (w of onAirCards(); track w.id) {
            <li [class.off]="!w.visible">
              <span class="ic">{{ registry[w.type].icon }}</span>
              <span class="nm">{{ label(w) }}</span>
              <button
                type="button"
                [title]="w.props['minimized'] ? 'Restore' : 'Minimize'"
                (click)="toggleMin(w)"
                [disabled]="!w.visible || w.props['display'] === 'widget'"
              >
                {{ w.props['minimized'] ? '▢' : '–' }}
              </button>
              <button type="button" [title]="w.visible ? 'Close' : 'Show again'" (click)="toggleVisible(w)">{{ w.visible ? '✕' : '↺' }}</button>
            </li>
          }
        </ul>
      </details>
      }
      <details class="grp" [open]="isOpen('show')" (toggle)="onToggle('show', $event)">
        <summary>Show as</summary>
      <div class="seg" role="radiogroup" aria-label="Open cards as">
        <button type="button" role="radio" [attr.aria-checked]="openAs() === 'window'" [class.on]="openAs() === 'window'" (click)="openAs.set('window')" title="Floating card with a title bar (minimise, close, reload) on the on-air scene">Floating window</button>
        <button type="button" role="radio" [attr.aria-checked]="openAs() === 'widget'" [class.on]="openAs() === 'widget'" (click)="openAs.set('widget')" title="Plain fixed widget on the on-air scene">Widget</button>
        <button type="button" role="radio" [attr.aria-checked]="openAs() === 'scene'" [class.on]="openAs() === 'scene'" (click)="openAs.set('scene')" title="A dedicated scene built around the card, put on air">New scene</button>
      </div>

      <p class="hint small">{{ openAsHint() }}</p>
      </details>
      <details class="grp" [open]="isOpen('scorecard')" (toggle)="onToggle('scorecard', $event)">
        <summary>Scorecard</summary>
      <div class="grid">
        <button type="button" class="card-btn" (click)="open('scorecard', { innings: 'current' })">Current innings</button>
        @for (i of inningsList(); track $index) {
          <button type="button" class="card-btn" (click)="open('scorecard', { innings: String($index + 1) })">{{ i }}</button>
        }
      </div>

      </details>
      <details class="grp" [open]="isOpen('teams')" (toggle)="onToggle('teams', $event)">
        <summary>Teams</summary>
      <div class="grid">
        @for (t of live.match()!.teams; track t.shortCode; let i = $index) {
          <button type="button" class="card-btn" [style.--c]="t.primaryColor" (click)="open('teamCard', { side: String(i) })">
            <i class="sw"></i>{{ t.shortCode }} XI
          </button>
        }
      </div>

      </details>
      <details class="grp" [open]="isOpen('players')" (toggle)="onToggle('players', $event)">
        <summary>Players</summary>
      <div class="grid">
        @for (b of live.match()!.batters; track b.name) {
          <button type="button" class="card-btn" (click)="openPlayer('', b.name)">🏏 {{ last(b.name) }} <small>{{ b.runs }}*</small></button>
        }
        @if (live.match()!.bowler; as w) {
          <button type="button" class="card-btn" (click)="openPlayer('', w.name)">⚾ {{ last(w.name) }} <small>{{ w.wickets }}-{{ w.runs }}</small></button>
        }
      </div>
      <div class="tabs2" role="tablist">
        @for (t of live.match()!.teams; track t.shortCode; let i = $index) {
          <button type="button" role="tab" [class.on]="teamTab() === i" [style.--c]="t.primaryColor" (click)="teamTab.set(i)">
            <i class="sw"></i>{{ t.shortCode }}
          </button>
        }
      </div>
      <input class="search" type="search" placeholder="Find a player…" [value]="query()" (input)="query.set(asValue($event))" />
      @if (roster(); as r) {
        @if (r.players.length) {
          <ul class="players">
            @for (p of filtered(r.players); track p.name) {
              <li>
                <button type="button" (click)="openPlayer(p.id, p.name)" [class.now]="p.state === 'batting'">
                  <span class="pn">{{ p.name }}@if (p.captain) { <span class="tag">C</span> }@if (p.keeper) { <span class="tag">WK</span> }</span>
                  <small>{{ p.note || p.role }}</small>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="hint">No players yet for this team.</p>
        }
        @if (r.source !== 'squads') {
          <button type="button" class="load" (click)="fetch('squads', true)" title="Roles, captain and keeper for both teams; cached, 1 API call">
            Load full playing XIs (1 API call)
          </button>
        }
      }

      </details>
      <details class="grp" [open]="isOpen('data')" (toggle)="onToggle('data', $event)">
        <summary>Card data</summary>
      <div class="data">
        <span>
          Scorecard
          @if (scAge(); as a) {
            <em>{{ a }}</em>
          } @else {
            <em>not loaded</em>
          }
        </span>
        <button type="button" (click)="fetch('scorecard', true)" title="Fetch the latest scorecard (1 API call)">⟳</button>
      </div>
      <div class="data">
        <span>
          Playing XIs
          <em>{{ live.squads() ? 'loaded' : 'not loaded' }}</em>
        </span>
        <button type="button" (click)="fetch('squads', true)" title="Fetch both playing XIs (1 API call)">⟳</button>
      </div>

      <p class="hint small">Cards don't call the API on their own. ⟳ fetches fresh data (1 call each).</p>
      </details>
    }

  `,
  styles: `
    :host {
      display: block;
      padding: 12px 12px 24px;
      overflow-y: auto;
      font-size: 12px;
    }
    .intro {
      margin: 0 2px 8px;
      color: var(--ui-muted);
      line-height: 1.45;
    }
    .intro b {
      color: var(--ui-text);
    }
    .hint.small {
      font-size: 11px;
      margin: 6px 2px 0;
    }
    .grp {
      border-top: 1px solid var(--ui-border);
      padding: 8px 0 10px;
    }
    .grp > summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      user-select: none;
    }
    .grp > summary::-webkit-details-marker {
      display: none;
    }
    .grp > summary::before {
      content: '▸';
      font-size: 10px;
      transition: transform 0.15s;
    }
    .grp[open] > summary::before {
      transform: rotate(90deg);
    }
    .grp:not([open]) > summary {
      margin-bottom: 0;
    }
    .grp > summary:hover {
      color: var(--ui-text);
    }
    .grp > summary .n {
      font-weight: 600;
      letter-spacing: 0;
      padding: 0 6px;
      border-radius: 99px;
      background: var(--ui-accent-soft);
      color: var(--ui-accent);
    }
    h3 {
      margin: 14px 2px 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 600;
    }
    .hint {
      color: var(--ui-muted);
      line-height: 1.45;
    }
    .data {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 2px;
      color: var(--ui-text);
    }
    .data em {
      font-style: normal;
      color: var(--ui-muted);
      margin-left: 4px;
    }
    .data button {
      width: 26px;
      height: 24px;
      padding: 0;
      justify-content: center;
    }
    .seg {
      display: flex;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .seg button {
      flex: 1;
      border: 0;
      border-radius: 0;
      justify-content: center;
      padding: 6px 4px;
      background: transparent;
      font-size: 11px;
    }
    .seg button.on {
      background: var(--ui-accent-soft);
      color: var(--ui-accent);
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .card-btn {
      justify-content: flex-start;
      min-height: 32px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-btn small {
      margin-left: auto;
      color: var(--ui-muted);
      font-variant-numeric: tabular-nums;
    }
    .sw {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      background: var(--c);
      flex: none;
    }
    .tabs2 {
      display: flex;
      gap: 4px;
      margin-top: 4px;
    }
    .tabs2 button {
      flex: 1;
      justify-content: center;
      background: transparent;
    }
    .tabs2 button.on {
      background: var(--ui-chip-strong);
      border-color: var(--c, var(--ui-accent));
      font-weight: 600;
    }
    .players button.now .pn {
      color: var(--ui-accent);
    }
    .pn {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .search {
      width: 100%;
      margin: 10px 0 4px;
    }
    .team {
      margin: 10px 2px 4px;
      font-weight: 600;
      color: var(--ui-text);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .players button {
      width: 100%;
      background: none;
      border: 0;
      padding: 5px 6px;
      justify-content: flex-start;
      border-radius: 5px;
      text-align: left;
    }
    .players button:hover {
      background: var(--ui-chip);
    }
    .players small {
      margin-left: auto;
      color: var(--ui-muted);
    }
    .tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      background: var(--ui-chip-strong);
      color: var(--ui-muted);
    }
    .load {
      width: 100%;
      justify-content: center;
      margin-top: 8px;
    }
    .onair li {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 2px;
    }
    .onair li.off .nm {
      opacity: 0.45;
    }
    .onair .ic {
      width: 18px;
      text-align: center;
      color: var(--ui-muted);
    }
    .onair .nm {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .onair button {
      width: 26px;
      height: 24px;
      padding: 0;
      justify-content: center;
    }
  `,
})
export class CardsPanelComponent {
  protected readonly live = inject(LiveStore);
  private readonly editor = inject(EditorStore);
  protected readonly registry = WIDGET_REGISTRY;
  protected readonly query = signal('');
  protected readonly String = String;

  private readonly now = signal(Date.now());

  constructor() {
    // first look at a match: load its scorecard once if nothing is cached (no-op otherwise)
    effect(() => {
      const id = this.live.match()?.matchId;
      if (id && !untracked(() => this.live.scorecard())) untracked(() => this.fetch('scorecard'));
    });
    const t = setInterval(() => this.now.set(Date.now()), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected readonly scAge = computed(() => {
    const at = this.live.scorecard()?.updatedAt;
    if (!at) return null;
    const s = Math.max(0, Math.round((this.now() - at) / 1000));
    return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  });

  protected readonly inningsList = computed(() =>
    (this.live.match()?.innings ?? []).map((i, n) => `${i.battingTeam} ${ORDINAL[n] ?? `${n + 1}th`}`),
  );

  protected readonly teamTab = signal(0);
  protected readonly openAs = signal<'window' | 'widget' | 'scene'>('window');

  /** what the chosen "Show as" does, in one sentence */
  protected readonly openAsHint = computed(() => {
    switch (this.openAs()) {
      case 'window':
        return 'A floating card with a title bar (minimise, reload, close) over the on-air scene.';
      case 'widget':
        return 'A plain card fixed on the on-air scene, like any other widget.';
      default:
        return 'A new scene built around the card, put on air straight away.';
    }
  });

  // ---- folding sections, remembered per browser ----
  private readonly openState = signal<Record<string, boolean>>(readOpen());

  protected isOpen(key: string): boolean {
    return this.openState()[key] ?? key !== 'data';
  }

  protected onToggle(key: string, e: Event): void {
    const open = (e.target as HTMLDetailsElement).open;
    if (open === this.isOpen(key)) return;
    this.openState.update((s) => ({ ...s, [key]: open }));
    try {
      localStorage.setItem(CARDS_OPEN_KEY, JSON.stringify(this.openState()));
    } catch {
      // storage blocked: sections reset next time
    }
  }

  /**
   * The chosen team's players: the cached playing XI when loaded, otherwise built from
   * the scorecard (batters, yet to bat, bowlers) so the list never needs an extra call.
   */
  protected readonly roster = computed(() => {
    const m = this.live.match();
    const team = m?.teams[this.teamTab()];
    if (!m || !team) return null;
    const sc = this.live.scorecard();
    const batInns = (sc?.innings ?? []).filter((i) => i.team.toLowerCase() === team.shortCode.toLowerCase() || sameName(i.teamName, team.name));
    const bowlInns = (sc?.innings ?? []).filter((i) => !batInns.includes(i));
    const note = (name: string): { note: string; state: string } => {
      const bat = batInns.flatMap((i) => i.batters).filter((b) => sameName(b.name, name)).at(-1);
      if (bat) return { note: `${bat.runs}${bat.status !== 'out' ? '*' : ''} (${bat.balls})`, state: bat.status };
      const bowl = bowlInns.flatMap((i) => i.bowlers).filter((b) => sameName(b.name, name)).at(-1);
      if (bowl) return { note: `${bowl.wickets}-${bowl.runs} (${bowl.overs})`, state: 'bowled' };
      return { note: '', state: '' };
    };
    const squad = findTeam(this.live.squads(), team.shortCode) ?? findTeam(this.live.squads(), team.name);
    if (squad?.playingXI.length) {
      return {
        source: 'squads' as const,
        players: squad.playingXI.map((p) => ({ id: p.id, name: p.name, role: p.role, captain: p.captain, keeper: p.keeper, ...note(p.name) })),
      };
    }
    const names = new Map<string, { captain: boolean; keeper: boolean }>();
    for (const i of batInns) {
      for (const b of i.batters) names.set(b.name, { captain: b.captain, keeper: b.keeper });
      for (const n of i.yetToBat) if (!names.has(n)) names.set(n, { captain: false, keeper: false });
    }
    for (const i of bowlInns) for (const b of i.bowlers) if (![...names.keys()].some((n) => sameName(n, b.name))) names.set(b.name, { captain: false, keeper: false });
    return {
      source: 'scorecard' as const,
      players: [...names.entries()].map(([name, f]) => ({ id: '', name, role: '', ...f, ...note(name) })),
    };
  });

  private readonly onAirScene = computed<Scene | null>(() => this.live.activeScene());

  protected readonly onAirCards = computed(() =>
    (this.onAirScene()?.widgets ?? []).filter((w) => (CARD_TYPES as WidgetType[]).includes(w.type)),
  );

  protected last(name: string): string {
    return name.split(' ').at(-1) ?? name;
  }

  protected asValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected filtered<T extends { name: string; role: string }>(list: T[]): T[] {
    const q = this.query().trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) : list;
  }

  protected label(w: WidgetInstance): string {
    const p = w.props;
    if (w.type === 'playerCard') return String(p['playerName'] || 'Player card');
    if (w.type === 'teamCard') {
      const side = String(p['side'] ?? 'batting');
      const t = side === '0' || side === '1' ? this.live.match()?.teams[Number(side)] : null;
      return `${t?.shortCode ?? side} XI`;
    }
    const inn = String(p['innings'] ?? 'current');
    return `Scorecard · ${inn === 'current' ? 'current' : (ORDINAL[Number(inn) - 1] ?? inn)}`;
  }

  protected fetch(kind: CardKind, force = false): void {
    this.live.send({ type: 'cards:fetch', kind, force });
  }

  protected openPlayer(id: string, name: string): void {
    this.open('playerCard', { playerId: id, playerName: name });
  }

  /** Show a card: on the on-air scene (window / widget) or as its own scene, per "Open as". */
  protected open(type: CardType, props: Record<string, PropValue>): void {
    const scene = this.onAirScene();
    if (!scene) return;
    this.fetch('scorecard');
    if (type !== 'scorecard' && !this.live.squads()) this.fetch('squads');
    const mode = this.openAs();
    if (mode === 'scene') {
      this.openAsScene(type, props, scene);
      return;
    }
    props = { ...props, display: mode };

    const next = structuredClone(scene);
    const top = next.widgets.reduce((m, w) => Math.max(m, w.z), 0) + 1;
    const existing = next.widgets.find((w) => w.type === type);
    if (existing) {
      existing.props = { ...existing.props, ...props, minimized: false };
      existing.visible = true;
      existing.z = top;
    } else {
      const w = createWidget(type, { z: top });
      w.props = { ...w.props, ...props };
      // scorecard centred; team card on the left; player card lower third
      if (type === 'teamCard') {
        w.x = 64;
        w.y = Math.round((CANVAS_H - w.h) / 2);
      } else if (type === 'playerCard') {
        w.x = Math.round((CANVAS_W - w.w) / 2);
        w.y = CANVAS_H - w.h - 180;
      }
      next.widgets.push(w);
      this.editor.selectedId.set(this.editor.sceneId() === scene.id ? w.id : this.editor.selectedId());
    }
    this.live.pushScene({ ...next, updatedAt: Date.now() });
  }

  /**
   * A dedicated scene around the card (camera frame + score bug), put on air with
   * that scene's transition. Re-opening the same card reuses its scene.
   */
  private openAsScene(type: CardType, props: Record<string, PropValue>, from: Scene): void {
    const name = this.sceneName(type, props);
    const existing = this.live.sceneList().find((s) => s.name === name);
    let scene: Scene;
    if (existing) {
      scene = structuredClone(existing);
      const card = scene.widgets.find((w) => w.type === type);
      if (card) {
        card.props = { ...card.props, ...props, display: 'widget', minimized: false };
        card.visible = true;
      }
    } else {
      const card = createWidget(type, { name: WIDGET_REGISTRY[type].label });
      card.props = { ...card.props, ...props, display: 'widget', minimized: false };
      const camera = createWidget('camera');
      const bug = createWidget('scorebug', { x: 120, y: 950, w: 760, h: 96 });
      if (type === 'scorecard') {
        Object.assign(card, { x: 120, y: 80, w: 1680, h: 840 });
        Object.assign(camera, { visible: false, x: 1500, y: 700, w: 300, h: 300 });
      } else if (type === 'teamCard') {
        Object.assign(card, { x: 120, y: 80, w: 760, h: 840 });
        Object.assign(camera, { x: 960, y: 140, w: 840, h: 680 });
        bug.x = 960;
        bug.w = 840;
      } else {
        Object.assign(camera, { x: 120, y: 120, w: 980, h: 760 });
        Object.assign(card, { x: 1160, y: 300, w: 640, h: 380 });
      }
      scene = {
        id: newId(),
        name,
        canvas: { w: CANVAS_W, h: CANVAS_H },
        theme: from.theme,
        background: from.background,
        transition: from.transition,
        widgets: [camera, card, bug].map((w, i) => ({ ...w, z: i + 1 })),
        updatedAt: Date.now(),
      };
    }
    this.live.pushScene({ ...scene, updatedAt: Date.now() });
    this.live.flushScenes();
    // the server has the scene before we switch to it
    setTimeout(() => this.live.send({ type: 'scene:switch', sceneId: scene.id }), 150);
    this.editor.editScene(scene.id);
  }

  private sceneName(type: CardType, props: Record<string, PropValue>): string {
    const m = this.live.match();
    if (type === 'playerCard') return `Player · ${String(props['playerName'] || 'card')}`;
    if (type === 'teamCard') {
      const side = String(props['side'] ?? 'batting');
      const t = side === '0' || side === '1' ? m?.teams[Number(side)] : null;
      return `Team · ${t?.shortCode ?? side}`;
    }
    const inn = String(props['innings'] ?? 'current');
    if (inn === 'current') return 'Scorecard · current';
    const i = m?.innings[Number(inn) - 1];
    return `Scorecard · ${i ? `${i.battingTeam} ${ORDINAL[Number(inn) - 1]}` : inn}`;
  }

  private patch(w: WidgetInstance, patch: Partial<WidgetInstance>): void {
    const scene = this.onAirScene();
    if (!scene) return;
    this.live.pushScene({
      ...scene,
      widgets: scene.widgets.map((x) => (x.id === w.id ? { ...x, ...patch } : x)),
      updatedAt: Date.now(),
    });
  }

  protected toggleMin(w: WidgetInstance): void {
    this.patch(w, { props: { ...w.props, minimized: !w.props['minimized'] } });
  }

  protected toggleVisible(w: WidgetInstance): void {
    this.patch(w, { visible: !w.visible });
  }
}
