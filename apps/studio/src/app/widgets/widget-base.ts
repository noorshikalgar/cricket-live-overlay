import { Directive, computed, inject, input } from '@angular/core';
import type { MatchState, PropValue, ResolvedStyle } from '@cos/shared';
import { I18n } from '../core/i18n';

/**
 * Every widget extends this: the same inputs in the Studio canvas and the Output.
 * `P` is the widget's own props shape; values arrive as loose JSON from the scene.
 */
@Directive()
export abstract class WidgetBase<P extends object> {
  readonly match = input<MatchState | null>(null);
  readonly style = input.required<ResolvedStyle>();
  readonly props = input.required<Record<string, PropValue>>();
  /** widget size in canvas px, for layout decisions CSS can't make */
  readonly box = input<{ w: number; h: number }>({ w: 0, h: 0 });
  /** true inside the Studio canvas: show placeholders for things that are invisible on air */
  readonly editing = input(false);

  protected abstract readonly defaults: P;

  /** props merged over defaults, so older scenes missing a new prop still render */
  protected readonly p = computed<P>(() => ({ ...this.defaults, ...(this.props() as Partial<P>) }));

  protected readonly i18n = inject(I18n);
  /** overlay label in the chosen language (English key) */
  protected t(en: string): string {
    return this.i18n.t(en);
  }
}
