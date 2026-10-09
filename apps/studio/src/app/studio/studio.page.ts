import { ChangeDetectionStrategy, Component, DestroyRef, ViewEncapsulation, inject, signal } from '@angular/core';
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
import { TopBarComponent } from './top-bar.component';

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
  host: { class: 'studio-root', '(document:keydown)': 'onKey($event)' },
  template: `
    <cos-top-bar class="top" />
    <aside class="left">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" [class.on]="leftTab() === 'widgets'" (click)="leftTab.set('widgets')">Widgets</button>
        <button type="button" role="tab" [class.on]="leftTab() === 'cards'" (click)="leftTab.set('cards')">Live cards</button>
      </div>
      @if (leftTab() === 'widgets') {
        <cos-library-panel class="lib" />
      } @else {
        <cos-cards-panel class="lib" />
      }
    </aside>
    <main class="center">
      <cos-canvas-toolbar />
      <cos-canvas class="canvas" />
      <div class="bottom">
        <cos-layers-panel class="layers" />
        <cos-event-pad class="pad" />
      </div>
    </main>
    <aside class="right">
      <cos-settings-panel class="settings" />
    </aside>
    <cos-prompt-dialog />
  `,
  styles: `
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
      grid-template-columns: 236px minmax(0, 1fr) 312px;
      grid-template-rows: 52px minmax(0, 1fr);
      grid-template-areas:
        'top top top'
        'left center right';
      background: var(--ui-bg);
      color: var(--ui-text);
      font: 400 13px/1.4 Inter, system-ui, sans-serif;
      color-scheme: dark;
    }
    .studio-root .top {
      grid-area: top;
    }
    .studio-root .left {
      grid-area: left;
      border-right: 1px solid var(--ui-border);
      background: var(--ui-panel);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .studio-root .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 10px 0;
      border-bottom: 1px solid var(--ui-border);
      flex: none;
    }
    .studio-root .tabs button {
      flex: 1;
      justify-content: center;
      border-radius: 6px 6px 0 0;
      border-bottom: 0;
      background: transparent;
      color: var(--ui-muted);
    }
    .studio-root .tabs button.on {
      background: var(--ui-chip);
      color: var(--ui-text);
      font-weight: 600;
    }
    .studio-root .lib {
      flex: 1;
      min-height: 0;
    }
    .studio-root .center {
      grid-area: center;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
    }
    .studio-root .canvas {
      flex: 1;
    }
    .studio-root .bottom {
      height: 210px;
      flex: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      border-top: 1px solid var(--ui-border);
      background: var(--ui-panel);
    }
    .studio-root .layers {
      min-height: 0;
      border-right: 1px solid var(--ui-border);
    }
    .studio-root .right {
      grid-area: right;
      border-left: 1px solid var(--ui-border);
      background: var(--ui-panel);
      display: flex;
      min-height: 0;
    }
    .studio-root .settings {
      flex: 1;
      min-height: 0;
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

    @media (max-width: 1100px) {
      .studio-root {
        grid-template-columns: 200px minmax(0, 1fr) 270px;
      }
      .studio-root .bottom {
        grid-template-columns: minmax(0, 1fr);
        height: 260px;
        grid-template-rows: 1fr auto;
      }
      .studio-root .layers {
        border-right: 0;
      }
    }
  `,
})
export default class StudioPage {
  private readonly live = inject(LiveStore);
  private readonly editor = inject(EditorStore);
  private readonly prompt = inject(PromptService);

  protected readonly leftTab = signal<'widgets' | 'cards'>('widgets');

  constructor() {
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
