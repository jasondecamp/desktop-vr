import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrientationSource } from '../src/sources/OrientationSource';
import type { EyePosition } from '../src/tracking/types';

const screen = { widthMeters: 0.4, heightMeters: 0.3 };

function tilt(beta: number, gamma: number): void {
  window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma, alpha: 0 }));
}

describe('OrientationSource', () => {
  afterEach(() => {
    delete (DeviceOrientationEvent as { requestPermission?: unknown }).requestPermission;
  });

  async function started(config = {}) {
    const emitted: EyePosition[] = [];
    const source = new OrientationSource(config);
    source.updateScreen(screen);
    await source.start((p) => emitted.push(p));
    return { source, emitted, last: () => emitted[emitted.length - 1] };
  }

  it('emits center on start and measures tilt from the starting orientation', async () => {
    const { source, last } = await started({ maxTiltDegrees: 20, range: 0.5 });
    expect(last()).toEqual({ x: 0, y: 0, z: 0.6 });
    tilt(45, 5); // baseline
    expect(last().x).toBeCloseTo(0);
    tilt(45 + 20, 5); // top edge toward the viewer by maxTilt: eye fully up
    expect(last().y).toBeCloseTo(0.075);
    tilt(45, 5 + 10); // right edge away by half: eye half left
    expect(last().x).toBeCloseTo(-0.05);
    tilt(45, 5 + 90); // clamped
    expect(last().x).toBeCloseTo(-0.1);
    source.destroy();
  });

  it('recenter() takes the next reading as the new baseline', async () => {
    const { source, last } = await started();
    tilt(40, 0);
    tilt(50, 0);
    source.recenter();
    tilt(50, 0);
    expect(last().y).toBeCloseTo(0);
    source.destroy();
  });

  it('asks for permission where required and surfaces a refusal', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied');
    Object.assign(DeviceOrientationEvent, { requestPermission });
    const source = new OrientationSource();
    await expect(source.start(() => {})).rejects.toThrow(/denied/);
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it('starts when permission is granted', async () => {
    Object.assign(DeviceOrientationEvent, { requestPermission: vi.fn().mockResolvedValue('granted') });
    const { source, emitted } = await started();
    expect(emitted).toHaveLength(1);
    source.destroy();
  });
});
