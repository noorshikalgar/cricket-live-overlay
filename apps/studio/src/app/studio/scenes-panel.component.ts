import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject } from '@angular/core';
import { LiveStore } from '../core/live.store';

/**
 * Live workspace: every scene, which one is on air, and Take to put another
 * on air (with its transition). The Studio follows the on-air scene, so the
 * layers and settings beside it control what viewers see.
 */
@Component({
  selector: 'cos-scenes-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Scenes</h3>
    <ul>
      @for (s of scenes(); track s.id; let i = $index) {
        <li [class.on]="s.id === onAir()" [attr.data-scene]="s.id">
          <span class="num">{{ i + 1 }}</span>
          <span class="name" [title]="s.name">{{ s.name }}</span>
          @if (s.id === onAir()) {
            <span class="badge">● On air</span>
          } @else {
            <button type="button" class="take" (click)="take(s.id)" [title]="'Put ' + s.name + ' on air (Alt+' + (i + 1) + ')'">Take</button>
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
