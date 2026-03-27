import { ParallaxEngine, CSSAdapter, CalibrationPanel, CalibrationOverlay, DiagnosticOverlay, screenFromViewport } from '../../src/three';
import type { EyePosition } from '../../src/three';

const screen = screenFromViewport();

const container = document.getElementById('scene')!;
container.style.visibility = 'hidden';
const eyePosEl = document.getElementById('eye-pos')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.2 });

const engine = new ParallaxEngine({
  adapter,
  persist: true,
  tracking: { smoothing: 'one-euro' },
  onTrack: (pos: EyePosition) => {
    eyePosEl.textContent = `x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)}`;
    statusEl.textContent = 'tracking';
  },
  onTrackingLost: () => {
    statusEl.textContent = 'face not detected';
  },
});

const panel = new CalibrationPanel({ engine, startCollapsed: true });
const calibration = new CalibrationOverlay({
  engine,
  onDismiss: () => { container.style.visibility = 'visible'; },
});
const diagnostics = new DiagnosticOverlay({ engine });

startBtn.addEventListener('click', async () => {
  startBtn.style.display = 'none';
  statusEl.textContent = 'initializing camera...';
  try {
    await engine.start();
    statusEl.textContent = 'tracking';
  } catch (err) {
    statusEl.textContent = `error: ${err instanceof Error ? err.message : err}`;
    startBtn.style.display = 'block';
  }
});
