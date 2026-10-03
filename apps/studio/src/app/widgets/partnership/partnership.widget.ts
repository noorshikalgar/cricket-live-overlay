import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { OdometerDirective } from '../../motion/odometer.directive';
import { WidgetBase } from '../widget-base';

export interface PartnershipProps {
  showBar: boolean;
}

@Component({
  selector: 'cos-partnership',
  imports: [OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel box">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      <div class="top">
        <span class="label">Partnership</span>
        <span class="num big" [cosOdo]="match()?.partnership?.runs ?? 0"></span>
        <span class="num balls">(<span [cosOdo]="match()?.partnership?.balls ?? 0"></span>)</span>
      </div>
      @if (p().showBar && contrib()[0] + contrib()[1] > 0) {
        <div class="bar">
          <span class="a" [style.transform]="'scaleX(' + share()[0] + ')'"></span>
          <span class="b" [style.transform]="'scaleX(' + share()[1] + ')'"></span>
        </div>
        <div class="names">
          <span class="ellipsis">{{ names()[0] }} <b class="num">{{ contrib()[0] }}</b></span>
          <span class="ellipsis right"><b class="num">{{ contrib()[1] }}</b> {{ names()[1] }}</span>
        </div>
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
      flex-direction: column;
      justify-content: center;
      gap: 0.3em;
      font-size: calc(var(--wh) * 0.22 * var(--fs));
      padding-top: 0;
      padding-bottom: 0;
    }
    .top {
      display: flex;
      align-items: baseline;
      gap: 0.4em;
    }
    .top .label {
      flex: 1;
      font-size: max(22px, 0.8em);
    }
    .big {
      font-size: 1.3em;
    }
    .balls {
      color: var(--muted);
      font-weight: 500;
    }
    .bar {
      position: relative;
      height: 0.35em;
      min-height: 6px;
      display: flex;
      border-radius: 99px;
      overflow: hidden;
      background: var(--chip);
    }
    .bar span {
      flex: 1;
      transition: transform 0.5s var(--ease-out);
    }
    .bar .a {
      background: var(--accent);
      transform-origin: left;
    }
    .bar .b {
      background: var(--muted);
      transform-origin: right;
    }
    .names {
      display: flex;
      justify-content: space-between;
      gap: 1em;
      font-size: max(22px, 0.8em);
      color: var(--muted);
    }
    .names b {
      color: var(--text);
    }
    .right {
      text-align: right;
    }
  `,
})
export class PartnershipWidget extends WidgetBase<PartnershipProps> {
  protected readonly defaults: PartnershipProps = { showBar: true };

  protected readonly contrib = computed(() => this.match()?.partnership.contributions ?? [0, 0]);
  protected readonly names = computed(() => {
    const b = this.match()?.batters ?? [];
    return [b[0]?.name.split(' ').at(-1) ?? '', b[1]?.name.split(' ').at(-1) ?? ''];
  });
  /** each half of the bar scales by that batter's share; both halves sum to the full width */
  protected readonly share = computed(() => {
    const [a, b] = this.contrib();
    const total = a + b;
    if (!total) return [0.5, 0.5];
    // each span is half the bar wide, so scale = 2 × share
    return [Math.min(1, (a / total) * 2), Math.min(1, (b / total) * 2)];
  });
}
