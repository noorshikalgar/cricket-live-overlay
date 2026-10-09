import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, viewChild } from '@angular/core';
import type { MatchEventType } from '@cos/shared';
import { I18n } from '../../core/i18n';
import { gsap } from '../../motion/gsap';
import { MotionService } from '../../motion/motion.service';

export interface PopShot {
  type: MatchEventType;
  title: string;
  subtitle: string;
  color: string;
  /** seconds the word stays up after landing */
  hold: number;
}

/** points of a comic starburst in a -1…1 box */
function burstPoints(spikes: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return pts.join(' ');
}

const CONFETTI_COLORS = ['#facc15', '#22d3ee', '#f472b6', '#a3e635', '#ffffff', '#fb923c'];

/**
 * Pop-art event banner, centred: a comic starburst with halftone dots, the
 * word bouncing in letter by letter with a thick outline and an extruded
 * shadow, a ribbon underneath for the player line. SIX rains confetti, FOUR
 * fires speed lines, WICKET drops in with a shock ring and a shake, FIFTY and
 * HUNDRED sparkle gold.
 */
@Component({
  selector: 'cos-banner-pop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pop" #root>
      <div class="ring" #ring></div>
      <svg class="burst back" #burstBack viewBox="-1 -1 2 2" aria-hidden="true">
        <polygon [attr.points]="backPts" />
      </svg>
      <svg class="burst front" #burstFront viewBox="-1 -1 2 2" aria-hidden="true">
        <polygon [attr.points]="frontPts" />
      </svg>
      <div class="halftone" #halftone></div>
      <div class="lines" #lines>
        @for (i of lineList; track i) {
          <span [style.top.%]="10 + i * 11"></span>
        }
      </div>
      <div class="word" #word></div>
      <div class="ribbon" #ribbon><span #sub></span></div>
      <div class="fx" #fx></div>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .pop {
      position: absolute;
      inset: 0;
      visibility: hidden;
      --ev: var(--accent);
      --size: calc(var(--wh) * 2.3);
    }
    .burst,
    .ring,
    .halftone {
      position: absolute;
      left: 50%;
      top: 50%;
      width: var(--size);
      height: var(--size);
      margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
    }
    .burst.back polygon {
      fill: #111;
    }
    .burst.back {
      transform: translate(1.5%, 2%);
    }
    .burst.front polygon {
      fill: var(--ev);
      stroke: #111;
      stroke-width: 0.03;
      stroke-linejoin: round;
    }
    /* comic-print dots over the burst */
    .halftone {
      width: calc(var(--size) * 0.8);
      height: calc(var(--size) * 0.8);
      margin: calc(var(--size) * -0.4) 0 0 calc(var(--size) * -0.4);
      border-radius: 50%;
      background: radial-gradient(circle, rgba(0, 0, 0, 0.32) 28%, transparent 31%) 0 0 / 14px 14px;
      -webkit-mask-image: radial-gradient(circle, transparent 20%, #000 75%);
      mask-image: radial-gradient(circle, transparent 20%, #000 75%);
      opacity: 0;
    }
    .ring {
      border-radius: 50%;
      border: calc(var(--wh) * 0.06) solid var(--ev);
      opacity: 0;
    }
    .lines {
      position: absolute;
      left: -20%;
      right: -20%;
      top: 0;
      bottom: 0;
      overflow: visible;
    }
    .lines span {
      position: absolute;
      left: 0;
      height: calc(var(--wh) * 0.04);
      width: 35%;
      border-radius: 99px;
      background: linear-gradient(90deg, transparent, #fff 60%, var(--ev));
      opacity: 0;
    }
    .word {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-58%);
      text-align: center;
      white-space: pre;
      line-height: 0.95;
      font-family: 'Barlow Condensed', var(--font);
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      font-size: calc(var(--wh) * 0.78 * var(--fs));
      letter-spacing: 0.02em;
      color: #fff;
      -webkit-text-stroke: 0.045em #111;
      paint-order: stroke fill;
      /* extruded comic shadow: event colour, then ink */
      text-shadow:
        0.035em 0.035em 0 var(--ev),
        0.06em 0.06em 0 var(--ev),
        0.09em 0.09em 0 #111;
    }
    .ribbon {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, var(--ribbon-y, calc(var(--wh) * 0.42))) rotate(-2.5deg);
      max-width: 92%;
      text-align: center;
      padding: 0.25em 1em 0.3em;
      background: #111;
      color: #fff;
      border: 3px solid #fff;
      box-shadow: 0.2em 0.2em 0 var(--ev);
      font: 800 max(22px, calc(var(--wh) * 0.15 * var(--fs))) / 1.1 Inter, Mukta, sans-serif;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      opacity: 0;
    }
    .ribbon:has(span:empty) {
      display: none;
    }
    .fx {
      position: absolute;
      inset: 0;
      overflow: visible;
    }
  `,
})
export class BannerPopComponent {
  private readonly motion = inject(MotionService);
  private readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly frontPts = burstPoints(18, 0.74);
  protected readonly backPts = burstPoints(18, 0.74);
  protected readonly lineList = [0, 1, 2, 3, 4, 5, 6, 7];

  private readonly rootEl = viewChild.required<ElementRef<HTMLElement>>('root');
  private readonly ringEl = viewChild.required<ElementRef<HTMLElement>>('ring');
  private readonly burstBackEl = viewChild.required<ElementRef<SVGElement>>('burstBack');
  private readonly burstFrontEl = viewChild.required<ElementRef<SVGElement>>('burstFront');
  private readonly halftoneEl = viewChild.required<ElementRef<HTMLElement>>('halftone');
  private readonly linesEl = viewChild.required<ElementRef<HTMLElement>>('lines');
  private readonly wordEl = viewChild.required<ElementRef<HTMLElement>>('word');
  private readonly ribbonEl = viewChild.required<ElementRef<HTMLElement>>('ribbon');
  private readonly subEl = viewChild.required<ElementRef<HTMLElement>>('sub');
  private readonly fxEl = viewChild.required<ElementRef<HTMLElement>>('fx');

  private tl: gsap.core.Timeline | null = null;
  private done: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** plays one moment; resolves when it has left the screen */
  play(shot: PopShot): Promise<void> {
    this.stop();
    return new Promise((resolve) => {
      this.done = resolve;
      this.run(shot);
    });
  }

  stop(): void {
    this.tl?.kill();
    this.tl = null;
    gsap.killTweensOf(this.fxEl().nativeElement.children);
    this.fxEl().nativeElement.replaceChildren();
    gsap.set(this.rootEl().nativeElement, { visibility: 'hidden' });
    const d = this.done;
    this.done = null;
    d?.();
  }

  private run(shot: PopShot): void {
    const root = this.rootEl().nativeElement;
    const ring = this.ringEl().nativeElement;
    const back = this.burstBackEl().nativeElement;
    const front = this.burstFrontEl().nativeElement;
    const halftone = this.halftoneEl().nativeElement;
    const word = this.wordEl().nativeElement;
    const ribbon = this.ribbonEl().nativeElement;
    const sub = this.subEl().nativeElement;
    const lines = Array.from(this.linesEl().nativeElement.querySelectorAll<HTMLElement>('span'));
    const d = (s: number) => this.motion.d(s);
    const wh = this.host.clientHeight || 200;
    const ww = this.host.clientWidth || 1000;

    root.style.setProperty('--ev', shot.color);
    const loud = shot.type === 'FOUR' || shot.type === 'SIX' || shot.type === 'WICKET';
    sub.textContent = shot.subtitle;
    const { box, parts } = this.fit(word, loud ? `${shot.title}!` : shot.title, ww, wh);
    // the burst follows the box: never wider than most of it, never taller than it can show
    root.style.setProperty('--size', `${Math.min(wh * 2.3, ww * 0.62)}px`);
    root.style.setProperty('--ribbon-y', `${box.h * 0.5 + wh * 0.02}px`);

    const mid = (parts.length - 1) / 2;
    // long or two-line words stretch the burst so the word stays inside it
    const size = Math.min(wh * 2.3, ww * 0.62);
    const stretch = Math.max(1, (box.w * 1.22) / (size * 0.74));
    const stretchY = Math.max(1, (box.h * 1.3) / (size * 0.74));

    const tl = gsap.timeline({ onComplete: () => this.stop() });
    this.tl = tl;
    tl.set(root, { visibility: 'visible' })
      .set([back, front], { scale: 0, rotate: -40, transformOrigin: '50% 50%' })
      .set(halftone, { opacity: 0, scale: 0.6 })
      .set(ribbon, { opacity: 0, scaleX: 0 })
      .set(ring, { opacity: 0, scale: 0.3 })

      // the burst punches in, overshoots, settles; then keeps turning slowly
      .to(back, { scaleX: 1.05 * stretch, scaleY: 1.05 * stretchY, rotate: 0, duration: d(0.5), ease: 'back.out(2.6)' }, 0)
      .to(front, { scaleX: stretch, scaleY: stretchY, rotate: 0, duration: d(0.5), ease: 'back.out(2.6)' }, d(0.04))
      .to(halftone, { opacity: 1, scale: 1, duration: d(0.4), ease: 'power2.out' }, d(0.15))
      .to([back, front], { rotate: stretch > 1.05 ? '+=0' : '+=12', duration: shot.hold + d(1.2), ease: 'none' }, d(0.5));

    // the word: each letter pops from nothing, tumbling into place with an elastic bounce
    if (shot.type === 'WICKET') {
      tl.fromTo(
        parts,
        { yPercent: -260, opacity: 0, rotate: () => gsap.utils.random(-30, 30) },
        { yPercent: 0, opacity: 1, rotate: 0, duration: d(0.55), ease: 'bounce.out', stagger: d(0.05) },
        d(0.12),
      )
        .fromTo(ring, { opacity: 0.95, scale: 0.3 }, { opacity: 0, scale: 1.6, duration: d(0.7), ease: 'power2.out' }, d(0.55))
        .to(root, { x: '+=14', duration: d(0.04), repeat: 7, yoyo: true, ease: 'none' }, d(0.6))
        .set(root, { x: 0 });
    } else if (shot.type === 'FOUR') {
      tl.fromTo(
        parts,
        { xPercent: -400, opacity: 0, skewX: -30 },
        { xPercent: 0, opacity: 1, skewX: 0, duration: d(0.45), ease: 'back.out(2)', stagger: d(0.04) },
        d(0.1),
      );
      lines.forEach((l, i) =>
        tl.fromTo(
          l,
          { xPercent: -120, opacity: 1 },
          { xPercent: 360, opacity: 0, duration: d(0.5), ease: 'power2.in' },
          d(0.05 + (i % 4) * 0.06 + Math.floor(i / 4) * 0.3),
        ),
      );
    } else {
      tl.fromTo(
        parts,
        { scale: 0, opacity: 0, rotate: () => gsap.utils.random(-35, 35), y: () => gsap.utils.random(-wh * 0.4, wh * 0.4) },
        {
          scale: 1,
          opacity: 1,
          rotate: 0,
          y: 0,
          duration: d(0.7),
          ease: 'elastic.out(1, 0.45)',
          // letters land from the middle out
          stagger: { each: d(0.05), from: 'center' },
        },
        d(0.15),
      );
    }

    // jelly: while it holds, the letters keep bobbing in a wave
    const landed = d(0.15 + 0.7 + parts.length * 0.05);
    tl.to(
      parts,
      {
        keyframes: [
          { y: -wh * 0.05, scaleY: 1.06, duration: d(0.22), ease: 'sine.out' },
          { y: 0, scaleY: 1, duration: d(0.22), ease: 'sine.in' },
        ],
        repeat: Math.max(0, Math.round(shot.hold / d(0.44)) - 1),
        stagger: { each: d(0.06), from: mid },
      },
      landed,
    );

    // ribbon with the player line unrolls from the middle
    if (shot.subtitle) {
      tl.to(ribbon, { opacity: 1, scaleX: 1, duration: d(0.35), ease: 'back.out(2)' }, d(0.55)).fromTo(
        sub,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: d(0.25), ease: 'power2.out' },
        d(0.75),
      );
    }

    if (shot.type === 'SIX') this.confetti(tl, ww, wh, d);
    if (shot.type === 'FIFTY' || shot.type === 'HUNDRED') this.sparkles(tl, ww, wh, shot.hold, d);

    // exit: letters pop away from the edges in, burst spins out
    const out = landed + shot.hold;
    tl.to(parts, { scale: 0, opacity: 0, rotate: () => gsap.utils.random(-40, 40), duration: d(0.3), ease: 'back.in(2)', stagger: { each: d(0.03), from: 'edges' } }, out)
      .to(ribbon, { opacity: 0, scaleX: 0, duration: d(0.25), ease: 'power2.in' }, out)
      .to(halftone, { opacity: 0, duration: d(0.25) }, out)
      .to([front, back], { scale: 0, rotate: '+=90', duration: d(0.4), ease: 'back.in(1.6)' }, out + d(0.1));
  }

  /**
   * Sizes the word to the widget box: shrinks it until it fits, and lets a
   * long phrase (DRS REVIEW, डावांमधील विश्रांती) wrap onto two lines first.
   * Returns the word's size in canvas px.
   */
  private fit(word: HTMLElement, text: string, ww: number, wh: number): { box: { w: number; h: number }; parts: HTMLElement[] } {
    word.style.fontSize = '';
    // the Output scales the 1920×1080 canvas to the window; measure in canvas px
    const scale = this.host.getBoundingClientRect().width / ww || 1;
    const measure = () => {
      const r = Array.from(word.children).reduce(
        (acc, el) => {
          const b = el.getBoundingClientRect();
          return { w: Math.max(acc.w, b.width), h: acc.h + b.height };
        },
        { w: 0, h: 0 },
      );
      return { w: r.w / scale, h: r.h / scale };
    };
    const maxW = ww * 0.9;
    let maxH = wh * 1.3;
    let font = parseFloat(getComputedStyle(word).fontSize) || wh * 0.78;
    let parts = this.build(word, [text]);
    let m = measure();
    const words = text.trim().split(/\s+/);
    if (m.w > maxW && words.length > 1) {
      // two balanced lines: break at the space closest to the middle
      const total = text.length;
      let best = 1;
      let bestGap = Infinity;
      for (let i = 1; i < words.length; i++) {
        const gap = Math.abs(words.slice(0, i).join(' ').length - total / 2);
        if (gap < bestGap) [best, bestGap] = [i, gap];
      }
      parts = this.build(word, [words.slice(0, best).join(' '), words.slice(best).join(' ')]);
      maxH = wh * 1.75;
      m = measure();
    }
    for (let i = 0; i < 12 && (m.w > maxW || m.h > maxH); i++) {
      font *= 0.9;
      word.style.fontSize = `${font}px`;
      m = measure();
    }
    return { box: m, parts };
  }

  /**
   * One block per line, each split into pieces that animate on their own:
   * letters in English, whole words in Marathi (splitting letters would break
   * the joined Devanagari shapes).
   */
  private build(word: HTMLElement, lines: string[]): HTMLElement[] {
    word.replaceChildren();
    const parts: HTMLElement[] = [];
    const byLetter = this.i18n.lang() === 'en';
    for (const line of lines) {
      const ln = document.createElement('div');
      ln.style.display = 'block';
      ln.style.width = 'fit-content';
      ln.style.margin = '0 auto';
      const pieces = byLetter ? Array.from(line) : line.split(/(\s+)/);
      for (const piece of pieces) {
        if (/^\s+$/.test(piece)) {
          ln.append(document.createTextNode(' '));
          continue;
        }
        const span = document.createElement('span');
        span.textContent = piece === ' ' ? '\u00a0' : piece;
        // runtime elements don't get the component's scoped CSS
        span.style.display = 'inline-block';
        ln.append(span);
        parts.push(span);
      }
      word.append(ln);
    }
    return parts;
  }

  /** SIX: a shower of paper confetti over the whole banner */
  private confetti(tl: gsap.core.Timeline, ww: number, wh: number, d: (s: number) => number): void {
    const fx = this.fxEl().nativeElement;
    const pieces: HTMLElement[] = [];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      const w = gsap.utils.random(8, 16);
      // created at runtime, so the component's scoped CSS doesn't reach them: style inline
      Object.assign(p.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: `${w}px`,
        height: `${w * gsap.utils.random(0.35, 0.6)}px`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        borderRadius: '2px',
        opacity: '0',
      });
      fx.append(p);
      pieces.push(p);
    }
    tl.add(() => {
      for (const p of pieces) {
        const x = gsap.utils.random(ww * 0.1, ww * 0.9);
        gsap.fromTo(
          p,
          { x: ww / 2 + gsap.utils.random(-60, 60), y: wh / 2, opacity: 1, rotate: 0 },
          {
            keyframes: [
              // burst up and out of the word…
              { x, y: gsap.utils.random(-wh * 1.4, -wh * 0.4), duration: d(gsap.utils.random(0.4, 0.6)), ease: 'power2.out' },
              // …then flutter down
              {
                x: x + gsap.utils.random(-80, 80),
                y: wh * gsap.utils.random(1.2, 1.8),
                rotate: gsap.utils.random(-720, 720),
                opacity: 0,
                duration: d(gsap.utils.random(1.4, 2.2)),
                ease: 'power1.in',
              },
            ],
          },
        );
      }
    }, d(0.35));
  }

  /** FIFTY / HUNDRED: gold sparkles twinkling around the word */
  private sparkles(tl: gsap.core.Timeline, ww: number, wh: number, hold: number, d: (s: number) => number): void {
    const fx = this.fxEl().nativeElement;
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i');
      s.textContent = '✦';
      Object.assign(s.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        fontStyle: 'normal',
        color: '#fde68a',
        textShadow: '0 0 10px #f59e0b',
      });
      s.style.fontSize = `${gsap.utils.random(wh * 0.12, wh * 0.28)}px`;
      s.style.opacity = '0';
      fx.append(s);
      const x = ww / 2 + gsap.utils.random(-ww * 0.32, ww * 0.32);
      const y = wh / 2 + gsap.utils.random(-wh * 0.75, wh * 0.6);
      tl.fromTo(
        s,
        { x, y, scale: 0, opacity: 0, rotate: 0 },
        { scale: 1, opacity: 1, rotate: 90, duration: d(0.35), ease: 'back.out(3)', yoyo: true, repeat: Math.max(1, Math.round(hold / 0.7)) },
        d(0.3 + gsap.utils.random(0, 0.8)),
      );
    }
  }
}
