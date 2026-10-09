import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { CardInnings } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

export interface ScorecardProps {
  /** 'current' or an innings number as a string ('1', '2', …) */
  innings: string;
  showBatting: boolean;
  showBowling: boolean;
  showYetToBat: boolean;
  showFow: boolean;
  /** how-out text: its own column, a small line under the name, or hidden */
  dismissal: 'column' | 'under' | 'hidden';
  minimized: boolean;
  /** 'window' = floating card with a title bar in the Studio; 'widget' = plain fixed widget */
  display: 'window' | 'widget';
}

const ORDINAL = ['1st', '2nd', '3rd', '4th'];

/** Full batting and bowling card for one innings, like a TV scorecard break. */
@Component({
  selector: 'cos-scorecard',
  host: { '[style.--u.px]': 'unit()' },
  imports: [MarqueeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel card" [class.minimized]="min()" [style.--team]="teamColor()">
      <div class="card-head">
        <span class="card-title">{{ inn()?.teamName || t('Scorecard') }}</span>
        @if (inn()) {
          <span class="card-sub">{{ t(ordinal() + ' innings') }}</span>
          <span class="card-score">{{ inn()!.runs }}/{{ inn()!.wickets }} <span class="muted">({{ inn()!.overs }})</span></span>
        }
      </div>
      @if (!min()) {
        @if (inn(); as i) {
          <div class="card-body sc">
            <div class="cols" [class.single]="!p().showBatting || !p().showBowling">
              @if (p().showBatting) {
                <table class="tbl bat" [class]="'tbl bat dis-' + dis()">
                  <thead>
                    <tr><th>{{ t('Batter') }}</th>@if (dis() === 'column') {<th></th>}<th>{{ t('R') }}</th><th>{{ t('B') }}</th><th>{{ t('4s') }}</th><th>{{ t('6s') }}</th><th>{{ t('SR') }}</th></tr>
                  </thead>
                  <tbody>
                    @for (b of i.batters; track b.name) {
                      <tr [class.live]="b.status === 'batting'">
                        <td class="name">
                          <div cosMarquee>
                            {{ b.name }}@if (b.captain) {<span class="tag-mini">{{ t('C') }}</span>}@if (b.keeper) {<span class="tag-mini">{{ t('WK') }}</span>}
                          </div>
                          @if (dis() === 'under') {
                            <div class="how muted" cosMarquee>{{ b.status === 'batting' ? t('batting') : i18n.dismissal(b.dismissal) }}</div>
                          }
                        </td>
                        @if (dis() === 'column') {
                          <td class="dis muted" cosMarquee>{{ b.status === 'batting' ? t('batting') : i18n.dismissal(b.dismissal) }}</td>
                        }
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
                    <tr><th>{{ t('Bowler') }}</th><th>{{ t('O') }}</th><th>{{ t('M') }}</th><th>{{ t('R') }}</th><th>{{ t('W') }}</th><th>{{ t('Econ') }}</th></tr>
                  </thead>
                  <tbody>
                    @for (b of i.bowlers; track b.name) {
                      <tr>
                        <td class="name" cosMarquee>{{ b.name }}</td>
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
                <span class="k">{{ t('Extras') }}</span>
                <span>
                  <b>{{ i.extras.total }}</b>
                  <span class="muted"> ({{ t('b') }} {{ i.extras.byes }}, {{ t('lb') }} {{ i.extras.legByes }}, {{ t('w') }} {{ i.extras.wides }}, {{ t('nb') }} {{ i.extras.noBalls }})</span>
                </span>
                <span class="k total-k">{{ t('Total') }}</span>
                <span><b>{{ i.runs }}/{{ i.wickets }}</b> <span class="muted">({{ i.overs }} {{ t('ov') }}, {{ t('RR') }} {{ i.runRate.toFixed(2) }})</span></span>
              </div>
              @if (p().showYetToBat && i.yetToBat.length) {
                <div class="line"><span class="k">{{ t('Yet to bat') }}</span><span class="ellipsis">{{ i.yetToBat.join(' · ') }}</span></div>
              }
              @if (p().showFow && i.fallOfWickets.length) {
                <div class="line">
                  <span class="k">{{ t('Fall of wkts') }}</span>
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
      /* --u is set from code: measured so the card fills the box (see fit()) */
    }
    .sc {
      flex: 1;
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
    .bat.dis-under td.name,
    .bat.dis-hidden td.name {
      width: 46%;
    }
    .how {
      font-size: 0.68em;
      font-weight: 400;
      line-height: 1.15;
    }
    .bowl td.name {
      width: 42%;
    }
    .foot {
      flex: none;
      /* any height left after the width cap goes between the tables and the footer */
      margin-top: auto;
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
    dismissal: 'column',
  };
  /** minimising only applies to floating windows */
  protected readonly dis = computed(() => this.p().dismissal ?? 'column');
  protected readonly min = computed(() => this.p().minimized && this.p().display !== 'widget');
  private readonly store = inject(LiveStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /**
   * Text size in px. The number of rows changes through an innings, so instead of a
   * fixed formula the card measures its content and scales the text until it fills
   * the box height, capped by the width so wide boxes don't get huge text.
   */
  protected readonly unit = signal(22);
  private fitQueued = false;

  constructor() {
    super();
    const ro = new ResizeObserver(() => this.queueFit());
    afterNextRender(() => ro.observe(this.host));
    inject(DestroyRef).onDestroy(() => ro.disconnect());
    effect(() => {
      // refit whenever the content or settings change
      this.inn();
      this.p();
      untracked(() => this.queueFit());
    });
  }

  private queueFit(): void {
    if (this.fitQueued) return;
    this.fitQueued = true;
    setTimeout(() => {
      this.fitQueued = false;
      this.fit();
    });
  }

  private fit(): void {
    const card = this.host.querySelector<HTMLElement>('.card');
    const boxH = this.host.clientHeight;
    const boxW = this.host.clientWidth;
    if (!card || !boxH || !boxW || this.min()) return;
    let u = this.unit();
    // content height is (almost) linear in --u; two passes absorb the fixed px parts
    for (let i = 0; i < 3; i++) {
      card.style.height = 'auto';
      const natural = card.offsetHeight;
      card.style.height = '';
      if (!natural) return;
      const next = Math.max(10, Math.min(boxW * 0.03, (u * boxH) / natural));
      if (Math.abs(next - u) < 0.25) break;
      u = next;
      this.host.style.setProperty('--u', `${u}px`);
    }
    this.unit.set(Math.floor(u * 4) / 4);
  }

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
