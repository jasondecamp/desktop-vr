# parallax-display

Head-tracking parallax 3D display engine that uses webcam-based eye tracking to create the illusion of depth on a flat screen. Move your head and the screen becomes a window into a virtual 3D space.

Inspired by [Johnny Lee's Wii Remote head tracking project](http://johnnylee.net/projects/wii/), rebuilt for the browser using MediaPipe face tracking and modern web APIs.

## How It Works

A webcam tracks the viewer's eye position in real time using MediaPipe Face Mesh. The tracked position drives an off-axis (asymmetric) perspective projection that shifts based on where the viewer is relative to the screen. This makes the screen behave like a physical window — objects behind the screen recede as you move, objects in front pop out.

Two rendering backends are supported:
- **Three.js** — full 3D scenes with geometric depth and off-axis projection
- **CSS 3D Transforms** — lightweight depth layers for web UIs using `perspective` and `translateZ()`

## Quick Start

```bash
npm install
npm run dev
```

The dev server opens the Three.js demo. Click "Start" to grant camera access. The calibration overlay launches automatically.

### Keyboard Shortcuts

| Key | Function |
|-----|----------|
| `` ` `` | Toggle calibration panel |
| `c` | Open calibration overlay |
| `d` | Open diagnostic overlay |
| `Enter` | Advance calibration step |
| `Escape` | Skip/close overlay |

## Usage

### Three.js

```typescript
import { ParallaxEngine, ThreeJSAdapter, screenFromViewport } from 'parallax-display';

const screen = screenFromViewport(); // auto-compute from viewport
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
const adapter = new ThreeJSAdapter({ camera, screen });

const engine = new ParallaxEngine({
  adapter,
  onTrack: (pos) => { /* pos.x, pos.y, pos.z in meters */ },
});

await engine.start();

// Scene setup: z=0 is the screen plane
// Negative z = behind the screen (recedes into display)
// Positive z = in front of the screen (pops out toward viewer)
```

### CSS 3D

```typescript
import { ParallaxEngine, CSSAdapter, screenFromViewport } from 'parallax-display';

const screen = screenFromViewport();
const container = document.getElementById('scene');
const adapter = new CSSAdapter({ container, screen });

const engine = new ParallaxEngine({ adapter });
await engine.start();
```

Child elements use `transform: translateZ()` for depth:

```html
<div id="scene">
  <div style="transform: translateZ(-200px)">Behind the screen</div>
  <div style="transform: translateZ(0px)">At screen plane</div>
  <div style="transform: translateZ(100px)">Pops forward</div>
</div>
```

## Architecture

```
Camera Feed → MediaPipe Face Mesh → 8 Facial Landmarks
    ↓
Coordinate Mapper (camera pixels → meters relative to screen)
    ↓
One-Euro Filter (adaptive smoothing)
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
  calibration?: Partial<CalibrationConfig>;
  tracking?: { maxFps?, facingMode?, smoothing? };
  ppi?: number;                          // CSS pixels per inch (default: 96)
  onTrack?: (position: EyePosition) => void;
  onTrackingLost?: () => void;
  onScreenChange?: (screen: ScreenConfig) => void;
}
```

| Method | Description |
|--------|-------------|
| `start()` | Initialize camera + MediaPipe and begin tracking |
| `stop()` | Pause tracking |
| `destroy()` | Full cleanup |
| `setPpi(ppi)` | Update PPI and recompute screen dimensions |
| `updateCalibration(updates)` | Adjust camera FOV, IPD, offset, mirror |
| `updateScreen(updates)` | Set screen dimensions directly |
| `updateScreenFromViewport()` | Recompute screen from viewport + PPI |
| `setEyeOffset(offset)` | Set the tracked position zero-origin |
| `setSmoothing(type)` | Switch filter: `'none'`, `'ema'`, `'one-euro'` |
| `getEyePosition()` | Current adjusted eye position |
| `getRawEyePosition()` | Position before offset applied |
| `getRawFaceData()` | All tracked landmarks + blink state |

### EyePosition

```typescript
interface EyePosition {
  x: number;  // meters, positive = right of screen center
  y: number;  // meters, positive = above screen center
  z: number;  // meters, distance from screen (always positive)
}
```

### ScreenConfig

```typescript
interface ScreenConfig {
  widthMeters: number;   // physical viewport width
  heightMeters: number;  // physical viewport height
}
```

### CalibrationConfig

```typescript
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

Computes physical screen dimensions from `window.innerWidth/Height` divided by PPI, converted to meters. Default PPI is 96 (CSS standard).

### Adapters

Both adapters implement:

```typescript
update(eye: EyePosition): void
updateScreen(screen: ScreenConfig): void
```

**ThreeJSAdapter** additionally takes `near`/`far` clipping planes.
**CSSAdapter** additionally has `setSensitivity(value)` / `getSensitivity()`.

### UI Components

| Component | Trigger | Purpose |
|-----------|---------|---------|
| `CalibrationOverlay` | `c` key, auto on start | Two-step guided calibration |
| `CalibrationPanel` | `` ` `` key | Live controls, camera preview, PPI ruler |
| `DiagnosticOverlay` | `d` key | Tracking accuracy verification |
| `GridRoom` | — | Viewport-anchored grid room background |

### GridRoom

```typescript
const room = new GridRoom(screenConfig, {
  depth: 0.60,          // how far back the grid extends
  gridSpacing: 0.053,   // line density
  lineWidth: 1.5,       // line weight in pixels
  showBackWall: false,   // close the box or fade to black
  wallStyle: 'grid',    // 'grid' or 'solid'
});
scene.add(room.getGroup());

// On resize:
room.updateScreen(newScreenConfig);
room.updateResolution();
room.rebuild();
```

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
  index.ts                      # public API barrel
  core/
    ParallaxEngine.ts           # orchestrator
  tracking/
    FaceTracker.ts              # webcam + MediaPipe
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
    CalibrationOverlay.ts       # guided two-step calibration
    CalibrationPanel.ts         # side panel with controls
    DiagnosticOverlay.ts        # tracking verification tests
    gridRoom.ts                 # viewport-anchored grid background
examples/
  three-demo/                   # 3D targets in a grid room
  css-demo/                     # depth-layered cards and shapes
```

## Scripts

```bash
npm run dev        # start dev server (serves examples)
npm run build      # build library (ESM + UMD) + type declarations
npm run build:site # build demo site for deployment (multi-page app)
npm run preview    # preview production site build
npm run typecheck  # type-check without emitting
```

## Deployment

The project includes a Vercel configuration for one-click deployment. The demo site builds as a multi-page app (separate from the library build) with a landing page linking to both demos.

### Vercel (recommended)

1. Import the repo at [vercel.com/new](https://vercel.com/new)
2. Vercel auto-detects the config from `vercel.json` — no settings to change
3. Deploys automatically on every push to `main`

Or deploy manually via CLI:

```bash
npx vercel --prod
```

The `vercel.json` configures:
- **Build command:** `npm run build:site`
- **Output directory:** `dist-site`

### Other hosts

Any static hosting that can run a build command works:

```bash
npm run build:site
# serve the dist-site/ directory
```

Note: webcam tracking requires HTTPS. Most hosting providers (Vercel, Netlify, GitHub Pages) provide this by default.

## Dependencies

- **[@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision)** — face landmark detection
- **[three](https://www.npmjs.com/package/three)** — 3D rendering (external, not bundled)

## License

MIT
