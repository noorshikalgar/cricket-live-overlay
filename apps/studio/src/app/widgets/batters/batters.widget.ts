import { ChangeDetectionStrategy, Component } from '@angular/core';
import { OdometerDirective } from '../../motion/odometer.directive';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

export interface BattersProps {
  showStrikeRate: boolean;
  showBoundaries: boolean;
}

@Component({
  selector: 'cos-batters',
  imports: [MarqueeDirective, OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel rows">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @for (b of match()?.batters ?? []; track b.name) {
        <div class="row" [class.on]="b.onStrike">
          <span class="mark" aria-hidden="true">{{ b.onStrike ? '▸' : '' }}</span>
          <span class="name ellipsis">{{ b.name }}</span>
          <span class="score">
            <span class="num runs" [cosOdo]="b.runs"></span>
            <span class="num balls">(<span [cosOdo]="b.balls"></span>)</span>
          </span>
          @if (p().showBoundaries) {
            <span class="extra num">{{ b.fours }}<i>×4</i> {{ b.sixes }}<i>×6</i></span>
          }
          @if (p().showStrikeRate) {
            <span class="extra num sr"><i>{{ t('SR') }}</i> {{ b.strikeRate.toFixed(0) }}</span>
          }
        </div>
      } @empty {
        <div class="row"><span class="empty-dash">Batters —</span></div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .rows {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.1em;
      font-size: calc(var(--wh) * 0.3 * var(--fs));
      padding-top: 0;
      padding-bottom: 0;
    }
    .row {
      display: flex;
      align-items: baseline;
      gap: 0.4em;
      line-height: 1.2;
      color: var(--muted);
    }
    .row.on {
      color: var(--text);
    }
    .mark {
      width: 0.7em;
      color: var(--accent);
      flex: none;
    }
    .name {
      flex: 1;
      font-weight: 600;
    }
    .score {
      display: flex;
      align-items: baseline;
      gap: 0.25em;
    }
    .runs {
      color: var(--text);
    }
    .balls {
      font-weight: 500;
      color: var(--muted);
      font-size: max(22px, 0.8em);
    }
    .extra {
      font-weight: 500;
      color: var(--muted);
      font-size: max(22px, 0.75em);
      min-width: 4.2em;
      text-align: right;
    }
    .extra i {
      font-style: normal;
      opacity: 0.7;
      font-size: 0.85em;
    }
    .sr {
      min-width: 3.4em;
    }
  `,
})
export class BattersWidget extends WidgetBase<BattersProps> {
  protected readonly defaults: BattersProps = { showStrikeRate: false, showBoundaries: true };
}
