import type { EyePosition } from '../tracking/types';
import type { ScreenConfig } from '../projection/types';
import type { EyeSource } from './types';
import { screenFromViewport } from '../projection/screenFromViewport';

export interface OrientationSourceConfig {
  /** Virtual head distance from the screen in meters (EyePosition.z). Default: 0.6 */
  distance?: number;
  /**
   * Eye offset at full tilt, as a fraction of the screen's half-width
   * (horizontally) or half-height (vertically). Default: 0.5
   */
  range?: number;
  /** Tilt in degrees, from the orientation at start, that reaches full range. Default: 20 */
  maxTiltDegrees?: number;
}

type PermissionedOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * Phone or tablet tilt as a virtual head at a fixed distance. Tilt is measured
 * relative to how the device was held when `start()` ran (see `recenter()`).
 *
 * On iOS, `start()` asks for motion permission, so it must be called from a
 * user gesture; a refusal rejects with an error the page can show.
 */
export class OrientationSource implements EyeSource {
  private distance: number;
  private range: number;
  private maxTilt: number;
  private screen: ScreenConfig | null = null;
  private emit: ((position: EyePosition) => void) | null = null;
  private running = false;
  private baseline: { beta: number; gamma: number } | null = null;

  constructor(config: OrientationSourceConfig = {}) {
    this.distance = config.distance ?? 0.6;
    this.range = config.range ?? 0.5;
    this.maxTilt = config.maxTiltDegrees ?? 20;
  }

  async start(emit: (position: EyePosition) => void): Promise<void> {
    const Orientation = (typeof DeviceOrientationEvent === 'undefined'
      ? undefined
      : DeviceOrientationEvent) as PermissionedOrientationEvent | undefined;
    if (!Orientation) {
      throw new Error('Device orientation is not supported in this browser');
    }
    // iOS 13+: must be requested synchronously inside the user gesture
    if (typeof Orientation.requestPermission === 'function') {
      const result = await Orientation.requestPermission();
      if (result !== 'granted') {
        throw new Error('Motion and orientation access was denied');
      }
    }

    this.emit = emit;
    if (this.running) return;
    this.running = true;
    this.baseline = null;
    window.addEventListener('deviceorientation', this.handleOrientation);
    emit(this.toEyePosition(0, 0));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('deviceorientation', this.handleOrientation);
  }

  destroy(): void {
    this.stop();
    this.emit = null;
  }

  updateScreen(screen: ScreenConfig): void {
    this.screen = { ...screen };
  }

  /** Treat the device's current orientation as centered */
  recenter(): void {
    this.baseline = null;
  }

  getDistance(): number {
    return this.distance;
  }

  setDistance(meters: number): void {
    this.distance = meters;
  }

  /**
   * Maps normalized tilt (-1..1, screen-aligned: +x right, +y up) to an eye
   * position (exposed for tests).
   */
  toEyePosition(tiltX: number, tiltY: number): EyePosition {
    const screen = this.screen ?? screenFromViewport();
    return {
      x: tiltX * this.range * (screen.widthMeters / 2),
      y: tiltY * this.range * (screen.heightMeters / 2),
      z: this.distance,
    };
  }

  private handleOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta === null || e.gamma === null) return;
    if (!this.baseline) {
      this.baseline = { beta: e.beta, gamma: e.gamma };
    }
    const dBeta = wrapDegrees(e.beta - this.baseline.beta);
    const dGamma = wrapDegrees(e.gamma - this.baseline.gamma);

    // In device axes: tipping the right edge away (gamma +) puts the eye to
    // the left of the screen's normal; tipping the top edge toward you
    // (beta +) puts it above.
    const deviceX = 0 - dGamma / this.maxTilt;
    const deviceY = dBeta / this.maxTilt;

    // Rotate into screen axes when the page is in landscape
    const angle = (screenAngle() * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = deviceX * cos - deviceY * sin;
    const y = deviceX * sin + deviceY * cos;

    this.emit?.(this.toEyePosition(clamp(x), clamp(y)));
  };
}

function screenAngle(): number {
  return window.screen?.orientation?.angle
    ?? (window as Window & { orientation?: number }).orientation
    ?? 0;
}

function wrapDegrees(d: number): number {
  return ((d + 540) % 360) - 180;
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
