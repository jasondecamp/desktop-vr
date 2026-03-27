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
    <div class="icon" style="background: ${app.bg}"><span class="emoji">${app.emoji}</span></div>
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
  el.innerHTML = `<span class="emoji">${app.emoji}</span>`;
  el.title = app.name;
  dock.appendChild(el);
}

// --- Shooting star (rare easter egg, canvas-based) ---

const shootingCanvas = document.getElementById('shooting-canvas') as HTMLCanvasElement;
const shootCtx = shootingCanvas.getContext('2d')!;

function resizeShootingCanvas() {
  shootingCanvas.width = window.innerWidth;
  shootingCanvas.height = window.innerHeight;
}
resizeShootingCanvas();

// Trail: array of past positions with timestamps
interface TrailPoint { x: number; y: number; time: number }

let shootingActive = false;
let trailPoints: TrailPoint[] = [];
let trailFadeStart = 0;

const TRAIL_LIFETIME = 3000; // trail fades over 3 seconds after star finishes
const SHOOT_DURATION_MIN = 500;
const SHOOT_DURATION_MAX = 900;

function triggerShootingStar() {
  const w = shootingCanvas.width;
  const h = shootingCanvas.height;

  // Random start: top portion of screen
  const startX = Math.random() * w;
  const startY = Math.random() * h * 0.3;

  // Random angle and direction
  const angle = (15 + Math.random() * 45) * (Math.PI / 180);
  const direction = Math.random() > 0.5 ? 1 : -1;
  const travelDist = (0.3 + Math.random() * 0.4) * Math.max(w, h);

  const dx = direction * Math.cos(angle) * travelDist;
  const dy = Math.sin(angle) * travelDist;
  const endX = startX + dx;
  const endY = startY + dy;

  const duration = SHOOT_DURATION_MIN + Math.random() * (SHOOT_DURATION_MAX - SHOOT_DURATION_MIN);
  const startTime = performance.now();

  shootingActive = true;
  trailPoints = [];
  trailFadeStart = 0;

  function animateShoot(now: number) {
    const t = Math.min(1, (now - startTime) / duration);
    const cx = startX + (endX - startX) * t;
    const cy = startY + (endY - startY) * t;

    trailPoints.push({ x: cx, y: cy, time: now });

    if (t < 1) {
      requestAnimationFrame(animateShoot);
    } else {
      // Star finished moving — begin trail fade
      shootingActive = false;
      trailFadeStart = now;
    }
  }

  requestAnimationFrame(animateShoot);
}

// Render loop for the shooting star canvas
function renderShootingStar() {
  requestAnimationFrame(renderShootingStar);

  shootCtx.clearRect(0, 0, shootingCanvas.width, shootingCanvas.height);

  if (trailPoints.length === 0) return;

  const now = performance.now();

  // If trail is fading, compute global fade
  let globalAlpha = 1;
  if (trailFadeStart > 0) {
    const elapsed = now - trailFadeStart;
    globalAlpha = Math.max(0, 1 - elapsed / TRAIL_LIFETIME);
    if (globalAlpha <= 0) {
      trailPoints = [];
      trailFadeStart = 0;
      return;
    }
  }

  // Draw the trail as a single continuous path with a gradient stroke
  const len = trailPoints.length;
  if (len < 2) return;

  const tail = trailPoints[0];
  const head = trailPoints[len - 1];

  // Create gradient along the trail direction
  const grad = shootCtx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  grad.addColorStop(0, `rgba(200, 220, 255, 0)`);
  grad.addColorStop(0.5, `rgba(200, 220, 255, ${0.3 * globalAlpha})`);
  grad.addColorStop(1, `rgba(200, 220, 255, ${0.8 * globalAlpha})`);

  shootCtx.beginPath();
  shootCtx.moveTo(trailPoints[0].x, trailPoints[0].y);
  for (let i = 1; i < len; i++) {
    shootCtx.lineTo(trailPoints[i].x, trailPoints[i].y);
  }
  shootCtx.strokeStyle = grad;
  shootCtx.lineWidth = 1.5;
  shootCtx.lineCap = 'round';
  shootCtx.lineJoin = 'round';
  shootCtx.stroke();

  // Bright head dot (only while actively moving)
  if (shootingActive) {
    const head = trailPoints[len - 1];
    shootCtx.beginPath();
    shootCtx.arc(head.x, head.y, 2.5, 0, Math.PI * 2);
    shootCtx.fillStyle = `rgba(255, 255, 255, ${0.9 * globalAlpha})`;
    shootCtx.fill();

    // Glow
    shootCtx.beginPath();
    shootCtx.arc(head.x, head.y, 6, 0, Math.PI * 2);
    shootCtx.fillStyle = `rgba(180, 210, 255, ${0.3 * globalAlpha})`;
    shootCtx.fill();
  }
}

renderShootingStar();

function scheduleNextShootingStar() {
  // TODO: restore to 3-7 minutes for production
  // const minDelay = 3 * 60 * 1000;
  // const maxDelay = 7 * 60 * 1000;
  const minDelay = 25 * 1000;
  const maxDelay = 35 * 1000;
  const delay = minDelay + Math.random() * (maxDelay - minDelay);
  setTimeout(() => {
    triggerShootingStar();
    scheduleNextShootingStar();
  }, delay);
}

// First one after ~5 seconds for testing
setTimeout(() => {
  triggerShootingStar();
  scheduleNextShootingStar();
}, 5000);

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
  resizeShootingCanvas();
});
