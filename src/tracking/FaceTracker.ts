import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { EyePosition, RawFaceData, TrackingConfig } from './types';
import { EMAFilter, OneEuroFilter } from './filters';
import type { CoordinateMapper } from '../projection/coordinateMapper';

// MediaPipe face mesh landmark indices
const LEFT_IRIS = 468;           // left iris center
const RIGHT_IRIS = 473;          // right iris center
const LEFT_INNER_CANTHUS = 133;  // left inner eye corner
const RIGHT_INNER_CANTHUS = 362; // right inner eye corner
const LEFT_OUTER_CANTHUS = 33;   // left outer eye corner
const RIGHT_OUTER_CANTHUS = 263; // right outer eye corner
const NOSE_BRIDGE = 168;         // bridge of nose between eyes
const NOSE_TIP = 1;              // nose tip

// Blink detection thresholds (blendshape values 0-1)
const BLINK_THRESHOLD = 0.5;

export class FaceTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private running = false;
  private filter: EMAFilter | OneEuroFilter | null = null;
  private config: Required<TrackingConfig>;
  private coordinateMapper: CoordinateMapper;
  private lastFrameTime = 0;
  private lastRawFaceData: RawFaceData | null = null;

  constructor(coordinateMapper: CoordinateMapper, config: TrackingConfig = {}) {
    this.coordinateMapper = coordinateMapper;
    this.config = {
      maxFps: config.maxFps ?? 30,
      facingMode: config.facingMode ?? 'user',
      smoothing: config.smoothing ?? 'one-euro',
      onTrack: config.onTrack ?? (() => {}),
      onTrackingLost: config.onTrackingLost ?? (() => {}),
    };

    switch (this.config.smoothing) {
      case 'ema':
        this.filter = new EMAFilter(0.3);
        break;
      case 'one-euro':
        this.filter = new OneEuroFilter();
        break;
      case 'none':
        this.filter = null;
        break;
    }
  }

  async initialize(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });

    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: this.config.facingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    this.video.srcObject = this.stream;
    await this.video.play();
  }

  start(): void {
    if (!this.faceLandmarker || !this.video) {
      throw new Error('FaceTracker not initialized. Call initialize() first.');
    }
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getRawFaceData(): RawFaceData | null {
    return this.lastRawFaceData;
  }

  getFilter(): EMAFilter | OneEuroFilter | null {
    return this.filter;
  }

  getSmoothingType(): 'none' | 'ema' | 'one-euro' {
    return this.config.smoothing;
  }

  setSmoothing(type: 'none' | 'ema' | 'one-euro'): void {
    if (type === this.config.smoothing) return;
    this.config.smoothing = type;
    switch (type) {
      case 'ema':
        this.filter = new EMAFilter(0.3);
        break;
      case 'one-euro':
        this.filter = new OneEuroFilter();
        break;
      case 'none':
        this.filter = null;
        break;
    }
  }

  destroy(): void {
    this.stop();
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.remove();
      this.video = null;
    }
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    if (this.filter) {
      this.filter.reset();
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    this.animationFrameId = requestAnimationFrame(this.tick);

    const now = performance.now();
    const minInterval = 1000 / this.config.maxFps;
    if (now - this.lastFrameTime < minInterval) return;
    this.lastFrameTime = now;

    if (!this.video || !this.faceLandmarker || this.video.readyState < 2) return;

    const results = this.faceLandmarker.detectForVideo(this.video, now);

    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      this.config.onTrackingLost();
      return;
    }

    const landmarks = results.faceLandmarks[0];

    // Extract all tracked landmarks
    const leftIris = landmarks[LEFT_IRIS];
    const rightIris = landmarks[RIGHT_IRIS];
    const leftInner = landmarks[LEFT_INNER_CANTHUS];
    const rightInner = landmarks[RIGHT_INNER_CANTHUS];
    const leftOuter = landmarks[LEFT_OUTER_CANTHUS];
    const rightOuter = landmarks[RIGHT_OUTER_CANTHUS];
    const noseBridge = landmarks[NOSE_BRIDGE];
    const noseTip = landmarks[NOSE_TIP];

    if (!leftInner || !rightInner || !noseBridge) {
      this.config.onTrackingLost();
      return;
    }

    // Detect blink via blendshapes
    let isBlinking = false;
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      const blendshapes = results.faceBlendshapes[0].categories;
      const leftBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft');
      const rightBlink = blendshapes.find(b => b.categoryName === 'eyeBlinkRight');
      isBlinking =
        (leftBlink !== undefined && leftBlink.score > BLINK_THRESHOLD) ||
        (rightBlink !== undefined && rightBlink.score > BLINK_THRESHOLD);
    }

    // Primary X/Y tracking: blend inner canthi (stable) with iris (precise).
    // Canthi are skin landmarks that don't shift during blinks.
    const canthiMidX = (leftInner.x + rightInner.x) / 2;
    const canthiMidY = (leftInner.y + rightInner.y) / 2;

    let trackX: number;
    let trackY: number;
    if (leftIris && rightIris) {
      // Weighted blend: 60% canthi (stable) + 40% iris (precise)
      const irisMidX = (leftIris.x + rightIris.x) / 2;
      const irisMidY = (leftIris.y + rightIris.y) / 2;
      trackX = canthiMidX * 0.6 + irisMidX * 0.4;
      trackY = canthiMidY * 0.6 + irisMidY * 0.4;
    } else {
      trackX = canthiMidX;
      trackY = canthiMidY;
    }

    // IPD / depth estimation: prefer iris distance, fall back to outer canthi
    let ipd: number;
    if (leftIris && rightIris) {
      ipd = Math.hypot(rightIris.x - leftIris.x, rightIris.y - leftIris.y);
    } else {
      const outerDist = leftOuter && rightOuter
        ? Math.hypot(rightOuter.x - leftOuter.x, rightOuter.y - leftOuter.y)
        : Math.hypot(rightInner.x - leftInner.x, rightInner.y - leftInner.y) * 1.8;
      ipd = outerDist / 1.6;
    }

    const rawData: RawFaceData = {
      x: trackX,
      y: trackY,
      interPupillaryDistance: ipd,
      leftEye: leftIris ? { x: leftIris.x, y: leftIris.y } : { x: leftInner.x, y: leftInner.y },
      rightEye: rightIris ? { x: rightIris.x, y: rightIris.y } : { x: rightInner.x, y: rightInner.y },
      leftInnerCanthus: { x: leftInner.x, y: leftInner.y },
      rightInnerCanthus: { x: rightInner.x, y: rightInner.y },
      leftOuterCanthus: leftOuter ? { x: leftOuter.x, y: leftOuter.y } : { x: leftInner.x, y: leftInner.y },
      rightOuterCanthus: rightOuter ? { x: rightOuter.x, y: rightOuter.y } : { x: rightInner.x, y: rightInner.y },
      noseBridge: { x: noseBridge.x, y: noseBridge.y },
      noseTip: noseTip ? { x: noseTip.x, y: noseTip.y } : { x: noseBridge.x, y: noseBridge.y },
      isBlinking,
    };

    this.lastRawFaceData = rawData;

    let position = this.coordinateMapper.map(rawData);

    if (this.filter) {
      position =
        this.filter instanceof OneEuroFilter
          ? this.filter.filter(position, now)
          : this.filter.filter(position);
    }

    this.config.onTrack(position);
  };
}
