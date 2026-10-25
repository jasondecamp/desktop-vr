import type { EyePosition } from '../tracking/types';
import type { ScreenConfig } from '../projection/types';
import { screenFromViewport } from '../projection/screenFromViewport';

export interface CSSAdapterConfig {
  /** The container element that holds the depth-layered content */
  container: HTMLElement;
  /**
   * Physical screen dimensions. If omitted, auto-computed from the
   * browser viewport using CSS PPI (see `ppi` option).
   */
  screen?: ScreenConfig;
  /**
   * CSS pixels per physical inch, used to compute screen dimensions
   * when `screen` is not provided. Default: 96
   */
  ppi?: number;
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
  private scrollOffsetY = 0;

  constructor(config: CSSAdapterConfig) {
    this.container = config.container;
    this.screen = config.screen ?? screenFromViewport(config.ppi);
    this.sensitivity = config.sensitivity ?? 1.0;

    // Set up the container for CSS 3D
    this.container.style.transformStyle = 'preserve-3d';
  }

  updateScreen(screen: ScreenConfig): void {
    this.screen = screen;
  }

  update(eye: EyePosition): void {
    const containerW = this.container.offsetWidth;

    // Convert eye Z distance (meters) to a CSS perspective value (pixels).
    const pixelsPerMeter = containerW / this.screen.widthMeters;
    const perspectivePx = eye.z * pixelsPerMeter;

    // perspective-origin is relative to the container's top-left corner,
    // but we anchor it to the viewport center so it stays correct when
    // the container is taller than the viewport (scrollable content).
    const originX = (containerW / 2) + (eye.x * pixelsPerMeter * this.sensitivity);
    const viewportCenterY = window.scrollY + window.innerHeight / 2;
    const originY = viewportCenterY - (eye.y * pixelsPerMeter * this.sensitivity);

    this.container.style.perspective = `${perspectivePx}px`;
    this.container.style.perspectiveOrigin = `${originX}px ${originY}px`;
  }

  /** Set a vertical pixel offset added to the perspective origin (e.g., from scroll position) */
  setScrollOffsetY(px: number): void {
    this.scrollOffsetY = px;
  }

  getScrollOffsetY(): number {
    return this.scrollOffsetY;
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  getSensitivity(): number {
    return this.sensitivity;
  }
}
