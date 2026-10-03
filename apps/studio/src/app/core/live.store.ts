import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  DEFAULT_SETTINGS,
  battingTeam,
  type AppSettings,
  type ClientMessage,
  type ClientRole,
  type MatchEvent,
  type MatchState,
  type MatchSummary,
  type ObsStatus,
  type PollStatus,
  type Scene,
  type Scorecard,
  type ServerMessage,
  type Squads,
} from '@cos/shared';
import { WsService } from './ws.service';

const SCENE_SEND_INTERVAL_MS = 33;

/**
 * Client-side mirror of server state, as signals. Both Studio and Output read
 * from here; only Studio writes (through the socket).
 */
@Injectable({ providedIn: 'root' })
export class LiveStore {
  private readonly ws = inject(WsService);

  readonly connected = this.ws.connected;
  readonly ready = signal(false);
  readonly clientId = signal<string | null>(null);
  readonly scenes = signal<Record<string, Scene>>({});
  readonly settings = signal<AppSettings>({ ...DEFAULT_SETTINGS });
  readonly match = signal<MatchState | null>(null);
  readonly poll = signal<PollStatus | null>(null);
  readonly matches = signal<MatchSummary[]>([]);
  readonly clients = signal({ outputs: 0, studios: 0 });
  readonly obs = signal<ObsStatus>({ enabled: false, connected: false, error: null });
  readonly lastError = signal<string | null>(null);
  /** detail data for on-air cards */
  readonly scorecard = signal<Scorecard | null>(null);
  readonly squads = signal<Squads | null>(null);
  /** fires for every auto-detected and manual event */
  readonly events = new Subject<MatchEvent>();
  /** live pointer moves from the Studio (high frequency, so a stream rather than a signal) */
  readonly pointer = new Subject<{ x: number; y: number; visible: boolean; click: boolean }>();
  /** fires when the on-air scene changes, before signals update, so Output can capture Flip state */
  readonly sceneSwitch = new Subject<string>();

  readonly sceneList = computed(() =>
    Object.values(this.scenes()).sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly activeScene = computed(() => {
    const id = this.settings().activeSceneId;
    return id ? (this.scenes()[id] ?? null) : null;
  });
  readonly teamColor = computed(() => {
    const m = this.match();
    return m ? (battingTeam(m)?.primaryColor ?? null) : null;
  });

  private pendingScenes = new Map<string, Scene>();
  private sendTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ws.messages.subscribe((m) => this.handle(m));
  }

  connect(role: ClientRole): void {
    this.ws.connect(role);
  }

  send(msg: ClientMessage): void {
    this.ws.send(msg);
  }

  /** Apply a scene edit locally right away and send it, throttled to ~30 fps. */
  pushScene(scene: Scene): void {
    this.scenes.update((all) => ({ ...all, [scene.id]: scene }));
    this.pendingScenes.set(scene.id, scene);
    if (this.sendTimer) return;
    this.sendTimer = setTimeout(() => this.flushScenes(), SCENE_SEND_INTERVAL_MS);
  }

  flushScenes(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    for (const scene of this.pendingScenes.values()) this.ws.send({ type: 'scene:update', scene });
    this.pendingScenes.clear();
  }

  /**
   * Called with every scene that arrives. An Output page that has been open since
   * before an update (e.g. an OBS Browser Source) may not know a newer widget type;
   * reloading picks up the new code instead of silently skipping the widget.
   */
  knownWidgetTypes: ReadonlySet<string> | null = null;
  private reloading = false;

  /** run the check against everything already received (called once the renderer knows its types) */
  recheckWidgetTypes(): void {
    this.checkWidgetTypes(Object.values(this.scenes()));
  }

  private checkWidgetTypes(scenes: Scene[]): void {
    const known = this.knownWidgetTypes;
    if (!known || this.reloading) return;
    const unknown = scenes.flatMap((s) => s.widgets).find((w) => !known.has(w.type));
    if (!unknown) return;
    // at most one reload per 5 minutes: a genuinely stale build must not reload in a loop
    let last = 0;
    try {
      last = Number(sessionStorage.getItem('cos-reload-at')) || 0;
    } catch {
      // storage blocked: fall through and reload once
    }
    if (Date.now() - last < 5 * 60_000) {
      console.warn(`[overlay] unknown widget type "${unknown.type}"; reload or rebuild to show it`);
      return;
    }
    this.reloading = true;
    try {
      sessionStorage.setItem('cos-reload-at', String(Date.now()));
    } catch {
      // ignore
    }
    console.warn(`[overlay] unknown widget type "${unknown.type}": reloading to get the latest code`);
    setTimeout(() => location.reload(), 500);
  }

  private handle(m: ServerMessage): void {
    switch (m.type) {
      case 'hello':
        this.clientId.set(m.clientId);
        this.scenes.set(Object.fromEntries(m.scenes.map((s) => [s.id, s])));
        this.checkWidgetTypes(m.scenes);
        this.settings.set(m.settings);
        this.match.set(m.match);
        this.poll.set(m.poll);
        this.ready.set(true);
        return;
      case 'match:state':
        this.match.set(m.state);
        return;
      case 'match:event':
        this.events.next(m.event);
        return;
      case 'matches:list':
        this.matches.set(m.matches);
        return;
      case 'scene:update':
        // never let an echo overwrite an edit we still have queued
        if (this.pendingScenes.has(m.scene.id)) return;
        this.checkWidgetTypes([m.scene]);
        this.scenes.update((all) => ({ ...all, [m.scene.id]: m.scene }));
        return;
      case 'scene:deleted':
        this.scenes.update((all) => {
          const next = { ...all };
          delete next[m.sceneId];
          return next;
        });
        return;
      case 'scene:list':
      case 'scene:switch':
        // the settings message that follows carries the new activeSceneId
        return;
      case 'settings':
        if (m.settings.activeSceneId !== this.settings().activeSceneId && m.settings.activeSceneId) {
          this.sceneSwitch.next(m.settings.activeSceneId);
        }
        this.settings.set(m.settings);
        return;
      case 'poll:status':
        this.poll.set(m.status);
        return;
      case 'clients':
        this.clients.set({ outputs: m.outputs, studios: m.studios });
        return;
      case 'pointer':
        this.pointer.next({ x: m.x, y: m.y, visible: m.visible, click: m.click });
        return;
      case 'cards:scorecard':
        this.scorecard.set(m.scorecard);
        return;
      case 'cards:squads':
        this.squads.set(m.squads);
        return;
      case 'obs:status':
        this.obs.set(m.status);
        return;
      case 'error':
        this.lastError.set(m.message);
        setTimeout(() => this.lastError.set(null), 5000);
        return;
    }
  }
}
