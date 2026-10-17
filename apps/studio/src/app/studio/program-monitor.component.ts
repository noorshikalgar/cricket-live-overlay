import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { LiveStore } from '../core/live.store';
import { WorkspaceStore } from './workspace.store';

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const HEADER_H = 30;

/**
 * Program monitor: exactly what's on air, rendered by the real Output page in
 * read-only "monitor" mode. Docked (Live workspace), floating over the canvas
 * (Design), or popped out into its own window for a second screen. When it is
 * hidden or popped out, nothing renders here, so it costs nothing.
 */
@Component({
  selector: 'cos-program-monitor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.float]': "mode() === 'float'", '[class.dock]': "mode() === 'dock'", '[style]': 'hostStyle()' },
  template: `
    <header (pointerdown)="dragStart($event)" [class.draggable]="mode() === 'float'">
      <span class="live-dot" [class.off]="!onAir()"></span>
      <span class="title">Program</span>
      <span class="scene" [title]="onAirName()">{{ onAirName() || 'nothing on air' }}</span>
      <span class="spacer"></span>
      @if (!ws.poppedOut()) {
        <button type="button" class="icon" (click)="ws.popOut()" (pointerdown)="$event.stopPropagation()" title="Open in its own window (second screen)">⧉</button>
      }
      @if (mode() === 'float') {
        <button type="button" class="icon" (click)="ws.setFloating(false)" (pointerdown)="$event.stopPropagation()" title="Close the monitor">✕</button>
      }
    </header>
    <div class="screen" #screen>
      @if (ws.poppedOut()) {
        <div class="away">
          <p>Program is open in its own window.</p>
          <button type="button" (click)="ws.bringBack()">Show it here again</button>
        </div>
      } @else {
        <div class="frame" [style.width.px]="frame().w" [style.height.px]="frame().h">
          <iframe
            src="/output?monitor"
            title="Program output"
            tabindex="-1"
            [style.transform]="'scale(' + frame().scale + ')'"
          ></iframe>
        </div>
      }
    </div>
    @if (mode() === 'float') {
      <span class="resize" (pointerdown)="resizeStart($event)" title="Resize"></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: #05070b;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      overflow: hidden;
    }
    :host(.float) {
      position: fixed;
      z-index: 60;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    }
    :host(.dock) {
      flex: 1;
    }
    header {
      flex: none;
      height: ${HEADER_H}px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 6px 0 10px;
      background: var(--ui-panel);
      border-bottom: 1px solid var(--ui-border);
      font-size: 12px;
      user-select: none;
    }
    header.draggable {
      cursor: move;
    }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 6px #ef4444;
    }
    .live-dot.off {
      background: var(--ui-muted);
      box-shadow: none;
    }
    .title {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 11px;
    }
    .scene {
      color: var(--ui-muted);
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .spacer {
      flex: 1;
    }
    header button.icon {
      width: 24px;
      height: 22px;
      padding: 0;
      justify-content: center;
      font-size: 12px;
    }
    .screen {
      flex: 1;
      min-height: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .frame {
      position: relative;
      overflow: hidden;
    }
    iframe {
      position: absolute;
      left: 0;
      top: 0;
      width: ${CANVAS_W}px;
      height: ${CANVAS_H}px;
      border: 0;
      transform-origin: 0 0;
      /* a picture of the output, not something to click */
      pointer-events: none;
    }
    .away {
      text-align: center;
      color: var(--ui-muted);
      font-size: 12px;
    }
    .resize {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, var(--ui-muted) 50%, var(--ui-muted) 60%, transparent 60%, transparent 70%, var(--ui-muted) 70%, var(--ui-muted) 80%, transparent 80%);
    }
  `,
})
export class ProgramMonitorComponent {
  readonly mode = input<'dock' | 'float'>('dock');
  protected readonly ws = inject(WorkspaceStore);
  private readonly live = inject(LiveStore);
  private readonly screen = viewChild<ElementRef<HTMLElement>>('screen');

  protected readonly onAir = computed(() => this.live.settings().activeSceneId);
  protected readonly onAirName = computed(() => {
    const id = this.onAir();
    return id ? (this.live.scenes()[id]?.name ?? '') : '';
  });

  /** the space for the picture, measured; the frame keeps 16:9 inside it */
  private readonly box = signal({ w: 0, h: 0 });
  protected readonly frame = computed(() => {
    const { w, h } = this.box();
    const scale = Math.max(0.05, Math.min(w / CANVAS_W, h / CANVAS_H));
    return { w: Math.floor(CANVAS_W * scale), h: Math.floor(CANVAS_H * scale), scale };
  });

  /** floating: position and size from the store, kept inside the window */
  protected readonly hostStyle = computed(() => {
    if (this.mode() !== 'float') return '';
    const r = this.placed();
    return `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${Math.round((r.w * CANVAS_H) / CANVAS_W) + HEADER_H}px`;
  });

  private readonly viewport = signal({ w: window.innerWidth, h: window.innerHeight });
  private readonly placed = computed(() => {
    const f = this.ws.float();
    const { w: vw, h: vh } = this.viewport();
    const w = Math.max(240, Math.min(f.w, vw - 20));
    const h = Math.round((w * CANVAS_H) / CANVAS_W) + HEADER_H;
    // first time: bottom-right corner, above the bottom panel
    const x = f.x < 0 ? vw - w - 330 : Math.min(Math.max(0, f.x), vw - w);
    const y = f.y < 0 ? vh - h - 230 : Math.min(Math.max(0, f.y), vh - h);
    return { x: Math.max(0, x), y: Math.max(0, y), w };
  });

  constructor() {
    const ro = new ResizeObserver(() => this.measure());
    const onResize = () => this.viewport.set({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    afterNextRender(() => {
      const el = this.screen()?.nativeElement;
      if (el) ro.observe(el);
      this.measure();
    });
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    });
  }

  private measure(): void {
    const el = this.screen()?.nativeElement;
    if (el) this.box.set({ w: el.clientWidth, h: el.clientHeight });
  }

  protected dragStart(e: PointerEvent): void {
    if (this.mode() !== 'float' || e.button !== 0) return;
    e.preventDefault();
    const start = this.placed();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => this.ws.setFloat({ x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy, w: start.w });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  protected resizeStart(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const start = this.placed();
    const sx = e.clientX;
    const move = (ev: PointerEvent) => this.ws.setFloat({ x: start.x, y: start.y, w: Math.max(240, start.w + ev.clientX - sx) });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
