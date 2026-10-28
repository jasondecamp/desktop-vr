import type { EyePosition } from '../tracking/types';
import type { ScreenConfig } from '../projection/types';

/**
 * Anything that produces eye positions for the engine: a webcam face tracker,
 * the pointer, device tilt. Implementations must not touch `window`,
 * `document`, or `navigator` until `start()` (SSR safety).
 */
export interface EyeSource {
  /** Begin producing positions. May prompt for permission (camera, iOS motion). */
  start(emit: (position: EyePosition) => void, lost: () => void): Promise<void>;
  stop(): void;
  destroy(): void;
  /**
   * Optional: receive the engine's physical screen size, before `start()`
   * and whenever it changes. Sources that map to screen-relative offsets use it.
   */
  updateScreen?(screen: ScreenConfig): void;
}
