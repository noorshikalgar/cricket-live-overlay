import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { MatchEvent, MatchEventType } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { MotionService } from '../../motion/motion.service';
import { SplitText, gsap } from '../../motion/gsap';
import { WidgetBase } from '../widget-base';

export interface BannerProps {
  autoFire: Record<string, boolean>;
  /** hold time in seconds */
  duration: number;
  direction: 'left' | 'right';
  showSubtitle: boolean;
}

const EVENT_COLOR: Partial<Record<MatchEventType, string>> = {
  FOUR: 'var(--c-four)',
  SIX: 'var(--c-six)',
  WICKET: 'var(--c-wicket)',
};

const MAX_QUEUE = 3;

@Component({
  selector: 'cos-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editing() && !playing()) {
      <div class="placeholder">
        <span>★ Event banner</span>
        <small>Plays on FOUR · SIX · WICKET · milestones · event pad</small>
      </div>
    }
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
      background: var(--ev, var(--accent));
      border-radius: var(--radius);
      box-shadow: var(--shadow);
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
      font-family: Inter, sans-serif;
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
  `,
})
export class BannerWidget extends WidgetBase<BannerProps> {
  protected readonly defaults: BannerProps = {
    autoFire: { FOUR: true, SIX: true, WICKET: true, FIFTY: true, HUNDRED: true },
    duration: 2.5,
    direction: 'left',
    showSubtitle: true,
  };

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
    const banner = this.bannerEl().nativeElement;
    const fill = this.fillEl().nativeElement;
    const title = this.titleEl().nativeElement;
    const sub = this.subEl().nativeElement;
    this.split?.revert();
    this.split = null;
    this.tl?.kill();

    banner.style.setProperty('--ev', EVENT_COLOR[e.type] ?? 'var(--accent)');
    title.textContent = e.title;
    sub.textContent = this.p().showSubtitle ? e.subtitle : '';

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

    this.split = new SplitText(title, { type: 'chars' });
    tl.set(banner, { visibility: 'visible', opacity: 1 })
      .set([title, sub], { opacity: 1 })
      .fromTo(fill, { clipPath: hiddenIn }, { clipPath: shown, duration: d(0.45), ease: 'power3.out' })
      .from(
        this.split.chars,
        { yPercent: 110, opacity: 0, duration: d(0.4), ease: 'power3.out', stagger: d(0.025) },
        d(0.12),
      )
      .from(sub, { y: 10, opacity: 0, duration: d(0.35), ease: 'power3.out' }, d(0.3))
      .to([title, sub], { opacity: 0, duration: d(0.2), ease: 'power2.in' }, `+=${hold}`)
      .to(fill, { clipPath: hiddenOut, duration: d(0.3), ease: 'power2.in' }, '<0.05');
  }
}
