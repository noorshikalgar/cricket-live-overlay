import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ANIM_PRESETS,
  BACKGROUND_KINDS,
  DEFAULT_BACKGROUND,
  DEFAULT_POINTER,
  DEFAULT_TRANSITION,
  POINTER_STYLES,
  THEMES,
  type PointerStyle,
  type ScenePointer,
  TRANSITION_KINDS,
  type SceneTransition,
  type TransitionKind,
  type BackgroundKind,
  type SceneBackground,
  resolveStyle,
  type AnimPreset,
  type PropValue,
  type ResolvedStyle,
  type ThemeId,
  type WidgetInstance,
  type WidgetStyle,
} from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { STYLE_SCHEMA, WIDGET_REGISTRY, type FieldDef } from '../widgets/widget-registry';
import { exportCameraMask, obsTransformText } from './camera-tools';
import { EditorStore } from './editor.store';
import { FieldComponent } from './field.component';

type StyleKey = keyof WidgetStyle;

const ANIM_LABELS: Record<AnimPreset, string> = {
  none: 'None',
  fade: 'Fade',
  slideUp: 'Slide up',
  slideDown: 'Slide down',
  slideLeft: 'Slide left',
  slideRight: 'Slide right',
  wipe: 'Wipe',
};

/** Right panel: settings for the selected widget (generated from its schema) or the scene. */
@Component({
  selector: 'cos-settings-panel',
  imports: [FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (editor.selected(); as w) {
      @let def = registry[w.type];
      <header class="head">
        <span class="icon">{{ def.icon }}</span>
        <input class="name" [value]="w.name" (input)="rename(w, $event)" aria-label="Layer name" />
      </header>
      <p class="desc">{{ def.description }}</p>

      <section>
        <h3>Position</h3>
        <div class="grid4">
          @for (k of posKeys; track k) {
            <label>
              <span>{{ k.toUpperCase() }}</span>
              <input type="number" [value]="w[k]" (change)="setPos(w, k, $event)" [disabled]="w.locked" />
            </label>
          }
        </div>
        <div class="row-btns">
          <button type="button" (click)="editor.updateWidget(w.id, { visible: !w.visible })">
            {{ w.visible ? 'Hide' : 'Show' }}
          </button>
          <button type="button" (click)="editor.updateWidget(w.id, { locked: !w.locked })">
            {{ w.locked ? 'Unlock' : 'Lock' }}
          </button>
          <button type="button" (click)="editor.duplicate(w.id)">Duplicate</button>
          <button type="button" class="danger" (click)="editor.remove(w.id)">Delete</button>
        </div>
      </section>

      @if (w.type === 'camera') {
        <section class="obs">
          <h3>OBS webcam placement</h3>
          <pre>{{ transformText(w) }}</pre>
          <div class="row-btns">
            <button type="button" (click)="copy(transformText(w))">{{ copied() ? 'Copied ✓' : 'Copy transform' }}</button>
          </div>
          <p class="hint">
            In OBS select the webcam, press Ctrl+E (Edit Transform), set Position, Bounding Box type
            "Scale to outer bounds" with this size, and tick "Crop to Bounding Box".
          </p>
          <div class="row-btns">
            <button type="button" (click)="mask(w, 'frame')">Mask PNG (frame size)</button>
            <button type="button" (click)="mask(w, 'canvas')">Mask PNG (1920×1080)</button>
          </div>
        </section>
      }

      @if (def.settingsSchema.length) {
        <section>
          <h3>{{ def.label }}</h3>
          @if (w.type === 'scorecard' || w.type === 'teamCard' || w.type === 'playerCard') {
            <div class="row-btns top">
              <button type="button" (click)="reloadCards(w.type)" title="Fetch fresh card data (1 API call)">⟳ Reload card data</button>
            </div>
          }
          @for (f of def.settingsSchema; track f.key) {
            <cos-field [def]="f" [value]="w.props[f.key]" (changed)="setProp(w, f, $event)" />
          }
        </section>
      }

      <section>
        <h3>Look</h3>
        <cos-field [def]="titleToggle" [value]="w.style.showTitle" (changed)="setStyle(w, 'showTitle', $event)" />
        @if (w.style.showTitle) {
          <cos-field [def]="titleText" [value]="w.style.title ?? ''" (changed)="setStyle(w, 'title', $event)" />
        }
        @for (f of styleSchema; track f.key) {
          <cos-field
            [def]="f"
            [value]="styleValue(w, f.key)"
            [inherited]="isInherited(w, f.key)"
            [resettable]="!isInherited(w, f.key)"
            (changed)="setStyle(w, asStyleKey(f.key), $event)"
            (reset)="resetStyle(w, asStyleKey(f.key))"
          />
        }
        <cos-field
          [def]="borderWidth"
          [value]="resolved().border.width"
          [inherited]="!w.style.border"
          [resettable]="!!w.style.border"
          (changed)="setBorder(w, 'width', $event)"
          (reset)="resetStyle(w, 'border')"
        />
        @if (resolved().border.width > 0) {
          <cos-field [def]="borderColor" [value]="resolved().border.color" (changed)="setBorder(w, 'color', $event)" />
        }
      </section>

      <section>
        <h3>Motion</h3>
        <cos-field [def]="enterField" [value]="w.animation.enter" (changed)="setAnim(w, 'enter', $event)" />
        <cos-field [def]="exitField" [value]="w.animation.exit" (changed)="setAnim(w, 'exit', $event)" />
        <cos-field [def]="delayField" [value]="w.animation.delay" (changed)="setAnim(w, 'delay', $event)" />
      </section>
    } @else if (editor.scene(); as scene) {
      <header class="head"><span class="icon">▦</span><strong>Scene</strong></header>
      <section>
        <label class="stack">
          <span>Name</span>
          <input type="text" [value]="scene.name" (input)="renameScene($event)" />
        </label>
        <label class="stack">
          <span>Theme</span>
          <select [value]="scene.theme" (change)="setTheme($event)">
            @for (t of themes; track t.id) {
              <option [value]="t.id" [selected]="t.id === scene.theme">{{ t.label }}</option>
            }
          </select>
        </label>
        <p class="hint">
          Themes set colours, fonts and radius for every widget. Anything you change on a widget overrides its theme
          value; ↺ puts it back.
        </p>
      </section>
      <section>
        <h3>Transition in</h3>
        @let tr = sceneTr();
        <cos-field [def]="trKindField" [value]="tr.kind" (changed)="setTr({ kind: asTrKind($event) })" />
        @if (tr.kind !== 'cut') {
          <cos-field [def]="trDurField" [value]="tr.duration" (changed)="setTr({ duration: asNum($event) }, 'tr-dur')" />
        }
        @if (tr.kind === 'stinger') {
          <cos-field
            [def]="trColorField"
            [value]="tr.color"
            [inherited]="!tr.color"
            [resettable]="!!tr.color"
            (changed)="setTr({ color: asStr($event) }, 'tr-color')"
            (reset)="setTr({ color: '' })"
          />
          <cos-field [def]="trNameField" [value]="tr.showName" (changed)="setTr({ showName: $event === true })" />
        }
        <p class="hint">Plays on the Output when this scene is put on air.</p>
      </section>

      <section>
        <h3>On-air pointer</h3>
        @let ptr = scenePtr();
        <cos-field [def]="ptrOnField" [value]="ptr.enabled" (changed)="setPtr({ enabled: $event === true })" />
        @if (ptr.enabled) {
          <cos-field [def]="ptrStyleField" [value]="ptr.style" (changed)="setPtr({ style: asPtrStyle($event) })" />
          <cos-field [def]="ptrColorField" [value]="ptr.color" (changed)="setPtr({ color: asStr($event) }, 'ptr-color')" />
          <cos-field [def]="ptrSizeField" [value]="ptr.size" (changed)="setPtr({ size: asNum($event) }, 'ptr-size')" />
          <cos-field [def]="ptrBlurField" [value]="ptr.motionBlur" (changed)="setPtr({ motionBlur: $event === true })" />
          <p class="hint">Press ◎ Pointer in the canvas toolbar, then move over the canvas: the pointer follows live on the Output. Click for a ripple, Esc to stop.</p>
        }
      </section>

      <section>
        <h3>Background (on air)</h3>
        @let bg = sceneBg();
        <cos-field [def]="bgKindField" [value]="bg.kind" (changed)="setBg({ kind: asKind($event) })" />
        @if (bg.kind === 'transparent') {
          <p class="hint">Nothing is drawn behind the widgets, so the OBS sources below the Browser Source show through.</p>
        } @else {
          @if (bg.kind === 'color' || bg.kind === 'gradient' || bg.kind === 'image') {
            <cos-field [def]="bgColorField" [value]="bg.color" (changed)="setBg({ color: asStr($event) }, 'bg-color')" />
          }
          @if (bg.kind === 'gradient') {
            <cos-field [def]="bgColor2Field" [value]="bg.color2" (changed)="setBg({ color2: asStr($event) }, 'bg-color2')" />
          }
          @if (bg.kind === 'image') {
            <cos-field [def]="bgImageField" [value]="bg.image" (changed)="setBg({ image: asStr($event) })" />
          }
          <cos-field [def]="bgDimField" [value]="bg.dim" (changed)="setBg({ dim: asNum($event) }, 'bg-dim')" />
          <p class="hint">Covers everything below the Browser Source in OBS, so use it for full-screen scenes like breaks.</p>
        }
      </section>
      <section>
        <h3>Tips</h3>
        <ul class="tips">
          <li>Click a widget in the library to add it, or drag it onto the canvas.</li>
          <li>Drag to move, handles to resize. Shift keeps the aspect ratio, Alt skips snapping.</li>
          <li>Arrow keys nudge 1 px, Shift+arrow 10 px.</li>
          <li>Ctrl/⌘+D duplicates, Delete removes, Ctrl/⌘+Z undoes.</li>
          <li>Event pad hotkeys: 4, 6, W, D (DRS), K (drinks), B (break).</li>
        </ul>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 14px 16px 40px;
      overflow-y: auto;
      font-size: 13px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .icon {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      background: var(--ui-chip);
      border-radius: 6px;
      flex: none;
    }
    .name {
      flex: 1;
      font-weight: 600;
      font-size: 14px;
      background: transparent;
      border-color: transparent;
    }
    .name:hover,
    .name:focus {
      border-color: var(--ui-border);
    }
    .desc,
    .hint {
      color: var(--ui-muted);
      font-size: 12px;
      line-height: 1.45;
      margin: 4px 0 8px;
    }
    section {
      border-top: 1px solid var(--ui-border);
      padding-top: 12px;
      margin-top: 12px;
    }
    h3 {
      margin: 0 0 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 600;
    }
    .grid4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .grid4 label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 10px;
      color: var(--ui-muted);
    }
    .grid4 input {
      width: 100%;
      font-variant-numeric: tabular-nums;
    }
    .row-btns.top {
      margin: 0 0 12px;
    }
    .row-btns {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .obs pre {
      background: var(--ui-chip);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 12px;
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--ui-muted);
    }
    .tips {
      margin: 0;
      padding-left: 18px;
      color: var(--ui-muted);
      line-height: 1.6;
      font-size: 12px;
    }
  `,
})
export class SettingsPanelComponent {
  protected readonly editor = inject(EditorStore);
  private readonly live = inject(LiveStore);

  protected readonly registry = WIDGET_REGISTRY;
  protected readonly styleSchema = STYLE_SCHEMA;
  protected readonly themes = Object.values(THEMES);
  protected readonly posKeys = ['x', 'y', 'w', 'h'] as const;
  protected readonly copied = signal(false);

  protected readonly titleToggle: FieldDef = { kind: 'toggle', key: 'showTitle', label: 'Show title tab' };
  protected readonly titleText: FieldDef = { kind: 'text', key: 'title', label: 'Title' };
  protected readonly borderWidth: FieldDef = { kind: 'slider', key: 'borderWidth', label: 'Border', min: 0, max: 8, step: 1, unit: 'px' };
  protected readonly borderColor: FieldDef = { kind: 'color', key: 'borderColor', label: 'Border colour' };
  private readonly animOptions = ANIM_PRESETS.map((a) => ({ value: a, label: ANIM_LABELS[a] }));
  protected readonly enterField: FieldDef = { kind: 'select', key: 'enter', label: 'Enter', options: this.animOptions };
  protected readonly exitField: FieldDef = { kind: 'select', key: 'exit', label: 'Exit', options: this.animOptions };
  protected readonly delayField: FieldDef = { kind: 'slider', key: 'delay', label: 'Enter delay', min: 0, max: 2000, step: 50, unit: 'ms' };

  protected readonly scenePtr = computed(() => ({ ...DEFAULT_POINTER, ...this.editor.scene()?.pointer }));
  protected readonly ptrOnField: FieldDef = { kind: 'toggle', key: 'enabled', label: 'Show pointer on this scene' };
  protected readonly ptrStyleField: FieldDef = { kind: 'select', key: 'style', label: 'Style', options: POINTER_STYLES };
  protected readonly ptrColorField: FieldDef = { kind: 'color', key: 'color', label: 'Colour' };
  protected readonly ptrSizeField: FieldDef = { kind: 'slider', key: 'size', label: 'Size', min: 12, max: 120, step: 2, unit: 'px' };
  protected readonly ptrBlurField: FieldDef = { kind: 'toggle', key: 'motionBlur', label: 'Motion blur' };

  protected setPtr(patch: Partial<ScenePointer>, coalesceKey?: string): void {
    this.editor.setPointer(patch, coalesceKey);
  }

  protected asPtrStyle(v: PropValue): PointerStyle {
    return POINTER_STYLES.find((k) => k.value === v)?.value ?? 'dot';
  }

  protected readonly sceneTr = computed(() => ({ ...DEFAULT_TRANSITION, ...this.editor.scene()?.transition }));
  protected readonly trKindField: FieldDef = { kind: 'select', key: 'kind', label: 'Style', options: TRANSITION_KINDS };
  protected readonly trDurField: FieldDef = { kind: 'slider', key: 'duration', label: 'Length', min: 0.3, max: 2.5, step: 0.1, unit: 's' };
  protected readonly trColorField: FieldDef = { kind: 'color', key: 'color', label: 'Stinger colour' };
  protected readonly trNameField: FieldDef = { kind: 'toggle', key: 'showName', label: 'Show scene name' };

  protected setTr(patch: Partial<SceneTransition>, coalesceKey?: string): void {
    this.editor.setTransition(patch, coalesceKey);
  }

  protected asTrKind(v: PropValue): TransitionKind {
    return TRANSITION_KINDS.find((k) => k.value === v)?.value ?? 'glide';
  }

  protected readonly sceneBg = computed(() => ({ ...DEFAULT_BACKGROUND, ...this.editor.scene()?.background }));
  protected readonly bgKindField: FieldDef = { kind: 'select', key: 'kind', label: 'Type', options: BACKGROUND_KINDS };
  protected readonly bgColorField: FieldDef = { kind: 'color', key: 'color', label: 'Colour' };
  protected readonly bgColor2Field: FieldDef = { kind: 'color', key: 'color2', label: 'Second colour' };
  protected readonly bgImageField: FieldDef = { kind: 'image', key: 'image', label: 'Image' };
  protected readonly bgDimField: FieldDef = { kind: 'slider', key: 'dim', label: 'Darken', min: 0, max: 0.8, step: 0.05 };

  protected setBg(patch: Partial<SceneBackground>, coalesceKey?: string): void {
    this.editor.setBackground(patch, coalesceKey);
  }

  protected asKind(v: PropValue): BackgroundKind {
    return (BACKGROUND_KINDS.find((k) => k.value === v)?.value ?? 'transparent');
  }

  protected asStr(v: PropValue): string {
    return typeof v === 'string' ? v : '';
  }

  protected asNum(v: PropValue): number {
    return typeof v === 'number' ? v : Number(v) || 0;
  }

  protected readonly resolved = computed<ResolvedStyle>(() => {
    const w = this.editor.selected();
    const s = this.editor.scene();
    if (!w || !s) return resolveStyle({ showTitle: false }, 'night', null);
    return resolveStyle(w.style, s.theme, this.live.teamColor());
  });

  protected reloadCards(type: string): void {
    this.live.send({ type: 'cards:fetch', kind: 'scorecard', force: true });
    if (type !== 'scorecard' && !this.live.squads()) this.live.send({ type: 'cards:fetch', kind: 'squads', force: true });
  }

  protected asStyleKey(k: string): StyleKey {
    return k as StyleKey;
  }

  protected styleValue(w: WidgetInstance, key: string): PropValue {
    const own = w.style[key as StyleKey];
    if (own !== undefined && typeof own !== 'object') return own;
    const r = this.resolved()[key as keyof ResolvedStyle];
    return typeof r === 'object' ? null : r;
  }

  protected isInherited(w: WidgetInstance, key: string): boolean {
    return w.style[key as StyleKey] === undefined;
  }

  protected transformText(w: WidgetInstance): string {
    return obsTransformText(w);
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked (e.g. OBS dock without focus): fall back to a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  protected mask(w: WidgetInstance, mode: 'canvas' | 'frame'): void {
    exportCameraMask(w, this.resolved().radius, mode);
  }

  protected rename(w: WidgetInstance, e: Event): void {
    this.editor.updateWidget(w.id, { name: (e.target as HTMLInputElement).value || 'Widget' }, `name:${w.id}`);
  }

  protected setPos(w: WidgetInstance, k: 'x' | 'y' | 'w' | 'h', e: Event): void {
    const v = Math.round(Number((e.target as HTMLInputElement).value));
    if (!Number.isFinite(v)) return;
    this.editor.updateWidget(w.id, { [k]: k === 'w' || k === 'h' ? Math.max(24, v) : v });
  }

  protected setProp(w: WidgetInstance, f: FieldDef, v: PropValue): void {
    this.editor.commit((s) => {
      const t = s.widgets.find((x) => x.id === w.id);
      if (t) t.props = { ...t.props, [f.key]: v };
    }, `prop:${w.id}:${f.key}`);
  }

  protected setStyle(w: WidgetInstance, key: StyleKey, v: PropValue): void {
    this.editor.commit((s) => {
      const t = s.widgets.find((x) => x.id === w.id);
      if (t) t.style = { ...t.style, [key]: v };
    }, `style:${w.id}:${key}`);
  }

  protected resetStyle(w: WidgetInstance, key: StyleKey): void {
    this.editor.commit((s) => {
      const t = s.widgets.find((x) => x.id === w.id);
      if (!t) return;
      const next = { ...t.style };
      delete next[key];
      t.style = next;
    });
  }

  protected setBorder(w: WidgetInstance, part: 'width' | 'color', v: PropValue): void {
    const cur = this.resolved().border;
    const border = { ...cur, [part]: part === 'width' ? Number(v) || 0 : String(v) };
    this.editor.commit((s) => {
      const t = s.widgets.find((x) => x.id === w.id);
      if (t) t.style = { ...t.style, border };
    }, `style:${w.id}:border`);
  }

  protected setAnim(w: WidgetInstance, key: 'enter' | 'exit' | 'delay', v: PropValue): void {
    this.editor.commit((s) => {
      const t = s.widgets.find((x) => x.id === w.id);
      if (!t) return;
      t.animation = { ...t.animation, [key]: key === 'delay' ? Number(v) || 0 : (v as AnimPreset) };
    }, `anim:${w.id}:${key}`);
  }

  protected renameScene(e: Event): void {
    const name = (e.target as HTMLInputElement).value.trim() || 'Untitled';
    this.editor.commit((s) => {
      s.name = name;
    }, 'scene-name');
  }

  protected setTheme(e: Event): void {
    this.editor.setTheme((e.target as HTMLSelectElement).value as ThemeId);
  }
}
