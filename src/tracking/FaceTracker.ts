import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { EyePosition, RawFaceData, TrackingConfig } from './types';
import { EMAFilter, OneEuroFilter } from './filters';
import type { CoordinateMapper } from '../projection/coordinateMapper';

// MediaPipe face mesh landmark indices for eye centers
const LEFT_EYE_CENTER = 468;   // left iris center
const RIGHT_EYE_CENTER = 473;  // right iris center

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
    // Initialize MediaPipe
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
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });

    // Set up video element
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);

    // Request camera access
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
    const leftEye = landmarks[LEFT_EYE_CENTER];
    const rightEye = landmarks[RIGHT_EYE_CENTER];

    if (!leftEye || !rightEye) {
      this.config.onTrackingLost();
      return;
    }

    const rawData: RawFaceData = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2,
      interPupillaryDistance: Math.hypot(
        rightEye.x - leftEye.x,
        rightEye.y - leftEye.y,
      ),
    };

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
