import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { LiveStore } from '../../core/live.store';
import { MotionService } from '../../motion/motion.service';
import { gsap } from '../../motion/gsap';
import { WidgetBase } from '../widget-base';

export interface TickerProps {
  source: 'matches' | 'custom' | 'both';
  text: string;
  /** px per second */
  speed: number;
  label: string;
}

@Component({
  selector: 'cos-ticker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel flush bar">
      @if (p().label) {
        <div class="tag">{{ p().label }}</div>
      }
      <div class="viewport">
        <div class="track" #track>
          @for (copy of [0, 1]; track copy) {
            <div class="run" [attr.aria-hidden]="copy === 1">
              @for (item of items(); track $index) {
                <span class="item">{{ item }}</span><span class="sep">•</span>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .bar {
      display: flex;
      align-items: stretch;
      font-size: calc(var(--wh) * 0.44 * var(--fs));
    }
    .tag {
      flex: none;
      display: flex;
      align-items: center;
      padding: 0 0.8em;
      background: var(--accent);
      color: #0b0f17;
      font-weight: 700;
      letter-spacing: 0.08em;
      font-size: max(22px, 0.8em);
      text-transform: uppercase;
    }
    .viewport {
      flex: 1;
      overflow: hidden;
      display: flex;
      align-items: center;
    }
    .track {
      display: flex;
      white-space: nowrap;
      will-change: transform;
    }
    .run {
      display: flex;
      align-items: center;
      flex: none;
    }
    .item {
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .sep {
      color: var(--accent);
      margin: 0 1.2em;
    }
  `,
})
export class TickerWidget extends WidgetBase<TickerProps> {
  protected readonly defaults: TickerProps = { source: 'matches', text: '', speed: 90, label: 'LIVE SCORES' };
  private readonly store = inject(LiveStore);
  private readonly motion = inject(MotionService);
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private tween: gsap.core.Tween | null = null;

  protected readonly items = computed(() => {
    const { source, text } = this.p();
    const custom = text
      .split(/\s*·\s*|\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const scores = this.store.matches().map((m) => `${m.scoreLine}  ${m.statusText}`.trim());
    if (source === 'custom') return custom.length ? custom : ['Add ticker text in settings'];
    if (source === 'both') return [...scores, ...custom];
    return scores.length ? scores : custom.length ? custom : ['No other live matches'];
  });

  constructor() {
    super();
    // restart the loop whenever content or speed changes; the two copies make it seamless
    effect(() => {
      this.items();
      const speed = Math.max(10, Number(this.p().speed) || 90) * this.motion.speed();
      const reduced = this.motion.reduced();
      queueMicrotask(() => this.restart(speed, reduced));
    });
    inject(DestroyRef).onDestroy(() => this.tween?.kill());
  }

  private restart(pxPerSecond: number, reduced: boolean): void {
    const el = this.track().nativeElement;
    this.tween?.kill();
    gsap.set(el, { x: 0 });
    if (reduced) return;
    const run = el.firstElementChild as HTMLElement | null;
    const width = run?.offsetWidth ?? 0;
    if (!width) return;
    this.tween = gsap.to(el, { x: -width, duration: width / pxPerSecond, ease: 'none', repeat: -1 });
  }
}
