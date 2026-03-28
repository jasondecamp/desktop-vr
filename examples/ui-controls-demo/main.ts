import {
  ParallaxEngine, CSSAdapter, CalibrationPanel, screenFromViewport,
} from '../../src/index';
import {
  CalibrationOverlay, DiagnosticOverlay,
} from '../../src/three';

const screen = screenFromViewport();

const container = document.getElementById('scene')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Build CSS grid room ---

function buildGridRoom() {
  const existing = document.getElementById('grid-room');
  if (existing) existing.remove();

  const room = document.createElement('div');
  room.id = 'grid-room';
  const contentH = Math.max(container.scrollHeight, window.innerHeight);
  const halfW = window.innerWidth / 2;
  const halfH = contentH / 2;
  const depth = 300; // px depth of the room
  const gridSpacing = 60; // px between lines
  const gridColor = 'rgba(51, 68, 102, 0.25)';

  Object.assign(room.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: `${contentH}px`,
    transformStyle: 'preserve-3d',
    pointerEvents: 'none',
  });

  const createLine = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
    // Use a thin div positioned and rotated in 3D space
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2, midZ = (z1 + z2) / 2;

    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      width: `${length}px`,
      height: '1px',
      background: gridColor,
      left: '0',
      top: '0',
      transformOrigin: '0 0',
      pointerEvents: 'none',
    });

    // For axis-aligned lines we can simplify
    if (z1 === z2) {
      // Line in the XY plane at depth z
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      el.style.transform = `translate3d(${x1}px, ${y1}px, ${z1}px) rotate(${angle}deg)`;
    } else if (x1 === x2 && y1 === y2) {
      // Line along Z axis
      el.style.width = `${Math.abs(dz)}px`;
      el.style.transform = `translate3d(${x1}px, ${y1}px, ${Math.max(z1, z2)}px) rotateY(90deg)`;
    }

    room.appendChild(el);
  };

  // Vertical lines along Z on left and right walls
  const linesH = Math.ceil(contentH / gridSpacing);
  const linesDepth = Math.ceil(depth / gridSpacing);

  // Left wall
  for (let i = 0; i <= linesH; i++) {
    const y = i * gridSpacing;
    createLine(0, y, 0, 0, y, -depth);
  }
  for (let i = 0; i <= linesDepth; i++) {
    const z = -i * gridSpacing;
    createLine(0, 0, z, 0, contentH, z);
  }

  // Right wall
  for (let i = 0; i <= linesH; i++) {
    const y = i * gridSpacing;
    createLine(window.innerWidth, y, 0, window.innerWidth, y, -depth);
  }
  for (let i = 0; i <= linesDepth; i++) {
    const z = -i * gridSpacing;
    createLine(window.innerWidth, 0, z, window.innerWidth, contentH, z);
  }

  // Floor
  const linesW = Math.ceil(window.innerWidth / gridSpacing);
  for (let i = 0; i <= linesW; i++) {
    const x = i * gridSpacing;
    createLine(x, contentH, 0, x, contentH, -depth);
  }
  for (let i = 0; i <= linesDepth; i++) {
    const z = -i * gridSpacing;
    createLine(0, contentH, z, window.innerWidth, contentH, z);
  }

  // Ceiling
  for (let i = 0; i <= linesW; i++) {
    const x = i * gridSpacing;
    createLine(x, 0, 0, x, 0, -depth);
  }
  for (let i = 0; i <= linesDepth; i++) {
    const z = -i * gridSpacing;
    createLine(0, 0, z, window.innerWidth, 0, z);
  }

  // Insert as first child of scene
  container.insertBefore(room, container.firstChild);
}

// Build after a frame so content height is computed
requestAnimationFrame(buildGridRoom);

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

  thumb.addEventListener('mousedown', (e) => {
    dragging = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const well = sliderEl.querySelector('.slider-well')!;
    const rect = well.getBoundingClientRect();
    percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    update();
  });

  document.addEventListener('mouseup', () => { dragging = false; });
});

// --- Knob ---
// The knob uses a document-level overlay during drag to prevent
// pointer events from being lost to 3D-transformed elements.

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

// Create an invisible overlay that captures mouse during knob drag
const dragOverlay = document.createElement('div');
Object.assign(dragOverlay.style, {
  position: 'fixed',
  inset: '0',
  zIndex: '9999',
  cursor: 'grabbing',
  display: 'none',
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
  const dy = knobStartY - e.clientY;
  updateKnob(knobStartAngle + dy * 1.5);
});

dragOverlay.addEventListener('mouseup', () => {
  dragOverlay.style.display = 'none';
});

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

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.0 });
const engine = new ParallaxEngine({
  adapter,
  persist: true,
  tracking: { smoothing: 'one-euro' },
  onTrack: () => { statusEl.textContent = 'tracking'; },
  onTrackingLost: () => { statusEl.textContent = 'face not detected'; },
});

new CalibrationPanel({ engine, startCollapsed: true });
new CalibrationOverlay({ engine, autoStart: false });
new DiagnosticOverlay({ engine });

// --- Scroll-linked perspective (native adapter integration) ---

function onScroll() {
  adapter.setScrollOffsetY(window.scrollY);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

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
  buildGridRoom();
});
