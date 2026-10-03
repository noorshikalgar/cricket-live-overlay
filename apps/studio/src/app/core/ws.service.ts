import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type { ClientMessage, ClientRole, ServerMessage } from '@cos/shared';

const MAX_BACKOFF_MS = 10_000;

/** One WebSocket to the local server, reconnecting with exponential backoff. */
@Injectable({ providedIn: 'root' })
export class WsService {
  readonly connected = signal(false);
  readonly messages = new Subject<ServerMessage>();

  private ws: WebSocket | null = null;
  private role: ClientRole = 'studio';
  private backoff = 500;
  private started = false;

  connect(role: ClientRole): void {
    this.role = role;
    if (this.started) return;
    this.started = true;
    this.open();
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
      this.connected.set(true);
      ws.send(JSON.stringify({ type: 'hello', role: this.role } satisfies ClientMessage));
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      try {
        this.messages.next(JSON.parse(e.data) as ServerMessage);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.connected.set(false);
      this.ws = null;
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    };
    ws.onerror = () => ws.close();
  }
}
