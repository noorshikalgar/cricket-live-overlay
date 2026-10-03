import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OdometerDirective } from '../../motion/odometer.directive';
import { WidgetBase } from '../widget-base';

export interface BowlerProps {
  showEconomy: boolean;
  showMaidens: boolean;
}

@Component({
  selector: 'cos-bowler',
  imports: [OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel box">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (match()?.bowler; as b) {
        <div class="top">
          <span class="label">Bowling</span>
          <span class="name ellipsis">{{ b.name }}</span>
        </div>
        <div class="figs">
          <span class="num big"><span [cosOdo]="b.wickets"></span>-<span [cosOdo]="b.runs"></span></span>
          <span class="num ov">(<span [cosOdo]="b.overs"></span>)</span>
          @if (p().showMaidens) {
            <span class="label">M</span><span class="num">{{ b.maidens }}</span>
          }
          @if (p().showEconomy) {
            <span class="label econ">Econ</span><span class="num">{{ b.economy.toFixed(2) }}</span>
          }
        </div>
      } @else {
        <div class="top"><span class="empty-dash">Bowler —</span></div>
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
      font-size: calc(var(--wh) * 0.26 * var(--fs));
      padding-top: 0;
      padding-bottom: 0;
      line-height: 1.2;
    }
    .top,
    .figs {
      display: flex;
      align-items: baseline;
      gap: 0.4em;
      min-width: 0;
    }
    .top .label {
      font-size: max(22px, 0.72em);
    }
    .name {
      font-weight: 600;
    }
    .big {
      font-size: 1.05em;
    }
    .ov,
    .figs .num:not(.big) {
      color: var(--muted);
      font-weight: 500;
      font-size: max(22px, 0.8em);
    }
    .figs .label {
      font-size: max(22px, 0.7em);
    }
    .econ {
      margin-left: auto;
    }
  `,
})
export class BowlerWidget extends WidgetBase<BowlerProps> {
  protected readonly defaults: BowlerProps = { showEconomy: true, showMaidens: false };
}
