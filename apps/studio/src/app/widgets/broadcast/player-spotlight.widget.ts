import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import type { BallChip } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { playerImageUrl, playerRole, sideColor } from '../../core/player-image';
import { gsap } from '../../motion/gsap';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { MotionService } from '../../motion/motion.service';
import { OdometerDirective } from '../../motion/odometer.directive';
import { WidgetBase } from '../widget-base';

export interface PlayerSpotlightProps {
  /** batter 1 / 2 = the two at the crease, in the order they came in */
  slot: 'batter1' | 'batter2' | 'bowler';
  /** bowler card: the balls of this over along the bottom */
  showThisOver: boolean;
  showImage: boolean;
}

interface Card {
  name: string;
  tag: string;
  kind: 'bat' | 'bowl';
  onStrike: boolean;
  big: string;
  small: string;
  stats: { k: string; v: string }[];
}

function chipClass(c: BallChip): string {
  if (c.kind === 'four' || c.kind === 'six' || c.kind === 'wicket') return c.kind;
  if (c.kind === 'wide' || c.kind === 'noball' || c.kind === 'bye') return 'extra';
  return '';
}

/**
 * Big player card: the player's picture on the left over the team colour,
 * name, headline figures and a row of stat tiles on the right. Batter 1,
 * Batter 2 or the current bowler (with this over's balls).
 */
@Component({
  selector: 'cos-player-spotlight',
  imports: [OdometerDirective, MarqueeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (card(); as c) {
      <div class="spot" #card [style.--team]="color()" [class.tight]="c.kind === 'bowl' && p().showThisOver && overBalls().length">
        @if (p().showImage) {
          <div class="pic">
            <span class="watermark">{{ teamCode() }}</span>
            <img [src]="img()" alt="" [class.photo]="isPhoto()" />
          </div>
        }
        <div class="info">
          <div class="top">
            <span class="tag">{{ c.tag }}</span>
            @if (c.onStrike) {
              <span class="strike"><i></i>{{ t('On strike') }}</span>
            }
          </div>
          <div class="name" cosMarquee>{{ c.name }}</div>
          <div class="figs">
            <span class="big" [cosOdo]="c.big"></span>
            <span class="small">{{ c.small }}</span>
          </div>
          <div class="tiles">
            @for (s of c.stats; track s.k) {
              <div class="tile">
                <span class="v">{{ s.v }}</span>
                <span class="k">{{ s.k }}</span>
              </div>
            }
          </div>
          @if (c.kind === 'bowl' && p().showThisOver && overBalls().length) {
            <div class="over">
              <span class="ok">{{ t('This over') }}</span>
              @for (b of overBalls(); track $index) {
                <span [class]="'bc-chip ' + chipCls(b)">{{ b.label === '•' ? '0' : i18n.chip(b.label) }}</span>
              }
              @for (s of emptySlots(); track $index) {
                <span class="bc-chip slot"></span>
              }
            </div>
          }
        </div>
      </div>
    } @else if (editing()) {
      <div class="empty">{{ t('Batter') }} 1 / 2 · {{ t('Bowler') }}</div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) / 100 * var(--fs));
    }
    .spot {
      position: relative;
      height: 100%;
      display: flex;
      overflow: hidden;
      border-radius: calc(var(--u) * 3);
      color: #fff;
      background: linear-gradient(100deg, #0d121c 0%, #121a28 55%, #0d121c 100%);
      box-shadow:
        0 14px 40px rgba(0, 0, 0, 0.45),
        inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      text-shadow: 0 2px 3px rgba(0, 0, 0, 0.35);
    }
    /* team-colour edge along the top */
    .spot::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: calc(var(--u) * 2.2);
      background: linear-gradient(90deg, var(--team), color-mix(in srgb, var(--team) 20%, transparent));
      z-index: 2;
    }
    .pic {
      position: relative;
      flex: none;
      width: 38%;
      overflow: hidden;
      background:
        radial-gradient(120% 90% at 50% 100%, color-mix(in srgb, var(--team) 95%, #fff) 0%, var(--team) 45%, color-mix(in srgb, var(--team) 45%, #000) 100%);
      clip-path: polygon(0 0, 100% 0, 86% 100%, 0 100%);
    }
    .watermark {
      position: absolute;
      left: -0.05em;
      top: -0.12em;
      font: italic 900 calc(var(--u) * 62) / 1 'Barlow Condensed', var(--font);
      color: rgba(255, 255, 255, 0.12);
      letter-spacing: -0.02em;
    }
    .pic img {
      position: absolute;
      left: 50%;
      bottom: 0;
      height: 96%;
      transform: translateX(-54%);
      filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.45));
    }
    .pic img.photo {
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      transform: none;
    }
    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: calc(var(--u) * 2.6);
      padding: calc(var(--u) * 5) calc(var(--u) * 5) calc(var(--u) * 4) calc(var(--u) * 3);
      font-family: 'Barlow Condensed', var(--font);
    }
    .top {
      display: flex;
      align-items: center;
      gap: 0.6em;
      font-size: calc(var(--u) * 9);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .tag {
      padding: 0.1em 0.6em;
      background: var(--team);
      transform: skewX(-12deg);
      text-shadow: none;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
    }
    .strike {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      color: #facc15;
    }
    .strike i {
      width: 0.55em;
      height: 0.55em;
      border-radius: 50%;
      background: #facc15;
      box-shadow: 0 0 0.6em #facc15;
    }
    .name {
      font-size: calc(var(--u) * 15);
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      line-height: 1.1;
      flex: none;
      letter-spacing: 0.01em;
    }
    .figs {
      display: flex;
      align-items: baseline;
      gap: 0.25em;
    }
    .big {
      font-size: calc(var(--u) * 30);
      font-weight: 900;
      font-style: italic;
      line-height: 0.95;
      color: #fff;
    }
    .small {
      font-size: calc(var(--u) * 16);
      font-weight: 800;
      font-style: italic;
      color: #facc15;
      font-variant-numeric: tabular-nums;
    }
    .tiles {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      gap: calc(var(--u) * 2);
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: calc(var(--u) * 1.6) 0;
      border-radius: calc(var(--u) * 2);
      background: rgba(255, 255, 255, 0.06);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .tile .v {
      font-size: calc(var(--u) * 11.5);
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      line-height: 1.05;
    }
    .tile .k {
      font-size: calc(var(--u) * 6.5);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      opacity: 0.7;
    }
    .over {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 1.4);
      font-size: calc(var(--u) * 10);
    }
    .ok {
      font-size: 0.7em;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      opacity: 0.75;
      margin-right: 0.3em;
    }
    .over .bc-chip {
      width: 1.5em;
      height: 1.5em;
      font-size: 0.85em;
    }
    /* bowler with this over: everything a notch smaller so the balls fit */
    .tight .info {
      gap: calc(var(--u) * 2);
    }
    .tight .name {
      font-size: calc(var(--u) * 13);
    }
    .tight .big {
      font-size: calc(var(--u) * 24);
    }
    .tight .small {
      font-size: calc(var(--u) * 13);
    }
    .tight .tile .v {
      font-size: calc(var(--u) * 10);
    }
    .tight .over {
      font-size: calc(var(--u) * 9);
    }
    .empty {
      height: 100%;
      display: grid;
      place-items: center;
      font: 600 20px/1.3 Inter, Mukta, sans-serif;
      opacity: 0.7;
    }
  `,
})
export class PlayerSpotlightWidget extends WidgetBase<PlayerSpotlightProps> {
  protected readonly defaults: PlayerSpotlightProps = { slot: 'batter1', showThisOver: true, showImage: true };
  private readonly store = inject(LiveStore);
  private readonly motion = inject(MotionService);
  private readonly cardEl = viewChild<ElementRef<HTMLElement>>('card');
  protected readonly chipCls = chipClass;

  protected readonly card = computed<Card | null>(() => {
    const m = this.match();
    if (!m) return null;
    const slot = this.p().slot;
    if (slot === 'bowler') {
      const w = m.bowler;
      if (!w) return null;
      return {
        name: w.name,
        tag: this.t('Bowler'),
        kind: 'bowl',
        onStrike: false,
        big: `${w.wickets}-${w.runs}`,
        small: `(${w.overs})`,
        stats: [
          { k: this.t('Overs'), v: w.overs },
          { k: this.t('Mdns'), v: String(w.maidens) },
          { k: this.t('Econ'), v: w.economy.toFixed(2) },
          { k: this.t('W'), v: String(w.wickets) },
        ],
      };
    }
    const b = m.batters[slot === 'batter2' ? 1 : 0];
    if (!b) return null;
    return {
      name: b.name,
      tag: this.i18n.tf('Batter {n}', { n: slot === 'batter2' ? 2 : 1 }),
      kind: 'bat',
      onStrike: b.onStrike,
      big: String(b.runs),
      small: `(${b.balls})`,
      stats: [
        { k: this.t('4s'), v: String(b.fours) },
        { k: this.t('6s'), v: String(b.sixes) },
        { k: this.t('SR'), v: b.strikeRate.toFixed(1) },
        { k: this.t('Balls'), v: String(b.balls) },
      ],
    };
  });

  protected readonly color = computed(() => sideColor(this.match(), this.p().slot === 'bowler' ? 'bowling' : 'batting') ?? 'var(--accent)');

  protected readonly teamCode = computed(() => {
    const m = this.match();
    const inn = m?.innings.at(-1);
    const bat = m?.teams.find((t) => t.shortCode === inn?.battingTeam);
    const bowl = m?.teams.find((t) => t !== bat);
    return (this.p().slot === 'bowler' ? bowl : bat)?.shortCode ?? '';
  });

  protected readonly isPhoto = computed(() => this.store.settings().playerImages === 'photo');

  protected readonly img = computed(() => {
    const c = this.card();
    if (!c) return '';
    const role = playerRole(this.store.squads(), c.name, c.kind);
    return playerImageUrl(c.name, this.color().startsWith('#') ? this.color() : null, role, this.store.settings().playerImages ?? 'avatar', 'cutout');
  });

  protected readonly overBalls = computed(() => this.match()?.thisOver ?? []);
  protected readonly emptySlots = computed(() => {
    const legal = this.overBalls().filter((c) => c.kind !== 'wide' && c.kind !== 'noball').length;
    return Array.from({ length: Math.max(0, 6 - legal) });
  });

  /** a new player in this slot: the card swings in fresh */
  private readonly shownName = signal<string | null>(null);

  constructor() {
    super();
    effect(() => {
      const name = this.card()?.name ?? null;
      untracked(() => {
        const prev = this.shownName();
        this.shownName.set(name);
        if (!prev || !name || prev === name || this.motion.reduced()) return;
        queueMicrotask(() => {
          const el = this.cardEl()?.nativeElement;
          if (!el) return;
          gsap.fromTo(el, { rotateY: -70, opacity: 0, transformPerspective: 1200 }, { rotateY: 0, opacity: 1, duration: this.motion.d(0.6), ease: 'back.out(1.4)' });
        });
      });
    });
  }
}
