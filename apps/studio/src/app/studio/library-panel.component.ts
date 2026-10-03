import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { WidgetType } from '@cos/shared';
import { WIDGET_LIST } from '../widgets/widget-registry';
import { WIDGET_DND_TYPE } from './canvas.component';
import { EditorStore } from './editor.store';

const GROUPS: { title: string; types: WidgetType[] }[] = [
  { title: 'Live data', types: ['scorebug', 'batters', 'bowler', 'thisOver', 'partnership', 'recentOvers', 'matchInfo'] },
  { title: 'Moments', types: ['banner', 'ticker'] },
  { title: 'Cards', types: ['scorecard', 'teamCard', 'playerCard'] },
  { title: 'Studio', types: ['camera', 'text', 'image', 'clock'] },
];

/** Left panel: click to add at canvas centre, or drag onto the canvas. */
@Component({
  selector: 'cos-library-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (g of groups; track g.title) {
      <h3>{{ g.title }}</h3>
      <div class="grid">
        @for (d of byGroup(g.types); track d.type) {
          <button
            type="button"
            class="item"
            draggable="true"
            [title]="d.description"
            (click)="editor.add(d.type)"
            (dragstart)="onDragStart($event, d.type)"
          >
            <span class="ic">{{ d.icon }}</span>
            <span class="lb">{{ d.label }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 12px 12px 24px;
      overflow-y: auto;
    }
    h3 {
      margin: 14px 2px 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 600;
    }
    h3:first-child {
      margin-top: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      padding: 10px;
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
      font-size: 16px;
      color: var(--ui-accent);
    }
    .lb {
      font-size: 12px;
      font-weight: 500;
    }
  `,
})
export class LibraryPanelComponent {
  protected readonly editor = inject(EditorStore);
  protected readonly groups = GROUPS;

  protected byGroup(types: WidgetType[]) {
    return WIDGET_LIST.filter((d) => types.includes(d.type));
  }

  protected onDragStart(e: DragEvent, type: WidgetType): void {
    e.dataTransfer?.setData(WIDGET_DND_TYPE, type);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
}
