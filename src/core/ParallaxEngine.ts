import type { EyePosition, TrackingConfig } from '../tracking/types';
import type { CalibrationConfig, ScreenConfig } from '../projection/types';
import { CoordinateMapper } from '../projection/coordinateMapper';
import { FaceTracker } from '../tracking/FaceTracker';
import type { ThreeJSAdapter } from '../adapters/ThreeJSAdapter';
import type { CSSAdapter } from '../adapters/CSSAdapter';

type Adapter = ThreeJSAdapter | CSSAdapter;

export interface ParallaxEngineConfig {
  adapter: Adapter;
  screen?: Partial<ScreenConfig>;
  calibration?: Partial<CalibrationConfig>;
  tracking?: Omit<TrackingConfig, 'onTrack' | 'onTrackingLost'>;
  /** Called each frame with the current eye position */
  onTrack?: (position: EyePosition) => void;
  /** Called when face tracking is lost */
  onTrackingLost?: () => void;
}

export class ParallaxEngine {
  private adapter: Adapter;
  private coordinateMapper: CoordinateMapper;
  private faceTracker: FaceTracker;
  private onTrack?: (position: EyePosition) => void;
  private onTrackingLost?: () => void;
  private initialized = false;

  constructor(config: ParallaxEngineConfig) {
    this.adapter = config.adapter;
    this.onTrack = config.onTrack;
    this.onTrackingLost = config.onTrackingLost;

    this.coordinateMapper = new CoordinateMapper(
      config.screen,
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
  }

  private handleTrack = (position: EyePosition): void => {
    this.adapter.update(position);
    this.onTrack?.(position);
  };

  private handleTrackingLost = (): void => {
    this.onTrackingLost?.();
  };
}
