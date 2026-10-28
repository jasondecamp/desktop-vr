import type { CalibrationConfig } from '../projection/types';
import type { EyePosition, RawFaceData, TrackingConfig } from '../tracking/types';
import type { EMAFilter, OneEuroFilter } from '../tracking/filters';
import type { EyeSource } from './types';
import { CoordinateMapper } from '../projection/coordinateMapper';
import { FaceTracker } from '../tracking/FaceTracker';

export interface FaceSourceConfig extends Omit<TrackingConfig, 'onTrack' | 'onTrackingLost'> {
  calibration?: Partial<CalibrationConfig>;
  /**
   * Use an existing mapper instead of creating one (the engine shares its
   * own so `engine.updateCalibration()` applies). Overrides `calibration`.
   */
  mapper?: CoordinateMapper;
}

/**
 * Webcam head tracking via MediaPipe face landmarks. Wraps `FaceTracker`;
 * MediaPipe is imported on the first `start()`, not when this module loads.
 *
 * `stop()` pauses detection and keeps the camera open for a quick restart;
 * `destroy()` releases the camera and model. A destroyed source can be
 * started again (it reinitializes).
 */
export class FaceSource implements EyeSource {
  private tracker: FaceTracker;
  private trackingConfig: TrackingConfig;
  private mapper: CoordinateMapper;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private emit: ((position: EyePosition) => void) | null = null;
  private lost: (() => void) | null = null;

  constructor(config: FaceSourceConfig = {}) {
    const { calibration, mapper, ...tracking } = config;
    this.mapper = mapper ?? new CoordinateMapper({}, calibration);
    this.trackingConfig = {
      ...tracking,
      onTrack: (position) => this.emit?.(position),
      onTrackingLost: () => this.lost?.(),
    };
    this.tracker = new FaceTracker(this.mapper, this.trackingConfig);
  }

  async start(emit: (position: EyePosition) => void, lost: () => void): Promise<void> {
    this.emit = emit;
    this.lost = lost;
    // destroy() swaps in a fresh tracker, so an in-flight start can tell it was cancelled
    const tracker = this.tracker;
    if (!this.initialized) {
      if (!this.initializing) {
        this.initializing = tracker.initialize();
      }
      try {
        await this.initializing;
      } catch (err) {
        // Don't leave a half-open camera or a dangling <video> behind
        tracker.destroy();
        if (tracker === this.tracker) this.initializing = null;
        throw err;
      }
      if (tracker !== this.tracker) {
        // destroy() ran while the camera was opening
        tracker.destroy();
        return;
      }
      this.initializing = null;
      this.initialized = true;
    }
    tracker.start();
  }

  stop(): void {
    this.tracker.stop();
  }

  destroy(): void {
    this.tracker.destroy();
    this.tracker = new FaceTracker(this.mapper, this.trackingConfig);
    this.initialized = false;
    this.initializing = null;
  }

  getCoordinateMapper(): CoordinateMapper {
    return this.mapper;
  }

  getCalibrationConfig(): CalibrationConfig {
    return this.mapper.getCalibrationConfig();
  }

  updateCalibration(updates: Partial<CalibrationConfig>): void {
    this.mapper.updateCalibration(updates);
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.tracker.getVideoElement();
  }

  getRawFaceData(): RawFaceData | null {
    return this.tracker.getRawFaceData();
  }

  getFilter(): EMAFilter | OneEuroFilter | null {
    return this.tracker.getFilter();
  }

  getSmoothingType(): 'none' | 'ema' | 'one-euro' {
    return this.tracker.getSmoothingType();
  }

  setSmoothing(type: 'none' | 'ema' | 'one-euro'): void {
    this.trackingConfig.smoothing = type;
    this.tracker.setSmoothing(type);
  }
}
