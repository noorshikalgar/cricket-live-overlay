import { DestroyRef, Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';
import { MotionService } from './motion.service';
import { gsap } from './gsap';

/**
 * `<span [cosOdo]="runs"></span>` — when the value changes, the old value
 * slides up and out while the new one slides up and in (300 ms). No flashing.
 * The element must be empty: the directive owns its text.
 */
@Directive({ selector: '[cosOdo]', host: { class: 'odo' } })
export class OdometerDirective {
  readonly cosOdo = input.required<string | number | null>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly motion = inject(MotionService);
  private prev: string | null = null;
  private tl: gsap.core.Timeline | null = null;

  constructor() {
    effect(() => {
      const raw = this.cosOdo();
      const v = raw === null || raw === undefined ? '–' : String(raw);
      untracked(() => this.render(v));
    });
    inject(DestroyRef).onDestroy(() => this.tl?.kill());
  }

  private render(v: string): void {
    const old = this.prev;
    this.prev = v;
    if (old === null || old === v || this.motion.reduced()) {
      this.tl?.kill();
      this.el.textContent = v;
      return;
    }
    this.tl?.kill();
    this.el.textContent = '';
    const next = document.createElement('span');
    next.textContent = v;
    const prev = document.createElement('span');
    prev.className = 'odo-old';
    prev.textContent = old;
    this.el.append(next, prev);
    const duration = this.motion.d(0.3);
    this.tl = gsap
      .timeline({ onComplete: () => void (this.el.textContent = v) })
      .fromTo(next, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration, ease: 'power3.out' }, 0)
      .to(prev, { yPercent: -100, opacity: 0, duration, ease: 'power3.out' }, 0);
  }
}
