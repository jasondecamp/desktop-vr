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
export { screenFromViewport } from './projection/screenFromViewport';
export type { Frustum, ScreenConfig, CalibrationConfig } from './projection/types';

// Filters
export { OneEuroFilter, EMAFilter } from './tracking/filters';

// UI
export { CalibrationPanel } from './ui/CalibrationPanel';
export type { CalibrationPanelConfig } from './ui/CalibrationPanel';
export { CalibrationOverlay } from './ui/CalibrationOverlay';
export type { CalibrationOverlayConfig } from './ui/CalibrationOverlay';
export { GridRoom } from './ui/gridRoom';
export type { GridRoomConfig } from './ui/gridRoom';
export { DiagnosticOverlay } from './ui/DiagnosticOverlay';
export type { DiagnosticOverlayConfig } from './ui/DiagnosticOverlay';
