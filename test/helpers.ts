import { vi } from 'vitest';
import type { EyePosition } from '../src/tracking/types';
import type { EyeSource } from '../src/sources/types';

/** Fakes rAF and performance.now so blends can be stepped frame by frame */
export function useFrameTimers(): void {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'Date'],
  });
}

/** Advance in ~16ms frames */
export function frames(n: number): void {
  for (let i = 0; i < n; i++) vi.advanceTimersByTime(16);
}

export function pointerMove(clientX: number, clientY: number, pointerType = 'mouse'): void {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, pointerType }));
}

export function pointerLeaveWindow(): void {
  document.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null, pointerType: 'mouse', bubbles: true }));
}

/** A source the test drives by hand */
export class ManualSource implements EyeSource {
  emit: ((p: EyePosition) => void) | null = null;
  lose: (() => void) | null = null;
  started = 0;
  stopped = 0;
  destroyed = 0;
  /** Resolve start() manually (e.g. to simulate a camera opening) */
  deferStart = false;
  private release: (() => void) | null = null;
  failWith: Error | null = null;

  start(emit: (p: EyePosition) => void, lost: () => void): Promise<void> {
    this.started++;
    this.emit = emit;
    this.lose = lost;
    if (this.failWith) return Promise.reject(this.failWith);
    if (!this.deferStart) return Promise.resolve();
    return new Promise((resolve) => { this.release = resolve; });
  }

  finishStart(): void {
    this.release?.();
  }

  stop(): void { this.stopped++; }
  destroy(): void { this.destroyed++; }
}

export function fakeAdapter() {
  return { update: vi.fn<(eye: EyePosition) => void>(), updateScreen: vi.fn() };
}

export function distance(a: EyePosition, b: EyePosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
