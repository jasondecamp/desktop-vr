import type { EyePosition } from '../tracking/types';
import type { ScreenConfig } from '../projection/types';

export interface CSSAdapterConfig {
  /** The container element that holds the depth-layered content */
  container: HTMLElement;
  /** Physical screen dimensions */
  screen: ScreenConfig;
  /**
   * How aggressively to scale eye movement into perspective shift.
   * Higher = more dramatic parallax. Default: 1.0
   */
  sensitivity?: number;
}

/**
 * CSS 3D Adapter — applies head-tracked perspective to a CSS 3D transform context.
 *
 * Usage: child elements of the container should use `transform: translateZ(Npx)`
 * to place themselves at different depth layers. Positive Z = closer to viewer,
 * negative Z = further away.
 *
 * The adapter sets `perspective` and `perspective-origin` on the container
 * to match the viewer's tracked position.
 */
export class CSSAdapter {
  private container: HTMLElement;
  private screen: ScreenConfig;
  private sensitivity: number;

  constructor(config: CSSAdapterConfig) {
    this.container = config.container;
    this.screen = config.screen;
    this.sensitivity = config.sensitivity ?? 1.0;

    // Set up the container for CSS 3D
    this.container.style.transformStyle = 'preserve-3d';
    this.container.style.overflow = 'hidden';
  }

  update(eye: EyePosition): void {
    const containerRect = this.container.getBoundingClientRect();
    const containerW = containerRect.width;
    const containerH = containerRect.height;

    // Convert eye Z distance (meters) to a CSS perspective value (pixels).
    // Map physical meters to pixel space using the container/screen ratio.
    const pixelsPerMeter = containerW / this.screen.widthMeters;
    const perspectivePx = eye.z * pixelsPerMeter;

    // Convert eye X/Y offset from screen center (meters) to pixel offset.
    // perspective-origin is relative to the container's top-left corner.
    const originX = (containerW / 2) + (eye.x * pixelsPerMeter * this.sensitivity);
    const originY = (containerH / 2) - (eye.y * pixelsPerMeter * this.sensitivity);

    this.container.style.perspective = `${perspectivePx}px`;
    this.container.style.perspectiveOrigin = `${originX}px ${originY}px`;
  }
}
