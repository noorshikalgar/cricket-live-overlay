import { ChangeDetectionStrategy, Component } from '@angular/core';
import { WidgetBase } from '../widget-base';

export interface TextProps {
  text: string;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  panel: boolean;
  /** px at font scale 1 */
  size: number;
  liveDot: boolean;
}

@Component({
  selector: 'cos-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="box"
      [class.panel]="p().panel"
      [class.upper]="p().uppercase"
      [style.justify-content]="justify[p().align]"
      [style.font-size.px]="p().size * style().fontScale"
    >
      @if (style().showTitle && style().title) {
        <div class="w-title">{{ style().title }}</div>
      }
      @if (p().liveDot) {
        <span class="live-dot"></span>
      }
      <span class="t">{{ p().text }}</span>
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
      display: flex;
      align-items: center;
      gap: 0.5em;
      font-weight: 600;
      line-height: 1.15;
      padding: 0 var(--pad);
      color: var(--text);
    }
    .box:not(.panel) {
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
    }
    .upper {
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .t {
      white-space: pre-line;
    }
    .live-dot {
      flex: none;
    }
  `,
})
export class TextWidget extends WidgetBase<TextProps> {
  protected readonly defaults: TextProps = {
    text: 'LIVE COMMENTARY',
    align: 'left',
    uppercase: true,
    panel: true,
    size: 26,
    liveDot: true,
  };
  protected readonly justify = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
}
