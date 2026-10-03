import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CANVAS_H, CANVAS_W, type WidgetInstance, type WidgetType } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { SceneBackgroundComponent } from '../widgets/scene-background.component';
import { SceneRendererComponent } from '../widgets/scene-renderer.component';
import { CanvasContext } from './canvas-context';
import { EditBoxDirective } from './edit-box.directive';
import { EditorStore } from './editor.store';
import { SAMPLE_MATCH } from './sample-match';

export const WIDGET_DND_TYPE = 'application/x-cos-widget';

/** The scaled 16:9 editing surface: rendered widgets underneath, edit boxes on top. */
@Component({
  selector: 'cos-canvas',
  imports: [SceneBackgroundComponent, SceneRendererComponent, EditBoxDirective],
  providers: [CanvasContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="viewport"
      #viewport
      (pointerdown)="onBackgroundPointer($event)"
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
    >
      @if (editor.scene(); as scene) {
        <div class="frame" [style.width.px]="W * ctx.scale()" [style.height.px]="H * ctx.scale()">
          <div class="stage bg-checker" #stage
            [style.transform]="'scale(' + ctx.scale() + ')'"
            [style.--inv]="1 / ctx.scale()"
          >
            <cos-scene-background [background]="scene.background" />
            <cos-scene-renderer
              class="render"
              [scene]="scene"
              [match]="previewMatch()"
              [teamColor]="previewTeamColor()"
              mode="editor"
            />
            <div class="edit-layer">
              @for (w of scene.widgets; track w.id) {
                <div
                  class="edit-box"
                  [cosEditBox]="w"
                  [class.selected]="w.id === editor.selectedId()"
                  [class.locked]="w.locked"
                  [class.hidden-w]="!w.visible"
                  [style.left.px]="w.x"
                  [style.top.px]="w.y"
                  [style.width.px]="w.w"
                  [style.height.px]="w.h"
                  [style.z-index]="w.z"
                  (pointerdown)="select($event, w.id)"
                >
                  @if (isCard(w)) {
                    <button
                      type="button"
                      class="card-reload"
                      title="Reload this card's data (1 API call). Cards never refresh on their own."
                      (pointerdown)="$event.stopPropagation()"
                      (click)="reloadCard(w)"
                    >
                      ⟳ <span>{{ cardAge() }}</span>
                    </button>
                  }
                  @if (w.id === editor.selectedId()) {
                    <span class="tag">{{ w.name }}{{ w.locked ? ' · locked' : '' }}</span>
                    @if (!w.locked) {
                      @for (h of handles; track h) {
                        <span [class]="'rh rh-' + h"></span>
                      }
                    }
                    @if (ctx.activeBox()?.id === w.id) {
                      <span class="size">{{ ctx.activeBox()?.w }} × {{ ctx.activeBox()?.h }}</span>
                    }
                  }
                </div>
              }
              @for (x of ctx.guides().v; track $index) {
                <div class="guide v" [style.left.px]="x"></div>
              }
              @for (y of ctx.guides().h; track $index) {
                <div class="guide h" [style.top.px]="y"></div>
              }
            </div>
          </div>
        </div>
      } @else {
        <div class="empty">Connecting to the overlay server…</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-height: 0;
      min-width: 0;
    }
    .viewport {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .frame {
      position: relative;
      flex: none;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.08),
        0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .stage {
      position: absolute;
      left: 0;
      top: 0;
      width: 1920px;
      height: 1080px;
      transform-origin: 0 0;
      overflow: hidden;
    }
    .bg-checker {
      background-color: #1b1f27;
      background-image:
        linear-gradient(45deg, #262b35 25%, transparent 25%),
        linear-gradient(-45deg, #262b35 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #262b35 75%),
        linear-gradient(-45deg, transparent 75%, #262b35 75%);
      background-size: 48px 48px;
      background-position: 0 0, 0 24px, 24px -24px, -24px 0;
    }
    .render {
      pointer-events: none;
    }
    .edit-layer {
      position: absolute;
      inset: 0;
    }
    .edit-box {
      position: absolute;
      touch-action: none;
      user-select: none;
      cursor: move;
      outline: calc(1px * var(--inv)) solid transparent;
    }
    .edit-box:hover {
      outline-color: rgba(96, 165, 250, 0.6);
    }
    .edit-box.selected {
      outline: calc(2px * var(--inv)) solid #60a5fa;
    }
    .edit-box.locked {
      cursor: default;
    }
    .edit-box.locked.selected {
      outline-style: dashed;
      outline-color: #f59e0b;
    }
    .tag,
    .size {
      position: absolute;
      left: 0;
      bottom: 100%;
      margin-bottom: calc(4px * var(--inv));
      transform-origin: 0 100%;
      transform: scale(var(--inv));
      background: #60a5fa;
      color: #0b0f17;
      font: 600 12px/1 Inter, sans-serif;
      padding: 4px 6px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
    }
    .size {
      left: auto;
      right: 0;
      bottom: auto;
      top: 100%;
      margin: calc(4px * var(--inv)) 0 0;
      transform-origin: 100% 0;
      background: #0b0f17;
      color: #fff;
    }
    .rh {
      position: absolute;
      width: calc(12px * var(--inv));
      height: calc(12px * var(--inv));
      background: #fff;
      border: calc(2px * var(--inv)) solid #60a5fa;
      border-radius: 2px;
      transform: translate(-50%, -50%);
    }
    .rh-nw { left: 0; top: 0; cursor: nwse-resize; }
    .rh-n { left: 50%; top: 0; cursor: ns-resize; }
    .rh-ne { left: 100%; top: 0; cursor: nesw-resize; }
    .rh-e { left: 100%; top: 50%; cursor: ew-resize; }
    .rh-se { left: 100%; top: 100%; cursor: nwse-resize; }
    .rh-s { left: 50%; top: 100%; cursor: ns-resize; }
    .rh-sw { left: 0; top: 100%; cursor: nesw-resize; }
    .rh-w { left: 0; top: 50%; cursor: ew-resize; }
    .card-reload {
      position: absolute;
      right: 0;
      top: 0;
      transform-origin: 100% 0;
      transform: scale(var(--inv));
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 9px;
      border: 0;
      border-radius: 0 0 0 6px;
      background: rgba(11, 15, 23, 0.85);
      color: #fff;
      font: 600 13px/1 Inter, sans-serif;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.12s;
      z-index: 2;
    }
    .card-reload span {
      font-weight: 500;
      color: #9aa4b2;
    }
    .edit-box:hover .card-reload,
    .edit-box.selected .card-reload {
      opacity: 1;
    }
    .card-reload:hover {
      background: #22c55e;
      color: #06240f;
    }
    .card-reload:hover span {
      color: #06240f;
    }
    .guide {
      position: absolute;
      background: #f472b6;
      pointer-events: none;
      z-index: 100000;
    }
    .guide.v {
      top: 0;
      bottom: 0;
      width: calc(1px * var(--inv));
    }
    .guide.h {
      left: 0;
      right: 0;
      height: calc(1px * var(--inv));
    }
    .empty {
      color: #9aa4b2;
      font: 500 14px Inter, sans-serif;
    }
  `,
})
export class CanvasComponent {
  protected readonly editor = inject(EditorStore);
  protected readonly ctx = inject(CanvasContext);
  private readonly live = inject(LiveStore);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');

  protected readonly W = CANVAS_W;
  protected readonly H = CANVAS_H;
  protected readonly handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  protected readonly previewMatch = computed(() => this.live.match() ?? SAMPLE_MATCH);
  protected readonly previewTeamColor = computed(() => {
    const m = this.previewMatch();
    const inn = m.innings.at(-1);
    return m.teams.find((t) => t.shortCode === inn?.battingTeam)?.primaryColor ?? null;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => clearInterval(this.ageTimer));
    afterNextRender(() => {
      const el = this.viewport().nativeElement;
      const ro = new ResizeObserver(() => this.fit());
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
      this.fit();
    });
  }

  private fit(): void {
    const el = this.viewport().nativeElement;
    const pad = 32;
    const s = Math.min((el.clientWidth - pad) / CANVAS_W, (el.clientHeight - pad) / CANVAS_H);
    this.ctx.scale.set(Math.max(0.1, Math.round(s * 1000) / 1000));
  }

  protected isCard(w: WidgetInstance): boolean {
    return w.type === 'scorecard' || w.type === 'teamCard' || w.type === 'playerCard';
  }

  private readonly now = signal(Date.now());
  private readonly ageTimer = setInterval(() => this.now.set(Date.now()), 10_000);

  protected readonly cardAge = computed(() => {
    const at = this.live.scorecard()?.updatedAt;
    if (!at) return 'not loaded';
    const s = Math.max(0, Math.round((this.now() - at) / 1000));
    return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
  });

  /** ⟳ on a card: fresh scorecard; team and player cards also get the XIs if they're missing */
  protected reloadCard(w: WidgetInstance): void {
    this.live.send({ type: 'cards:fetch', kind: 'scorecard', force: true });
    if (w.type !== 'scorecard' && !this.live.squads()) this.live.send({ type: 'cards:fetch', kind: 'squads', force: true });
  }

  // no stopPropagation here: interact.js listens on the document
  protected select(_e: PointerEvent, id: string): void {
    this.editor.selectedId.set(id);
  }

  protected onBackgroundPointer(e: PointerEvent): void {
    if (!(e.target as Element | null)?.closest('.edit-box')) this.editor.selectedId.set(null);
  }

  protected onDragOver(e: DragEvent): void {
    if (e.dataTransfer?.types.includes(WIDGET_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  protected onDrop(e: DragEvent): void {
    const type = e.dataTransfer?.getData(WIDGET_DND_TYPE) as WidgetType | undefined;
    const stage = this.stage()?.nativeElement;
    if (!type || !stage) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const s = this.ctx.scale();
    this.editor.add(type, { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s });
  }
}
