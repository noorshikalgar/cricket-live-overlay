import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { WidgetBase } from '../widget-base';

export interface RecentOversProps {
  mode: 'bars' | 'numbers';
}

@Component({
  selector: 'cos-recent-overs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel box">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      <div class="head">
        <span class="label">Last {{ overs().length || 6 }} overs</span>
        <span class="num total">{{ total() }}</span>
      </div>
      @if (p().mode === 'bars') {
        <div class="bars">
          @for (o of overs(); track $index) {
            <div class="col">
              <span class="num v">{{ o }}</span>
              <span class="bar" [style.transform]="'scaleY(' + o / max() + ')'"></span>
            </div>
          } @empty {
            <span class="empty-dash">—</span>
          }
        </div>
      } @else {
        <div class="nums">
          @for (o of overs(); track $index) {
            <span class="chip">{{ o }}</span>
          } @empty {
            <span class="empty-dash">—</span>
          }
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
      gap: 0.3em;
      font-size: calc(var(--wh) * 0.14 * var(--fs));
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .head .label {
      font-size: max(22px, 0.85em);
    }
    .total {
      font-size: 1.1em;
    }
    .bars {
      flex: 1;
      display: flex;
      gap: 0.5em;
      align-items: flex-end;
      min-height: 0;
    }
    .col {
      flex: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center;
      gap: 0.15em;
    }
    .v {
      font-size: max(22px, 0.8em);
    }
    .bar {
      width: 100%;
      flex: 1;
      max-height: 70%;
      background: var(--accent);
      border-radius: var(--chip-radius) var(--chip-radius) 2px 2px;
      transform-origin: bottom;
      transition: transform 0.5s var(--ease-out);
    }
    .nums {
      flex: 1;
      display: flex;
      gap: 0.4em;
      align-items: center;
    }
    .nums .chip {
      flex: 1;
      height: 1.9em;
      font-size: max(22px, 1em);
    }
  `,
})
export class RecentOversWidget extends WidgetBase<RecentOversProps> {
  protected readonly defaults: RecentOversProps = { mode: 'bars' };
  protected readonly overs = computed(() => this.match()?.recentOvers ?? []);
  protected readonly max = computed(() => Math.max(12, ...this.overs()));
  protected readonly total = computed(() => this.overs().reduce((a, b) => a + b, 0));
}
