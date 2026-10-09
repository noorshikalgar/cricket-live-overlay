import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { WidgetType } from '@cos/shared';
import { WIDGET_LIST, type WidgetDef } from '../widgets/widget-registry';
import { WIDGET_DND_TYPE } from './canvas.component';
import { EditorStore } from './editor.store';

/** Grouped by what you want to show, not by how the widget is built. */
const GROUPS: { id: string; title: string; hint: string; types: WidgetType[] }[] = [
  {
    id: 'score',
    title: 'Score',
    hint: 'The match score and the chase',
    types: ['scorebug', 'scoreHeader', 'infoRail', 'statBar', 'chaseBox'],
  },
  {
    id: 'players',
    title: 'Players',
    hint: 'Batters and bowler at the crease',
    types: ['playerSpotlight', 'playerPanel', 'batters', 'bowler', 'partnership'],
  },
  { id: 'overs', title: 'Overs', hint: 'Ball by ball and over by over', types: ['thisOver', 'oversStrip', 'recentOvers'] },
  { id: 'moments', title: 'Moments', hint: 'FOUR, SIX, WICKET and a news-style ticker', types: ['banner', 'ticker'] },
  {
    id: 'match',
    title: 'Match & cards',
    hint: 'Match details, full scorecard, team and player cards',
    types: ['matchInfo', 'scorecard', 'teamCard', 'playerCard'],
  },
  {
    id: 'own',
    title: 'Your own',
    hint: 'Text, logo, video, webcam frame, countdown, clock',
    types: ['text', 'image', 'video', 'camera', 'timer', 'clock'],
  },
];

const OPEN_KEY = 'cos.library.closed';

function readClosed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Left panel: find a widget, click to add it at the canvas centre or drag it onto the canvas. */
@Component({
  selector: 'cos-library-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <input class="search" type="search" placeholder="Find a widget…" [value]="query()" (input)="setQuery($event)" aria-label="Find a widget" />
      <p class="how">Click to add · drag onto the canvas</p>
    </div>
    @for (g of shown(); track g.id) {
      <details class="grp" [open]="query() || !closed().includes(g.id)" (toggle)="onToggle(g.id, $event)">
        <summary>
          <span class="t">{{ g.title }}</span>
          <span class="n">{{ g.items.length }}</span>
        </summary>
        <p class="ghint">{{ g.hint }}</p>
        <div class="list">
          @for (d of g.items; track d.type) {
            <button
              type="button"
              class="item"
              draggable="true"
              [title]="d.description"
              (click)="editor.add(d.type)"
              (dragstart)="onDragStart($event, d.type)"
            >
              <span class="ic">{{ d.icon }}</span>
              <span class="txt">
                <span class="lb">{{ d.label }}</span>
                <span class="ds">{{ d.description }}</span>
              </span>
              <span class="plus" aria-hidden="true">+</span>
            </button>
          }
        </div>
      </details>
    } @empty {
      <p class="none">No widget matches “{{ query() }}”.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 10px 10px 24px;
      overflow-y: auto;
    }
    .head {
      position: sticky;
      top: -10px;
      z-index: 1;
      margin: -10px -10px 6px;
      padding: 10px 10px 6px;
      background: var(--ui-panel);
    }
    .search {
      width: 100%;
    }
    .how {
      margin: 6px 2px 0;
      font-size: 11px;
      color: var(--ui-muted);
    }
    .grp {
      border-top: 1px solid var(--ui-border);
      padding: 8px 0 4px;
    }
    .grp:first-of-type {
      border-top: 0;
    }
    summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      user-select: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    summary::before {
      content: '▸';
      font-size: 10px;
      transition: transform 0.15s;
    }
    .grp[open] > summary::before {
      transform: rotate(90deg);
    }
    summary:hover {
      color: var(--ui-text);
    }
    .t {
      flex: 1;
    }
    .n {
      font-weight: 600;
      letter-spacing: 0;
      padding: 0 6px;
      border-radius: 99px;
      background: var(--ui-chip);
    }
    .ghint {
      margin: 2px 2px 8px;
      font-size: 11px;
      color: var(--ui-muted);
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: var(--ui-chip);
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--ui-text);
      cursor: grab;
      text-align: left;
      font: inherit;
      transition:
        border-color 0.12s,
        background 0.12s;
    }
    .item:hover {
      border-color: var(--ui-accent);
      background: var(--ui-chip-strong);
    }
    .item:active {
      cursor: grabbing;
    }
    .ic {
      flex: none;
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border-radius: 6px;
      background: var(--ui-accent-soft);
      color: var(--ui-accent);
      font-size: 15px;
    }
    .txt {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .lb {
      font-size: 12.5px;
      font-weight: 600;
    }
    .ds {
      font-size: 11px;
      line-height: 1.3;
      color: var(--ui-muted);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .plus {
      flex: none;
      color: var(--ui-muted);
      font-size: 16px;
      opacity: 0;
      transition: opacity 0.12s;
    }
    .item:hover .plus {
      opacity: 1;
      color: var(--ui-accent);
    }
    .none {
      color: var(--ui-muted);
      font-size: 12px;
      padding: 8px 2px;
    }
  `,
})
export class LibraryPanelComponent {
  protected readonly editor = inject(EditorStore);
  protected readonly query = signal('');
  protected readonly closed = signal<string[]>(readClosed());

  /** groups with their widgets, filtered by the search text */
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const match = (d: WidgetDef) => !q || `${d.label} ${d.description}`.toLowerCase().includes(q);
    return GROUPS.map((g) => ({
      ...g,
      items: g.types.map((t) => WIDGET_LIST.find((d) => d.type === t)).filter((d): d is WidgetDef => !!d && match(d)),
    })).filter((g) => g.items.length);
  });

  protected setQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
  }

  protected onToggle(id: string, e: Event): void {
    if (this.query()) return;
    const open = (e.target as HTMLDetailsElement).open;
    const next = open ? this.closed().filter((x) => x !== id) : [...new Set([...this.closed(), id])];
    if (next.length === this.closed().length && next.every((x) => this.closed().includes(x))) return;
    this.closed.set(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      // storage blocked: groups just reopen next time
    }
  }

  protected onDragStart(e: DragEvent, type: WidgetType): void {
    e.dataTransfer?.setData(WIDGET_DND_TYPE, type);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
}
