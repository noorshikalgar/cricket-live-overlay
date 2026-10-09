import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { MatchEvent, MatchEventType } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { MotionService } from '../../motion/motion.service';
import { SplitText, gsap } from '../../motion/gsap';
import { WidgetBase } from '../widget-base';
import { BannerPopComponent } from './banner-pop.component';

export interface BannerProps {
  autoFire: Record<string, boolean>;
  /** hold time in seconds */
  duration: number;
  direction: 'left' | 'right';
  showSubtitle: boolean;
  /** pop = centred comic word; blast = giant numeral, light burst, particles; classic = a clean colour wipe */
  look: 'pop' | 'blast' | 'classic';
}

/** the giant glyph a blast shows for each moment */
const GLYPH: Partial<Record<MatchEventType, string>> = {
  FOUR: '4',
  SIX: '6',
  WICKET: 'W',
  FIFTY: '50',
  HUNDRED: '100',
  MAIDEN: 'M',
};

const GOLD = '#f59e0b';

const EVENT_COLOR: Partial<Record<MatchEventType, string>> = {
  FOUR: 'var(--c-four)',
  SIX: 'var(--c-six)',
  WICKET: 'var(--c-wicket)',
  FIFTY: GOLD,
  HUNDRED: GOLD,
};

const MAX_QUEUE = 3;

@Component({
  selector: 'cos-banner',
  imports: [BannerPopComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editing() && !playing()) {
      <div class="placeholder">
        <span>★ Event banner</span>
        <small>Plays on FOUR · SIX · WICKET · milestones · event pad</small>
      </div>
    }
    <cos-banner-pop />
    <div class="blast" #blast>
      <div class="rays" #rays></div>
      <div class="flash" #flash></div>
      <div class="streaks" #streaks>
        @for (i of streakList; track i) {
          <span [style.top.%]="8 + i * 12"></span>
        }
      </div>
      <div class="bpanel" #bpanel>
        <div class="glint" #glint></div>
        <div class="btext">
          <div class="btitle" #btitle></div>
          <div class="bsub" #bsub></div>
        </div>
      </div>
      <div class="glyph" #glyph></div>
      <div class="bails" #bails><span></span><span></span></div>
      <div class="particles" #particles></div>
    </div>
    <div class="banner" #banner>
      <div class="fill" #fill></div>
      <div class="content">
        <div class="title" #title></div>
        <div class="sub" #sub></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }
    .placeholder {
      position: absolute;
      inset: 0;
      border: 2px dashed rgba(255, 255, 255, 0.35);
      border-radius: var(--radius);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: rgba(255, 255, 255, 0.75);
      font: 600 28px/1.2 var(--font);
      background: rgba(0, 0, 0, 0.2);
    }
    .placeholder small {
      font-size: 18px;
      font-weight: 500;
      opacity: 0.8;
    }
    .banner {
      position: absolute;
      inset: 0;
      visibility: hidden;
    }
    .fill {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(0, 0, 0, 0.16)),
        var(--ev, var(--accent));
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    /* darker edge bar on the side the wipe comes from */
    .fill::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: calc(var(--wh) * 0.06);
      background: rgba(0, 0, 0, 0.28);
    }
    .banner.from-right .fill::before {
      left: auto;
      right: 0;
    }
    .content {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 calc(var(--wh) * 0.22);
      color: #fff;
      overflow: hidden;
    }
    .title {
      font-family: var(--font);
      font-weight: 700;
      font-size: calc(var(--wh) * 0.52 * var(--fs));
      line-height: 0.95;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .sub {
      font-family: Inter, Mukta, sans-serif;
      font-weight: 600;
      font-size: max(22px, calc(var(--wh) * 0.15 * var(--fs)));
      margin-top: 0.3em;
      opacity: 0.92;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .sub:empty {
      display: none;
    }

    /* ---------- blast ---------- */
    .blast {
      position: absolute;
      inset: 0;
      visibility: hidden;
      --ev: var(--accent);
    }
    .rays {
      position: absolute;
      left: calc(var(--wh) * -0.9);
      top: 50%;
      width: calc(var(--wh) * 3.6);
      height: calc(var(--wh) * 3.6);
      margin-top: calc(var(--wh) * -1.8);
      background: repeating-conic-gradient(from 0deg, var(--ev) 0deg 7deg, transparent 7deg 20deg);
      -webkit-mask-image: radial-gradient(circle, #000 18%, transparent 62%);
      mask-image: radial-gradient(circle, #000 18%, transparent 62%);
      opacity: 0;
    }
    .flash {
      position: absolute;
      left: calc(var(--wh) * -0.4);
      top: 50%;
      width: calc(var(--wh) * 2.4);
      height: calc(var(--wh) * 2.4);
      margin-top: calc(var(--wh) * -1.2);
      border-radius: 50%;
      background: radial-gradient(circle, #fff 0%, var(--ev) 35%, transparent 70%);
      opacity: 0;
    }
    .streaks {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    .streaks span {
      position: absolute;
      left: 0;
      height: calc(var(--wh) * 0.035);
      width: 40%;
      border-radius: 99px;
      background: linear-gradient(90deg, transparent, #fff, transparent);
      opacity: 0;
    }
    .bpanel {
      position: absolute;
      top: 12%;
      bottom: 12%;
      left: calc(var(--wh) * 0.75);
      right: 0;
      overflow: hidden;
      border-radius: calc(var(--radius) * 0.8);
      background:
        linear-gradient(118deg, rgba(255, 255, 255, 0.16), rgba(0, 0, 0, 0.35)),
        var(--ev);
      box-shadow:
        0 14px 40px rgba(0, 0, 0, 0.45),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
      clip-path: polygon(0 0, 100% 0, calc(100% - 0.6em) 100%, 0 100%);
    }
    .glint {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 30%;
      background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.55), transparent);
      transform: translateX(-150%) skewX(-18deg);
    }
    .btext {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-left: calc(var(--wh) * 0.42);
      padding-right: calc(var(--wh) * 0.2);
      color: #fff;
    }
    .btitle {
      font-family: 'Barlow Condensed', var(--font);
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      font-size: calc(var(--wh) * 0.46 * var(--fs));
      line-height: 0.9;
      letter-spacing: 0.02em;
      white-space: nowrap;
      text-shadow: 0 0.05em 0 rgba(0, 0, 0, 0.35);
    }
    .bsub {
      font: 700 max(22px, calc(var(--wh) * 0.13 * var(--fs))) / 1.2 Inter, Mukta, sans-serif;
      margin-top: 0.25em;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      opacity: 0.95;
    }
    .bsub:empty {
      display: none;
    }
    .glyph {
      position: absolute;
      left: 0;
      top: 50%;
      width: calc(var(--wh) * 1.25);
      transform: translateY(-50%);
      text-align: center;
      font-family: 'Barlow Condensed', var(--font);
      font-weight: 900;
      font-style: italic;
      font-size: calc(var(--wh) * 1.2 * var(--fs));
      line-height: 0.8;
      color: var(--ev);
      -webkit-text-stroke: calc(var(--wh) * 0.035) #fff;
      paint-order: stroke fill;
      text-shadow:
        0 0.04em 0 rgba(0, 0, 0, 0.4),
        0 0 0.25em var(--ev);
      opacity: 0;
    }
    .glyph.long {
      font-size: calc(var(--wh) * 0.8 * var(--fs));
    }
    .bails {
      position: absolute;
      left: calc(var(--wh) * 0.45);
      top: 18%;
      width: calc(var(--wh) * 0.4);
      height: 1px;
    }
    .bails span {
      position: absolute;
      width: calc(var(--wh) * 0.18);
      height: calc(var(--wh) * 0.05);
      border-radius: 99px;
      background: #f5d58a;
      box-shadow: 0 0 6px rgba(0, 0, 0, 0.4);
      opacity: 0;
    }
    .particles {
      position: absolute;
      left: calc(var(--wh) * 0.62);
      top: 50%;
      width: 0;
      height: 0;
    }
    .particles i {
      position: absolute;
      left: 0;
      top: 0;
      border-radius: 2px;
    }
  `,
})
export class BannerWidget extends WidgetBase<BannerProps> {
  protected readonly defaults: BannerProps = {
    autoFire: { FOUR: true, SIX: true, WICKET: true, FIFTY: true, HUNDRED: true },
    duration: 2.5,
    direction: 'left',
    showSubtitle: true,
    look: 'blast',
  };
  private readonly pop = viewChild.required(BannerPopComponent);
  protected readonly streakList = [0, 1, 2, 3, 4, 5, 6];
  private readonly blastEl = viewChild.required<ElementRef<HTMLElement>>('blast');
  private readonly raysEl = viewChild.required<ElementRef<HTMLElement>>('rays');
  private readonly flashEl = viewChild.required<ElementRef<HTMLElement>>('flash');
  private readonly streaksEl = viewChild.required<ElementRef<HTMLElement>>('streaks');
  private readonly bpanelEl = viewChild.required<ElementRef<HTMLElement>>('bpanel');
  private readonly glintEl = viewChild.required<ElementRef<HTMLElement>>('glint');
  private readonly btitleEl = viewChild.required<ElementRef<HTMLElement>>('btitle');
  private readonly bsubEl = viewChild.required<ElementRef<HTMLElement>>('bsub');
  private readonly glyphEl = viewChild.required<ElementRef<HTMLElement>>('glyph');
  private readonly bailsEl = viewChild.required<ElementRef<HTMLElement>>('bails');
  private readonly particlesEl = viewChild.required<ElementRef<HTMLElement>>('particles');

  protected readonly playing = signal(false);
  private readonly bannerEl = viewChild.required<ElementRef<HTMLElement>>('banner');
  private readonly fillEl = viewChild.required<ElementRef<HTMLElement>>('fill');
  private readonly titleEl = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly subEl = viewChild.required<ElementRef<HTMLElement>>('sub');
  private readonly motion = inject(MotionService);
  private queue: MatchEvent[] = [];
  private tl: gsap.core.Timeline | null = null;
  private split: SplitText | null = null;

  constructor() {
    super();
    inject(LiveStore)
      .events.pipe(takeUntilDestroyed())
      .subscribe((e) => this.onEvent(e));
    inject(DestroyRef).onDestroy(() => {
      this.tl?.kill();
      gsap.killTweensOf(this.particlesEl().nativeElement.children);
      this.split?.revert();
    });
  }

  private onEvent(e: MatchEvent): void {
    if (!e.manual && this.p().autoFire[e.type] !== true) return;
    this.queue.push(e);
    if (this.queue.length > MAX_QUEUE) this.queue = this.queue.slice(-MAX_QUEUE);
    if (!this.playing()) this.next();
  }

  private next(): void {
    const e = this.queue.shift();
    if (!e) {
      this.playing.set(false);
      return;
    }
    this.playing.set(true);
    this.play(e);
  }

  private play(e: MatchEvent): void {
    if (this.p().look === 'pop' && !this.motion.reduced()) {
      void this.pop()
        .play({
          type: e.type,
          title: this.i18n.eventTitle(e.title),
          subtitle: this.p().showSubtitle ? this.i18n.apiText(this.t(e.subtitle)) : '',
          color: EVENT_COLOR[e.type] ?? 'var(--accent)',
          hold: this.motion.d(Math.max(0.8, Number(this.p().duration) || 2.5)),
        })
        .then(() => this.next());
      return;
    }
    if (this.p().look === 'blast' && !this.motion.reduced()) {
      this.playBlast(e);
      return;
    }
    this.playClassic(e);
  }

  /**
   * Blast: the giant numeral slams in over a light flash and rotating rays,
   * particles burst out, the panel wipes in with a glint; FOUR adds speed
   * streaks, WICKET sends the bails flying.
   */
  private playBlast(e: MatchEvent): void {
    const root = this.blastEl().nativeElement;
    const rays = this.raysEl().nativeElement;
    const flash = this.flashEl().nativeElement;
    const panel = this.bpanelEl().nativeElement;
    const glint = this.glintEl().nativeElement;
    const title = this.btitleEl().nativeElement;
    const sub = this.bsubEl().nativeElement;
    const glyph = this.glyphEl().nativeElement;
    const parts = this.particlesEl().nativeElement;
    const streaks = Array.from(this.streaksEl().nativeElement.querySelectorAll<HTMLElement>('span'));
    const bails = Array.from(this.bailsEl().nativeElement.querySelectorAll<HTMLElement>('span'));
    this.split?.revert();
    this.split = null;
    this.tl?.kill();
    parts.replaceChildren();

    const color = EVENT_COLOR[e.type] ?? 'var(--accent)';
    root.style.setProperty('--ev', color);
    const g = GLYPH[e.type] ?? '';
    glyph.textContent = g;
    glyph.classList.toggle('long', g.length > 1);
    title.textContent = this.i18n.eventTitle(e.title);
    sub.textContent = this.p().showSubtitle ? this.i18n.apiText(this.t(e.subtitle)) : '';

    const d = (s: number) => this.motion.d(s);
    const hold = d(Math.max(0.8, Number(this.p().duration) || 2.5));
    const big = e.type === 'SIX' || e.type === 'HUNDRED' || e.type === 'WICKET';

    // particles: small chips of the event colour and white, flung out from the glyph
    const n = big ? 34 : 22;
    const dots: HTMLElement[] = [];
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('i');
      const s = 6 + Math.random() * (big ? 14 : 10);
      // runtime elements don't get the scoped CSS: position them inline
      Object.assign(dot.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        borderRadius: '2px',
        width: `${s}px`,
        height: `${s * (Math.random() < 0.5 ? 1 : 0.4)}px`,
        background: i % 3 === 0 ? '#ffffff' : color,
        opacity: '0',
      });
      parts.append(dot);
      dots.push(dot);
    }

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(root, { visibility: 'hidden' });
        this.split?.revert();
        this.split = null;
        parts.replaceChildren();
        this.next();
      },
    });
    this.tl = tl;

    tl.set(root, { visibility: 'visible', opacity: 1 })
      .set(panel, { clipPath: 'inset(0% 100% 0% 0%)', x: 0, opacity: 1 })
      .set([title, sub], { opacity: 1 })
      .set(glint, { xPercent: -150 })
      // flash + rays
      .fromTo(flash, { scale: 0.2, opacity: 0 }, { scale: 1.1, opacity: 0.9, duration: d(0.18), ease: 'power2.out' }, 0)
      .to(flash, { opacity: 0, scale: 1.4, duration: d(0.5), ease: 'power2.in' }, d(0.18))
      .fromTo(rays, { scale: 0.3, opacity: 0, rotate: 0 }, { scale: 1, opacity: big ? 0.85 : 0.6, duration: d(0.45), ease: 'power3.out' }, 0)
      .to(rays, { rotate: big ? 70 : 45, duration: hold + d(0.8), ease: 'none' }, 0)
      // the glyph slams in, then a short impact shake
      .fromTo(
        glyph,
        { scale: 3.2, opacity: 0, rotate: -18 },
        { scale: 1, opacity: 1, rotate: -6, duration: d(0.42), ease: 'back.out(1.7)' },
        d(0.05),
      )
      .to(glyph, { x: '+=8', duration: d(0.05), repeat: 5, yoyo: true, ease: 'none' }, d(0.47))
      // particles burst
      .add(() => {
        for (const dot of dots) {
          const a = Math.random() * Math.PI * 2;
          const r = (big ? 260 : 180) + Math.random() * (big ? 260 : 160);
          gsap.fromTo(
            dot,
            { x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 },
            {
              x: Math.cos(a) * r,
              y: Math.sin(a) * r * 0.7,
              rotate: Math.random() * 540,
              scale: 0.4,
              opacity: 0,
              duration: d(0.8 + Math.random() * 0.6),
              ease: 'power3.out',
            },
          );
        }
      }, d(0.38))
      // panel wipes in, title letters rise, glint sweeps
      .to(panel, { clipPath: 'inset(0% 0% 0% 0%)', duration: d(0.4), ease: 'power3.out' }, d(0.2))
      .add(() => {
        this.split = new SplitText(title, { type: this.i18n.lang() === 'en' ? 'chars' : 'words' });
        gsap.fromTo(this.splitParts(), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: d(0.35), ease: 'power3.out', stagger: d(0.03) });
      }, d(0.28))
      .fromTo(sub, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: d(0.35), ease: 'power3.out' }, d(0.5))
      .to(glint, { xPercent: 450, duration: d(0.7), ease: 'power2.inOut' }, d(0.55));

    if (e.type === 'FOUR') {
      // speed streaks race across the panel
      streaks.forEach((s, i) => {
        tl.fromTo(
          s,
          { xPercent: -120, opacity: 0.9 },
          { xPercent: 320, opacity: 0, duration: d(0.45), ease: 'power2.in' },
          d(0.1 + i * 0.04),
        );
      });
    }
    if (e.type === 'WICKET') {
      // the bails fly off
      bails.forEach((b, i) => {
        tl.fromTo(
          b,
          { x: 0, y: 0, rotate: 0, opacity: 1 },
          { x: (i ? 1 : -1) * (90 + Math.random() * 60), y: -140 - Math.random() * 60, rotate: (i ? 1 : -1) * 540, opacity: 0, duration: d(0.9), ease: 'power2.out' },
          d(0.4),
        );
      });
    }

    // out: everything leaves quickly
    tl.to(glyph, { scale: 0.7, opacity: 0, duration: d(0.25), ease: 'power2.in' }, `+=${hold}`)
      .to(panel, { clipPath: 'inset(0% 0% 0% 100%)', duration: d(0.3), ease: 'power2.in' }, '<')
      .to(rays, { opacity: 0, scale: 0.6, duration: d(0.3), ease: 'power2.in' }, '<');
  }

  /** letters in English; whole words in Marathi, where splitting letters breaks the joined Devanagari shapes */
  private splitParts(): Element[] {
    if (!this.split) return [];
    return this.split.chars.length ? this.split.chars : this.split.words;
  }

  private playClassic(e: MatchEvent): void {
    const banner = this.bannerEl().nativeElement;
    const fill = this.fillEl().nativeElement;
    const title = this.titleEl().nativeElement;
    const sub = this.subEl().nativeElement;
    this.split?.revert();
    this.split = null;
    this.tl?.kill();

    banner.style.setProperty('--ev', EVENT_COLOR[e.type] ?? 'var(--accent)');
    banner.classList.toggle('from-right', this.p().direction === 'right');
    title.textContent = this.i18n.eventTitle(e.title);
    sub.textContent = this.p().showSubtitle ? this.i18n.apiText(this.t(e.subtitle)) : '';

    const d = (s: number) => this.motion.d(s);
    const hold = d(Math.max(0.5, Number(this.p().duration) || 2.5));
    const fromLeft = this.p().direction !== 'right';
    const hiddenIn = fromLeft ? 'inset(0% 100% 0% 0%)' : 'inset(0% 0% 0% 100%)';
    const hiddenOut = fromLeft ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
    const shown = 'inset(0% 0% 0% 0%)';
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(banner, { visibility: 'hidden' });
        this.split?.revert();
        this.split = null;
        this.next();
      },
    });
    this.tl = tl;

    if (this.motion.reduced()) {
      tl.set(banner, { visibility: 'visible', opacity: 0 })
        .set(fill, { clipPath: shown })
        .to(banner, { opacity: 1, duration: d(0.2) })
        .to(banner, { opacity: 0, duration: d(0.2) }, `+=${hold}`)
        .set(banner, { opacity: 1 });
      return;
    }

    this.split = new SplitText(title, { type: this.i18n.lang() === 'en' ? 'chars' : 'words' });
    tl.set(banner, { visibility: 'visible', opacity: 1 })
      .set([title, sub], { opacity: 1 })
      .fromTo(fill, { clipPath: hiddenIn }, { clipPath: shown, duration: d(0.45), ease: 'power3.out' })
      .fromTo(
        this.splitParts(),
        { yPercent: 110, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: d(0.4), ease: 'power3.out', stagger: d(0.025) },
        d(0.12),
      )
      // fromTo, not from: a from() would take the end value from the previous banner's fade-out (0)
      .fromTo(sub, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: d(0.35), ease: 'power3.out' }, d(0.3))
      .to([title, sub], { opacity: 0, duration: d(0.2), ease: 'power2.in' }, `+=${hold}`)
      .to(fill, { clipPath: hiddenOut, duration: d(0.3), ease: 'power2.in' }, '<0.05');
  }
}
