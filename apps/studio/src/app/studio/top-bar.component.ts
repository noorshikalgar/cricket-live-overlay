import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import type { Scene } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { EditorStore } from './editor.store';
import { WorkspaceStore } from './workspace.store';
import { PromptService } from './prompt-dialog.component';

/** Scene switcher, match picker, poll status, undo/redo and the Output-connected indicator. */
@Component({
  selector: 'cos-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeMenuOutside($event)', '(document:keydown.escape)': 'openMenu.set(null)' },
  template: `
    <!-- row 1: menu bar (rarely used commands) + status -->
    <div class="menubar">
      <span class="brand"><img class="logo" src="/logo.svg" alt="" width="18" height="18" /> <span class="brand-name">Overlay Studio</span></span>
      <nav class="menus" role="menubar">
        @for (m of menus; track m) {
          <div class="menu-wrap">
            <button
              type="button"
              class="menu-btn"
              role="menuitem"
              [class.open]="openMenu() === m"
              (click)="toggleMenu(m, $event)"
              (mouseenter)="hoverMenu(m)"
            >
              {{ m }}
            </button>
            @if (openMenu() === m) {
              <div class="dropdown" role="menu" (click)="openMenu.set(null)">
                @switch (m) {
                  @case ('File') {
                    <button type="button" (click)="newScene()">New scene…</button>
                    <button type="button" (click)="newBroadcast()">New broadcast layout…</button>
                    <button type="button" (click)="duplicateScene()">Duplicate scene…</button>
                    <button type="button" (click)="renameScene()">Rename scene…</button>
                    <hr />
                    <label class="as-btn" (click)="$event.stopPropagation()">
                      Import scene from file…
                      <input type="file" accept=".json,application/json" hidden (change)="importScene($event); openMenu.set(null)" />
                    </label>
                    <button type="button" (click)="exportScene()">Export scene to file</button>
                    <hr />
                    <a class="as-btn" [href]="outputUrl()" target="_blank" rel="noopener">Open Output page (OBS URL) ↗</a>
                    <button type="button" (click)="popOutput()">Open Output in its own window</button>
                    <hr />
                    <button type="button" class="danger-text" (click)="deleteScene()" [disabled]="live.sceneList().length < 2">Delete scene…</button>
                  }
                  @case ('Edit') {
                    <button type="button" [disabled]="!editor.canUndo()" (click)="editor.undo()">Undo <kbd>Ctrl/⌘ Z</kbd></button>
                    <button type="button" [disabled]="!editor.canRedo()" (click)="editor.redo()">Redo <kbd>Ctrl/⌘ ⇧ Z</kbd></button>
                    <hr />
                    <button type="button" (click)="editBlackout()">Blackout message…</button>
                  }
                  @case ('View') {
                    <button type="button" [class.check]="ws.workspace() === 'design'" (click)="ws.setWorkspace('design')">Design workspace</button>
                    <button type="button" [class.check]="ws.workspace() === 'live'" (click)="ws.setWorkspace('live')">Live workspace</button>
                    <hr />
                    <button type="button" [class.check]="ws.floating()" (click)="ws.setFloating(!ws.floating())">Program monitor floating</button>
                    <button type="button" [class.check]="ws.poppedOut()" (click)="ws.poppedOut() ? ws.bringBack() : ws.popOut()">Program monitor in its own window</button>
                    <hr />
                    <button type="button" [class.check]="ws.layout().left" (click)="ws.toggle('left')">{{ ws.workspace() === 'live' ? 'Scenes & layers' : 'Widget library' }} panel</button>
                    <button type="button" [class.check]="ws.layout().right" (click)="ws.toggle('right')">Settings panel</button>
                    @if (ws.workspace() === 'design') {
                      <button type="button" [class.check]="ws.layout().bottom" (click)="ws.toggle('bottom')">Layers &amp; event pad</button>
                    }
                    <button type="button" (click)="ws.patchLayout({ leftW: null, rightW: null })">Reset panel sizes</button>
                  }
                  @case ('Match') {
                    <button type="button" (click)="live.send({ type: 'matches:refresh' })">Refresh live matches <small>1 call</small></button>
                    <hr />
                    <button type="button" [class.check]="mode() === 'auto'" (click)="setMode('auto')">Update automatically</button>
                    <button type="button" [class.check]="mode() === 'manual'" (click)="setMode('manual')">Update only when I ask</button>
                    <button type="button" [class.check]="paused()" (click)="togglePause()">Pause all API calls</button>
                    <button type="button" [disabled]="!canPollNow()" (click)="pollNow()">Update now <small>1 call</small></button>
                  }
                  @case ('Help') {
                    <a class="as-btn" href="https://github.com/noorshikalgar/cricket-live-overlay#readme" target="_blank" rel="noopener">Guide (README) ↗</a>
                    <a class="as-btn" href="https://github.com/noorshikalgar/cricket-live-overlay/issues" target="_blank" rel="noopener">Report a problem ↗</a>
                    <hr />
                    <span class="head">Keyboard shortcuts</span>
                    @for (k of shortcuts; track k[0]) {
                      <span class="kb"><span>{{ k[1] }}</span><kbd>{{ k[0] }}</kbd></span>
                    }
                  }
                }
              </div>
            }
          </div>
        }
      </nav>
      <span class="spacer"></span>
      @if (!live.connected()) {
        <span class="offline">Server offline · reconnecting…</span>
      }
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
      <a class="out" [class.on]="live.clients().outputs > 0" [href]="outputUrl()" target="_blank" rel="noopener" title="The Output page OBS loads (Browser Source URL)">
        <i class="dot" [class.live]="live.clients().outputs > 0"></i>
        OBS {{ live.clients().outputs > 0 ? 'connected' + (live.clients().outputs > 1 ? ' ×' + live.clients().outputs : '') : 'not connected' }}
      </a>
    </div>

    <!-- row 2: the tools used all the time, in labelled groups -->
    <div class="toolbar">
      <div class="tgroup">
        <div class="tools">
          <div class="seg" role="radiogroup" aria-label="Workspace">
            <button type="button" role="radio" [attr.aria-checked]="ws.workspace() === 'design'" [class.on]="ws.workspace() === 'design'" (click)="ws.setWorkspace('design')" title="Build and edit layouts">
              ✎ Design
            </button>
            <button type="button" role="radio" [attr.aria-checked]="ws.workspace() === 'live'" [class.on]="ws.workspace() === 'live'" class="live" (click)="ws.setWorkspace('live')" title="Preview and Program side by side, Take to air">
              ● Live
            </button>
          </div>
          @if (ws.workspace() === 'design') {
            <button type="button" class="tbtn" [class.on]="ws.floating()" [attr.aria-pressed]="ws.floating()" (click)="ws.setFloating(!ws.floating())" title="A floating window with what's on air">
              ▣ Program
            </button>
          }
        </div>
        <span class="cap">Workspace</span>
      </div>

      <div class="tgroup">
        <div class="tools">
          <select class="wide" [value]="editor.sceneId() ?? ''" (change)="pickScene($event)" aria-label="Scene being edited">
            @for (s of live.sceneList(); track s.id) {
              <option [value]="s.id" [selected]="s.id === editor.sceneId()">
                {{ s.name }}{{ s.id === live.settings().activeSceneId ? '  ● on air' : '' }}
              </option>
            }
          </select>
          @if (editor.isOnAir()) {
            <span class="onair">● ON AIR</span>
          } @else {
            <button type="button" class="tbtn primary" (click)="goLive()" title="Show this scene on the Output">Put on air</button>
          }
        </div>
        <span class="cap">Scene</span>
      </div>

      <div class="tgroup">
        <div class="tools">
          <select class="wide" [value]="live.settings().selectedMatchId ?? ''" (change)="pickMatch($event)" aria-label="Match">
            <option value="">No match (design mode)</option>
            @if (selectedMissing(); as sel) {
              <option [value]="sel.id" selected>{{ sel.label }}</option>
            }
            @for (m of live.matches(); track m.id) {
              <option [value]="m.id" [selected]="m.id === live.settings().selectedMatchId">{{ m.title }} · {{ m.scoreLine }}</option>
            }
          </select>
          <button type="button" class="tbtn icon" title="Refresh the list of live matches (1 API call)" (click)="live.send({ type: 'matches:refresh' })">↻</button>
        </div>
        <span class="cap">Match</span>
      </div>

      <div class="tgroup">
        <div class="tools">
          <div class="seg">
            <button type="button" [class.on]="mode() === 'auto'" (click)="setMode('auto')" title="Update the score on a timer">Auto</button>
            <button type="button" [class.on]="mode() === 'manual'" (click)="setMode('manual')" title="Update only when you press Update">Manual</button>
          </div>
          @if (mode() === 'auto' && !paused()) {
            <select [value]="intervalValue()" (change)="setInterval($event)" aria-label="Update interval" title="How often the score is fetched">
              @for (o of intervals; track o.value) {
                <option [value]="o.value" [selected]="o.value === intervalValue()">{{ o.label }}</option>
              }
            </select>
          }
          <button type="button" class="tbtn" [class.warn]="paused()" [attr.aria-pressed]="paused()" (click)="togglePause()" [title]="paused() ? 'Resume automatic score updates' : 'Pause all automatic API calls (e.g. during a break)'">
            {{ paused() ? '▶ Resume' : '⏸ Pause' }}
          </button>
          <button type="button" class="tbtn primary" [disabled]="!canPollNow()" (click)="pollNow()" title="Fetch the latest score now (1 API call)">⟳ Update</button>
          @if (paused()) {
            <span class="note warn">paused · no API calls</span>
          } @else if (countdown(); as c) {
            <span class="note">next {{ c }}</span>
          }
        </div>
        <span class="cap">Score updates</span>
      </div>

      <span class="spacer"></span>

      <div class="tgroup">
        <div class="tools">
          <button type="button" class="tbtn icon" title="Undo (Ctrl/⌘+Z)" [disabled]="!editor.canUndo()" (click)="editor.undo()">↶</button>
          <button type="button" class="tbtn icon" title="Redo (Ctrl/⌘+Shift+Z)" [disabled]="!editor.canRedo()" (click)="editor.redo()">↷</button>
        </div>
        <span class="cap">Edit</span>
      </div>

      <div class="tgroup">
        <div class="tools">
          <button
            type="button"
            class="tbtn blackout"
            [class.on]="live.settings().blackout"
            (click)="toggleBlackout()"
            [title]="live.settings().blackout ? 'Restore the Output (Ctrl/⌘+Shift+B)' : 'Emergency: cover the Output in black with your message (Ctrl/⌘+Shift+B)'"
          >
            {{ live.settings().blackout ? '⛔ BLACKOUT ON · Restore' : '⛔ Blackout' }}
          </button>
        </div>
        <span class="cap">Emergency</span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      background: var(--ui-panel);
      border-bottom: 1px solid var(--ui-border);
      font-size: 12.5px;
      user-select: none;
    }
    /* ---- menu bar ---- */
    .menubar {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 32px;
      padding: 0 10px;
      background: var(--ui-bg);
      border-bottom: 1px solid var(--ui-border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      margin-right: 10px;
      white-space: nowrap;
    }
    .logo {
      border-radius: 4px;
    }
    .menus {
      display: flex;
      gap: 0;
    }
    .menu-wrap {
      position: relative;
    }
    .menu-btn {
      background: transparent !important;
      border: 0 !important;
      padding: 5px 10px !important;
      border-radius: 5px !important;
      color: var(--ui-text);
      font-weight: 500;
    }
    .menu-btn:hover,
    .menu-btn.open {
      background: var(--ui-chip) !important;
    }
    .dropdown {
      position: absolute;
      top: calc(100% + 2px);
      left: 0;
      z-index: 70;
      min-width: 260px;
      padding: 5px;
      display: flex;
      flex-direction: column;
      background: #151b26;
      border: 1px solid var(--ui-border);
      border-radius: 8px;
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
    }
    .dropdown > button,
    .dropdown > .as-btn {
      justify-content: space-between;
      width: 100%;
      background: transparent;
      border: 0;
      border-radius: 5px;
      padding: 7px 10px 7px 28px;
      text-align: left;
      color: var(--ui-text);
      text-decoration: none;
      font: 500 12.5px/1.2 Inter, Mukta, sans-serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      position: relative;
    }
    .dropdown > button:hover:not(:disabled),
    .dropdown > .as-btn:hover {
      background: var(--ui-accent-soft);
    }
    .dropdown > button.check::before {
      content: '✓';
      position: absolute;
      left: 10px;
      color: var(--ui-accent);
    }
    .dropdown > hr {
      width: 100%;
      border: 0;
      border-top: 1px solid var(--ui-border);
      margin: 4px 0;
    }
    .dropdown small,
    .dropdown kbd {
      color: var(--ui-muted);
      font: 11px Inter, sans-serif;
    }
    .dropdown .head {
      padding: 6px 10px 4px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
    }
    .dropdown .kb {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 3px 10px;
      font-size: 12px;
    }
    .danger-text {
      color: #fca5a5 !important;
    }
    .spacer {
      flex: 1;
    }
    .offline {
      color: #fca5a5;
      font-weight: 600;
    }
    .poll,
    .out {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      border-radius: 99px;
      background: var(--ui-chip);
      color: var(--ui-muted);
      font-size: 11.5px;
      white-space: nowrap;
      text-decoration: none;
    }
    .poll.warn {
      color: #fbbf24;
    }
    .poll.err {
      color: #fca5a5;
    }
    .out.on {
      color: var(--ui-text);
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--ui-muted);
      display: inline-block;
    }
    .dot.live {
      background: var(--ui-accent);
      box-shadow: 0 0 6px var(--ui-accent);
    }
    .dot.brk {
      background: #fbbf24;
    }
    .dot.bad {
      background: #ef4444;
    }
    /* ---- toolbar: labelled groups ---- */
    .toolbar {
      display: flex;
      align-items: stretch;
      flex-wrap: wrap;
      padding: 4px 6px 2px;
    }
    .tgroup {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 2px;
      padding: 2px 10px;
      border-right: 1px solid var(--ui-border);
    }
    .tgroup:last-child {
      border-right: 0;
    }
    .toolbar > .spacer + .tgroup {
      border-left: 1px solid var(--ui-border);
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
    }
    .cap {
      font-size: 10px;
      text-align: center;
      color: var(--ui-muted);
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    select {
      padding: 5px 8px !important;
      font-size: 12px !important;
    }
    select.wide {
      max-width: 240px;
    }
    .seg {
      display: inline-flex;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      overflow: hidden;
    }
    .seg button {
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      color: var(--ui-muted) !important;
      padding: 5px 10px !important;
    }
    .seg button.on {
      background: var(--ui-accent-soft) !important;
      color: var(--ui-accent) !important;
      font-weight: 700;
    }
    .seg button.live.on {
      background: rgba(239, 68, 68, 0.15) !important;
      color: #f87171 !important;
    }
    .tbtn {
      padding: 5px 10px !important;
      white-space: nowrap;
    }
    .tbtn.icon {
      width: 30px;
      padding: 5px 0 !important;
      justify-content: center;
    }
    .tbtn.on {
      background: var(--ui-accent-soft) !important;
      border-color: var(--ui-accent) !important;
      color: var(--ui-accent) !important;
    }
    .tbtn.warn {
      background: #b45309 !important;
      border-color: #f59e0b !important;
      color: #fff !important;
    }
    .tbtn.blackout {
      background: rgba(127, 29, 29, 0.6) !important;
      border-color: #991b1b !important;
      color: #fecaca !important;
      font-weight: 700;
    }
    .tbtn.blackout.on {
      background: #dc2626 !important;
      color: #fff !important;
      animation: bo-pulse 1s ease-in-out infinite;
    }
    @keyframes bo-pulse {
      50% {
        box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.35);
      }
    }
    .onair {
      color: #f87171;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.06em;
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.14);
      white-space: nowrap;
    }
    .note {
      font-size: 11.5px;
      color: var(--ui-muted);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .note.warn {
      color: #fbbf24;
    }
    @media (max-width: 900px) {
      .cap,
      .brand-name,
      .calls {
        display: none;
      }
      .tgroup {
        padding: 2px 6px;
      }
      select.wide {
        max-width: 46vw;
      }
    }
  `,
})
export class TopBarComponent {
  protected readonly live = inject(LiveStore);
  protected readonly editor = inject(EditorStore);
  protected readonly ws = inject(WorkspaceStore);
  private readonly prompt = inject(PromptService);
  /** which menu of the menu bar is open */
  protected readonly openMenu = signal<string | null>(null);
  protected readonly menus = ['File', 'Edit', 'View', 'Match', 'Help'];
  protected readonly shortcuts: [string, string][] = [
    ['Ctrl/⌘ Z · ⇧ Z', 'Undo · Redo'],
    ['Ctrl/⌘ D', 'Duplicate widget'],
    ['Delete', 'Delete widget'],
    ['Arrows · ⇧ Arrows', 'Nudge 1 px · 10 px'],
    ['Alt 1…9', 'Put scene 1…9 on air'],
    ['4 · 6 · W', 'Four · Six · Wicket banner'],
    ['D · K · B', 'DRS · Drinks · Break'],
    ['Ctrl/⌘ ⇧ B', 'Blackout on / off'],
    ['Esc', 'Deselect · close menus'],
  ];

  protected toggleMenu(m: string, e: Event): void {
    e.stopPropagation();
    this.openMenu.set(this.openMenu() === m ? null : m);
  }

  /** like a desktop menu bar: once one menu is open, hovering opens the others */
  protected hoverMenu(m: string): void {
    if (this.openMenu() && this.openMenu() !== m) this.openMenu.set(m);
  }

  protected closeMenuOutside(e: Event): void {
    if (!this.openMenu()) return;
    if (!(e.target as HTMLElement).closest('.menus')) this.openMenu.set(null);
  }

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
    if (!next || this.mode() !== 'auto' || this.paused()) return null;
    const s = Math.max(0, Math.round((next - this.now()) / 1000));
    const t = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
    // the chosen interval is stretched to save calls during breaks and after errors: say so
    const phase = this.live.poll()?.phase;
    return phase === 'break' ? `${t} · break (1 call/min)` : phase === 'error' ? `${t} · retrying` : t;
  });

  /** a match is selected and the last poll wasn't in the last 5 s (their cache is 10 s anyway) */
  protected readonly canPollNow = computed(() => {
    const p = this.live.poll();
    if (!this.live.settings().selectedMatchId || !p) return false;
    return !p.lastPollAt || this.now() - p.lastPollAt > 5000;
  });

  toggleBlackout(): void {
    this.live.send({ type: 'settings:update', settings: { blackout: !this.live.settings().blackout } });
  }

  protected async editBlackout(): Promise<void> {
    const s = this.live.settings();
    const text = await this.prompt.ask('Blackout message (main line)', s.blackoutText || "We'll be right back", 'Next');
    if (text === null) return;
    const sub = await this.prompt.ask('Second line (optional, leave empty for none)', s.blackoutSubtext || ' ', 'Save');
    this.live.send({
      type: 'settings:update',
      settings: { blackoutText: text, blackoutSubtext: (sub ?? '').trim() },
    });
  }

  protected readonly paused = computed(() => this.live.settings().pollPaused === true);

  protected togglePause(): void {
    this.live.send({ type: 'settings:update', settings: { pollPaused: !this.paused() } });
  }

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

  /** A separate, visible window keeps animating while you work in the Studio (a background tab doesn't). */
  protected popOutput(): void {
    const w = Math.round(Math.min(960, screen.availWidth / 2));
    const h = Math.round((w * 9) / 16);
    window.open(
      this.outputUrl(),
      'cos-output',
      `popup=yes,width=${w},height=${h},left=${screen.availWidth - w - 20},top=60`,
    );
  }

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

  /** a ready-made TV-style scene; it is a normal scene afterwards, every widget editable */
  protected async newBroadcast(): Promise<void> {
    const name = await this.prompt.ask('Name for the broadcast layout', 'Broadcast', 'Create');
    if (!name) return;
    this.createAndEdit({ type: 'scene:create', name, template: 'broadcast' });
  }

  protected async duplicateScene(): Promise<void> {
    const cur = this.editor.scene();
    if (!cur) return;
    const name = await this.prompt.ask('Name for the copy', `${cur.name} copy`, 'Duplicate');
    if (name) this.createAndEdit({ type: 'scene:create', name, copyFrom: cur.id });
  }

  /** Create on the server, then switch the editor to the new scene once it arrives. */
  private createAndEdit(msg: { type: 'scene:create'; name: string; copyFrom?: string; template?: 'broadcast' }): void {
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
