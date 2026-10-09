import { ChangeDetectionStrategy, Component, ElementRef, effect, untracked, viewChild } from '@angular/core';
import { WidgetBase } from '../widget-base';

export interface VideoProps {
  /** uploaded file (/uploads/…) or an http(s) URL */
  src: string;
  fit: 'cover' | 'contain';
  loop: boolean;
  /** browsers only autoplay muted video; in OBS enable "Control audio via OBS" to hear it */
  muted: boolean;
  playing: boolean;
  /** changes on "Restart" so every Output jumps back to the start */
  startedAt: number | null;
  panel: boolean;
}

/** A video clip on the overlay (intro, sponsor loop, replay), controlled from the Studio. */
@Component({
  selector: 'cos-video',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box" [class.panel]="p().panel">
      @if (p().src) {
        <video
          #video
          [src]="p().src"
          [style.object-fit]="p().fit"
          [loop]="p().loop"
          [muted]="p().muted"
          playsinline
          preload="auto"
        ></video>
      } @else if (editing()) {
        <div class="empty">▶ Upload a video in settings (MP4 or WebM)</div>
      }
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
      overflow: hidden;
    }
    .box.panel {
      padding: 0;
    }
    video {
      width: 100%;
      height: 100%;
      display: block;
      background: transparent;
    }
    .empty {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      border: 2px dashed rgba(255, 255, 255, 0.35);
      border-radius: var(--radius);
      color: rgba(255, 255, 255, 0.75);
      font: 500 20px/1.3 Inter, Mukta, sans-serif;
      padding: 12px;
    }
  `,
})
export class VideoWidget extends WidgetBase<VideoProps> {
  protected readonly defaults: VideoProps = {
    src: '',
    fit: 'cover',
    loop: true,
    muted: true,
    playing: true,
    startedAt: null,
    panel: false,
  };
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private lastStart: number | null = null;

  constructor() {
    super();
    effect(() => {
      const el = this.video()?.nativeElement;
      const { playing, startedAt, muted } = this.p();
      untracked(() => {
        if (!el) return;
        el.muted = muted;
        if (startedAt !== this.lastStart) {
          this.lastStart = startedAt;
          el.currentTime = 0;
        }
        if (playing) void el.play().catch(() => undefined);
        else el.pause();
      });
    });
  }
}
