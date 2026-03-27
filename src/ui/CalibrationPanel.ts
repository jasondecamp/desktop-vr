import type { ParallaxEngine } from '../core/ParallaxEngine';
import type { EyePosition } from '../tracking/types';
import { OneEuroFilter, EMAFilter } from '../tracking/filters';
import type { CSSAdapter } from '../adapters/CSSAdapter';

export interface CalibrationPanelConfig {
  engine: ParallaxEngine;
  /** Keyboard key to toggle panel visibility. Default: '`' (backtick) */
  toggleKey?: string;
  /** Start with panel collapsed. Default: false */
  startCollapsed?: boolean;
}

const PANEL_WIDTH = 280;
const UPDATE_INTERVAL = 66; // ~15fps for UI updates

export class CalibrationPanel {
  private engine: ParallaxEngine;
  private toggleKey: string;
  private root: HTMLDivElement;
  private body: HTMLDivElement;
  private collapsed: boolean;
  private rafId: number | null = null;
  private lastUpdateTime = 0;

  // Live readout elements
  private eyeXEl!: HTMLSpanElement;
  private eyeYEl!: HTMLSpanElement;
  private eyeZEl!: HTMLSpanElement;
  private statusDot!: HTMLDivElement;
  private positionDot!: HTMLDivElement;
  private previewVideo!: HTMLVideoElement;
  private previewCanvas!: HTMLCanvasElement;
  private previewContainer!: HTMLDivElement;

  // Control elements that need dynamic show/hide
  private oneEuroControls!: HTMLDivElement;
  private emaControls!: HTMLDivElement;
  private sensitivityRow!: HTMLDivElement;

  constructor(config: CalibrationPanelConfig) {
    this.engine = config.engine;
    this.toggleKey = config.toggleKey ?? '`';
    this.collapsed = config.startCollapsed ?? false;

    this.root = document.createElement('div');
    this.body = document.createElement('div');

    this.buildPanel();
    document.body.appendChild(this.root);
    document.addEventListener('keydown', this.handleKeydown);
    this.startUpdates();
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    document.removeEventListener('keydown', this.handleKeydown);
    this.root.remove();
  }

  // --- DOM Construction ---

  private buildPanel(): void {
    Object.assign(this.root.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      width: `${PANEL_WIDTH}px`,
      zIndex: '99999',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      color: '#e0e0e0',
      background: 'rgba(10, 10, 20, 0.92)',
      borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      userSelect: 'none',
      transition: 'opacity 0.15s',
    });

    // Header
    const header = this.el('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      cursor: 'pointer',
      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    });
    header.addEventListener('click', () => this.toggle());

    const title = this.el('span', { fontWeight: '600', fontSize: '13px', color: '#fff' });
    title.textContent = 'Calibration';

    this.statusDot = this.el('div', {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#666',
      marginLeft: '8px',
      transition: 'background 0.3s',
    }) as HTMLDivElement;

    const titleRow = this.el('div', { display: 'flex', alignItems: 'center' });
    titleRow.append(title, this.statusDot);

    const toggleHint = this.el('span', { color: '#666', fontSize: '11px' });
    toggleHint.textContent = `[ ${this.toggleKey} ]`;

    header.append(titleRow, toggleHint);
    this.root.appendChild(header);

    // Body (collapsible)
    Object.assign(this.body.style, {
      padding: '0 14px 14px',
      overflow: 'hidden',
      maxHeight: this.collapsed ? '0px' : '2000px',
      opacity: this.collapsed ? '0' : '1',
      transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
    });
    if (this.collapsed) this.body.style.padding = '0 14px';

    this.buildEyePosition();
    this.buildCameraPreview();
    this.buildScreenSection();
    this.buildCalibrationSection();
    this.buildSmoothingSection();
    this.buildSensitivitySection();

    this.root.appendChild(this.body);
  }

  private buildEyePosition(): void {
    const section = this.section('Eye Position');

    // Numeric readout
    const readout = this.el('div', {
      fontFamily: 'ui-monospace, "SF Mono", monospace',
      fontSize: '11px',
      lineHeight: '1.8',
      padding: '6px 0',
    });

    const makeRow = (label: string): HTMLSpanElement => {
      const row = this.el('div');
      const lbl = this.el('span', { color: '#888', display: 'inline-block', width: '18px' });
      lbl.textContent = label;
      const val = this.el('span', { color: '#7eb8ff' }) as HTMLSpanElement;
      val.textContent = '—';
      row.append(lbl, val);
      readout.appendChild(row);
      return val;
    };

    this.eyeXEl = makeRow('X');
    this.eyeYEl = makeRow('Y');
    this.eyeZEl = makeRow('Z');
    section.appendChild(readout);

    // Visual position indicator
    const indicator = this.el('div', {
      width: '100%',
      height: '80px',
      background: 'rgba(255, 255, 255, 0.04)',
      borderRadius: '6px',
      position: 'relative',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      marginTop: '4px',
    });

    // Crosshair lines
    const hLine = this.el('div', {
      position: 'absolute',
      top: '50%',
      left: '0',
      right: '0',
      height: '1px',
      background: 'rgba(255, 255, 255, 0.08)',
    });
    const vLine = this.el('div', {
      position: 'absolute',
      left: '50%',
      top: '0',
      bottom: '0',
      width: '1px',
      background: 'rgba(255, 255, 255, 0.08)',
    });

    this.positionDot = this.el('div', {
      position: 'absolute',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: '#7eb8ff',
      boxShadow: '0 0 8px rgba(126, 184, 255, 0.5)',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      transition: 'left 0.05s, top 0.05s',
    }) as HTMLDivElement;

    indicator.append(hLine, vLine, this.positionDot);
    section.appendChild(indicator);
    this.body.appendChild(section);
  }

  private buildCameraPreview(): void {
    const section = this.section('Camera Preview');

    this.previewContainer = this.el('div', {
      width: '100%',
      aspectRatio: '4/3',
      background: 'rgba(255, 255, 255, 0.04)',
      borderRadius: '6px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      position: 'relative',
    }) as HTMLDivElement;

    this.previewVideo = document.createElement('video');
    Object.assign(this.previewVideo.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scaleX(-1)',
    });
    this.previewVideo.setAttribute('playsinline', '');
    this.previewVideo.setAttribute('autoplay', '');
    this.previewVideo.muted = true;

    this.previewCanvas = document.createElement('canvas');
    Object.assign(this.previewCanvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      transform: 'scaleX(-1)',
      pointerEvents: 'none',
    });

    this.previewContainer.append(this.previewVideo, this.previewCanvas);
    section.appendChild(this.previewContainer);
    this.body.appendChild(section);
  }

  private ppiInput!: HTMLInputElement;

  private buildScreenSection(): void {
    const section = this.section('Screen');
    const screen = this.engine.getScreenConfig();

    // Ruler calibration tool
    const rulerLabel = this.el('div', {
      color: '#888',
      fontSize: '11px',
      marginBottom: '6px',
    });
    rulerLabel.textContent = 'Drag the handle so the line matches 1 inch on a ruler:';
    section.appendChild(rulerLabel);

    const rulerContainer = this.el('div', {
      position: 'relative',
      height: '32px',
      marginBottom: '10px',
      userSelect: 'none',
    });

    // The ruler line
    const rulerLine = this.el('div', {
      position: 'absolute',
      top: '14px',
      left: '0',
      height: '2px',
      background: '#7eb8ff',
      width: `${this.engine.getPpi()}px`,
      borderRadius: '1px',
    });

    // Tick marks at each end
    const leftTick = this.el('div', {
      position: 'absolute',
      top: '8px',
      left: '0',
      width: '2px',
      height: '14px',
      background: '#7eb8ff',
    });

    const rightTick = this.el('div', {
      position: 'absolute',
      top: '8px',
      left: `${this.engine.getPpi() - 1}px`,
      width: '2px',
      height: '14px',
      background: '#7eb8ff',
    });

    // Drag handle on the right end
    const handle = this.el('div', {
      position: 'absolute',
      top: '6px',
      left: `${this.engine.getPpi() - 8}px`,
      width: '16px',
      height: '18px',
      background: 'rgba(126, 184, 255, 0.3)',
      border: '1px solid rgba(126, 184, 255, 0.6)',
      borderRadius: '3px',
      cursor: 'ew-resize',
    });

    // PPI readout below ruler
    const ppiReadout = this.el('div', {
      fontSize: '11px',
      fontFamily: 'ui-monospace, "SF Mono", monospace',
      color: '#7eb8ff',
      textAlign: 'center',
      marginTop: '2px',
      pointerEvents: 'none',
    });
    ppiReadout.textContent = `${this.engine.getPpi()} PPI`;

    // Drag logic
    let dragging = false;
    let startX = 0;
    let startWidth = this.engine.getPpi();

    const updateRuler = (px: number) => {
      const ppi = Math.round(Math.max(50, Math.min(300, px)));
      rulerLine.style.width = `${ppi}px`;
      rightTick.style.left = `${ppi - 1}px`;
      handle.style.left = `${ppi - 8}px`;
      ppiReadout.textContent = `${ppi} PPI`;
      this.engine.setPpi(ppi);
      if (this.ppiInput) this.ppiInput.value = ppi.toString();
    };

    handle.addEventListener('mousedown', (e: Event) => {
      const me = e as MouseEvent;
      dragging = true;
      startX = me.clientX;
      startWidth = parseFloat(rulerLine.style.width);
      me.preventDefault();
    });

    document.addEventListener('mousemove', (e: Event) => {
      if (!dragging) return;
      const me = e as MouseEvent;
      const dx = me.clientX - startX;
      updateRuler(startWidth + dx);
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
    });

    rulerContainer.append(rulerLine, leftTick, rightTick, handle);
    section.append(rulerContainer, ppiReadout);

    // Numeric PPI input as fallback
    this.numberInput(section, 'PPI', this.engine.getPpi(), 50, 300, 1, (v) => {
      this.engine.setPpi(v);
      updateRuler(v);
    });
    // Grab the input we just created so the ruler can update it
    const inputs = section.querySelectorAll('input[type="number"]');
    this.ppiInput = inputs[inputs.length - 1] as HTMLInputElement;

    this.numberInput(section, 'Width (m)', screen.widthMeters, 0.01, 2.0, 0.01, (v) => {
      this.engine.updateScreen({ widthMeters: v });
    });
    this.numberInput(section, 'Height (m)', screen.heightMeters, 0.01, 2.0, 0.01, (v) => {
      this.engine.updateScreen({ heightMeters: v });
    });

    this.body.appendChild(section);
  }

  private buildCalibrationSection(): void {
    const section = this.section('Calibration');
    const cal = this.engine.getCalibrationConfig();

    this.numberInput(section, 'Camera FOV (\u00B0)', cal.cameraFovDegrees, 30, 120, 1, (v) => {
      this.engine.updateCalibration({ cameraFovDegrees: v });
    });
    this.numberInput(section, 'Camera Y Offset (m)', cal.cameraOffsetY, -0.1, 0.2, 0.005, (v) => {
      this.engine.updateCalibration({ cameraOffsetY: v });
    });
    this.numberInput(section, 'Real IPD (m)', cal.realIPD, 0.04, 0.08, 0.001, (v) => {
      this.engine.updateCalibration({ realIPD: v });
    });
    this.checkbox(section, 'Mirror X', cal.mirrorX, (v) => {
      this.engine.updateCalibration({ mirrorX: v });
    });

    this.body.appendChild(section);
  }

  private buildSmoothingSection(): void {
    const section = this.section('Smoothing');
    const current = this.engine.getSmoothingType();

    // Smoothing type selector
    const row = this.controlRow('Type');
    const select = document.createElement('select');
    Object.assign(select.style, {
      background: 'rgba(255, 255, 255, 0.08)',
      color: '#e0e0e0',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '4px',
      padding: '3px 6px',
      fontSize: '11px',
      width: '100px',
      outline: 'none',
    });
    for (const opt of ['none', 'ema', 'one-euro'] as const) {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt === 'one-euro' ? 'One-Euro' : opt === 'ema' ? 'EMA' : 'None';
      option.selected = opt === current;
      select.appendChild(option);
    }
    select.addEventListener('change', () => {
      const val = select.value as 'none' | 'ema' | 'one-euro';
      this.engine.setSmoothing(val);
      this.updateSmoothingVisibility(val);
    });
    row.appendChild(select);
    section.appendChild(row);

    // One-Euro controls
    this.oneEuroControls = this.el('div') as HTMLDivElement;
    this.slider(this.oneEuroControls, 'Min Cutoff', 1.0, 0.1, 10.0, 0.1, (v) => {
      const filter = this.engine.getFilter();
      if (filter instanceof OneEuroFilter) {
        const beta = parseFloat(
          (this.oneEuroControls.querySelector('[data-param="beta"]') as HTMLInputElement)?.value ?? '0.007',
        );
        filter.updateParams(v, beta);
      }
    });
    this.slider(this.oneEuroControls, 'Beta', 0.007, 0.001, 0.1, 0.001, (v) => {
      const filter = this.engine.getFilter();
      if (filter instanceof OneEuroFilter) {
        const minCutoff = parseFloat(
          (this.oneEuroControls.querySelector('[data-param="minCutoff"]') as HTMLInputElement)?.value ?? '1.0',
        );
        filter.updateParams(minCutoff, v);
      }
    }, 'beta');
    // Tag the first slider too
    const firstSlider = this.oneEuroControls.querySelector('input[type="range"]') as HTMLInputElement;
    if (firstSlider) firstSlider.dataset.param = 'minCutoff';
    section.appendChild(this.oneEuroControls);

    // EMA controls
    this.emaControls = this.el('div') as HTMLDivElement;
    this.slider(this.emaControls, 'Alpha', 0.3, 0.01, 1.0, 0.01, (v) => {
      const filter = this.engine.getFilter();
      if (filter instanceof EMAFilter) {
        filter.setAlpha(v);
      }
    });
    section.appendChild(this.emaControls);

    this.updateSmoothingVisibility(current);
    this.body.appendChild(section);
  }

  private buildSensitivitySection(): void {
    const adapter = this.engine.getAdapter();
    if (!('setSensitivity' in adapter)) return;

    this.sensitivityRow = this.el('div') as HTMLDivElement;
    const section = this.section('Adapter');
    const cssAdapter = adapter as CSSAdapter;
    this.slider(section, 'Sensitivity', cssAdapter.getSensitivity(), 0.1, 3.0, 0.1, (v) => {
      cssAdapter.setSensitivity(v);
    });
    this.body.appendChild(section);
  }

  private updateSmoothingVisibility(type: string): void {
    this.oneEuroControls.style.display = type === 'one-euro' ? 'block' : 'none';
    this.emaControls.style.display = type === 'ema' ? 'block' : 'none';
  }

  // --- UI update loop ---

  private startUpdates(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - this.lastUpdateTime < UPDATE_INTERVAL) return;
      this.lastUpdateTime = now;
      this.updateReadouts();
    };
    tick();
  }

  private updateReadouts(): void {
    const pos = this.engine.getEyePosition();
    if (pos) {
      this.statusDot.style.background = '#44cc66';
      this.eyeXEl.textContent = pos.x.toFixed(4);
      this.eyeYEl.textContent = pos.y.toFixed(4);
      this.eyeZEl.textContent = pos.z.toFixed(4);
      this.updatePositionDot(pos);
    }

    // Attach camera preview if not yet connected
    if (!this.previewVideo.srcObject) {
      const srcVideo = this.engine.getVideoElement();
      if (srcVideo?.srcObject) {
        this.previewVideo.srcObject = srcVideo.srcObject;
      }
    }

    this.drawTrackingOverlay();
  }

  private drawTrackingOverlay(): void {
    const rawFace = this.engine.getRawFaceData();
    const rect = this.previewContainer.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (this.previewCanvas.width !== w || this.previewCanvas.height !== h) {
      this.previewCanvas.width = w;
      this.previewCanvas.height = h;
    }

    const ctx = this.previewCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    if (!rawFace) return;

    const px = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h });

    const leftIris = px(rawFace.leftEye);
    const rightIris = px(rawFace.rightEye);
    const leftInner = px(rawFace.leftInnerCanthus);
    const rightInner = px(rawFace.rightInnerCanthus);
    const leftOuter = px(rawFace.leftOuterCanthus);
    const rightOuter = px(rawFace.rightOuterCanthus);
    const nose = px(rawFace.noseBridge);
    const noseTip = px(rawFace.noseTip);
    const mid = { x: rawFace.x * w, y: rawFace.y * h };
    const ipdPx = rawFace.interPupillaryDistance * w;

    // Helper: small dot at a landmark
    const dot = (p: { x: number; y: number }, color: string, r = 2) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    // --- Connection lines (dim) ---
    ctx.strokeStyle = 'rgba(68, 204, 102, 0.3)';
    ctx.lineWidth = 1;

    // Line between iris centers
    ctx.beginPath();
    ctx.moveTo(leftIris.x, leftIris.y);
    ctx.lineTo(rightIris.x, rightIris.y);
    ctx.stroke();

    // Lines from outer canthus → inner canthus on each side (eye width)
    ctx.beginPath();
    ctx.moveTo(leftOuter.x, leftOuter.y);
    ctx.lineTo(leftInner.x, leftInner.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightInner.x, rightInner.y);
    ctx.lineTo(rightOuter.x, rightOuter.y);
    ctx.stroke();

    // Nose bridge to midpoint
    ctx.strokeStyle = 'rgba(126, 184, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    ctx.lineTo(noseTip.x, noseTip.y);
    ctx.stroke();

    // --- Eye-shaped arcs around irises ---
    const eyeRx = ipdPx * 0.22;
    const eyeRy = ipdPx * 0.1125;
    ctx.strokeStyle = rawFace.isBlinking ? 'rgba(255, 160, 60, 0.6)' : 'rgba(68, 204, 102, 0.7)';
    ctx.lineWidth = 1.5;

    const drawEyeArcs = (cx: number, cy: number) => {
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeRx, eyeRy, 0, Math.PI + 0.3, -0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeRx, eyeRy * 0.7, 0, 0.3, Math.PI - 0.3);
      ctx.stroke();
    };

    drawEyeArcs(leftIris.x, leftIris.y);
    drawEyeArcs(rightIris.x, rightIris.y);

    // --- Landmark dots ---

    // Iris centers (green, brighter when eyes open)
    const irisColor = rawFace.isBlinking ? 'rgba(255, 160, 60, 0.5)' : 'rgba(68, 204, 102, 0.9)';
    dot(leftIris, irisColor, 2.5);
    dot(rightIris, irisColor, 2.5);

    // Inner canthi (cyan — primary tracking anchors)
    dot(leftInner, 'rgba(80, 220, 220, 0.8)', 2);
    dot(rightInner, 'rgba(80, 220, 220, 0.8)', 2);

    // Outer canthi (cyan, dimmer)
    dot(leftOuter, 'rgba(80, 220, 220, 0.5)', 2);
    dot(rightOuter, 'rgba(80, 220, 220, 0.5)', 2);

    // Nose landmarks (subtle)
    dot(nose, 'rgba(180, 160, 255, 0.6)', 2);
    dot(noseTip, 'rgba(180, 160, 255, 0.4)', 2);

    // --- Computed midpoint (blue crosshair) ---
    dot(mid, 'rgba(126, 184, 255, 0.9)', 3);
    const ch = 6;
    ctx.beginPath();
    ctx.moveTo(mid.x - ch, mid.y);
    ctx.lineTo(mid.x + ch, mid.y);
    ctx.moveTo(mid.x, mid.y - ch);
    ctx.lineTo(mid.x, mid.y + ch);
    ctx.strokeStyle = 'rgba(126, 184, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Blink indicator
    if (rawFace.isBlinking) {
      ctx.fillStyle = 'rgba(255, 160, 60, 0.8)';
      ctx.font = '9px system-ui';
      ctx.fillText('BLINK', 4, 12);
    }
  }

  private updatePositionDot(pos: EyePosition): void {
    // Map x from [-0.15, 0.15] to [0%, 100%], y similarly
    const xPct = Math.max(0, Math.min(100, 50 + (pos.x / 0.15) * 50));
    const yPct = Math.max(0, Math.min(100, 50 - (pos.y / 0.10) * 50));
    this.positionDot.style.left = `${xPct}%`;
    this.positionDot.style.top = `${yPct}%`;

    // Scale dot based on Z distance (closer = bigger)
    const scale = Math.max(0.5, Math.min(2.0, 0.6 / pos.z));
    this.positionDot.style.width = `${10 * scale}px`;
    this.positionDot.style.height = `${10 * scale}px`;
  }

  // --- Toggle ---

  private toggle(): void {
    this.collapsed = !this.collapsed;
    if (this.collapsed) {
      this.body.style.maxHeight = '0px';
      this.body.style.opacity = '0';
      this.body.style.padding = '0 14px';
    } else {
      this.body.style.maxHeight = '2000px';
      this.body.style.opacity = '1';
      this.body.style.padding = '0 14px 14px';
    }
  }

  private handleKeydown = (e: KeyboardEvent): void => {
    if (e.key === this.toggleKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      this.toggle();
    }
  };

  // --- DOM Helpers ---

  private el(tag: string, styles: Partial<CSSStyleDeclaration> = {}): HTMLElement {
    const element = document.createElement(tag);
    Object.assign(element.style, styles);
    return element;
  }

  private section(title: string): HTMLDivElement {
    const section = this.el('div', {
      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
      paddingTop: '10px',
      marginTop: '10px',
    }) as HTMLDivElement;

    const label = this.el('div', {
      fontSize: '10px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: '#888',
      marginBottom: '8px',
    });
    label.textContent = title;
    section.appendChild(label);
    return section;
  }

  private controlRow(label: string): HTMLDivElement {
    const row = this.el('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '6px',
    }) as HTMLDivElement;

    const lbl = this.el('span', { color: '#aaa', fontSize: '11px' });
    lbl.textContent = label;
    row.appendChild(lbl);
    return row;
  }

  private numberInput(
    parent: HTMLElement,
    label: string,
    initial: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ): void {
    const row = this.controlRow(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = initial.toString();
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    Object.assign(input.style, {
      width: '80px',
      background: 'rgba(255, 255, 255, 0.08)',
      color: '#e0e0e0',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '4px',
      padding: '3px 6px',
      fontSize: '11px',
      fontFamily: 'ui-monospace, "SF Mono", monospace',
      outline: 'none',
      textAlign: 'right' as string,
    });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) onChange(v);
    });

    row.appendChild(input);
    parent.appendChild(row);
  }

  private checkbox(
    parent: HTMLElement,
    label: string,
    initial: boolean,
    onChange: (value: boolean) => void,
  ): void {
    const row = this.controlRow(label);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initial;
    Object.assign(input.style, {
      accentColor: '#7eb8ff',
      cursor: 'pointer',
    });
    input.addEventListener('change', () => onChange(input.checked));

    row.appendChild(input);
    parent.appendChild(row);
  }

  private slider(
    parent: HTMLElement,
    label: string,
    initial: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
    dataParam?: string,
  ): void {
    const row = this.controlRow(label);

    const valueLabel = this.el('span', {
      fontFamily: 'ui-monospace, "SF Mono", monospace',
      fontSize: '11px',
      color: '#7eb8ff',
      minWidth: '44px',
      textAlign: 'right',
    });
    valueLabel.textContent = initial.toString();

    const input = document.createElement('input');
    input.type = 'range';
    input.value = initial.toString();
    input.min = min.toString();
    input.max = max.toString();
    input.step = step.toString();
    if (dataParam) input.dataset.param = dataParam;
    Object.assign(input.style, {
      width: '90px',
      accentColor: '#7eb8ff',
      cursor: 'pointer',
    });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valueLabel.textContent = v.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1);
      onChange(v);
    });

    row.append(input, valueLabel);
    parent.appendChild(row);
  }
}
