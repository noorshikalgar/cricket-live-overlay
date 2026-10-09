import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

type Layout = 'stack' | 'grid' | 'row';

export interface MatchInfoProps {
  lines: Record<string, boolean>;
  /** auto picks from the box shape: wide strip → row, wide box → grid, tall → stack */
  layout: 'auto' | Layout;
  /** where the SERIES / VENUE labels go */
  labels: 'side' | 'above' | 'hidden';
  align: 'left' | 'center';
  showTeams: boolean;
}

interface Line {
  key: string;
  label: string;
  value: string;
}

/** Teams, series, venue, toss and status, as a stacked list, a grid or a single row. */
@Component({
  selector: 'cos-match-info',
  imports: [MarqueeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="panel box"
      [class]="'panel box ' + layout() + ' lbl-' + p().labels + ' al-' + p().align"
      [style.--mi-fs.px]="fontPx()"
      [style.--mi-cols]="cols()"
    >
      @if (style().showTitle && style().title && layout() !== 'row') {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (match(); as m) {
        @if (p().showTeams) {
          <div class="teams">
            <span class="dot" [style.background]="m.teams[0].primaryColor"></span>
            <span class="ellipsis tn">{{ teamLabels()[0] }}</span>
            <span class="vs label">{{ t('vs') }}</span>
            <span class="dot" [style.background]="m.teams[1].primaryColor"></span>
            <span class="ellipsis tn">{{ teamLabels()[1] }}</span>
          </div>
        }
        <div class="lines">
          @for (l of lines(); track l.key) {
            <div class="line" [class.status]="l.key === 'status'">
              @if (p().labels !== 'hidden') {
                <span class="label k">{{ l.label }}</span>
              }
              <span class="ellipsis v">{{ l.value }}</span>
            </div>
          }
        </div>
      } @else {
        <span class="empty-dash">{{ t('Match info —') }}</span>
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
      font-size: var(--mi-fs);
      min-width: 0;
    }
    .teams {
      display: flex;
      align-items: center;
      gap: 0.4em;
      font-weight: 800;
      font-size: 1.15em;
      letter-spacing: -0.01em;
      min-width: 0;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    }
    .al-center .teams {
      justify-content: center;
    }
    .dot {
      width: 0.5em;
      height: 0.5em;
      border-radius: 2px;
      flex: none;
    }
    .tn {
      flex: 0 1 auto;
    }
    .vs {
      flex: none;
      font-size: 0.6em;
      margin: 0 0.2em;
    }
    .lines {
      display: flex;
      flex-direction: column;
      gap: 0.3em;
      min-width: 0;
    }
    .line {
      display: flex;
      gap: 0.8em;
      align-items: baseline;
      min-width: 0;
    }
    .k {
      flex: none;
      font-size: 0.72em;
      font-weight: 600;
    }
    .lbl-side .k {
      width: 5.6em;
    }
    .v {
      font-weight: 500;
      flex: 1 1 auto;
    }
    .status .v {
      color: var(--accent);
      font-weight: 700;
    }

    /* labels above the value */
    .lbl-above .line {
      flex-direction: column;
      align-items: stretch;
      gap: 0.05em;
    }
    .al-center .line {
      justify-content: center;
      text-align: center;
    }

    /* grid: lines flow into columns, status spans the full width */
    .grid .lines {
      display: grid;
      grid-template-columns: repeat(var(--mi-cols), minmax(0, 1fr));
      column-gap: 1.4em;
      row-gap: 0.35em;
    }
    .grid .line.status {
      grid-column: 1 / -1;
    }

    /* row: one strip, items separated by thin dividers */
    .row {
      flex-direction: row;
      align-items: center;
      gap: 0;
    }
    .row .teams {
      flex: 0 1 auto;
      font-size: 1.05em;
      padding-right: 0.9em;
    }
    .row .lines {
      flex-direction: row;
      align-items: center;
      flex: 1 1 0;
      gap: 0;
    }
    .row .line {
      /* each item takes its natural width and shrinks (then scrolls) when space runs out */
      flex: 0 1 auto;
      padding: 0 0.9em;
      border-left: 2px solid color-mix(in srgb, var(--fg) 18%, transparent);
    }
    .row .line.status {
      flex-grow: 1;
    }
    .row.lbl-side .k {
      width: auto;
    }
  `,
})
export class MatchInfoWidget extends WidgetBase<MatchInfoProps> {
  protected readonly defaults: MatchInfoProps = {
    lines: { series: true, venue: true, toss: true, status: true },
    layout: 'auto',
    labels: 'side',
    align: 'left',
    showTeams: true,
  };

  protected readonly lines = computed<Line[]>(() => {
    const m = this.match();
    if (!m) return [];
    const on = this.p().lines;
    const all = [
      { key: 'series', label: this.t('Series'), value: m.series },
      { key: 'venue', label: this.t('Venue'), value: m.venue },
      { key: 'toss', label: this.t('Toss'), value: this.i18n.apiText(m.toss) },
      { key: 'status', label: this.t('Status'), value: this.i18n.status(m) },
    ];
    return all.filter((l) => on[l.key] !== false && l.value);
  });

  /** the layout in use: auto follows the box shape so a resize re-flows it */
  protected readonly layout = computed<Layout>(() => {
    const l = this.p().layout;
    if (l && l !== 'auto') return l;
    const { w, h } = this.box();
    const ratio = w / Math.max(1, h);
    if (ratio >= 7) return 'row';
    if (ratio >= 3.6 && w >= 900) return 'grid';
    return 'stack';
  });

  protected readonly cols = computed(() => {
    const n = this.lines().filter((l) => l.key !== 'status').length;
    const w = this.box().w;
    const fit = w >= 1100 ? 3 : w >= 720 ? 2 : 1;
    return Math.max(1, Math.min(fit, n));
  });

  /** text rows the layout needs, used to size the font to the box height */
  private readonly rows = computed(() => {
    const layout = this.layout();
    const above = this.p().labels === 'above' ? 1.65 : 1;
    const teams = this.p().showTeams ? 1.25 : 0;
    const title = this.style().showTitle && this.style().title && layout !== 'row' ? 0.9 : 0;
    const lines = this.lines();
    if (layout === 'row') return above;
    if (layout === 'grid') {
      const plain = lines.filter((l) => l.key !== 'status').length;
      const status = lines.length - plain;
      return teams + title + (Math.ceil(plain / this.cols()) + status) * above;
    }
    return teams + title + lines.length * above;
  });

  protected readonly fontPx = computed(() => {
    const { w, h } = this.box();
    const row = this.layout() === 'row';
    const byHeight = row ? (h * 0.34) / (this.p().labels === 'above' ? 1.5 : 1) : (h * 0.86) / (Math.max(1, this.rows()) * 1.38);
    // keep roughly 22 characters per line visible in narrow boxes
    const byWidth = row ? w / 50 : w / 22;
    return Math.max(14, Math.min(byHeight, byWidth)) * this.style().fontScale;
  });

  /** full names when they fit the box, short codes when they would be cut off */
  protected readonly teamLabels = computed(() => {
    const m = this.match();
    if (!m) return ['', ''];
    const [a, b] = m.teams;
    const room = this.layout() === 'row' ? this.box().w * 0.3 : this.box().w;
    const charsThatFit = room / (this.fontPx() * 1.15 * 0.6);
    return a.name.length + b.name.length + 6 > charsThatFit ? [a.shortCode, b.shortCode] : [a.name, b.name];
  });
}
