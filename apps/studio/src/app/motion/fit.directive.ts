import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/** smallest scale the text may shrink to */
const MIN = 0.6;

/**
 * Shrinks the text of a fixed-size box until its content fits: sets `--fit`
 * (1 → 0.6) on the element, which its font-size multiplies by. Re-checks when
 * the box is resized or its content changes (e.g. a long Marathi line).
 */
@Directive({ selector: '[cosFit]' })
export class FitDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private queued = false;

  constructor() {
    const ro = new ResizeObserver(() => this.queue());
    const mo = new MutationObserver(() => this.queue());
    ro.observe(this.el);
    mo.observe(this.el, { childList: true, subtree: true, characterData: true });
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      mo.disconnect();
    });
    this.queue();
  }

  private queue(): void {
    if (this.queued) return;
    this.queued = true;
    // a timeout, not rAF: animation frames pause in a hidden OBS source
    setTimeout(() => {
      this.queued = false;
      this.fit();
    }, 30);
  }

  private fit(): void {
    const el = this.el;
    let k = 1;
    el.style.setProperty('--fit', '1');
    while (k > MIN && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      k = Math.round((k - 0.05) * 100) / 100;
      el.style.setProperty('--fit', String(k));
    }
  }
}
