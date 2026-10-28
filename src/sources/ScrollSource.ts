import type { EyePosition } from '../tracking/types';
import type { ScreenConfig } from '../projection/types';
import type { EyeSource } from './types';
import { screenFromViewport } from '../projection/screenFromViewport';
import { Transition } from '../core/transition';

export interface ScrollSourceConfig {
  /**
   * The element whose scroll position drives the view, e.g. the foreground
   * layer's scroll container. Swap it at runtime with `setElement()`.
   */
  element?: HTMLElement | null;
  /** Virtual head distance from the screen in meters (EyePosition.z). Default: 0.6 */
  distance?: number;
  /**
   * Eye offset at the top and bottom of the scroll range, as a fraction of
   * the screen's half-height. Default: 0.5
   */
  range?: number;
  /** Duration of the ease when switching elements. Default: 400 */
  easeMs?: number;
}

/**
 * Scroll position as a virtual head: at the top of the content the eye is
 * raised, at the bottom it is lowered, and in between it moves linearly,
 * so scrolling the front layer slides the depth layers against it.
 * Horizontal position stays centered. Content that doesn't scroll is centered.
 */
export class ScrollSource implements EyeSource {
  private element: HTMLElement | null;
  private distance: number;
  private range: number;
  private easeMs: number;
  private screen: ScreenConfig | null = null;
  private emit: ((position: EyePosition) => void) | null = null;
  private running = false;
  /** Last emitted scroll position, -1 (top) to 1 (bottom) */
  private current = 0;
  private transition: Transition | null = null;
  private frameId: number | null = null;

  constructor(config: ScrollSourceConfig = {}) {
    this.element = config.element ?? null;
    this.distance = config.distance ?? 0.6;
    this.range = config.range ?? 0.5;
    this.easeMs = config.easeMs ?? 400;
  }

  async start(emit: (position: EyePosition) => void): Promise<void> {
    this.emit = emit;
    if (this.running) return;
    this.running = true;
    this.element?.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleScroll, { passive: true });
    this.current = this.readScroll();
    this.emitAt(this.current);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.element?.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleScroll);
    this.transition = null;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  destroy(): void {
    this.stop();
    this.emit = null;
  }

  updateScreen(screen: ScreenConfig): void {
    this.screen = { ...screen };
  }

  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Follow a different scroll container (e.g. after navigating to a new
   * layer). The view eases to the new element's scroll position.
   */
  setElement(element: HTMLElement | null): void {
    if (element === this.element) return;
    if (this.running) this.element?.removeEventListener('scroll', this.handleScroll);
    this.element = element;
    if (!this.running) return;
    element?.addEventListener('scroll', this.handleScroll, { passive: true });
    this.transition = new Transition({ x: 0, y: this.current, z: 0 }, performance.now(), this.easeMs);
    if (this.frameId === null) this.frameId = requestAnimationFrame(this.tick);
  }

  getDistance(): number {
    return this.distance;
  }

  /** Change the virtual head distance; applied immediately (animate by calling repeatedly) */
  setDistance(meters: number): void {
    this.distance = meters;
    if (this.running && !this.transition) this.emitAt(this.current);
  }

  /** Maps a scroll position (-1 top, 1 bottom) to an eye position (exposed for tests) */
  toEyePosition(scroll: number): EyePosition {
    const screen = this.screen ?? screenFromViewport();
    return {
      x: 0,
      // `0 -` rather than unary minus so the center is 0, not -0
      y: 0 - scroll * this.range * (screen.heightMeters / 2),
      z: this.distance,
    };
  }

  private readScroll(): number {
    const el = this.element;
    if (!el) return 0;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return 0;
    const progress = Math.min(1, Math.max(0, el.scrollTop / max));
    return progress * 2 - 1;
  }

  private handleScroll = (): void => {
    // Mid-switch, the blend reads the live position each frame
    if (!this.transition) this.emitAt(this.readScroll());
  };

  private tick = (): void => {
    this.frameId = null;
    if (!this.running || !this.transition) return;
    const now = performance.now();
    const y = this.transition.sample({ x: 0, y: this.readScroll(), z: 0 }, now).y;
    if (this.transition.isDone(now)) this.transition = null;
    this.emitAt(y);
    if (this.transition) this.frameId = requestAnimationFrame(this.tick);
  };

  private emitAt(scroll: number): void {
    this.current = scroll;
    this.emit?.(this.toEyePosition(scroll));
  }
}
