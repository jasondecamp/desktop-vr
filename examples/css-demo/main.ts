import { ParallaxEngine, CSSAdapter } from '../../src/index';
import type { EyePosition, ScreenConfig } from '../../src/index';

const screen: ScreenConfig = {
  widthMeters: 0.34,
  heightMeters: 0.21,
};

const container = document.getElementById('scene')!;
const eyePosEl = document.getElementById('eye-pos')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.2 });

const engine = new ParallaxEngine({
  adapter,
  screen,
  tracking: { smoothing: 'one-euro' },
  onTrack: (pos: EyePosition) => {
    eyePosEl.textContent = `x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)}`;
    statusEl.textContent = 'tracking';
  },
  onTrackingLost: () => {
    statusEl.textContent = 'face not detected';
  },
});

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
