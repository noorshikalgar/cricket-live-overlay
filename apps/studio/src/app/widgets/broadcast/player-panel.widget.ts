import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LiveStore } from '../../core/live.store';
import { playerImageUrl, playerRole, sideColor } from '../../core/player-image';
import { OdometerDirective } from '../../motion/odometer.directive';
import { playerFigures, sameName } from '../cards/card-data';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

export interface PlayerPanelProps {
  /** who this panel follows */
  slot: 'striker' | 'nonStriker' | 'bowler' | 'name';
  /** used when slot = name */
  playerName: string;
  showImage: boolean;
  showFooter: boolean;
}

interface Shown {
  name: string;
  kind: 'bat' | 'bowl';
  onStrike: boolean;
  big: string;
  small: string;
  stats: { k: string; v: string }[];
}

/** Batter or bowler panel with player image, big figures and a stats footer. */
@Component({
  selector: 'cos-player-panel',
  imports: [MarqueeDirective, OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bc pp" [style.--team]="color()">
      @if (shown(); as s) {
        @if (p().showImage) {
          <div class="img">
            <img [src]="imgUrl()" alt="" (load)="loadCredit()" (error)="imgFailed.set(true)" [class.hide]="imgFailed()" />
            @if (credit()) {
              <span class="credit">{{ credit() }}</span>
            }
          </div>
        }
        <div class="main" [class.noimg]="!p().showImage">
          <div class="top">
            <span class="bc-tag">{{ t(s.kind === 'bat' ? 'Batter' : 'Bowler') }}</span>
            @if (s.onStrike) {
              <span class="strike" aria-label="on strike"></span>
            }
          </div>
          <div class="name bc-word" cosMarquee>{{ s.name }}</div>
          <div class="figs">
            <span class="bc-num big" [cosOdo]="s.big"></span>
            <span class="bc-num small bc-hl">{{ s.small }}</span>
          </div>
        </div>
        @if (p().showFooter) {
          <div class="bc-foot">
            @for (st of s.stats; track st.k) {
              <span class="stat"><span class="k">{{ t(st.k) }}</span> <b class="bc-num">{{ st.v }}</b></span>
            }
          </div>
        }
      } @else {
        <div class="empty">{{ editing() ? 'Player panel: follows the striker, non-striker, bowler or a named player' : '' }}</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) / 100 * var(--fs));
    }
    .pp {
      display: grid;
      grid-template-columns: auto 1fr;
    }
    .img {
      position: relative;
      height: calc(100% - var(--u) * 20);
      aspect-ratio: 1;
      align-self: start;
      overflow: hidden;
    }
    .img img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
      /* fade the bottom edge into the panel */
      -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent);
      mask-image: linear-gradient(180deg, #000 70%, transparent);
    }
    .img img.hide {
      visibility: hidden;
    }
    .credit {
      position: absolute;
      left: 0.4em;
      bottom: 0.2em;
      right: 0.4em;
      font: 500 12px/1.2 Inter, Mukta, sans-serif;
      color: rgba(255, 255, 255, 0.75);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .main {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding: calc(var(--u) * 5) calc(var(--u) * 6) 0 calc(var(--u) * 3);
      min-width: 0;
      text-align: right;
    }
    .main.noimg {
      grid-column: 1 / -1;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 0.5em;
      font-size: calc(var(--u) * 11);
    }
    .strike {
      width: 0.6em;
      height: 0.6em;
      border-radius: 50%;
      background: var(--hl);
      box-shadow: 0 0 0.5em var(--hl);
    }
    .name {
      font-size: calc(var(--u) * 17);
      margin-top: calc(var(--u) * 3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .figs {
      display: flex;
      align-items: baseline;
      gap: 0.25em;
      margin-top: calc(var(--u) * 2);
    }
    .big {
      font-size: calc(var(--u) * 36);
    }
    .small {
      font-size: calc(var(--u) * 20);
    }
    .bc-foot {
      height: calc(var(--u) * 20);
      font-size: calc(var(--u) * 12);
      z-index: 1;
    }
    .stat .k {
      margin-right: 0.25em;
      font-family: 'Barlow Condensed', var(--font);
      font-weight: 700;
      font-style: italic;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .stat b {
      font-size: 1.25em;
    }
    .empty {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 1em;
      font: 500 18px/1.3 Inter, Mukta, sans-serif;
      opacity: 0.8;
    }
  `,
})
export class PlayerPanelWidget extends WidgetBase<PlayerPanelProps> {
  protected readonly defaults: PlayerPanelProps = { slot: 'striker', playerName: '', showImage: true, showFooter: true };
  private readonly store = inject(LiveStore);
  protected readonly imgFailed = signal(false);
  protected readonly credit = signal<string | null>(null);

  protected readonly shown = computed<Shown | null>(() => {
    const m = this.match();
    if (!m) return null;
    const { slot, playerName } = this.p();
    const striker = m.batters.find((b) => b.onStrike) ?? m.batters[0];
    const other = m.batters.find((b) => b !== striker);
    const bat =
      slot === 'striker' ? striker : slot === 'nonStriker' ? other : slot === 'name' ? m.batters.find((b) => sameName(b.name, playerName)) : undefined;
    if (bat) {
      return {
        name: bat.name,
        kind: 'bat',
        onStrike: bat.onStrike,
        big: String(bat.runs),
        small: `(${bat.balls})`,
        stats: [
          { k: '4s', v: String(bat.fours) },
          { k: '6s', v: String(bat.sixes) },
          { k: 'SR', v: bat.strikeRate.toFixed(1) },
        ],
      };
    }
    const bw = slot === 'bowler' ? m.bowler : slot === 'name' && m.bowler && sameName(m.bowler.name, playerName) ? m.bowler : null;
    if (bw) {
      return {
        name: bw.name,
        kind: 'bowl',
        onStrike: false,
        big: `${bw.wickets}-${bw.runs}`,
        small: `(${bw.overs})`,
        stats: [
          { k: 'Econ', v: bw.economy.toFixed(2) },
          { k: 'Mdns', v: String(bw.maidens) },
        ],
      };
    }
    if (slot === 'name' && playerName) {
      // not batting or bowling right now: figures from the scorecard
      const f = playerFigures(this.store.scorecard(), '', playerName);
      if (f.batting) {
        const b = f.batting;
        return {
          name: b.name,
          kind: 'bat',
          onStrike: false,
          big: String(b.runs),
          small: `(${b.balls})`,
          stats: [
            { k: '4s', v: String(b.fours) },
            { k: '6s', v: String(b.sixes) },
            { k: 'SR', v: b.strikeRate.toFixed(1) },
          ],
        };
      }
      if (f.bowling) {
        const w = f.bowling;
        return {
          name: w.name,
          kind: 'bowl',
          onStrike: false,
          big: `${w.wickets}-${w.runs}`,
          small: `(${w.overs})`,
          stats: [{ k: 'Econ', v: w.economy.toFixed(2) }],
        };
      }
      return { name: playerName, kind: 'bat', onStrike: false, big: '–', small: '', stats: [] };
    }
    return null;
  });

  protected readonly color = computed(() => sideColor(this.match(), this.shown()?.kind === 'bowl' ? 'bowling' : 'batting'));

  private readonly source = computed(() => this.store.settings().playerImages ?? 'avatar');

  protected readonly imgUrl = computed(() => {
    const s = this.shown();
    if (!s) return '';
    return playerImageUrl(s.name, this.color(), playerRole(this.store.squads(), s.name, s.kind), this.source());
  });

  constructor() {
    super();
    effect(() => {
      this.imgUrl();
      untracked(() => {
        this.imgFailed.set(false);
        this.credit.set(null);
      });
    });
  }

  /** credit line for Wikimedia photos (required by their licenses), once the image has loaded */
  protected loadCredit(): void {
    const name = this.shown()?.name;
    if (!name || this.source() !== 'photo') return;
    void fetch(`/api/players/credit?name=${encodeURIComponent(name)}`)
      .then((r) => r.json() as Promise<{ credit?: string }>)
      .then((c) => this.credit.set(c.credit ?? null))
      .catch(() => undefined);
  }
}
