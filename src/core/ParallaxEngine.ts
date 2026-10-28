import type { EyePosition, RawFaceData, TrackingConfig } from '../tracking/types';
import type { CalibrationConfig, ScreenConfig } from '../projection/types';
import { CoordinateMapper } from '../projection/coordinateMapper';
import { screenFromViewport } from '../projection/screenFromViewport';
import { FaceSource } from '../sources/FaceSource';
import type { EyeSource } from '../sources/types';
import { Transition } from './transition';
import type { ThreeJSAdapter } from '../adapters/ThreeJSAdapter';
import type { CSSAdapter } from '../adapters/CSSAdapter';
import type { EMAFilter, OneEuroFilter } from '../tracking/filters';

type Adapter = ThreeJSAdapter | CSSAdapter;

export interface ParallaxEngineConfig {
  adapter: Adapter;
  /**
   * Physical screen dimensions. If omitted, auto-computed from the
   * browser viewport size using CSS PPI (see `ppi` option).
   */
  screen?: Partial<ScreenConfig>;
  /**
   * Where eye positions come from. If omitted, a `FaceSource` (webcam) is
   * built from `tracking` and `calibration`, as in v0.2.
   */
  source?: EyeSource;
  /** Camera calibration, applied to the default face source */
  calibration?: Partial<CalibrationConfig>;
  /** Face tracking options for the default face source */
  tracking?: Omit<TrackingConfig, 'onTrack' | 'onTrackingLost'>;
  /**
   * CSS pixels per physical inch, used to compute screen dimensions
   * from the viewport when `screen` is not provided.
   * Default: 96 (CSS standard, close for most desktop monitors).
   */
  ppi?: number;
  /**
   * Duration in ms of the eased blend when switching sources or reacquiring
   * after a loss. Default: 500
   */
  blendMs?: number;
  /** Called each frame with the current eye position */
  onTrack?: (position: EyePosition) => void;
  /**
   * Called when the source loses tracking (e.g. no face in frame). The view
   * holds its last position until tracking returns.
   */
  onTrackingLost?: () => void;
  /** Called when screen config changes (PPI update, resize, etc.) */
  onScreenChange?: (screen: ScreenConfig) => void;
}

export class ParallaxEngine {
  private adapter: Adapter;
  private coordinateMapper: CoordinateMapper;
  private source: EyeSource;
  /** A source passed to setSource() that is still starting */
  private pendingSource: EyeSource | null = null;
  private pendingTarget: EyePosition | null = null;
  private running = false;
  /** True until the viewport-derived screen size has been computed */
  private screenPending: boolean;
  private onTrack?: (position: EyePosition) => void;
  private onTrackingLost?: () => void;
  private onScreenChange?: (screen: ScreenConfig) => void;
  private lastEyePosition: EyePosition | null = null;
  private eyeOffset: EyePosition = { x: 0, y: 0, z: 0 };
  private ppi: number;
  private calibrationPaused = false;
  private blendMs: number;
  /** Latest position from the active source; null when lost or not yet reported */
  private target: EyePosition | null = null;
  private transition: Transition | null = null;
  private frameId: number | null = null;
  /** Blend from the last output on the next emit (after a restart) */
  private blendOnNextEmit = false;

  constructor(config: ParallaxEngineConfig) {
    this.adapter = config.adapter;
    this.ppi = config.ppi ?? 96;
    this.onTrack = config.onTrack;
    this.onTrackingLost = config.onTrackingLost;
    this.onScreenChange = config.onScreenChange;
    this.blendMs = config.blendMs ?? 500;

    // Screen dimensions come from the viewport unless both are given.
    // Computed lazily so constructing an engine never touches `window`.
    const fullScreen = config.screen?.widthMeters && config.screen?.heightMeters;
    this.screenPending = !fullScreen;

    this.coordinateMapper = new CoordinateMapper(
      fullScreen ? config.screen : {},
      config.calibration,
    );

    this.source = config.source ?? new FaceSource({
      ...config.tracking,
      mapper: this.coordinateMapper,
    });
  }

  async start(): Promise<void> {
    this.running = true;
    this.target = null;
    this.blendOnNextEmit = this.lastEyePosition !== null;
    await this.startSource(this.source);
  }

  stop(): void {
    this.running = false;
    this.cancelPending();
    this.source.stop();
    this.endTransition();
  }

  destroy(): void {
    this.running = false;
    this.cancelPending();
    this.source.destroy();
    this.endTransition();
  }

  getSource(): EyeSource {
    return this.source;
  }

  /**
   * Switch where eye positions come from. On a running engine the new source
   * is started first (the current one keeps driving the view meanwhile, e.g.
   * while the camera opens), then the previous source is destroyed and the
   * output blends to the new one over `blendMs`. If the new source fails to
   * start, the current one stays and the error is rethrown.
   *
   * The previous source is destroyed, releasing its camera or listeners;
   * sources can be started again, so passing it back later works.
   */
  async setSource(source: EyeSource): Promise<void> {
    if (source === this.source) {
      this.cancelPending();
      return;
    }
    if (!this.running) {
      this.cancelPending();
      this.source.destroy();
      this.source = source;
      return;
    }

    this.cancelPending();
    this.pendingSource = source;
    this.pendingTarget = null;
    try {
      await this.startSource(source);
    } catch (err) {
      if (this.pendingSource === source) this.pendingSource = null;
      throw err;
    }
    if (this.pendingSource !== source) {
      // Superseded by another setSource(), or the engine stopped meanwhile
      source.destroy();
      return;
    }

    const previous = this.source;
    this.source = source;
    this.pendingSource = null;
    this.target = this.pendingTarget;
    this.pendingTarget = null;
    previous.destroy();
    this.beginTransition();
  }

  updateCalibration(updates: Partial<CalibrationConfig>): void {
    this.coordinateMapper.updateCalibration(updates);
    for (const source of [this.source, this.pendingSource]) {
      if (source instanceof FaceSource && source.getCoordinateMapper() !== this.coordinateMapper) {
        source.updateCalibration(updates);
      }
    }
  }

  updateScreen(updates: Partial<ScreenConfig>): void {
    this.resolveScreen();
    this.coordinateMapper.updateScreen(updates);
    const current = this.coordinateMapper.getScreenConfig();
    this.adapter.updateScreen(current);
    this.source.updateScreen?.(current);
    this.pendingSource?.updateScreen?.(current);
    this.onScreenChange?.(current);
  }

  /** Recompute screen dimensions from current viewport size + PPI */
  updateScreenFromViewport(): void {
    const screen = screenFromViewport(this.ppi);
    this.screenPending = false;
    this.coordinateMapper.updateScreen(screen);
    this.adapter.updateScreen(screen);
    this.source.updateScreen?.(screen);
    this.pendingSource?.updateScreen?.(screen);
    this.onScreenChange?.(screen);
  }

  getPpi(): number {
    return this.ppi;
  }

  setPpi(ppi: number): void {
    this.ppi = ppi;
    this.updateScreenFromViewport();
  }

  getEyePosition(): EyePosition | null {
    return this.lastEyePosition;
  }

  getScreenConfig(): ScreenConfig {
    this.resolveScreen();
    return this.coordinateMapper.getScreenConfig();
  }

  getCalibrationConfig(): CalibrationConfig {
    return this.faceSource()?.getCalibrationConfig() ?? this.coordinateMapper.getCalibrationConfig();
  }

  // Face-only accessors: null / 'none' / no-op when the source isn't a FaceSource

  getVideoElement(): HTMLVideoElement | null {
    return this.faceSource()?.getVideoElement() ?? null;
  }

  getSmoothingType(): 'none' | 'ema' | 'one-euro' {
    return this.faceSource()?.getSmoothingType() ?? 'none';
  }

  setSmoothing(type: 'none' | 'ema' | 'one-euro'): void {
    this.faceSource()?.setSmoothing(type);
  }

  getFilter(): EMAFilter | OneEuroFilter | null {
    return this.faceSource()?.getFilter() ?? null;
  }

  getRawFaceData(): RawFaceData | null {
    return this.faceSource()?.getRawFaceData() ?? null;
  }

  getAdapter(): Adapter {
    return this.adapter;
  }

  /** Get the raw eye position before offset is applied */
  getRawEyePosition(): EyePosition | null {
    return this.lastEyePosition;
  }

  setEyeOffset(offset: EyePosition): void {
    this.eyeOffset = { ...offset };
  }

  getEyeOffset(): EyePosition {
    return { ...this.eyeOffset };
  }

  /** Pause adapter updates (used during calibration overlay) */
  pauseAdapterUpdates(): void {
    this.calibrationPaused = true;
  }

  resumeAdapterUpdates(): void {
    this.calibrationPaused = false;
  }

  private faceSource(): FaceSource | null {
    return this.source instanceof FaceSource ? this.source : null;
  }

  private resolveScreen(): void {
    if (!this.screenPending) return;
    this.screenPending = false;
    this.coordinateMapper.updateScreen(screenFromViewport(this.ppi));
  }

  private startSource(source: EyeSource): Promise<void> {
    source.updateScreen?.(this.getScreenConfig());
    return source.start(
      (position) => {
        if (source === this.source) {
          this.handleTrack(position);
        } else if (source === this.pendingSource) {
          this.pendingTarget = position;
        }
      },
      () => {
        if (source === this.source) {
          this.handleTrackingLost();
        } else if (source === this.pendingSource) {
          this.pendingTarget = null;
        }
      },
    );
  }

  private cancelPending(): void {
    if (!this.pendingSource) return;
    // Its in-flight setSource() sees it was superseded and destroys it
    this.pendingSource.stop();
    this.pendingSource = null;
    this.pendingTarget = null;
  }

  /**
   * Blend from the current output toward the target. With no target yet
   * (a new source that hasn't reported), the view holds until one arrives.
   */
  private beginTransition(): void {
    if (!this.target) {
      this.endTransition();
      return;
    }
    if (!this.lastEyePosition || this.blendMs <= 0) {
      this.endTransition();
      this.output(this.target);
      return;
    }
    this.transition = new Transition(this.lastEyePosition, now(), this.blendMs);
    if (this.frameId === null) this.frameId = requestAnimationFrame(this.tick);
  }

  private endTransition(): void {
    this.transition = null;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  private tick = (): void => {
    this.frameId = null;
    const transition = this.transition;
    if (!transition || !this.target) return;
    const t = now();
    this.output(transition.sample(this.target, t));
    if (transition.isDone(t)) {
      this.transition = null;
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private handleTrack(position: EyePosition): void {
    const reacquired = this.target === null;
    this.target = position;
    if (this.blendOnNextEmit || (reacquired && this.lastEyePosition)) {
      // The target just jumped (after a loss, a restart or a source
      // switch): blend from where the output is now
      this.blendOnNextEmit = false;
      this.beginTransition();
    } else if (!this.transition) {
      this.output(position);
    }
  }

  private handleTrackingLost(): void {
    // Hold the view where it is; reacquiring blends from here
    this.target = null;
    this.endTransition();
    this.onTrackingLost?.();
  }

  private output(position: EyePosition): void {
    this.lastEyePosition = { ...position };
    const adjusted: EyePosition = {
      x: position.x - this.eyeOffset.x,
      y: position.y - this.eyeOffset.y,
      z: position.z,
    };
    if (!this.calibrationPaused) {
      this.adapter.update(adjusted);
    }
    this.onTrack?.(adjusted);
  }
}

function now(): number {
  return performance.now();
}
