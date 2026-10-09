import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, untracked } from '@angular/core';
import type { BallChip } from '@cos/shared';
import { MotionService } from '../../motion/motion.service';
import { gsap } from '../../motion/gsap';
import { WidgetBase } from '../widget-base';

export interface ThisOverProps {
  chipStyle: 'filled' | 'outline';
  showLabel: boolean;
}

function chipClass(c: BallChip): string {
  switch (c.kind) {
    case 'four':
      return 'four';
    case 'six':
      return 'six';
    case 'wicket':
      return 'wicket';
    case 'wide':
    case 'noball':
    case 'bye':
      return 'extra';
    default:
      return '';
  }
}

@Component({
  selector: 'cos-this-over',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel over" [class.chips-outline]="p().chipStyle === 'outline'">
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (p().showLabel) {
        <span class="label">{{ t('This over') }}</span>
      }
      <div class="chips">
        @for (c of balls(); track $index) {
          <span [class]="'chip ' + cls(c)">{{ c.label }}</span>
        }
        <!-- one empty slot per legal ball still to come; wides and no-balls don't use a slot -->
        @for (s of slots(); track $index) {
          <span class="chip slot" aria-hidden="true"></span>
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
    .over {
      display: flex;
      align-items: center;
      gap: 0.6em;
      font-size: calc(var(--wh) * 0.4 * var(--fs));
      padding-top: 0;
      padding-bottom: 0;
    }
    .label {
      font-size: max(22px, 0.7em);
      white-space: nowrap;
    }
    .chips {
      display: flex;
      gap: 0.3em;
      align-items: center;
      overflow: hidden;
    }
    .chip {
      min-width: 1.6em;
      height: 1.6em;
      padding: 0 0.35em;
      font-size: max(22px, 0.92em);
      font-weight: 800;
    }
    .chip.slot {
      background: transparent;
      box-shadow: inset 0 0 0 2px var(--chip);
    }
  `,
})
export class ThisOverWidget extends WidgetBase<ThisOverProps> {
  protected readonly defaults: ThisOverProps = { chipStyle: 'filled', showLabel: true };
  protected readonly cls = chipClass;
  protected readonly balls = computed(() => this.match()?.thisOver ?? []);
  /** legal deliveries left in the over (6 minus bowled, extras excluded) */
  protected readonly slots = computed(() => {
    const legal = this.balls().filter((c) => c.kind !== 'wide' && c.kind !== 'noball').length;
    return Array.from({ length: Math.max(0, 6 - legal) });
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly motion = inject(MotionService);
  private lastCount = 0;

  constructor() {
    super();
    // pop the newest chip in: short scale + fade, nothing else moves
    effect(() => {
      const count = this.match()?.thisOver.length ?? 0;
      untracked(() => {
        const grew = count > this.lastCount && this.lastCount > 0;
        this.lastCount = count;
        if (!grew || this.motion.reduced()) return;
        queueMicrotask(() => {
          const all = this.host.querySelectorAll<HTMLElement>('.chips .chip:not(.slot)');
          const chip = all[all.length - 1];
          if (chip) gsap.fromTo(chip, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: this.motion.d(0.3), ease: 'back.out(2)' });
        });
      });
    });
  }
}
