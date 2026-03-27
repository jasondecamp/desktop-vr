// Three.js adapter
export { ThreeJSAdapter } from './adapters/ThreeJSAdapter';
export type { ThreeJSAdapterConfig } from './adapters/ThreeJSAdapter';

// Three.js-dependent UI components
export { CalibrationOverlay } from './ui/CalibrationOverlay';
export type { CalibrationOverlayConfig } from './ui/CalibrationOverlay';
export { DiagnosticOverlay } from './ui/DiagnosticOverlay';
export type { DiagnosticOverlayConfig } from './ui/DiagnosticOverlay';
export { GridRoom } from './ui/gridRoom';
export type { GridRoomConfig } from './ui/gridRoom';

// Re-export everything from core for convenience
export * from './index';
