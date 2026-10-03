import { ChangeDetectionStrategy, Component, ElementRef, Injectable, effect, inject, signal, viewChild } from '@angular/core';

interface PromptRequest {
  title: string;
  value: string;
  confirmLabel: string;
  danger: boolean;
  /** confirm-only dialogs have no text field */
  withInput: boolean;
  resolve: (v: string | null) => void;
}

/** window.prompt/confirm replacement that also works inside an OBS custom dock. */
@Injectable()
export class PromptService {
  readonly request = signal<PromptRequest | null>(null);

  ask(title: string, value = '', confirmLabel = 'OK'): Promise<string | null> {
    return new Promise((resolve) =>
      this.request.set({ title, value, confirmLabel, danger: false, withInput: true, resolve }),
    );
  }

  confirm(title: string, confirmLabel = 'Delete'): Promise<boolean> {
    return new Promise((resolve) =>
      this.request.set({
        title,
        value: '',
        confirmLabel,
        danger: true,
        withInput: false,
        resolve: (v) => resolve(v !== null),
      }),
    );
  }

  close(v: string | null): void {
    const r = this.request();
    this.request.set(null);
    r?.resolve(v);
  }
}

@Component({
  selector: 'cos-prompt-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg (cancel)="svc.close(null)" (close)="onClose()">
      @if (svc.request(); as r) {
        <form method="dialog" (submit)="submit($event)">
          <h2>{{ r.title }}</h2>
          @if (r.withInput) {
            <input #field type="text" [value]="r.value" autofocus />
          }
          <div class="btns">
            <button type="button" (click)="svc.close(null)">Cancel</button>
            <button type="submit" class="primary" [class.danger]="r.danger">{{ r.confirmLabel }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: `
    dialog {
      border: 1px solid var(--ui-border);
      border-radius: 12px;
      background: var(--ui-panel);
      color: var(--ui-text);
      padding: 18px;
      width: min(380px, 90vw);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.5);
    }
    h2 {
      margin: 0 0 12px;
      font-size: 15px;
      font-weight: 600;
    }
    input {
      width: 100%;
    }
    .btns {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  `,
})
export class PromptDialogComponent {
  protected readonly svc = inject(PromptService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    effect(() => {
      const open = !!this.svc.request();
      const d = this.dlg().nativeElement;
      if (open && !d.open) {
        d.showModal();
        setTimeout(() => this.field()?.nativeElement.select());
      } else if (!open && d.open) d.close();
    });
  }

  protected submit(e: Event): void {
    e.preventDefault();
    const r = this.svc.request();
    if (!r) return;
    const value = this.field()?.nativeElement.value ?? '';
    this.svc.close(r.withInput ? value.trim() || null : 'ok');
  }

  protected onClose(): void {
    if (this.svc.request()) this.svc.close(null);
  }
}
