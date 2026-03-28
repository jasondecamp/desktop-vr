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

// --- Toggles (all of them) ---

document.querySelectorAll('[data-toggle]').forEach((track) => {
  const status = track.nextElementSibling as HTMLElement;
  track.addEventListener('click', () => {
    const isOn = track.classList.toggle('on');
    if (status) status.textContent = isOn ? 'On' : 'Off';
  });
});

// --- Sliders (all of them) ---

interface SliderState {
  container: HTMLElement;
  fill: HTMLElement;
  thumb: HTMLElement;
  valueEl: HTMLElement;
  percent: number;
}

const sliders: SliderState[] = [];

document.querySelectorAll('[data-slider]').forEach((el) => {
  const container = el as HTMLElement;
  const fill = container.querySelector('.slider-fill') as HTMLElement;
  const thumb = container.querySelector('.slider-thumb') as HTMLElement;
  const valueEl = container.querySelector('.slider-value') as HTMLElement;
  const initial = parseInt(container.dataset.value ?? '50', 10);

  const state: SliderState = { container, fill, thumb, valueEl, percent: initial };
  updateSliderUI(state);
  sliders.push(state);

  let dragging = false;

  thumb.addEventListener('mousedown', (e) => {
    dragging = true;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const well = container.querySelector('.slider-well')!;
    const rect = well.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    state.percent = Math.max(0, Math.min(100, pct));
    updateSliderUI(state);
  });

  document.addEventListener('mouseup', () => { dragging = false; });
});

function updateSliderUI(s: SliderState) {
  s.fill.style.width = `${s.percent}%`;
  s.thumb.style.left = `${s.percent}%`;
  s.valueEl.textContent = Math.round(s.percent).toString();
}

// --- Knob ---

const knob = document.getElementById('knob')!;
const knobValue = document.getElementById('knob-value')!;
let knobAngle = 200;
let knobDragging = false;
let knobStartY = 0;
let knobStartAngle = 0;

function updateKnob(angle: number) {
  knobAngle = Math.max(0, Math.min(300, angle));
  const rotation = knobAngle - 150;
  knob.style.transform = `translateZ(12px) rotate(${rotation}deg)`;
  const pct = Math.round((knobAngle / 300) * 100);
  knobValue.textContent = `${pct}%`;
}

updateKnob(knobAngle);

knob.addEventListener('mousedown', (e) => {
  knobDragging = true;
  knobStartY = e.clientY;
  knobStartAngle = knobAngle;
  e.preventDefault();
  document.body.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
  if (!knobDragging) return;
  const dy = knobStartY - e.clientY;
  updateKnob(knobStartAngle + dy * 1.5);
});

document.addEventListener('mouseup', () => {
  if (knobDragging) {
    knobDragging = false;
    document.body.style.cursor = '';
  }
});

// --- Chips ---

const chips = document.querySelectorAll('[data-chip]');
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    chips.forEach((c) => {
      c.classList.remove('active');
      c.classList.add('inactive');
    });
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
  indicators.forEach((ind, i) => {
    ind.className = `indicator ${indicatorStates[i]}`;
  });
}, 2000);

// --- Parallax engine (CSS mode) with scroll-linked perspective ---

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

// --- Scroll-linked perspective offset ---
// Scrolling shifts the perspective origin vertically, as if the viewer
// is looking at a different part of the scene. This adds to the
// head-tracking parallax for a combined effect.

function updateScrollPerspective() {
  const scrollY = window.scrollY;
  const viewH = window.innerHeight;
  const docH = document.documentElement.scrollHeight;
  const maxScroll = docH - viewH;

  if (maxScroll <= 0) return;

  // Map scroll to a vertical perspective-origin shift.
  // The CSS adapter sets perspective-origin, but we augment it here
  // by shifting the container's transform-origin based on scroll position.
  const scrollFraction = scrollY / maxScroll;
  // Shift the scene's visual origin: top of page = top of scene, bottom = bottom
  const originY = 30 + scrollFraction * 40; // range: 30% to 70%
  container.style.perspectiveOrigin =
    container.style.perspectiveOrigin?.replace(/\d+(\.\d+)?px$/, '') || '';
  // We store the scroll offset as a CSS variable the adapter can't override
  container.style.setProperty('--scroll-origin-y', `${originY}%`);
}

// Override the adapter's perspective-origin to include scroll offset
const originalUpdate = adapter.update.bind(adapter);
adapter.update = (eye) => {
  originalUpdate(eye);
  // After the adapter sets perspective-origin, blend in scroll offset
  const currentOrigin = container.style.perspectiveOrigin;
  if (currentOrigin) {
    const parts = currentOrigin.split(' ');
    const scrollOriginY = container.style.getPropertyValue('--scroll-origin-y') || '50%';
    // The adapter sets pixel values; we add the scroll offset as a percentage blend
    if (parts.length >= 2) {
      const adapterY = parseFloat(parts[1]);
      const scrollY = parseFloat(scrollOriginY);
      const containerH = container.getBoundingClientRect().height;
      // Convert scroll percentage to pixels relative to container
      const scrollOffsetPx = (scrollY / 100 - 0.5) * containerH;
      container.style.perspectiveOrigin = `${parts[0]} ${adapterY + scrollOffsetPx}px`;
    }
  }
};

window.addEventListener('scroll', updateScrollPerspective, { passive: true });
updateScrollPerspective();

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
});
