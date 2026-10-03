import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { LiveStore } from '../core/live.store';
import { WIDGET_REGISTRY } from './widget-registry';
import type { MatchState, Scene } from '@cos/shared';
import { WidgetHostComponent } from './widget-host.component';

/** Renders every widget of a scene at canvas coordinates. Used by both Output and the Studio canvas. */
@Component({
  selector: 'cos-scene-renderer',
  imports: [WidgetHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (w of scene().widgets; track w.id) {
      <cos-widget-host
        [widget]="w"
        [theme]="scene().theme"
        [match]="match()"
        [teamColor]="teamColor()"
        [mode]="mode()"
        (contentHeight)="heightChange.emit({ id: w.id, h: $event.h, minimized: $event.minimized })"
      />
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      width: 1920px;
      height: 1080px;
    }
  `,
})
export class SceneRendererComponent {
  constructor() {
    // let the store spot scenes made with widget types this page's code doesn't have
    const store = inject(LiveStore);
    if (!store.knownWidgetTypes) {
      store.knownWidgetTypes = new Set(Object.keys(WIDGET_REGISTRY));
      store.recheckWidgetTypes();
    }
  }

  readonly scene = input.required<Scene>();
  readonly match = input<MatchState | null>(null);
  readonly teamColor = input<string | null>(null);
  readonly mode = input<'output' | 'editor'>('output');
  /** a card's content height changed (editor only) */
  readonly heightChange = output<{ id: string; h: number; minimized: boolean }>();
}
