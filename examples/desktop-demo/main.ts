import {
  ParallaxEngine, CSSAdapter, CalibrationPanel,
  screenFromViewport,
} from '../../src/index';
import type { EyePosition } from '../../src/index';

const screen = screenFromViewport();

// --- Scene setup ---

const container = document.getElementById('scene')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;
const clockEl = document.getElementById('clock')!;

// --- Generate stars across three depth layers ---

function populateStars(containerId: string, count: number, brightChance: number) {
  const el = document.getElementById(containerId)!;
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = Math.random() < brightChance ? 'star bright' : 'star';
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.opacity = `${0.15 + Math.random() * 0.7}`;
    el.appendChild(star);
  }
}

// Far layer: many dim stars
populateStars('stars-far', 120, 0.05);
// Mid layer: moderate stars, some bright
populateStars('stars-mid', 80, 0.12);
// Near layer: fewer but brighter
populateStars('stars-near', 40, 0.25);

// --- App icon definitions ---

interface AppDef {
  name: string;
  emoji: string;
  bg: string;
}

const apps: AppDef[] = [
  { name: 'Messages', emoji: '💬', bg: 'linear-gradient(135deg, #34c759, #30b050)' },
  { name: 'Photos', emoji: '🌈', bg: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
  { name: 'Camera', emoji: '📷', bg: 'linear-gradient(135deg, #636e72, #2d3436)' },
  { name: 'Maps', emoji: '🗺️', bg: 'linear-gradient(135deg, #00b894, #00a381)' },
  { name: 'Weather', emoji: '⛅', bg: 'linear-gradient(135deg, #74b9ff, #0984e3)' },
  { name: 'Clock', emoji: '⏰', bg: 'linear-gradient(135deg, #2d3436, #636e72)' },
  { name: 'Notes', emoji: '📝', bg: 'linear-gradient(135deg, #fdcb6e, #f0a30a)' },
  { name: 'Calendar', emoji: '📅', bg: 'linear-gradient(135deg, #ff7675, #d63031)' },
  { name: 'Music', emoji: '🎵', bg: 'linear-gradient(135deg, #e84393, #fd79a8)' },
  { name: 'Settings', emoji: '⚙️', bg: 'linear-gradient(135deg, #636e72, #b2bec3)' },
  { name: 'Mail', emoji: '✉️', bg: 'linear-gradient(135deg, #0984e3, #74b9ff)' },
  { name: 'Files', emoji: '📁', bg: 'linear-gradient(135deg, #0984e3, #6c5ce7)' },
  { name: 'Calculator', emoji: '🧮', bg: 'linear-gradient(135deg, #636e72, #2d3436)' },
  { name: 'Stocks', emoji: '📈', bg: 'linear-gradient(135deg, #2d3436, #636e72)' },
  { name: 'Health', emoji: '❤️', bg: 'linear-gradient(135deg, #ff6b6b, #ee5a24)' },
  { name: 'Wallet', emoji: '💳', bg: 'linear-gradient(135deg, #2d3436, #636e72)' },
  { name: 'Books', emoji: '📚', bg: 'linear-gradient(135deg, #e17055, #d63031)' },
  { name: 'Podcasts', emoji: '🎙️', bg: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' },
  { name: 'Videos', emoji: '🎬', bg: 'linear-gradient(135deg, #0984e3, #74b9ff)' },
  { name: 'News', emoji: '📰', bg: 'linear-gradient(135deg, #d63031, #ff7675)' },
  { name: 'Compass', emoji: '🧭', bg: 'linear-gradient(135deg, #2d3436, #636e72)' },
  { name: 'Translate', emoji: '🌐', bg: 'linear-gradient(135deg, #0984e3, #00b894)' },
  { name: 'Reminders', emoji: '📋', bg: 'linear-gradient(135deg, #fdcb6e, #e17055)' },
  { name: 'Contacts', emoji: '👤', bg: 'linear-gradient(135deg, #636e72, #b2bec3)' },
];

const iconGrid = document.getElementById('icon-grid')!;
for (const app of apps) {
  const el = document.createElement('div');
  el.className = 'app-icon';
  el.innerHTML = `
    <div class="icon" style="background: ${app.bg}">${app.emoji}</div>
    <div class="label">${app.name}</div>
  `;
  iconGrid.appendChild(el);
}

// --- Dock icons ---

const dockApps: AppDef[] = [
  { name: 'Phone', emoji: '📞', bg: 'linear-gradient(135deg, #34c759, #30b050)' },
  { name: 'Safari', emoji: '🧭', bg: 'linear-gradient(135deg, #0984e3, #74b9ff)' },
  { name: 'Mail', emoji: '✉️', bg: 'linear-gradient(135deg, #0984e3, #74b9ff)' },
  { name: 'Music', emoji: '🎵', bg: 'linear-gradient(135deg, #e84393, #fd79a8)' },
];

const dock = document.getElementById('dock')!;
for (const app of dockApps) {
  const el = document.createElement('div');
  el.className = 'dock-icon';
  el.style.background = app.bg;
  el.textContent = app.emoji;
  el.title = app.name;
  dock.appendChild(el);
}

// --- Shooting star (rare easter egg) ---

const shootingStar = document.getElementById('shooting-star')!;

function triggerShootingStar() {
  // Random start position (top half of screen, either side)
  const startX = Math.random() * 80 + 10; // 10-90%
  const startY = Math.random() * 40;       // 0-40%

  // Random angle: mostly diagonal downward, with some variety
  const angle = 20 + Math.random() * 40;   // 20-60 degrees from horizontal
  const direction = Math.random() > 0.5 ? 1 : -1; // left-to-right or right-to-left
  const distance = 30 + Math.random() * 30; // 30-60% of screen travel

  const radians = (angle * Math.PI) / 180;
  const endX = startX + direction * Math.cos(radians) * distance;
  const endY = startY + Math.sin(radians) * distance;

  // Rotate the element to match the travel direction
  const rotDeg = direction > 0 ? angle : 180 - angle;

  shootingStar.style.left = `${startX}%`;
  shootingStar.style.top = `${startY}%`;
  shootingStar.style.transform = `rotate(${rotDeg}deg)`;
  shootingStar.className = 'shooting-star active';

  // Animate across the sky
  const duration = 600 + Math.random() * 400; // 600-1000ms
  const startTime = performance.now();

  function animateShoot(now: number) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t; // linear for a streak feel
    const cx = startX + (endX - startX) * eased;
    const cy = startY + (endY - startY) * eased;
    shootingStar.style.left = `${cx}%`;
    shootingStar.style.top = `${cy}%`;

    if (t < 1) {
      requestAnimationFrame(animateShoot);
    } else {
      // Fade out
      shootingStar.className = 'shooting-star fading';
      setTimeout(() => {
        shootingStar.className = 'shooting-star';
      }, 500);
    }
  }

  requestAnimationFrame(animateShoot);
}

function scheduleNextShootingStar() {
  // Average every 5 minutes, but random between 3-7 minutes
  const minDelay = 3 * 60 * 1000;
  const maxDelay = 7 * 60 * 1000;
  const delay = minDelay + Math.random() * (maxDelay - minDelay);
  setTimeout(() => {
    triggerShootingStar();
    scheduleNextShootingStar();
  }, delay);
}

// First one sooner so it's testable (30-90 seconds)
setTimeout(() => {
  triggerShootingStar();
  scheduleNextShootingStar();
}, 30000 + Math.random() * 60000);

// --- Clock ---

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
updateClock();
setInterval(updateClock, 10000);

// --- Parallax engine (CSS mode) ---

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.0 });
const engine = new ParallaxEngine({
  adapter,
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
