import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { Scene } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { EditorStore } from './editor.store';
import { PromptService } from './prompt-dialog.component';

/** Scene switcher, match picker, poll status, undo/redo and the Output-connected indicator. */
@Component({
  selector: 'cos-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="brand"><span class="logo">◢</span> Overlay Studio</div>

    <div class="group scene">
      <select [value]="editor.sceneId() ?? ''" (change)="pickScene($event)" aria-label="Scene being edited">
        @for (s of live.sceneList(); track s.id) {
          <option [value]="s.id" [selected]="s.id === editor.sceneId()">
            {{ s.name }}{{ s.id === live.settings().activeSceneId ? '  ● on air' : '' }}
          </option>
        }
      </select>
      <div class="menu-wrap">
        <button type="button" class="icon" title="Scene actions" (click)="menuOpen.set(!menuOpen())">⋯</button>
        @if (menuOpen()) {
          <div class="menu" (click)="menuOpen.set(false)">
            <button type="button" (click)="newScene()">New scene</button>
            <button type="button" (click)="duplicateScene()">Duplicate</button>
            <button type="button" (click)="renameScene()">Rename</button>
            <hr />
            <button type="button" (click)="exportScene()">Export as file</button>
            <label class="as-btn">
              Import file…
              <input type="file" accept=".json,application/json" hidden (change)="importScene($event)" />
            </label>
            <hr />
            <button type="button" class="danger-text" (click)="deleteScene()" [disabled]="live.sceneList().length < 2">Delete</button>
          </div>
        }
      </div>
      @if (editor.isOnAir()) {
        <span class="onair">● ON AIR</span>
      } @else {
        <button type="button" class="primary" (click)="goLive()" title="Show this scene on /output">Put on air</button>
      }
    </div>

    <div class="group match">
      <select [value]="live.settings().selectedMatchId ?? ''" (change)="pickMatch($event)" aria-label="Match">
        <option value="">No match (design mode)</option>
        @if (selectedMissing(); as sel) {
          <option [value]="sel.id" selected>{{ sel.label }}</option>
        }
        @for (m of live.matches(); track m.id) {
          <option [value]="m.id" [selected]="m.id === live.settings().selectedMatchId">
            {{ m.title }} · {{ m.scoreLine }}
          </option>
        }
      </select>
      <button type="button" class="icon" title="Refresh the list of live matches (1 API call)" (click)="live.send({ type: 'matches:refresh' })">↻</button>
    </div>

    <div class="group pollctl" role="group" aria-label="Score updates">
      <div class="seg">
        <button type="button" [class.on]="mode() === 'auto'" (click)="setMode('auto')" title="Update the score on a timer">Auto</button>
        <button type="button" [class.on]="mode() === 'manual'" (click)="setMode('manual')" title="Update only when you press Update now">Manual</button>
      </div>
      @if (mode() === 'auto') {
        <select [value]="intervalValue()" (change)="setInterval($event)" aria-label="Update interval" title="How often the score is fetched">
          @for (o of intervals; track o.value) {
            <option [value]="o.value" [selected]="o.value === intervalValue()">{{ o.label }}</option>
          }
        </select>
      }
      <button
        type="button"
        class="primary update"
        [disabled]="!canPollNow()"
        (click)="pollNow()"
        title="Fetch the latest score now (1 API call)"
      >
        ⟳ Update now
      </button>
      @if (countdown(); as c) {
        <span class="next">next {{ c }}</span>
      }
    </div>

    <div class="group">
      @if (live.poll(); as p) {
        <span class="poll" [class.warn]="usageWarn()" [class.err]="p.phase === 'error' || p.stale" [title]="p.lastError ?? ''">
          @switch (p.phase) {
            @case ('live') { <i class="dot live"></i> {{ p.mode === 'manual' ? 'manual' : 'live' }} }
            @case ('break') { <i class="dot brk"></i> break }
            @case ('stopped') { <i class="dot"></i> finished }
            @case ('error') { <i class="dot bad"></i> {{ p.stale ? 'stale' : 'error' }} }
            @default { <i class="dot"></i> idle }
          }
          <span class="calls">{{ p.callsToday }}/{{ p.dailyLimit }} calls · {{ p.provider }}</span>
        </span>
      }
    </div>

    <div class="spacer"></div>

    <div class="group">
      <button type="button" class="icon" title="Undo (Ctrl/⌘+Z)" [disabled]="!editor.canUndo()" (click)="editor.undo()">↶</button>
      <button type="button" class="icon" title="Redo (Ctrl/⌘+Shift+Z)" [disabled]="!editor.canRedo()" (click)="editor.redo()">↷</button>
    </div>

    <a class="out" [class.on]="live.clients().outputs > 0" [href]="outputUrl()" target="_blank" rel="noopener" title="Open the Output page (OBS Browser Source URL)">
      <i class="dot" [class.live]="live.clients().outputs > 0"></i>
      Output {{ live.clients().outputs > 0 ? 'connected' + (live.clients().outputs > 1 ? ' ×' + live.clients().outputs : '') : 'not connected' }}
    </a>
    @if (!live.connected()) {
      <span class="offline">Server offline · reconnecting…</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 0 14px;
      height: 52px;
      border-bottom: 1px solid var(--ui-border);
      background: var(--ui-panel);
      font-size: 13px;
      white-space: nowrap;
      overflow-x: auto;
      overflow-y: visible;
    }
    .brand {
      font-weight: 700;
      letter-spacing: 0.01em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo {
      color: var(--ui-accent);
    }
    .group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .scene select {
      max-width: 220px;
    }
    .match select {
      max-width: 300px;
    }
    .spacer {
      flex: 1;
    }
    .onair {
      color: #f87171;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.08em;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.14);
    }
    .menu-wrap {
      position: relative;
    }
    .menu {
      position: fixed;
      margin-top: 4px;
      z-index: 50;
      min-width: 170px;
      display: flex;
      flex-direction: column;
      padding: 6px;
      background: var(--ui-panel);
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    }
    .menu button,
    .menu .as-btn {
      text-align: left;
      background: none;
      border: 0;
      padding: 7px 10px;
      border-radius: 5px;
      cursor: pointer;
      color: var(--ui-text);
      font: inherit;
    }
    .menu button:hover:not(:disabled),
    .menu .as-btn:hover {
      background: var(--ui-chip);
    }
    .menu hr {
      border: 0;
      border-top: 1px solid var(--ui-border);
      margin: 4px 0;
      width: 100%;
    }
    .danger-text {
      color: #f87171 !important;
    }
    .seg {
      display: inline-flex;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .seg button {
      border: 0;
      border-radius: 0;
      padding: 5px 10px;
      background: transparent;
    }
    .seg button.on {
      background: var(--ui-accent-soft);
      color: var(--ui-accent);
      font-weight: 600;
    }
    .pollctl select {
      max-width: 120px;
    }
    .next {
      color: var(--ui-muted);
      font-variant-numeric: tabular-nums;
      min-width: 56px;
    }
    .poll {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--ui-muted);
      font-variant-numeric: tabular-nums;
      padding: 4px 8px;
      border-radius: 6px;
      background: var(--ui-chip);
    }
    .poll.warn .calls {
      color: #fbbf24;
    }
    .poll.err {
      color: #f87171;
      background: rgba(239, 68, 68, 0.12);
    }
    .calls {
      opacity: 0.8;
    }
    .dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #64748b;
    }
    .dot.live {
      background: #22c55e;
    }
    .dot.brk {
      background: #fbbf24;
    }
    .dot.bad {
      background: #ef4444;
    }
    .out {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--ui-muted);
      text-decoration: none;
      padding: 5px 9px;
      border-radius: 6px;
      border: 1px solid var(--ui-border);
    }
    .out.on {
      color: var(--ui-text);
      border-color: rgba(34, 197, 94, 0.4);
    }
    .offline {
      color: #fbbf24;
    }
  `,
})
export class TopBarComponent {
  protected readonly live = inject(LiveStore);
  protected readonly editor = inject(EditorStore);
  private readonly prompt = inject(PromptService);
  protected readonly menuOpen = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.clock));
  }

  protected readonly intervals = [
    { value: 'env', label: 'Default (.env)' },
    { value: '0', label: 'Budget (whole match)' },
    ...[10, 15, 20, 30, 45, 60, 90, 120, 300].map((s) => ({
      value: String(s),
      label: s < 60 ? `Every ${s}s` : `Every ${s / 60} min`.replace('1.5 min', '90s'),
    })),
  ];

  /** the polled match isn't in the (manually refreshed) list: still show it as selected */
  protected readonly selectedMissing = computed(() => {
    const id = this.live.settings().selectedMatchId;
    if (!id || this.live.matches().some((m) => m.id === id)) return null;
    const m = this.live.match();
    const label = m ? `${m.teams[0].shortCode} v ${m.teams[1].shortCode}` : `Match ${id}`;
    return { id, label: `${label} (press ↻ for the list)` };
  });

  protected readonly mode = computed(() => this.live.settings().pollMode ?? 'auto');
  protected readonly intervalValue = computed(() => {
    const s = this.live.settings().pollSeconds;
    return s === null || s === undefined ? 'env' : String(s);
  });

  /** ticks once a second for the countdown */
  private readonly now = signal(Date.now());
  private readonly clock = setInterval(() => this.now.set(Date.now()), 1000);

  protected readonly countdown = computed(() => {
    const next = this.live.poll()?.nextPollAt;
    if (!next || this.mode() !== 'auto') return null;
    const s = Math.max(0, Math.round((next - this.now()) / 1000));
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
  });

  /** a match is selected and the last poll wasn't in the last 5 s (their cache is 10 s anyway) */
  protected readonly canPollNow = computed(() => {
    const p = this.live.poll();
    if (!this.live.settings().selectedMatchId || !p) return false;
    return !p.lastPollAt || this.now() - p.lastPollAt > 5000;
  });

  protected setMode(mode: 'auto' | 'manual'): void {
    this.live.send({ type: 'settings:update', settings: { pollMode: mode } });
  }

  protected setInterval(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.live.send({ type: 'settings:update', settings: { pollSeconds: v === 'env' ? null : Number(v) } });
  }

  protected pollNow(): void {
    this.live.send({ type: 'poll:now' });
  }

  protected readonly usageWarn = computed(() => {
    const p = this.live.poll();
    return !!p && p.dailyLimit > 0 && p.callsToday / p.dailyLimit >= 0.8;
  });

  protected readonly outputUrl = computed(() => `${location.origin}/output`);

  protected pickScene(e: Event): void {
    this.editor.editScene((e.target as HTMLSelectElement).value);
  }

  protected pickMatch(e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    this.live.send({ type: 'match:select', matchId: v || null });
  }

  protected goLive(): void {
    const id = this.editor.sceneId();
    if (id) this.live.send({ type: 'scene:switch', sceneId: id });
  }

  protected async newScene(): Promise<void> {
    const name = await this.prompt.ask('New scene name', 'New scene', 'Create');
    if (name) this.createAndEdit({ type: 'scene:create', name });
  }

  protected async duplicateScene(): Promise<void> {
    const cur = this.editor.scene();
    if (!cur) return;
    const name = await this.prompt.ask('Name for the copy', `${cur.name} copy`, 'Duplicate');
    if (name) this.createAndEdit({ type: 'scene:create', name, copyFrom: cur.id });
  }

  /** Create on the server, then switch the editor to the new scene once it arrives. */
  private createAndEdit(msg: { type: 'scene:create'; name: string; copyFrom?: string }): void {
    const before = new Set(Object.keys(this.live.scenes()));
    this.live.send(msg);
    const started = Date.now();
    const check = () => {
      const fresh = Object.values(this.live.scenes()).find((s) => !before.has(s.id));
      if (fresh) this.editor.editScene(fresh.id);
      else if (Date.now() - started < 3000) setTimeout(check, 50);
    };
    check();
  }

  protected async renameScene(): Promise<void> {
    const cur = this.editor.scene();
    if (!cur) return;
    const name = await this.prompt.ask('Rename scene', cur.name, 'Rename');
    if (name) this.editor.commit((s) => void (s.name = name));
  }

  protected async deleteScene(): Promise<void> {
    const cur = this.editor.scene();
    if (!cur) return;
    if (await this.prompt.confirm(`Delete scene "${cur.name}"? This cannot be undone.`)) {
      this.live.send({ type: 'scene:delete', sceneId: cur.id });
    }
  }

  protected exportScene(): void {
    const id = this.editor.sceneId();
    if (id) window.open(`/api/scenes/${encodeURIComponent(id)}/export`, '_blank');
  }

  protected async importScene(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const body = JSON.parse(await file.text()) as unknown;
      const res = await fetch('/api/scenes/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = (await res.json()) as Scene | { error: string };
      if (!res.ok || 'error' in out) throw new Error('error' in out ? out.error : 'Import failed');
      this.editor.editScene(out.id);
    } catch (err) {
      this.live.lastError.set(err instanceof Error ? err.message : 'Import failed');
      setTimeout(() => this.live.lastError.set(null), 5000);
    }
  }
}
