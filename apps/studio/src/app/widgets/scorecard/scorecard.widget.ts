import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { CardInnings } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { WidgetBase } from '../widget-base';

export interface ScorecardProps {
  /** 'current' or an innings number as a string ('1', '2', …) */
  innings: string;
  showBatting: boolean;
  showBowling: boolean;
  showYetToBat: boolean;
  showFow: boolean;
  minimized: boolean;
  /** 'window' = floating card with a title bar in the Studio; 'widget' = plain fixed widget */
  display: 'window' | 'widget';
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/** Full batting and bowling card for one innings, like a TV scorecard break. */
@Component({
  selector: 'cos-scorecard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel card" [class.minimized]="min()" [style.--team]="teamColor()">
      <div class="card-head">
        <span class="card-title">{{ inn()?.teamName || 'Scorecard' }}</span>
        @if (inn()) {
          <span class="card-sub">{{ ordinal() }} innings</span>
          <span class="card-score">{{ inn()!.runs }}/{{ inn()!.wickets }} <span class="muted">({{ inn()!.overs }})</span></span>
        }
      </div>
      @if (!min()) {
        @if (inn(); as i) {
          <div class="card-body sc">
            <div class="cols" [class.single]="!p().showBatting || !p().showBowling">
              @if (p().showBatting) {
                <table class="tbl bat">
                  <thead>
                    <tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>
                  </thead>
                  <tbody>
                    @for (b of i.batters; track b.name) {
                      <tr [class.live]="b.status === 'batting'">
                        <td class="name">
                          {{ b.name }}@if (b.captain) {<span class="tag-mini">C</span>}@if (b.keeper) {<span class="tag-mini">WK</span>}
                        </td>
                        <td class="dis muted">{{ b.status === 'batting' ? 'batting' : b.dismissal }}</td>
                        <td class="big">{{ b.runs }}{{ b.status !== 'out' ? '*' : '' }}</td>
                        <td class="muted">{{ b.balls }}</td>
                        <td class="muted">{{ b.fours }}</td>
                        <td class="muted">{{ b.sixes }}</td>
                        <td class="muted">{{ b.strikeRate.toFixed(1) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
              @if (p().showBowling) {
                <table class="tbl bowl">
                  <thead>
                    <tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr>
                  </thead>
                  <tbody>
                    @for (b of i.bowlers; track b.name) {
                      <tr>
                        <td class="name">{{ b.name }}</td>
                        <td class="muted">{{ b.overs }}</td>
                        <td class="muted">{{ b.maidens }}</td>
                        <td>{{ b.runs }}</td>
                        <td class="big">{{ b.wickets }}</td>
                        <td class="muted">{{ b.economy.toFixed(2) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>
            <div class="foot">
              <div class="line">
                <span class="k">Extras</span>
                <span>
                  <b>{{ i.extras.total }}</b>
                  <span class="muted"> (b {{ i.extras.byes }}, lb {{ i.extras.legByes }}, w {{ i.extras.wides }}, nb {{ i.extras.noBalls }})</span>
                </span>
                <span class="k total-k">Total</span>
                <span><b>{{ i.runs }}/{{ i.wickets }}</b> <span class="muted">({{ i.overs }} ov, RR {{ i.runRate.toFixed(2) }})</span></span>
              </div>
              @if (p().showYetToBat && i.yetToBat.length) {
                <div class="line"><span class="k">Yet to bat</span><span class="ellipsis">{{ i.yetToBat.join(' · ') }}</span></div>
              }
              @if (p().showFow && i.fallOfWickets.length) {
                <div class="line">
                  <span class="k">Fall of wkts</span>
                  <span class="ellipsis">{{ fow() }}</span>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="card-body"><div class="card-empty">{{ editing() ? 'Scorecard appears here once a match is selected (loads when on air or from the Cards panel).' : '' }}</div></div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      /* text fits whichever dimension is tighter, so width and height resize freely */
      --u: min(calc(var(--ww) * 0.018), calc(var(--wh) * 0.0285));
    }
    .sc {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
    }
    /* hug the content; the box height is the maximum */
    .card:not(.minimized) {
      height: 100%;
    }
    .cols {
      flex: none;
      min-height: 0;
      display: grid;
      grid-template-columns: 1.55fr 1fr;
      gap: 1.2em;
      align-items: start;
    }
    .cols.single {
      grid-template-columns: 1fr;
    }
    .bat td.name {
      width: 30%;
    }
    .bat td.dis {
      text-align: left;
      max-width: 0;
      width: 34%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.8em;
    }
    .bowl td.name {
      width: 42%;
    }
    .foot {
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 0.15em;
      border-top: 1px solid var(--chip);
      padding-top: 0.35em;
      font-size: 0.9em;
    }
    .line {
      display: flex;
      gap: 0.6em;
      align-items: baseline;
      min-width: 0;
      font-variant-numeric: tabular-nums;
    }
    .k {
      flex: none;
      width: 8.4em;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 0.78em;
      color: var(--muted);
      font-weight: 500;
    }
    .total-k {
      width: auto;
      margin-left: auto;
    }
  `,
})
export class ScorecardWidget extends WidgetBase<ScorecardProps> {
  protected readonly defaults: ScorecardProps = {
    innings: 'current',
    showBatting: true,
    showBowling: true,
    showYetToBat: true,
    showFow: true,
    minimized: false,
    display: 'window',
  };
  /** minimising only applies to floating windows */
  protected readonly min = computed(() => this.p().minimized && this.p().display !== 'widget');
  private readonly store = inject(LiveStore);

  private readonly index = computed(() => {
    const all = this.store.scorecard()?.innings ?? [];
    const want = this.p().innings;
    if (want === 'current' || !want) return all.length - 1;
    return Math.min(all.length - 1, Math.max(0, Number(want) - 1));
  });

  protected readonly inn = computed<CardInnings | null>(() => this.store.scorecard()?.innings[this.index()] ?? null);
  protected readonly ordinal = computed(() => ORDINAL[this.index()] ?? `${this.index() + 1}th`);
  protected readonly teamColor = computed(() => {
    const code = this.inn()?.team;
    const m = this.match();
    return m?.teams.find((t) => t.shortCode === code || t.name === this.inn()?.teamName)?.primaryColor ?? null;
  });
  protected readonly fow = computed(() =>
    (this.inn()?.fallOfWickets ?? []).map((f) => `${f.wicket}-${f.runs} (${f.player.split(' ').at(-1)}, ${f.over})`).join('  '),
  );
}
