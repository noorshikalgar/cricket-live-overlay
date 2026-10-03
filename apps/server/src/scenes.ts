import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CANVAS_H,
  CANVAS_W,
  BACKGROUND_KINDS,
  DEFAULT_BACKGROUND,
  DEFAULT_SETTINGS,
  DEFAULT_POINTER,
  DEFAULT_TRANSITION,
  POINTER_STYLES,
  TRANSITION_KINDS,
  type ScenePointer,
  type SceneTransition,
  type SceneBackground,
  WIDGET_TYPES,
  createStarterScenes,
  newId,
  type AppSettings,
  type Scene,
  type WidgetInstance,
} from '@cos/shared';

const SAVE_DEBOUNCE_MS = 500;

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

function isWidget(v: unknown): v is WidgetInstance {
  if (typeof v !== 'object' || v === null) return false;
  const w = v as Record<string, unknown>;
  return (
    typeof w['id'] === 'string' &&
    typeof w['type'] === 'string' &&
    (WIDGET_TYPES as string[]).includes(w['type']) &&
    ['x', 'y', 'w', 'h', 'z'].every((k) => typeof w[k] === 'number' && Number.isFinite(w[k])) &&
    typeof w['style'] === 'object' &&
    typeof w['props'] === 'object'
  );
}

const HEX = /^#[0-9a-f]{3,8}$/i;

function validBackground(v: unknown): SceneBackground {
  const b = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const kind = BACKGROUND_KINDS.some((k) => k.value === b['kind']) ? (b['kind'] as SceneBackground['kind']) : 'transparent';
  const color = typeof b['color'] === 'string' && HEX.test(b['color']) ? b['color'] : DEFAULT_BACKGROUND.color;
  const color2 = typeof b['color2'] === 'string' && HEX.test(b['color2']) ? b['color2'] : DEFAULT_BACKGROUND.color2;
  // only our own uploads or the bundled pitch: never an arbitrary remote URL on air
  const image = typeof b['image'] === 'string' && /^\/uploads\/[\w.-]+$/.test(b['image']) ? b['image'] : '';
  const dim = typeof b['dim'] === 'number' && Number.isFinite(b['dim']) ? Math.min(0.8, Math.max(0, b['dim'])) : 0;
  return { kind, color, color2, image, dim };
}

function validTransition(v: unknown): SceneTransition {
  const t = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const kind = TRANSITION_KINDS.some((k) => k.value === t['kind']) ? (t['kind'] as SceneTransition['kind']) : DEFAULT_TRANSITION.kind;
  const color = typeof t['color'] === 'string' && (t['color'] === '' || HEX.test(t['color'])) ? t['color'] : '';
  const d = typeof t['duration'] === 'number' && Number.isFinite(t['duration']) ? t['duration'] : DEFAULT_TRANSITION.duration;
  return { kind, color, duration: Math.min(3, Math.max(0.3, d)), showName: t['showName'] !== false };
}

function validPointer(v: unknown): ScenePointer {
  const p = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const style = POINTER_STYLES.some((k) => k.value === p['style']) ? (p['style'] as ScenePointer['style']) : DEFAULT_POINTER.style;
  const color = typeof p['color'] === 'string' && HEX.test(p['color']) ? p['color'] : DEFAULT_POINTER.color;
  const size = typeof p['size'] === 'number' && Number.isFinite(p['size']) ? Math.min(160, Math.max(12, p['size'])) : DEFAULT_POINTER.size;
  return { enabled: p['enabled'] === true, style, color, size, motionBlur: p['motionBlur'] !== false };
}

/** Loose structural check for scenes arriving over the socket or from an import. */
export function validateScene(v: unknown): Scene | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (typeof s['id'] !== 'string' || !safeId(s['id']) || typeof s['name'] !== 'string') return null;
  if (!Array.isArray(s['widgets']) || !s['widgets'].every(isWidget)) return null;
  const theme = s['theme'] === 'clean' || s['theme'] === 'team' ? s['theme'] : 'night';
  return {
    id: safeId(s['id']),
    name: s['name'].slice(0, 80) || 'Untitled',
    canvas: { w: CANVAS_W, h: CANVAS_H },
    theme,
    background: validBackground(s['background']),
    transition: validTransition(s['transition']),
    pointer: validPointer(s['pointer']),
    widgets: s['widgets'] as WidgetInstance[],
    updatedAt: Date.now(),
  };
}

/** Scenes and settings as JSON files on disk; the in-memory copy is the source of truth. */
export class SceneStore {
  private scenes = new Map<string, Scene>();
  private timers = new Map<string, NodeJS.Timeout>();
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private readonly settingsFile: string;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.settingsFile = path.join(dir, '..', 'settings.json');
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const scene = validateScene(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
        if (scene) this.scenes.set(scene.id, scene);
      } catch {
        console.warn(`[scenes] skipping unreadable ${f}`);
      }
    }
    let firstRun: string | null = null;
    if (this.scenes.size === 0) {
      const starters = createStarterScenes();
      firstRun = starters[0]?.id ?? null;
      for (const s of starters) {
        this.scenes.set(s.id, s);
        this.writeNow(s.id);
      }
    }
    if (existsSync(this.settingsFile)) {
      try {
        this.settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(this.settingsFile, 'utf8')) as Partial<AppSettings>) };
      } catch {
        // keep defaults
      }
    }
    if (!this.settings.activeSceneId || !this.scenes.has(this.settings.activeSceneId)) {
      this.settings.activeSceneId = firstRun ?? this.list()[0]?.id ?? null;
    }
  }

  list(): Scene[] {
    return [...this.scenes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): Scene | undefined {
    return this.scenes.get(id);
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  updateSettings(p: Partial<AppSettings>): AppSettings {
    const next = { ...this.settings, ...p };
    next.speed = Math.min(2, Math.max(0.25, Number(next.speed) || 1));
    next.pollMode = next.pollMode === 'manual' ? 'manual' : 'auto';
    next.pollPaused = next.pollPaused === true;
    next.blackout = next.blackout === true;
    next.blackoutText = String(next.blackoutText ?? '').slice(0, 120);
    next.blackoutSubtext = String(next.blackoutSubtext ?? '').slice(0, 160);
    // null = .env default, 0 = budget-based, otherwise 5 s – 1 h
    const ps = next.pollSeconds;
    next.pollSeconds = ps === null || ps === undefined ? null : ps === 0 ? 0 : Math.min(3600, Math.max(5, Math.round(Number(ps)) || 60));
    if (next.activeSceneId && !this.scenes.has(next.activeSceneId)) next.activeSceneId = this.settings.activeSceneId;
    this.settings = next;
    writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2));
    return this.settings;
  }

  upsert(scene: Scene): Scene {
    const s = { ...scene, updatedAt: Date.now() };
    this.scenes.set(s.id, s);
    this.scheduleWrite(s.id);
    return s;
  }

  create(name: string, copyFrom?: string): Scene {
    const src = copyFrom ? this.scenes.get(copyFrom) : undefined;
    const scene: Scene = src
      ? // duplicates keep widget ids so Flip can glide shared widgets between the two scenes
        { ...structuredClone(src), id: newId(), name, updatedAt: Date.now() }
      : { id: newId(), name, canvas: { w: CANVAS_W, h: CANVAS_H }, theme: 'night', widgets: [], updatedAt: Date.now() };
    this.scenes.set(scene.id, scene);
    this.writeNow(scene.id);
    return scene;
  }

  /** Returns false when it would delete the last scene. */
  delete(id: string): boolean {
    if (!this.scenes.has(id) || this.scenes.size <= 1) return false;
    this.scenes.delete(id);
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    rmSync(path.join(this.dir, `${safeId(id)}.json`), { force: true });
    if (this.settings.activeSceneId === id) this.updateSettings({ activeSceneId: this.list()[0]?.id ?? null });
    return true;
  }

  private scheduleWrite(id: string): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.writeNow(id);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  private writeNow(id: string): void {
    const s = this.scenes.get(id);
    if (!s) return;
    writeFileSync(path.join(this.dir, `${safeId(id)}.json`), JSON.stringify(s, null, 2));
  }

  flushAll(): void {
    for (const [id, t] of this.timers) {
      clearTimeout(t);
      this.writeNow(id);
    }
    this.timers.clear();
  }
}
