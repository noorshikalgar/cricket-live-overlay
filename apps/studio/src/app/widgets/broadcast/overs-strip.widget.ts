import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { BallChip } from '@cos/shared';
import { WidgetBase } from '../widget-base';

export interface OversStripProps {
  /** also show the previous over */
  showPrevious: boolean;
  /** text on the left, e.g. your channel name */
  label: string;
}

interface OverRow {
  title: string;
  balls: BallChip[];
  slotList: number[];
  total: number;
}

function cls(c: BallChip): string {
  if (c.kind === 'four' || c.kind === 'six' || c.kind === 'wicket') return c.kind;
  if (c.kind === 'wide' || c.kind === 'noball' || c.kind === 'bye') return 'extra';
  return '';
}

/** Ball-by-ball for the previous and current over, each with its total. */
@Component({
  selector: 'cos-overs-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bc dark os">
      @if (p().label) {
        <span class="lbl bc-word"><span class="live-dot"></span> {{ p().label }}</span>
      }
      @for (o of rows(); track o.title) {
        <div class="over">
          <span class="ot bc-word">{{ o.title }}</span>
          @for (c of o.balls; track $index) {
            <span [class]="'bc-chip ' + cls(c)">{{ c.label === '•' ? '0' : c.label }}</span>
          }
          @for (s of o.slotList; track $index) {
            <span class="bc-chip slot"></span>
          }
          <span class="tot bc-num">= <span class="bc-hl">{{ o.total }}</span></span>
        </div>
      } @empty {
        <span class="bc-word muted">Waiting for the first ball</span>
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
    .os {
      display: flex;
      align-items: center;
      gap: calc(var(--u) * 14);
      padding: 0 calc(var(--u) * 12);
      font-size: calc(var(--u) * 56);
    }
    .lbl {
      font-size: 0.62em;
      display: flex;
      align-items: center;
      gap: 0.4em;
      white-space: nowrap;
      margin-right: auto;
    }
    .over {
      display: flex;
      align-items: center;
      gap: 0.18em;
    }
    .ot {
      font-size: 0.4em;
      width: 2.8em;
      text-align: center;
      line-height: 1.05;
      opacity: 0.85;
    }
    .bc-chip {
      width: 1.3em;
      height: 1.3em;
      font-size: 0.9em;
    }
    .tot {
      margin-left: 0.25em;
      font-size: 0.95em;
    }
    .muted {
      font-size: 0.6em;
      opacity: 0.7;
    }
  `,
})
export class OversStripWidget extends WidgetBase<OversStripProps> {
  protected readonly defaults: OversStripProps = { showPrevious: true, label: '' };
  protected readonly cls = cls;

  protected readonly rows = computed<OverRow[]>(() => {
    const m = this.match();
    if (!m || !m.thisOver.length) return [];
    const legal = (b: BallChip[]) => b.filter((c) => c.kind !== 'wide' && c.kind !== 'noball').length;
    const out: OverRow[] = [];
    if (this.p().showPrevious && m.prevOver?.balls.length) {
      out.push({ title: `OVER ${m.prevOver.number}`, balls: m.prevOver.balls, slotList: [], total: m.prevOver.runs });
    }
    out.push({
      title: m.overNumber ? `OVER ${m.overNumber}` : 'THIS OVER',
      balls: m.thisOver,
      slotList: Array.from({ length: Math.max(0, 6 - legal(m.thisOver)) }, (_, i) => i),
      total: m.thisOver.reduce((a, c) => a + c.runs, 0),
    });
    return out;
  });
}
