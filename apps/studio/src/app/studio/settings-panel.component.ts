import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
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
import { STYLE_SCHEMA, WIDGET_REGISTRY, type ActionContext, type FieldDef, type WidgetAction } from '../widgets/widget-registry';
import { exportCameraMask, obsTransformText } from './camera-tools';
import { EditorStore } from './editor.store';
import { FieldComponent } from './field.component';

type StyleKey = keyof WidgetStyle;

const ANIM_LABELS: Record<AnimPreset, string> = {
  none: 'None',
  fade: 'Fade',
  pop: 'Pop (scale up with a bounce)',
  flip: 'Flip down (3D)',
  slideUp: 'Slide up',
  slideDown: 'Slide down',
  slideLeft: 'Slide left',
  slideRight: 'Slide right',
  wipe: 'Wipe',
};

const OPEN_KEY = 'cos.inspector.open';
/** sections that start folded so the panel stays short */
const CLOSED_BY_DEFAULT = new Set(['look', 'motion', 'tips', 'obs-webcam-placement']);

function readOpenState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

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

      <details class="sec" [open]="isOpen('position')" (toggle)="onToggle('position', $event)">
        <summary>Position</summary>
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
      </details>

      @if (w.type === 'camera') {
        <details class="sec obs" [open]="isOpen('obs-webcam-placement')" (toggle)="onToggle('obs-webcam-placement', $event)">
          <summary>OBS webcam placement</summary>
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
        </details>
      }

      @if (def.settingsSchema.length || def.actions?.length) {
        @let ctx = actionCtx(w);
        <details class="sec" [open]="isOpen('widget')" (toggle)="onToggle('widget', $event)">
          <summary>{{ def.label }}</summary>
          @if (def.readout) {
            @let r = def.readout(ctx);
            @if (r) {
              <div class="readout">{{ r }}</div>
            }
          }
          @if (def.actions?.length) {
            <div class="row-btns top">
              @for (a of def.actions; track a.id) {
                @if (!a.when || a.when(ctx)) {
                  <button type="button" [class.primary]="isPrimary(a, ctx)" [title]="a.title ?? ''" (click)="a.run(ctx)">
                    {{ a.label(ctx) }}
                  </button>
                }
              }
            </div>
          }
          @for (f of fieldsIn(def.settingsSchema, w, ''); track f.key) {
            <cos-field [def]="f" [value]="w.props[f.key]" (changed)="setProp(w, f, $event)" />
          }
        </details>
        @for (g of groupsOf(def.settingsSchema); track g) {
          <details class="sec" [open]="isOpen('g:' + g)" (toggle)="onToggle('g:' + g, $event)">
            <summary>{{ g }}</summary>
            @for (f of fieldsIn(def.settingsSchema, w, g); track f.key) {
              <cos-field [def]="f" [value]="w.props[f.key]" (changed)="setProp(w, f, $event)" />
            }
          </details>
        }
      }

      <details class="sec" [open]="isOpen('look')" (toggle)="onToggle('look', $event)">
        <summary>Look</summary>
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
      </details>

      <details class="sec" [open]="isOpen('motion')" (toggle)="onToggle('motion', $event)">
        <summary>Motion</summary>
        <cos-field [def]="enterField" [value]="w.animation.enter" (changed)="setAnim(w, 'enter', $event)" />
        <cos-field [def]="exitField" [value]="w.animation.exit" (changed)="setAnim(w, 'exit', $event)" />
        <cos-field [def]="delayField" [value]="w.animation.delay" (changed)="setAnim(w, 'delay', $event)" />
      </details>
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
      <details class="sec" [open]="isOpen('overlay')" (toggle)="onToggle('overlay', $event)">
        <summary>Overlay (all scenes)</summary>
        <cos-field [def]="langField" [value]="live.settings().language" (changed)="setSetting('language', $event)" />
        <cos-field [def]="imgField" [value]="live.settings().playerImages" (changed)="setSetting('playerImages', $event)" />
        @if (live.settings().playerImages === 'photo') {
          <div class="row-btns">
            <button type="button" (click)="prefetchPhotos()" [disabled]="prefetching()" title="Look up both playing XIs on Wikimedia now, so panels show photos instantly on air">
              {{ prefetching() ? 'Fetching…' : '⤓ Fetch photos for both XIs' }}
            </button>
          </div>
          <p class="hint">
            Free photos from Wikimedia Commons, downloaded once and kept on this computer. Each shows its author and
            licence, as the licences require. Players without a free photo get the avatar.
          </p>
        }
      </details>
      <details class="sec" [open]="isOpen('transition-in')" (toggle)="onToggle('transition-in', $event)">
        <summary>Transition in</summary>
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
      </details>

      <details class="sec" [open]="isOpen('on-air-pointer')" (toggle)="onToggle('on-air-pointer', $event)">
        <summary>On-air pointer</summary>
        @let ptr = scenePtr();
        <cos-field [def]="ptrOnField" [value]="ptr.enabled" (changed)="setPtr({ enabled: $event === true })" />
        @if (ptr.enabled) {
          <cos-field [def]="ptrStyleField" [value]="ptr.style" (changed)="setPtr({ style: asPtrStyle($event) })" />
          <cos-field [def]="ptrColorField" [value]="ptr.color" (changed)="setPtr({ color: asStr($event) }, 'ptr-color')" />
          <cos-field [def]="ptrSizeField" [value]="ptr.size" (changed)="setPtr({ size: asNum($event) }, 'ptr-size')" />
          <cos-field [def]="ptrBlurField" [value]="ptr.motionBlur" (changed)="setPtr({ motionBlur: $event === true })" />
          <p class="hint">Press ◎ Pointer in the canvas toolbar, then move over the canvas: the pointer follows live on the Output. Click for a ripple, Esc to stop.</p>
        }
      </details>

      <details class="sec" [open]="isOpen('background-on-air')" (toggle)="onToggle('background-on-air', $event)">
        <summary>Background (on air)</summary>
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
      </details>
      <details class="sec" [open]="isOpen('tips')" (toggle)="onToggle('tips', $event)">
        <summary>Tips</summary>
        <ul class="tips">
          <li>Click a widget in the library to add it, or drag it onto the canvas.</li>
          <li>Drag to move, handles to resize. Shift keeps the aspect ratio, Alt skips snapping.</li>
          <li>Arrow keys nudge 1 px, Shift+arrow 10 px.</li>
          <li>Ctrl/⌘+D duplicates, Delete removes, Ctrl/⌘+Z undoes.</li>
          <li>Event pad hotkeys: 4, 6, W, D (DRS), K (drinks), B (break).</li>
        </ul>
      </details>
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
    section,
    .sec {
      border-top: 1px solid var(--ui-border);
      padding-top: 12px;
      margin-top: 12px;
    }
    .sec > summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 10px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ui-muted);
      font-weight: 600;
      user-select: none;
    }
    .sec > summary::-webkit-details-marker {
      display: none;
    }
    .sec > summary::before {
      content: '▸';
      font-size: 10px;
      transition: transform 0.15s;
    }
    .sec[open] > summary::before {
      transform: rotate(90deg);
    }
    .sec:not([open]) > summary {
      margin-bottom: 0;
    }
    .sec > summary:hover {
      color: var(--ui-text, inherit);
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
    .timer-ctl {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .readout {
      font: 700 28px/1 Inter, Mukta, sans-serif;
      font-variant-numeric: tabular-nums;
      margin-bottom: 8px;
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
  protected readonly live = inject(LiveStore);

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

  /** ticks live readouts (timer) */
  private readonly now = signal(Date.now());
  private readonly clock = setInterval(() => this.now.set(Date.now()), 250);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.clock));
  }

  // ---- generic widget sections ----

  /** what a registry action sees: the selected widget's props and ways to change them */
  protected actionCtx(w: WidgetInstance): ActionContext {
    return {
      props: w.props,
      now: this.now(),
      update: (patch, key) => this.editor.updateWidget(w.id, { props: { ...w.props, ...patch } }, key ? `${key}:${w.id}` : undefined),
      send: (msg) => this.live.send(msg),
      hasSquads: !!this.live.squads(),
    };
  }

  protected isPrimary(a: WidgetAction, c: ActionContext): boolean {
    return a.primary?.(c) ?? false;
  }

  /** the fields of one group ('' = ungrouped) that apply to the widget's current props */
  protected fieldsIn(schema: FieldDef[], w: WidgetInstance, group: string): FieldDef[] {
    return schema.filter((f) => (f.group ?? '') === group && (!f.showIf || f.showIf(w.props)));
  }

  protected groupsOf(schema: FieldDef[]): string[] {
    return [...new Set(schema.map((f) => f.group).filter((g): g is string => !!g))];
  }

  // ---- collapsible sections, remembered per browser ----

  private readonly openState = signal<Record<string, boolean>>(readOpenState());

  protected isOpen(key: string): boolean {
    return this.openState()[key] ?? !CLOSED_BY_DEFAULT.has(key);
  }

  protected onToggle(key: string, e: Event): void {
    const open = (e.target as HTMLDetailsElement).open;
    if (open === this.isOpen(key)) return;
    this.openState.update((s) => ({ ...s, [key]: open }));
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(this.openState()));
    } catch {
      // storage blocked: sections just reset next time
    }
  }

  // ---- overlay-wide settings ----

  protected readonly langField: FieldDef = {
    kind: 'select',
    key: 'language',
    label: 'Label language',
    options: [
      { value: 'en', label: 'English' },
      { value: 'mr', label: 'मराठी (Marathi)' },
    ],
  };
  protected readonly imgField: FieldDef = {
    kind: 'select',
    key: 'playerImages',
    label: 'Player images',
    options: [
      { value: 'avatar', label: 'Avatars (drawn, no rights needed)' },
      { value: 'photo', label: 'Wikimedia photos (with credit)' },
    ],
  };
  protected readonly prefetching = signal(false);

  protected setSetting(key: 'language' | 'playerImages', v: PropValue): void {
    if (key === 'language') this.live.send({ type: 'settings:update', settings: { language: v === 'mr' ? 'mr' : 'en' } });
    else this.live.send({ type: 'settings:update', settings: { playerImages: v === 'photo' ? 'photo' : 'avatar' } });
  }

  protected async prefetchPhotos(): Promise<void> {
    const squads = this.live.squads();
    if (!squads) this.live.send({ type: 'cards:fetch', kind: 'squads', force: false });
    const names = (squads?.teams ?? []).flatMap((t) => t.playingXI.map((p) => p.name));
    if (!names.length) return;
    this.prefetching.set(true);
    try {
      await fetch('/api/players/prefetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names }),
      });
    } finally {
      this.prefetching.set(false);
    }
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
