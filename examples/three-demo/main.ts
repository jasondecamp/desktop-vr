import * as THREE from 'three';
import { ParallaxEngine, ThreeJSAdapter, CalibrationPanel, CalibrationOverlay, DiagnosticOverlay, GridRoom, screenFromViewport } from '../../src/three';
import type { EyePosition } from '../../src/three';

// Auto-compute screen dimensions from viewport
const screen = screenFromViewport();

// --- Three.js scene setup ---

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.visibility = 'hidden';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BG_COLOR = 0x000000;
scene.background = new THREE.Color(BG_COLOR);
const bgColor = new THREE.Color(BG_COLOR);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 0.6);

// --- Grid room anchored to viewport edges ---
// Physically realistic depth: ~8 inches (0.20m)

const ROOM_DEPTH = 0.60;
const gridRoom = new GridRoom(screen, {
  depth: ROOM_DEPTH,
  gridSpacing: 0.053,
});
scene.add(gridRoom.getGroup());

// --- Targets ---

interface TargetDef {
  x: number;
  y: number;
  z: number;
}

const TARGET_RADIUS = 0.025;

// Depth range scaled to the physically realistic box
const TARGET_Z_NEAR = 0.00;
const TARGET_Z_FAR = -0.18;
const TARGET_BASE_COLOR = new THREE.Color(0xff4444);
const TARGET_WHITE = new THREE.Color(0xffffff);

function depthColor(baseColor: THREE.Color, z: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (TARGET_Z_NEAR - z) / (TARGET_Z_NEAR - TARGET_Z_FAR)));
  return baseColor.clone().lerp(bgColor.clone(), t * 0.85);
}

function depthWhite(z: number): THREE.Color {
  const t = Math.max(0, Math.min(1, (TARGET_Z_NEAR - z) / (TARGET_Z_NEAR - TARGET_Z_FAR)));
  return TARGET_WHITE.clone().lerp(bgColor.clone(), t * 0.85);
}

const targets: TargetDef[] = [
  // In front of the screen (pop out toward viewer)
  // { x: -0.04, y: 0.02, z: 0.05 },
  // { x: 0.05, y: -0.015, z: 0.03 },
  // { x: 0.01, y: 0.04, z: 0.06 },

  // Near the screen plane
  { x: -0.075, y: -0.0375, z: -0.02 },
  { x: 0.0875, y: 0.0375, z: 0.015 },

  // Behind the screen (recede into the box)
  { x: 0.0375, y: -0.05, z: -0.06 },
  { x: -0.0625, y: 0.05, z: -0.10 },
  { x: 0.00, y: -0.0125, z: -0.14 },
  { x: -0.03125, y: -0.0625, z: -0.17 },
  { x: 0.075, y: 0.0125, z: -0.12 },
];

const TARGET_THICKNESS = 0.00635; // 0.25 inches in meters

function createTarget(def: TargetDef): THREE.Group {
  const group = new THREE.Group();
  const { z } = def;
  const radius = TARGET_RADIUS;
  const segments = 48;

  const red = depthColor(TARGET_BASE_COLOR, z);
  const white = depthWhite(z);

  // Cylinder body — red edge, open ends
  const cylGeo = new THREE.CylinderGeometry(radius, radius, TARGET_THICKNESS, segments, 1, true);
  const cylMat = new THREE.MeshStandardMaterial({ color: red, side: THREE.DoubleSide, roughness: 0.7 });
  const cylinder = new THREE.Mesh(cylGeo, cylMat);
  cylinder.rotation.x = Math.PI / 2; // align cylinder axis with Z
  group.add(cylinder);

  // Front face bullseye (z = +half thickness, facing viewer)
  const faceOffset = TARGET_THICKNESS / 2 + 0.0001;

  const outerGeo = new THREE.CircleGeometry(radius, segments);
  const outerMesh = new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({ color: red }));
  outerMesh.position.z = faceOffset;
  group.add(outerMesh);

  const whiteGeo = new THREE.CircleGeometry(radius * 0.75, segments);
  const whiteMesh = new THREE.Mesh(whiteGeo, new THREE.MeshBasicMaterial({ color: white }));
  whiteMesh.position.z = faceOffset + 0.0001;
  group.add(whiteMesh);

  const innerGeo = new THREE.CircleGeometry(radius * 0.5, segments);
  const innerMesh = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({ color: red }));
  innerMesh.position.z = faceOffset + 0.0002;
  group.add(innerMesh);

  const centerGeo = new THREE.CircleGeometry(radius * 0.25, segments);
  const centerMesh = new THREE.Mesh(centerGeo, new THREE.MeshBasicMaterial({ color: white }));
  centerMesh.position.z = faceOffset + 0.0003;
  group.add(centerMesh);

  const dotGeo = new THREE.CircleGeometry(radius * 0.08, 16);
  const dotMesh = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: red }));
  dotMesh.position.z = faceOffset + 0.0004;
  group.add(dotMesh);

  // Back face — solid red cap
  const backGeo = new THREE.CircleGeometry(radius, segments);
  const backMesh = new THREE.Mesh(backGeo, new THREE.MeshBasicMaterial({ color: red }));
  backMesh.position.z = -faceOffset;
  backMesh.rotation.y = Math.PI; // face backward
  group.add(backMesh);

  group.position.set(def.x, def.y, def.z);
  return group;
}

function createTetherLine(def: TargetDef) {
  const startZ = def.z;
  const endZ = -ROOM_DEPTH;
  const start = new THREE.Vector3(def.x, def.y, startZ);
  const end = new THREE.Vector3(def.x, def.y, endZ);

  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);

  const gridColor = new THREE.Color(0x334466);
  const startT = Math.max(0, Math.abs(startZ) / ROOM_DEPTH);
  const endT = 1.0;
  const startColor = gridColor.clone().lerp(bgColor.clone(), startT);
  const endColor = gridColor.clone().lerp(bgColor.clone(), endT);

  const colors = new Float32Array([
    startColor.r, startColor.g, startColor.b,
    endColor.r, endColor.g, endColor.b,
  ]);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true });
  scene.add(new THREE.Line(geo, mat));
}

for (const def of targets) {
  scene.add(createTarget(def));
  createTetherLine(def);
}

// --- Lighting ---

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 0.7, 5);
pointLight.position.set(0.2, 0.3, 0.3);
scene.add(pointLight);

// --- HUD elements ---

const eyePosEl = document.getElementById('eye-pos')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Parallax engine setup ---
// No hardcoded screen config — engine auto-computes from viewport

const adapter = new ThreeJSAdapter({ camera, screen });

const engine = new ParallaxEngine({
  adapter,
  tracking: { smoothing: 'one-euro' },
  onTrack: (pos: EyePosition) => {
    eyePosEl.textContent = `x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)}`;
  },
  onTrackingLost: () => {
    statusEl.textContent = 'face not detected';
  },
  onScreenChange: (s) => {
    gridRoom.updateScreen(s);
  },
});

// --- Start/stop ---

const showDemo = () => { renderer.domElement.style.visibility = 'visible'; };

const panel = new CalibrationPanel({ engine, startCollapsed: true });
const calibration = new CalibrationOverlay({
  engine,
  onDismiss: showDemo,
});
const diagnostics = new DiagnosticOverlay({ engine });

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

// --- Render loop ---

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();

// --- Resize handler ---

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  engine.updateScreenFromViewport();
  gridRoom.rebuild();
  gridRoom.updateResolution();
});
