import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { CardInnings, MatchState, OverPoint, Team } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { OdometerDirective } from '../../motion/odometer.directive';
import { FitDirective } from '../../motion/fit.directive';
import { WidgetBase } from '../widget-base';

export type CompareRow = 'stage' | 'powerplay' | 'middle' | 'death' | 'early' | 'last6' | 'boundaries' | 'runRate';

export const COMPARE_ROWS: { value: CompareRow; label: string }[] = [
  { value: 'stage', label: 'At this stage (same overs)' },
  { value: 'powerplay', label: 'Powerplay runs' },
  { value: 'middle', label: 'Middle overs runs' },
  { value: 'death', label: 'Death overs runs' },
  { value: 'early', label: 'Wickets in the first overs' },
  { value: 'last6', label: 'Last 6 overs' },
  { value: 'boundaries', label: 'Fours and sixes' },
  { value: 'runRate', label: 'Run rate' },
];

export interface CompareProps {
  rows: Record<string, boolean>;
  /** "wickets in the first N overs" */
  earlyOvers: number;
  title: string;
}

interface Side {
  text: string;
  /** for the comparison bar; null = nothing to compare */
  value: number | null;
  /** last-6-overs row: runs per over */
  bars?: number[];
}

interface Row {
  key: CompareRow;
  label: string;
  a: Side | null;
  b: Side | null;
}

/** phase boundaries by format, as [from, to] overs */
const PHASES: Record<string, { powerplay: [number, number]; middle: [number, number]; death: [number, number] }> = {
  T20: { powerplay: [1, 6], middle: [7, 15], death: [16, 20] },
  ODI: { powerplay: [1, 10], middle: [11, 40], death: [41, 50] },
};

const toBalls = (overs: string) => {
  const [o, b] = overs.split('.').map((x) => Number(x) || 0);
  return o * 6 + b;
};

/** score at the end of over n (n = 0 → 0/0); null when that over wasn't seen */
function scoreAt(h: OverPoint[], n: number): { runs: number; wkts: number } | null {
  if (n <= 0) return { runs: 0, wkts: 0 };
  const p = h.find((x) => x.over === n);
  return p ? { runs: p.total, wkts: p.totalWickets } : null;
}

/** runs and wickets in overs a..b; null unless every over is known (or the two end scores are) */
function phase(h: OverPoint[], a: number, b: number): { runs: number; wkts: number } | null {
  const end = scoreAt(h, b);
  const start = scoreAt(h, a - 1);
  if (end && start) return { runs: end.runs - start.runs, wkts: end.wkts - start.wkts };
  const overs = h.filter((p) => p.over >= a && p.over <= b);
  if (overs.length !== b - a + 1) return null;
  return { runs: overs.reduce((s, p) => s + p.runs, 0), wkts: overs.reduce((s, p) => s + p.wickets, 0) };
}

/**
 * Head-to-head of the two innings: at this stage, powerplay, middle and death
 * overs, early wickets, last six overs, boundaries and run rate, each with a
 * split bar in the team colours.
 */
@Component({
  selector: 'cos-compare',
  imports: [FitDirective, OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sides(); as tm) {
      <div class="cmp" cosFit [style.--a]="tm[0]?.primaryColor ?? '#64748b'" [style.--b]="tm[1]?.primaryColor ?? '#64748b'" [style.--fsz.px]="fontPx()">
        <div class="head">
          <span class="team a"><i></i>{{ tm[0]?.shortCode ?? '—' }}</span>
          <span class="title">{{ titleText() }}</span>
          <span class="team b">{{ tm[1]?.shortCode ?? '—' }}<i></i></span>
        </div>
        <div class="rows">
          @for (r of rows(); track r.key) {
            <div class="row">
              <div class="vals">
                <span class="v a" [cosOdo]="r.a?.text ?? '—'"></span>
                <span class="k">{{ r.label }}</span>
                <span class="v b" [cosOdo]="r.b?.text ?? '—'"></span>
              </div>
              @if (r.key === 'last6') {
                <div class="spark">
                  <span class="mini a">
                    @for (x of r.a?.bars ?? []; track $index) {
                      <i [style.height.%]="barPct(x)"></i>
                    }
                  </span>
                  <span class="mini b">
                    @for (x of r.b?.bars ?? []; track $index) {
                      <i [style.height.%]="barPct(x)"></i>
                    }
                  </span>
                </div>
              } @else {
                <div class="bar" [class.empty]="share(r) === null">
                  <i class="a" [style.flex-grow]="share(r) ?? 1"></i>
                  <i class="b" [style.flex-grow]="share(r) === null ? 1 : 1 - share(r)!"></i>
                </div>
              }
            </div>
          } @empty {
            <div class="row"><div class="vals"><span class="k">{{ t('Innings compare') }}</span></div></div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .cmp {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--radius);
      color: #fff;
      font-size: calc(var(--fsz) * var(--fit, 1));
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.07), transparent 40%),
        linear-gradient(135deg, #111827, #0b0f17);
      box-shadow:
        0 12px 32px rgba(0, 0, 0, 0.45),
        inset 0 0 0 1px rgba(255, 255, 255, 0.07);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
      font-family: 'Barlow Condensed', var(--font);
    }
    .head {
      flex: none;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 0.3em 0.8em;
      background: linear-gradient(90deg, color-mix(in srgb, var(--a) 70%, #000), #0b0f17 50%, color-mix(in srgb, var(--b) 70%, #000));
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .title {
      font-size: 0.85em;
      opacity: 0.9;
      text-align: center;
      padding: 0 0.8em;
      white-space: nowrap;
    }
    .team {
      display: flex;
      align-items: center;
      gap: 0.35em;
      font-size: 1.1em;
    }
    .team.b {
      justify-content: flex-end;
    }
    .team i {
      width: 0.5em;
      height: 0.5em;
      border-radius: 2px;
    }
    .team.a i {
      background: var(--a);
    }
    .team.b i {
      background: var(--b);
    }
    .rows {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      padding: 0.25em 0.8em 0.45em;
      min-height: 0;
    }
    .vals {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: baseline;
      gap: 0.6em;
    }
    .v {
      font-weight: 900;
      font-style: italic;
      font-size: 1.15em;
      font-variant-numeric: tabular-nums;
    }
    .v.b {
      justify-self: end;
    }
    .k {
      font-size: 0.68em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.72);
      text-align: center;
      white-space: nowrap;
    }
    .bar {
      display: flex;
      gap: 2px;
      height: 0.22em;
      margin-top: 0.15em;
      border-radius: 99px;
      overflow: hidden;
    }
    .bar i {
      flex-basis: 0;
      transition: flex-grow 0.8s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .bar i.a {
      background: var(--a);
    }
    .bar i.b {
      background: var(--b);
    }
    .bar.empty i {
      background: rgba(255, 255, 255, 0.12);
    }
    .spark {
      display: flex;
      justify-content: space-between;
      height: 0.9em;
      margin-top: 0.1em;
    }
    .mini {
      display: flex;
      align-items: flex-end;
      gap: 0.12em;
      height: 100%;
    }
    .mini i {
      width: 0.45em;
      min-height: 2px;
      border-radius: 2px 2px 0 0;
    }
    .mini.a i {
      background: var(--a);
    }
    .mini.b i {
      background: var(--b);
    }
  `,
})
export class CompareWidget extends WidgetBase<CompareProps> {
  protected readonly defaults: CompareProps = {
    rows: { stage: true, powerplay: true, middle: false, death: false, early: true, last6: true, boundaries: true, runRate: true },
    earlyOvers: 5,
    title: '',
  };
  private readonly store = inject(LiveStore);

  protected readonly titleText = computed(() => this.p().title.trim() || this.t('Innings compare'));

  /** batting teams of the first and second innings */
  protected readonly sides = computed<[Team | undefined, Team | undefined] | null>(() => {
    const m = this.match();
    if (!m) return null;
    const first = m.innings[0]?.battingTeam ?? m.teams[0].shortCode;
    const a = m.teams.find((t) => t.shortCode === first);
    return [a, m.teams.find((t) => t !== a)];
  });

  protected readonly rows = computed<Row[]>(() => {
    const m = this.match();
    if (!m) return [];
    const on = this.p().rows;
    const hist = m.overHistory ?? [];
    const card = this.store.scorecard();
    const out: Row[] = [];
    const add = (key: CompareRow, label: string, f: (i: 0 | 1) => Side | null) => {
      if (on[key] === false) return;
      const a = f(0);
      const b = f(1);
      if (a || b) out.push({ key, label, a, b });
    };
    const inn = (i: 0 | 1) => m.innings[i] ?? null;
    const h = (i: 0 | 1) => hist[i] ?? [];
    const cardInn = (i: 0 | 1): CardInnings | undefined => card?.innings[i];
    const score = (s: { runs: number; wkts: number }) => `${s.runs}/${s.wkts}`;

    // at this stage: the first innings after as many overs as the chase has faced
    if (m.innings.length >= 2) {
      const n = Math.floor(toBalls(m.innings[1].overs) / 6);
      add('stage', this.i18n.tf('After {n} overs', { n }), (i) => {
        if (i === 1) {
          const now = scoreAt(h(1), n) ?? { runs: m.innings[1].runs, wkts: m.innings[1].wickets };
          return { text: score(now), value: now.runs };
        }
        // only the real score at the end of that over; unknown stays "—"
        const s = scoreAt(h(0), n);
        return s ? { text: score(s), value: s.runs } : null;
      });
    }

    const ph = PHASES[m.format];
    if (ph) {
      const phaseRow = (key: CompareRow, label: string, [a, b]: [number, number]) =>
        add(key, `${this.t(label)} (${a}–${b})`, (i) => {
          if (!inn(i)) return null;
          const p = phase(h(i), a, b);
          return p ? { text: score(p), value: p.runs } : null;
        });
      phaseRow('powerplay', 'Powerplay', ph.powerplay);
      phaseRow('middle', 'Middle overs', ph.middle);
      phaseRow('death', 'Death overs', ph.death);
    }

    // wickets in the first N overs: from the over history, else the scorecard's fall of wickets
    const n = Math.max(1, Math.round(Number(this.p().earlyOvers) || 5));
    add('early', this.i18n.tf('Wickets in first {n} overs', { n }), (i) => {
      if (!inn(i)) return null;
      const p = phase(h(i), 1, n);
      if (p) return { text: String(p.wkts), value: p.wkts };
      const fow = cardInn(i)?.fallOfWickets;
      if (!fow) return null;
      const w = fow.filter((f) => toBalls(f.over) <= n * 6).length;
      return { text: String(w), value: w };
    });

    add('last6', this.i18n.tf('Last {n} overs', { n: 6 }), (i) => {
      const last = h(i).slice(-6);
      if (!last.length) return null;
      const runs = last.reduce((s, p) => s + p.runs, 0);
      const wkts = last.reduce((s, p) => s + p.wickets, 0);
      return { text: `${runs}/${wkts}`, value: runs, bars: last.map((p) => p.runs) };
    });

    add('boundaries', `${this.t('4s')} · ${this.t('6s')}`, (i) => {
      const c = cardInn(i);
      if (!c) return null;
      const fours = c.batters.reduce((s, b) => s + b.fours, 0);
      const sixes = c.batters.reduce((s, b) => s + b.sixes, 0);
      return { text: `${fours} · ${sixes}`, value: fours * 4 + sixes * 6 };
    });

    add('runRate', this.t('Run rate'), (i) => {
      const x = inn(i);
      return x ? { text: x.runRate.toFixed(2), value: x.runRate } : null;
    });
    return out;
  });

  /** first team's share of the bar, 0–1; null when either side is missing */
  protected share(r: Row): number | null {
    const a = r.a?.value;
    const b = r.b?.value;
    if (a == null || b == null) return null;
    if (a + b === 0) return 0.5;
    // fewer wickets is better, but the bar shows how many each lost
    return a / (a + b);
  }

  protected barPct(runs: number): number {
    return Math.max(8, Math.min(100, (runs / 24) * 100));
  }

  protected readonly fontPx = computed(() => {
    const { w, h } = this.box();
    const rows = Math.max(1, this.rows().length);
    // a row is about 1.9em tall (values + bar), the header about 1.7em
    return Math.max(13, Math.min(h / (rows * 1.95 + 2.1), w / 18)) * this.style().fontScale;
  });
}
