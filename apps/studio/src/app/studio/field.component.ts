import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { PropValue } from '@cos/shared';
import type { FieldDef } from '../widgets/widget-registry';

/** One generated settings control. Emits the new value; the parent decides where it goes. */
@Component({
  selector: 'cos-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = def();
    <div class="field" [class.inline]="f.kind === 'toggle'">
      <span class="lbl">
        {{ f.label }}
        @if (inherited()) {
          <em>theme</em>
        } @else if (resettable()) {
          <button type="button" class="reset" title="Back to theme default" (click)="reset.emit()">↺</button>
        }
      </span>
      @switch (f.kind) {
        @case ('text') {
          @if (f.multiline) {
            <textarea rows="3" [value]="str()" [placeholder]="f.placeholder ?? ''" (input)="emitStr($event)"></textarea>
          } @else {
            <input type="text" [value]="str()" [placeholder]="f.placeholder ?? ''" (input)="emitStr($event)" />
          }
        }
        @case ('number') {
          <input type="number" [value]="num()" [min]="f.min ?? null" [max]="f.max ?? null" [step]="f.step ?? 1" (input)="emitNum($event)" />
        }
        @case ('slider') {
          <div class="slider">
            <input type="range" [min]="f.min" [max]="f.max" [step]="f.step" [value]="num()" (input)="emitNum($event)" />
            <output>{{ fmt(num(), f.step) }}{{ f.unit ?? '' }}</output>
          </div>
        }
        @case ('toggle') {
          <label class="switch">
            <input type="checkbox" [checked]="bool()" (change)="emitBool($event)" />
            <span></span>
          </label>
        }
        @case ('select') {
          <select [value]="str()" (change)="emitStr($event)">
            @for (o of f.options; track o.value) {
              <option [value]="o.value" [selected]="o.value === str()">{{ o.label }}</option>
            }
          </select>
        }
        @case ('color') {
          <div class="color">
            <input type="color" [value]="str() || '#000000'" (input)="emitStr($event)" />
            <input type="text" [value]="str()" (change)="emitStr($event)" spellcheck="false" />
          </div>
        }
        @case ('checks') {
          <div class="checks">
            @for (o of f.options; track o.value) {
              <label>
                <input type="checkbox" [checked]="checks()[o.value] === true" (change)="emitCheck(o.value, $event)" />
                {{ o.label }}
              </label>
            }
          </div>
        }
        @case ('image') {
          <div class="image">
            @if (str()) {
              <img [src]="str()" alt="" />
            }
            <label class="btn">
              {{ uploading() ? 'Uploading…' : str() ? 'Replace' : 'Upload' }}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" (change)="upload($event)" hidden />
            </label>
            @if (str()) {
              <button type="button" class="btn" (click)="changed.emit('')">Remove</button>
            }
          </div>
          @if (uploadError()) {
            <small class="err">{{ uploadError() }}</small>
          }
        }
        @case ('video') {
          <div class="image">
            <label class="btn">
              {{ uploading() ? 'Uploading…' : str() ? 'Replace' : 'Upload video' }}
              <input type="file" accept="video/mp4,video/webm,video/quicktime" (change)="upload($event)" hidden />
            </label>
            @if (str()) {
              <button type="button" class="btn" (click)="changed.emit('')">Remove</button>
            }
          </div>
          <input type="text" [value]="str()" placeholder="…or paste a video URL (https://…/clip.mp4)" (change)="emitStr($event)" />
          @if (uploadError()) {
            <small class="err">{{ uploadError() }}</small>
          }
        }
      }
    </div>
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .field.inline {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
    .lbl {
      font-size: 12px;
      color: var(--ui-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .lbl em {
      font-style: normal;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      background: var(--ui-chip);
      color: var(--ui-muted);
    }
    .reset {
      background: none;
      border: 0;
      color: var(--ui-accent);
      cursor: pointer;
      padding: 0;
      font-size: 13px;
    }
    .slider {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .slider input {
      flex: 1;
    }
    .slider output {
      min-width: 48px;
      text-align: right;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--ui-text);
    }
    .color {
      display: flex;
      gap: 6px;
    }
    .color input[type='color'] {
      width: 36px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--ui-border);
      border-radius: 6px;
      background: none;
      cursor: pointer;
    }
    .color input[type='text'] {
      flex: 1;
      font-family: ui-monospace, monospace;
    }
    .checks {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
      font-size: 13px;
    }
    .checks label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .image {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .image img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      background: var(--ui-chip);
      border-radius: 6px;
    }
    .err {
      color: #f87171;
    }
    .switch {
      position: relative;
      width: 34px;
      height: 20px;
      flex: none;
      cursor: pointer;
    }
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }
    .switch span {
      position: absolute;
      inset: 0;
      border-radius: 99px;
      background: var(--ui-chip-strong);
      transition: background 0.15s;
    }
    .switch span::after {
      content: '';
      position: absolute;
      left: 2px;
      top: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.15s var(--ease-out);
    }
    .switch input:checked + span {
      background: var(--ui-accent);
    }
    .switch input:checked + span::after {
      transform: translateX(14px);
    }
    .switch input:focus-visible + span {
      outline: 2px solid var(--ui-accent);
      outline-offset: 2px;
    }
  `,
})
export class FieldComponent {
  readonly def = input.required<FieldDef>();
  readonly value = input<PropValue | undefined>(undefined);
  /** style fields: true when the value comes from the theme */
  readonly inherited = input(false);
  /** style fields: show a reset button when overridden */
  readonly resettable = input(false);
  readonly changed = output<PropValue>();
  readonly reset = output<void>();

  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected readonly str = computed(() => {
    const v = this.value();
    return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  });
  protected readonly num = computed(() => {
    const v = this.value();
    return typeof v === 'number' ? v : Number(v) || 0;
  });
  protected readonly bool = computed(() => this.value() === true);
  protected readonly checks = computed<Record<string, boolean>>(() => {
    const v = this.value();
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  });

  protected fmt(v: number, step: number): string {
    return step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(v);
  }

  protected emitStr(e: Event): void {
    this.changed.emit((e.target as HTMLInputElement).value);
  }

  protected emitNum(e: Event): void {
    const n = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(n)) this.changed.emit(n);
  }

  protected emitBool(e: Event): void {
    this.changed.emit((e.target as HTMLInputElement).checked);
  }

  protected emitCheck(key: string, e: Event): void {
    this.changed.emit({ ...this.checks(), [key]: (e.target as HTMLInputElement).checked });
  }

  protected async upload(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.uploadError.set(null);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: file, headers: { 'content-type': file.type } });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? `Upload failed (${res.status})`);
      this.changed.emit(body.url);
    } catch (err) {
      this.uploadError.set(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }
}
