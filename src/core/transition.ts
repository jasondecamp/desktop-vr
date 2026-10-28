import type { EyePosition } from '../tracking/types';

/** Ease-in-out cubic: gentle start and finish, so short dropouts barely move */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerpEye(a: EyePosition, b: EyePosition, t: number): EyePosition {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * An eased blend from a fixed starting position toward a (possibly moving)
 * target. The target is passed on every sample, so a live source keeps
 * steering the blend instead of being frozen at the moment it began.
 */
export class Transition {
  private from: EyePosition;
  private startTime: number;
  private durationMs: number;

  constructor(from: EyePosition, startTime: number, durationMs: number) {
    this.from = { ...from };
    this.startTime = startTime;
    this.durationMs = durationMs;
  }

  /** Linear progress 0-1 */
  progress(now: number): number {
    if (this.durationMs <= 0) return 1;
    return Math.min(1, Math.max(0, (now - this.startTime) / this.durationMs));
  }

  sample(target: EyePosition, now: number): EyePosition {
    return lerpEye(this.from, target, easeInOutCubic(this.progress(now)));
  }

  isDone(now: number): boolean {
    return this.progress(now) >= 1;
  }
}
