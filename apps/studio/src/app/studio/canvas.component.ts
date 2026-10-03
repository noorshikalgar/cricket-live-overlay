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
import { WIDGET_REGISTRY } from '../widgets/widget-registry';
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
              (heightChange)="fitHeight($event)"
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
                  [style.height.px]="w.props['minimized'] && minimizedH()[w.id] ? minimizedH()[w.id] : w.h"
                  [style.z-index]="w.z"
                  (pointerdown)="select($event, w.id)"
                >
                  @if (isCard(w)) {
                    <!-- window title bar for cards: Studio only, never on /output -->
                    <div class="win-bar" [class.sel]="w.id === editor.selectedId()">
                      <span class="win-title">{{ registry[w.type].icon }} {{ cardTitle(w) }}</span>
                      <button
                        type="button"
                        class="win-btn reload"
                        title="Reload this card's data (1 API call). Cards never refresh on their own."
                        (pointerdown)="$event.stopPropagation()"
                        (click)="reloadCard(w)"
                      >
                        ⟳ <span>{{ cardAge() }}</span>
                      </button>
                      <button
                        type="button"
                        class="win-btn"
                        [title]="w.props['minimized'] ? 'Restore' : 'Minimize'"
                        (pointerdown)="$event.stopPropagation()"
                        (click)="toggleMinimized(w)"
                      >
                        {{ w.props['minimized'] ? '▢' : '–' }}
                      </button>
                      <button
                        type="button"
                        class="win-btn close"
                        title="Close (hide on air; reopen from Live cards or Layers)"
                        (pointerdown)="$event.stopPropagation()"
                        (click)="editor.updateWidget(w.id, { visible: false })"
                      >
                        ✕
                      </button>
                    </div>
                  }
                  @if (w.id === editor.selectedId()) {
                    @if (!isCard(w)) {
                      <span class="tag">{{ w.name }}{{ w.locked ? ' · locked' : '' }}</span>
                    }
                    @if (!w.locked) {
                      <!-- cards scale by width (their height follows the content), so no top/bottom-only handles -->
                      @for (h of isCard(w) ? cardHandles : handles; track h) {
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
      /* above a card's title bar */
      z-index: 3;
    }
    .rh-nw { left: 0; top: 0; cursor: nwse-resize; }
    .rh-n { left: 50%; top: 0; cursor: ns-resize; }
    .rh-ne { left: 100%; top: 0; cursor: nesw-resize; }
    .rh-e { left: 100%; top: 50%; cursor: ew-resize; }
    .rh-se { left: 100%; top: 100%; cursor: nwse-resize; }
    .rh-s { left: 50%; top: 100%; cursor: ns-resize; }
    .rh-sw { left: 0; top: 100%; cursor: nesw-resize; }
    .rh-w { left: 0; top: 50%; cursor: ew-resize; }
    /* card window chrome, sized in screen px whatever the zoom */
    .win-bar {
      position: absolute;
      left: 0;
      bottom: 100%;
      width: calc(100% / var(--inv));
      transform-origin: 0 100%;
      transform: scale(var(--inv));
      height: 26px;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0 2px 0 8px;
      background: rgba(30, 38, 52, 0.92);
      border: 1px solid #2c3647;
      border-bottom: 0;
      border-radius: 6px 6px 0 0;
      color: #cfd6e2;
      font: 600 12px/1 Inter, sans-serif;
      cursor: move;
      z-index: 2;
    }
    .win-bar.sel {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
    }
    .win-title {
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .win-btn {
      height: 22px;
      min-width: 24px;
      padding: 0 6px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      font: 600 12px/1 Inter, sans-serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }
    .win-btn span {
      font-weight: 500;
      opacity: 0.75;
    }
    .win-btn:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .win-btn.close:hover {
      background: #ef4444;
      color: #fff;
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
  protected readonly cardHandles = ['nw', 'ne', 'e', 'se', 'sw', 'w'];

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

  /** Cards follow their content height; keep the widget box (and the Output) in step. */
  /** minimised cards: outline height of just the title strip (the stored height is kept for restore) */
  protected readonly minimizedH = signal<Record<string, number>>({});

  protected fitHeight(e: { id: string; h: number; minimized: boolean }): void {
    if (e.minimized) {
      if (this.minimizedH()[e.id] !== e.h) this.minimizedH.update((m) => ({ ...m, [e.id]: e.h }));
      return;
    }
    if (this.minimizedH()[e.id] !== undefined) {
      this.minimizedH.update((m) => {
        const next = { ...m };
        delete next[e.id];
        return next;
      });
    }
    if (this.ctx.activeBox() || Math.abs(e.h - (this.editor.scene()?.widgets.find((x) => x.id === e.id)?.h ?? e.h)) <= 1) return;
    const scene = this.editor.scene();
    const w = scene?.widgets.find((x) => x.id === e.id);
    if (!scene || !w || w.h === e.h) return;
    this.live.pushScene({ ...scene, widgets: scene.widgets.map((x) => (x.id === e.id ? { ...x, h: e.h } : x)), updatedAt: Date.now() });
  }

  protected readonly registry = WIDGET_REGISTRY;

  protected cardTitle(w: WidgetInstance): string {
    if (w.type === 'playerCard') return String(w.props['playerName'] || 'Player card');
    if (w.type === 'teamCard') return 'Team card';
    return 'Scorecard';
  }

  protected toggleMinimized(w: WidgetInstance): void {
    this.editor.updateWidget(w.id, { props: { ...w.props, minimized: !w.props['minimized'] } });
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
