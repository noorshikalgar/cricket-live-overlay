import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { currentInnings } from '@cos/shared';
import { OdometerDirective } from '../../motion/odometer.directive';
import { WidgetBase } from '../widget-base';

export interface ChaseBoxProps {
  /** before a chase: show current run rate vs projected score */
  showProjection: boolean;
}

interface Half {
  label: string;
  value: string;
  tone: 'a' | 'b';
}

/** "Runs needed vs balls left" in a chase; run rate vs projected score before it. */
@Component({
  selector: 'cos-chase-box',
  imports: [OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (halves(); as h) {
      <div class="bc dark cb">
        @for (x of h; track x.label; let i = $index) {
          <div class="half" [class.b]="x.tone === 'b'">
            <span class="lab bc-word">{{ x.label }}</span>
            <span class="val bc-num" [cosOdo]="x.value"></span>
          </div>
          @if (i === 0) {
            <span class="vs bc-word">VS</span>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) / 100 * var(--fs));
    }
    .cb {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }
    .half {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: calc(var(--u) * 2);
    }
    .lab {
      font-size: calc(var(--u) * 11);
      color: var(--accent);
      white-space: nowrap;
    }
    .half.b .lab,
    .half.b .val {
      color: var(--hl);
    }
    .val {
      font-size: calc(var(--u) * 46);
      color: var(--accent);
    }
    .vs {
      width: calc(var(--u) * 22);
      height: calc(var(--u) * 22);
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: calc(var(--u) * 9);
      background: rgba(255, 255, 255, 0.12);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
    }
  `,
})
export class ChaseBoxWidget extends WidgetBase<ChaseBoxProps> {
  protected readonly defaults: ChaseBoxProps = { showProjection: true };

  protected readonly halves = computed<Half[] | null>(() => {
    const m = this.match();
    if (!m) return null;
    const inn = currentInnings(m);
    if (m.target !== null && inn && m.ballsRemaining !== null) {
      return [
        { label: 'Runs needed', value: String(Math.max(0, m.target - inn.runs)), tone: 'a' },
        { label: 'Balls left', value: String(m.ballsRemaining), tone: 'b' },
      ];
    }
    if (!this.p().showProjection || !inn) return null;
    const maxOvers = m.format === 'ODI' ? 50 : m.format === 'T20' ? 20 : null;
    return [
      { label: 'Run rate', value: inn.runRate.toFixed(2), tone: 'a' },
      { label: maxOvers ? 'Projected' : 'Overs', value: maxOvers ? String(Math.round(inn.runRate * maxOvers)) : inn.overs, tone: 'b' },
    ];
  });
}
