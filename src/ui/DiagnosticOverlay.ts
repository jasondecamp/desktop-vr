import * as THREE from 'three';
import type { ParallaxEngine } from '../core/ParallaxEngine';
import type { EyePosition } from '../tracking/types';
import { computeOffAxisFrustum } from '../projection/frustum';

export interface DiagnosticOverlayConfig {
  engine: ParallaxEngine;
  /** Key to toggle diagnostic overlay. Default: 'd' */
  triggerKey?: string;
}

/**
 * Diagnostic overlay for verifying tracking accuracy and system assumptions.
 *
 * Three tests:
 * 1. Z Accuracy — displays tracked Z, user compares to measured distance
 * 2. Screen-plane stability — crosshair at z=0 that must remain motionless
 * 3. PPI check — reference 1-inch square to measure with a ruler
 *
 * Toggle with 'd' key (configurable).
 */
export class DiagnosticOverlay {
  private engine: ParallaxEngine;
  private triggerKey: string;
  private active = false;

  private container!: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private rafId: number | null = null;

  // Test elements
  private zReadout!: HTMLDivElement;
  private xReadout!: HTMLDivElement;
  private yReadout!: HTMLDivElement;
  private screenDimsReadout!: HTMLDivElement;
  private stabilityIndicator!: HTMLDivElement;
  private ppiBox!: HTMLDivElement;

  // Stability tracking
  private screenPlaneRef: { x: number; y: number } | null = null;
  private maxDrift = 0;

  constructor(config: DiagnosticOverlayConfig) {
    this.engine = config.engine;
    this.triggerKey = config.triggerKey ?? 'd';
    document.addEventListener('keydown', this.handleKeydown);
  }

  destroy(): void {
    this.hide();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  show(): void {
    if (this.active) return;
    this.active = true;
    this.maxDrift = 0;
    this.screenPlaneRef = null;
    this.buildOverlay();
    this.tick();
  }

  hide(): void {
    if (!this.active) return;
    this.active = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.container?.remove();
    this.renderer?.dispose();
    window.removeEventListener('resize', this.handleResize);
  }

  private buildOverlay(): void {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100001',
      background: '#000',
    });

    // Three.js renderer for the stability test
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x000000, 1);
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.01, 50,
    );
    this.camera.position.set(0, 0, 0.6);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.buildScenePlaneTest();
    this.buildHUD();

    document.body.appendChild(this.container);
    window.addEventListener('resize', this.handleResize);
  }

  private buildScenePlaneTest(): void {
    // Large crosshair at z=0 — should be completely motionless
    const mat = new THREE.LineBasicMaterial({ color: 0x44cc66 });
    const size = 0.15;

    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, 0, 0),
      new THREE.Vector3(size, 0, 0),
    ]);
    this.scene.add(new THREE.Line(hGeo, mat));

    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -size, 0),
      new THREE.Vector3(0, size, 0),
    ]);
    this.scene.add(new THREE.Line(vGeo, mat));

    // Circle at z=0
    const circlePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      circlePoints.push(new THREE.Vector3(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0));
    }
    const circleGeo = new THREE.BufferGeometry().setFromPoints(circlePoints);
    this.scene.add(new THREE.Line(circleGeo, mat));

    // Small crosshair behind the screen (z=-0.1) — should shift with parallax
    const behindMat = new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.6 });
    const bSize = 0.03;
    const bh = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-bSize, 0, 0),
      new THREE.Vector3(bSize, 0, 0),
    ]);
    const bhLine = new THREE.Line(bh, behindMat);
    bhLine.position.z = -0.10;
    this.scene.add(bhLine);

    const bv = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -bSize, 0),
      new THREE.Vector3(0, bSize, 0),
    ]);
    const bvLine = new THREE.Line(bv, behindMat);
    bvLine.position.z = -0.10;
    this.scene.add(bvLine);

    // Small crosshair in front of the screen (z=+0.05)
    const frontMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 });
    const fh = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-bSize, 0, 0),
      new THREE.Vector3(bSize, 0, 0),
    ]);
    const fhLine = new THREE.Line(fh, frontMat);
    fhLine.position.z = 0.05;
    this.scene.add(fhLine);

    const fv = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -bSize, 0),
      new THREE.Vector3(0, bSize, 0),
    ]);
    const fvLine = new THREE.Line(fv, frontMat);
    fvLine.position.z = 0.05;
    this.scene.add(fvLine);

    // Labels (screen-space, added in HUD)
  }

  private buildHUD(): void {
    const font = 'system-ui, -apple-system, sans-serif';
    const mono = 'ui-monospace, "SF Mono", monospace';

    // --- Left panel: Z accuracy test ---
    const leftPanel = document.createElement('div');
    Object.assign(leftPanel.style, {
      position: 'absolute',
      top: '20px',
      left: '20px',
      color: '#ccc',
      fontFamily: font,
      fontSize: '13px',
      lineHeight: '1.8',
      maxWidth: '300px',
      pointerEvents: 'none',
    });

    const title = document.createElement('div');
    title.style.cssText = 'color:#fff;font-size:16px;font-weight:600;margin-bottom:12px;';
    title.textContent = 'Tracking Diagnostics';
    leftPanel.appendChild(title);

    // Test 1: Z accuracy
    const zSection = document.createElement('div');
    zSection.style.marginBottom = '16px';
    zSection.innerHTML = `
      <div style="color:#7eb8ff;font-weight:600;margin-bottom:4px;">Test 1: Z Distance</div>
      <div style="color:#888;font-size:11px;margin-bottom:6px;">
        Measure your distance from screen with a tape measure.<br>
        Compare to the tracked value below.
      </div>
    `;
    this.zReadout = document.createElement('div');
    this.zReadout.style.cssText = `font-family:${mono};font-size:20px;color:#7eb8ff;`;
    this.zReadout.textContent = '—';
    zSection.appendChild(this.zReadout);
    leftPanel.appendChild(zSection);

    // X/Y readout
    const xySection = document.createElement('div');
    xySection.style.marginBottom = '16px';
    xySection.innerHTML = `
      <div style="color:#7eb8ff;font-weight:600;margin-bottom:4px;">Tracked Position</div>
    `;
    this.xReadout = document.createElement('div');
    this.xReadout.style.cssText = `font-family:${mono};font-size:14px;color:#aaa;`;
    xySection.appendChild(this.xReadout);
    this.yReadout = document.createElement('div');
    this.yReadout.style.cssText = `font-family:${mono};font-size:14px;color:#aaa;`;
    xySection.appendChild(this.yReadout);
    leftPanel.appendChild(xySection);

    // Screen dimensions
    const screenSection = document.createElement('div');
    screenSection.style.marginBottom = '16px';
    screenSection.innerHTML = `
      <div style="color:#7eb8ff;font-weight:600;margin-bottom:4px;">Computed Screen Size</div>
    `;
    this.screenDimsReadout = document.createElement('div');
    this.screenDimsReadout.style.cssText = `font-family:${mono};font-size:12px;color:#aaa;`;
    screenSection.appendChild(this.screenDimsReadout);
    leftPanel.appendChild(screenSection);

    this.container.appendChild(leftPanel);

    // --- Center: stability test labels ---
    const centerLabel = document.createElement('div');
    Object.assign(centerLabel.style, {
      position: 'absolute',
      bottom: '100px',
      left: '50%',
      transform: 'translateX(-50%)',
      textAlign: 'center',
      fontFamily: font,
      fontSize: '13px',
      color: '#888',
      pointerEvents: 'none',
      lineHeight: '1.6',
    });
    centerLabel.innerHTML = `
      <div style="color:#fff;font-size:14px;font-weight:600;margin-bottom:8px;">Test 2: Screen-Plane Stability</div>
      <span style="color:#44cc66;">Green crosshair (z=0)</span> should be <strong style="color:#fff;">completely motionless</strong>.<br>
      <span style="color:#ff4444;">Red (z=-10cm)</span> and <span style="color:#4488ff;">Blue (z=+5cm)</span> should shift with head movement.
    `;
    this.container.appendChild(centerLabel);

    // Stability drift meter
    this.stabilityIndicator = document.createElement('div');
    Object.assign(this.stabilityIndicator.style, {
      position: 'absolute',
      bottom: '70px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: mono,
      fontSize: '12px',
      color: '#44cc66',
      pointerEvents: 'none',
    });
    this.container.appendChild(this.stabilityIndicator);

    // --- Right panel: PPI test ---
    const ppiSection = document.createElement('div');
    Object.assign(ppiSection.style, {
      position: 'absolute',
      top: '20px',
      right: '20px',
      color: '#ccc',
      fontFamily: font,
      fontSize: '13px',
      lineHeight: '1.6',
      textAlign: 'right',
      pointerEvents: 'none',
    });

    const screen = this.engine.getScreenConfig();
    const ppi = this.engine.getPpi();

    ppiSection.innerHTML = `
      <div style="color:#7eb8ff;font-weight:600;margin-bottom:4px;">Test 3: PPI Verification</div>
      <div style="color:#888;font-size:11px;margin-bottom:8px;">
        Hold a ruler to the box below.<br>
        It should measure exactly 1 inch.<br>
        Current PPI: ${ppi}
      </div>
    `;

    // 1-inch reference box
    this.ppiBox = document.createElement('div');
    const boxPx = ppi;
    Object.assign(this.ppiBox.style, {
      width: `${boxPx}px`,
      height: `${boxPx}px`,
      border: '2px solid #7eb8ff',
      marginLeft: 'auto',
      position: 'relative',
    });

    // Tick marks
    for (let i = 0; i <= 4; i++) {
      const tick = document.createElement('div');
      const pct = (i / 4) * 100;
      Object.assign(tick.style, {
        position: 'absolute',
        bottom: '-8px',
        left: `${pct}%`,
        width: '1px',
        height: i % 4 === 0 ? '8px' : '5px',
        background: '#7eb8ff',
        transform: 'translateX(-0.5px)',
      });
      this.ppiBox.appendChild(tick);
    }

    // Label inside
    const boxLabel = document.createElement('div');
    Object.assign(boxLabel.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: '11px',
      color: '#7eb8ff',
      whiteSpace: 'nowrap',
    });
    boxLabel.textContent = '1 inch';
    this.ppiBox.appendChild(boxLabel);

    ppiSection.appendChild(this.ppiBox);
    this.container.appendChild(ppiSection);

    // Escape hint
    const escHint = document.createElement('div');
    Object.assign(escHint.style, {
      position: 'absolute',
      bottom: '20px',
      right: '20px',
      color: '#556677',
      fontFamily: font,
      fontSize: '12px',
      pointerEvents: 'none',
    });
    escHint.textContent = `Press ${this.triggerKey} or Escape to close`;
    this.container.appendChild(escHint);
  }

  // --- Update loop ---

  private tick = (): void => {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawPos = this.engine.getRawEyePosition();
    if (!rawPos) return;

    // Update camera with off-axis projection (same as other overlays)
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

    // Update readouts
    const zInches = (rawPos.z / 0.0254).toFixed(1);
    const zCm = (rawPos.z * 100).toFixed(1);
    this.zReadout.textContent = `${rawPos.z.toFixed(3)}m  (${zInches}" / ${zCm}cm)`;

    const xInches = (rawPos.x / 0.0254).toFixed(1);
    const yInches = (rawPos.y / 0.0254).toFixed(1);
    this.xReadout.textContent = `X: ${rawPos.x.toFixed(4)}m  (${xInches}")`;
    this.yReadout.textContent = `Y: ${rawPos.y.toFixed(4)}m  (${yInches}")`;

    const wIn = (screen.widthMeters / 0.0254).toFixed(1);
    const hIn = (screen.heightMeters / 0.0254).toFixed(1);
    this.screenDimsReadout.textContent =
      `${screen.widthMeters.toFixed(3)}m x ${screen.heightMeters.toFixed(3)}m\n` +
      `(${wIn}" x ${hIn}")  |  ${window.innerWidth}x${window.innerHeight}px`;

    // Screen-plane stability check:
    // Project the origin (0,0,0) to screen space and track drift
    const origin = new THREE.Vector3(0, 0, 0);
    origin.project(this.camera);
    const screenX = (origin.x + 1) / 2 * window.innerWidth;
    const screenY = (-origin.y + 1) / 2 * window.innerHeight;

    if (!this.screenPlaneRef) {
      this.screenPlaneRef = { x: screenX, y: screenY };
    }

    const drift = Math.hypot(
      screenX - this.screenPlaneRef.x,
      screenY - this.screenPlaneRef.y,
    );
    this.maxDrift = Math.max(this.maxDrift, drift);

    const driftColor = drift < 1 ? '#44cc66' : drift < 3 ? '#ffaa22' : '#ff4444';
    this.stabilityIndicator.style.color = driftColor;
    this.stabilityIndicator.textContent =
      `Drift: ${drift.toFixed(1)}px  (max: ${this.maxDrift.toFixed(1)}px)`;

    this.renderer.render(this.scene, this.camera);
  };

  // --- Events ---

  private handleKeydown = (e: KeyboardEvent): void => {
    if ((e.key === 'Escape' || e.key === this.triggerKey) && this.active) {
      e.preventDefault();
      this.hide();
      return;
    }

    if (e.key === this.triggerKey && !e.ctrlKey && !e.metaKey && !e.altKey && !this.active) {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      this.show();
    }
  };

  private handleResize = (): void => {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.screenPlaneRef = null;
    this.maxDrift = 0;
  };
}
