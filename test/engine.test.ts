import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxEngine } from '../src/core/ParallaxEngine';
import { FaceSource } from '../src/sources/FaceSource';
import type { EyePosition } from '../src/tracking/types';
import { ManualSource, distance, fakeAdapter, frames, useFrameTimers } from './helpers';

const screen = { widthMeters: 0.4, heightMeters: 0.3 };

describe('ParallaxEngine sources', () => {
  let adapter: ReturnType<typeof fakeAdapter>;
  let tracked: EyePosition[];
  let lostCalls: number;
  const last = () => tracked[tracked.length - 1];

  beforeEach(() => {
    useFrameTimers();
    adapter = fakeAdapter();
    tracked = [];
    lostCalls = 0;
  });

  afterEach(() => vi.useRealTimers());

  function makeEngine(source: ManualSource, extra = {}) {
    return new ParallaxEngine({
      adapter: adapter as never,
      screen,
      source,
      onTrack: (p) => tracked.push(p),
      onTrackingLost: () => lostCalls++,
      ...extra,
    });
  }

  it('defaults to a FaceSource when no source is given', () => {
    const engine = new ParallaxEngine({ adapter: adapter as never, screen });
    expect(engine.getSource()).toBeInstanceOf(FaceSource);
    expect(engine.getSmoothingType()).toBe('one-euro');
  });

  it('passes positions straight through while tracking steadily', async () => {
    const source = new ManualSource();
    const engine = makeEngine(source);
    await engine.start();
    source.emit!({ x: 0.01, y: 0.02, z: 0.5 });
    source.emit!({ x: 0.03, y: 0.02, z: 0.5 });
    expect(tracked).toEqual([{ x: 0.01, y: 0.02, z: 0.5 }, { x: 0.03, y: 0.02, z: 0.5 }]);
    expect(adapter.update).toHaveBeenCalledTimes(2);
  });

  it('still applies the eye offset and calibration pause', async () => {
    const source = new ManualSource();
    const engine = makeEngine(source);
    await engine.start();
    engine.setEyeOffset({ x: 0.01, y: -0.01, z: 0 });
    source.emit!({ x: 0.05, y: 0.05, z: 0.5 });
    expect(last()).toEqual({ x: 0.04, y: 0.060000000000000005, z: 0.5 });
    expect(engine.getRawEyePosition()).toEqual({ x: 0.05, y: 0.05, z: 0.5 });
    engine.pauseAdapterUpdates();
    source.emit!({ x: 0, y: 0, z: 0.5 });
    expect(adapter.update).toHaveBeenCalledTimes(1);
  });

  it('blends between sources without a discontinuity', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    const engine = makeEngine(a, { blendMs: 500 });
    await engine.start();
    const fromA = { x: 0.1, y: 0.05, z: 0.6 };
    a.emit!(fromA);

    const switching = engine.setSource(b);
    await switching;
    expect(engine.getSource()).toBe(b);
    expect(a.destroyed).toBe(1);

    const toB = { x: -0.1, y: -0.05, z: 0.5 };
    b.emit!(toB);
    // Several frames into the blend, positions move in small steps
    const before = tracked.length;
    frames(40);
    const blend = [fromA, ...tracked.slice(before)];
    // A jump would be the whole 0.245 m at once. Ease-in-out cubic peaks at
    // 1.5x the average speed; allow two frames per sample for timer jitter.
    const maxStep = distance(fromA, toB) * 1.5 * (2 * 16 / 500);
    for (let i = 1; i < blend.length; i++) {
      expect(distance(blend[i], blend[i - 1])).toBeLessThan(maxStep);
    }
    expect(distance(blend[1], fromA)).toBeLessThan(0.002);
    expect(last()).toEqual(toB);

    // After the blend, B passes straight through
    b.emit!({ x: 0, y: 0, z: 0.5 });
    expect(last()).toEqual({ x: 0, y: 0, z: 0.5 });
  });

  it('keeps the old source driving while the new one starts', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    b.deferStart = true;
    const engine = makeEngine(a);
    await engine.start();
    a.emit!({ x: 0.1, y: 0, z: 0.6 });

    const switching = engine.setSource(b);
    a.emit!({ x: 0.08, y: 0, z: 0.6 });
    expect(last()).toEqual({ x: 0.08, y: 0, z: 0.6 });
    expect(engine.getSource()).toBe(a);

    b.finishStart();
    await switching;
    expect(engine.getSource()).toBe(b);
    // A is destroyed and ignored from now on
    a.emit!({ x: 1, y: 1, z: 1 });
    frames(5);
    expect(last().x).toBeLessThan(0.1);
  });

  it('keeps the current source if the new one fails to start', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    b.failWith = new Error('Permission denied');
    const engine = makeEngine(a);
    await engine.start();
    await expect(engine.setSource(b)).rejects.toThrow('Permission denied');
    expect(engine.getSource()).toBe(a);
    expect(a.destroyed).toBe(0);
    a.emit!({ x: 0.02, y: 0, z: 0.6 });
    expect(last()).toEqual({ x: 0.02, y: 0, z: 0.6 });
  });

  it('discards a pending source superseded by a newer setSource', async () => {
    const a = new ManualSource();
    const slow = new ManualSource();
    slow.deferStart = true;
    const fast = new ManualSource();
    const engine = makeEngine(a);
    await engine.start();
    const first = engine.setSource(slow);
    await engine.setSource(fast);
    slow.finishStart();
    await first;
    expect(engine.getSource()).toBe(fast);
    expect(slow.destroyed).toBe(1);
  });

  it('swaps without starting when the engine is not running', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    const engine = makeEngine(a);
    await engine.setSource(b);
    expect(b.started).toBe(0);
    expect(engine.getSource()).toBe(b);
    await engine.start();
    expect(b.started).toBe(1);
  });

  it('holds the current view on lost and reports it right away', async () => {
    const source = new ManualSource();
    const engine = makeEngine(source);
    await engine.start();
    const pos = { x: 0.1, y: 0.1, z: 0.4 };
    source.emit!(pos);
    source.lose!();
    expect(lostCalls).toBe(1);
    const count = tracked.length;
    frames(40);
    source.lose!();
    expect(lostCalls).toBe(2);
    expect(tracked.length).toBe(count);
    expect(engine.getEyePosition()).toEqual(pos);
  });

  it('blends from the held view when tracking is reacquired', async () => {
    const source = new ManualSource();
    const engine = makeEngine(source, { blendMs: 500 });
    await engine.start();
    const held = { x: 0.1, y: 0, z: 0.6 };
    source.emit!(held);
    source.lose!();
    frames(10);
    const elsewhere = { x: -0.1, y: 0.05, z: 0.5 };
    source.emit!(elsewhere);
    expect(last()).toEqual(held);
    frames(2);
    expect(distance(last(), held)).toBeLessThan(0.01);
    frames(40);
    expect(last()).toEqual(elsewhere);
  });

  it('freezes a blend in progress if the new source loses tracking', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    const engine = makeEngine(a, { blendMs: 500 });
    await engine.start();
    a.emit!({ x: 0.1, y: 0, z: 0.6 });
    await engine.setSource(b);
    b.emit!({ x: -0.1, y: 0, z: 0.6 });
    frames(15);
    b.lose!();
    const frozen = last();
    expect(frozen.x).toBeLessThan(0.1);
    expect(frozen.x).toBeGreaterThan(-0.1);
    frames(40);
    expect(last()).toEqual(frozen);
  });

  it('holds until a newly switched-in source reports', async () => {
    const a = new ManualSource();
    const b = new ManualSource();
    const engine = makeEngine(a);
    await engine.start();
    a.emit!({ x: 0.1, y: 0, z: 0.6 });
    await engine.setSource(b);
    const count = tracked.length;
    frames(40);
    expect(tracked.length).toBe(count);
    b.emit!({ x: 0, y: 0, z: 0.6 });
    frames(1);
    expect(last().x).toBeGreaterThan(0.09);
  });

  it('forwards losses immediately if nothing was ever tracked (v0.2)', async () => {
    const source = new ManualSource();
    const engine = makeEngine(source);
    await engine.start();
    source.lose!();
    expect(lostCalls).toBe(1);
    expect(tracked).toEqual([]);
  });

  it('passes the screen to sources that want it', async () => {
    const source = new ManualSource() as ManualSource & { updateScreen: ReturnType<typeof vi.fn> };
    source.updateScreen = vi.fn();
    const engine = makeEngine(source);
    await engine.start();
    expect(source.updateScreen).toHaveBeenCalledWith(screen);
    engine.updateScreen({ widthMeters: 0.5 });
    expect(source.updateScreen).toHaveBeenLastCalledWith({ widthMeters: 0.5, heightMeters: 0.3 });
  });
});

describe('CSSAdapter', () => {
  it('adds the scroll offset to the perspective origin', async () => {
    const { CSSAdapter } = await import('../src/adapters/CSSAdapter');
    const container = document.createElement('div');
    Object.defineProperty(container, 'offsetWidth', { value: 1000 });
    const adapter = new CSSAdapter({ container, screen: { widthMeters: 0.5, heightMeters: 0.3 } });
    const eye = { x: 0, y: 0, z: 0.6 };
    adapter.update(eye);
    expect(container.style.perspectiveOrigin).toBe(`500px ${768 / 2}px`);
    adapter.setScrollOffsetY(200);
    adapter.update(eye);
    expect(container.style.perspectiveOrigin).toBe(`500px ${768 / 2 + 200}px`);
  });
});
