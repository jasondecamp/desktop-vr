import * as THREE from 'three';
import {
  ParallaxEngine, CSSAdapter, CalibrationPanel, screenFromViewport,
} from '../../src/index';
import type { EyePosition } from '../../src/index';
import {
  CalibrationOverlay, DiagnosticOverlay, GridRoom,
} from '../../src/three';
import { computeOffAxisFrustum } from '../../src/projection/frustum';

const screen = screenFromViewport();

const container = document.getElementById('scene')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Three.js grid room as a background canvas layer ---

const gridCanvas = document.createElement('canvas');
Object.assign(gridCanvas.style, {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  zIndex: '-1',
  pointerEvents: 'none',
});
document.body.insertBefore(gridCanvas, document.body.firstChild);

const gridRenderer = new THREE.WebGLRenderer({ canvas: gridCanvas, antialias: true, alpha: true });
gridRenderer.setSize(window.innerWidth, window.innerHeight);
gridRenderer.setPixelRatio(window.devicePixelRatio);
gridRenderer.setClearColor(0x0a0a14, 1);

const gridScene = new THREE.Scene();
const gridCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
gridCamera.position.set(0, 0, 0.6);

const gridRoom = new GridRoom(screen, {
  depth: 0.60,
  gridSpacing: 0.053,
  showBackWall: false,
});
gridScene.add(gridRoom.getGroup());

let rawEyePos: EyePosition | null = null;

function renderGrid() {
  requestAnimationFrame(renderGrid);

  if (!rawEyePos) return;

  // Grid is fixed to the viewport — no scroll offset
  const eye = rawEyePos;

  const viewportAspect = window.innerWidth / window.innerHeight;
  const frustum = computeOffAxisFrustum(eye, screen, 0.01, 50, viewportAspect);
  gridCamera.projectionMatrix.makePerspective(
    frustum.left, frustum.right, frustum.top, frustum.bottom,
    frustum.near, frustum.far,
  );
  gridCamera.projectionMatrixInverse.copy(gridCamera.projectionMatrix).invert();
  gridCamera.position.set(eye.x, eye.y, eye.z);
  gridCamera.lookAt(eye.x, eye.y, 0);

  gridRenderer.render(gridScene, gridCamera);
}
renderGrid();

// --- Toggles ---

document.querySelectorAll('[data-toggle]').forEach((track) => {
  const status = track.nextElementSibling as HTMLElement;
  track.addEventListener('click', () => {
    const isOn = track.classList.toggle('on');
    if (status) status.textContent = isOn ? 'On' : 'Off';
  });
});

// --- Sliders ---

document.querySelectorAll('[data-slider]').forEach((el) => {
  const sliderEl = el as HTMLElement;
  const fill = sliderEl.querySelector('.slider-fill') as HTMLElement;
  const thumb = sliderEl.querySelector('.slider-thumb') as HTMLElement;
  const valueEl = sliderEl.querySelector('.slider-value') as HTMLElement;
  let percent = parseInt(sliderEl.dataset.value ?? '50', 10);
  let dragging = false;

  function update() {
    fill.style.width = `${percent}%`;
    thumb.style.left = `${percent}%`;
    valueEl.textContent = Math.round(percent).toString();
  }
  update();

  thumb.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const well = sliderEl.querySelector('.slider-well')!;
    const rect = well.getBoundingClientRect();
    percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    update();
  });

  document.addEventListener('mouseup', () => { dragging = false; });
});

// --- Knob (with drag overlay) ---

const knob = document.getElementById('knob')!;
const knobValue = document.getElementById('knob-value')!;
let knobAngle = 200;

function updateKnob(angle: number) {
  knobAngle = Math.max(0, Math.min(300, angle));
  const rotation = knobAngle - 150;
  knob.style.transform = `translateZ(12px) rotate(${rotation}deg)`;
  knobValue.textContent = `${Math.round((knobAngle / 300) * 100)}%`;
}
updateKnob(knobAngle);

const dragOverlay = document.createElement('div');
Object.assign(dragOverlay.style, {
  position: 'fixed', inset: '0', zIndex: '9999', cursor: 'grabbing', display: 'none',
});
document.body.appendChild(dragOverlay);

let knobStartY = 0;
let knobStartAngle = 0;

knob.addEventListener('mousedown', (e: MouseEvent) => {
  knobStartY = e.clientY;
  knobStartAngle = knobAngle;
  dragOverlay.style.display = 'block';
  e.preventDefault();
});

dragOverlay.addEventListener('mousemove', (e: MouseEvent) => {
  updateKnob(knobStartAngle + (knobStartY - e.clientY) * 1.5);
});

dragOverlay.addEventListener('mouseup', () => { dragOverlay.style.display = 'none'; });

// --- Chips ---

const chips = document.querySelectorAll('[data-chip]');
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    chips.forEach((c) => { c.classList.remove('active'); c.classList.add('inactive'); });
    chip.classList.remove('inactive');
    chip.classList.add('active');
  });
});

// --- Indicator cycling ---

const indicators = Array.from(document.querySelectorAll('[data-indicator]'));
const indicatorStates = ['green', 'yellow', 'off', 'off', 'red'];

setInterval(() => {
  const last = indicatorStates.pop()!;
  indicatorStates.unshift(last);
  indicators.forEach((ind, i) => { ind.className = `indicator ${indicatorStates[i]}`; });
}, 2000);

// --- Parallax engine ---
// The CSS adapter gets scroll offset in pixels (same conversion as the grid).
// Both use pixels_per_meter from the same screen config.

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.0 });
const engine = new ParallaxEngine({
  adapter,
  persist: true,
  tracking: { smoothing: 'one-euro' },
  onTrack: (pos) => {
    statusEl.textContent = 'tracking';
    rawEyePos = pos;
  },
  onTrackingLost: () => { statusEl.textContent = 'face not detected'; },
});

new CalibrationPanel({ engine, startCollapsed: true });
new CalibrationOverlay({ engine, autoStart: false });
new DiagnosticOverlay({ engine });

// --- Start ---

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

// --- Resize ---

window.addEventListener('resize', () => {
  engine.updateScreenFromViewport();
  gridRenderer.setSize(window.innerWidth, window.innerHeight);
  gridCamera.aspect = window.innerWidth / window.innerHeight;
  gridRoom.rebuild();
  gridRoom.updateResolution();
});
