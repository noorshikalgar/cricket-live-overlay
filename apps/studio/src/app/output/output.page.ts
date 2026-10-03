import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CANVAS_H, CANVAS_W, DEFAULT_TRANSITION, THEMES, type Scene, type TransitionKind } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { Flip, gsap } from '../motion/gsap';
import { MotionService } from '../motion/motion.service';
import { SceneBackgroundComponent } from '../widgets/scene-background.component';
import { PointerOverlayComponent } from './pointer-overlay.component';
import { SceneRendererComponent } from '../widgets/scene-renderer.component';

/**
 * /output and /output/:sceneId — the transparent 1920×1080 page OBS loads.
 * No editor code, no cursor, no warnings: only the widgets.
 * Without a sceneId it follows the scene put on air from the Studio.
 */
@Component({
  selector: 'cos-output-page',
  imports: [SceneBackgroundComponent, SceneRendererComponent, PointerOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.reduce-motion]': 'motion.reduced()', '(window:resize)': 'fit()' },
  template: `
    <div class="stage" [style.transform]="transform()">
      <div class="layer" #stage>
        @if (displayed(); as scene) {
          <cos-scene-background [background]="scene.background" />
          <cos-scene-renderer [scene]="scene" [match]="store.match()" [teamColor]="store.teamColor()" mode="output" />
        }
      </div>
      @if (displayed()?.pointer?.enabled) {
        <cos-pointer-overlay [settings]="displayed()!.pointer" />
      }
      <div class="stinger" #stinger aria-hidden="true">
        <div class="sp back"></div>
        <div class="sp front"></div>
        <div class="sname" #sname></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: fixed;
      inset: 0;
      overflow: hidden;
      cursor: none;
      background: transparent;
    }
    .stage {
      position: absolute;
      left: 0;
      top: 0;
      width: 1920px;
      height: 1080px;
      transform-origin: 0 0;
      overflow: hidden;
    }
    .layer {
      position: absolute;
      inset: 0;
      transform-origin: 50% 50%;
    }
    .stinger {
      position: absolute;
      inset: 0;
      visibility: hidden;
      pointer-events: none;
      z-index: 100000;
    }
    .sp {
      position: absolute;
      inset: 0 -4%;
      /* transform is owned by GSAP (skew + xPercent), so none here */
    }
    .sp.back {
      background: var(--st, #22c55e);
      opacity: 0.55;
    }
    .sp.front {
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.18)),
        var(--st, #22c55e);
    }
    .sname {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font: 700 120px/1 'Barlow Condensed', Inter, sans-serif;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #fff;
      text-shadow: 0 6px 30px rgba(0, 0, 0, 0.25);
      opacity: 0;
    }
  `,
})
export default class OutputPage {
  /** bound from the route by withComponentInputBinding */
  readonly sceneId = input<string | undefined>(undefined);

  protected readonly store = inject(LiveStore);
  protected readonly motion = inject(MotionService);
  private readonly injector = inject(Injector);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly stinger = viewChild.required<ElementRef<HTMLElement>>('stinger');
  private readonly sname = viewChild.required<ElementRef<HTMLElement>>('sname');

  private readonly target = computed<Scene | null>(() => {
    const id = this.sceneId();
    return id ? (this.store.scenes()[id] ?? null) : this.store.activeScene();
  });
  protected readonly displayed = signal<Scene | null>(null);
  private switching = false;
  /** 1:1 in OBS (viewport is exactly 1920×1080); scaled to fit and centred in any other window */
  protected readonly transform = signal('none');

  protected fit(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === CANVAS_W && h === CANVAS_H) {
      this.transform.set('none');
      return;
    }
    const s = Math.min(w / CANVAS_W, h / CANVAS_H);
    const x = Math.round((w - CANVAS_W * s) / 2);
    const y = Math.round((h - CANVAS_H * s) / 2);
    this.transform.set(`translate(${x}px, ${y}px) scale(${s})`);
  }

  constructor() {
    document.documentElement.classList.add('is-output');
    this.fit();
    this.store.connect('output');
    effect(() => {
      const next = this.target();
      untracked(() => {
        const cur = this.displayed();
        if (!next || !cur || cur.id === next.id) this.displayed.set(next);
        else void this.transition(next);
      });
    });
  }

  /** Switch to `next` using the transition set on that scene. */
  private async transition(next: Scene): Promise<void> {
    if (this.switching) {
      this.displayed.set(next);
      return;
    }
    this.switching = true;
    try {
      const t = { ...DEFAULT_TRANSITION, ...next.transition };
      if (t.kind === 'cut') {
        this.displayed.set(next);
        return;
      }
      const layer = this.stage().nativeElement;
      const dur = this.motion.d(t.duration);
      if (this.motion.reduced()) {
        // reduce motion: no movement, just a short crossfade
        await this.swapWith(next, layer, 'fade', this.motion.d(0.4));
        return;
      }
      switch (t.kind) {
        case 'glide':
          await this.glide(next, layer);
          return;
        case 'stinger':
          await this.sting(next, t.color || this.accentFor(next), t.showName ? next.name : '', dur);
          return;
        default:
          await this.swapWith(next, layer, t.kind, dur);
      }
    } finally {
      gsap.set(this.stage().nativeElement, { clearProps: 'opacity,transform,clipPath' });
      this.switching = false;
    }
  }

  /** Swap after `out`, then play `in`: fade / slide / zoom / wipe of the whole scene layer. */
  private async swapWith(next: Scene, layer: HTMLElement, kind: TransitionKind, dur: number): Promise<void> {
    const outD = dur * 0.4;
    const inD = dur * 0.6;
    const out: gsap.TweenVars = { duration: outD, ease: 'power2.in' };
    const from: gsap.TweenVars = {};
    const to: gsap.TweenVars = { duration: inD, ease: 'power3.out' };
    switch (kind) {
      case 'fade':
        Object.assign(out, { opacity: 0 });
        Object.assign(from, { opacity: 0 });
        Object.assign(to, { opacity: 1 });
        break;
      case 'slide':
        Object.assign(out, { x: -120, opacity: 0 });
        Object.assign(from, { x: 120, opacity: 0 });
        Object.assign(to, { x: 0, opacity: 1 });
        break;
      case 'zoom':
        Object.assign(out, { scale: 0.94, opacity: 0 });
        Object.assign(from, { scale: 1.06, opacity: 0 });
        Object.assign(to, { scale: 1, opacity: 1 });
        break;
      case 'wipe':
        Object.assign(out, { clipPath: 'inset(0% 0% 0% 100%)' });
        Object.assign(from, { clipPath: 'inset(0% 100% 0% 0%)' });
        Object.assign(to, { clipPath: 'inset(0% 0% 0% 0%)' });
        break;
      default:
        break;
    }
    await play(gsap.to(layer, out), outD);
    this.displayed.set(this.target() ?? next);
    gsap.set(layer, from);
    await this.nextFrame();
    await play(gsap.to(layer, to), inD);
  }

  /** Coloured panels sweep across, the scene swaps underneath while covered, then they sweep away. */
  private async sting(next: Scene, color: string, name: string, dur: number): Promise<void> {
    const el = this.stinger().nativeElement;
    const [back, front] = Array.from(el.querySelectorAll<HTMLElement>('.sp'));
    const label = this.sname().nativeElement;
    el.style.setProperty('--st', color);
    label.textContent = name;
    const inD = dur * 0.38;
    const outD = dur * 0.42;
    gsap.set(el, { visibility: 'visible' });
    gsap.set([back, front], { x: 0, xPercent: -115, skewX: -12 });
    gsap.set(label, { opacity: 0, x: -30 });
    const cover = gsap
      .timeline()
      .to(back, { xPercent: 0, duration: inD, ease: 'power3.in' }, 0)
      .to(front, { xPercent: 0, duration: inD, ease: 'power3.in' }, inD * 0.18)
      .to(label, { opacity: 1, x: 0, duration: inD * 0.6, ease: 'power3.out' }, inD * 0.7);
    await play(cover, inD * 1.4);
    this.displayed.set(this.target() ?? next);
    await this.nextFrame();
    await wait(dur * 0.12 * 1000);
    const reveal = gsap
      .timeline()
      .to(label, { opacity: 0, x: 30, duration: outD * 0.5, ease: 'power2.in' }, 0)
      .to(front, { xPercent: 115, duration: outD, ease: 'power3.out' }, 0)
      .to(back, { xPercent: 115, duration: outD, ease: 'power3.out' }, outD * 0.15);
    await play(reveal, outD * 1.3);
    gsap.set(el, { visibility: 'hidden' });
  }

  /** Fade out widgets that are leaving, then glide shared widgets (same id) to their new boxes. */
  private async glide(next: Scene, root: HTMLElement): Promise<void> {
    const keep = new Set(next.widgets.map((w) => w.id));
    const hosts = Array.from(root.querySelectorAll<HTMLElement>('.widget-host'));
    const leaving = hosts.filter((el) => !keep.has(el.dataset['flipId'] ?? ''));
    await Promise.all(leaving.map((el) => this.motion.exit(el, 'fade')));
    const state = Flip.getState(hosts.filter((el) => !leaving.includes(el)));
    // pick up edits that landed while we were fading
    this.displayed.set(this.target() ?? next);
    afterNextRender(
      () => {
        Flip.from(state, { duration: this.motion.d(0.5), ease: 'power3.inOut' });
      },
      { injector: this.injector },
    );
  }

  private accentFor(scene: Scene): string {
    const theme = THEMES[scene.theme] ?? THEMES.night;
    return (theme.accentFromTeam ? this.store.teamColor() : null) ?? theme.tokens.accent;
  }

  /** resolve after Angular has rendered the swapped scene */
  private nextFrame(): Promise<void> {
    return new Promise((resolve) => afterNextRender(() => resolve(), { injector: this.injector }));
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Await a tween, but never hang if the browser pauses rAF (hidden tab). */
function play(tween: gsap.core.Animation, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      tween.progress(1);
      resolve();
    };
    tween.eventCallback('onComplete', finish);
    setTimeout(finish, seconds * 1000 + 250);
  });
}
