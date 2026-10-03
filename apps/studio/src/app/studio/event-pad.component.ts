import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { MatchEventType } from '@cos/shared';
import { LiveStore } from '../core/live.store';

export interface PadButton {
  type: MatchEventType;
  label: string;
  key: string;
  color: string;
}

export const PAD_BUTTONS: PadButton[] = [
  { type: 'FOUR', label: 'FOUR', key: '4', color: '#3B82F6' },
  { type: 'SIX', label: 'SIX', key: '6', color: '#A855F7' },
  { type: 'WICKET', label: 'WICKET', key: 'W', color: '#EF4444' },
  { type: 'DRS', label: 'DRS', key: 'D', color: '#F59E0B' },
  { type: 'DRINKS', label: 'DRINKS', key: 'K', color: '#14B8A6' },
  { type: 'INNINGS_BREAK', label: 'BREAK', key: 'B', color: '#64748B' },
];

/** Manual triggers for banners when the API lags the TV feed. Hotkeys are wired in the Studio page. */
@Component({
  selector: 'cos-event-pad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>Event pad</h3>
    <div class="pad">
      @for (b of buttons; track b.type) {
        <button
          type="button"
          [style.--c]="b.color"
          [class.flash]="flashing() === b.type"
          (click)="fire(b.type)"
          [title]="b.label + ' (' + b.key + ')'"
        >
          <span class="l">{{ b.label }}</span>
          <kbd>{{ b.key }}</kbd>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 10px 12px 12px;
    }
    h3 {
      margin: 0 0 8px 2px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 600;
    }
    .pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }
    button {
      position: relative;
      height: 46px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
      background: color-mix(in srgb, var(--c) 18%, #12161e);
      color: #fff;
      font: 700 13px/1 Inter, sans-serif;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition:
        background 0.12s,
        transform 0.08s;
    }
    button:hover {
      background: color-mix(in srgb, var(--c) 35%, #12161e);
    }
    button:active,
    button.flash {
      transform: scale(0.96);
      background: var(--c);
    }
    kbd {
      position: absolute;
      right: 5px;
      top: 4px;
      font: 600 9px/1 ui-monospace, monospace;
      opacity: 0.6;
    }
  `,
})
export class EventPadComponent {
  private readonly live = inject(LiveStore);
  protected readonly buttons = PAD_BUTTONS;
  protected readonly flashing = signal<MatchEventType | null>(null);

  fire(type: MatchEventType): void {
    this.live.send({ type: 'event:manual', eventType: type });
    this.flashing.set(type);
    setTimeout(() => this.flashing.set(null), 160);
  }
}
