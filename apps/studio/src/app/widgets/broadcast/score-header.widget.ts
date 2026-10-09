import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { MatchEvent, MatchEventType, Team } from '@cos/shared';
import { LiveStore } from '../../core/live.store';
import { gsap } from '../../motion/gsap';
import { MotionService } from '../../motion/motion.service';
import { OdometerDirective } from '../../motion/odometer.directive';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { WidgetBase } from '../widget-base';

export interface ScoreHeaderProps {
  /** shown in the centre between events, e.g. your channel name; empty = "VS" */
  centerText: string;
  /** flash FOUR / SIX / WICKET / OVER / milestones in the centre */
  showEvents: boolean;
}

interface Side {
  team: Team;
  score: string | null;
  line: string;
  hlLine: string;
}

const EVENT_WORD: Partial<Record<MatchEventType, string>> = {
  FOUR: 'FOUR',
  SIX: 'SIX',
  WICKET: 'WICKET',
  OVER_END: 'OVER',
  FIFTY: 'FIFTY',
  HUNDRED: 'CENTURY',
  MAIDEN: 'MAIDEN',
  DRS: 'DRS',
};

const EVENT_COLOR: Partial<Record<MatchEventType, string>> = {
  FOUR: 'var(--c-four)',
  SIX: 'var(--c-six)',
  WICKET: 'var(--c-wicket)',
};

/** Both teams' scores in big team-colour blocks, with a centre slot that flashes the moment. */
@Component({
  selector: 'cos-score-header',
  imports: [MarqueeDirective, OdometerDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sh">
      @for (s of sides(); track s.team.shortCode; let i = $index) {
        <div class="bc team" [class.right]="i === 1" [style.--team]="s.team.primaryColor">
          <div class="tname bc-word" cosMarquee>{{ s.team.name }}</div>
          @if (s.score) {
            <div class="bc-num score" [cosOdo]="s.score"></div>
          } @else {
            <div class="bc-word yet">{{ t('Yet to bat') }}</div>
          }
          <div class="line bc-word">{{ s.line }} <span class="bc-hl">{{ s.hlLine }}</span></div>
        </div>
        @if (i === 0) {
          <div class="center">
            <span class="word bc-word" #wordEl [style.--ev]="evColor()">{{ word() }}</span>
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
      --u: calc(var(--wh) / 100 * var(--fs));
    }
    .sh {
      height: 100%;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: calc(var(--u) * 3);
      align-items: stretch;
    }
    .team {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 calc(var(--u) * 6);
      min-width: 0;
    }
    .tname {
      font-size: calc(var(--u) * 16);
      opacity: 0.95;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    .score {
      font-size: calc(var(--u) * 52);
    }
    .yet {
      font-size: calc(var(--u) * 26);
      opacity: 0.75;
      padding: calc(var(--u) * 8) 0;
    }
    .line {
      font-size: calc(var(--u) * 15);
      white-space: nowrap;
    }
    .center {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 calc(var(--u) * 10);
      min-width: calc(var(--u) * 90);
      background: rgba(0, 0, 0, 0.82);
      border-radius: calc(var(--u) * 10);
      box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.08),
        0 10px 30px rgba(0, 0, 0, 0.4);
      overflow: hidden;
    }
    .word {
      font-size: calc(var(--u) * 40);
      color: #fff;
      white-space: nowrap;
    }
    .word.event {
      color: var(--ev, var(--accent));
      font-weight: 900;
      -webkit-text-stroke: calc(var(--u) * 0.6) #fff;
      paint-order: stroke fill;
    }
  `,
})
export class ScoreHeaderWidget extends WidgetBase<ScoreHeaderProps> {
  protected readonly defaults: ScoreHeaderProps = { centerText: '', showEvents: true };
  private readonly motion = inject(MotionService);
  private readonly wordEl = viewChild<ElementRef<HTMLElement>>('wordEl');

  private readonly event = signal<MatchEvent | null>(null);
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly word = computed(() => {
    const e = this.event();
    if (e) return this.t(EVENT_WORD[e.type] ?? e.title);
    return this.p().centerText || this.t('VS');
  });
  protected readonly evColor = computed(() => {
    const e = this.event();
    return e ? (EVENT_COLOR[e.type] ?? 'var(--accent)') : null;
  });

  protected readonly sides = computed<Side[]>(() => {
    const m = this.match();
    if (!m) return [];
    const max = m.format === 'ODI' ? 50 : m.format === 'T20' ? 20 : null;
    return m.teams.map((team) => {
      const inns = m.innings.filter((i) => i.battingTeam === team.shortCode);
      const cur = inns.at(-1);
      if (!cur) {
        return { team, score: null, line: m.target ? this.t('TARGET') : '', hlLine: m.target ? String(m.target) : '' };
      }
      const score = inns.map((i) => `${i.runs}/${i.wickets}`).join(' & ');
      const isCurrent = m.innings.at(-1) === cur;
      const need = m.target !== null && isCurrent ? m.target - cur.runs : null;
      if (need !== null && need > 0 && m.phase === 'live') return { team, score, line: this.t('NEED'), hlLine: `${need} ${this.t('RUNS')}` };
      return { team, score, line: this.t('OVERS'), hlLine: max && !isCurrent ? `${cur.overs} / ${max}` : cur.overs };
    });
  });

  constructor() {
    super();
    inject(LiveStore)
      .events.pipe(takeUntilDestroyed())
      .subscribe((e) => this.onEvent(e));
    inject(DestroyRef).onDestroy(() => this.clearTimer && clearTimeout(this.clearTimer));
  }

  private onEvent(e: MatchEvent): void {
    if (!this.p().showEvents || !EVENT_WORD[e.type]) return;
    this.event.set(e);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => this.event.set(null), this.motion.d(3.2) * 1000);
    queueMicrotask(() => {
      const el = this.wordEl()?.nativeElement;
      if (!el) return;
      el.classList.add('event');
      setTimeout(() => el.classList.remove('event'), this.motion.d(3.2) * 1000);
      if (this.motion.reduced()) return;
      // punch in: big and blurred-fast, settle with a small overshoot
      gsap.fromTo(
        el,
        { scale: 2.4, opacity: 0, rotate: -6 },
        { scale: 1, opacity: 1, rotate: 0, duration: this.motion.d(0.45), ease: 'back.out(2.2)' },
      );
    });
  }
}
