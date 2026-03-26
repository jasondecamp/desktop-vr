import * as THREE from 'three';
import { ParallaxEngine, ThreeJSAdapter } from '../../src/index';
import type { EyePosition, ScreenConfig } from '../../src/index';

const screen: ScreenConfig = {
  widthMeters: 0.34,
  heightMeters: 0.21,
};

// --- Three.js scene setup ---

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0, 0.6);

// --- Build a "room" the viewer looks into ---
// The screen plane is at z=0. Objects behind the screen have z < 0.
// Objects "floating" in front of the screen have z > 0 (between screen and viewer).

// Back wall
const wallGeo = new THREE.PlaneGeometry(1.0, 0.7);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2a4a, side: THREE.DoubleSide });
const backWall = new THREE.Mesh(wallGeo, wallMat);
backWall.position.z = -0.5;
backWall.receiveShadow = true;
scene.add(backWall);

// Floor
const floorGeo = new THREE.PlaneGeometry(1.0, 0.6);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a3a5a, side: THREE.DoubleSide });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -0.2, -0.2);
floor.receiveShadow = true;
scene.add(floor);

// Grid on back wall for depth reference
const gridHelper = new THREE.GridHelper(0.8, 16, 0x444477, 0x333366);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.position.z = -0.49;
scene.add(gridHelper);

// Floating objects at various depths

// Red sphere — in front of screen (pops out toward viewer)
const sphereGeo = new THREE.SphereGeometry(0.04, 32, 32);
const sphereMat = new THREE.MeshStandardMaterial({ color: 0xff4444, metalness: 0.3, roughness: 0.4 });
const sphere = new THREE.Mesh(sphereGeo, sphereMat);
sphere.position.set(-0.1, 0.05, 0.05);
sphere.castShadow = true;
scene.add(sphere);

// Green cube — at screen plane
const cubeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const cubeMat = new THREE.MeshStandardMaterial({ color: 0x44ff44, metalness: 0.3, roughness: 0.4 });
const cube = new THREE.Mesh(cubeGeo, cubeMat);
cube.position.set(0.12, -0.02, 0.0);
cube.rotation.set(0.3, 0.5, 0.1);
cube.castShadow = true;
scene.add(cube);

// Blue torus — behind screen (recedes into the display)
const torusGeo = new THREE.TorusGeometry(0.04, 0.015, 16, 48);
const torusMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, metalness: 0.3, roughness: 0.4 });
const torus = new THREE.Mesh(torusGeo, torusMat);
torus.position.set(-0.05, 0.08, -0.2);
torus.castShadow = true;
scene.add(torus);

// Yellow cone — far behind screen
const coneGeo = new THREE.ConeGeometry(0.03, 0.08, 16);
const coneMat = new THREE.MeshStandardMaterial({ color: 0xffaa22, metalness: 0.3, roughness: 0.4 });
const cone = new THREE.Mesh(coneGeo, coneMat);
cone.position.set(0.08, -0.08, -0.35);
cone.castShadow = true;
scene.add(cone);

// Wireframe border at the screen plane (z=0) to show the "window" boundary
const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(screen.widthMeters, screen.heightMeters));
const borderMat = new THREE.LineBasicMaterial({ color: 0x666688 });
const border = new THREE.LineSegments(borderGeo, borderMat);
border.position.z = 0;
scene.add(border);

// --- Lighting ---

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 0.8, 5);
pointLight.position.set(0.2, 0.3, 0.3);
pointLight.castShadow = true;
scene.add(pointLight);

// --- HUD elements ---

const eyePosEl = document.getElementById('eye-pos')!;
const statusEl = document.getElementById('status')!;
const startBtn = document.getElementById('start-btn')!;

// --- Parallax engine setup ---

const adapter = new ThreeJSAdapter({ camera, screen });

const engine = new ParallaxEngine({
  adapter,
  screen,
  tracking: { smoothing: 'one-euro' },
  onTrack: (pos: EyePosition) => {
    eyePosEl.textContent = `x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)}`;
  },
  onTrackingLost: () => {
    statusEl.textContent = 'face not detected';
  },
});

// --- Start/stop ---

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

  // Gentle idle animation on the objects
  const t = performance.now() / 1000;
  sphere.position.y = 0.05 + Math.sin(t * 1.2) * 0.015;
  cube.rotation.x += 0.005;
  cube.rotation.y += 0.007;
  torus.rotation.x += 0.008;
  torus.rotation.y += 0.004;
  cone.rotation.y += 0.006;

  renderer.render(scene, camera);
}

animate();

// --- Resize handler ---

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
