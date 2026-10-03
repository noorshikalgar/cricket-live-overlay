import { Directive, computed, input } from '@angular/core';
import type { MatchState, PropValue, ResolvedStyle } from '@cos/shared';

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
}
