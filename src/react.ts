import { useEffect, useRef, useState, useCallback } from 'react';
import { ParallaxEngine } from './core/ParallaxEngine';
import { CSSAdapter } from './adapters/CSSAdapter';
import { screenFromViewport } from './projection/screenFromViewport';
import type { ParallaxEngineConfig } from './core/ParallaxEngine';
import type { CSSAdapterConfig } from './adapters/CSSAdapter';
import type { EyePosition } from './tracking/types';
import type { ScreenConfig } from './projection/types';

// Re-export core for convenience
export * from './index';

// --- Types ---

export interface UseParallaxCSSOptions {
  /** CSS adapter sensitivity. Default: 1.0 */
  sensitivity?: number;
  /** CSS pixels per physical inch. Default: 96 */
  ppi?: number;
  /** Smoothing type. Default: 'one-euro' */
  smoothing?: 'none' | 'ema' | 'one-euro';
  /** Auto-start tracking on mount. Default: true */
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
  /** Start tracking (requests camera permission) */
  start: () => Promise<void>;
  /** Stop tracking */
  stop: () => void;
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
 */
export function useParallaxCSS(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseParallaxCSSOptions = {},
): UseParallaxReturn {
  const {
    sensitivity = 1.0,
    ppi,
    smoothing = 'one-euro',
    autoStart = true,
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const screen = screenFromViewport(ppi);
    const adapter = new CSSAdapter({ container, screen, sensitivity });

    const engine = new ParallaxEngine({
      adapter,
      ppi,
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
  }, [containerRef, sensitivity, ppi, smoothing, autoStart]);

  return {
    engine: engineRef.current,
    tracking,
    eyePosition,
    start,
    stop,
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
    autoStart?: boolean;
    onTrack?: (position: EyePosition) => void;
    onTrackingLost?: () => void;
    onScreenChange?: (screen: ScreenConfig) => void;
  },
): UseParallaxReturn {
  const {
    adapter,
    autoStart = true,
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

  useEffect(() => {
    const engine = new ParallaxEngine({
      adapter,
      ...engineConfig,
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
  };
}
