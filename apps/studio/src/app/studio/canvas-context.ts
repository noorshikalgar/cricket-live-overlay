import { Injectable, signal } from '@angular/core';
import type { Guides } from './snap';

/** Shared between the canvas and its edit boxes: current zoom and the alignment guides to draw. */
@Injectable()
export class CanvasContext {
  readonly scale = signal(0.5);
  readonly guides = signal<Guides>({ v: [], h: [] });
  /** size readout while resizing */
  readonly activeBox = signal<{ id: string; w: number; h: number } | null>(null);
}
