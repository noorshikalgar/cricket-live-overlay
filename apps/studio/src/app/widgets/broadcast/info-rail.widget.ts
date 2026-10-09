import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { currentInnings, type BallChip, type MatchEventType, type MatchState } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { gsap } from '../../motion/gsap';
import { MotionService } from '../../motion/motion.service';
import { OdometerDirective } from '../../motion/odometer.directive';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

export type RailSlide = 'thisOver' | 'rates' | 'batters' | 'bowler' | 'partnership' | 'chase' | 'recent' | 'info';

export const RAIL_SLIDES: { value: RailSlide; label: string }[] = [
  { value: 'thisOver', label: 'This over' },
  { value: 'rates', label: 'Run rates' },
  { value: 'batters', label: 'Batters' },
  { value: 'bowler', label: 'Bowler' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'chase', label: 'Chase / toss' },
  { value: 'recent', label: 'Last overs' },
  { value: 'info', label: 'Series & venue' },
];

export interface InfoRailProps {
  slides: Record<string, boolean>;
  /** seconds each slide stays up */
  seconds: number;
  /** jump to the slide that matters when something happens (FOUR → batters, WICKET → bowler…) */
  followEvents: boolean;
  showScore: boolean;
  showProgress: boolean;
}

/** which slide a moment brings to the front */
const EVENT_SLIDE: Partial<Record<MatchEventType, RailSlide>> = {
  FOUR: 'batters',
  SIX: 'batters',
  FIFTY: 'batters',
  HUNDRED: 'batters',
  WICKET: 'bowler',
  MAIDEN: 'bowler',
  OVER_END: 'rates',
};

function chipClass(c: BallChip): string {
  if (c.kind === 'four' || c.kind === 'six' || c.kind === 'wicket') return c.kind;
  if (c.kind === 'wide' || c.kind === 'noball' || c.kind === 'bye') return 'extra';
  return '';
}

/**
 * The strip along the bottom of a TV broadcast: the score stays on the left
 * while the right side flips through this over, run rates, batters, bowler,
 * partnership, the chase and more, a few seconds each.
 */
@Component({
  selector: 'cos-info-rail',
  imports: [OdometerDirective, MarqueeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rail" [style.--team]="teamColor()">
      @if (p().showScore && score(); as s) {
        <div class="score">
          <span class="code">{{ s.code }}</span>
          <span class="runs bc-num" [cosOdo]="s.runs"></span>
          <span class="ov">{{ s.overs }} <small>{{ t('ov') }}</small></span>
        </div>
      }
      <div class="stage">
        @if (current(); as k) {
          <div class="tag" #tag>{{ tagText(k) }}</div>
          <div class="slide" #slide>
            @switch (k) {
              @case ('thisOver') {
                <div class="chips">
                  @for (c of m()?.thisOver ?? []; track $index) {
                    <span [class]="'bc-chip ' + chipCls(c)">{{ c.label === '•' ? '0' : i18n.chip(c.label) }}</span>
                  }
                  @for (s of emptySlots(); track $index) {
                    <span class="bc-chip slot"></span>
                  }
                  <span class="eq">= <b class="hl">{{ overRuns() }}</b></span>
                </div>
              }
              @case ('rates') {
                @for (r of rates(); track r.k) {
                  <span class="pair"><span class="k">{{ r.k }}</span><b class="v">{{ r.v }}</b></span>
                }
              }
              @case ('batters') {
                @for (b of m()?.batters ?? []; track b.name) {
                  <span class="pair person">
                    @if (b.onStrike) {
                      <span class="dot" aria-label="on strike"></span>
                    }
                    <span class="name" cosMarquee>{{ b.name }}</span>
                    <b class="v">{{ b.runs }}</b><span class="sub">({{ b.balls }})</span>
                  </span>
                }
              }
              @case ('bowler') {
                @if (m()?.bowler; as w) {
                  <span class="pair person">
                    <span class="name" cosMarquee>{{ w.name }}</span>
                    <b class="v">{{ w.wickets }}-{{ w.runs }}</b><span class="sub">({{ w.overs }})</span>
                  </span>
                  <span class="pair"><span class="k">{{ t('Econ') }}</span><b class="v">{{ w.economy.toFixed(2) }}</b></span>
                  <span class="pair"><span class="k">{{ t('Mdns') }}</span><b class="v">{{ w.maidens }}</b></span>
                }
              }
              @case ('partnership') {
                <span class="pair"><b class="v">{{ m()?.partnership?.runs }}</b><span class="sub">({{ m()?.partnership?.balls }})</span></span>
                @for (b of m()?.batters ?? []; track b.name) {
                  <span class="pair person"><span class="name" cosMarquee>{{ b.name }}</span><b class="v small">{{ b.runs }}</b></span>
                }
              }
              @case ('chase') {
                <span class="sentence" cosMarquee>{{ chaseText() }}</span>
              }
              @case ('recent') {
                <div class="bars">
                  @for (r of recent(); track $index) {
                    <span class="bar"><i [style.height.%]="r.pct"></i><b>{{ r.runs }}</b></span>
                  }
                </div>
              }
              @case ('info') {
                <span class="sentence" cosMarquee>{{ infoText() }}</span>
              }
            }
          </div>
        }
        @if (p().showProgress && slides().length > 1) {
          <div class="progress" #progress></div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) / 100 * var(--fs));
      font-family: 'Barlow Condensed', var(--font);
    }
    .rail {
      height: 100%;
      display: flex;
      align-items: stretch;
      color: #fff;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 50%),
        linear-gradient(90deg, #0c111b, #151c2a 60%, #0c111b);
      border-top: calc(var(--u) * 4) solid var(--accent);
      box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      text-shadow: 0 2px 3px rgba(0, 0, 0, 0.4);
    }
    /* score block in the batting team's colour with an angled edge */
    .score {
      flex: none;
      display: flex;
      align-items: baseline;
      gap: 0.35em;
      padding: 0 1.4em 0 0.8em;
      font-size: calc(var(--u) * 52);
      font-weight: 800;
      font-style: italic;
      background:
        linear-gradient(118deg, rgba(255, 255, 255, 0.14), rgba(0, 0, 0, 0.35)),
        var(--team, var(--accent));
      clip-path: polygon(0 0, 100% 0, calc(100% - 0.7em) 100%, 0 100%);
      align-self: stretch;
      align-items: center;
    }
    .code {
      font-size: 0.7em;
      letter-spacing: 0.04em;
    }
    .runs {
      font-weight: 900;
    }
    .ov {
      font-size: 0.6em;
      opacity: 0.92;
    }
    .ov small {
      font-size: 0.75em;
    }
    .stage {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      perspective: 900px;
    }
    .tag {
      flex: none;
      margin: 0 0.9em 0 0.5em;
      padding: 0.15em 0.8em;
      font-size: calc(var(--u) * 30);
      font-weight: 800;
      font-style: italic;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #0b0f17;
      background: var(--accent);
      transform: skewX(-12deg);
      text-shadow: none;
      white-space: nowrap;
    }
    .slide {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 1.1em;
      font-size: calc(var(--u) * 46);
      font-weight: 700;
      transform-origin: 50% 50% calc(var(--wh) * -0.5);
      white-space: nowrap;
    }
    .pair {
      display: inline-flex;
      align-items: baseline;
      gap: 0.3em;
      min-width: 0;
    }
    .k {
      font-size: 0.7em;
      font-weight: 700;
      opacity: 0.75;
      text-transform: uppercase;
    }
    .v {
      font-weight: 900;
      font-style: italic;
      font-variant-numeric: tabular-nums;
      color: #facc15;
    }
    .v.small {
      font-size: 0.85em;
    }
    .sub {
      font-size: 0.7em;
      opacity: 0.8;
      font-variant-numeric: tabular-nums;
    }
    .person .name {
      max-width: 9em;
      text-transform: uppercase;
    }
    .dot {
      align-self: center;
      width: 0.35em;
      height: 0.35em;
      border-radius: 50%;
      background: #facc15;
      box-shadow: 0 0 0.4em #facc15;
    }
    .sentence {
      flex: 1;
      min-width: 0;
      font-size: 0.85em;
      text-transform: uppercase;
    }
    .chips {
      display: flex;
      align-items: center;
      gap: 0.25em;
    }
    .bc-chip {
      width: 1.25em;
      height: 1.25em;
      font-size: 0.82em;
    }
    .eq {
      margin-left: 0.4em;
    }
    .hl {
      color: #facc15;
    }
    .bars {
      display: flex;
      align-items: flex-end;
      gap: 0.4em;
      height: calc(var(--wh) * 0.62);
    }
    .bar {
      position: relative;
      width: 1.4em;
      height: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .bar i {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      min-height: 3px;
      border-radius: 3px 3px 0 0;
      background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 40%, transparent));
    }
    .bar b {
      position: relative;
      font-size: 0.6em;
      padding-bottom: 0.1em;
    }
    .progress {
      position: absolute;
      left: 0;
      bottom: 0;
      height: calc(var(--u) * 4);
      width: 100%;
      background: var(--accent);
      transform-origin: 0 50%;
      transform: scaleX(0);
      opacity: 0.85;
    }
  `,
})
export class InfoRailWidget extends WidgetBase<InfoRailProps> {
  protected readonly defaults: InfoRailProps = {
    slides: Object.fromEntries(RAIL_SLIDES.map((s) => [s.value, true])),
    seconds: 6,
    followEvents: true,
    showScore: true,
    showProgress: true,
  };
  private readonly store = inject(LiveStore);
  private readonly motion = inject(MotionService);
  private readonly slideEl = viewChild<ElementRef<HTMLElement>>('slide');
  private readonly tagEl = viewChild<ElementRef<HTMLElement>>('tag');
  private readonly progressEl = viewChild<ElementRef<HTMLElement>>('progress');

  protected readonly chipCls = chipClass;
  protected readonly m = computed<MatchState | null>(() => this.match());

  /** slides that are switched on and have something to show right now */
  protected readonly slides = computed<RailSlide[]>(() => {
    const m = this.match();
    const on = this.p().slides;
    return RAIL_SLIDES.map((s) => s.value).filter((k) => {
      if (on[k] === false) return false;
      if (!m) return k === 'info';
      if (k === 'thisOver') return m.thisOver.length > 0;
      if (k === 'bowler') return !!m.bowler;
      if (k === 'batters' || k === 'partnership') return m.batters.length > 0;
      if (k === 'recent') return m.recentOvers.length > 0;
      if (k === 'info') return !!(m.series || m.venue);
      return true;
    });
  });

  /** by key, not index: the list grows and shrinks (this over is empty between overs) */
  private readonly key = signal<RailSlide | null>(null);
  protected readonly current = computed<RailSlide | null>(() => {
    const list = this.slides();
    const k = this.key();
    return k && list.includes(k) ? k : (list[0] ?? null);
  });

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    // (re)start the cycle when the timing changes
    effect(() => {
      this.p().seconds;
      untracked(() => this.schedule());
    });
    this.store.events.pipe(takeUntilDestroyed()).subscribe((e) => {
      const want = EVENT_SLIDE[e.type];
      if (!this.p().followEvents || !want) return;
      if (this.slides().includes(want)) this.go(want);
    });
    inject(DestroyRef).onDestroy(() => this.timer && clearTimeout(this.timer));
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const ms = Math.max(2, Number(this.p().seconds) || 6) * 1000;
    this.runProgress(ms);
    this.timer = setTimeout(() => this.go(this.after(this.current())), ms);
  }

  private runProgress(ms: number): void {
    const bar = this.progressEl()?.nativeElement;
    if (!bar) return;
    gsap.killTweensOf(bar);
    if (this.motion.reduced()) return void gsap.set(bar, { scaleX: 0 });
    gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: ms / 1000, ease: 'none' });
  }

  /** the slide after `k` in the current list, wrapping round */
  private after(k: RailSlide | null): RailSlide | null {
    const list = this.slides();
    if (!list.length) return null;
    const i = k ? list.indexOf(k) : -1;
    return list[(i + 1) % list.length];
  }

  /** flip to slide `next`: the old one tips away, the new one swings in like a cube face */
  private go(next: RailSlide | null): void {
    const slide = this.slideEl()?.nativeElement;
    const tag = this.tagEl()?.nativeElement;
    if (!next || !slide || this.motion.reduced() || next === this.current()) {
      this.key.set(next);
      this.schedule();
      return;
    }
    const d = (s: number) => this.motion.d(s);
    let switched = false;
    const swap = () => {
      if (switched) return;
      switched = true;
      this.key.set(next);
      // the new slide renders on the next tick; bring it in from below
      queueMicrotask(() => {
        const el = this.slideEl()?.nativeElement;
        const tg = this.tagEl()?.nativeElement;
        if (el) gsap.fromTo(el, { rotateX: 80, opacity: 0 }, { rotateX: 0, opacity: 1, duration: d(0.4), ease: 'back.out(1.4)' });
        if (tg) gsap.fromTo(tg, { xPercent: -30, opacity: 0 }, { xPercent: 0, opacity: 1, duration: d(0.3), ease: 'power3.out' });
      });
      this.schedule();
    };
    gsap.to(slide, { rotateX: -80, opacity: 0, duration: d(0.28), ease: 'power2.in', onComplete: swap });
    if (tag) gsap.to(tag, { opacity: 0, duration: d(0.2) });
    // animation frames can be paused (hidden OBS source): never get stuck on a slide
    setTimeout(swap, d(0.28) * 1000 + 150);
  }

  protected tagText(k: RailSlide): string {
    const m = this.match();
    if (k === 'chase') return this.t(m?.target !== null && m?.target !== undefined ? 'Chase' : 'Toss');
    if (k === 'recent') return this.i18n.tf('Last {n} overs', { n: m?.recentOvers.length || 6 });
    if (k === 'info') return this.t('Match info');
    if (k === 'rates') return this.t('Run rate');
    return this.t(RAIL_SLIDES.find((s) => s.value === k)?.label ?? k);
  }

  protected readonly score = computed(() => {
    const m = this.match();
    const inn = m ? currentInnings(m) : null;
    if (!m || !inn) return null;
    const team = m.teams.find((t) => t.shortCode === inn.battingTeam);
    return { code: team?.shortCode ?? inn.battingTeam, runs: `${inn.runs}/${inn.wickets}`, overs: inn.overs };
  });

  protected readonly teamColor = computed(() => {
    const m = this.match();
    const inn = m ? currentInnings(m) : null;
    return m?.teams.find((t) => t.shortCode === inn?.battingTeam)?.primaryColor ?? null;
  });

  protected readonly emptySlots = computed(() => {
    const balls = this.match()?.thisOver ?? [];
    const legal = balls.filter((c) => c.kind !== 'wide' && c.kind !== 'noball').length;
    return Array.from({ length: Math.max(0, 6 - legal) });
  });

  protected readonly overRuns = computed(() => (this.match()?.thisOver ?? []).reduce((a, c) => a + c.runs, 0));

  protected readonly rates = computed(() => {
    const m = this.match();
    const inn = m ? currentInnings(m) : null;
    if (!m || !inn) return [];
    const out = [{ k: this.t('CRR'), v: inn.runRate.toFixed(2) }];
    if (m.requiredRunRate !== null) out.push({ k: this.t('RRR'), v: m.requiredRunRate.toFixed(2) });
    const max = m.format === 'ODI' ? 50 : m.format === 'T20' ? 20 : null;
    if (max && m.target === null) out.push({ k: this.t('Projected'), v: String(Math.round(inn.runRate * max)) });
    if (m.target !== null) out.push({ k: this.t('Target'), v: String(m.target) });
    return out;
  });

  protected readonly chaseText = computed(() => {
    const m = this.match();
    if (!m) return '';
    return m.target !== null ? this.i18n.status(m) : this.i18n.apiText(m.toss || m.statusText);
  });

  protected readonly infoText = computed(() => {
    const m = this.match();
    return m ? [m.series, m.venue].filter(Boolean).join('  ·  ') : '';
  });

  protected readonly recent = computed(() => {
    const runs = this.match()?.recentOvers ?? [];
    const max = Math.max(6, ...runs);
    return runs.map((r) => ({ runs: r, pct: Math.max(4, (r / max) * 78) }));
  });
}
