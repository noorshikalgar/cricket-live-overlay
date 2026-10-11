import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { OverPoint, Team } from '@cos/shared';
import { WidgetBase } from '../widget-base';

export interface OverChartProps {
  /** worm = running total per over; manhattan = runs in each over */
  chart: 'worm' | 'manhattan';
  showWickets: boolean;
  title: string;
}

interface Series {
  team: Team | undefined;
  points: OverPoint[];
}

const H = 420;
const PAD = { l: 56, r: 18, t: 18, b: 42 };

/**
 * Over-by-over chart of both innings, drawn from the over history:
 * Worm (running total, wickets as dots) or Manhattan (runs per over).
 */
@Component({
  selector: 'cos-over-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="oc" [style.--fsz.px]="fontPx()">
      <div class="head">
        <span class="title">{{ titleText() }}</span>
        @for (s of series(); track $index) {
          <span class="key"><i [style.background]="s.team?.primaryColor ?? '#94a3b8'"></i>{{ s.team?.shortCode ?? '—' }}</span>
        }
      </div>
      <svg [attr.viewBox]="'0 0 ' + W() + ' ' + H" class="plot">
        <!-- grid -->
        @for (g of grid().y; track g.v) {
          <line [attr.x1]="PAD.l" [attr.x2]="W() - PAD.r" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
          <text [attr.x]="PAD.l - 10" [attr.y]="g.y + 7" class="ax" text-anchor="end">{{ g.v }}</text>
        }
        @for (g of grid().x; track g.v) {
          <text [attr.x]="g.x" [attr.y]="H - 12" class="ax" text-anchor="middle">{{ g.v }}</text>
        }

        @if (p().chart === 'manhattan') {
          @for (b of bars(); track b.key) {
            <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.fill]="b.color" rx="2" class="bar" />
            @if (p().showWickets && b.wickets) {
              @for (k of range(b.wickets); track k) {
                <circle [attr.cx]="b.x + b.w / 2" [attr.cy]="b.y - 9 - k * 15" r="6" class="wk" />
              }
            }
          }
        } @else {
          @for (l of worms(); track $index) {
            <path [attr.d]="l.d" [attr.stroke]="l.color" class="worm" />
            @if (p().showWickets) {
              @for (w of l.wickets; track $index) {
                <circle [attr.cx]="w.x" [attr.cy]="w.y" r="7" [attr.fill]="l.color" class="wk-dot" />
              }
            }
          }
        }
      </svg>
      @if (!hasData()) {
        <div class="empty">{{ t('Waiting for the first ball') }}</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .oc {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--radius);
      color: #fff;
      font-size: var(--fsz);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.07), transparent 40%),
        linear-gradient(135deg, #111827, #0b0f17);
      box-shadow:
        0 12px 32px rgba(0, 0, 0, 0.45),
        inset 0 0 0 1px rgba(255, 255, 255, 0.07);
      font-family: 'Barlow Condensed', var(--font);
    }
    .head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 1em;
      padding: 0.35em 0.8em;
      background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #0b0f17));
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .title {
      flex: 1;
      color: #0b0f17;
    }
    .key {
      display: flex;
      align-items: center;
      gap: 0.35em;
      font-size: 0.9em;
    }
    .key i {
      width: 0.9em;
      height: 0.3em;
      border-radius: 99px;
    }
    .plot {
      flex: 1;
      width: 100%;
      min-height: 0;
    }
    .grid {
      stroke: rgba(255, 255, 255, 0.08);
      stroke-width: 1.5;
    }
    .ax {
      fill: rgba(255, 255, 255, 0.55);
      font: 700 20px 'Barlow Condensed', sans-serif;
    }
    .worm {
      fill: none;
      stroke-width: 5;
      stroke-linejoin: round;
      stroke-linecap: round;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
    }
    .wk-dot {
      stroke: #fff;
      stroke-width: 2.5;
    }
    .wk {
      fill: #ef4444;
      stroke: #fff;
      stroke-width: 2;
    }
    .bar {
      opacity: 0.92;
    }
    .empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      font: 600 18px Inter, Mukta, sans-serif;
      opacity: 0.7;
    }
  `,
})
export class OverChartWidget extends WidgetBase<OverChartProps> {
  protected readonly defaults: OverChartProps = { chart: 'worm', showWickets: true, title: '' };
  /** chart width in its own units, from the widget's shape, so text and dots aren't stretched */
  protected readonly W = computed(() => {
    const { w, h } = this.box();
    const plotH = Math.max(1, h - this.fontPx() * 1.9);
    return Math.round((H * Math.max(1, w)) / plotH);
  });
  protected readonly H = H;
  protected readonly PAD = PAD;

  protected readonly titleText = computed(() => this.p().title.trim() || this.t(this.p().chart === 'manhattan' ? 'Runs per over' : 'Run worm'));

  protected readonly series = computed<Series[]>(() => {
    const m = this.match();
    if (!m) return [];
    return [0, 1].map((i) => ({
      team: m.teams.find((t) => t.shortCode === m.innings[i]?.battingTeam) ?? (i === 1 ? m.teams.find((t) => t.shortCode !== m.innings[0]?.battingTeam) : m.teams[0]),
      points: m.overHistory?.[i] ?? [],
    }));
  });

  protected readonly hasData = computed(() => this.series().some((s) => s.points.length > 0));

  /** overs on the x axis: the format's length, or as many as were played */
  private readonly maxOvers = computed(() => {
    const m = this.match();
    const played = Math.max(1, ...this.series().map((s) => s.points.at(-1)?.over ?? 0));
    return m?.format === 'T20' ? 20 : m?.format === 'ODI' ? 50 : played;
  });

  private readonly maxY = computed(() => {
    const vals = this.series().flatMap((s) => s.points.map((p) => (this.p().chart === 'manhattan' ? p.runs : p.total)));
    const top = Math.max(this.p().chart === 'manhattan' ? 12 : 60, ...vals);
    const step = this.p().chart === 'manhattan' ? 6 : top > 200 ? 50 : 25;
    return Math.ceil(top / step) * step;
  });

  private x(over: number): number {
    return PAD.l + ((this.W() - PAD.l - PAD.r) * over) / this.maxOvers();
  }

  private y(v: number): number {
    return H - PAD.b - ((H - PAD.t - PAD.b) * v) / this.maxY();
  }

  protected readonly grid = computed(() => {
    const top = this.maxY();
    const step = this.p().chart === 'manhattan' ? 6 : top > 200 ? 50 : 25;
    const y = [];
    for (let v = 0; v <= top; v += step) y.push({ v, y: this.y(v) });
    const n = this.maxOvers();
    const every = n > 20 ? 10 : 5;
    const x = [];
    for (let o = every; o <= n; o += every) x.push({ v: o, x: this.p().chart === 'manhattan' ? this.x(o - 0.5) : this.x(o) });
    return { y, x };
  });

  protected readonly worms = computed(() =>
    this.series().map((s) => {
      const pts = [{ over: 0, total: 0 }, ...s.points];
      return {
        color: s.team?.primaryColor ?? '#94a3b8',
        d: pts.map((p, i) => `${i ? 'L' : 'M'}${this.x(p.over).toFixed(1)},${this.y(p.total).toFixed(1)}`).join(' '),
        wickets: s.points.filter((p) => p.wickets > 0).map((p) => ({ x: this.x(p.over), y: this.y(p.total) })),
      };
    }),
  );

  protected readonly bars = computed(() => {
    const slot = (this.W() - PAD.l - PAD.r) / this.maxOvers();
    const bw = Math.max(2, slot * 0.38);
    return this.series().flatMap((s, i) =>
      s.points.map((p) => {
        const top = this.y(p.runs);
        return {
          key: `${i}:${p.over}`,
          x: this.x(p.over - 1) + slot * (i === 0 ? 0.1 : 0.52),
          y: top,
          w: bw,
          h: Math.max(1, H - PAD.b - top),
          color: s.team?.primaryColor ?? '#94a3b8',
          wickets: p.wickets,
        };
      }),
    );
  });

  protected range(n: number): number[] {
    return Array.from({ length: Math.min(n, 4) }, (_, i) => i);
  }

  protected readonly fontPx = computed(() => Math.max(14, Math.min(this.box().h * 0.075, this.box().w / 30)) * this.style().fontScale);
}
