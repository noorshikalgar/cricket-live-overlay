import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { currentInnings } from '@cos/shared';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

export interface StatBarProps {
  showStatus: boolean;
}

/** One line of the numbers commentators quote: CRR, RRR, partnership, and the chase sentence. */
@Component({
  selector: 'cos-stat-bar',
  imports: [MarqueeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bc dark sb">
      @for (s of stats(); track s.k) {
        <span class="st"><span class="bc-word k">{{ s.k }}:</span> <span class="bc-num bc-hl">{{ s.v }}</span></span>
      }
      @if (p().showStatus && status()) {
        <span class="status bc-word" cosMarquee>{{ status() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --u: calc(var(--wh) / 100 * var(--fs));
    }
    .sb {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 26);
      padding: 0 calc(var(--u) * 22);
      font-size: calc(var(--u) * 52);
      white-space: nowrap;
    }
    .k {
      font-size: 0.9em;
    }
    .status {
      margin-left: auto;
      font-size: 0.9em;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class StatBarWidget extends WidgetBase<StatBarProps> {
  protected readonly defaults: StatBarProps = { showStatus: true };

  protected readonly stats = computed(() => {
    const m = this.match();
    const inn = m ? currentInnings(m) : null;
    if (!m || !inn) return [];
    const out = [{ k: 'CRR', v: inn.runRate.toFixed(2) }];
    if (m.requiredRunRate !== null) out.push({ k: 'RRR', v: m.requiredRunRate.toFixed(2) });
    out.push({ k: "P'SHIP", v: `${m.partnership.runs} (${m.partnership.balls})` });
    return out;
  });

  protected readonly status = computed(() => this.match()?.statusText ?? '');
}
