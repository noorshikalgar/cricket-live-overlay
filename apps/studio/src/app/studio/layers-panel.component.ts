import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WIDGET_REGISTRY } from '../widgets/widget-registry';
import { EditorStore } from './editor.store';

/** Stacking order, top layer first: select, hide, lock, reorder, duplicate, delete. */
@Component({
  selector: 'cos-layers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Layers</h3>
    <ul>
      @for (w of layers(); track w.id; let first = $first, last = $last) {
        <li [class.sel]="w.id === editor.selectedId()" [class.off]="!w.visible" (click)="editor.selectedId.set(w.id)">
          <span class="ic">{{ registry[w.type].icon }}</span>
          <span class="nm">{{ w.name }}</span>
          <span class="acts" (click)="$event.stopPropagation()">
            <button type="button" [title]="w.visible ? 'Hide' : 'Show'" (click)="editor.updateWidget(w.id, { visible: !w.visible })">
              {{ w.visible ? '◉' : '○' }}
            </button>
            <button type="button" [title]="w.locked ? 'Unlock' : 'Lock'" [class.on]="w.locked" (click)="editor.updateWidget(w.id, { locked: !w.locked })">
              {{ w.locked ? '🔒' : '🔓' }}
            </button>
            <button type="button" title="Bring forward" [disabled]="first" (click)="editor.reorder(w.id, 1)">▲</button>
            <button type="button" title="Send backward" [disabled]="last" (click)="editor.reorder(w.id, -1)">▼</button>
            <button type="button" title="Duplicate" (click)="editor.duplicate(w.id)">⧉</button>
            <button type="button" title="Delete" class="del" (click)="editor.remove(w.id)">✕</button>
          </span>
        </li>
      } @empty {
        <li class="none">No widgets yet. Add one from the library.</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      padding: 10px 10px 20px;
    }
    h3 {
      margin: 0 0 8px 4px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 600;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    li:hover {
      background: var(--ui-chip);
    }
    li.sel {
      background: var(--ui-accent-soft);
    }
    li.off .nm {
      opacity: 0.45;
    }
    .ic {
      width: 20px;
      text-align: center;
      color: var(--ui-muted);
    }
    .nm {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .acts {
      display: flex;
      gap: 1px;
      opacity: 0.35;
      transition: opacity 0.12s;
    }
    li:hover .acts,
    li.sel .acts {
      opacity: 1;
    }
    .acts button {
      background: none;
      border: 0;
      color: var(--ui-text);
      width: 22px;
      height: 22px;
      padding: 0;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .acts button:hover:not(:disabled) {
      background: var(--ui-chip-strong);
    }
    .acts button:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .acts .del:hover {
      color: #f87171;
    }
    .none {
      color: var(--ui-muted);
      cursor: default;
    }
  `,
})
export class LayersPanelComponent {
  protected readonly editor = inject(EditorStore);
  protected readonly registry = WIDGET_REGISTRY;
  protected readonly layers = computed(() => [...(this.editor.scene()?.widgets ?? [])].sort((a, b) => b.z - a.z));
}
