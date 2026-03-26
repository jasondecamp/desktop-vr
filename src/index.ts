// Core engine
export { ParallaxEngine } from './core/ParallaxEngine';
export type { ParallaxEngineConfig } from './core/ParallaxEngine';

// Adapters
export { ThreeJSAdapter } from './adapters/ThreeJSAdapter';
export type { ThreeJSAdapterConfig } from './adapters/ThreeJSAdapter';
export { CSSAdapter } from './adapters/CSSAdapter';
export type { CSSAdapterConfig } from './adapters/CSSAdapter';

// Tracking
export { FaceTracker } from './tracking/FaceTracker';
export type { EyePosition, RawFaceData, TrackingConfig } from './tracking/types';

// Projection
export { computeOffAxisFrustum } from './projection/frustum';
export { CoordinateMapper } from './projection/coordinateMapper';
export type { Frustum, ScreenConfig, CalibrationConfig } from './projection/types';

// Filters
export { OneEuroFilter, EMAFilter } from './tracking/filters';
