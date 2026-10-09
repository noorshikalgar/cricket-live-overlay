import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WidgetBase } from '../widget-base';

export interface ImageProps {
  src: string;
  fit: 'contain' | 'cover';
  panel: boolean;
}

@Component({
  selector: 'cos-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box" [class.panel]="p().panel">
      @if (p().src) {
        <img [src]="p().src" alt="" [style.object-fit]="p().fit" draggable="false" />
      } @else if (editing()) {
        <div class="empty">▣ Upload a logo in settings</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .box {
      width: 100%;
      height: 100%;
    }
    img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .empty {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border: 2px dashed rgba(255, 255, 255, 0.35);
      border-radius: var(--radius);
      color: rgba(255, 255, 255, 0.7);
      font: 500 20px/1.3 Inter, Mukta, sans-serif;
      padding: 12px;
    }
  `,
})
export class ImageWidget extends WidgetBase<ImageProps> {
  protected readonly defaults: ImageProps = { src: '', fit: 'contain', panel: false };
}
