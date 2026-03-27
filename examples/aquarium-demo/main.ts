import * as THREE from 'three';
import {
  ParallaxEngine, ThreeJSAdapter, CalibrationPanel,
  CalibrationOverlay, DiagnosticOverlay, screenFromViewport,
} from '../../src/three';

const screen = screenFromViewport();

// --- Renderer ---

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.visibility = 'hidden';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 0, 0.6);

// --- Ocean background gradient ---

scene.background = new THREE.Color(0x001a2e);
scene.fog = new THREE.FogExp2(0x001520, 2.5);

// --- Lighting ---
// Underwater caustic feel: dim ambient + directional from above

const ambientLight = new THREE.AmbientLight(0x1a4a6a, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0x4a9ec7, 0.8);
sunLight.position.set(0, 0.5, 0.2);
scene.add(sunLight);

// Subtle point light near the viewer for foreground illumination
const viewerLight = new THREE.PointLight(0x3a7a9a, 0.4, 1.0);
viewerLight.position.set(0, 0, 0.1);
scene.add(viewerLight);

// --- Sand floor ---

const sandGeo = new THREE.PlaneGeometry(2, 1.5);
const sandMat = new THREE.MeshStandardMaterial({
  color: 0x8a7a5a,
  roughness: 0.95,
});
const sand = new THREE.Mesh(sandGeo, sandMat);
sand.rotation.x = -Math.PI / 2;
sand.position.set(0, -0.18, -0.4);
scene.add(sand);

// --- Coral / Rock formations ---

interface CoralDef {
  x: number; y: number; z: number;
  scale: number; color: number;
  type: 'sphere' | 'cone' | 'cylinder';
}

const corals: CoralDef[] = [
  { x: -0.15, y: -0.14, z: -0.30, scale: 0.04, color: 0xcc4455, type: 'sphere' },
  { x: 0.12, y: -0.15, z: -0.35, scale: 0.035, color: 0xdd6633, type: 'cone' },
  { x: -0.08, y: -0.16, z: -0.45, scale: 0.05, color: 0x884466, type: 'sphere' },
  { x: 0.18, y: -0.14, z: -0.25, scale: 0.03, color: 0xcc7744, type: 'cylinder' },
  { x: -0.20, y: -0.15, z: -0.40, scale: 0.04, color: 0xaa5566, type: 'cone' },
  { x: 0.05, y: -0.16, z: -0.50, scale: 0.06, color: 0x775544, type: 'sphere' },
  { x: -0.12, y: -0.15, z: -0.20, scale: 0.025, color: 0xee8855, type: 'cylinder' },
];

for (const c of corals) {
  let geo: THREE.BufferGeometry;
  switch (c.type) {
    case 'sphere': geo = new THREE.SphereGeometry(c.scale, 12, 8); break;
    case 'cone': geo = new THREE.ConeGeometry(c.scale * 0.6, c.scale * 2, 8); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(c.scale * 0.3, c.scale * 0.5, c.scale * 1.5, 8); break;
  }
  const mat = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.8 });
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
  { x: -0.10, z: -0.28, height: 0.12, segments: 6, color: 0x2a8a3a },
  { x: 0.14, z: -0.32, height: 0.10, segments: 5, color: 0x3a9a4a },
  { x: -0.18, z: -0.38, height: 0.14, segments: 7, color: 0x2a7a35 },
  { x: 0.08, z: -0.42, height: 0.08, segments: 4, color: 0x4aaa5a },
  { x: -0.05, z: -0.22, height: 0.11, segments: 6, color: 0x3a8a40 },
  { x: 0.20, z: -0.36, height: 0.09, segments: 5, color: 0x2a9a45 },
];

interface SeaweedInstance {
  mesh: THREE.Mesh;
  def: SeaweedDef;
  phase: number;
}

const seaweedInstances: SeaweedInstance[] = [];

for (const sw of seaweeds) {
  // Simple tapered cylinder for each seaweed strand
  const geo = new THREE.CylinderGeometry(0.002, 0.004, sw.height, 4, sw.segments);
  const mat = new THREE.MeshStandardMaterial({
    color: sw.color,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(sw.x, -0.16 + sw.height / 2, sw.z);
  scene.add(mesh);
  seaweedInstances.push({ mesh, def: sw, phase: Math.random() * Math.PI * 2 });
}

// --- Fish ---

interface FishDef {
  color: number;
  finColor: number;
  size: number;
  speed: number;
  depth: number;       // z depth
  yBase: number;
  xRange: number;      // how far they swim left/right
  phase: number;
}

const fishDefs: FishDef[] = [
  // Behind the screen — deeper fish
  { color: 0xff6644, finColor: 0xff4422, size: 0.018, speed: 0.15, depth: -0.35, yBase: -0.02, xRange: 0.20, phase: 0 },
  { color: 0x44aaff, finColor: 0x2288dd, size: 0.014, speed: 0.20, depth: -0.25, yBase: 0.04, xRange: 0.18, phase: 1.5 },
  { color: 0xffcc33, finColor: 0xeeaa11, size: 0.012, speed: 0.18, depth: -0.40, yBase: -0.06, xRange: 0.22, phase: 3.0 },
  { color: 0x44ddaa, finColor: 0x22bb88, size: 0.016, speed: 0.12, depth: -0.20, yBase: 0.02, xRange: 0.15, phase: 4.5 },
  { color: 0xff88aa, finColor: 0xdd6688, size: 0.010, speed: 0.25, depth: -0.45, yBase: -0.08, xRange: 0.25, phase: 2.0 },

  // Near the screen plane
  { color: 0xffaa44, finColor: 0xdd8822, size: 0.020, speed: 0.10, depth: -0.05, yBase: 0.06, xRange: 0.16, phase: 5.0 },

  // In FRONT of the screen — close fish
  { color: 0xff5533, finColor: 0xdd3311, size: 0.025, speed: 0.08, depth: 0.04, yBase: -0.03, xRange: 0.12, phase: 1.0 },
  { color: 0x55ccff, finColor: 0x33aadd, size: 0.022, speed: 0.06, depth: 0.07, yBase: 0.05, xRange: 0.10, phase: 3.5 },
];

interface FishInstance {
  group: THREE.Group;
  body: THREE.Mesh;
  tail: THREE.Mesh;
  def: FishDef;
}

const fishInstances: FishInstance[] = [];

function createFish(def: FishDef): FishInstance {
  const group = new THREE.Group();

  // Body — elongated sphere
  const bodyGeo = new THREE.SphereGeometry(def.size, 12, 8);
  bodyGeo.scale(1.6, 0.8, 0.6);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: def.color,
    roughness: 0.4,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  // Tail fin — small cone
  const tailGeo = new THREE.ConeGeometry(def.size * 0.5, def.size * 0.8, 4);
  tailGeo.rotateZ(Math.PI / 2);
  const tailMat = new THREE.MeshStandardMaterial({
    color: def.finColor,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.x = -def.size * 1.4;
  group.add(tail);

  // Dorsal fin — small triangle
  const dorsalGeo = new THREE.ConeGeometry(def.size * 0.25, def.size * 0.5, 3);
  const dorsalMat = new THREE.MeshStandardMaterial({
    color: def.finColor,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const dorsal = new THREE.Mesh(dorsalGeo, dorsalMat);
  dorsal.position.set(def.size * 0.2, def.size * 0.5, 0);
  group.add(dorsal);

  // Eye — tiny white sphere with black pupil
  const eyeGeo = new THREE.SphereGeometry(def.size * 0.15, 8, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(def.size * 1.0, def.size * 0.15, def.size * 0.25);
  group.add(eye);

  const pupilGeo = new THREE.SphereGeometry(def.size * 0.08, 6, 4);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const pupil = new THREE.Mesh(pupilGeo, pupilMat);
  pupil.position.set(def.size * 1.12, def.size * 0.15, def.size * 0.28);
  group.add(pupil);

  group.position.set(0, def.yBase, def.depth);
  scene.add(group);

  return { group, body, tail, def };
}

for (const def of fishDefs) {
  fishInstances.push(createFish(def));
}

// --- Bubbles ---

interface Bubble {
  mesh: THREE.Mesh;
  x: number;
  speed: number;
  wobbleSpeed: number;
  wobbleAmount: number;
  phase: number;
  z: number;
}

const bubbles: Bubble[] = [];
const bubbleMat = new THREE.MeshStandardMaterial({
  color: 0xaaddff,
  transparent: true,
  opacity: 0.3,
  roughness: 0.1,
  metalness: 0.3,
});

function spawnBubble(): Bubble {
  const radius = 0.002 + Math.random() * 0.005;
  const geo = new THREE.SphereGeometry(radius, 8, 6);
  const mesh = new THREE.Mesh(geo, bubbleMat);

  // Some bubbles in front of the screen, some behind
  const z = -0.5 + Math.random() * 0.6; // range: -0.5 to +0.1
  const x = (Math.random() - 0.5) * 0.4;

  mesh.position.set(x, -0.20, z);
  scene.add(mesh);

  return {
    mesh,
    x,
    speed: 0.02 + Math.random() * 0.04,
    wobbleSpeed: 1 + Math.random() * 3,
    wobbleAmount: 0.005 + Math.random() * 0.01,
    phase: Math.random() * Math.PI * 2,
    z,
  };
}

// Initial bubbles
for (let i = 0; i < 25; i++) {
  const b = spawnBubble();
  b.mesh.position.y = -0.20 + Math.random() * 0.40; // spread vertically
  bubbles.push(b);
}

// --- Light rays (god rays from above) ---

const rayGroup = new THREE.Group();
scene.add(rayGroup);

for (let i = 0; i < 5; i++) {
  const rayGeo = new THREE.PlaneGeometry(0.02, 0.6);
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0x4a8ab0,
    transparent: true,
    opacity: 0.06,
    side: THREE.DoubleSide,
  });
  const ray = new THREE.Mesh(rayGeo, rayMat);
  ray.position.set(
    (Math.random() - 0.5) * 0.3,
    0.1,
    -0.15 - Math.random() * 0.3,
  );
  ray.rotation.z = (Math.random() - 0.5) * 0.3;
  rayGroup.add(ray);
}

// --- Floating particles (plankton/debris) ---

const particleCount = 60;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleSpeeds: number[] = [];

for (let i = 0; i < particleCount; i++) {
  particlePositions[i * 3] = (Math.random() - 0.5) * 0.5;
  particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 0.3;
  particlePositions[i * 3 + 2] = -Math.random() * 0.5;
  particleSpeeds.push(0.0002 + Math.random() * 0.0005);
}

particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0x88aacc,
  size: 0.003,
  transparent: true,
  opacity: 0.4,
});
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// --- HUD ---

const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Engine ---

const adapter = new ThreeJSAdapter({ camera, screen });
const engine = new ParallaxEngine({
  adapter,
  onTrackingLost: () => { statusEl.textContent = 'face not detected'; },
  onTrack: () => { statusEl.textContent = 'tracking'; },
});

const showScene = () => { renderer.domElement.style.visibility = 'visible'; };

new CalibrationPanel({ engine, startCollapsed: true });
new CalibrationOverlay({ engine, onDismiss: showScene });
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

function animate() {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;

  // Animate fish — swim back and forth with sinusoidal motion
  for (const fish of fishInstances) {
    const { group, tail, def } = fish;
    const swimX = Math.sin(t * def.speed * Math.PI * 2 + def.phase) * def.xRange;
    const swimY = def.yBase + Math.sin(t * 0.5 + def.phase) * 0.01;
    const direction = Math.cos(t * def.speed * Math.PI * 2 + def.phase);

    group.position.x = swimX;
    group.position.y = swimY;

    // Face swimming direction
    group.rotation.y = direction > 0 ? 0 : Math.PI;

    // Tail wag
    tail.rotation.y = Math.sin(t * 8 + def.phase) * 0.4;
  }

  // Animate seaweed — gentle sway
  for (const sw of seaweedInstances) {
    sw.mesh.rotation.z = Math.sin(t * 0.8 + sw.phase) * 0.15;
    sw.mesh.rotation.x = Math.sin(t * 0.6 + sw.phase + 1) * 0.05;
  }

  // Animate bubbles — rise and wobble
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.mesh.position.y += b.speed * 0.016;
    b.mesh.position.x = b.x + Math.sin(t * b.wobbleSpeed + b.phase) * b.wobbleAmount;

    // Respawn if above view
    if (b.mesh.position.y > 0.25) {
      b.mesh.position.y = -0.20;
      b.mesh.position.x = (Math.random() - 0.5) * 0.4;
      b.x = b.mesh.position.x;
    }
  }

  // Animate light rays — slow drift
  for (let i = 0; i < rayGroup.children.length; i++) {
    const ray = rayGroup.children[i];
    ray.rotation.z = Math.sin(t * 0.2 + i * 1.5) * 0.15;
    (ray as THREE.Mesh).material = (ray as THREE.Mesh).material;
    ((ray as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
      0.04 + Math.sin(t * 0.3 + i * 2) * 0.02;
  }

  // Animate particles — slow drift upward
  const positions = particleGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < particleCount; i++) {
    positions.array[i * 3 + 1] += particleSpeeds[i];
    if (positions.array[i * 3 + 1] > 0.2) {
      positions.array[i * 3 + 1] = -0.2;
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
});
