import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';
import interact from 'interactjs';
import type { WidgetInstance } from '@cos/shared';
import { CanvasContext } from './canvas-context';
import { EditorStore } from './editor.store';
import { snapMove, snapResize, type Box } from './snap';

type Interactable = ReturnType<typeof interact>;

interface ResizeEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/**
 * Makes one edit box draggable and resizable with interact.js. Pointer deltas
 * arrive in screen px and are divided by the canvas zoom to get canvas px.
 * Alt disables snapping; Shift locks the aspect ratio while resizing.
 */
@Directive({ selector: '[cosEditBox]' })
export class EditBoxDirective {
  readonly widget = input.required<WidgetInstance>({ alias: 'cosEditBox' });

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly editor = inject(EditorStore);
  private readonly ctx = inject(CanvasContext);
  private it: Interactable | null = null;

  private start: Box = { x: 0, y: 0, w: 0, h: 0 };
  private acc = { l: 0, t: 0, r: 0, b: 0 };

  constructor() {
    afterNextRender(() => this.setup());
    effect(() => {
      const locked = this.widget().locked;
      this.it?.draggable(!locked);
      this.it?.resizable(!locked);
    });
    inject(DestroyRef).onDestroy(() => this.it?.unset());
  }

  private others(): WidgetInstance[] {
    const id = this.widget().id;
    return (this.editor.scene()?.widgets ?? []).filter((w) => w.id !== id);
  }

  private apply(box: Box): void {
    const id = this.widget().id;
    this.editor.gestureUpdate((s) => {
      const w = s.widgets.find((x) => x.id === id);
      if (w) Object.assign(w, box);
    });
  }

  private begin(): void {
    const w = this.widget();
    this.editor.selectedId.set(w.id);
    this.editor.beginGesture();
    this.start = { x: w.x, y: w.y, w: w.w, h: w.h };
    this.acc = { l: w.x, t: w.y, r: w.x + w.w, b: w.y + w.h };
  }

  private finish(): void {
    this.editor.endGesture();
    this.ctx.guides.set({ v: [], h: [] });
    this.ctx.activeBox.set(null);
  }

  private setup(): void {
    const locked = this.widget().locked;
    this.it = interact(this.el)
      .draggable({
        enabled: !locked,
        listeners: {
          start: () => this.begin(),
          move: (e: { dx: number; dy: number; altKey: boolean }) => {
            const s = this.ctx.scale();
            this.acc.l += e.dx / s;
            this.acc.t += e.dy / s;
            const raw = { x: this.acc.l, y: this.acc.t, w: this.start.w, h: this.start.h };
            const snap = !e.altKey;
            const { box, guides } = snapMove(raw, this.others(), snap && this.editor.snap(), snap);
            this.apply({ x: box.x, y: box.y, w: this.start.w, h: this.start.h });
            this.ctx.guides.set(guides);
          },
          end: () => this.finish(),
        },
      })
      .resizable({
        enabled: !locked,
        edges: {
          left: '.rh-w, .rh-nw, .rh-sw',
          right: '.rh-e, .rh-ne, .rh-se',
          top: '.rh-n, .rh-nw, .rh-ne',
          bottom: '.rh-s, .rh-sw, .rh-se',
        },
        listeners: {
          start: () => this.begin(),
          move: (e: {
            deltaRect?: { left: number; right: number; top: number; bottom: number };
            edges?: ResizeEdges;
            altKey: boolean;
            shiftKey: boolean;
          }) => {
            const s = this.ctx.scale();
            const d = e.deltaRect ?? { left: 0, right: 0, top: 0, bottom: 0 };
            this.acc.l += d.left / s;
            this.acc.r += d.right / s;
            this.acc.t += d.top / s;
            this.acc.b += d.bottom / s;
            let raw: Box = { x: this.acc.l, y: this.acc.t, w: this.acc.r - this.acc.l, h: this.acc.b - this.acc.t };
            const edges = e.edges ?? {};
            if (e.shiftKey) {
              raw = lockAspect(raw, this.start, edges);
              const box = { x: Math.round(raw.x), y: Math.round(raw.y), w: Math.max(24, Math.round(raw.w)), h: Math.max(24, Math.round(raw.h)) };
              this.apply(box);
              this.ctx.activeBox.set({ id: this.widget().id, w: box.w, h: box.h });
              return;
            }
            const snap = !e.altKey;
            const { box, guides } = snapResize(raw, edges, this.others(), snap && this.editor.snap(), snap);
            this.apply(box);
            this.ctx.guides.set(guides);
            this.ctx.activeBox.set({ id: this.widget().id, w: box.w, h: box.h });
          },
          end: () => this.finish(),
        },
      })
      .styleCursor(false);
  }
}

function lockAspect(raw: Box, start: Box, edges: ResizeEdges): Box {
  const ratio = start.w / start.h;
  const horizontal = edges.left || edges.right;
  let { x, y, w, h } = raw;
  if (horizontal) {
    h = w / ratio;
    if (edges.top) y = start.y + start.h - h;
  } else {
    w = h * ratio;
    if (edges.left) x = start.x + start.w - w;
  }
  return { x, y, w, h };
}
