import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { WidgetBase } from '../widget-base';

export interface MatchInfoProps {
  lines: Record<string, boolean>;
}

@Component({
  selector: 'cos-match-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel box">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (match(); as m) {
        <div class="teams">
          <span class="dot" [style.background]="m.teams[0].primaryColor"></span>
          <span class="ellipsis">{{ teamLabels()[0] }}</span>
          <span class="vs label">vs</span>
          <span class="dot" [style.background]="m.teams[1].primaryColor"></span>
          <span class="ellipsis">{{ teamLabels()[1] }}</span>
        </div>
        @for (l of lines(); track l.key) {
          <div class="line" [class.status]="l.key === 'status'">
            <span class="label k">{{ l.label }}</span>
            <span class="ellipsis v">{{ l.value }}</span>
          </div>
        }
      } @else {
        <span class="empty-dash">Match info —</span>
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
      gap: 0.35em;
      font-size: calc(var(--wh) * 0.13 * var(--fs));
    }
    .teams {
      display: flex;
      align-items: center;
      gap: 0.4em;
      font-weight: 700;
      font-size: 1.15em;
      margin-bottom: 0.15em;
    }
    .dot {
      width: 0.5em;
      height: 0.5em;
      border-radius: 2px;
      flex: none;
    }
    .vs {
      font-size: max(22px, 0.7em);
      margin: 0 0.2em;
    }
    .line {
      display: flex;
      gap: 0.8em;
      align-items: baseline;
      font-size: max(22px, 0.9em);
    }
    .k {
      width: 4.4em;
      flex: none;
      font-size: max(22px, 0.75em);
    }
    .status .v {
      color: var(--accent);
      font-weight: 600;
    }
  `,
})
export class MatchInfoWidget extends WidgetBase<MatchInfoProps> {
  private readonly fontPx = computed(() => this.box().h * 0.13 * 1.15 * this.style().fontScale);

  protected readonly defaults: MatchInfoProps = { lines: { series: true, venue: true, toss: true, status: true } };

  /** full names when they fit the box, short codes when they would be cut off */
  protected readonly teamLabels = computed(() => {
    const m = this.match();
    if (!m) return ['', ''];
    const [a, b] = m.teams;
    const charsThatFit = this.box().w / (this.fontPx() * 0.62);
    return a.name.length + b.name.length + 6 > charsThatFit ? [a.shortCode, b.shortCode] : [a.name, b.name];
  });

  protected readonly lines = computed(() => {
    const m = this.match();
    if (!m) return [];
    const on = this.p().lines;
    const all = [
      { key: 'series', label: 'Series', value: m.series },
      { key: 'venue', label: 'Venue', value: m.venue },
      { key: 'toss', label: 'Toss', value: m.toss },
      { key: 'status', label: 'Status', value: m.statusText },
    ];
    return all.filter((l) => on[l.key] !== false && l.value);
  });
}
