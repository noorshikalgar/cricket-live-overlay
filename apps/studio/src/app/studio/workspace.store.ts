import { Injectable, computed, effect, signal } from '@angular/core';

/**
 * design: build layouts (library, canvas, inspector).
 * live: run the stream (Program monitor, scenes, layers, event pad, inspector).
 */
export type Workspace = 'design' | 'live';

export interface PanelLayout {
  left: boolean;
  right: boolean;
  bottom: boolean;
  /** px, null = the default for the window size */
  leftW: number | null;
  rightW: number | null;
}

/** where the floating Program monitor sits, in px from the window's top-left; width in px */
export interface FloatRect {
  x: number;
  y: number;
  w: number;
}

interface Saved {
  workspace: Workspace;
  layouts: Record<Workspace, PanelLayout>;
  /** Design: Program monitor floating over the canvas */
  floating: boolean;
  float: FloatRect;
}

const KEY = 'cos.workspace';
const DEFAULT_LAYOUT: PanelLayout = { left: true, right: true, bottom: true, leftW: null, rightW: null };
const DEFAULTS: Saved = {
  workspace: 'design',
  layouts: { design: { ...DEFAULT_LAYOUT }, live: { ...DEFAULT_LAYOUT } },
  floating: false,
  float: { x: -1, y: -1, w: 420 },
};

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (!raw) return structuredClone(DEFAULTS);
    return {
      workspace: raw.workspace === 'live' ? 'live' : 'design',
      layouts: {
        design: { ...DEFAULT_LAYOUT, ...raw.layouts?.design },
        live: { ...DEFAULT_LAYOUT, ...raw.layouts?.live },
      },
      floating: raw.floating === true,
      float: { ...DEFAULTS.float, ...raw.float },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** How the Studio is laid out, per workspace, remembered in this browser. */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly state = signal<Saved>(load());

  readonly workspace = computed(() => this.state().workspace);
  readonly layout = computed(() => this.state().layouts[this.state().workspace]);
  readonly floating = computed(() => this.state().floating && this.state().workspace === 'design');
  readonly float = computed(() => this.state().float);
  /** the Program monitor is open in its own window */
  readonly poppedOut = signal(false);

  constructor() {
    effect(() => {
      const s = this.state();
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        // storage blocked: the layout just resets next time
      }
    });
  }

  setWorkspace(w: Workspace): void {
    this.state.update((s) => ({ ...s, workspace: w }));
  }

  patchLayout(p: Partial<PanelLayout>): void {
    this.state.update((s) => ({ ...s, layouts: { ...s.layouts, [s.workspace]: { ...s.layouts[s.workspace], ...p } } }));
  }

  toggle(panel: 'left' | 'right' | 'bottom'): void {
    this.patchLayout({ [panel]: !this.layout()[panel] });
  }

  setFloating(on: boolean): void {
    this.state.update((s) => ({ ...s, floating: on }));
  }

  setFloat(r: FloatRect): void {
    this.state.update((s) => ({ ...s, float: r }));
  }

  private popup: Window | null = null;

  /** open the Program monitor in its own window (for a second screen) */
  popOut(): void {
    const w = window.open('/output?monitor', 'cos-program', 'width=960,height=560');
    if (!w) return;
    this.popup = w;
    this.poppedOut.set(true);
    const watch = setInterval(() => {
      if (w.closed) {
        clearInterval(watch);
        this.popup = null;
        this.poppedOut.set(false);
      }
    }, 1000);
  }

  /** close the separate window; the monitor shows in the Studio again */
  bringBack(): void {
    this.popup?.close();
    this.popup = null;
    this.poppedOut.set(false);
  }
}
