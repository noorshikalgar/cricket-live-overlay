import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DEFAULT_BACKGROUND, type SceneBackground } from '@cos/shared';

/**
 * What sits behind the widgets. Rendered identically on the Output and in the
 * Studio canvas. Transparent renders nothing at all, so OBS sources below the
 * Browser Source show through (the Studio draws its checkerboard behind it).
 */
@Component({
  selector: 'cos-scene-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bg().kind !== 'transparent') {
      <div class="fill" [style]="fill()"></div>
      @if (bg().dim > 0) {
        <div class="dim" [style.opacity]="bg().dim"></div>
      }
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .fill,
    .dim {
      position: absolute;
      inset: 0;
    }
    .dim {
      background: #000;
    }
  `,
})
export class SceneBackgroundComponent {
  readonly background = input<SceneBackground | undefined>(undefined);

  protected readonly bg = computed(() => ({ ...DEFAULT_BACKGROUND, ...this.background() }));

  protected readonly fill = computed(() => ({ background: backgroundCss(this.bg()) }));
}

function backgroundCss(b: SceneBackground): string {
  switch (b.kind) {
    case 'pitch':
      return "#0d1a12 url('/sample-bg.svg') center / cover no-repeat";
    case 'color':
      return b.color;
    case 'gradient':
      return `linear-gradient(135deg, ${b.color}, ${b.color2})`;
    case 'image':
      return b.image ? `${b.color} url('${b.image}') center / cover no-repeat` : b.color;
    default:
      return 'transparent';
  }
}
