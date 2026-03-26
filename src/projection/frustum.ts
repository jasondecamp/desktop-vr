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
  viewportAspect?: number,
): Frustum {
  const halfW = screen.widthMeters / 2;
  const halfH = screen.heightMeters / 2;

  // The screen plane is at z=0 in our coordinate system.
  // The eye is at (eye.x, eye.y, eye.z) where eye.z > 0.
  // We need to project the screen edges from the eye position onto the near plane.

  const ratio = near / eye.z;

  let left = (-halfW - eye.x) * ratio;
  let right = (halfW - eye.x) * ratio;
  let bottom = (-halfH - eye.y) * ratio;
  let top = (halfH - eye.y) * ratio;

  // If the viewport aspect ratio differs from the screen's, expand the
  // frustum so the scene isn't stretched. This keeps circles circular
  // regardless of browser window shape.
  if (viewportAspect !== undefined) {
    const screenAspect = screen.widthMeters / screen.heightMeters;
    if (viewportAspect > screenAspect) {
      // Viewport is wider than screen — expand horizontal
      const scale = viewportAspect / screenAspect;
      const cx = (left + right) / 2;
      const hw = (right - left) / 2;
      left = cx - hw * scale;
      right = cx + hw * scale;
    } else if (viewportAspect < screenAspect) {
      // Viewport is taller than screen — expand vertical
      const scale = screenAspect / viewportAspect;
      const cy = (bottom + top) / 2;
      const hh = (top - bottom) / 2;
      bottom = cy - hh * scale;
      top = cy + hh * scale;
    }
  }

  return { left, right, bottom, top, near, far };
}
