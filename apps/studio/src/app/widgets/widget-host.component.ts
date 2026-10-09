import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { hexToRgba, resolveStyle, type MatchState, type ThemeId, type WidgetInstance } from '@cos/shared';
import { MotionService } from '../motion/motion.service';
import { WIDGET_REGISTRY } from './widget-registry';

const CARD_TYPES = new Set<string>(['scorecard', 'teamCard', 'playerCard']);

/**
 * Positions one widget on the 1920×1080 canvas, turns its resolved style into
 * CSS custom properties, and plays enter/exit motion when it is shown or hidden.
 */
@Component({
  selector: 'cos-widget-host',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'widget-host',
    '[class.editor-hidden]': "mode() === 'editor' && !widget().visible",
    '[attr.data-flip-id]': 'widget().id',
    '[style]': 'hostStyle()',
  },
  template: `<ng-container *ngComponentOutlet="component(); inputs: inputs()" />`,
  styles: `
    :host(.editor-hidden) {
      opacity: 0.25;
    }
  `,
})
export class WidgetHostComponent {
  readonly widget = input.required<WidgetInstance>();
  readonly theme = input<ThemeId>('night');
  readonly match = input<MatchState | null>(null);
  readonly teamColor = input<string | null>(null);
  readonly mode = input<'output' | 'editor'>('output');

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly motion = inject(MotionService);
  private shown: boolean | null = null;

  /** cards size their height to their content; the editor syncs the widget box to it */
  readonly contentHeight = output<{ h: number; minimized: boolean }>();

  protected readonly component = computed(() => WIDGET_REGISTRY[this.widget().type].component);
  protected readonly resolved = computed(() => resolveStyle(this.widget().style, this.theme(), this.teamColor()));

  private readonly box = computed(
    () => ({ w: this.widget().w, h: this.widget().h }),
    { equal: (a, b) => a.w === b.w && a.h === b.h },
  );

  protected readonly inputs = computed(() => ({
    match: this.match(),
    style: this.resolved(),
    props: this.widget().props,
    box: this.box(),
    editing: this.mode() === 'editor',
  }));

  protected readonly hostStyle = computed(() => {
    const w = this.widget();
    const s = this.resolved();
    return {
      left: `${w.x}px`,
      top: `${w.y}px`,
      width: `${w.w}px`,
      height: `${w.h}px`,
      'z-index': String(w.z),
      '--ww': `${w.w}px`,
      '--wh': `${w.h}px`,
      '--bg': hexToRgba(s.bg, s.bgOpacity),
      '--blur': `${s.blur}px`,
      '--text': s.text,
      '--muted': s.textMuted,
      '--accent': s.accent,
      '--chip': s.chipBg,
      '--c-four': s.four,
      '--c-six': s.six,
      '--c-wicket': s.wicket,
      '--font': `'${s.fontFamily}', Inter, Mukta, system-ui, sans-serif`,
      '--fs': String(s.fontScale),
      '--radius': `${s.radius}px`,
      '--chip-radius': `${Math.round(s.radius * 0.6)}px`,
      '--pad': `${s.padding}px`,
      '--border': s.border.width > 0 ? `${s.border.width}px solid ${s.border.color}` : '0 solid transparent',
      '--shadow': s.shadow === 'soft' ? '0 10px 30px rgba(0, 0, 0, 0.38)' : 'none',
      // a dark lift behind light text only; dark text on a light theme stays crisp
      '--text-shadow': isLight(s.text) ? '0 1px 2px rgba(0, 0, 0, 0.35)' : 'none',
    };
  });

  constructor() {
    afterNextRender(() => this.reportHeight());
    inject(DestroyRef).onDestroy(() => this.ro.disconnect());
    effect(() => {
      // re-measure after any change to the widget (props such as minimized, size, style)
      this.widget();
      this.match();
      queueMicrotask(() => this.reportHeight());
    });
    effect(() => {
      const visible = this.widget().visible;
      const mode = this.mode();
      untracked(() => this.applyVisibility(visible, mode));
    });
  }

  private readonly ro = new ResizeObserver(() => this.reportHeight());
  private observed: HTMLElement | null = null;

  private reportHeight(): void {
    const w = untracked(() => this.widget());
    if (untracked(() => this.mode()) !== 'editor' || !CARD_TYPES.has(w.type)) return;
    const card = this.el.querySelector<HTMLElement>('.card');
    if (!card) return;
    if (card !== this.observed) {
      if (this.observed) this.ro.unobserve(this.observed);
      this.ro.observe(card);
      this.observed = card;
    }
    const h = Math.round(card.offsetHeight);
    if (h > 24) this.contentHeight.emit({ h, minimized: w.props['minimized'] === true });
  }

  private applyVisibility(visible: boolean, mode: 'output' | 'editor'): void {
    const prev = this.shown;
    this.shown = visible;
    if (mode === 'editor') {
      this.el.style.visibility = '';
      return;
    }
    const anim = this.widget().animation;
    if (visible && prev !== true) {
      this.motion.enter(this.el, anim.enter, prev === null ? anim.delay : 0);
    } else if (!visible && prev === true) {
      void this.motion.exit(this.el, anim.exit);
    } else if (!visible && prev === null) {
      this.el.style.visibility = 'hidden';
    }
  }
}

/** true for light colours (#rgb / #rrggbb), by perceived brightness */
function isLight(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}
