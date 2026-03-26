export interface Frustum {
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
}

export interface ScreenConfig {
  /** Physical screen width in meters. Default: 0.34 (roughly a 15" laptop) */
  widthMeters: number;
  /** Physical screen height in meters. Default: 0.21 */
  heightMeters: number;
}

export interface CalibrationConfig {
  /**
   * Average human inter-pupillary distance in meters.
   * Used to estimate Z depth from apparent IPD in camera.
   * Default: 0.063
   */
  realIPD: number;
  /**
   * Camera's horizontal field of view in degrees.
   * Used for pixel-to-world coordinate mapping.
   * Default: 60
   */
  cameraFovDegrees: number;
  /**
   * Vertical offset of the camera above the screen center in meters.
   * Positive = camera is above center. Default: 0.02
   */
  cameraOffsetY: number;
  /**
   * Whether to mirror the X axis (needed for front-facing cameras).
   * Default: true
   */
  mirrorX: boolean;
}
