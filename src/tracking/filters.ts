import type { EyePosition } from './types';

/**
 * Exponential Moving Average filter.
 * Simple but has a fixed tradeoff between smoothness and responsiveness.
 */
export class EMAFilter {
  private prev: EyePosition | null = null;

  constructor(private alpha: number = 0.3) {}

  setAlpha(alpha: number): void {
    this.alpha = alpha;
  }

  filter(position: EyePosition): EyePosition {
    if (!this.prev) {
      this.prev = { ...position };
      return position;
    }
    const result: EyePosition = {
      x: this.alpha * position.x + (1 - this.alpha) * this.prev.x,
      y: this.alpha * position.y + (1 - this.alpha) * this.prev.y,
      z: this.alpha * position.z + (1 - this.alpha) * this.prev.z,
    };
    this.prev = { ...result };
    return result;
  }

  reset(): void {
    this.prev = null;
  }
}

/**
 * One-Euro Filter — adapts smoothing based on speed of movement.
 * Low speed = heavy smoothing (removes jitter at rest).
 * High speed = light smoothing (preserves responsiveness during fast movement).
 *
 * Based on: "1euro Filter: A Simple Speed-based Low-pass Filter for Noisy Input"
 * by Casiez, Roussel, Vogel (2012)
 */
class OneEuroChannel {
  private prevValue: number | null = null;
  private prevDerivative = 0;
  private prevTimestamp: number | null = null;

  constructor(
    private minCutoff: number = 1.0,
    private beta: number = 0.007,
    private derivativeCutoff: number = 1.0,
  ) {}

  updateParams(minCutoff: number, beta: number, derivativeCutoff: number): void {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
  }

  private smoothingFactor(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp: number): number {
    if (this.prevValue === null || this.prevTimestamp === null) {
      this.prevValue = value;
      this.prevTimestamp = timestamp;
      return value;
    }

    const dt = Math.max((timestamp - this.prevTimestamp) / 1000, 0.001);
    this.prevTimestamp = timestamp;

    // Estimate derivative (speed)
    const derivative = (value - this.prevValue) / dt;
    const alphaD = this.smoothingFactor(this.derivativeCutoff, dt);
    const smoothedDerivative = alphaD * derivative + (1 - alphaD) * this.prevDerivative;
    this.prevDerivative = smoothedDerivative;

    // Adaptive cutoff based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    const alpha = this.smoothingFactor(cutoff, dt);

    const result = alpha * value + (1 - alpha) * this.prevValue;
    this.prevValue = result;
    return result;
  }

  reset(): void {
    this.prevValue = null;
    this.prevDerivative = 0;
    this.prevTimestamp = null;
  }
}

export class OneEuroFilter {
  private xFilter: OneEuroChannel;
  private yFilter: OneEuroChannel;
  private zFilter: OneEuroChannel;

  constructor(minCutoff = 3.0, beta = 0.05, derivativeCutoff = 1.0) {
    this.xFilter = new OneEuroChannel(minCutoff, beta, derivativeCutoff);
    this.yFilter = new OneEuroChannel(minCutoff, beta, derivativeCutoff);
    // Z (depth) gets extra smoothing since it's noisier from single-camera estimation
    this.zFilter = new OneEuroChannel(minCutoff * 0.5, beta * 0.5, derivativeCutoff);
  }

  filter(position: EyePosition, timestamp: number = performance.now()): EyePosition {
    return {
      x: this.xFilter.filter(position.x, timestamp),
      y: this.yFilter.filter(position.y, timestamp),
      z: this.zFilter.filter(position.z, timestamp),
    };
  }

  updateParams(minCutoff: number, beta: number, derivativeCutoff: number = 1.0): void {
    this.xFilter.updateParams(minCutoff, beta, derivativeCutoff);
    this.yFilter.updateParams(minCutoff, beta, derivativeCutoff);
    this.zFilter.updateParams(minCutoff * 0.5, beta * 0.5, derivativeCutoff);
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
    this.zFilter.reset();
  }
}
