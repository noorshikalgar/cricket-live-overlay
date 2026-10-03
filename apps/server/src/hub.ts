import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { isClientMessage, newId, summarize, type ClientMessage, type ClientRole, type ServerMessage } from '@cos/shared';
import { manualEvent } from './events';
import type { CardService } from './cards';
import type { ObsBridge } from './obs';
import type { Poller } from './poller';
import { validateScene, type SceneStore } from './scenes';

interface Client {
  id: string;
  ws: WebSocket;
  role: ClientRole | null;
}

/**
 * The single WebSocket channel. Server is the source of truth: Studio sends
 * edits, the hub saves them and rebroadcasts to every other client.
 */
export class Hub {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  private readonly clients = new Map<string, Client>();
  private poller: Poller | null = null;
  private cards: CardService | null = null;

  constructor(
    private readonly scenes: SceneStore,
    private readonly obs: ObsBridge,
  ) {
    this.wss.on('connection', (ws) => this.onConnection(ws));
    // drop dead sockets (laptop sleep, OBS source hidden) so the client counts stay true
    setInterval(() => {
      for (const c of this.clients.values()) {
        const alive = c.ws as WebSocket & { isAlive?: boolean };
        if (alive.isAlive === false) {
          c.ws.terminate();
          continue;
        }
        alive.isAlive = false;
        c.ws.ping();
      }
    }, 15_000).unref();
  }

  attach(poller: Poller, cards: CardService): void {
    this.poller = poller;
    this.cards = cards;
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  broadcast(msg: ServerMessage, exceptId?: string): void {
    const data = JSON.stringify(msg);
    for (const c of this.clients.values()) {
      if (c.id !== exceptId && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
    }
  }

  private send(c: Client, msg: ServerMessage): void {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
  }

  private onConnection(ws: WebSocket): void {
    const c: Client = { id: newId(), ws, role: null };
    this.clients.set(c.id, c);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });
    ws.on('message', (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (isClientMessage(msg)) this.onMessage(c, msg);
    });
    ws.on('close', () => {
      this.clients.delete(c.id);
      this.broadcastClients();
    });
  }

  private onMessage(c: Client, msg: ClientMessage): void {
    const poller = this.poller;
    switch (msg.type) {
      case 'hello': {
        c.role = msg.role === 'output' ? 'output' : 'studio';
        this.send(c, {
          type: 'hello',
          clientId: c.id,
          scenes: this.scenes.list(),
          settings: this.scenes.getSettings(),
          match: poller?.state ?? null,
          poll: poller?.pollStatus ?? emptyPoll(),
        });
        if (poller) this.send(c, { type: 'matches:list', matches: poller.liveMatches });
        this.send(c, { type: 'obs:status', status: this.obs.status });
        if (this.cards) {
          this.send(c, { type: 'cards:scorecard', scorecard: this.cards.current.scorecard });
          this.send(c, { type: 'cards:squads', squads: this.cards.current.squads });
        }
        this.broadcastClients();
        return;
      }
      case 'scene:update': {
        if (c.role !== 'studio') return;
        const valid = validateScene(msg.scene);
        if (!valid) return this.send(c, { type: 'error', message: 'Rejected malformed scene update' });
        const saved = this.scenes.upsert(valid);
        this.broadcast({ type: 'scene:update', scene: saved, origin: c.id }, c.id);
        if (saved.id === this.scenes.getSettings().activeSceneId) this.obs.placeFor(saved);
        return;
      }
      case 'scene:create': {
        if (c.role !== 'studio') return;
        const scene = this.scenes.create(msg.name.slice(0, 80) || 'Untitled', msg.copyFrom);
        this.broadcast({ type: 'scene:update', scene, origin: null });
        return;
      }
      case 'scene:delete': {
        if (c.role !== 'studio') return;
        const wasActive = this.scenes.getSettings().activeSceneId === msg.sceneId;
        if (!this.scenes.delete(msg.sceneId)) return this.send(c, { type: 'error', message: 'Cannot delete the last scene' });
        this.broadcast({ type: 'scene:deleted', sceneId: msg.sceneId });
        if (wasActive) this.broadcastSettings();
        return;
      }
      case 'scene:switch': {
        if (c.role !== 'studio' || !this.scenes.get(msg.sceneId)) return;
        this.scenes.updateSettings({ activeSceneId: msg.sceneId });
        this.broadcast({ type: 'scene:switch', sceneId: msg.sceneId });
        this.broadcastSettings();
        this.obs.placeFor(this.scenes.get(msg.sceneId));
        return;
      }
      case 'event:manual': {
        if (c.role !== 'studio') return;
        this.broadcast({ type: 'match:event', event: manualEvent(msg.eventType, poller?.state ?? null) });
        return;
      }
      case 'match:select': {
        if (c.role !== 'studio') return;
        this.scenes.updateSettings({ selectedMatchId: msg.matchId });
        this.broadcastSettings();
        this.cards?.reset(msg.matchId);
        poller?.select(msg.matchId);
        return;
      }
      case 'pointer': {
        if (c.role !== 'studio') return;
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        // relay only: never stored, never echoed back to the sender
        this.broadcast({ type: 'pointer', x, y, visible: msg.visible === true, click: msg.click === true }, c.id);
        return;
      }
      case 'poll:now': {
        if (c.role !== 'studio') return;
        poller?.pollNow();
        return;
      }
      case 'cards:fetch': {
        if (c.role !== 'studio') return;
        void this.cards?.fetch(msg.kind === 'squads' ? 'squads' : 'scorecard', msg.force === true);
        return;
      }
      case 'matches:refresh': {
        void poller?.refreshMatches();
        return;
      }
      case 'settings:update': {
        if (c.role !== 'studio') return;
        const { activeSceneId: _a, selectedMatchId: _m, ...rest } = msg.settings;
        const before = this.scenes.getSettings().obsBridge;
        const next = this.scenes.updateSettings(rest);
        this.broadcastSettings();
        poller?.setControl(next.pollMode, next.pollSeconds, next.pollPaused);
        if (next.obsBridge !== before) {
          void this.obs.setEnabled(next.obsBridge).then(() => {
            if (next.obsBridge && next.activeSceneId) this.obs.placeFor(this.scenes.get(next.activeSceneId));
          });
        }
        return;
      }
    }
  }

  broadcastSettings(): void {
    this.broadcast({ type: 'settings', settings: this.scenes.getSettings() });
  }

  broadcastSceneList(): void {
    this.broadcast({ type: 'scene:list', scenes: this.scenes.list().map(summarize) });
  }

  private broadcastClients(): void {
    let outputs = 0;
    let studios = 0;
    for (const c of this.clients.values()) {
      if (c.role === 'output') outputs++;
      else if (c.role === 'studio') studios++;
    }
    this.broadcast({ type: 'clients', outputs, studios });
  }
}

function emptyPoll() {
  return {
    provider: 'none',
    matchId: null,
    phase: 'idle' as const,
    intervalSeconds: 0,
    callsToday: 0,
    dailyLimit: 0,
    lastPollAt: null,
    lastError: null,
    stale: false,
    mode: 'auto' as const,
    paused: false,
    nextPollAt: null,
  };
}
