import { useEffect, useRef, useState, useCallback } from 'react';
import { ParallaxEngine } from './core/ParallaxEngine';
import { CSSAdapter } from './adapters/CSSAdapter';
import type { ParallaxEngineConfig } from './core/ParallaxEngine';
import type { CSSAdapterConfig } from './adapters/CSSAdapter';
import type { EyePosition } from './tracking/types';
import type { ScreenConfig } from './projection/types';
import type { EyeSource } from './sources/types';
import { PointerSource } from './sources/PointerSource';
import { ScrollSource } from './sources/ScrollSource';

// Re-export core for convenience
export * from './index';

// --- Types ---

export interface UseParallaxCSSOptions {
  /** CSS adapter sensitivity. Default: 1.0 */
  sensitivity?: number;
  /** CSS pixels per physical inch. Default: 96 */
  ppi?: number;
  /** Smoothing type for the default webcam source. Default: 'one-euro' */
  smoothing?: 'none' | 'ema' | 'one-euro';
  /**
   * Where eye positions come from. Read on mount; change it later with
   * `setSource()`. Default: the webcam (a FaceSource), as in v0.2.
   */
  source?: EyeSource;
  /** Blend duration in ms when switching sources. Default: 500 */
  blendMs?: number;
  /**
   * Start on mount. Default: true for pointer and scroll sources and when no
   * source is given (v0.2); false for camera and tilt sources, which prompt
   * for permission and should start from a deliberate `start()` call.
   */
  autoStart?: boolean;
  /** Called each frame with eye position */
  onTrack?: (position: EyePosition) => void;
  /** Called when tracking is lost */
  onTrackingLost?: () => void;
  /** Called when screen config changes */
  onScreenChange?: (screen: ScreenConfig) => void;
}

export interface UseParallaxReturn {
  /** The engine instance (null until initialized) */
  engine: ParallaxEngine | null;
  /** Whether tracking is currently active */
  tracking: boolean;
  /** Current eye position (updates each frame) */
  eyePosition: EyePosition | null;
  /** Start tracking (may request camera or motion permission) */
  start: () => Promise<void>;
  /** Stop tracking */
  stop: () => void;
  /**
   * Switch sources, blending from the current view. Call it from a user
   * gesture when switching to the camera or tilt. Rejects (keeping the
   * current source) if the new one can't start, e.g. permission denied.
   */
  setSource: (source: EyeSource) => Promise<void>;
}

/** Sources that need no permission prompt, so they can start on mount */
function startsWithoutGesture(source: EyeSource | undefined): boolean {
  return !source || source instanceof PointerSource || source instanceof ScrollSource;
}

// --- Hooks ---

/**
 * React hook for CSS 3D parallax. Attaches head-tracked perspective
 * to a container element.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const { tracking, eyePosition } = useParallaxCSS(containerRef);
 *
 *   return (
 *     <div ref={containerRef}>
 *       <div style={{ transform: 'translateZ(-100px)' }}>Background</div>
 *       <div style={{ transform: 'translateZ(50px)' }}>Foreground</div>
 *     </div>
 *   );
 * }
 * ```
 *
 * Starting without a camera, with the webcam as an opt-in:
 * ```tsx
 * const [pointer] = useState(() => new PointerSource());
 * const { setSource } = useParallaxCSS(containerRef, { source: pointer });
 * // in a click handler:
 * setSource(new FaceSource()).catch((err) => showError(err.message));
 * ```
 */
export function useParallaxCSS(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseParallaxCSSOptions = {},
): UseParallaxReturn {
  const {
    sensitivity = 1.0,
    ppi,
    smoothing = 'one-euro',
    source,
    blendMs,
    autoStart = startsWithoutGesture(source),
    onTrack,
    onTrackingLost,
    onScreenChange,
  } = options;

  const engineRef = useRef<ParallaxEngine | null>(null);
  const [tracking, setTracking] = useState(false);
  const [eyePosition, setEyePosition] = useState<EyePosition | null>(null);

  // Stable callback refs to avoid re-creating the engine on every render
  const onTrackRef = useRef(onTrack);
  const onTrackingLostRef = useRef(onTrackingLost);
  const onScreenChangeRef = useRef(onScreenChange);
  onTrackRef.current = onTrack;
  onTrackingLostRef.current = onTrackingLost;
  onScreenChangeRef.current = onScreenChange;

  // The engine's current source, kept across engine re-creation (e.g. a
  // sensitivity change) so it doesn't revert to the mount-time `source`
  const sourceRef = useRef(source);

  const start = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.start();
    setTracking(true);
  }, []);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.stop();
    setTracking(false);
  }, []);

  const setSource = useCallback(async (next: EyeSource) => {
    const engine = engineRef.current;
    if (!engine) {
      sourceRef.current = next;
      return;
    }
    await engine.setSource(next);
    sourceRef.current = engine.getSource();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const adapter = new CSSAdapter({ container, ppi, sensitivity });

    const engine = new ParallaxEngine({
      adapter,
      ppi,
      source: sourceRef.current,
      blendMs,
      tracking: { smoothing },
      onTrack: (pos) => {
        setEyePosition(pos);
        onTrackRef.current?.(pos);
      },
      onTrackingLost: () => {
        onTrackingLostRef.current?.();
      },
      onScreenChange: (s) => {
        onScreenChangeRef.current?.(s);
      },
    });

    engineRef.current = engine;

    if (autoStart) {
      engine.start().then(() => setTracking(true));
    }

    // Handle resize
    const handleResize = () => engine.updateScreenFromViewport();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.destroy();
      engineRef.current = null;
      setTracking(false);
      setEyePosition(null);
    };
  }, [containerRef, sensitivity, ppi, smoothing, blendMs, autoStart]);

  return {
    engine: engineRef.current,
    tracking,
    eyePosition,
    start,
    stop,
    setSource,
  };
}

/**
 * React hook for Three.js parallax. Creates and manages the engine
 * for a Three.js camera. Does not create the adapter — use with
 * ThreeJSAdapter from 'parallax-display/three'.
 *
 * Usage:
 * ```tsx
 * import { ThreeJSAdapter } from 'parallax-display/three';
 *
 * function MyScene() {
 *   const adapter = useMemo(() => new ThreeJSAdapter({ camera, screen }), []);
 *   const { tracking } = useParallaxEngine({ adapter });
 *   // ...
 * }
 * ```
 */
export function useParallaxEngine(
  config: Omit<ParallaxEngineConfig, 'onTrack' | 'onTrackingLost' | 'onScreenChange'> & {
    /**
     * Start on mount. Default: true for pointer and scroll sources and when
     * no source is given; false for camera and tilt sources.
     */
    autoStart?: boolean;
    onTrack?: (position: EyePosition) => void;
    onTrackingLost?: () => void;
    onScreenChange?: (screen: ScreenConfig) => void;
  },
): UseParallaxReturn {
  const {
    adapter,
    source,
    autoStart = startsWithoutGesture(source),
    onTrack,
    onTrackingLost,
    onScreenChange,
    ...engineConfig
  } = config;

  const engineRef = useRef<ParallaxEngine | null>(null);
  const [tracking, setTracking] = useState(false);
  const [eyePosition, setEyePosition] = useState<EyePosition | null>(null);

  const onTrackRef = useRef(onTrack);
  const onTrackingLostRef = useRef(onTrackingLost);
  const onScreenChangeRef = useRef(onScreenChange);
  onTrackRef.current = onTrack;
  onTrackingLostRef.current = onTrackingLost;
  onScreenChangeRef.current = onScreenChange;

  // The engine's current source, kept across engine re-creation (e.g. a
  // sensitivity change) so it doesn't revert to the mount-time `source`
  const sourceRef = useRef(source);

  const start = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.start();
    setTracking(true);
  }, []);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.stop();
    setTracking(false);
  }, []);

  const setSource = useCallback(async (next: EyeSource) => {
    const engine = engineRef.current;
    if (!engine) {
      sourceRef.current = next;
      return;
    }
    await engine.setSource(next);
    sourceRef.current = engine.getSource();
  }, []);

  useEffect(() => {
    const engine = new ParallaxEngine({
      adapter,
      ...engineConfig,
      source: sourceRef.current,
      onTrack: (pos) => {
        setEyePosition(pos);
        onTrackRef.current?.(pos);
      },
      onTrackingLost: () => {
        onTrackingLostRef.current?.();
      },
      onScreenChange: (s) => {
        onScreenChangeRef.current?.(s);
      },
    });

    engineRef.current = engine;

    if (autoStart) {
      engine.start().then(() => setTracking(true));
    }

    const handleResize = () => engine.updateScreenFromViewport();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.destroy();
      engineRef.current = null;
      setTracking(false);
      setEyePosition(null);
    };
  }, [adapter]);

  return {
    engine: engineRef.current,
    tracking,
    eyePosition,
    start,
    stop,
    setSource,
  };
}
