import type { EyePosition } from '../tracking/types';
import type { ScreenConfig } from '../projection/types';
import type { EyeSource } from './types';
import { screenFromViewport } from '../projection/screenFromViewport';
import { Transition } from '../core/transition';

export interface PointerSourceConfig {
  /** Virtual head distance from the screen in meters (EyePosition.z). Default: 0.6 */
  distance?: number;
  /**
   * Eye offset at the viewport edge, as a fraction of the screen's half-width
   * (horizontally) or half-height (vertically). Default: 0.75
   */
  range?: number;
  /** Ease back to center when the pointer leaves the window. Default: true */
  restOnLeave?: boolean;
  /** Duration of the ease on leaving and re-entering the window. Default: 400 */
  easeMs?: number;
}

/** Normalized pointer position: -1..1 across the viewport, +y down */
interface PointerPoint {
  x: number;
  y: number;
}

const CENTER: PointerPoint = { x: 0, y: 0 };

/**
 * Mouse or trackpad as a virtual head at a fixed distance. Touch is ignored:
 * dragging on a phone is scrolling, not looking.
 */
export class PointerSource implements EyeSource {
  private distance: number;
  private range: number;
  private restOnLeave: boolean;
  private easeMs: number;
  private screen: ScreenConfig | null = null;
  private emit: ((position: EyePosition) => void) | null = null;
  private running = false;
  /** Last emitted point, and where the pointer actually is (null when outside) */
  private current: PointerPoint = { ...CENTER };
  private pointer: PointerPoint | null = null;
  /** Set until the first move after start or after leaving, so entry eases in */
  private entering = true;
  private transition: Transition | null = null;
  private frameId: number | null = null;

  constructor(config: PointerSourceConfig = {}) {
    this.distance = config.distance ?? 0.6;
    this.range = config.range ?? 0.75;
    this.restOnLeave = config.restOnLeave ?? true;
    this.easeMs = config.easeMs ?? 400;
  }

  async start(emit: (position: EyePosition) => void): Promise<void> {
    this.emit = emit;
    if (this.running) return;
    this.running = true;
    this.entering = true;
    window.addEventListener('pointermove', this.handleMove, { passive: true });
    document.addEventListener('pointerout', this.handleOut, { passive: true });
    this.emitPoint(this.current);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('pointermove', this.handleMove);
    document.removeEventListener('pointerout', this.handleOut);
    this.cancelFrame();
    this.transition = null;
    this.pointer = null;
  }

  destroy(): void {
    this.stop();
    this.emit = null;
  }

  updateScreen(screen: ScreenConfig): void {
    this.screen = { ...screen };
  }

  getDistance(): number {
    return this.distance;
  }

  /** Change the virtual head distance; applied immediately (animate by calling repeatedly) */
  setDistance(meters: number): void {
    this.distance = meters;
    if (this.running && !this.transition) this.emitPoint(this.current);
  }

  getRange(): number {
    return this.range;
  }

  setRange(range: number): void {
    this.range = range;
    if (this.running && !this.transition) this.emitPoint(this.current);
  }

  /** Maps a normalized pointer point to an eye position (exposed for tests) */
  toEyePosition(point: PointerPoint): EyePosition {
    const screen = this.screen ?? screenFromViewport();
    return {
      x: point.x * this.range * (screen.widthMeters / 2),
      // `0 -` rather than unary minus so the center is 0, not -0
      y: 0 - point.y * this.range * (screen.heightMeters / 2),
      z: this.distance,
    };
  }

  private handleMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.pointer = {
      x: clamp((e.clientX / w) * 2 - 1),
      y: clamp((e.clientY / h) * 2 - 1),
    };
    if (this.entering) {
      this.entering = false;
      this.beginTransition();
    } else if (!this.transition) {
      this.emitPoint(this.pointer);
    }
  };

  private handleOut = (e: PointerEvent): void => {
    // relatedTarget is null only when the pointer leaves the document
    if (e.relatedTarget !== null || e.pointerType === 'touch') return;
    this.entering = true;
    if (!this.restOnLeave) return;
    this.pointer = null;
    this.beginTransition();
  };

  private beginTransition(): void {
    // Blends run in normalized space (z unused), so distance/range changes apply mid-blend
    this.transition = new Transition({ ...this.current, z: 0 }, performance.now(), this.easeMs);
    if (this.frameId === null) this.frameId = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.frameId = null;
    if (!this.running || !this.transition) return;
    const now = performance.now();
    const goal = this.pointer ?? CENTER;
    const point = this.transition.sample({ ...goal, z: 0 }, now);
    if (this.transition.isDone(now)) this.transition = null;
    this.emitPoint(point);
    if (this.transition) this.frameId = requestAnimationFrame(this.tick);
  };

  private emitPoint(point: PointerPoint): void {
    this.current = { x: point.x, y: point.y };
    this.emit?.(this.toEyePosition(point));
  }

  private cancelFrame(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
