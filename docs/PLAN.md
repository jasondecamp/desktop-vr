# parallax-display v0.3.0 plan: input sources

Status (2026-10-27): **ready to implement.** Prerequisite for the fourfightingfoxes.com spatial redesign (`~/work/fourfightingfoxes/docs/PLAN.md`), which installs this as `github:jasondecamp/desktop-vr#semver:^0.3.0` and waits on the `v0.3.0` tag.

## Goal

Let the engine drive parallax from inputs other than a webcam, so a site can offer head-tracked depth as an opt-in on top of a default that needs no camera:

- **Pointer** (mouse or trackpad) acting as a virtual head at a fixed, configurable distance.
- **Device orientation** (phone or tablet tilt).
- **Face** (the existing webcam tracking), loaded only when it's used.

All three produce an `EyePosition` that feeds the same adapter and projection math, and a running engine can switch between them without the view jumping.

## Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Where pointer and tilt live | In the library, as sources, not in consuming sites. The off-axis math stays in one place, and every demo gets a no-camera mode. |
| 2 | Pointer depth | `PointerSource` takes a configurable `distance` (meters) that fills `EyePosition.z`, plus `setDistance()` at runtime so a site can animate it (for example, a slight dolly during transitions). It is not visitor-adjustable: scroll is the page's. |
| 3 | Pointer range | x/y map from the pointer's position over the viewport to an eye offset scaled by a `range` option, so the viewport edge is a moderate lean, not an extreme. |
| 4 | MediaPipe assets | `FaceSource` takes `wasmPath` and `modelPath`. Defaults point at the public CDNs, pinned to the installed `@mediapipe/tasks-vision` version (never `@latest`). |
| 5 | MediaPipe loading | `@mediapipe/tasks-vision` is imported dynamically inside `FaceSource.start()`, so the core entry no longer bundles it. Consumers that never use the face source never download it. |
| 6 | Calibration | Optional. With no calibration, the eye position is used as measured: "centered" means directly in front of the screen's middle, and camera placement comes from the existing `CalibrationConfig` defaults. The overlays and panel stay as developer tools; the engine never requires them. |

## Design

### `EyeSource`

```ts
export interface EyeSource {
  /** Begin producing positions. May prompt for permission (camera, iOS motion). */
  start(emit: (position: EyePosition) => void, lost: () => void): Promise<void>;
  stop(): void;
  destroy(): void;
}
```

- **`FaceSource`**: today's `FaceTracker`, wrapped. It owns the video element, MediaPipe, the `CoordinateMapper`, and smoothing (the One Euro and EMA filters stay here; they exist for camera noise). Options: `wasmPath`, `modelPath`, plus the existing `TrackingConfig`. `FaceTracker` stays exported for compatibility.
- **`PointerSource`**: listens to `pointermove` on `window`. Options: `distance` (default 0.6 m), `range` (default 0.5: the viewport edge maps to an eye offset of half the screen's half-width), and `restOnLeave` (default true: easing back to center when the pointer leaves the window). `setDistance(meters)` at runtime. Touch pointers are ignored (`pointerType === 'touch'`): dragging on a phone is scrolling, not looking.
- **`OrientationSource`**: listens to `deviceorientation`, mapping beta/gamma (relative to the orientation at start) to an eye offset at a fixed `distance`, with the same `range`. `start()` calls `DeviceOrientationEvent.requestPermission()` where it exists (iOS), so it must be called from a user gesture; the rejection is surfaced as a thrown error the site can show.

### `ParallaxEngine`

- Config takes `source?: EyeSource`. When it's omitted, the engine builds a `FaceSource` from the existing `tracking` and `calibration` options, so v0.2 code keeps working unchanged.
- `setSource(source)` swaps sources on a running engine: the old one stops, the new one starts, and output **blends** from the last emitted position to the new source's positions over `blendMs` (default 500, eased). No jump when going from pointer to webcam.
- On `lost`, output eases to a rest position (`x: 0, y: 0, z: rest distance`) instead of freezing wherever it was, then `onTrackingLost` fires as now.
- `getSource()` for consumers that need to call `setDistance()`.
- Calibration hooks (`setEyeOffset`, `pauseAdapterUpdates`) are unchanged and still apply to every source.

### SSR safety

Nothing touches `window`, `document`, or `navigator` at import time or in constructors; all of it moves into `start()`. A server render that imports the package (fourfightingfoxes prerenders every page) must not throw. `screenFromViewport()` is only called lazily.

### Known bug to fix along the way

`CSSAdapter.setScrollOffsetY()` stores a value that `update()` never reads. Either apply it to `originY` or remove it. (The site scrolls inside its layers, not the window, so it doesn't need it. Decide based on the examples.)

## Phases

Prerequisite: land or close the open `fix/three-demo-tracking-status` branch so this starts from a clean `main`.

### 1. Source abstraction

- [ ] `EyeSource` interface; `FaceSource` wrapping `FaceTracker`; engine uses a source instead of constructing `FaceTracker` directly.
- [ ] Dynamic import of `@mediapipe/tasks-vision` inside `FaceSource`; verify the built `dist/index.js` no longer contains MediaPipe.
- [ ] `wasmPath` / `modelPath` options, with defaults pinned to the installed version (a `MEDIAPIPE_VERSION` constant, and a test that asserts it matches `node_modules/@mediapipe/tasks-vision/package.json`).
- [ ] SSR safety: importing every entry point under Node throws nothing.

### 2. Pointer and orientation

- [ ] `PointerSource` with `distance`, `range`, `restOnLeave`, `setDistance()`.
- [ ] `OrientationSource` with the iOS permission flow.
- [ ] `setSource()` with blending, and easing to rest on `lost`.

### 3. React hooks

- [ ] `useParallaxCSS` and `useParallaxEngine` accept `source` and expose `setSource`. `autoStart` with a pointer source needs no gesture; with a face or orientation source it should stay a deliberate call.

### 4. Tests

- [ ] Add Vitest (jsdom). Cover: pointer position → `EyePosition` mapping at the center, edges, and with `range`; `setDistance`; rest-on-leave easing; source switching blends (no discontinuity over the first frames); `lost` eases to rest; the MediaPipe version pin; SSR import.

### 5. Examples, docs, release

- [ ] `ui-controls-demo`: starts in pointer mode with no button, and offers "Use camera" / "Use tilt" to switch live, showing the blend. Reset its `TRANSITION_MS` TODO.
- [ ] README: a "Sources" section (pointer, orientation, face), the no-calibration path, the asset path options, and the lazy MediaPipe note.
- [ ] Bump to `0.3.0`, tag `v0.3.0`, push the tag. Verify a fresh `pnpm add github:jasondecamp/desktop-vr#semver:^0.3.0` in a scratch project installs, builds through `prepare`, and imports under Node.

## Done when

The `v0.3.0` tag exists, and a consumer can start in pointer mode with no permission prompt, switch to the webcam or tilt on a click without the view jumping, and server-render a page that imports the package.
