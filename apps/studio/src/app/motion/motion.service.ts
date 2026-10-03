import { Injectable, computed, inject } from '@angular/core';
import type { AnimPreset } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { gsap } from './gsap';

/** Short, purposeful motion. Distances in px, durations in seconds before the speed multiplier. */
const SLIDE = 14;
const ENTER_S = 0.4;
const EXIT_S = 0.25;

type Tween = gsap.core.Tween | gsap.core.Timeline;

/** Global motion settings (reduce motion, speed) plus the shared enter/exit presets. */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly store = inject(LiveStore);

  readonly reduced = computed(() => this.store.settings().reduceMotion);
  readonly speed = computed(() => this.store.settings().speed || 1);

  /** seconds → seconds scaled by the speed multiplier */
  d(seconds: number): number {
    return seconds / this.speed();
  }

  /**
   * Enter animation with a safety net: if the browser pauses animation frames
   * (hidden tab, covered window) the tween is forced to its end state, so a widget
   * can never be left invisible.
   */
  enter(el: HTMLElement, preset: AnimPreset, delayMs = 0): Tween | null {
    const t = this.enterTween(el, preset, delayMs);
    if (t) {
      const ms = (t.delay() + t.duration()) * 1000 + 400;
      setTimeout(() => {
        if (t.progress() < 1) t.progress(1);
      }, ms);
    }
    return t;
  }

  private enterTween(el: HTMLElement, preset: AnimPreset, delayMs: number): Tween | null {
    gsap.killTweensOf(el);
    const delay = this.d(delayMs / 1000);
    if (preset === 'none') {
      gsap.set(el, { clearProps: 'opacity,transform,clipPath', visibility: 'visible' });
      return null;
    }
    if (this.reduced()) {
      return gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: this.d(0.2), delay, clearProps: 'opacity' });
    }
    const base = { duration: this.d(ENTER_S), delay, ease: 'power3.out' };
    switch (preset) {
      case 'fade':
        return gsap.fromTo(el, { autoAlpha: 0 }, { ...base, autoAlpha: 1 });
      case 'slideUp':
        return gsap.fromTo(el, { autoAlpha: 0, y: SLIDE }, { ...base, autoAlpha: 1, y: 0, clearProps: 'transform' });
      case 'slideDown':
        return gsap.fromTo(el, { autoAlpha: 0, y: -SLIDE }, { ...base, autoAlpha: 1, y: 0, clearProps: 'transform' });
      case 'slideLeft':
        return gsap.fromTo(el, { autoAlpha: 0, x: SLIDE }, { ...base, autoAlpha: 1, x: 0, clearProps: 'transform' });
      case 'slideRight':
        return gsap.fromTo(el, { autoAlpha: 0, x: -SLIDE }, { ...base, autoAlpha: 1, x: 0, clearProps: 'transform' });
      case 'wipe':
        return gsap.fromTo(
          el,
          { autoAlpha: 1, clipPath: 'inset(0% 100% 0% 0%)' },
          { ...base, clipPath: 'inset(0% 0% 0% 0%)', clearProps: 'clipPath' },
        );
    }
  }

  exit(el: HTMLElement, preset: AnimPreset): Promise<void> {
    gsap.killTweensOf(el);
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      // GSAP runs on rAF, which browsers pause in hidden tabs; never let a scene switch hang on it
      setTimeout(() => {
        if (settled) return;
        gsap.set(el, { autoAlpha: 0 });
        done();
      }, this.d(EXIT_S) * 1000 + 150);
      if (preset === 'none') {
        gsap.set(el, { autoAlpha: 0 });
        return done();
      }
      if (this.reduced()) {
        gsap.to(el, { autoAlpha: 0, duration: this.d(0.15), onComplete: done });
        return;
      }
      const base = { duration: this.d(EXIT_S), ease: 'power2.in', onComplete: done };
      switch (preset) {
        case 'fade':
          gsap.to(el, { ...base, autoAlpha: 0 });
          return;
        case 'slideUp':
          gsap.to(el, { ...base, autoAlpha: 0, y: SLIDE });
          return;
        case 'slideDown':
          gsap.to(el, { ...base, autoAlpha: 0, y: -SLIDE });
          return;
        case 'slideLeft':
          gsap.to(el, { ...base, autoAlpha: 0, x: SLIDE });
          return;
        case 'slideRight':
          gsap.to(el, { ...base, autoAlpha: 0, x: -SLIDE });
          return;
        case 'wipe':
          gsap.to(el, { ...base, clipPath: 'inset(0% 0% 0% 100%)', onComplete: () => {
            gsap.set(el, { autoAlpha: 0, clearProps: 'clipPath' });
            done();
          } });
          return;
      }
    });
  }
}
