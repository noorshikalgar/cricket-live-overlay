import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { MotionService } from '../../motion/motion.service';
import { gsap } from '../../motion/gsap';
import { WidgetBase } from '../widget-base';

export interface TimerProps {
  title: string;
  /** until = to a clock time; duration = fixed length with start/pause; stopwatch = counts up */
  mode: 'until' | 'duration' | 'stopwatch';
  /** "HH:MM" local time for `until` */
  target: string;
  /** length for `duration` */
  minutes: number;
  /** epoch ms when last started; null while stopped or paused */
  startedAt: number | null;
  /** ms already run before the current start (pause / resume) */
  elapsed: number;
  /** shown once a countdown reaches zero */
  endText: string;
  panel: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Remaining / elapsed ms for a timer at time `now`. Exported for the settings panel. */
export function timerValue(p: TimerProps, now: number): { ms: number; done: boolean; running: boolean } {
  const ran = (p.elapsed || 0) + (p.startedAt ? now - p.startedAt : 0);
  const running = !!p.startedAt;
  if (p.mode === 'stopwatch') return { ms: ran, done: false, running };
  if (p.mode === 'duration') {
    const left = Math.max(0, (Number(p.minutes) || 0) * 60_000 - ran);
    return { ms: left, done: left === 0 && (running || ran > 0), running };
  }
  // until: always "running", counts to the next HH:MM (tomorrow once it's 30 min past)
  const [th, tm] = (p.target || '0:0').split(':').map((x) => Number(x));
  const t = new Date(now);
  t.setHours(Number.isFinite(th) ? th : 0, Number.isFinite(tm) ? tm : 0, 0, 0);
  if (t.getTime() < now - 30 * 60_000) t.setDate(t.getDate() + 1);
  const left = Math.max(0, t.getTime() - now);
  return { ms: left, done: left === 0, running: true };
}

/** "Starting in 04:59" style timer: countdown to a time, a fixed length, or a stopwatch. */
@Component({
  selector: 'cos-timer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box" [class.panel]="p().panel">
      @if (p().title) {
        <div class="title">{{ i18n.defaultText(p().title) }}</div>
      }
      @if (value().done && p().endText) {
        <div class="end" #end>{{ i18n.defaultText(p().endText) }}</div>
      } @else {
        <div class="digits num" [class.paused]="p().mode === 'duration' && !value().running && !value().done">{{ text() }}</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .box {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: calc(var(--wh) * 0.03);
      color: var(--text);
      padding: 0 var(--pad);
    }
    .box:not(.panel) {
      text-shadow: 0 3px 16px rgba(0, 0, 0, 0.5);
    }
    .title {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--accent);
      font-size: max(22px, calc(var(--wh) * 0.14 * var(--fs)));
      white-space: nowrap;
    }
    .digits {
      font-weight: 700;
      line-height: 1;
      font-size: calc(min(var(--wh) * 0.5, var(--ww) * 0.2) * var(--fs));
      letter-spacing: 0.02em;
    }
    .digits.paused {
      opacity: 0.75;
    }
    .end {
      font-family: var(--font);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.05;
      text-align: center;
      font-size: calc(min(var(--wh) * 0.32, var(--ww) * 0.09) * var(--fs));
    }
  `,
})
export class TimerWidget extends WidgetBase<TimerProps> {
  protected readonly defaults: TimerProps = {
    title: 'STARTING IN',
    mode: 'duration',
    target: '19:30',
    minutes: 5,
    startedAt: null,
    elapsed: 0,
    endText: 'STARTING NOW',
    panel: true,
  };

  private readonly now = signal(Date.now());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly motion = inject(MotionService);

  protected readonly value = computed(() => timerValue(this.p(), this.now()));
  protected readonly text = computed(() => formatClock(this.value().ms));

  constructor() {
    super();
    const id = setInterval(() => this.now.set(Date.now()), 250);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
    // one short pop when the countdown hits zero (no looping motion)
    let wasDone = false;
    effect(() => {
      const done = this.value().done;
      untracked(() => {
        if (done && !wasDone && !this.motion.reduced()) {
          queueMicrotask(() => {
            const end = this.host.querySelector('.end');
            if (end) gsap.fromTo(end, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: this.motion.d(0.45), ease: 'back.out(2)' });
          });
        }
        wasDone = done;
      });
    });
  }
}
