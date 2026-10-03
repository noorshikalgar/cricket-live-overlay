import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  CANVAS_H,
  CANVAS_W,
  createWidget,
  type CardKind,
  type PropValue,
  type Scene,
  type WidgetInstance,
  type WidgetType,
} from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { WIDGET_REGISTRY } from '../widgets/widget-registry';
import { EditorStore } from './editor.store';

type CardType = 'scorecard' | 'teamCard' | 'playerCard';
const CARD_TYPES: CardType[] = ['scorecard', 'teamCard', 'playerCard'];
const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/**
 * Left-panel tab for talking over the game: open a scorecard, team or player
 * card on the ON-AIR scene in one click, then minimise or close it. Cards are
 * ordinary widgets, so they can be moved and resized on the canvas too.
 */
@Component({
  selector: 'cos-cards-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!live.match()) {
      <p class="hint">Select a match in the top bar to open live cards.</p>
    } @else {
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

      <h3>Scorecard</h3>
      <div class="grid">
        <button type="button" class="card-btn" (click)="open('scorecard', { innings: 'current' })">Current innings</button>
        @for (i of inningsList(); track $index) {
          <button type="button" class="card-btn" (click)="open('scorecard', { innings: String($index + 1) })">{{ i }}</button>
        }
      </div>

      <h3>Teams</h3>
      <div class="grid">
        @for (t of live.match()!.teams; track t.shortCode; let i = $index) {
          <button type="button" class="card-btn" [style.--c]="t.primaryColor" (click)="open('teamCard', { side: String(i) })">
            <i class="sw"></i>{{ t.shortCode }} XI
          </button>
        }
      </div>

      <h3>Players</h3>
      <div class="grid">
        @for (b of live.match()!.batters; track b.name) {
          <button type="button" class="card-btn" (click)="openPlayer('', b.name)">🏏 {{ last(b.name) }} <small>{{ b.runs }}*</small></button>
        }
        @if (live.match()!.bowler; as w) {
          <button type="button" class="card-btn" (click)="openPlayer('', w.name)">⚾ {{ last(w.name) }} <small>{{ w.wickets }}-{{ w.runs }}</small></button>
        }
      </div>
      @if (live.squads(); as sq) {
        <input class="search" type="search" placeholder="Find a player…" [value]="query()" (input)="query.set(asValue($event))" />
        @for (t of sq.teams; track t.code) {
          <div class="team">{{ t.name }}</div>
          <ul class="players">
            @for (p of filtered(t.playingXI); track p.id) {
              <li>
                <button type="button" (click)="openPlayer(p.id, p.name)">
                  {{ p.name }}@if (p.captain) { <span class="tag">C</span> }@if (p.keeper) { <span class="tag">WK</span> }
                  <small>{{ p.role }}</small>
                </button>
              </li>
            }
          </ul>
        }
      } @else {
        <button type="button" class="load" (click)="fetch('squads', true)">Load playing XIs (1 API call)</button>
      }

      <h3>On air</h3>
      @if (onAirCards().length) {
        <ul class="onair">
          @for (w of onAirCards(); track w.id) {
            <li [class.off]="!w.visible">
              <span class="ic">{{ registry[w.type].icon }}</span>
              <span class="nm">{{ label(w) }}</span>
              <button type="button" [title]="w.props['minimized'] ? 'Restore' : 'Minimize'" (click)="toggleMin(w)" [disabled]="!w.visible">
                {{ w.props['minimized'] ? '▢' : '–' }}
              </button>
              <button type="button" [title]="w.visible ? 'Close' : 'Show again'" (click)="toggleVisible(w)">{{ w.visible ? '✕' : '↺' }}</button>
            </li>
          }
        </ul>
      } @else {
        <p class="hint">Cards you open appear here. They go on the on-air scene; drag and resize them on the canvas when editing that scene.</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 12px 12px 24px;
      overflow-y: auto;
      font-size: 12px;
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

  /** Show a card on the on-air scene: reuse the scene's card of that type, or add one. */
  protected open(type: CardType, props: Record<string, PropValue>): void {
    const scene = this.onAirScene();
    if (!scene) return;
    this.fetch('scorecard');
    if (type !== 'scorecard' && !this.live.squads()) this.fetch('squads');

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
