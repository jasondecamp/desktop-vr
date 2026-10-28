/**
 * Version of `@mediapipe/tasks-vision` the default asset URLs point at.
 * Keep in sync with the installed package (a test asserts this), so the
 * WASM fileset and the JS bundle always come from the same release.
 */
export const MEDIAPIPE_VERSION = '0.10.34';

/** Default WASM fileset location, pinned to {@link MEDIAPIPE_VERSION}. */
export const DEFAULT_WASM_PATH =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/** Default face landmarker model. */
export const DEFAULT_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
