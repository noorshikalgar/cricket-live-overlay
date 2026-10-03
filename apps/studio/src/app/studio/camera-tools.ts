import { CANVAS_H, CANVAS_W, type WidgetInstance } from '@cos/shared';
import { cameraRadiusPx, type CameraShape } from '../widgets/camera/camera.widget';

/**
 * PNG mask for OBS's Image Mask/Blend filter ("Alpha Mask (Alpha Channel)"):
 * opaque white where the webcam should show, transparent elsewhere.
 *
 * - `canvas`: 1920×1080 with the shape at the frame's position. Apply it to a
 *   nested scene that holds the webcam positioned on the full canvas.
 * - `frame`: just the frame's w×h. Apply it directly to the webcam source after
 *   cropping the webcam to the same aspect ratio.
 */
export function exportCameraMask(w: WidgetInstance, themeRadius: number, mode: 'canvas' | 'frame'): void {
  const shape = (typeof w.props['shape'] === 'string' ? w.props['shape'] : 'rounded') as CameraShape;
  const canvas = document.createElement('canvas');
  canvas.width = mode === 'canvas' ? CANVAS_W : w.w;
  canvas.height = mode === 'canvas' ? CANVAS_H : w.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const x = mode === 'canvas' ? w.x : 0;
  const y = mode === 'canvas' ? w.y : 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.ellipse(x + w.w / 2, y + w.h / 2, w.w / 2, w.h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.roundRect(x, y, w.w, w.h, cameraRadiusPx(shape, w.w, w.h, themeRadius));
  }
  ctx.fill();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `camera-mask-${mode}-${w.w}x${w.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}

/** Text for OBS Edit Transform (Ctrl+E). */
export function obsTransformText(w: WidgetInstance): string {
  return `Position: ${w.x}, ${w.y}\nBounding box: ${w.w} × ${w.h}`;
}
