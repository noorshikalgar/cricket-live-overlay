import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { OdometerDirective } from '../../motion/odometer.directive';
import { WidgetBase } from '../widget-base';

export interface ClockProps {
  mode: 'time' | 'countdown';
  /** "HH:MM", local time; countdown rolls to tomorrow once passed */
  target: string;
  label: string;
  hour24: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

@Component({
  selector: 'cos-clock',
  imports: [OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel box">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (p().mode === 'countdown' && p().label) {
        <span class="label">{{ p().label }}</span>
      }
      @if (p().mode === 'time') {
        <span class="num t" [cosOdo]="display()"></span>
      } @else {
        <span class="num t">{{ display() }}</span>
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
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5em;
      font-size: calc(var(--wh) * 0.42 * var(--fs));
      padding-top: 0;
      padding-bottom: 0;
    }
    .label {
      font-size: max(22px, 0.5em);
    }
  `,
})
export class ClockWidget extends WidgetBase<ClockProps> {
  protected readonly defaults: ClockProps = { mode: 'time', target: '19:30', label: 'STARTS IN', hour24: true };
  private readonly now = signal(Date.now());

  protected readonly display = computed(() => {
    const now = new Date(this.now());
    const { mode, target, hour24 } = this.p();
    if (mode === 'time') {
      const h = now.getHours();
      const hh = hour24 ? pad(h) : String(((h + 11) % 12) + 1);
      return `${hh}:${pad(now.getMinutes())}${hour24 ? '' : h < 12 ? ' AM' : ' PM'}`;
    }
    const [th, tm] = target.split(':').map((x) => Number(x));
    const t = new Date(now);
    t.setHours(Number.isFinite(th) ? th : 0, Number.isFinite(tm) ? tm : 0, 0, 0);
    if (t.getTime() <= now.getTime() - 60_000 * 30) t.setDate(t.getDate() + 1);
    const left = Math.max(0, Math.round((t.getTime() - now.getTime()) / 1000));
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  });

  constructor() {
    super();
    const id = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
  }
}
