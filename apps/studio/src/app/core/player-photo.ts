import { Injectable, inject, signal, type Signal, type WritableSignal } from '@angular/core';
import { LiveStore } from './live.store';
import { playerImageUrl } from './player-image';

/** a player's picture as the server chose it (own folder → API → Wikimedia → avatar) */
export interface PlayerPicture {
  src: string;
  source: 'own' | 'api' | 'wikimedia' | 'avatar';
  /** see-through background: draw as a cut-out figure rather than a cropped photo */
  cutout: boolean;
  /** Wikimedia photos must show their author and licence */
  credit?: string;
}

export interface PictureQuery {
  name: string;
  /** team short code, to pick the right file when two players share a name */
  team: string | null;
  color: string | null;
  role: string;
  style: 'tile' | 'cutout';
}

/**
 * Player pictures for every widget, looked up once per player and shared. The
 * drawn avatar shows straight away; the chosen picture replaces it when the
 * server answers. Everything is looked up again when the photos folder, the
 * sources or the playing XIs change.
 */
@Injectable({ providedIn: 'root' })
export class PlayerPhotos {
  private readonly store = inject(LiveStore);
  private readonly cache = new Map<string, WritableSignal<PlayerPicture>>();
  private version = -1;

  picture(q: PictureQuery): Signal<PlayerPicture> {
    const v = this.store.photosVersion();
    if (v !== this.version) {
      this.version = v;
      // keep what's shown until the new answer arrives, so pictures don't flash back to avatars
      for (const [key, sig] of this.cache) void this.load(key, sig);
    }
    const key = JSON.stringify([q.name, q.team, q.color, q.role, q.style]);
    let sig = this.cache.get(key);
    if (!sig) {
      sig = signal<PlayerPicture>({
        src: playerImageUrl(q.name, q.color, q.role, 'avatar', q.style),
        source: 'avatar',
        cutout: q.style === 'cutout',
      });
      this.cache.set(key, sig);
      void this.load(key, sig);
    }
    return sig;
  }

  private async load(key: string, sig: WritableSignal<PlayerPicture>): Promise<void> {
    const [name, team, color, role, style] = JSON.parse(key) as [string, string | null, string | null, string, string];
    const qs = new URLSearchParams({ name, role, style, color: (color ?? '#1D4ED8').replace('#', '') });
    if (team) qs.set('team', team);
    try {
      const res = await fetch(`/api/players/resolve?${qs.toString()}`);
      if (!res.ok) return;
      const pic = (await res.json()) as PlayerPicture;
      if (pic.src) sig.set(pic);
    } catch {
      // server unreachable: keep the avatar
    }
  }
}
