import type { EyePosition, RawFaceData } from '../tracking/types';
import type { CalibrationConfig, ScreenConfig } from './types';

const DEFAULT_SCREEN: ScreenConfig = {
  widthMeters: 0.34,
  heightMeters: 0.21,
};

const DEFAULT_CALIBRATION: CalibrationConfig = {
  realIPD: 0.063,
  cameraFovDegrees: 60,
  cameraOffsetY: 0.02,
  mirrorX: true,
};

export class CoordinateMapper {
  private screen: ScreenConfig;
  private calibration: CalibrationConfig;
  /** Precomputed: apparent IPD at 1 meter distance in normalized camera coords */
  private ipdAtOneMeter: number;

  constructor(
    screen: Partial<ScreenConfig> = {},
    calibration: Partial<CalibrationConfig> = {},
  ) {
    this.screen = { ...DEFAULT_SCREEN, ...screen };
    this.calibration = { ...DEFAULT_CALIBRATION, ...calibration };

    // At distance D, an object of real size S appears as:
    //   apparentSize = S / (2 * D * tan(fov/2))
    // So at D=1m:
    const halfFovRad = (this.calibration.cameraFovDegrees / 2) * (Math.PI / 180);
    this.ipdAtOneMeter = this.calibration.realIPD / (2 * Math.tan(halfFovRad));
  }

  /**
   * Maps raw face detection data (normalized camera pixels) to
   * world-space eye position relative to screen center.
   */
  map(raw: RawFaceData): EyePosition {
    // Estimate Z distance from apparent inter-pupillary distance
    // z = ipdAtOneMeter / apparentIPD
    const z = Math.max(0.1, this.ipdAtOneMeter / Math.max(raw.interPupillaryDistance, 0.001));

    // Map camera X/Y (0-1 normalized, origin top-left) to screen-relative meters
    // Camera center = (0.5, 0.5), need to convert to offset from screen center
    const halfFovRad = (this.calibration.cameraFovDegrees / 2) * (Math.PI / 180);
    const viewWidth = 2 * z * Math.tan(halfFovRad);
    const viewHeight = viewWidth * 0.75; // assume 4:3 camera aspect

    let x = (raw.x - 0.5) * viewWidth;
    if (this.calibration.mirrorX) {
      x = -x;
    }

    const y = -((raw.y - 0.5) * viewHeight) - this.calibration.cameraOffsetY;

    return { x, y, z };
  }

  getScreenConfig(): ScreenConfig {
    return { ...this.screen };
  }

  updateCalibration(updates: Partial<CalibrationConfig>): void {
    Object.assign(this.calibration, updates);
    const halfFovRad = (this.calibration.cameraFovDegrees / 2) * (Math.PI / 180);
    this.ipdAtOneMeter = this.calibration.realIPD / (2 * Math.tan(halfFovRad));
  }

  updateScreen(updates: Partial<ScreenConfig>): void {
    Object.assign(this.screen, updates);
  }
}
