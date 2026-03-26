import type { EyePosition, RawFaceData, TrackingConfig } from '../tracking/types';
import type { CalibrationConfig, ScreenConfig } from '../projection/types';
import { CoordinateMapper } from '../projection/coordinateMapper';
import { FaceTracker } from '../tracking/FaceTracker';
import { screenFromViewport } from '../projection/screenFromViewport';
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
  calibration?: Partial<CalibrationConfig>;
  tracking?: Omit<TrackingConfig, 'onTrack' | 'onTrackingLost'>;
  /**
   * CSS pixels per physical inch, used to compute screen dimensions
   * from the viewport when `screen` is not provided.
   * Default: 96 (CSS standard, close for most desktop monitors).
   */
  ppi?: number;
  /** Called each frame with the current eye position */
  onTrack?: (position: EyePosition) => void;
  /** Called when face tracking is lost */
  onTrackingLost?: () => void;
  /** Called when screen config changes (PPI update, resize, etc.) */
  onScreenChange?: (screen: ScreenConfig) => void;
}

export class ParallaxEngine {
  private adapter: Adapter;
  private coordinateMapper: CoordinateMapper;
  private faceTracker: FaceTracker;
  private onTrack?: (position: EyePosition) => void;
  private onTrackingLost?: () => void;
  private onScreenChange?: (screen: ScreenConfig) => void;
  private initialized = false;
  private lastEyePosition: EyePosition | null = null;
  private eyeOffset: EyePosition = { x: 0, y: 0, z: 0 };
  private ppi: number;
  private calibrationPaused = false;

  constructor(config: ParallaxEngineConfig) {
    this.adapter = config.adapter;
    this.ppi = config.ppi ?? 96;
    this.onTrack = config.onTrack;
    this.onTrackingLost = config.onTrackingLost;
    this.onScreenChange = config.onScreenChange;

    // Auto-compute screen dimensions from viewport if not provided
    const screenConfig = config.screen?.widthMeters && config.screen?.heightMeters
      ? config.screen
      : screenFromViewport(this.ppi);

    this.coordinateMapper = new CoordinateMapper(
      screenConfig,
      config.calibration,
    );

    this.faceTracker = new FaceTracker(this.coordinateMapper, {
      ...config.tracking,
      onTrack: this.handleTrack,
      onTrackingLost: this.handleTrackingLost,
    });
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      await this.faceTracker.initialize();
      this.initialized = true;
    }
    this.faceTracker.start();
  }

  stop(): void {
    this.faceTracker.stop();
  }

  destroy(): void {
    this.faceTracker.destroy();
    this.initialized = false;
  }

  updateCalibration(updates: Partial<CalibrationConfig>): void {
    this.coordinateMapper.updateCalibration(updates);
  }

  updateScreen(updates: Partial<ScreenConfig>): void {
    this.coordinateMapper.updateScreen(updates);
    const current = this.coordinateMapper.getScreenConfig();
    this.adapter.updateScreen(current);
    this.onScreenChange?.(current);
  }

  /** Recompute screen dimensions from current viewport size + PPI */
  updateScreenFromViewport(): void {
    const screen = screenFromViewport(this.ppi);
    this.coordinateMapper.updateScreen(screen);
    this.adapter.updateScreen(screen);
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
    return this.coordinateMapper.getScreenConfig();
  }

  getCalibrationConfig(): CalibrationConfig {
    return this.coordinateMapper.getCalibrationConfig();
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.faceTracker.getVideoElement();
  }

  getSmoothingType(): 'none' | 'ema' | 'one-euro' {
    return this.faceTracker.getSmoothingType();
  }

  setSmoothing(type: 'none' | 'ema' | 'one-euro'): void {
    this.faceTracker.setSmoothing(type);
  }

  getFilter(): EMAFilter | OneEuroFilter | null {
    return this.faceTracker.getFilter();
  }

  getRawFaceData(): RawFaceData | null {
    return this.faceTracker.getRawFaceData();
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

  private handleTrack = (position: EyePosition): void => {
    this.lastEyePosition = position;
    const adjusted: EyePosition = {
      x: position.x - this.eyeOffset.x,
      y: position.y - this.eyeOffset.y,
      z: position.z,
    };
    if (!this.calibrationPaused) {
      this.adapter.update(adjusted);
    }
    this.onTrack?.(adjusted);
  };

  private handleTrackingLost = (): void => {
    this.onTrackingLost?.();
  };
}
