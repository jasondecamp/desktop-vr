// Core engine
export { ParallaxEngine } from './core/ParallaxEngine';
export type { ParallaxEngineConfig } from './core/ParallaxEngine';

// CSS Adapter (no Three.js dependency)
export { CSSAdapter } from './adapters/CSSAdapter';
export type { CSSAdapterConfig } from './adapters/CSSAdapter';

// Sources
export { FaceSource } from './sources/FaceSource';
export type { FaceSourceConfig } from './sources/FaceSource';
export { PointerSource } from './sources/PointerSource';
export type { PointerSourceConfig } from './sources/PointerSource';
export { OrientationSource } from './sources/OrientationSource';
export type { OrientationSourceConfig } from './sources/OrientationSource';
export { ScrollSource } from './sources/ScrollSource';
export type { ScrollSourceConfig } from './sources/ScrollSource';
export type { EyeSource } from './sources/types';

// Tracking
export { FaceTracker } from './tracking/FaceTracker';
export { MEDIAPIPE_VERSION, DEFAULT_WASM_PATH, DEFAULT_MODEL_PATH } from './tracking/mediapipe';
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
