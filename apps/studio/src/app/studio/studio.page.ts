import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, effect, inject, signal, untracked } from '@angular/core';
import { LiveStore } from '../core/live.store';
import { CanvasToolbarComponent } from './canvas-toolbar.component';
import { CanvasComponent } from './canvas.component';
import { EditorStore } from './editor.store';
import { EventPadComponent, PAD_BUTTONS } from './event-pad.component';
import { LayersPanelComponent } from './layers-panel.component';
import { CardsPanelComponent } from './cards-panel.component';
import { LibraryPanelComponent } from './library-panel.component';
import { PromptDialogComponent, PromptService } from './prompt-dialog.component';
import { SettingsPanelComponent } from './settings-panel.component';
import { ProgramMonitorComponent } from './program-monitor.component';
import { ScenesPanelComponent } from './scenes-panel.component';
import { TopBarComponent } from './top-bar.component';
import { WorkspaceStore } from './workspace.store';

function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/** /studio — the editor shell. Unencapsulated styles are scoped under .studio-root. */
@Component({
  selector: 'cos-studio-page',
  imports: [
    TopBarComponent,
    ProgramMonitorComponent,
    ScenesPanelComponent,
    CanvasToolbarComponent,
    CanvasComponent,
    LibraryPanelComponent,
    CardsPanelComponent,
    SettingsPanelComponent,
    LayersPanelComponent,
    EventPadComponent,
    PromptDialogComponent,
  ],
  providers: [EditorStore, PromptService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'studio-root',
    '[class.ws-live]': "ws.workspace() === 'live'",
    '[class.no-left]': '!ws.layout().left',
    '[class.no-right]': '!ws.layout().right',
    '[style.--lw.px]': 'ws.layout().leftW',
    '[style.--rw.px]': 'ws.layout().rightW',
    '(document:keydown)': 'onKey($event)',
  },
  template: `
    <cos-top-bar class="top" />
    @if (ws.workspace() === 'live') {
      <!-- Live: run the stream. Scenes + layers | Program monitor + event pad | settings -->
      <aside class="left" [class.open]="drawer() === 'left'">
        <button type="button" class="collapse" (click)="ws.toggle('left')" title="Hide this panel">«</button>
        <cos-scenes-panel class="scenes" />
        <cos-layers-panel class="lib" />
        <span class="split" (pointerdown)="splitStart('left', $event)" (dblclick)="ws.patchLayout({ leftW: null })" title="Drag to resize · double-click to reset"></span>
      </aside>
      <main class="center">
        <div class="drawer-bar">
          <button type="button" [class.on]="drawer() === 'left'" (click)="toggleDrawer('left')">☰ Scenes</button>
          <button type="button" [class.on]="drawer() === 'right'" (click)="toggleDrawer('right')">⚙ Settings</button>
        </div>
        <cos-program-monitor class="monitor" mode="dock" />
        <cos-event-pad class="pad" />
        @if (!ws.layout().left) {
          <button type="button" class="edge left" (click)="ws.toggle('left')" title="Show scenes and layers">Scenes ›</button>
        }
        @if (!ws.layout().right) {
          <button type="button" class="edge right" (click)="ws.toggle('right')" title="Show settings">‹ Settings</button>
        }
      </main>
    } @else {
      <!-- Design: build layouts. Library | canvas + layers | settings -->
      <aside class="left" [class.open]="drawer() === 'left'">
        <div class="tabs" role="tablist">
          <button type="button" role="tab" [class.on]="leftTab() === 'widgets'" (click)="leftTab.set('widgets')">＋ Widgets</button>
          <button type="button" role="tab" [class.on]="leftTab() === 'cards'" (click)="leftTab.set('cards')">▤ Live cards</button>
          <button type="button" class="collapse-inline" (click)="ws.toggle('left')" title="Hide this panel">«</button>
        </div>
        @if (leftTab() === 'widgets') {
          <cos-library-panel class="lib" />
        } @else {
          <cos-cards-panel class="lib" />
        }
        <span class="split" (pointerdown)="splitStart('left', $event)" (dblclick)="ws.patchLayout({ leftW: null })" title="Drag to resize · double-click to reset"></span>
      </aside>
      <main class="center">
        <!-- narrow screens: the side panels become drawers -->
        <div class="drawer-bar">
          <button type="button" [class.on]="drawer() === 'left'" (click)="toggleDrawer('left')">☰ Widgets</button>
          <button type="button" [class.on]="showLayers()" (click)="showLayers.set(!showLayers())">▤ Layers</button>
          <button type="button" [class.on]="drawer() === 'right'" (click)="toggleDrawer('right')">⚙ Settings</button>
        </div>
        <cos-canvas-toolbar />
        <cos-canvas class="canvas" />
        <button type="button" class="bottom-toggle" (click)="ws.toggle('bottom')" [title]="ws.layout().bottom ? 'Hide layers and event pad' : 'Show layers and event pad'">
          {{ ws.layout().bottom ? '▾' : '▴' }} Layers &amp; event pad
        </button>
        @if (ws.layout().bottom) {
          <div class="bottom" [class.layers-on]="showLayers()">
            <cos-layers-panel class="layers" />
            <cos-event-pad class="pad" />
          </div>
        }
        @if (!ws.layout().left) {
          <button type="button" class="edge left" (click)="ws.toggle('left')" title="Show the widget library">Widgets ›</button>
        }
        @if (!ws.layout().right) {
          <button type="button" class="edge right" (click)="ws.toggle('right')" title="Show settings">‹ Settings</button>
        }
      </main>
      @if (ws.floating()) {
        <cos-program-monitor mode="float" />
      }
    }
    <aside class="right" [class.open]="drawer() === 'right'">
      <button type="button" class="collapse" (click)="ws.toggle('right')" title="Hide this panel">»</button>
      <cos-settings-panel class="settings" />
      <span class="split" (pointerdown)="splitStart('right', $event)" (dblclick)="ws.patchLayout({ rightW: null })" title="Drag to resize · double-click to reset"></span>
    </aside>
    <div class="scrim" [class.on]="drawer() !== null" (click)="drawer.set(null)"></div>
    <cos-prompt-dialog />
  `,
  styles: `
    /*
     * This component's styles are global (ViewEncapsulation.None) so they style
     * the panels inside it. Layout selectors go through direct children (>) so
     * they never reach into widgets on the canvas, which have their own .center,
     * .top, .bottom… classes.
     */
    .studio-root {
      --ui-bg: #0a0d13;
      --ui-panel: #10141c;
      --ui-border: #1f2632;
      --ui-text: #e6e9ef;
      --ui-muted: #8b95a5;
      --ui-chip: #182030;
      --ui-chip-strong: #233047;
      --ui-accent: #22c55e;
      --ui-accent-soft: rgba(34, 197, 94, 0.14);

      position: fixed;
      inset: 0;
      display: grid;
      --lw: 236px;
      --rw: 312px;
      --lw-eff: var(--lw);
      --rw-eff: var(--rw);
      grid-template-columns: var(--lw-eff) minmax(0, 1fr) var(--rw-eff);
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-areas:
        'top top top'
        'left center right';
      background: var(--ui-bg);
      color: var(--ui-text);
      font: 400 13px/1.4 Inter, system-ui, sans-serif;
      color-scheme: dark;
    }
    .studio-root > .top {
      grid-area: top;
    }
    .studio-root > .left {
      grid-area: left;
      border-right: 1px solid var(--ui-border);
      background: var(--ui-panel);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .studio-root > .left > .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 10px 0;
      border-bottom: 1px solid var(--ui-border);
      flex: none;
    }
    .studio-root > .left > .tabs button {
      white-space: nowrap;
      padding-left: 6px;
      padding-right: 6px;
      flex: 1;
      justify-content: center;
      border-radius: 6px 6px 0 0;
      border-bottom: 0;
      background: transparent;
      color: var(--ui-muted);
    }
    .studio-root > .left > .tabs button.on {
      background: var(--ui-chip);
      color: var(--ui-text);
      font-weight: 600;
    }
    .studio-root > .left > .lib {
      flex: 1;
      min-height: 0;
    }
    .studio-root > .center {
      grid-area: center;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
    }
    .studio-root > .center > .canvas {
      flex: 1;
    }
    .studio-root > .center > .bottom {
      height: 210px;
      flex: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      border-top: 1px solid var(--ui-border);
      background: var(--ui-panel);
    }
    .studio-root > .center > .bottom > .layers {
      min-height: 0;
      border-right: 1px solid var(--ui-border);
    }
    .studio-root > .right {
      grid-area: right;
      border-left: 1px solid var(--ui-border);
      background: var(--ui-panel);
      display: flex;
      min-height: 0;
    }
    .studio-root > .right > .settings {
      flex: 1;
      min-height: 0;
    }

    /* ---- collapsible, resizable side panels ---- */
    .studio-root.no-left {
      --lw-eff: 0px;
    }
    .studio-root.no-right {
      --rw-eff: 0px;
    }
    .studio-root.no-left > .left,
    .studio-root.no-right > .right {
      display: none;
    }
    .studio-root > .left,
    .studio-root > .right {
      position: relative;
    }
    .studio-root > .left > .split,
    .studio-root > .right > .split {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 7px;
      cursor: col-resize;
      z-index: 5;
    }
    .studio-root > .left > .split {
      right: -4px;
    }
    .studio-root > .right > .split {
      left: -4px;
    }
    .studio-root > .left > .split:hover,
    .studio-root > .right > .split:hover {
      background: linear-gradient(90deg, transparent 2px, var(--ui-accent) 2px, var(--ui-accent) 4px, transparent 4px);
    }
    .studio-root > .left > .collapse,
    .studio-root > .right > .collapse {
      position: absolute;
      top: 6px;
      z-index: 4;
      width: 22px;
      height: 22px;
      padding: 0;
      justify-content: center;
      font-size: 13px;
      background: transparent;
      border-color: transparent;
      color: var(--ui-muted);
    }
    .studio-root > .left > .collapse {
      right: 8px;
    }
    .studio-root > .right > .collapse {
      left: 6px;
    }
    .studio-root > .left > .tabs .collapse-inline {
      flex: none;
      width: 26px;
      padding: 0;
      justify-content: center;
      border-radius: 6px 6px 0 0;
      background: transparent;
      color: var(--ui-muted);
      border-bottom: 0;
    }
    .studio-root > .center {
      position: relative;
    }
    /* reopen a hidden panel from the canvas edge */
    .studio-root > .center > .edge {
      position: absolute;
      top: 50%;
      z-index: 6;
      padding: 10px 6px;
      writing-mode: vertical-rl;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      background: var(--ui-chip-strong);
      border-color: var(--ui-border);
    }
    .studio-root > .center > .edge.left {
      left: 0;
      transform: translateY(-50%) rotate(180deg);
      border-radius: 0 6px 6px 0;
    }
    .studio-root > .center > .edge.right {
      right: 0;
      transform: translateY(-50%);
      border-radius: 0 6px 6px 0;
    }
    .studio-root > .center > .bottom-toggle {
      flex: none;
      align-self: stretch;
      justify-content: center;
      border-radius: 0;
      border-width: 1px 0 0;
      padding: 3px 10px;
      font-size: 11px;
      color: var(--ui-muted);
      background: var(--ui-panel);
    }

    /* ---- Live workspace: scenes + layers | Program monitor + event pad | settings ---- */
    .studio-root.ws-live {
      /* layer names need the room more than the library does */
      --lw: 290px;
    }
    .studio-root.ws-live > .left > .scenes {
      flex: none;
      max-height: 45%;
      overflow-y: auto;
      border-bottom: 1px solid var(--ui-border);
    }
    .studio-root.ws-live > .center {
      padding: 10px;
      gap: 10px;
    }
    .studio-root.ws-live > .center > .monitor {
      flex: 1;
      min-height: 200px;
    }
    .studio-root.ws-live > .center > .pad {
      flex: none;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      background: var(--ui-panel);
    }

    /* base controls for every studio panel */
    .studio-root input[type='text'],
    .studio-root input[type='number'],
    .studio-root textarea,
    .studio-root select {
      background: var(--ui-bg);
      color: var(--ui-text);
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      padding: 6px 8px;
      font: inherit;
      outline: none;
      min-width: 0;
    }
    .studio-root textarea {
      resize: vertical;
    }
    .studio-root input:focus-visible,
    .studio-root textarea:focus-visible,
    .studio-root select:focus-visible {
      border-color: var(--ui-accent);
    }
    .studio-root input[type='range'] {
      accent-color: var(--ui-accent);
    }
    .studio-root input[type='checkbox'] {
      accent-color: var(--ui-accent);
    }
    .studio-root button,
    .studio-root .btn {
      background: var(--ui-chip);
      color: var(--ui-text);
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      padding: 6px 10px;
      font: 500 12px/1.2 Inter, Mukta, sans-serif;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .studio-root button:hover:not(:disabled),
    .studio-root .btn:hover {
      background: var(--ui-chip-strong);
    }
    .studio-root button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .studio-root button.icon {
      width: 30px;
      height: 30px;
      padding: 0;
      justify-content: center;
      font-size: 15px;
    }
    .studio-root button.primary {
      background: var(--ui-accent);
      border-color: var(--ui-accent);
      color: #06240f;
      font-weight: 600;
    }
    .studio-root button.primary:hover:not(:disabled) {
      background: #34d36c;
    }
    .studio-root button.danger,
    .studio-root button.primary.danger {
      background: #7f1d1d;
      border-color: #991b1b;
      color: #fee2e2;
    }
    .studio-root ::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .studio-root ::-webkit-scrollbar-thumb {
      background: #222a38;
      border-radius: 10px;
      border: 2px solid var(--ui-panel);
    }

    .studio-root > .center > .drawer-bar,
    .studio-root > .scrim {
      display: none;
    }

    @media (max-width: 1440px) {
      .studio-root {
        --lw: 220px;
        --rw: 290px;
      }
    }

    @media (max-width: 1100px) {
      .studio-root {
        --lw: 200px;
        --rw: 270px;
      }
      .studio-root > .center > .bottom {
        grid-template-columns: minmax(0, 1fr);
        height: 260px;
        grid-template-rows: 1fr auto;
      }
      .studio-root > .center > .bottom > .layers {
        border-right: 0;
      }
    }

    /* tablets and phones: one column; library and settings slide in over the canvas */
    @media (max-width: 900px) {
      /* panels are drawers here: hiding / resizing them doesn't apply */
      .studio-root.no-left > .left,
      .studio-root.no-right > .right {
        display: flex;
      }
      .studio-root > .left > .split,
      .studio-root > .right > .split,
      .studio-root > .left > .collapse,
      .studio-root > .right > .collapse,
      .studio-root > .left > .tabs .collapse-inline,
      .studio-root > .center > .edge {
        display: none;
      }
      .studio-root {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
        grid-template-areas:
          'top'
          'center';
      }
      .studio-root > .left,
      .studio-root > .right {
        position: fixed;
        top: 0;
        bottom: 0;
        z-index: 40;
        width: min(340px, 88vw);
        transition: transform 0.22s var(--ease-out, ease-out);
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
      }
      .studio-root > .left {
        left: 0;
        transform: translateX(-105%);
      }
      .studio-root > .right {
        right: 0;
        transform: translateX(105%);
      }
      .studio-root > .left.open,
      .studio-root > .right.open {
        transform: none;
      }
      .studio-root > .scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 39;
        background: rgba(0, 0, 0, 0.45);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
      }
      .studio-root > .scrim.on {
        opacity: 1;
        pointer-events: auto;
      }
      .studio-root > .center > .drawer-bar {
        display: flex;
        gap: 6px;
        padding: 6px 10px;
        border-bottom: 1px solid var(--ui-border);
        background: var(--ui-panel);
      }
      .studio-root > .center > .drawer-bar button {
        flex: 1;
        justify-content: center;
      }
      .studio-root > .center > .drawer-bar button.on {
        background: var(--ui-accent-soft);
        border-color: var(--ui-accent);
      }
      .studio-root > .center > .bottom {
        height: auto;
        max-height: 46vh;
      }
      .studio-root > .center > .bottom > .layers {
        display: none;
        max-height: 26vh;
        border-bottom: 1px solid var(--ui-border);
      }
      .studio-root > .center > .bottom.layers-on > .layers {
        display: block;
      }
    }

    @media (max-width: 600px) {
      .studio-root > .center > .canvas {
        min-height: 200px;
      }
    }
  `,
})
export default class StudioPage {
  private readonly live = inject(LiveStore);
  private readonly editor = inject(EditorStore);
  private readonly prompt = inject(PromptService);
  protected readonly ws = inject(WorkspaceStore);

  protected readonly leftTab = signal<'widgets' | 'cards'>('widgets');
  /** which side panel is slid in on narrow screens */
  protected readonly drawer = signal<'left' | 'right' | null>(null);
  /** phones: the layer list is hidden behind a toggle so the event pad gets the room */
  protected readonly showLayers = signal(false);

  protected toggleDrawer(side: 'left' | 'right'): void {
    this.drawer.set(this.drawer() === side ? null : side);
  }

  /** drag a panel's edge to resize it; widths are remembered per workspace */
  protected splitStart(side: 'left' | 'right', e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const aside = (e.target as HTMLElement).parentElement;
    if (!aside) return;
    const startW = aside.getBoundingClientRect().width;
    const sx = e.clientX;
    const [min, max] = side === 'left' ? [180, 460] : [240, 520];
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const w = Math.round(Math.min(max, Math.max(min, side === 'left' ? startW + dx : startW - dx)));
      this.ws.patchLayout(side === 'left' ? { leftW: w } : { rightW: w });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  constructor() {
    // Live: the Studio edits whatever is on air, so layers and settings control what viewers see
    effect(() => {
      const live = this.ws.workspace() === 'live';
      const onAir = this.live.settings().activeSceneId;
      untracked(() => {
        if (live && onAir && onAir !== this.editor.sceneId()) this.editor.editScene(onAir);
      });
    });
    this.live.connect('studio');
    // closing or reloading the Studio must not leave the pointer stuck on air
    const hide = () => this.live.send({ type: 'pointer', x: 0, y: 0, visible: false });
    window.addEventListener('pagehide', hide);
    inject(DestroyRef).onDestroy(() => {
      hide();
      window.removeEventListener('pagehide', hide);
    });
  }

  protected onKey(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    // emergency blackout works everywhere, even while typing
    if (mod && e.shiftKey && key === 'b') {
      e.preventDefault();
      this.live.send({ type: 'settings:update', settings: { blackout: !this.live.settings().blackout } });
      return;
    }
    if (this.prompt.request() || typingInField(e)) return;

    // Alt+1…9: put that scene on air (both workspaces)
    if (e.altKey && !mod && /^[1-9]$/.test(e.key)) {
      const scene = this.live.sceneList()[Number(e.key) - 1];
      if (scene) {
        e.preventDefault();
        this.live.send({ type: 'scene:switch', sceneId: scene.id });
      }
      return;
    }

    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.editor.redo();
      else this.editor.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      this.editor.redo();
      return;
    }
    const sel = this.editor.selected();
    if (mod && key === 'd') {
      e.preventDefault();
      if (sel) this.editor.duplicate(sel.id);
      return;
    }
    if (mod || e.altKey) return;

    if (sel) {
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        arrowleft: [-step, 0],
        arrowright: [step, 0],
        arrowup: [0, -step],
        arrowdown: [0, step],
      };
      const m = moves[key];
      if (m) {
        e.preventDefault();
        this.editor.nudge(m[0], m[1]);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        this.editor.remove(sel.id);
        return;
      }
    }
    if (key === 'escape') {
      if (this.drawer()) {
        this.drawer.set(null);
        return;
      }
      if (this.editor.pointerMode()) {
        this.editor.pointerMode.set(false);
        this.live.send({ type: 'pointer', x: 0, y: 0, visible: false });
      }
      this.editor.selectedId.set(null);
      return;
    }
    const pad = PAD_BUTTONS.find((b) => b.key.toLowerCase() === key);
    if (pad && !e.repeat) {
      e.preventDefault();
      this.live.send({ type: 'event:manual', eventType: pad.type });
    }
  }
}
