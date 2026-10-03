import { OBSWebSocket } from 'obs-websocket-js';
import type { ObsStatus, Scene, WidgetInstance } from '@cos/shared';

/**
 * Optional bridge to OBS (obs-websocket v5, built into OBS 28+). When enabled it
 * moves, scales and crops the webcam source so it fills the active scene's
 * Camera frame. Off by default; the manual Edit Transform method needs no setup.
 */
export class ObsBridge {
  private obs = new OBSWebSocket();
  private connected = false;
  private enabled = false;
  private lastError: string | null = null;
  private connecting: Promise<void> | null = null;
  private pending: WidgetInstance | null = null;
  private placeTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: { url: string; password: string; webcamSource: string },
    private readonly onStatus: (s: ObsStatus) => void,
  ) {
    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      this.emit();
    });
  }

  get status(): ObsStatus {
    return { enabled: this.enabled, connected: this.connected, error: this.lastError };
  }

  async setEnabled(on: boolean): Promise<void> {
    this.enabled = on;
    if (!on) {
      if (this.connected) await this.obs.disconnect().catch(() => undefined);
      this.connected = false;
      this.lastError = null;
      this.emit();
      return;
    }
    await this.ensureConnected();
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (!this.connecting) {
      this.connecting = (async () => {
        try {
          await this.obs.connect(this.cfg.url, this.cfg.password || undefined);
          this.connected = true;
          this.lastError = null;
        } catch (err) {
          this.connected = false;
          this.lastError = `Cannot reach OBS at ${this.cfg.url}: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
          this.connecting = null;
          this.emit();
        }
      })();
    }
    await this.connecting;
  }

  /** Debounced: call on every scene change, the webcam follows the frame. */
  placeFor(scene: Scene | undefined): void {
    if (!this.enabled || !scene) return;
    const cam = scene.widgets.filter((w) => w.type === 'camera' && w.visible).sort((a, b) => b.z - a.z)[0];
    if (!cam) return;
    this.pending = cam;
    if (this.placeTimer) clearTimeout(this.placeTimer);
    this.placeTimer = setTimeout(() => void this.flush(), 150);
  }

  private async flush(): Promise<void> {
    const cam = this.pending;
    this.pending = null;
    if (!cam) return;
    await this.ensureConnected();
    if (!this.connected) return;
    try {
      const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
      const { sceneItemId } = await this.obs.call('GetSceneItemId', {
        sceneName: currentProgramSceneName,
        sourceName: this.cfg.webcamSource,
      });
      const { sceneItemTransform } = await this.obs.call('GetSceneItemTransform', {
        sceneName: currentProgramSceneName,
        sceneItemId,
      });
      const srcW = Number(sceneItemTransform['sourceWidth']) || 1920;
      const srcH = Number(sceneItemTransform['sourceHeight']) || 1080;
      // crop the source to the frame's aspect ratio (centre crop), then scale to fill it
      const frameAspect = cam.w / cam.h;
      let cropW = srcW;
      let cropH = srcH;
      if (srcW / srcH > frameAspect) cropW = Math.round(srcH * frameAspect);
      else cropH = Math.round(srcW / frameAspect);
      const cropX = Math.round((srcW - cropW) / 2);
      const cropY = Math.round((srcH - cropH) / 2);
      const scale = cam.w / cropW;
      await this.obs.call('SetSceneItemTransform', {
        sceneName: currentProgramSceneName,
        sceneItemId,
        sceneItemTransform: {
          positionX: cam.x,
          positionY: cam.y,
          alignment: 5, // top-left
          rotation: 0,
          scaleX: scale,
          scaleY: scale,
          cropLeft: cropX,
          cropRight: srcW - cropW - cropX,
          cropTop: cropY,
          cropBottom: srcH - cropH - cropY,
          boundsType: 'OBS_BOUNDS_NONE',
        },
      });
      this.lastError = null;
    } catch (err) {
      this.lastError = `OBS: ${err instanceof Error ? err.message : String(err)} (is the source named "${this.cfg.webcamSource}"?)`;
    }
    this.emit();
  }

  private emit(): void {
    this.onStatus(this.status);
  }
}
