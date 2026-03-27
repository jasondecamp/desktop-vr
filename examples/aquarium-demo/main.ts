import * as THREE from 'three';
import {
  ParallaxEngine, ThreeJSAdapter, CalibrationPanel,
  DiagnosticOverlay, GridRoom, screenFromViewport,
} from '../../src/three';

const screen = screenFromViewport();

// --- Tank dimensions ---
// 12 inches = 0.3048 meters
const TANK_DEPTH = 0.3048;

// --- Renderer ---

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0, 0.6);

// --- Ocean background ---
// Brighter blue-green, no fog (tank is well-lit)

scene.background = new THREE.Color(0x1a6a8a);

// --- Lighting ---
// Bright aquarium lighting — well-lit tank

const ambientLight = new THREE.AmbientLight(0x88bbdd, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
sunLight.position.set(0, 0.5, 0.2);
scene.add(sunLight);

// Fill light from the front (the "viewer" side of the tank)
const frontLight = new THREE.DirectionalLight(0x6699bb, 0.5);
frontLight.position.set(0, 0, 0.5);
scene.add(frontLight);

// --- Tank walls (using GridRoom solid style) ---

const tankRoom = new GridRoom(screen, {
  depth: TANK_DEPTH,
  showBackWall: true,
  wallStyle: 'solid',
  wallColor: 0x0d4a6a,
});
scene.add(tankRoom.getGroup());

// --- Sand floor ---

const sandGeo = new THREE.PlaneGeometry(1, TANK_DEPTH);
const sandMat = new THREE.MeshStandardMaterial({
  color: 0xc4aa72,
  roughness: 0.95,
});
const sand = new THREE.Mesh(sandGeo, sandMat);
sand.rotation.x = -Math.PI / 2;
// Place just above the tank floor
sand.position.set(0, -screen.heightMeters / 2 + 0.001, -TANK_DEPTH / 2);
scene.add(sand);

// --- Coral / Rock formations ---
// All z values between -0.02 and -TANK_DEPTH (inside the tank)

interface CoralDef {
  x: number; y: number; z: number;
  scale: number; color: number;
  type: 'sphere' | 'cone' | 'cylinder';
}

const floorY = -screen.heightMeters / 2;

const corals: CoralDef[] = [
  { x: -0.10, y: floorY + 0.02, z: -0.08, scale: 0.025, color: 0xee6655, type: 'sphere' },
  { x: 0.08, y: floorY + 0.02, z: -0.14, scale: 0.020, color: 0xff8844, type: 'cone' },
  { x: -0.06, y: floorY + 0.02, z: -0.20, scale: 0.030, color: 0xcc5577, type: 'sphere' },
  { x: 0.12, y: floorY + 0.02, z: -0.06, scale: 0.018, color: 0xdd9955, type: 'cylinder' },
  { x: -0.14, y: floorY + 0.02, z: -0.18, scale: 0.022, color: 0xbb6666, type: 'cone' },
  { x: 0.03, y: floorY + 0.02, z: -0.26, scale: 0.035, color: 0x997755, type: 'sphere' },
  { x: -0.08, y: floorY + 0.02, z: -0.04, scale: 0.015, color: 0xff9966, type: 'cylinder' },
];

for (const c of corals) {
  let geo: THREE.BufferGeometry;
  switch (c.type) {
    case 'sphere': geo = new THREE.SphereGeometry(c.scale, 12, 8); break;
    case 'cone': geo = new THREE.ConeGeometry(c.scale * 0.6, c.scale * 2, 8); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(c.scale * 0.3, c.scale * 0.5, c.scale * 1.5, 8); break;
  }
  const mat = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(c.x, c.y, c.z);
  scene.add(mesh);
}

// --- Seaweed ---

interface SeaweedDef {
  x: number; z: number;
  height: number; segments: number;
  color: number;
}

const seaweeds: SeaweedDef[] = [
  { x: -0.07, z: -0.10, height: 0.08, segments: 6, color: 0x44bb55 },
  { x: 0.10, z: -0.16, height: 0.06, segments: 5, color: 0x55cc66 },
  { x: -0.13, z: -0.22, height: 0.09, segments: 7, color: 0x44aa50 },
  { x: 0.05, z: -0.24, height: 0.05, segments: 4, color: 0x66cc77 },
  { x: -0.03, z: -0.06, height: 0.07, segments: 6, color: 0x55bb60 },
  { x: 0.14, z: -0.12, height: 0.06, segments: 5, color: 0x44cc55 },
];

interface SeaweedInstance {
  mesh: THREE.Mesh;
  phase: number;
}

const seaweedInstances: SeaweedInstance[] = [];

for (const sw of seaweeds) {
  const geo = new THREE.CylinderGeometry(0.002, 0.004, sw.height, 4, sw.segments);
  const mat = new THREE.MeshStandardMaterial({
    color: sw.color,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(sw.x, floorY + sw.height / 2, sw.z);
  scene.add(mesh);
  seaweedInstances.push({ mesh, phase: Math.random() * Math.PI * 2 });
}

// --- Fish ---
// All depths between -0.02 and -(TANK_DEPTH - 0.02) — fully inside the tank

interface FishDef {
  color: number;
  finColor: number;
  size: number;
  speed: number;
  depth: number;
  yBase: number;
  xRange: number;
  phase: number;
}

const fishDefs: FishDef[] = [
  { color: 0xff6644, finColor: 0xff4422, size: 0.015, speed: 0.15, depth: -0.06, yBase: 0.02, xRange: 0.12, phase: 0 },
  { color: 0x44bbff, finColor: 0x2299dd, size: 0.012, speed: 0.20, depth: -0.10, yBase: 0.05, xRange: 0.10, phase: 1.5 },
  { color: 0xffcc33, finColor: 0xeeaa11, size: 0.010, speed: 0.18, depth: -0.16, yBase: -0.02, xRange: 0.14, phase: 3.0 },
  { color: 0x44ddaa, finColor: 0x22bb88, size: 0.013, speed: 0.12, depth: -0.04, yBase: 0.04, xRange: 0.09, phase: 4.5 },
  { color: 0xff88bb, finColor: 0xdd6699, size: 0.008, speed: 0.25, depth: -0.22, yBase: -0.04, xRange: 0.15, phase: 2.0 },
  { color: 0xffaa44, finColor: 0xdd8822, size: 0.016, speed: 0.10, depth: -0.12, yBase: 0.06, xRange: 0.11, phase: 5.0 },
  { color: 0xff5533, finColor: 0xdd3311, size: 0.018, speed: 0.08, depth: -0.02, yBase: -0.01, xRange: 0.08, phase: 1.0 },
  { color: 0x55ddff, finColor: 0x33bbdd, size: 0.014, speed: 0.14, depth: -0.20, yBase: 0.00, xRange: 0.13, phase: 3.5 },
];

interface FishInstance {
  group: THREE.Group;
  tail: THREE.Mesh;
  def: FishDef;
}

const fishInstances: FishInstance[] = [];

function createFish(def: FishDef): FishInstance {
  const group = new THREE.Group();

  const bodyGeo = new THREE.SphereGeometry(def.size, 12, 8);
  bodyGeo.scale(1.6, 0.8, 0.6);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: def.color, roughness: 0.4, metalness: 0.1,
  });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  const tailGeo = new THREE.ConeGeometry(def.size * 0.5, def.size * 0.8, 4);
  tailGeo.rotateZ(Math.PI / 2);
  const tailMat = new THREE.MeshStandardMaterial({
    color: def.finColor, roughness: 0.5, side: THREE.DoubleSide,
  });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.x = -def.size * 1.4;
  group.add(tail);

  const dorsalGeo = new THREE.ConeGeometry(def.size * 0.25, def.size * 0.5, 3);
  const dorsalMat = new THREE.MeshStandardMaterial({
    color: def.finColor, roughness: 0.5, side: THREE.DoubleSide,
  });
  const dorsal = new THREE.Mesh(dorsalGeo, dorsalMat);
  dorsal.position.set(def.size * 0.2, def.size * 0.5, 0);
  group.add(dorsal);

  const eyeGeo = new THREE.SphereGeometry(def.size * 0.15, 8, 6);
  const eye = new THREE.Mesh(eyeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  eye.position.set(def.size * 1.0, def.size * 0.15, def.size * 0.25);
  group.add(eye);

  const pupilGeo = new THREE.SphereGeometry(def.size * 0.08, 6, 4);
  const pupil = new THREE.Mesh(pupilGeo, new THREE.MeshBasicMaterial({ color: 0x111111 }));
  pupil.position.set(def.size * 1.12, def.size * 0.15, def.size * 0.28);
  group.add(pupil);

  group.position.set(0, def.yBase, def.depth);
  scene.add(group);

  return { group, tail, def };
}

for (const def of fishDefs) {
  fishInstances.push(createFish(def));
}

// --- Bubbles ---
// All inside the tank (z between -0.01 and -TANK_DEPTH)

interface Bubble {
  mesh: THREE.Mesh;
  x: number;
  speed: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  phase: number;
}

const bubbles: Bubble[] = [];
const bubbleMat = new THREE.MeshStandardMaterial({
  color: 0xcceeff,
  transparent: true,
  opacity: 0.35,
  roughness: 0.1,
  metalness: 0.2,
});

function spawnBubble(): Bubble {
  const radius = 0.002 + Math.random() * 0.004;
  const geo = new THREE.SphereGeometry(radius, 8, 6);
  const mesh = new THREE.Mesh(geo, bubbleMat);

  const z = -0.02 - Math.random() * (TANK_DEPTH - 0.04);
  const x = (Math.random() - 0.5) * 0.25;

  mesh.position.set(x, floorY, z);
  scene.add(mesh);

  return {
    mesh,
    x,
    speed: 0.015 + Math.random() * 0.03,
    wobbleSpeed: 1 + Math.random() * 3,
    wobbleAmount: 0.003 + Math.random() * 0.006,
    phase: Math.random() * Math.PI * 2,
  };
}

for (let i = 0; i < 20; i++) {
  const b = spawnBubble();
  b.mesh.position.y = floorY + Math.random() * screen.heightMeters;
  bubbles.push(b);
}

// --- Light rays ---

const rayGroup = new THREE.Group();
scene.add(rayGroup);

for (let i = 0; i < 6; i++) {
  const rayGeo = new THREE.PlaneGeometry(0.015, 0.4);
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0x88ccee,
    transparent: true,
    opacity: 0.08,
    side: THREE.DoubleSide,
  });
  const ray = new THREE.Mesh(rayGeo, rayMat);
  ray.position.set(
    (Math.random() - 0.5) * 0.25,
    0.05,
    -0.04 - Math.random() * (TANK_DEPTH - 0.06),
  );
  ray.rotation.z = (Math.random() - 0.5) * 0.2;
  rayGroup.add(ray);
}

// --- Floating particles ---

const particleCount = 50;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleSpeeds: number[] = [];

for (let i = 0; i < particleCount; i++) {
  particlePositions[i * 3] = (Math.random() - 0.5) * 0.3;
  particlePositions[i * 3 + 1] = floorY + Math.random() * screen.heightMeters;
  particlePositions[i * 3 + 2] = -0.02 - Math.random() * (TANK_DEPTH - 0.04);
  particleSpeeds.push(0.0001 + Math.random() * 0.0003);
}

particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0xaaccdd,
  size: 0.002,
  transparent: true,
  opacity: 0.5,
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- HUD ---

const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Engine (no calibration overlay — skip straight to scene) ---

const adapter = new ThreeJSAdapter({ camera, screen });
const engine = new ParallaxEngine({
  adapter,
  onTrackingLost: () => { statusEl.textContent = 'face not detected'; },
  onTrack: () => { statusEl.textContent = 'tracking'; },
  onScreenChange: (s) => { tankRoom.updateScreen(s); },
});

new CalibrationPanel({ engine, startCollapsed: true });
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

// --- Animation loop ---

const topY = screen.heightMeters / 2;

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;

  // Fish
  for (const fish of fishInstances) {
    const { group, tail, def } = fish;
    const swimX = Math.sin(t * def.speed * Math.PI * 2 + def.phase) * def.xRange;
    const swimY = def.yBase + Math.sin(t * 0.5 + def.phase) * 0.008;
    const direction = Math.cos(t * def.speed * Math.PI * 2 + def.phase);

    group.position.x = swimX;
    group.position.y = swimY;
    group.rotation.y = direction > 0 ? 0 : Math.PI;
    tail.rotation.y = Math.sin(t * 8 + def.phase) * 0.4;
  }

  // Seaweed
  for (const sw of seaweedInstances) {
    sw.mesh.rotation.z = Math.sin(t * 0.8 + sw.phase) * 0.12;
    sw.mesh.rotation.x = Math.sin(t * 0.6 + sw.phase + 1) * 0.04;
  }

  // Bubbles
  for (const b of bubbles) {
    b.mesh.position.y += b.speed * 0.016;
    b.mesh.position.x = b.x + Math.sin(t * b.wobbleSpeed + b.phase) * b.wobbleAmount;

    if (b.mesh.position.y > topY) {
      b.mesh.position.y = floorY;
      b.mesh.position.x = (Math.random() - 0.5) * 0.25;
      b.x = b.mesh.position.x;
    }
  }

  // Light rays
  for (let i = 0; i < rayGroup.children.length; i++) {
    const ray = rayGroup.children[i];
    ray.rotation.z = Math.sin(t * 0.2 + i * 1.5) * 0.1;
    ((ray as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
      0.06 + Math.sin(t * 0.3 + i * 2) * 0.03;
  }

  // Particles
  const positions = particleGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < particleCount; i++) {
    positions.array[i * 3 + 1] += particleSpeeds[i];
    if (positions.array[i * 3 + 1] > topY) {
      positions.array[i * 3 + 1] = floorY;
    }
  }
  positions.needsUpdate = true;

  renderer.render(scene, camera);
}

animate();

// --- Resize ---

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  engine.updateScreenFromViewport();
  tankRoom.rebuild();
  tankRoom.updateResolution();
});
