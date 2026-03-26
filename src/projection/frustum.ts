import type { EyePosition } from '../tracking/types';
import type { Frustum, ScreenConfig } from './types';

/**
 * Computes an off-axis (asymmetric) perspective frustum based on the
 * viewer's eye position relative to the screen.
 *
 * This is the core of the parallax illusion: the screen acts as a "window"
 * into the virtual scene, and the frustum shifts so that the rendered
 * perspective matches what the viewer would see if the screen were
 * actually a window.
 *
 * Reference: Robert Kooima, "Generalized Perspective Projection"
 */
export function computeOffAxisFrustum(
  eye: EyePosition,
  screen: ScreenConfig,
  near: number = 0.05,
  far: number = 100,
): Frustum {
  const halfW = screen.widthMeters / 2;
  const halfH = screen.heightMeters / 2;

  // The screen plane is at z=0 in our coordinate system.
  // The eye is at (eye.x, eye.y, eye.z) where eye.z > 0.
  // We need to project the screen edges from the eye position onto the near plane.

  const ratio = near / eye.z;

  return {
    left: (-halfW - eye.x) * ratio,
    right: (halfW - eye.x) * ratio,
    bottom: (-halfH - eye.y) * ratio,
    top: (halfH - eye.y) * ratio,
    near,
    far,
  };
}
