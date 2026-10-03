import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BACKGROUND_KINDS, DEFAULT_POINTER, THEMES, type BackgroundKind, type ThemeId } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { EditorStore } from './editor.store';

/** Above the canvas: theme, on-air background, snapping, global motion and the OBS bridge. */
@Component({
  selector: 'cos-canvas-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      Theme
      <select [value]="editor.scene()?.theme ?? 'night'" (change)="setTheme($event)">
        @for (t of themes; track t.id) {
          <option [value]="t.id" [selected]="t.id === editor.scene()?.theme">{{ t.label }}</option>
        }
      </select>
    </label>
    <label title="Shown on /output too. Transparent lets your OBS sources show through.">
      Background
      <select [value]="bgKind()" (change)="setBg($event)">
        @for (k of bgKinds; track k.value) {
          <option [value]="k.value" [selected]="k.value === bgKind()">{{ k.label }}</option>
        }
      </select>
    </label>
 @if (bgKind() === 'image') {
      <label class="btn upload" [title]="'Upload a background image for this scene'">
        {{ uploading() ? 'Uploading…' : '⬆ Upload…' }}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden (change)="upload($event)" />
      </label>
    }
    <label class="chk">
      <input type="checkbox" [checked]="editor.snap()" (change)="editor.snap.set(!editor.snap())" />
      Snap 8px
    </label>
    <span class="sep"></span>
    <label class="chk">
      <input type="checkbox" [checked]="live.settings().reduceMotion" (change)="toggleReduce()" />
      Reduce motion
    </label>
    <label>
      Speed
      <input type="range" min="0.5" max="2" step="0.25" [value]="live.settings().speed" (change)="setSpeed($event)" />
      <output>{{ live.settings().speed }}×</output>
    </label>
    <span class="sep"></span>
    <button
      type="button"
      class="ptr"
      [class.on]="editor.pointerMode()"
      [attr.aria-pressed]="editor.pointerMode()"
      (click)="togglePointer()"
      title="Pointer mode: your mouse over the canvas drives the on-air pointer (Esc to exit)"
    >
      ◎ Pointer
    </button>
    @if (editor.pointerMode() && !onAirPointer()) {
      <span class="stale">
        Pointer is off for the on-air scene ·
        <button type="button" class="link" (click)="enableOnAirPointer()">turn it on</button>
      </span>
    }
    <span class="sep"></span>
    <label class="chk" [title]="live.obs().error ?? 'Move the OBS webcam source to match the camera frame automatically'">
      <input type="checkbox" [checked]="live.settings().obsBridge" (change)="toggleObs()" />
      OBS auto-place
      @if (live.settings().obsBridge) {
        <i class="dot" [class.ok]="live.obs().connected" [class.bad]="!!live.obs().error"></i>
      }
    </label>
    @if (live.match()?.isStale) {
      <span class="stale">⚠ Score data is stale — showing last good state</span>
    }
    @if (live.lastError(); as err) {
      <span class="stale">⚠ {{ err }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--ui-border);
      font-size: 12px;
      color: var(--ui-muted);
      white-space: nowrap;
      overflow-x: auto;
    }
    label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    select {
      padding: 3px 6px;
      font-size: 12px;
    }
    input[type='range'] {
      width: 80px;
    }
    output {
      min-width: 32px;
      font-variant-numeric: tabular-nums;
      color: var(--ui-text);
    }
    .sep {
      width: 1px;
      height: 18px;
      background: var(--ui-border);
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #64748b;
      display: inline-block;
    }
    .dot.ok {
      background: #22c55e;
    }
    .dot.bad {
      background: #ef4444;
    }
    .upload {
      padding: 4px 10px;
      cursor: pointer;
    }
    .ptr.on {
      background: #ef4444;
      border-color: #ef4444;
      color: #fff;
    }
    .link {
      background: none;
      border: 0;
      padding: 0;
      color: #fbbf24;
      text-decoration: underline;
      cursor: pointer;
    }
    .stale {
      color: #fbbf24;
    }
  `,
})
export class CanvasToolbarComponent {
  protected readonly editor = inject(EditorStore);
  protected readonly live = inject(LiveStore);
  protected readonly themes = Object.values(THEMES);

  protected setTheme(e: Event): void {
    this.editor.setTheme((e.target as HTMLSelectElement).value as ThemeId);
  }

  protected readonly onAirPointer = computed(() => this.live.activeScene()?.pointer?.enabled === true);

  /** turning pointer mode on also switches the pointer on for the on-air scene */
  protected togglePointer(): void {
    const on = !this.editor.pointerMode();
    this.editor.pointerMode.set(on);
    if (on && !this.onAirPointer()) this.enableOnAirPointer();
    if (!on) this.live.send({ type: 'pointer', x: 0, y: 0, visible: false });
  }

  protected enableOnAirPointer(): void {
    const s = this.live.activeScene();
    if (!s) return;
    this.live.pushScene({ ...s, pointer: { ...DEFAULT_POINTER, ...s.pointer, enabled: true }, updatedAt: Date.now() });
  }

  protected readonly bgKinds = BACKGROUND_KINDS;
  protected readonly bgKind = computed<BackgroundKind>(() => this.editor.scene()?.background?.kind ?? 'transparent');

  protected readonly uploading = signal(false);

  protected async upload(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: file, headers: { 'content-type': file.type } });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? `Upload failed (${res.status})`);
      this.editor.setBackground({ kind: 'image', image: body.url });
    } catch (err) {
      this.live.lastError.set(err instanceof Error ? err.message : 'Upload failed');
      setTimeout(() => this.live.lastError.set(null), 5000);
    } finally {
      this.uploading.set(false);
    }
  }

  protected setBg(e: Event): void {
    const kind = (e.target as HTMLSelectElement).value as BackgroundKind;
    this.editor.setBackground({ kind });
    // colour, gradient and image have more options in the scene panel
    if (kind === 'color' || kind === 'gradient' || kind === 'image') this.editor.selectedId.set(null);
  }

  protected toggleReduce(): void {
    this.live.send({ type: 'settings:update', settings: { reduceMotion: !this.live.settings().reduceMotion } });
  }

  protected setSpeed(e: Event): void {
    this.live.send({ type: 'settings:update', settings: { speed: Number((e.target as HTMLInputElement).value) } });
  }

  protected toggleObs(): void {
    this.live.send({ type: 'settings:update', settings: { obsBridge: !this.live.settings().obsBridge } });
  }
}
