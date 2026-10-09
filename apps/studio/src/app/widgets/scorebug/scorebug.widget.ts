import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { battingTeam, currentInnings } from '@cos/shared';
import { OdometerDirective } from '../../motion/odometer.directive';
import { WidgetBase } from '../widget-base';

export interface ScorebugProps {
  layout: 'wide' | 'compact';
  showTeamColors: boolean;
  showRunRate: boolean;
  showChase: boolean;
  showLive: boolean;
}

@Component({
  selector: 'cos-scorebug',
  imports: [OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel flush bug" [class.compact]="p().layout === 'compact'">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (p().showTeamColors) {
        <div class="strip" [style.background]="team()?.primaryColor ?? 'var(--accent)'"></div>
      }
      <div class="seg team">
        <span class="code">{{ team()?.shortCode ?? '—' }}</span>
        @if (p().showLive && match()?.phase === 'live') {
          <span class="live-dot" aria-label="live"></span>
        }
      </div>
      <div class="seg score">
        <span class="num runs" [cosOdo]="inn()?.runs ?? '–'"></span>
        <span class="num slash">/</span>
        <span class="num wkts" [cosOdo]="inn()?.wickets ?? '–'"></span>
      </div>
      <div class="seg overs">
        <span class="num ov" [cosOdo]="inn()?.overs ?? '0.0'"></span>
        <span class="label">{{ t('ov') }}</span>
      </div>
      @if (p().layout === 'wide') {
        @if (p().showChase && match()?.target !== null && match()?.target !== undefined && match()?.phase !== 'break') {
          <div class="seg chase stack">
            <span class="line">
              @if (i18n.lang() === 'mr') {
                <!-- Marathi word order: 12 चेंडूंत 20 धावा -->
                <span class="num">{{ match()?.ballsRemaining }}</span>
                <span class="label">चेंडूंत</span>
                <span class="num">{{ need() }}</span>
                <span class="label">धावा</span>
              } @else {
                <span class="label">Need</span>
                <span class="num">{{ need() }}</span>
                <span class="label">off</span>
                <span class="num">{{ match()?.ballsRemaining }}</span>
              }
            </span>
            <span class="line sub">
              @if (match()?.requiredRunRate !== null) {
                <span class="label">{{ t('RRR') }}</span>
                <span class="num">{{ match()?.requiredRunRate?.toFixed(2) }}</span>
              }
              <span class="label">{{ t('CRR') }}</span>
              <span class="num">{{ (inn()?.runRate ?? 0).toFixed(2) }}</span>
            </span>
          </div>
        } @else if (p().showRunRate) {
          <div class="seg rate">
            <span class="label">{{ t('CRR') }}</span>
            <span class="num" [cosOdo]="(inn()?.runRate ?? 0).toFixed(2)"></span>
            @if (match()?.target) {
              <span class="label rr">{{ t('Target') }}</span>
              <span class="num">{{ match()?.target }}</span>
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .bug {
      display: flex;
      align-items: stretch;
      font-size: calc(var(--wh) * 0.3 * var(--fs));
    }
    .strip {
      width: max(6px, calc(var(--wh) * 0.07));
      flex: none;
    }
    .seg {
      display: flex;
      align-items: center;
      gap: 0.3em;
      padding: 0 0.7em;
      white-space: nowrap;
    }
    .seg + .seg {
      box-shadow: inset 1px 0 0 var(--chip);
    }
    .team .code {
      font-weight: 700;
      letter-spacing: 0.04em;
      font-size: 1.08em;
    }
    .team .live-dot {
      font-size: 0.6em;
    }
    .score {
      font-size: 1.5em;
      gap: 0.06em;
    }
    .slash {
      color: var(--muted);
      font-weight: 500;
    }
    .overs .label,
    .seg .label {
      font-size: max(22px, 0.72em);
    }
    .overs .ov {
      font-size: 1em;
    }
    .chase,
    .rate {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    /* accent tint without color-mix(), which older OBS browser sources lack */
    .chase::before,
    .rate::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--accent);
      opacity: 0.16;
    }
    .chase > *,
    .rate > * {
      position: relative;
    }
    .rr {
      margin-left: 0.5em;
    }
    .stack {
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 0.1em;
      font-size: 0.85em;
    }
    .stack .line {
      display: flex;
      align-items: baseline;
      gap: 0.3em;
    }
    .stack .sub {
      color: var(--muted);
    }
    .stack .sub .num {
      color: var(--text);
      margin-right: 0.4em;
    }
    .compact .seg {
      padding: 0 0.5em;
    }
  `,
})
export class ScorebugWidget extends WidgetBase<ScorebugProps> {
  protected readonly defaults: ScorebugProps = {
    layout: 'wide',
    showTeamColors: true,
    showRunRate: true,
    showChase: true,
    showLive: true,
  };

  protected readonly inn = computed(() => {
    const m = this.match();
    return m ? currentInnings(m) : null;
  });
  protected readonly team = computed(() => {
    const m = this.match();
    return m ? battingTeam(m) : null;
  });
  protected readonly need = computed(() => {
    const m = this.match();
    const inn = this.inn();
    return m?.target != null && inn ? Math.max(0, m.target - inn.runs) : null;
  });
}
