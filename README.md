# parallax-display

Head-tracking parallax 3D display engine that creates the illusion of depth on a flat screen. Move your head and the screen becomes a window into a virtual 3D space. The view can be driven by webcam eye tracking, the pointer, page scroll, or device tilt, and can switch between them live.

Inspired by [Johnny Lee's Wii Remote head tracking project](http://johnnylee.net/projects/wii/), rebuilt for the browser using MediaPipe face tracking and modern web APIs.

**Live demos:** [ethereal.dev](https://ethereal.dev)

## How It Works

An eye position (where the viewer's eyes are relative to the screen) drives the projection. It comes from a **source**: the pointer, the page's scroll position, device tilt, or a webcam (see [Sources](#sources)). With the webcam, MediaPipe tracks the viewer's eye position in real time using MediaPipe Face Mesh. The position drives an off-axis (asymmetric) perspective projection that shifts based on where the viewer is relative to the screen. This makes the screen behave like a physical window — objects behind the screen recede as you move, objects in front pop out.

Two rendering backends are supported:
- **Three.js** — full 3D scenes with geometric depth and off-axis projection
- **CSS 3D Transforms** — lightweight depth layers for web UIs using `perspective` and `translateZ()`

## Installation

The package isn't published to npm yet. Install it straight from GitHub:

```bash
npm install github:jasondecamp/desktop-vr#semver:^0.3.0
```

The `#semver:` range picks the newest matching release tag. npm clones the repo and runs the `prepare` script, which builds `dist/` on install. If your npm version asks you to approve install scripts, allow the build for `parallax-display` (`npm install-scripts approve parallax-display`). Without it, the package installs with no built files.

### Peer Dependencies

All peer dependencies are optional, depending on what you use:

```bash
# Only for webcam tracking (FaceSource, or an engine with no source)
npm install @mediapipe/tasks-vision@0.10.34

# Optional (only for parallax-display/three)
npm install three

# Optional (only for parallax-display/react)
npm install react
```

## Library Entry Points

The library is split into three entry points to keep your bundle lean:

### `parallax-display` — Core (no Three.js or React dependency)

Includes the engine, CSS adapter, sources, face tracking, projection math, filters, and the CalibrationPanel (DOM-only UI).

```typescript
import {
  ParallaxEngine,
  CSSAdapter,
  PointerSource,
  ScrollSource,
  OrientationSource,
  FaceSource,
  CalibrationPanel,
  FaceTracker,
  CoordinateMapper,
  OneEuroFilter,
  EMAFilter,
  computeOffAxisFrustum,
  screenFromViewport,
} from 'parallax-display';
```

### `parallax-display/three` — Three.js adapter + UI overlays

Includes everything from core, plus the Three.js adapter and all Three.js-dependent UI components (CalibrationOverlay, DiagnosticOverlay, GridRoom).

```typescript
import {
  // Everything from core, plus:
  ThreeJSAdapter,
  CalibrationOverlay,
  DiagnosticOverlay,
  GridRoom,
} from 'parallax-display/three';
```

### `parallax-display/react` — React hooks

Includes everything from core, plus React hooks for easy integration.

```typescript
import {
  // Everything from core, plus:
  useParallaxCSS,
  useParallaxEngine,
} from 'parallax-display/react';
```

## Sources

A source produces eye positions for the engine. Pass one as `source`, and switch live with `engine.setSource()`:

```typescript
import { ParallaxEngine, CSSAdapter, PointerSource, FaceSource } from 'parallax-display';

const engine = new ParallaxEngine({
  adapter: new CSSAdapter({ container }),
  source: new PointerSource(),  // no permission prompt
});
await engine.start();

// Later, from a click: opt in to the webcam
cameraButton.onclick = () =>
  engine.setSource(new FaceSource()).catch((err) => showError(err.message));
```

With no `source`, the engine uses the webcam (`FaceSource`) built from the `tracking` and `calibration` options, exactly as in v0.2.

| Source | Input | Permission | Notes |
|--------|-------|------------|-------|
| `PointerSource` | Mouse or trackpad over the window | None | Touch is ignored (dragging is scrolling) |
| `ScrollSource` | Scroll position of an element | None | Pointer is ignored |
| `OrientationSource` | Device tilt | iOS motion prompt | `start()` / `setSource()` must run in a user gesture |
| `FaceSource` | Webcam + MediaPipe | Camera prompt | MediaPipe is loaded on first start |

**Switching.** `setSource()` starts the new source while the current one keeps driving the view (so the pointer still works while the camera opens), then blends from the current view to the new source over `blendMs` (default 500, eased), so the view never jumps. If the new source fails to start (permission denied, no sensor), the current one stays and the promise rejects. The previous source is destroyed, which turns the camera off; sources can be started again, so you can pass one back later.

**Losing tracking.** When a source loses tracking (no face in frame), the view holds where it is and `onTrackingLost` fires. When tracking returns, the view blends back from where it was held.

### `PointerSource`

The pointer acts as a virtual head at a fixed distance. Moving to the viewport edge leans the eye toward that side of the screen.

```typescript
const pointer = new PointerSource({
  distance: 0.6,      // meters from the screen (EyePosition.z)
  range: 0.75,        // viewport edge = 75% of the screen's half-width (1.0 puts the vanishing point under the cursor)
  restOnLeave: true,  // ease back to center when the pointer leaves the window
  easeMs: 400,        // duration of that ease, and of easing in on entry
});
pointer.setDistance(0.7); // e.g. a slight dolly during a transition; applied immediately
```

The engine passes its screen size to the source, so `range` stays proportional to the viewport after resizes and PPI changes.

### `ScrollSource`

The scroll position of an element acts as a virtual head that rises and falls with the page: at the top of the content the eye is raised, at the bottom it's lowered. Scrolling the front layer slides the depth layers behind it. Built for layered UIs where each layer scrolls inside a fixed 3D container:

```typescript
const scroll = new ScrollSource({
  element: frontLayer, // the scroll container to follow
  distance: 0.6,
  range: 0.5,          // top/bottom = 50% of the screen's half-height
});
// When a different layer comes to the front:
scroll.setElement(newFrontLayer); // eases to the new layer's scroll position
```

Content that doesn't scroll sits at center. Horizontal position stays centered.

### `OrientationSource`

Phone or tablet tilt, measured from how the device was held when it started (`recenter()` resets that). On iOS, starting it shows the motion permission prompt, so call `start()` or `setSource()` directly from a tap:

```typescript
tiltButton.onclick = () =>
  engine.setSource(new OrientationSource({ maxTiltDegrees: 20 }))
    .catch((err) => showError(err.message)); // e.g. "Motion and orientation access was denied"
```

### `FaceSource`

Webcam head tracking. Options are the `tracking` options plus `calibration` and the MediaPipe asset locations:

```typescript
new FaceSource({
  smoothing: 'one-euro',
  wasmPath: '/mediapipe/wasm',                    // default: jsDelivr, pinned to MEDIAPIPE_VERSION
  modelPath: '/mediapipe/face_landmarker.task',   // default: Google's public model bucket
});
```

- **Lazy MediaPipe.** `@mediapipe/tasks-vision` is imported dynamically the first time a face source starts. The core bundle doesn't include it, and pages that never use the camera never download it.
- **Pinned assets.** The default WASM URL is pinned to `MEDIAPIPE_VERSION` (`0.10.34`), which must match the installed `@mediapipe/tasks-vision` (the peer dependency is pinned to it). To use another version, or to self-host, set `wasmPath` to WASM files from the version you have installed.
- **No calibration required.** Without calibration, eye positions are used as measured: centered means directly in front of the middle of the screen, with camera placement from the `CalibrationConfig` defaults. The calibration overlay and panel are optional developer tools.

### Server rendering

Importing any entry point (`parallax-display`, `/three`, `/react`) under Node is safe: nothing touches `window`, `document`, or `navigator` at import time or in constructors, and the React hooks only create the engine in an effect. Pages that import the package can be prerendered.

## Integration Guide

### Minimal Three.js Setup

Add head-tracked parallax to any Three.js scene in ~10 lines:

```typescript
import * as THREE from 'three';
import { ParallaxEngine, ThreeJSAdapter, screenFromViewport } from 'parallax-display/three';

// Your existing Three.js scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);

// Add parallax — screen dimensions auto-computed from viewport
const screen = screenFromViewport();
const adapter = new ThreeJSAdapter({ camera, screen });
const engine = new ParallaxEngine({ adapter });

await engine.start(); // requests camera permission

// Your render loop — no changes needed, the engine updates the camera automatically
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Handle resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  engine.updateScreenFromViewport();
});
```

**Scene coordinate system:**
- `z = 0` is the screen plane
- Negative z = behind the screen (recedes into display)
- Positive z = in front of the screen (pops out toward viewer)

### Minimal CSS Setup

Add depth to any webpage without Three.js:

```typescript
import { ParallaxEngine, CSSAdapter } from 'parallax-display';

// Screen dimensions are auto-computed from the viewport when omitted
const container = document.getElementById('scene');
const adapter = new CSSAdapter({ container });
const engine = new ParallaxEngine({ adapter });

await engine.start();
```

Child elements use `transform: translateZ()` for depth layers:

```html
<div id="scene">
  <div style="transform: translateZ(-200px)">Behind the screen</div>
  <div style="transform: translateZ(0px)">At screen plane</div>
  <div style="transform: translateZ(100px)">Pops forward</div>
</div>
```

**Important CSS notes:**
- The container needs `transform-style: preserve-3d` (the adapter sets this automatically)
- Avoid `backdrop-filter` and `opacity` on depth-layered children — they break `preserve-3d` z-sorting
- Use alpha in colors instead of `opacity`, and solid backgrounds instead of `backdrop-filter: blur()`

### Adding Calibration

The calibration overlay guides users through a two-step process to establish their natural viewing position:

```typescript
import {
  ParallaxEngine, ThreeJSAdapter, CalibrationOverlay, screenFromViewport,
} from 'parallax-display/three';

const screen = screenFromViewport();
const adapter = new ThreeJSAdapter({ camera, screen });
const engine = new ParallaxEngine({ adapter });

// Auto-launches after engine.start(), re-invokable with 'c' key
const calibration = new CalibrationOverlay({
  engine,
  autoStart: true,       // launch automatically (default)
  triggerKey: 'c',       // re-open with this key (default)
  onComplete: (offset) => console.log('Calibrated:', offset),
  onDismiss: () => {
    // Show your scene after calibration closes (complete or skipped)
    renderer.domElement.style.visibility = 'visible';
  },
});

await engine.start();
```

### Adding the Calibration Panel

A collapsible side panel with live controls, camera preview with landmark visualization, and a PPI ruler:

```typescript
import { CalibrationPanel } from 'parallax-display';

const panel = new CalibrationPanel({
  engine,
  toggleKey: '`',         // backtick to toggle (default)
  startCollapsed: true,   // start hidden (default: false)
});
```

The panel provides runtime controls for:
- **PPI calibration** — drag a ruler to match 1 inch on your physical screen
- **Screen dimensions** — auto-computed from viewport, manually adjustable
- **Camera settings** — FOV, Y offset, IPD, mirror
- **Smoothing** — switch filter type and tune parameters
- **Camera preview** — live feed with tracked landmark annotations

### Adding Diagnostics

Verify tracking accuracy with three built-in tests:

```typescript
import { DiagnosticOverlay } from 'parallax-display/three';

const diagnostics = new DiagnosticOverlay({
  engine,
  triggerKey: 'd',  // default
});
```

Press `d` to open. Three tests:
- **Z Distance** — compare tracked distance to a tape measure
- **Screen-Plane Stability** — crosshair at z=0 should be motionless (drift meter shows pixel drift)
- **PPI Check** — 1-inch reference square to verify with a ruler

### Adding a Grid Room Background

A viewport-anchored grid room that creates the "looking into a box" effect:

```typescript
import { GridRoom, screenFromViewport } from 'parallax-display/three';

const screen = screenFromViewport();
const room = new GridRoom(screen, {
  depth: 0.60,           // how far back the grid extends (meters)
  gridSpacing: 0.053,    // distance between grid lines
  lineWidth: 1.5,        // line weight in pixels
  showBackWall: false,    // open-ended or closed box
  wallStyle: 'grid',     // 'grid' (wireframe) or 'solid' (lit mesh)
});
scene.add(room.getGroup());

// On resize — rebuild to match new viewport edges
window.addEventListener('resize', () => {
  room.updateScreen(engine.getScreenConfig());
  room.updateResolution();
});

// When PPI or screen changes at runtime
const engine = new ParallaxEngine({
  adapter,
  onScreenChange: (s) => room.updateScreen(s),
});
```

### Full Integration Example

Putting it all together — a complete Three.js app with all amenities:

```typescript
import * as THREE from 'three';
import {
  ParallaxEngine, ThreeJSAdapter, CalibrationPanel,
  CalibrationOverlay, DiagnosticOverlay, GridRoom, screenFromViewport,
} from 'parallax-display/three';

// Scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.visibility = 'hidden'; // hide until calibrated
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);

// Grid room
const screen = screenFromViewport();
const room = new GridRoom(screen, { depth: 0.60, gridSpacing: 0.053 });
scene.add(room.getGroup());

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

// Add your scene content here (z=0 is the screen plane)
const box = new THREE.Mesh(
  new THREE.BoxGeometry(0.05, 0.05, 0.05),
  new THREE.MeshStandardMaterial({ color: 0x44aaff }),
);
box.position.set(0, 0, -0.10); // 10cm behind screen
scene.add(box);

// Engine — auto-computes screen from viewport
const adapter = new ThreeJSAdapter({ camera, screen });
const engine = new ParallaxEngine({
  adapter,
  onScreenChange: (s) => room.updateScreen(s),
});

// UI
new CalibrationPanel({ engine, startCollapsed: true });
new CalibrationOverlay({
  engine,
  onDismiss: () => { renderer.domElement.style.visibility = 'visible'; },
});
new DiagnosticOverlay({ engine });

// Start
await engine.start();

// Render loop
(function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
})();

// Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  engine.updateScreenFromViewport();
  room.rebuild();
  room.updateResolution();
});
```

### React — CSS Parallax

The `useParallaxCSS` hook handles all setup, teardown, and resize for you:

```tsx
import { useRef } from 'react';
import { useParallaxCSS } from 'parallax-display/react';

function ParallaxScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { tracking, eyePosition } = useParallaxCSS(containerRef, {
    sensitivity: 1.2,
    smoothing: 'one-euro',
  });

  return (
    <div ref={containerRef}>
      <div style={{ transform: 'translateZ(-100px)' }}>Background layer</div>
      <div style={{ transform: 'translateZ(0px)' }}>Screen plane</div>
      <div style={{ transform: 'translateZ(80px)' }}>Foreground layer</div>
      {tracking && <p>Tracking at z={eyePosition?.z.toFixed(2)}m</p>}
    </div>
  );
}
```

**`useParallaxCSS` options:**

| Option | Default | Description |
|--------|---------|-------------|
| `sensitivity` | `1.0` | CSS parallax intensity multiplier |
| `ppi` | `96` | CSS pixels per physical inch |
| `smoothing` | `'one-euro'` | Filter type (webcam only) |
| `source` | webcam | Initial `EyeSource`; change it later with `setSource` |
| `blendMs` | `500` | Blend duration when switching sources |
| `autoStart` | see below | Start tracking on mount |
| `onTrack` | — | Callback each frame with `EyePosition` |
| `onTrackingLost` | — | Callback when face not detected |
| `onScreenChange` | — | Callback when screen config changes |

`autoStart` defaults to `true` for `PointerSource` and `ScrollSource` (and when no `source` is given, as in v0.2), and to `false` for `FaceSource` and `OrientationSource`, which show a permission prompt and should start from a deliberate `start()` or `setSource()` call.

`source` is read on mount. Create it once (for example `useState(() => new PointerSource())`) rather than inline on every render.

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `engine` | `ParallaxEngine \| null` | Engine instance for advanced control |
| `tracking` | `boolean` | Whether tracking is active |
| `eyePosition` | `EyePosition \| null` | Current eye position (updates each frame) |
| `start` | `() => Promise<void>` | Start tracking manually |
| `stop` | `() => void` | Stop tracking |
| `setSource` | `(source: EyeSource) => Promise<void>` | Switch sources with a blend; rejects if the new one can't start |

### React — Three.js Parallax

For Three.js (works with `@react-three/fiber` or vanilla Three.js in React), use `useParallaxEngine` with a `ThreeJSAdapter`:

```tsx
import { useRef, useMemo, useEffect } from 'react';
import { useParallaxEngine } from 'parallax-display/react';
import { ThreeJSAdapter, CalibrationOverlay, screenFromViewport } from 'parallax-display/three';
import * as THREE from 'three';

function ThreeScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  // Set up Three.js scene (once)
  const { camera, renderer, scene } = useMemo(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
    const scene = new THREE.Scene();
    return { camera, renderer, scene };
  }, []);

  const adapter = useMemo(
    () => new ThreeJSAdapter({ camera, screen: screenFromViewport() }),
    [camera],
  );

  const { tracking } = useParallaxEngine({ adapter });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    renderer.setSize(innerWidth, innerHeight);
    el.appendChild(renderer.domElement);

    // Add your scene content
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x44aaff }),
    );
    box.position.z = -0.10;
    scene.add(box);

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => { renderer.dispose(); };
  }, [renderer, scene, camera]);

  return <div ref={mountRef} />;
}
```

**`useParallaxEngine` accepts** the same options as `ParallaxEngineConfig` (including `source`) plus `autoStart` (same defaults as above). It returns the same `UseParallaxReturn` shape as `useParallaxCSS`.

## Architecture

```
Source: Pointer | Scroll | Orientation | Face
                                          ↓
                    Camera Feed → MediaPipe Face Mesh → 8 Facial Landmarks
                                          ↓
                    Coordinate Mapper (camera pixels → meters relative to screen)
                                          ↓
                    One-Euro Filter (adaptive smoothing)
    ↓
Engine (blends between sources, holds on tracking loss)
    ↓
Off-Axis Frustum Computation
    ↓
Adapter → Three.js (projection matrix) or CSS (perspective-origin)
```

### Tracked Landmarks

| Landmark | ID | Role |
|----------|-----|------|
| Left/Right iris | 468, 473 | Precise eye position (40% weight) |
| Inner canthi | 133, 362 | Stable anchors, blink-resistant (60% weight) |
| Outer canthi | 33, 263 | Fallback IPD for depth estimation |
| Nose bridge | 168 | Vertical reference |
| Nose tip | 1 | Vertical reference |

Position tracking blends inner canthi (60%) with iris centers (40%) for stability without sacrificing precision. Depth is estimated from inter-pupillary distance.

## Calibration

### Two-Step Calibration Flow (press `c`)

1. **Align** — Move your head until white crosshairs overlap red ones. Press Enter.
2. **Natural position** — Sit comfortably in your normal position. Press Enter.

The offset between the two captures becomes the "zero origin" for all tracking, so the parallax is centered on your natural sitting position.

### PPI Ruler Calibration (in calibration panel, press `` ` ``)

The system auto-computes screen dimensions from viewport pixels using CSS PPI (default: 96). For accuracy, open the calibration panel and drag the ruler handle until the blue line matches exactly 1 inch on a physical ruler. This corrects all screen dimension calculations.

### Diagnostic Overlay (press `d`)

Three verification tests:

- **Z Distance** — Compare tracked distance to a tape measure reading
- **Screen-Plane Stability** — A crosshair at z=0 should be completely motionless as you move. Any drift indicates calibration issues.
- **PPI Check** — A 1-inch reference square to verify with a ruler

## API Reference

### ParallaxEngine

```typescript
interface ParallaxEngineConfig {
  adapter: ThreeJSAdapter | CSSAdapter;
  screen?: Partial<ScreenConfig>;       // auto-computed from viewport if omitted
  source?: EyeSource;                    // default: FaceSource from tracking + calibration
  calibration?: Partial<CalibrationConfig>;
  tracking?: { maxFps?, facingMode?, smoothing?, wasmPath?, modelPath? };
  ppi?: number;                          // CSS pixels per inch (default: 96)
  blendMs?: number;                      // source switch / reacquire blend (default: 500)
  onTrack?: (position: EyePosition) => void;
  onTrackingLost?: () => void;           // the view holds until tracking returns
  onScreenChange?: (screen: ScreenConfig) => void;
}
```

| Method | Description |
|--------|-------------|
| `start()` | Start the source (for the webcam: camera + MediaPipe) |
| `stop()` | Pause tracking |
| `destroy()` | Full cleanup |
| `setSource(source)` | Switch sources live, blending over `blendMs` |
| `getSource()` | The active source (e.g. to call `setDistance()`) |
| `setPpi(ppi)` | Update PPI and recompute screen dimensions |
| `updateCalibration(updates)` | Adjust camera FOV, IPD, offset, mirror |
| `updateScreen(updates)` | Set screen dimensions directly |
| `updateScreenFromViewport()` | Recompute screen from viewport + PPI |
| `setEyeOffset(offset)` | Set the tracked position zero-origin |
| `setSmoothing(type)` | Switch filter: `'none'`, `'ema'`, `'one-euro'` (webcam only) |
| `getEyePosition()` | Current adjusted eye position |
| `getRawEyePosition()` | Position before offset applied |
| `getRawFaceData()` | All tracked landmarks + blink state (webcam only) |
| `getScreenConfig()` | Current physical screen dimensions |
| `getAdapter()` | The active adapter instance |
| `getFilter()` | The active smoothing filter instance |
| `getPpi()` | Current PPI value |

### Types

```typescript
interface EyeSource {
  start(emit: (position: EyePosition) => void, lost: () => void): Promise<void>;
  stop(): void;
  destroy(): void;
  updateScreen?(screen: ScreenConfig): void; // receives the engine's screen size
}

interface EyePosition {
  x: number;  // meters, positive = right of screen center
  y: number;  // meters, positive = above screen center
  z: number;  // meters, distance from screen (always positive)
}

interface ScreenConfig {
  widthMeters: number;   // physical viewport width in meters
  heightMeters: number;  // physical viewport height in meters
}

interface CalibrationConfig {
  realIPD: number;           // inter-pupillary distance (default: 0.063m)
  cameraFovDegrees: number;  // webcam horizontal FOV (default: 60)
  cameraOffsetY: number;     // camera height above screen center (default: 0.02m)
  mirrorX: boolean;          // flip X for front camera (default: true)
}
```

### screenFromViewport

```typescript
function screenFromViewport(ppi?: number): ScreenConfig
```

Computes physical screen dimensions from `window.innerWidth/Height` divided by PPI, converted to meters. Default PPI is 96 (CSS standard). Use the calibration panel's ruler tool for accurate PPI.

### Adapters

Both adapters implement:

```typescript
update(eye: EyePosition): void
updateScreen(screen: ScreenConfig): void
```

**ThreeJSAdapter** — sets a custom off-axis projection matrix on the camera each frame.

```typescript
new ThreeJSAdapter({
  camera: THREE.PerspectiveCamera,
  screen: ScreenConfig,
  near?: number,   // clipping plane (default: 0.05)
  far?: number,    // clipping plane (default: 100)
})
```

**CSSAdapter** — sets `perspective` and `perspective-origin` on a container element.

```typescript
new CSSAdapter({
  container: HTMLElement,
  screen?: ScreenConfig, // auto-computed from viewport if omitted
  ppi?: number,          // used when screen is omitted (default: 96)
  sensitivity?: number,  // parallax intensity multiplier (default: 1.0)
})
```

Additional methods: `setSensitivity(value)`, `getSensitivity()`, and `setScrollOffsetY(px)`: if the 3D container scrolls inside an element rather than the window, pass that element's `scrollTop` so the vanishing point stays centered on screen.

### UI Components

| Component | Import | Trigger | Purpose |
|-----------|--------|---------|---------|
| `CalibrationPanel` | `parallax-display` | `` ` `` key | Side panel with controls + camera preview |
| `CalibrationOverlay` | `parallax-display/three` | `c` key | Full-screen guided calibration |
| `DiagnosticOverlay` | `parallax-display/three` | `d` key | Tracking accuracy verification |
| `GridRoom` | `parallax-display/three` | — | Viewport-anchored grid room background |

### Filters

**One-Euro Filter** (default) — adapts smoothing based on movement speed:
- `minCutoff: 3.0` — base responsiveness (higher = less lag)
- `beta: 0.05` — speed sensitivity (higher = faster response to movement)

**EMA Filter** — simple exponential moving average:
- `alpha: 0.3` — blend factor (higher = more responsive, more jitter)

Both can be tuned at runtime via the calibration panel or `engine.getFilter().updateParams()`.

## Project Structure

```
src/
  index.ts                      # core entry point (no Three.js or React dependency)
  three.ts                      # Three.js entry point (re-exports core + adds Three.js deps)
  react.ts                      # React hooks entry point (re-exports core + adds hooks)
  core/
    ParallaxEngine.ts           # orchestrator: runs a source, blends between sources
    transition.ts               # eased blends
  sources/
    types.ts                    # EyeSource interface
    PointerSource.ts            # mouse / trackpad
    ScrollSource.ts             # scroll position of an element
    OrientationSource.ts        # device tilt
    FaceSource.ts               # webcam (wraps FaceTracker)
  tracking/
    FaceTracker.ts              # webcam + MediaPipe (loaded on demand)
    mediapipe.ts                # MEDIAPIPE_VERSION and default asset URLs
    filters.ts                  # One-Euro and EMA smoothing
    types.ts                    # EyePosition, RawFaceData, TrackingConfig
  projection/
    frustum.ts                  # off-axis perspective math
    coordinateMapper.ts         # camera pixels → world meters
    screenFromViewport.ts       # viewport → physical screen dimensions
    types.ts                    # Frustum, ScreenConfig, CalibrationConfig
  adapters/
    ThreeJSAdapter.ts           # Three.js projection matrix
    CSSAdapter.ts               # CSS perspective + perspective-origin
  ui/
    CalibrationOverlay.ts       # guided two-step calibration (Three.js)
    CalibrationPanel.ts         # side panel with controls (DOM-only)
    DiagnosticOverlay.ts        # tracking verification tests (Three.js)
    gridRoom.ts                 # viewport-anchored grid background (Three.js)
examples/
  three-demo/                   # 3D targets in a grid room
  css-demo/                     # depth-layered cards and shapes (no Three.js)
  ui-controls-demo/             # spatial navigation through stacked depth layers; pointer, scroll, camera, tilt
test/                           # Vitest suite (jsdom, plus Node for SSR)
```

## Scripts

```bash
npm run dev        # start dev server (serves examples)
npm run build      # build library (ESM + CJS) + type declarations
npm run build:site # build demo site for deployment (multi-page app)
npm run preview    # preview production site build
npm run typecheck  # type-check without emitting
npm test           # run the Vitest suite
```

## Deployment

The demo site builds as a multi-page app (separate from the library build) with a landing page linking to all three demos.

### ethereal.dev

The live demos at [ethereal.dev](https://ethereal.dev) are served by the Vercel project `desktop-vr` (team DesktopVR), which is connected to this GitHub repo:

- **Production:** merging a PR into `main` deploys to ethereal.dev. `main` is protected, so changes land through pull requests rather than direct pushes.
- **Previews:** every PR gets its own preview deployment URL, posted on the PR.

The `vercel.json` configures:
- **Build command:** `npm run build:site`
- **Output directory:** `dist-site`

To deploy manually from a local checkout (for example, to roll forward without a PR), run `vercel --prod` from the repo root. This needs the Vercel CLI, logged in with access to the DesktopVR team.

### Deploying your own copy

1. Import the repo at [vercel.com/new](https://vercel.com/new)
2. Vercel picks up the build settings from `vercel.json`, so there's nothing to configure
3. Pushes to your production branch deploy automatically

### Other hosts

Any static hosting that can run a build command works:

```bash
npm run build:site
# serve the dist-site/ directory
```

Note: webcam tracking requires HTTPS. Most hosting providers (Vercel, Netlify, GitHub Pages) provide this by default.

## Dependencies

**Optional peer dependencies:**
- **[@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)** `0.10.34` — face landmark detection (only for webcam tracking)
- **[three](https://www.npmjs.com/package/three)** — 3D rendering (only needed for `parallax-display/three`)
- **[react](https://www.npmjs.com/package/react)** — React 18+ (only needed for `parallax-display/react`)

## License

MIT
