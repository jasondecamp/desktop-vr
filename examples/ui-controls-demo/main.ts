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

// --- Three.js grid room background ---

const gridCanvas = document.createElement('canvas');
Object.assign(gridCanvas.style, {
  position: 'fixed', inset: '0', width: '100%', height: '100%',
  zIndex: '-1', pointerEvents: 'none',
});
document.body.insertBefore(gridCanvas, document.body.firstChild);

const gridRenderer = new THREE.WebGLRenderer({ canvas: gridCanvas, antialias: true, alpha: true });
gridRenderer.setSize(window.innerWidth, window.innerHeight);
gridRenderer.setPixelRatio(window.devicePixelRatio);
gridRenderer.setClearColor(0x0a0a14, 1);

const gridScene = new THREE.Scene();
const gridCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
gridCamera.position.set(0, 0, 0.6);

const gridRoom = new GridRoom(screen, { depth: 0.60, gridSpacing: 0.053 });
gridScene.add(gridRoom.getGroup());

let lastEyePos: EyePosition | null = null;

function renderGrid() {
  requestAnimationFrame(renderGrid);
  if (!lastEyePos) return;
  const viewportAspect = window.innerWidth / window.innerHeight;
  const frustum = computeOffAxisFrustum(lastEyePos, screen, 0.01, 50, viewportAspect);
  gridCamera.projectionMatrix.makePerspective(
    frustum.left, frustum.right, frustum.top, frustum.bottom, frustum.near, frustum.far,
  );
  gridCamera.projectionMatrixInverse.copy(gridCamera.projectionMatrix).invert();
  gridCamera.position.set(lastEyePos.x, lastEyePos.y, lastEyePos.z);
  gridCamera.lookAt(lastEyePos.x, lastEyePos.y, 0);
  gridRenderer.render(gridScene, gridCamera);
}
renderGrid();

// =====================================================
// Spatial Navigation System
// =====================================================

const MAX_DEPTH = 5;
// TODO: restore to 400 after testing
const TRANSITION_MS = 1600;
const Z_STEP = 500;        // px per background depth level (5x original)

interface NavPage {
  id: string;
  title: string;
  subtitle?: string;
  buildContent: (contentEl: HTMLElement) => void;
}

// Layer stack: index 0 = deepest background, last = foreground
const layerStack: HTMLElement[] = [];

function createLayerEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'nav-layer';
  return el;
}

function updateLayerStyles() {
  const depth = layerStack.length;
  layerStack.forEach((layer, i) => {
    const levelsBack = depth - 1 - i;
    // Reset all background-N classes
    layer.className = 'nav-layer';

    if (levelsBack === 0) {
      // Foreground
      layer.style.transform = 'translateZ(0px)';
      layer.style.opacity = '1';
      layer.style.filter = 'blur(0px)';
      layer.style.pointerEvents = 'auto';
      layer.style.display = '';
    } else if (levelsBack < MAX_DEPTH) {
      const z = -levelsBack * Z_STEP;
      // Exponential opacity: drops fast on first step, slower after
      // Level 1: 0.35, Level 2: 0.12, Level 3: 0.04, Level 4: 0.02
      const opacity = Math.max(0.02, Math.pow(0.35, levelsBack));
      // Quadratic blur: ramps up progressively
      // Level 1: 3px, Level 2: 8px, Level 3: 15px, Level 4: 24px
      const blur = levelsBack * levelsBack * 1.5 + levelsBack * 1.5;
      layer.style.transform = `translateZ(${z}px)`;
      layer.style.opacity = `${opacity}`;
      layer.style.filter = `blur(${blur}px)`;
      layer.style.pointerEvents = 'none';
      layer.style.display = '';
    } else {
      layer.style.display = 'none';
    }
  });
}

function pushPage(page: NavPage) {
  const layer = createLayerEl();

  // Build layer content
  const content = document.createElement('div');
  content.className = 'layer-content';

  // Header with back button (if not root)
  const header = document.createElement('div');
  header.className = 'layer-header';

  if (layerStack.length > 0) {
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => popPage());
    header.appendChild(backBtn);
  }

  const title = document.createElement('h1');
  title.className = 'layer-title';
  title.textContent = page.title;
  header.appendChild(title);
  content.appendChild(header);

  if (page.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'layer-subtitle';
    sub.textContent = page.subtitle;
    content.appendChild(sub);
  }

  const bodyEl = document.createElement('div');
  page.buildContent(bodyEl);
  content.appendChild(bodyEl);

  layer.appendChild(content);

  // Start the layer far in front of the viewer — zooms in from behind them
  layer.style.transform = 'translateZ(8000px)';
  layer.style.opacity = '0';
  layer.style.filter = 'blur(0px)';

  container.appendChild(layer);
  layerStack.push(layer);

  // Force reflow before transitioning
  layer.offsetHeight;

  // Animate all layers to their new positions
  updateLayerStyles();
}

function popPage() {
  if (layerStack.length <= 1) return;

  const exitingLayer = layerStack.pop()!;

  // Mirror of enter: zoom forward past the viewer and fade out
  exitingLayer.style.transform = 'translateZ(8000px)';
  exitingLayer.style.opacity = '0';
  exitingLayer.style.pointerEvents = 'none';

  // Animate remaining layers back to their new positions
  updateLayerStyles();

  // Remove the exiting layer after the transition
  setTimeout(() => {
    exitingLayer.remove();
  }, TRANSITION_MS);
}

// --- Helper: create a nav card that pushes to a new page ---

function addNavCard(
  parent: HTMLElement,
  title: string,
  description: string,
  targetPage: NavPage,
) {
  const card = document.createElement('div');
  card.className = 'nav-card';
  card.innerHTML = `
    <h3>${title}</h3>
    <p>${description}</p>
    <div class="card-arrow">&rsaquo;</div>
  `;
  card.addEventListener('click', () => pushPage(targetPage));
  parent.appendChild(card);
}

// =====================================================
// Page Definitions
// =====================================================

// --- Level 3 (deepest) pages ---

const filePreviewPage: NavPage = {
  id: 'file-preview',
  title: 'readme.md',
  subtitle: 'File preview',
  buildContent: (el) => {
    el.innerHTML = `
      <div class="detail-section">
        <h4>File Info</h4>
        <div class="detail-grid">
          <div class="detail-stat"><div class="stat-value">2.4kb</div><div class="stat-label">Size</div></div>
          <div class="detail-stat"><div class="stat-value">42</div><div class="stat-label">Lines</div></div>
          <div class="detail-stat"><div class="stat-value">Mar 28</div><div class="stat-label">Modified</div></div>
          <div class="detail-stat"><div class="stat-value">v3.1</div><div class="stat-label">Version</div></div>
        </div>
      </div>
      <div class="detail-section">
        <h4>Content</h4>
        <div class="detail-text" style="font-family: ui-monospace, 'SF Mono', monospace; font-size: 12px; background: #12122a; padding: 16px; border-radius: 10px; white-space: pre-line; border: 1px solid rgba(255,255,255,0.04);">
# Project README

This is a demonstration of spatial navigation
using head-tracked parallax depth layers.

Each level you navigate into pushes the previous
view further into the background, creating a
physical sense of depth in the interface.
        </div>
      </div>
    `;
  },
};

const taskDetailPage: NavPage = {
  id: 'task-detail',
  title: 'Implement parallax engine',
  subtitle: 'Task details',
  buildContent: (el) => {
    el.innerHTML = `
      <div class="detail-section">
        <h4>Status</h4>
        <div class="detail-grid">
          <div class="detail-stat"><div class="stat-value" style="color: #44cc66;">Active</div><div class="stat-label">Status</div></div>
          <div class="detail-stat"><div class="stat-value">High</div><div class="stat-label">Priority</div></div>
          <div class="detail-stat"><div class="stat-value">Mar 30</div><div class="stat-label">Due Date</div></div>
          <div class="detail-stat"><div class="stat-value">75%</div><div class="stat-label">Progress</div></div>
        </div>
      </div>
      <div class="detail-section">
        <h4>Description</h4>
        <div class="detail-text">Build the core parallax engine with face tracking, off-axis projection, and both CSS and Three.js adapters. Include calibration overlay and diagnostic tools.</div>
      </div>
      <div class="detail-section">
        <h4>Tags</h4>
        <div class="tag-row">
          <span class="tag">engineering</span>
          <span class="tag">3d</span>
          <span class="tag">webgl</span>
          <span class="tag">tracking</span>
        </div>
      </div>
    `;
  },
};

const settingsDetailPage: NavPage = {
  id: 'settings-detail',
  title: 'Display Settings',
  subtitle: 'Configure display preferences',
  buildContent: (el) => {
    el.innerHTML = `
      <div class="detail-section">
        <h4>Preferences</h4>
        <div class="detail-grid">
          <div class="detail-stat"><div class="stat-value">96</div><div class="stat-label">PPI</div></div>
          <div class="detail-stat"><div class="stat-value">60&deg;</div><div class="stat-label">Camera FOV</div></div>
          <div class="detail-stat"><div class="stat-value">1-Euro</div><div class="stat-label">Filter</div></div>
          <div class="detail-stat"><div class="stat-value">0.63cm</div><div class="stat-label">IPD</div></div>
        </div>
      </div>
      <div class="detail-section">
        <h4>About</h4>
        <div class="detail-text">These settings are persisted to localStorage and restored on next load. Use the calibration panel (press backtick) for live adjustments.</div>
      </div>
    `;
  },
};

// --- Level 2 pages ---

const projectFilesPage: NavPage = {
  id: 'project-files',
  title: 'Project Files',
  subtitle: 'Browse the file tree. Each file opens a preview.',
  buildContent: (el) => {
    addNavCard(el, 'readme.md', 'Project documentation — 2.4kb, modified Mar 28', filePreviewPage);
    addNavCard(el, 'package.json', 'Dependencies and scripts — 1.1kb', filePreviewPage);
    addNavCard(el, 'src/', 'Source directory — 14 files', filePreviewPage);
    addNavCard(el, 'examples/', 'Demo applications — 4 directories', filePreviewPage);
    addNavCard(el, 'tsconfig.json', 'TypeScript configuration — 0.5kb', filePreviewPage);
  },
};

const projectTasksPage: NavPage = {
  id: 'project-tasks',
  title: 'Tasks',
  subtitle: 'Active tasks for this project.',
  buildContent: (el) => {
    addNavCard(el, 'Implement parallax engine', 'High priority — 75% complete — Due Mar 30', taskDetailPage);
    addNavCard(el, 'Add React hooks', 'Medium priority — Done', taskDetailPage);
    addNavCard(el, 'Build aquarium demo', 'Low priority — In progress', taskDetailPage);
    addNavCard(el, 'Write documentation', 'Medium priority — 50% complete', taskDetailPage);
    addNavCard(el, 'Deploy to Vercel', 'High priority — Done', taskDetailPage);
  },
};

const projectSettingsPage: NavPage = {
  id: 'project-settings',
  title: 'Settings',
  subtitle: 'Project configuration and preferences.',
  buildContent: (el) => {
    addNavCard(el, 'Display Settings', 'PPI, camera FOV, smoothing filter', settingsDetailPage);
    addNavCard(el, 'Calibration', 'Eye offset, screen dimensions', settingsDetailPage);
    addNavCard(el, 'Build Configuration', 'Vite, TypeScript, entry points', settingsDetailPage);
    addNavCard(el, 'Deployment', 'Vercel settings, environment variables', settingsDetailPage);
  },
};

// --- Level 1 pages ---

const parallaxProjectPage: NavPage = {
  id: 'parallax-project',
  title: 'parallax-display',
  subtitle: 'Head-tracking parallax 3D display engine. Tap a section to explore.',
  buildContent: (el) => {
    addNavCard(el, 'Files', 'Browse source files and documentation', projectFilesPage);
    addNavCard(el, 'Tasks', '5 active tasks, 2 completed', projectTasksPage);
    addNavCard(el, 'Settings', 'Display, calibration, build config', projectSettingsPage);
    addNavCard(el, 'Recent Activity', 'Commits, PRs, and deployments', projectTasksPage);
  },
};

const designSystemPage: NavPage = {
  id: 'design-system',
  title: 'Design System',
  subtitle: 'Component library and design tokens.',
  buildContent: (el) => {
    addNavCard(el, 'Components', 'Buttons, cards, toggles, inputs', projectFilesPage);
    addNavCard(el, 'Tokens', 'Colors, typography, spacing', projectSettingsPage);
    addNavCard(el, 'Icons', '48 icons across 6 categories', projectFilesPage);
  },
};

const analyticsPage: NavPage = {
  id: 'analytics',
  title: 'Analytics',
  subtitle: 'Usage metrics and performance data.',
  buildContent: (el) => {
    el.innerHTML = `
      <div class="detail-section">
        <h4>This Week</h4>
        <div class="detail-grid">
          <div class="detail-stat"><div class="stat-value">12.4k</div><div class="stat-label">Page Views</div></div>
          <div class="detail-stat"><div class="stat-value">3.2k</div><div class="stat-label">Unique Visitors</div></div>
          <div class="detail-stat"><div class="stat-value">2m 14s</div><div class="stat-label">Avg. Session</div></div>
          <div class="detail-stat"><div class="stat-value">94</div><div class="stat-label">Lighthouse Score</div></div>
        </div>
      </div>
    `;
    addNavCard(el, 'Traffic Sources', 'Breakdown by referrer and campaign', projectSettingsPage);
    addNavCard(el, 'Performance', 'Core Web Vitals and load times', projectSettingsPage);
  },
};

// --- Root page (Level 0) ---

const rootPage: NavPage = {
  id: 'root',
  title: 'Spatial Navigation',
  subtitle: 'Click any card to navigate deeper. Each level pushes the previous view into the background with increasing blur and transparency. Press Back to return.',
  buildContent: (el) => {
    addNavCard(el, 'parallax-display', 'Head-tracking parallax engine — files, tasks, settings', parallaxProjectPage);
    addNavCard(el, 'Design System', 'Component library, tokens, and icons', designSystemPage);
    addNavCard(el, 'Analytics', 'Usage metrics and performance dashboards', analyticsPage);
    addNavCard(el, 'Documentation', 'Guides, API reference, and examples', projectFilesPage);
    addNavCard(el, 'Team', 'Members, roles, and permissions', projectTasksPage);
  },
};

// --- Initialize with root page ---
pushPage(rootPage);

// --- Keyboard navigation ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace' || (e.key === 'ArrowLeft' && e.altKey)) {
    if (layerStack.length > 1) {
      e.preventDefault();
      popPage();
    }
  }
});

// =====================================================
// Parallax Engine
// =====================================================

const adapter = new CSSAdapter({ container, screen, sensitivity: 1.0 });
const engine = new ParallaxEngine({
  adapter,
  persist: true,
  tracking: { smoothing: 'one-euro' },
  onTrack: (pos) => {
    statusEl.textContent = 'tracking';
    lastEyePos = pos;
  },
  onTrackingLost: () => { statusEl.textContent = 'face not detected'; },
});

new CalibrationPanel({ engine, startCollapsed: true });
new CalibrationOverlay({ engine, autoStart: false });
new DiagnosticOverlay({ engine });

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

window.addEventListener('resize', () => {
  engine.updateScreenFromViewport();
  gridRenderer.setSize(window.innerWidth, window.innerHeight);
  gridCamera.aspect = window.innerWidth / window.innerHeight;
  gridRoom.rebuild();
  gridRoom.updateResolution();
});
