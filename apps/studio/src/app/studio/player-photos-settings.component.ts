import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { PlayerPhotoSources } from '@cos/shared';
import { LiveStore } from '../core/live.store';

interface SourcesInfo {
  folder: string;
  ownCount: number;
  apiAvailable: boolean;
  provider: string;
}

interface CheckRow {
  team: string;
  name: string;
  source: 'own' | 'api' | 'wikimedia' | 'avatar';
  pending: boolean;
}

const SOURCE_LABEL: Record<CheckRow['source'], string> = {
  own: 'Your photo',
  api: 'API photo',
  wikimedia: 'Wikimedia',
  avatar: 'Drawn avatar',
};

/**
 * Where player pictures come from: the user's photos folder, the cricket API,
 * Wikimedia, then the drawn avatar, in that order. Shows the folder and how to
 * name files, and checks which picture each player of this match will get.
 */
@Component({
  selector: 'cos-player-photos-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="lead">Each player gets the first picture found, top to bottom.</p>
    <ol class="sources">
      <li [class.off]="!src().own">
        <label class="row">
          <input type="checkbox" [checked]="src().own" (change)="toggle('own', $event)" />
          <span class="name">1 · Your photos folder</span>
          <span class="count">{{ info()?.ownCount ?? 0 }} photo{{ info()?.ownCount === 1 ? '' : 's' }}</span>
        </label>
        <p class="hint">
          Files you drop in, named after the player. Used first, always. Works offline.
          <span class="path" [title]="info()?.folder ?? ''">{{ info()?.folder }}</span>
        </p>
        <div class="btns">
          <button type="button" (click)="openFolder()">📂 Open folder</button>
          <button type="button" (click)="showGuide.set(!showGuide())">{{ showGuide() ? 'Hide' : 'How to name files' }}</button>
        </div>
        @if (showGuide()) {
          <div class="guide">
            <p><b>File name = player name</b>, as the scoreboard spells it:</p>
            <code>Virat Kohli.png · rohit-sharma.jpg · JASPRIT_BUMRAH.webp</code>
            <p>Case, spaces, dashes and underscores don't matter; a near spelling of the surname still matches.</p>
            <p><b>Same name in both teams?</b> Put each file in a folder named with the team's short code: <code>IND/Rahul Sharma.png</code></p>
            <p>
              <b>Best look:</b> PNG or WebP with a <b>transparent background</b>, head and shoulders, about
              <b>600 × 600 px</b>, under 2 MB. JPGs are shown as photos, cropped from the top.
            </p>
            <p>New files are picked up immediately. Only use photos you're allowed to show.</p>
          </div>
        }
      </li>
      <li [class.off]="!src().api || !info()?.apiAvailable">
        <label class="row">
          <input type="checkbox" [checked]="src().api" [disabled]="!info()?.apiAvailable" (change)="toggle('api', $event)" />
          <span class="name">2 · Cricket API photos</span>
        </label>
        <p class="hint">
          @if (info()?.apiAvailable) {
            From the playing XIs: downloaded once per player and kept (1 API call each). Never uses your last
            15 calls of the day. Check your API plan allows showing them on a stream.
          } @else {
            Not available with the current data source ({{ info()?.provider ?? '…' }}). Needs the live cricket API.
          }
        </p>
      </li>
      <li [class.off]="!src().wikimedia">
        <label class="row">
          <input type="checkbox" [checked]="src().wikimedia" (change)="toggle('wikimedia', $event)" />
          <span class="name">3 · Wikimedia photos</span>
        </label>
        <p class="hint">Free-licence photos of well-known players, shown with the author and licence (required).</p>
      </li>
      <li class="always">
        <span class="row"><span class="dot"></span><span class="name">4 · Drawn avatar</span></span>
        <p class="hint">Our own illustrated cricketer in the team's colours, for everyone else. Always on.</p>
      </li>
    </ol>

    <div class="btns">
      <button type="button" class="primary" (click)="check()" [disabled]="checking()">
        {{ checking() ? 'Checking…' : "Check this match's players" }}
      </button>
      @if (src().api || src().wikimedia) {
        <button type="button" (click)="prefetch()" [disabled]="fetching()" title="Download API / Wikimedia photos for both XIs now, before going live">
          {{ fetching() ? 'Fetching…' : '⤓ Fetch photos now' }}
        </button>
      }
    </div>

    @if (rows(); as r) {
      @if (r.length) {
        <p class="summary">
          @for (s of summary(); track s.label) {
            <span [class]="'badge ' + s.key">{{ s.count }} {{ s.label }}</span>
          }
        </p>
        <ul class="check">
          @for (p of r; track p.team + p.name) {
            <li>
              <span class="pn">{{ p.name }}</span>
              <span class="tm">{{ p.team }}</span>
              <span [class]="'badge ' + p.source" [title]="p.pending ? 'Downloaded when first shown, or with Fetch photos now' : ''">
                {{ label(p.source) }}{{ p.pending ? ' (not downloaded yet)' : '' }}
              </span>
            </li>
          }
        </ul>
      } @else {
        <p class="hint">No players to check yet: select a match, and load the playing XIs from Live cards for the full list.</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .lead {
      margin: 0 0 8px;
      font-size: 12px;
      color: var(--ui-muted);
    }
    .sources {
      list-style: none;
      margin: 0 0 10px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sources > li {
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--ui-chip);
      border: 1px solid var(--ui-border);
    }
    .sources > li.off {
      opacity: 0.6;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }
    .always .row {
      cursor: default;
    }
    .dot {
      width: 13px;
      height: 13px;
      border-radius: 3px;
      background: var(--ui-accent);
      opacity: 0.6;
    }
    .name {
      flex: 1;
      font-weight: 600;
      font-size: 12.5px;
    }
    .count {
      font-size: 11px;
      color: var(--ui-muted);
    }
    .hint {
      margin: 4px 0 0 21px;
      font-size: 11.5px;
      line-height: 1.45;
      color: var(--ui-muted);
    }
    .path {
      display: block;
      margin-top: 3px;
      font: 11px ui-monospace, monospace;
      color: var(--ui-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      direction: rtl;
      text-align: left;
    }
    .btns {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0 0 21px;
    }
    :host > .btns {
      margin-left: 0;
    }
    .guide {
      margin: 8px 0 0 21px;
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--ui-bg);
      font-size: 11.5px;
      line-height: 1.5;
    }
    .guide p {
      margin: 0 0 6px;
    }
    .guide code {
      display: inline-block;
      margin: 0 0 6px;
      font: 11px ui-monospace, monospace;
      color: var(--ui-accent);
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 10px 0 6px;
    }
    .check {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
    }
    .check li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
      padding: 5px 8px;
      font-size: 12px;
      border-top: 1px solid var(--ui-border);
    }
    .check li:first-child {
      border-top: 0;
    }
    .pn {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tm {
      font-size: 11px;
      color: var(--ui-muted);
    }
    .badge {
      font-size: 10.5px;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: 99px;
      white-space: nowrap;
      background: var(--ui-bg);
      color: var(--ui-muted);
    }
    .badge.own {
      background: rgba(34, 197, 94, 0.18);
      color: #4ade80;
    }
    .badge.api {
      background: rgba(59, 130, 246, 0.18);
      color: #60a5fa;
    }
    .badge.wikimedia {
      background: rgba(168, 85, 247, 0.18);
      color: #c084fc;
    }
  `,
})
export class PlayerPhotosSettingsComponent {
  private readonly live = inject(LiveStore);
  protected readonly info = signal<SourcesInfo | null>(null);
  protected readonly rows = signal<CheckRow[] | null>(null);
  protected readonly checking = signal(false);
  protected readonly fetching = signal(false);
  protected readonly showGuide = signal(false);

  protected readonly src = computed<PlayerPhotoSources>(
    () => this.live.settings().playerPhotoSources ?? { own: true, api: false, wikimedia: false },
  );

  protected readonly summary = computed(() => {
    const r = this.rows() ?? [];
    return (['own', 'api', 'wikimedia', 'avatar'] as const)
      .map((key) => ({ key, label: SOURCE_LABEL[key], count: r.filter((x) => x.source === key).length }))
      .filter((s) => s.count > 0);
  });

  constructor() {
    // folder count and API availability, refreshed when photos or sources change
    effect(() => {
      this.live.photosVersion();
      untracked(() => {
        void this.loadInfo();
        if (this.rows()) void this.check();
      });
    });
  }

  protected label(s: CheckRow['source']): string {
    return SOURCE_LABEL[s];
  }

  protected toggle(key: keyof PlayerPhotoSources, e: Event): void {
    const on = (e.target as HTMLInputElement).checked;
    this.live.send({ type: 'settings:update', settings: { playerPhotoSources: { ...this.src(), [key]: on } } });
  }

  private async loadInfo(): Promise<void> {
    try {
      const res = await fetch('/api/players/sources');
      if (res.ok) this.info.set((await res.json()) as SourcesInfo);
    } catch {
      // server unreachable: keep what we had
    }
  }

  protected async openFolder(): Promise<void> {
    await fetch('/api/players/open-folder', { method: 'POST' }).catch(() => undefined);
  }

  protected async check(): Promise<void> {
    this.checking.set(true);
    try {
      const res = await fetch('/api/players/check');
      if (res.ok) this.rows.set(((await res.json()) as { rows: CheckRow[] }).rows);
    } finally {
      this.checking.set(false);
    }
  }

  protected async prefetch(): Promise<void> {
    const squads = this.live.squads();
    if (!squads) this.live.send({ type: 'cards:fetch', kind: 'squads', force: false });
    const names = (squads?.teams ?? []).flatMap((t) => t.playingXI.map((p) => p.name));
    if (!names.length) return;
    this.fetching.set(true);
    try {
      await fetch('/api/players/prefetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names }),
      });
    } finally {
      this.fetching.set(false);
    }
  }
}
