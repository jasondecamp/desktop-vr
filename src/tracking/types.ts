export interface EyePosition {
  /** Horizontal offset from screen center in meters (positive = right) */
  x: number;
  /** Vertical offset from screen center in meters (positive = up) */
  y: number;
  /** Distance from screen surface in meters (always positive) */
  z: number;
}

export interface RawFaceData {
  /** Midpoint between eyes in camera pixel coordinates (0-1 normalized) */
  x: number;
  /** Midpoint between eyes in camera pixel coordinates (0-1 normalized) */
  y: number;
  /** Distance between pupils in camera pixel coordinates (0-1 normalized) */
  interPupillaryDistance: number;
}

export interface TrackingConfig {
  /** Target tracking framerate. Default: 30 */
  maxFps?: number;
  /** Which camera to prefer. Default: 'user' (front-facing) */
  facingMode?: 'user' | 'environment';
  /** Smoothing strategy. Default: 'one-euro' */
  smoothing?: 'none' | 'ema' | 'one-euro';
  /** Callback fired each time a new eye position is computed */
  onTrack?: (position: EyePosition) => void;
  /** Callback fired when tracking is lost */
  onTrackingLost?: () => void;
}
