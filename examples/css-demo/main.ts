// Public API equivalent:
//   import { ParallaxEngine, CSSAdapter, CalibrationPanel } from 'parallax-display';
import { ParallaxEngine, CSSAdapter, CalibrationPanel } from '../../src/index';
import type { EyePosition } from '../../src/index';

const container = document.getElementById('scene')!;
const eyePosEl = document.getElementById('eye-pos')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

const adapter = new CSSAdapter({ container, sensitivity: 1.2 });

const engine = new ParallaxEngine({
  adapter,
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
