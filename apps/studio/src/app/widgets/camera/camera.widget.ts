import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { WidgetBase } from '../widget-base';

export type CameraShape = 'rect' | 'rounded' | 'circle' | 'pill';

export interface CameraProps {
  shape: CameraShape;
  showPlate: boolean;
  label: string;
  sublabel: string;
  frameWidth: number;
}

/** Corner radius in px for a frame of w×h; shared by the widget and the mask export so they match. */
export function cameraRadiusPx(shape: CameraShape, w: number, h: number, themeRadius: number): number {
  const max = Math.min(w, h) / 2;
  switch (shape) {
    case 'rect':
      return 0;
    case 'rounded':
      return Math.min(themeRadius * 2, max);
    case 'circle':
    case 'pill':
      return max;
  }
}

/**
 * Draws only the frame and name plate. The inside stays fully transparent so
 * the OBS webcam source placed underneath shows through; the browser never
 * touches the camera.
 */
@Component({
  selector: 'cos-camera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame" [style.border-radius]="radius()" [style.border-width.px]="p().frameWidth">
      @if (editing()) {
        <div class="hint">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" /></svg>
          <span>Webcam shows through here</span>
        </div>
      }
    </div>
    @if (p().showPlate && (p().label || p().sublabel)) {
      <div class="plate" [class.round]="p().shape === 'circle'">
        <span class="name">{{ p().label }}</span>
        @if (p().sublabel) {
          <span class="role">{{ p().sublabel }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }
    .frame {
      position: absolute;
      inset: 0;
      border-style: solid;
      border-color: var(--accent);
      background: transparent;
      box-shadow: var(--shadow);
    }
    .hint {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: rgba(255, 255, 255, 0.55);
      font: 500 20px/1.2 Inter, sans-serif;
      border-radius: inherit;
      background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.04) 0 12px, transparent 12px 24px);
      text-align: center;
    }
    .hint svg {
      width: 30%;
      max-width: 160px;
      fill: rgba(255, 255, 255, 0.25);
    }
    .plate {
      position: absolute;
      left: calc(var(--pad) * -0.5);
      bottom: calc(var(--pad) * 1);
      display: flex;
      align-items: baseline;
      gap: 0.6em;
      padding: 0.35em 0.9em;
      background: var(--bg);
      -webkit-backdrop-filter: blur(var(--blur));
      backdrop-filter: blur(var(--blur));
      border-radius: var(--chip-radius);
      border-left: 4px solid var(--accent);
      box-shadow: var(--shadow);
      font-size: calc(26px * var(--fs));
      white-space: nowrap;
      max-width: calc(100% + var(--pad));
    }
    .plate.round {
      left: 50%;
      bottom: 0;
      transform: translate(-50%, 40%);
    }
    .name {
      font-weight: 700;
    }
    .role {
      color: var(--muted);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: max(22px, 0.8em);
    }
  `,
})
export class CameraWidget extends WidgetBase<CameraProps> {
  protected readonly defaults: CameraProps = {
    shape: 'rounded',
    showPlate: true,
    label: 'Your Name',
    sublabel: 'Commentary',
    frameWidth: 4,
  };

  protected readonly radius = computed(() => {
    switch (this.p().shape) {
      case 'rect':
        return '0px';
      case 'circle':
        return '50%';
      case 'pill':
        return '9999px'; // the browser clamps to half the shorter side, same as cameraRadiusPx
      default:
        return `${this.style().radius * 2}px`;
    }
  });
}
