import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
  readonly scene = input.required<Scene>();
  readonly match = input<MatchState | null>(null);
  readonly teamColor = input<string | null>(null);
  readonly mode = input<'output' | 'editor'>('output');
  /** a card's content height changed (editor only) */
  readonly heightChange = output<{ id: string; h: number; minimized: boolean }>();
}
