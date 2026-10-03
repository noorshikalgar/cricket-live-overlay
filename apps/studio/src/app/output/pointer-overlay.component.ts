import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DEFAULT_POINTER, type ScenePointer } from '@cos/shared';
import { LiveStore } from '../core/live.store';
import { gsap } from '../motion/gsap';

/** how long a point stays in the motion-blur trail */
const TRAIL_MS = 140;
/** position smoothing: share of the remaining distance covered per 60 fps frame */
const FOLLOW = 0.45;

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * On-air pointer, driven live from the Studio canvas. The cursor eases toward the
 * latest position; a short fading trail and a stretch along the direction of travel
 * give it motion blur, so fast moves read smoothly at stream frame rates.
 */
@Component({
  selector: 'cos-pointer-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #trail width="1920" height="1080"></canvas>
    <div class="ripples" #ripples></div>
    <div class="cursor" #cursor [style.--c]="cfg().color" [style.--s.px]="cfg().size">
      @switch (cfg().style) {
        @case ('ring') {
          <div class="ring"></div>
        }
        @case ('ball') {
          <svg viewBox="0 0 64 64" class="art" aria-hidden="true">
            <defs>
              <radialGradient id="ballShade" cx="38%" cy="32%" r="70%">
                <stop offset="0" stop-color="#ef4444" />
                <stop offset="0.55" stop-color="#b91c1c" />
                <stop offset="1" stop-color="#6b0f0f" />
              </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="29" fill="url(#ballShade)" />
            <path d="M14 10 C 30 24, 30 40, 14 54" fill="none" stroke="#fde7c7" stroke-width="2.2" stroke-dasharray="3 3" />
            <path d="M18 8 C 34 24, 34 40, 18 56" fill="none" stroke="#fde7c7" stroke-width="2.2" stroke-dasharray="3 3" />
            <ellipse cx="24" cy="20" rx="7" ry="4" fill="#fff" opacity="0.28" transform="rotate(-30 24 20)" />
          </svg>
        }
        @case ('bat') {
          <svg viewBox="0 0 64 64" class="art bat" aria-hidden="true">
            <g transform="rotate(-38 32 32)">
              <rect x="27" y="2" width="10" height="20" rx="4" fill="#1f2937" />
              <rect x="27.5" y="4" width="9" height="2" fill="#4b5563" />
              <rect x="27.5" y="9" width="9" height="2" fill="#4b5563" />
              <rect x="27.5" y="14" width="9" height="2" fill="#4b5563" />
              <path d="M24 22 h16 l2 34 q0 6 -10 6 q-10 0 -10 -6 z" fill="#e9c98f" stroke="#b08850" stroke-width="1.5" />
              <path d="M32 26 v30" stroke="#d1ab6f" stroke-width="2" />
            </g>
          </svg>
        }
        @default {
          <div class="dot"></div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 99999;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 1920px;
      height: 1080px;
    }
    .cursor {
      position: absolute;
      left: 0;
      top: 0;
      width: var(--s);
      height: var(--s);
      margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
      opacity: 0;
      will-change: transform, opacity;
    }
    .dot {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: var(--c);
      box-shadow:
        0 0 0 3px rgba(255, 255, 255, 0.9),
        0 0 18px 4px var(--c);
    }
    .ring {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 4px solid var(--c);
      box-shadow:
        0 0 14px 2px var(--c),
        inset 0 0 10px 1px var(--c);
    }
    .art {
      width: 100%;
      height: 100%;
      display: block;
      filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45));
    }
    .bat {
      transform: scale(1.5);
    }
    .ripples {
      position: absolute;
      inset: 0;
    }
  `,
})
export class PointerOverlayComponent {
  readonly settings = input<ScenePointer | undefined>(undefined);
  protected readonly cfg = computed<ScenePointer>(() => ({ ...DEFAULT_POINTER, ...this.settings() }));

  private readonly trailEl = viewChild.required<ElementRef<HTMLCanvasElement>>('trail');
  private readonly cursorEl = viewChild.required<ElementRef<HTMLElement>>('cursor');
  private readonly ripplesEl = viewChild.required<ElementRef<HTMLElement>>('ripples');

  private target = { x: 960, y: 540 };
  private pos = { x: 960, y: 540 };
  private visible = false;
  private trail: TrailPoint[] = [];
  private spin = 0;
  private lastTick = performance.now();
  private readonly tick = () => this.frame();

  constructor() {
    inject(LiveStore)
      .pointer.pipe(takeUntilDestroyed())
      .subscribe((p) => {
        if (!this.cfg().enabled) return;
        if (p.visible && !this.visible) {
          // appear where the pointer is, not sliding in from the last spot
          this.pos = { x: p.x, y: p.y };
          this.trail = [];
        }
        this.target = { x: p.x, y: p.y };
        this.setVisible(p.visible);
        if (p.click) this.ripple(p.x, p.y);
      });
    afterNextRender(() => gsap.ticker.add(this.tick));
    inject(DestroyRef).onDestroy(() => gsap.ticker.remove(this.tick));
  }

  private setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    gsap.to(this.cursorEl().nativeElement, { opacity: v ? 1 : 0, duration: v ? 0.15 : 0.35, ease: 'power2.out' });
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(64, now - this.lastTick);
    this.lastTick = now;
    if (!this.visible && this.trail.length === 0) return;

    const k = 1 - Math.pow(1 - FOLLOW, dt / 16.67);
    const prev = { ...this.pos };
    this.pos.x += (this.target.x - this.pos.x) * k;
    this.pos.y += (this.target.y - this.pos.y) * k;
    const vx = this.pos.x - prev.x;
    const vy = this.pos.y - prev.y;
    const speed = Math.hypot(vx, vy) / Math.max(1, dt / 16.67);
    const cfg = this.cfg();

    if (this.visible) this.trail.push({ x: this.pos.x, y: this.pos.y, t: now });
    this.trail = this.trail.filter((p) => now - p.t < TRAIL_MS);
    this.drawTrail(now, cfg);

    // motion blur: stretch along the direction of travel (dot / ring), spin the ball, tilt the bat
    const blur = cfg.motionBlur ? Math.min(1.1, speed / 35) : 0;
    const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
    let transform = `translate(${this.pos.x}px, ${this.pos.y}px)`;
    if (cfg.style === 'dot' || cfg.style === 'ring') {
      transform += ` rotate(${angle}deg) scale(${1 + blur}, ${1 - blur * 0.25}) rotate(${-angle}deg)`;
    } else if (cfg.style === 'ball') {
      this.spin += vx * 2.2;
      transform += ` rotate(${this.spin}deg) scale(${1 + blur * 0.15})`;
    } else {
      transform += ` rotate(${Math.max(-25, Math.min(25, vx * 1.6))}deg)`;
    }
    this.cursorEl().nativeElement.style.transform = transform;
  }

  private drawTrail(now: number, cfg: ScenePointer): void {
    const canvas = this.trailEl().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cfg.motionBlur || this.trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      const life = 1 - (now - b.t) / TRAIL_MS;
      ctx.strokeStyle = cfg.color;
      ctx.globalAlpha = Math.max(0, life) * 0.45;
      ctx.lineWidth = cfg.size * (0.25 + 0.6 * life);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private ripple(x: number, y: number): void {
    const el = document.createElement('div');
    const size = this.cfg().size * 1.6;
    Object.assign(el.style, {
      position: 'absolute',
      left: `${x - size / 2}px`,
      top: `${y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      border: `3px solid ${this.cfg().color}`,
      boxShadow: `0 0 12px ${this.cfg().color}`,
    });
    this.ripplesEl().nativeElement.append(el);
    gsap.fromTo(
      el,
      { scale: 0.3, opacity: 1 },
      { scale: 2.2, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => el.remove() },
    );
  }
}
