import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PointerSource } from '../src/sources/PointerSource';
import type { EyePosition } from '../src/tracking/types';
import { frames, pointerLeaveWindow, pointerMove, useFrameTimers } from './helpers';
import { vi } from 'vitest';

// jsdom viewport is 1024x768; use round screen numbers
const screen = { widthMeters: 0.4, heightMeters: 0.3 };

describe('PointerSource', () => {
  let source: PointerSource;
  let emitted: EyePosition[];
  const last = () => emitted[emitted.length - 1];

  beforeEach(async () => {
    useFrameTimers();
    emitted = [];
  });

  afterEach(() => {
    source?.destroy();
    vi.useRealTimers();
  });

  async function startSource(config = {}) {
    source = new PointerSource({ range: 0.5, ...config });
    source.updateScreen(screen);
    await source.start((p) => emitted.push(p));
  }

  it('emits the center at the configured distance on start', async () => {
    await startSource({ distance: 0.75 });
    expect(last()).toEqual({ x: 0, y: 0, z: 0.75 });
  });

  it('maps center, edges and corners using range', () => {
    source = new PointerSource({ range: 0.5, distance: 0.6 });
    source.updateScreen(screen);
    expect(source.toEyePosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0, z: 0.6 });
    // Right edge: half of the half-width (0.2 m) = 0.1 m
    expect(source.toEyePosition({ x: 1, y: 0 }).x).toBeCloseTo(0.1);
    expect(source.toEyePosition({ x: -1, y: 0 }).x).toBeCloseTo(-0.1);
    // Top of the viewport (-1, y down) is eye up (+y): half of 0.15 m
    expect(source.toEyePosition({ x: 0, y: -1 }).y).toBeCloseTo(0.075);
    expect(source.toEyePosition({ x: 0, y: 1 }).y).toBeCloseTo(-0.075);

    const wide = new PointerSource({ range: 1 });
    wide.updateScreen(screen);
    expect(wide.toEyePosition({ x: 1, y: 1 })).toEqual({ x: 0.2, y: -0.15, z: 0.6 });
  });

  it('follows the pointer directly once it has entered', async () => {
    await startSource();
    pointerMove(512, 384);
    frames(30);
    pointerMove(1024, 0);
    expect(last().x).toBeCloseTo(0.1);
    expect(last().y).toBeCloseTo(0.075);
    pointerMove(512, 384);
    expect(last()).toEqual({ x: 0, y: 0, z: 0.6 });
  });

  it('eases in on the first move instead of jumping', async () => {
    await startSource();
    pointerMove(1024, 384); // right edge
    expect(last().x).toBeCloseTo(0); // nothing jumped yet
    frames(5);
    expect(last().x).toBeGreaterThan(0);
    expect(last().x).toBeLessThan(0.1);
    frames(30);
    expect(last().x).toBeCloseTo(0.1);
  });

  it('ignores touch pointers', async () => {
    await startSource();
    const count = emitted.length;
    pointerMove(1024, 0, 'touch');
    frames(30);
    expect(emitted.length).toBe(count);
  });

  it('setDistance changes z immediately', async () => {
    await startSource();
    pointerMove(1024, 384);
    frames(30);
    source.setDistance(0.9);
    expect(last().z).toBe(0.9);
    expect(last().x).toBeCloseTo(0.1);
    expect(source.getDistance()).toBe(0.9);
  });

  it('eases back to center when the pointer leaves the window', async () => {
    await startSource({ easeMs: 400 });
    pointerMove(1024, 384);
    frames(30);
    pointerLeaveWindow();
    frames(5);
    const midway = last().x;
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(0.1);
    frames(30);
    expect(last().x).toBeCloseTo(0);
    expect(last().y).toBeCloseTo(0);
  });

  it('holds position on leave when restOnLeave is false', async () => {
    await startSource({ restOnLeave: false });
    pointerMove(1024, 384);
    frames(30);
    pointerLeaveWindow();
    frames(30);
    expect(last().x).toBeCloseTo(0.1);
  });

  it('eases in again on re-entry after leaving', async () => {
    await startSource();
    pointerMove(512, 384);
    frames(30);
    pointerLeaveWindow();
    frames(30);
    pointerMove(0, 384); // re-enters at the left edge
    expect(last().x).toBeCloseTo(0);
    frames(30);
    expect(last().x).toBeCloseTo(-0.1);
  });

  it('stops listening after stop()', async () => {
    await startSource();
    source.stop();
    const count = emitted.length;
    pointerMove(100, 100);
    frames(30);
    expect(emitted.length).toBe(count);
  });
});

describe('PointerSource defaults', () => {
  it('uses range 0.75 and distance 0.6', () => {
    const source = new PointerSource();
    source.updateScreen({ widthMeters: 0.4, heightMeters: 0.3 });
    const edge = source.toEyePosition({ x: 1, y: 0 });
    expect(edge.x).toBeCloseTo(0.15);
    expect(edge.z).toBe(0.6);
  });
});
