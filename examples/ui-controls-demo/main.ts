import {
  ParallaxEngine, CSSAdapter, CalibrationPanel, screenFromViewport,
} from '../../src/index';

const screen = screenFromViewport();

const container = document.getElementById('scene')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Toggle ---

const toggle = document.getElementById('toggle')!;
const toggleStatus = document.getElementById('toggle-status')!;
let toggleOn = false;

toggle.addEventListener('click', () => {
  toggleOn = !toggleOn;
  toggle.classList.toggle('on', toggleOn);
  toggleStatus.textContent = toggleOn ? 'On' : 'Off';
});

// --- Slider ---

const sliderContainer = document.getElementById('slider')!;
const sliderFill = document.getElementById('slider-fill')!;
const sliderThumb = document.getElementById('slider-thumb')!;
const sliderValue = document.getElementById('slider-value')!;
let sliderPercent = 60;
let sliderDragging = false;

function updateSlider(pct: number) {
  sliderPercent = Math.max(0, Math.min(100, pct));
  sliderFill.style.width = `${sliderPercent}%`;
  sliderThumb.style.left = `${sliderPercent}%`;
  sliderValue.textContent = Math.round(sliderPercent).toString();
}

sliderThumb.addEventListener('mousedown', (e) => {
  sliderDragging = true;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!sliderDragging) return;
  const well = sliderContainer.querySelector('.slider-well')!;
  const rect = well.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  updateSlider(pct);
});

document.addEventListener('mouseup', () => {
  sliderDragging = false;
});

// --- Knob ---

const knob = document.getElementById('knob')!;
const knobValue = document.getElementById('knob-value')!;
let knobAngle = 200; // degrees, 0-300 range
let knobDragging = false;
let knobStartY = 0;
let knobStartAngle = 0;

function updateKnob(angle: number) {
  knobAngle = Math.max(0, Math.min(300, angle));
  const rotation = knobAngle - 150; // center the range
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
});

document.addEventListener('mousemove', (e) => {
  if (!knobDragging) return;
  const dy = knobStartY - e.clientY; // up = increase
  updateKnob(knobStartAngle + dy * 1.5);
});

document.addEventListener('mouseup', () => {
  knobDragging = false;
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

// --- Indicator cycling (demo animation) ---

const indicators = [
  document.getElementById('ind-1')!,
  document.getElementById('ind-2')!,
  document.getElementById('ind-3')!,
  document.getElementById('ind-4')!,
  document.getElementById('ind-5')!,
];
const indicatorStates = ['green', 'yellow', 'off', 'off', 'red'];

setInterval(() => {
  // Shift states around
  const last = indicatorStates.pop()!;
  indicatorStates.unshift(last);
  indicators.forEach((ind, i) => {
    ind.className = `indicator ${indicatorStates[i]}`;
  });
}, 2000);

// --- Parallax engine (CSS mode) ---

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.0 });
const engine = new ParallaxEngine({
  adapter,
  persist: true,
  tracking: { smoothing: 'one-euro' },
  onTrack: () => { statusEl.textContent = 'tracking'; },
  onTrackingLost: () => { statusEl.textContent = 'face not detected'; },
});

new CalibrationPanel({ engine, startCollapsed: true });

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
