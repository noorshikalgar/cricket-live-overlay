import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, untracked, viewChildren } from '@angular/core';
import { gsap } from '../../motion/gsap';
import { MarqueeDirective } from '../../motion/marquee.directive';
import { MotionService } from '../../motion/motion.service';
import { WidgetBase } from '../widget-base';

export interface PredictionsProps {
  title: string;
  session: string;
  showSession: boolean;
  total: string;
  showTotal: boolean;
  /** 'team0' / 'team1' pick a team (its name and colour); 'text' uses winnerText */
  winner: 'none' | 'team0' | 'team1' | 'text';
  winnerText: string;
  showWinner: boolean;
  thisOver: string;
  showThisOver: boolean;
  /** auto follows the box shape: wide strip → one row, otherwise a card */
  layout: 'auto' | 'card' | 'row';
}

interface Row {
  key: string;
  label: string;
  value: string;
  color: string | null;
}

/**
 * Match predictions the streamer types in: session, total runs, winner and
 * this over. Each line can be hidden; a value pops when it changes.
 */
@Component({
  selector: 'cos-predictions',
  imports: [MarqueeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pred" [class.row]="isRow()" [style.--fsz.px]="fontPx()">
      <div class="head">
        <span class="spark" aria-hidden="true">◆</span>
        <span class="title" cosMarquee>{{ titleText() }}</span>
      </div>
      <div class="rows">
        @for (r of rows(); track r.key) {
          <div class="line" [style.--team]="r.color">
            <span class="k">{{ r.label }}</span>
            <span class="v" #val cosMarquee [class.team]="!!r.color">
              @if (r.color) {
                <i class="sw"></i>
              }
              {{ r.value }}
            </span>
          </div>
        } @empty {
          @if (editing()) {
            <div class="line"><span class="k">{{ t('Match predictions') }}</span><span class="v">—</span></div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .pred {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: var(--radius);
      color: #fff;
      font-size: var(--fsz);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 40%),
        linear-gradient(135deg, #111827, #0b0f17);
      box-shadow:
        0 12px 32px rgba(0, 0, 0, 0.45),
        inset 0 0 0 1px rgba(255, 255, 255, 0.07);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    }
    .head {
      flex: none;
      display: flex;
      align-items: center;
      gap: 0.45em;
      padding: 0.35em 0.8em;
      background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000));
      color: #0b0f17;
      text-shadow: none;
      font-family: 'Barlow Condensed', var(--font);
      font-weight: 900;
      font-style: italic;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 1.05em;
    }
    .spark {
      font-size: 0.7em;
      font-style: normal;
    }
    .title {
      min-width: 0;
      flex: 1;
    }
    .rows {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      padding: 0.3em 0.8em 0.4em;
      min-height: 0;
    }
    .line {
      display: flex;
      align-items: baseline;
      gap: 0.8em;
      min-width: 0;
      padding: 0.15em 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }
    .line:last-child {
      border-bottom: 0;
    }
    .k {
      flex: none;
      width: 7.6em;
      white-space: nowrap;
      font-size: 0.72em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.7);
    }
    .v {
      flex: 1;
      min-width: 0;
      font-family: 'Barlow Condensed', var(--font);
      font-weight: 800;
      font-size: 1.1em;
      color: #facc15;
      display: inline-block;
      transform-origin: 0 50%;
    }
    .v.team {
      color: #fff;
    }
    .sw {
      display: inline-block;
      width: 0.55em;
      height: 0.55em;
      margin-right: 0.3em;
      border-radius: 2px;
      background: var(--team);
      box-shadow: 0 0 0.5em var(--team);
      vertical-align: 0.05em;
    }

    /* one strip: title block on the left, the lines side by side */
    .pred.row {
      flex-direction: row;
    }
    .row .head {
      flex: none;
      max-width: 30%;
      clip-path: polygon(0 0, 100% 0, calc(100% - 0.6em) 100%, 0 100%);
      padding-right: 1.2em;
    }
    .row .rows {
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 0;
      padding: 0 0.4em;
    }
    .row .line {
      flex: 0 1 auto;
      border-bottom: 0;
      padding: 0 0.9em;
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      align-items: center;
    }
    .row .line:first-child {
      border-left: 0;
    }
    .row .k {
      width: auto;
    }
  `,
})
export class PredictionsWidget extends WidgetBase<PredictionsProps> {
  protected readonly defaults: PredictionsProps = {
    title: '',
    session: '',
    showSession: true,
    total: '',
    showTotal: true,
    winner: 'none',
    winnerText: '',
    showWinner: true,
    thisOver: '',
    showThisOver: true,
    layout: 'auto',
  };
  private readonly motion = inject(MotionService);
  private readonly valueEls = viewChildren<ElementRef<HTMLElement>>('val');

  protected readonly titleText = computed(() => this.p().title.trim() || this.t('Match predictions'));

  protected readonly rows = computed<Row[]>(() => {
    const p = this.p();
    const m = this.match();
    const out: Row[] = [];
    if (p.showSession && p.session.trim()) out.push({ key: 'session', label: this.t('Session'), value: p.session.trim(), color: null });
    if (p.showTotal && p.total.trim()) out.push({ key: 'total', label: this.t('Total runs'), value: p.total.trim(), color: null });
    if (p.showWinner) {
      const team = p.winner === 'team0' ? m?.teams[0] : p.winner === 'team1' ? m?.teams[1] : null;
      const value = team ? team.name : p.winner === 'text' ? p.winnerText.trim() : '';
      if (value) out.push({ key: 'winner', label: this.t('Winner'), value, color: team?.primaryColor ?? null });
    }
    if (p.showThisOver && p.thisOver.trim()) out.push({ key: 'thisOver', label: this.t('This over'), value: p.thisOver.trim(), color: null });
    return out;
  });

  protected readonly isRow = computed(() => {
    const l = this.p().layout;
    if (l === 'row') return true;
    if (l === 'card') return false;
    const { w, h } = this.box();
    return w / Math.max(1, h) >= 6;
  });

  /** text size from the box: the card fits its lines, the strip fits its height */
  protected readonly fontPx = computed(() => {
    const { w, h } = this.box();
    const fs = this.style().fontScale;
    if (this.isRow()) return Math.max(14, Math.min(h * 0.36, w / 40)) * fs;
    // each line is about 1.75em tall (value text, padding, divider); the title bar about 1.9em
    const ems = Math.max(1, this.rows().length) * 1.75 + 1.9 + 0.7;
    return Math.max(14, Math.min(h / ems, w / 17)) * fs;
  });

  /** last shown value per line, to pop the ones that change */
  private readonly lastValues = new Map<string, string>();

  constructor() {
    super();
    effect(() => {
      const rows = this.rows();
      untracked(() => {
        const changed = rows.filter((r) => this.lastValues.has(r.key) && this.lastValues.get(r.key) !== r.value).map((r) => r.key);
        for (const r of rows) this.lastValues.set(r.key, r.value);
        if (!changed.length || this.motion.reduced()) return;
        queueMicrotask(() => {
          const els = this.valueEls().map((e) => e.nativeElement);
          for (const key of changed) {
            const el = els[rows.findIndex((r) => r.key === key)];
            if (!el) continue;
            gsap.fromTo(
              el,
              { scale: 1.35, color: '#ffffff' },
              { scale: 1, color: '', duration: this.motion.d(0.6), ease: 'back.out(2.5)', clearProps: 'color' },
            );
          }
        });
      });
    });
  }
}
