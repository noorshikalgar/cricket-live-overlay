import { CANVAS_H, CANVAS_W, type WidgetInstance } from '@cos/shared';

export const GRID = 8;
/** canvas px within which an edge snaps to a guide */
export const GUIDE_THRESHOLD = 8;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Guides {
  v: number[];
  h: number[];
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

const snapGrid = (v: number) => Math.round(v / GRID) * GRID;

/** Lines a widget can align to: canvas edges and centre, plus other widgets' edges and centres. */
function targets(others: WidgetInstance[]): { xs: number[]; ys: number[] } {
  const xs = [0, CANVAS_W / 2, CANVAS_W];
  const ys = [0, CANVAS_H / 2, CANVAS_H];
  for (const o of others) {
    if (!o.visible) continue;
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  return { xs, ys };
}

function nearest(points: number[], candidates: number[]): { offset: number; line: number } | null {
  let best: { offset: number; line: number } | null = null;
  for (const p of points) {
    for (const c of candidates) {
      const d = c - p;
      if (Math.abs(d) <= GUIDE_THRESHOLD && (!best || Math.abs(d) < Math.abs(best.offset))) best = { offset: d, line: c };
    }
  }
  return best;
}

/** Snap a moving box: grid first, then alignment guides win when close. */
export function snapMove(raw: Box, others: WidgetInstance[], grid: boolean, guides: boolean): { box: Box; guides: Guides } {
  const box = { ...raw };
  if (grid) {
    box.x = snapGrid(box.x);
    box.y = snapGrid(box.y);
  }
  const out: Guides = { v: [], h: [] };
  if (!guides) return { box, guides: out };
  const t = targets(others);
  const gx = nearest([raw.x, raw.x + raw.w / 2, raw.x + raw.w], t.xs);
  if (gx) {
    box.x = Math.round(raw.x + gx.offset);
    out.v.push(gx.line);
  }
  const gy = nearest([raw.y, raw.y + raw.h / 2, raw.y + raw.h], t.ys);
  if (gy) {
    box.y = Math.round(raw.y + gy.offset);
    out.h.push(gy.line);
  }
  return { box, guides: out };
}

/** Snap only the edges being dragged during a resize. */
export function snapResize(
  raw: Box,
  edges: Partial<Record<Edge, boolean>>,
  others: WidgetInstance[],
  grid: boolean,
  guides: boolean,
): { box: Box; guides: Guides } {
  let l = raw.x;
  let r = raw.x + raw.w;
  let t = raw.y;
  let b = raw.y + raw.h;
  const out: Guides = { v: [], h: [] };
  const tg = guides ? targets(others) : { xs: [], ys: [] };
  const snapEdge = (v: number, cands: number[], lines: number[]) => {
    const g = guides ? nearest([v], cands) : null;
    if (g) {
      lines.push(g.line);
      return g.line;
    }
    return grid ? snapGrid(v) : Math.round(v);
  };
  if (edges.left) l = snapEdge(l, tg.xs, out.v);
  if (edges.right) r = snapEdge(r, tg.xs, out.v);
  if (edges.top) t = snapEdge(t, tg.ys, out.h);
  if (edges.bottom) b = snapEdge(b, tg.ys, out.h);
  return {
    box: { x: Math.round(l), y: Math.round(t), w: Math.max(24, Math.round(r - l)), h: Math.max(24, Math.round(b - t)) },
    guides: out,
  };
}
