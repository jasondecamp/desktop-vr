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
  private scrollOffsetY = 0;

  constructor(config: CSSAdapterConfig) {
    this.container = config.container;
    this.screen = config.screen;
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

    // perspective-origin is relative to the container's top-left corner.
    // X: centered on the container width, offset by eye X.
    // Y: centered on the current viewport (scrollY + viewportH/2), offset by eye Y.
    // This keeps the perspective origin tracking the visible area when scrolling.
    const originX = (containerW / 2) + (eye.x * pixelsPerMeter * this.sensitivity);
    const viewportCenterY = this.scrollOffsetY + window.innerHeight / 2;
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
