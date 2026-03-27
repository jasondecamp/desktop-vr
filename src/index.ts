// Core engine
export { ParallaxEngine } from './core/ParallaxEngine';
export type { ParallaxEngineConfig } from './core/ParallaxEngine';

// CSS Adapter (no Three.js dependency)
export { CSSAdapter } from './adapters/CSSAdapter';
export type { CSSAdapterConfig } from './adapters/CSSAdapter';

// Tracking
export { FaceTracker } from './tracking/FaceTracker';
export type { EyePosition, RawFaceData, FaceLandmarkPoint, TrackingConfig } from './tracking/types';

// Projection
export { computeOffAxisFrustum } from './projection/frustum';
export { CoordinateMapper } from './projection/coordinateMapper';
export { screenFromViewport } from './projection/screenFromViewport';
export type { Frustum, ScreenConfig, CalibrationConfig } from './projection/types';

// Filters
export { OneEuroFilter, EMAFilter } from './tracking/filters';

// Headless UI (no Three.js dependency)
export { CalibrationPanel } from './ui/CalibrationPanel';
export type { CalibrationPanelConfig } from './ui/CalibrationPanel';
