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

// --- Generate stars ---

const starsContainer = document.getElementById('stars')!;
for (let i = 0; i < 80; i++) {
  const star = document.createElement('div');
  star.className = i % 8 === 0 ? 'star bright' : 'star';
  star.style.left = `${Math.random() * 100}%`;
  star.style.top = `${Math.random() * 100}%`;
  star.style.opacity = `${0.2 + Math.random() * 0.6}`;
  starsContainer.appendChild(star);
}

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
