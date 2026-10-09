import { DestroyRef, Directive, ElementRef, effect, inject } from '@angular/core';
import { MotionService } from './motion.service';

/** px per second the text travels while scrolling */
const SPEED = 45;
/** seconds the text rests at each end */
const REST = 1.6;

/**
 * Text that does not fit scrolls slowly to its end and back (ping-pong) so
 * viewers can read all of it, instead of being cut off with "…". Text that fits
 * stays still. Applies to every `.ellipsis` element and anything marked
 * `cosMarquee`. With reduce motion on, it falls back to the ellipsis.
 */
@Directive({
  selector: '.ellipsis, [cosMarquee]',
  host: { class: 'mq-host' },
})
export class MarqueeDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly motion = inject(MotionService);
  private dist = 0;
  private frame = 0;

  constructor() {
    const ro = new ResizeObserver(() => this.schedule());
    const mo = new MutationObserver(() => this.schedule());
    ro.observe(this.el);
    mo.observe(this.el, { characterData: true, childList: true, subtree: true });
    effect(() => {
      this.motion.reduced();
      this.motion.speed();
      this.schedule();
    });
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(this.frame);
    });
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    // rAF may be paused in a hidden window; a timeout keeps the measure coming
    this.frame = requestAnimationFrame(() => this.measure());
    setTimeout(() => this.measure(), 120);
  }

  private measure(): void {
    const el = this.el;
    if (!el.isConnected) return;
    // text-indent (what scrolls the text) only works on block containers
    if (getComputedStyle(el).display === 'inline') el.classList.add('mq-inline');
    const wasOn = el.classList.contains('mq');
    el.classList.remove('mq');
    const dist = Math.ceil(el.scrollWidth - el.clientWidth);
    if (dist <= 2 || this.motion.reduced()) {
      this.dist = 0;
      return;
    }
    // keep the running animation when nothing changed
    if (dist !== this.dist || !wasOn) {
      this.dist = dist;
      const travel = dist / SPEED;
      const total = (travel + REST) / this.motion.speed();
      el.style.setProperty('--mq-d', `${-dist}px`);
      el.style.setProperty('--mq-t', `${total.toFixed(2)}s`);
    }
    el.classList.add('mq');
  }
}
