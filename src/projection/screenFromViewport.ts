import type { ScreenConfig } from './types';

const INCHES_TO_METERS = 0.0254;

/**
 * Computes physical screen dimensions from the browser viewport.
 *
 * Uses viewport pixel dimensions for perfect aspect ratio, and
 * CSS PPI (pixels per inch) to estimate physical size.
 *
 * The CSS spec defines 96px = 1 inch. Real desktop monitors typically
 * range 90-115 CSS PPI, so 96 is a reasonable default that can be
 * fine-tuned via the calibration panel.
 *
 * @param ppi CSS pixels per physical inch. Default: 96
 */
export function screenFromViewport(ppi: number = 96): ScreenConfig {
  const widthInches = window.innerWidth / ppi;
  const heightInches = window.innerHeight / ppi;

  return {
    widthMeters: widthInches * INCHES_TO_METERS,
    heightMeters: heightInches * INCHES_TO_METERS,
  };
}
