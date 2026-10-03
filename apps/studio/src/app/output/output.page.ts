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
import type { Scene } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { Flip } from '../motion/gsap';
import { MotionService } from '../motion/motion.service';
import { SceneRendererComponent } from '../widgets/scene-renderer.component';

/**
 * /output and /output/:sceneId — the transparent 1920×1080 page OBS loads.
 * No editor code, no cursor, no warnings: only the widgets.
 * Without a sceneId it follows the scene put on air from the Studio.
 */
@Component({
  selector: 'cos-output-page',
  imports: [SceneRendererComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.reduce-motion]': 'motion.reduced()' },
  template: `
    <div class="stage" #stage>
      @if (displayed(); as scene) {
        <cos-scene-renderer [scene]="scene" [match]="store.match()" [teamColor]="store.teamColor()" mode="output" />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      cursor: none;
      background: transparent;
    }
    .stage {
      position: relative;
      width: 1920px;
      height: 1080px;
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

  private readonly target = computed<Scene | null>(() => {
    const id = this.sceneId();
    return id ? (this.store.scenes()[id] ?? null) : this.store.activeScene();
  });
  protected readonly displayed = signal<Scene | null>(null);
  private switching = false;

  constructor() {
    document.documentElement.classList.add('is-output');
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

  /** Fade out widgets that are leaving, then glide shared widgets (same id) to their new boxes. */
  private async transition(next: Scene): Promise<void> {
    if (this.switching) {
      this.displayed.set(next);
      return;
    }
    this.switching = true;
    try {
      const root = this.stage().nativeElement;
      if (this.motion.reduced()) {
        this.displayed.set(next);
        return;
      }
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
    } finally {
      this.switching = false;
    }
  }
}
