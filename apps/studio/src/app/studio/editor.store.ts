import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  CANVAS_H,
  CANVAS_W,
  DEFAULT_BACKGROUND,
  DEFAULT_TRANSITION,
  createWidget,
  newId,
  type Scene,
  type SceneBackground,
  type SceneTransition,
  type WidgetInstance,
  type WidgetType,
} from '@cos/shared';
import { LiveStore } from '../core/live.store';

const HISTORY_LIMIT = 100;
/** edits to the same field within this window merge into one undo step */
const COALESCE_MS = 700;

/**
 * Editor state: which scene is being edited, the selection, and undo/redo.
 * Every edit goes through `commit` (or a gesture), which pushes the new scene
 * to the server and from there to every Output.
 */
@Injectable()
export class EditorStore {
  private readonly live = inject(LiveStore);

  readonly sceneId = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly snap = signal(true);

  readonly scene = computed<Scene | null>(() => {
    const id = this.sceneId();
    return id ? (this.live.scenes()[id] ?? null) : null;
  });
  readonly selected = computed<WidgetInstance | null>(() => {
    const id = this.selectedId();
    return this.scene()?.widgets.find((w) => w.id === id) ?? null;
  });
  readonly isOnAir = computed(() => !!this.sceneId() && this.sceneId() === this.live.settings().activeSceneId);

  private past: Scene[] = [];
  private future: Scene[] = [];
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  private lastCoalesce: { key: string; at: number } | null = null;
  private gestureStart: Scene | null = null;

  constructor() {
    // pick a scene to edit once scenes arrive; follow deletions
    effect(() => {
      const scenes = this.live.scenes();
      const id = this.sceneId();
      if (!this.live.ready()) return;
      if (!id || !scenes[id]) {
        untracked(() => {
          const fallback = this.live.settings().activeSceneId ?? this.live.sceneList()[0]?.id ?? null;
          this.editScene(fallback && scenes[fallback] ? fallback : (this.live.sceneList()[0]?.id ?? null));
        });
      }
    });
  }

  editScene(id: string | null): void {
    if (id === this.sceneId()) return;
    this.sceneId.set(id);
    this.selectedId.set(null);
    this.past = [];
    this.future = [];
    this.syncFlags();
  }

  // ---- history -------------------------------------------------------------

  /** Apply an edit to the current scene. `coalesceKey` merges rapid edits (typing, sliders). */
  commit(mutate: (s: Scene) => void, coalesceKey?: string): void {
    const cur = this.scene();
    if (!cur) return;
    const next = structuredClone(cur);
    mutate(next);
    const now = Date.now();
    const merge =
      !!coalesceKey && this.lastCoalesce?.key === coalesceKey && now - this.lastCoalesce.at < COALESCE_MS;
    if (!merge && !this.gestureStart) this.pushPast(cur);
    this.lastCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
    this.future = [];
    this.live.pushScene(next);
    this.syncFlags();
  }

  /** Start of a drag/resize: live updates follow without history until `endGesture`. */
  beginGesture(): void {
    this.gestureStart = this.scene();
  }

  /** Live update during a gesture (no history entry). */
  gestureUpdate(mutate: (s: Scene) => void): void {
    const cur = this.scene();
    if (!cur) return;
    const next = structuredClone(cur);
    mutate(next);
    this.live.pushScene(next);
  }

  endGesture(): void {
    const start = this.gestureStart;
    this.gestureStart = null;
    const cur = this.scene();
    if (start && cur && JSON.stringify(start.widgets) !== JSON.stringify(cur.widgets)) {
      this.pushPast(start);
      this.future = [];
      this.syncFlags();
    }
    this.live.flushScenes();
  }

  undo(): void {
    const cur = this.scene();
    const prev = this.past.pop();
    if (!cur || !prev) return;
    this.future.push(cur);
    this.live.pushScene({ ...prev, updatedAt: Date.now() });
    this.lastCoalesce = null;
    this.fixSelection(prev);
    this.syncFlags();
  }

  redo(): void {
    const cur = this.scene();
    const next = this.future.pop();
    if (!cur || !next) return;
    this.past.push(cur);
    this.live.pushScene({ ...next, updatedAt: Date.now() });
    this.lastCoalesce = null;
    this.fixSelection(next);
    this.syncFlags();
  }

  private pushPast(s: Scene): void {
    this.past.push(s);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
  }

  private syncFlags(): void {
    this.canUndo.set(this.past.length > 0);
    this.canRedo.set(this.future.length > 0);
  }

  private fixSelection(s: Scene): void {
    if (!s.widgets.some((w) => w.id === this.selectedId())) this.selectedId.set(null);
  }

  // ---- widget operations ---------------------------------------------------

  updateWidget(id: string, patch: Partial<WidgetInstance>, coalesceKey?: string): void {
    this.commit((s) => {
      const w = s.widgets.find((x) => x.id === id);
      if (w) Object.assign(w, patch);
    }, coalesceKey);
  }

  add(type: WidgetType, at?: { x: number; y: number }): void {
    const s = this.scene();
    if (!s) return;
    const w = createWidget(type);
    if (at) {
      w.x = clamp(Math.round(at.x - w.w / 2), 0, CANVAS_W - w.w);
      w.y = clamp(Math.round(at.y - w.h / 2), 0, CANVAS_H - w.h);
    }
    w.z = maxZ(s) + 1;
    this.commit((scene) => scene.widgets.push(w));
    this.selectedId.set(w.id);
  }

  remove(id: string): void {
    this.commit((s) => {
      s.widgets = s.widgets.filter((w) => w.id !== id);
    });
    if (this.selectedId() === id) this.selectedId.set(null);
  }

  duplicate(id: string): void {
    const s = this.scene();
    const src = s?.widgets.find((w) => w.id === id);
    if (!s || !src) return;
    const copy: WidgetInstance = {
      ...structuredClone(src),
      id: newId(),
      name: `${src.name} copy`,
      x: clamp(src.x + 24, 0, CANVAS_W - src.w),
      y: clamp(src.y + 24, 0, CANVAS_H - src.h),
      z: maxZ(s) + 1,
      locked: false,
    };
    this.commit((scene) => scene.widgets.push(copy));
    this.selectedId.set(copy.id);
  }

  /** Move a widget one step up/down the stack and renumber z as 1..n. */
  reorder(id: string, dir: 1 | -1): void {
    this.commit((s) => {
      const sorted = [...s.widgets].sort((a, b) => a.z - b.z);
      const i = sorted.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= sorted.length) return;
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      sorted.forEach((w, k) => (w.z = k + 1));
    });
  }

  toFront(id: string): void {
    this.commit((s) => {
      const w = s.widgets.find((x) => x.id === id);
      if (w) w.z = maxZ(s) + 1;
    });
  }

  nudge(dx: number, dy: number): void {
    const w = this.selected();
    if (!w || w.locked) return;
    this.updateWidget(
      w.id,
      { x: clamp(w.x + dx, -w.w + 8, CANVAS_W - 8), y: clamp(w.y + dy, -w.h + 8, CANVAS_H - 8) },
      `nudge:${w.id}`,
    );
  }

  setBackground(patch: Partial<SceneBackground>, coalesceKey?: string): void {
    this.commit((s) => {
      s.background = { ...DEFAULT_BACKGROUND, ...s.background, ...patch };
    }, coalesceKey);
  }

  setTransition(patch: Partial<SceneTransition>, coalesceKey?: string): void {
    this.commit((s) => {
      s.transition = { ...DEFAULT_TRANSITION, ...s.transition, ...patch };
    }, coalesceKey);
  }

  setTheme(theme: Scene['theme']): void {
    this.commit((s) => {
      s.theme = theme;
    });
  }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function maxZ(s: Scene): number {
  return s.widgets.reduce((m, w) => Math.max(m, w.z), 0);
}
