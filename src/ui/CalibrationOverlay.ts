import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { ParallaxEngine } from '../core/ParallaxEngine';
import type { EyePosition } from '../tracking/types';
import { computeOffAxisFrustum } from '../projection/frustum';
import { GridRoom } from './gridRoom';

export interface CalibrationOverlayConfig {
  engine: ParallaxEngine;
  /** Key to manually invoke calibration. Default: 'c' */
  triggerKey?: string;
  /** Number of frames to average when capturing. Default: 30 */
  captureFrames?: number;
  /** Auto-launch calibration on first engine start. Default: true */
  autoStart?: boolean;
  /** Called when calibration completes */
  onComplete?: (offset: EyePosition) => void;
  /** Called when calibration is dismissed (Escape or complete) */
  onDismiss?: () => void;
}

// Virtual Z depths for the two crosshair layers (in scene units / meters)
const FRONT_Z = 0.03;   // just in front of the screen plane
const BACK_Z = -0.10;   // behind the screen plane

// The tracked Z value at which the crosshair pairs should perfectly align.
// ~30 inches = 0.76 meters (typical desktop viewing distance).
const CALIBRATION_Z = 0.76;

// Scale factor: back crosshairs sit on a larger rectangle so that
// lines of sight from (0, 0, CALIBRATION_Z) through each front crosshair
// pass exactly through the corresponding back crosshair.
const BACK_SCALE = (CALIBRATION_Z - BACK_Z) / (CALIBRATION_Z - FRONT_Z);

// The back crosshairs also need to be physically larger so that when
// viewed from CALIBRATION_Z they *appear* the same size as the front ones.
// Apparent size scales inversely with distance from viewer.
const BACK_SIZE_SCALE = (CALIBRATION_Z - BACK_Z) / (CALIBRATION_Z - FRONT_Z);

const ROOM_DEPTH = 0.60;

// Front crosshair positions in each quadrant (x, y offsets from center)
const QUADRANT_OFFSETS: [number, number][] = [
  [-0.06, 0.04],   // top-left
  [0.06, 0.04],    // top-right
  [-0.06, -0.04],  // bottom-left
  [0.06, -0.04],   // bottom-right
];

const CROSSHAIR_SIZE = 0.015;

/**
 * Calibration states:
 * - idle: not visible
 * - align: user is moving to align crosshairs (step 1)
 * - capturing-align: user pressed Enter, capturing alignment position
 * - natural: crosshairs hidden, user returns to natural sitting position (step 2)
 * - capturing-natural: user pressed Enter, capturing natural position
 * - done: calibration complete, closing
 */
type CalibrationState =
  | 'idle'
  | 'align'
  | 'capturing-align'
  | 'natural'
  | 'capturing-natural'
  | 'done';

export class CalibrationOverlay {
  private engine: ParallaxEngine;
  private config: Required<CalibrationOverlayConfig>;
  private state: CalibrationState = 'idle';

  // Three.js internals
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private container!: HTMLDivElement;
  private rafId: number | null = null;
  private gridRoom!: GridRoom;

  // Crosshair meshes
  private frontCrosshairs: THREE.Group[] = [];
  private backCrosshairs: THREE.Group[] = [];

  // Capture state
  private captureBuffer: EyePosition[] = [];
  private captureFrameTarget: number;
  private holdProgress = 0;
  private alignPosition: EyePosition | null = null;

  // HUD elements
  private instructionEl!: HTMLDivElement;
  private progressBar!: HTMLDivElement;
  private progressFill!: HTMLDivElement;

  private autoStartPending: boolean;
  private engineStartInterceptInstalled = false;

  constructor(config: CalibrationOverlayConfig) {
    this.engine = config.engine;
    this.captureFrameTarget = config.captureFrames ?? 30;
    this.autoStartPending = config.autoStart ?? true;
    this.config = {
      engine: config.engine,
      triggerKey: config.triggerKey ?? 'c',
      captureFrames: this.captureFrameTarget,
      autoStart: this.autoStartPending,
      onComplete: config.onComplete ?? (() => {}),
      onDismiss: config.onDismiss ?? (() => {}),
    };

    document.addEventListener('keydown', this.handleKeydown);

    if (this.autoStartPending) {
      this.interceptEngineStart();
    }
  }

  private interceptEngineStart(): void {
    if (this.engineStartInterceptInstalled) return;
    this.engineStartInterceptInstalled = true;

    const originalStart = this.engine.start.bind(this.engine);
    this.engine.start = async () => {
      await originalStart();
      setTimeout(() => {
        if (this.autoStartPending && this.state === 'idle') {
          this.show();
        }
      }, 500);
    };
  }

  show(): void {
    if (this.state !== 'idle') return;
    this.state = 'align';
    this.captureBuffer = [];
    this.holdProgress = 0;
    this.alignPosition = null;

    this.engine.pauseAdapterUpdates();
    this.buildOverlay();
    this.tick();
  }

  hide(): void {
    this.state = 'idle';
    this.engine.resumeAdapterUpdates();
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.container) {
      this.container.remove();
    }
    this.renderer?.dispose();
    window.removeEventListener('resize', this.handleResize);
    this.config.onDismiss();
  }

  destroy(): void {
    this.hide();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  // --- Scene Construction ---

  private buildOverlay(): void {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100000',
      background: '#000',
    });

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 50);
    this.camera.position.set(0, 0, 0.6);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.gridRoom = new GridRoom(this.engine.getScreenConfig(), {
      depth: ROOM_DEPTH,
      gridSpacing: 0.053,
    });
    this.scene.add(this.gridRoom.getGroup());
    this.buildCrosshairs();
    this.buildHUD();

    document.body.appendChild(this.container);
    window.addEventListener('resize', this.handleResize);
  }

  private buildCrosshairs(): void {
    this.frontCrosshairs = [];
    this.backCrosshairs = [];

    for (const [qx, qy] of QUADRANT_OFFSETS) {
      const front = this.createCrosshair(CROSSHAIR_SIZE, 0xffffff);
      front.position.set(qx, qy, FRONT_Z);
      this.scene.add(front);
      this.frontCrosshairs.push(front);

      // Back crosshair: scaled position AND scaled size so that when
      // viewed from CALIBRATION_Z, it appears at the same screen location
      // and same apparent size as the front crosshair.
      const backX = qx * BACK_SCALE;
      const backY = qy * BACK_SCALE;
      const back = this.createCrosshair(CROSSHAIR_SIZE * BACK_SIZE_SCALE, 0xff4444);
      back.position.set(backX, backY, BACK_Z);
      this.scene.add(back);
      this.backCrosshairs.push(back);
    }
  }

  private createCrosshair(size: number, color: number): THREE.Group {
    const group = new THREE.Group();

    const makeFatLine = (positions: number[]) => {
      const geo = new LineGeometry();
      geo.setPositions(positions);
      const mat = new LineMaterial({
        color,
        linewidth: 3, // pixels
        resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      });
      return new Line2(geo, mat);
    };

    // Horizontal line
    group.add(makeFatLine([-size, 0, 0, size, 0, 0]));

    // Vertical line
    group.add(makeFatLine([0, -size, 0, 0, size, 0]));

    // Circle
    const segments = 32;
    const radius = size * 0.6;
    const circlePositions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      circlePositions.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0,
      );
    }
    group.add(makeFatLine(circlePositions));

    return group;
  }

  private setCrosshairsVisible(visible: boolean): void {
    for (const ch of this.frontCrosshairs) ch.visible = visible;
    for (const ch of this.backCrosshairs) ch.visible = visible;
  }

  private buildHUD(): void {
    this.instructionEl = document.createElement('div');
    Object.assign(this.instructionEl.style, {
      position: 'absolute',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: '#aabbcc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '16px',
      textAlign: 'center',
      lineHeight: '1.6',
      pointerEvents: 'none',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
      maxWidth: '500px',
    });
    this.setAlignInstructions();
    this.container.appendChild(this.instructionEl);

    this.progressBar = document.createElement('div');
    Object.assign(this.progressBar.style, {
      position: 'absolute',
      bottom: '50px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '200px',
      height: '4px',
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '2px',
      overflow: 'hidden',
    });

    this.progressFill = document.createElement('div');
    Object.assign(this.progressFill.style, {
      width: '0%',
      height: '100%',
      background: '#44cc66',
      borderRadius: '2px',
      transition: 'width 0.1s',
    });

    this.progressBar.appendChild(this.progressFill);
    this.container.appendChild(this.progressBar);

    const escHint = document.createElement('div');
    Object.assign(escHint.style, {
      position: 'absolute',
      top: '20px',
      right: '20px',
      color: '#556677',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      pointerEvents: 'none',
    });
    escHint.textContent = 'Escape to skip';
    this.container.appendChild(escHint);
  }

  private setAlignInstructions(): void {
    this.instructionEl.style.color = '#aabbcc';
    this.instructionEl.style.fontSize = '16px';
    this.instructionEl.innerHTML =
      'Move your head until each <span style="color:#fff">white</span> crosshair ' +
      'aligns with its <span style="color:#ff4444">red</span> pair.<br>' +
      'Press <span style="color:#fff">Enter</span> when aligned.';
  }

  private setNaturalInstructions(): void {
    this.instructionEl.style.color = '#aabbcc';
    this.instructionEl.style.fontSize = '16px';
    this.instructionEl.innerHTML =
      'Now sit in your normal, comfortable position.<br>' +
      'Press <span style="color:#fff">Enter</span> when ready.';
  }

  // --- State transitions ---

  private beginAlignCapture(): void {
    if (this.state !== 'align') return;
    this.state = 'capturing-align';
    this.captureBuffer = [];
    this.holdProgress = 0;
    this.progressFill.style.width = '0%';
    this.instructionEl.innerHTML = 'Hold still...';
    this.instructionEl.style.color = '#7eb8ff';
  }

  private finishAlignCapture(): void {
    this.alignPosition = this.averageBuffer();

    // Transition to step 2: natural position
    this.state = 'natural';
    this.captureBuffer = [];
    this.holdProgress = 0;
    this.progressFill.style.width = '0%';

    // Hide crosshairs for step 2
    this.setCrosshairsVisible(false);
    this.setNaturalInstructions();
  }

  private beginNaturalCapture(): void {
    if (this.state !== 'natural') return;
    this.state = 'capturing-natural';
    this.captureBuffer = [];
    this.holdProgress = 0;
    this.progressFill.style.width = '0%';
    this.instructionEl.innerHTML = 'Hold still...';
    this.instructionEl.style.color = '#7eb8ff';
  }

  private finishNaturalCapture(): void {
    this.state = 'done';

    const naturalPosition = this.averageBuffer();

    // The offset is the difference: natural position relative to the
    // aligned (ideal) position. Subtracting this from future tracking
    // makes the natural sitting position the effective center.
    const offset: EyePosition = {
      x: naturalPosition.x - (this.alignPosition?.x ?? 0),
      y: naturalPosition.y - (this.alignPosition?.y ?? 0),
      z: 0,
    };

    this.engine.setEyeOffset(offset);
    this.autoStartPending = false;
    this.config.onComplete(offset);

    this.instructionEl.textContent = 'Calibrated!';
    this.instructionEl.style.color = '#44cc66';
    this.instructionEl.style.fontSize = '20px';
    this.progressFill.style.width = '100%';

    setTimeout(() => this.hide(), 600);
  }

  private averageBuffer(): EyePosition {
    const count = this.captureBuffer.length;
    return {
      x: this.captureBuffer.reduce((s, p) => s + p.x, 0) / count,
      y: this.captureBuffer.reduce((s, p) => s + p.y, 0) / count,
      z: this.captureBuffer.reduce((s, p) => s + p.z, 0) / count,
    };
  }

  // --- Render + Capture Loop ---

  private tick = (): void => {
    if (this.state === 'idle' || this.state === 'done') return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawPos = this.engine.getRawEyePosition();
    if (!rawPos) return;

    // Update camera with off-axis projection
    const screen = this.engine.getScreenConfig();
    const viewportAspect = window.innerWidth / window.innerHeight;
    const frustum = computeOffAxisFrustum(rawPos, screen, 0.01, 50, viewportAspect);
    this.camera.projectionMatrix.makePerspective(
      frustum.left, frustum.right, frustum.top, frustum.bottom,
      frustum.near, frustum.far,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.position.set(rawPos.x, rawPos.y, rawPos.z);
    this.camera.lookAt(rawPos.x, rawPos.y, 0);

    // Capture frames in either capturing state
    if (this.state === 'capturing-align' || this.state === 'capturing-natural') {
      this.captureBuffer.push({ ...rawPos });
      this.holdProgress = Math.min(1, this.captureBuffer.length / this.captureFrameTarget);
      this.progressFill.style.width = `${this.holdProgress * 100}%`;

      if (this.state === 'capturing-align') {
        // Tint crosshairs green during capture
        const green = new THREE.Color(0x44cc66);
        for (const ch of this.frontCrosshairs) {
          ch.traverse((c) => {
            if (c instanceof Line2) {
              (c.material as LineMaterial).color.lerp(green, 0.1);
            }
          });
        }
      }

      if (this.captureBuffer.length >= this.captureFrameTarget) {
        if (this.state === 'capturing-align') {
          this.finishAlignCapture();
        } else {
          this.finishNaturalCapture();
        }
        return;
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  // --- Event Handlers ---

  private handleKeydown = (e: KeyboardEvent): void => {
    // Escape: skip at any active state
    if (e.key === 'Escape' && this.state !== 'idle' && this.state !== 'done') {
      e.preventDefault();
      this.autoStartPending = false;
      this.hide();
      return;
    }

    // Enter: advance through calibration steps
    if (e.key === 'Enter') {
      if (this.state === 'align') {
        e.preventDefault();
        this.beginAlignCapture();
        return;
      }
      if (this.state === 'natural') {
        e.preventDefault();
        this.beginNaturalCapture();
        return;
      }
    }

    // Trigger key: open calibration from idle
    if (e.key === this.config.triggerKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
      if (this.state === 'idle') {
        e.preventDefault();
        this.show();
      }
    }
  };

  private handleResize = (): void => {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.gridRoom?.rebuild();

    // Update LineMaterial resolution for correct line widths
    const res = new THREE.Vector2(window.innerWidth, window.innerHeight);
    const updateRes = (group: THREE.Group) => {
      group.traverse((c) => {
        if (c instanceof Line2) {
          (c.material as LineMaterial).resolution = res;
        }
      });
    };
    for (const ch of this.frontCrosshairs) updateRes(ch);
    for (const ch of this.backCrosshairs) updateRes(ch);
  };
}
