import * as THREE from 'three';
import type { EyePosition } from '../tracking/types';
import type { Frustum, ScreenConfig } from '../projection/types';
import { computeOffAxisFrustum } from '../projection/frustum';

export interface ThreeJSAdapterConfig {
  /** The Three.js camera to control */
  camera: THREE.PerspectiveCamera;
  /** Physical screen dimensions */
  screen: ScreenConfig;
  /** Near clipping plane distance in meters. Default: 0.05 */
  near?: number;
  /** Far clipping plane distance in meters. Default: 100 */
  far?: number;
}

export class ThreeJSAdapter {
  private camera: THREE.PerspectiveCamera;
  private screen: ScreenConfig;
  private near: number;
  private far: number;

  constructor(config: ThreeJSAdapterConfig) {
    this.camera = config.camera;
    this.screen = config.screen;
    this.near = config.near ?? 0.05;
    this.far = config.far ?? 100;
  }

  updateScreen(screen: ScreenConfig): void {
    this.screen = screen;
  }

  update(eye: EyePosition): void {
    const viewportAspect = this.camera.aspect;
    const frustum = computeOffAxisFrustum(eye, this.screen, this.near, this.far, viewportAspect);
    this.applyFrustum(frustum, eye);
  }

  private applyFrustum(frustum: Frustum, eye: EyePosition): void {
    // Build the off-axis projection matrix directly
    this.camera.projectionMatrix.makePerspective(
      frustum.left,
      frustum.right,
      frustum.top,
      frustum.bottom,
      frustum.near,
      frustum.far,
    );
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    // Move the camera to the eye position.
    // The scene is set up so the screen plane is at z=0,
    // and the viewer looks in the -z direction (into the screen).
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.lookAt(eye.x, eye.y, 0);
  }
}
