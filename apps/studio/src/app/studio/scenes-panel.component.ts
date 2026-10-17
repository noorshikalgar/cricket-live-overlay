import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject } from '@angular/core';
import { LiveStore } from '../core/live.store';
import { EditorStore } from './editor.store';

/**
 * Live workspace: every scene. Click one to load it into Preview (edit it
 * without viewers seeing); Take puts a scene on air (with its transition).
 */
@Component({
  selector: 'cos-scenes-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Scenes</h3>
    <ul>
      @for (s of scenes(); track s.id; let i = $index) {
        <li
          [class.on]="s.id === onAir()"
          [class.prev]="s.id === preview()"
          [attr.data-scene]="s.id"
          (click)="editor.editScene(s.id)"
          [title]="'Load ' + s.name + ' into Preview'"
        >
          <span class="num">{{ i + 1 }}</span>
          <span class="name">{{ s.name }}</span>
          @if (s.id === preview() && s.id !== onAir()) {
            <span class="badge pv">Preview</span>
          }
          @if (s.id === onAir()) {
            <span class="badge">● On air</span>
          } @else {
            <button type="button" class="take" (click)="$event.stopPropagation(); take(s.id)" [title]="'Put ' + s.name + ' on air (Alt+' + (i + 1) + ')'">Take</button>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      padding: 10px 10px 6px;
    }
    h3 {
      margin: 0 2px 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 700;
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 6px 6px 8px;
      border-radius: 8px;
      background: var(--ui-chip);
      border: 1px solid transparent;
    }
    li {
      cursor: pointer;
    }
    li:hover {
      border-color: var(--ui-border);
    }
    li.prev {
      border-color: rgba(34, 197, 94, 0.6);
      background: rgba(34, 197, 94, 0.08);
    }
    .badge.pv {
      color: var(--ui-accent);
    }
    li.on {
      border-color: rgba(239, 68, 68, 0.6);
      background: rgba(239, 68, 68, 0.1);
    }
    .num {
      width: 18px;
      text-align: center;
      font-size: 11px;
      color: var(--ui-muted);
      font-variant-numeric: tabular-nums;
    }
    .name {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .badge {
      font-size: 11px;
      font-weight: 700;
      color: #f87171;
      white-space: nowrap;
    }
    .take {
      padding: 4px 12px !important;
    }
  `,
})
export class ScenesPanelComponent {
  private readonly live = inject(LiveStore);
  protected readonly editor = inject(EditorStore);
  protected readonly preview = computed(() => this.editor.sceneId());
  protected readonly scenes = computed(() => this.live.sceneList());
  protected readonly onAir = computed(() => this.live.settings().activeSceneId);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // keep the on-air scene in view in a long list
    effect(() => {
      const id = this.onAir();
      setTimeout(() => this.host.querySelector(`[data-scene="${id}"]`)?.scrollIntoView({ block: 'nearest' }), 50);
    });
  }

  take(id: string): void {
    this.live.send({ type: 'scene:switch', sceneId: id });
  }
}
