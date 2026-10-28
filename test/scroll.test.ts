import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollSource } from '../src/sources/ScrollSource';
import type { EyePosition } from '../src/tracking/types';
import { frames, useFrameTimers } from './helpers';

const screen = { widthMeters: 0.4, heightMeters: 0.3 };

/** jsdom has no layout, so fake a scroll container's dimensions */
function scroller(scrollHeight: number, clientHeight: number, scrollTop = 0): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight });
  el.scrollTop = scrollTop;
  return el;
}

function scrollTo(el: HTMLElement, top: number): void {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
}

describe('ScrollSource', () => {
  let source: ScrollSource;
  let emitted: EyePosition[];
  const last = () => emitted[emitted.length - 1];

  beforeEach(() => {
    useFrameTimers();
    emitted = [];
  });

  afterEach(() => {
    source?.destroy();
    vi.useRealTimers();
  });

  async function startWith(element: HTMLElement | null, config = {}) {
    source = new ScrollSource({ element, range: 0.5, ...config });
    source.updateScreen(screen);
    await source.start((p) => emitted.push(p));
  }

  it('maps the top, middle and bottom of the scroll range to eye height', async () => {
    const el = scroller(2000, 1000);
    await startWith(el);
    // Top: eye raised by half the half-height (0.15 m) = 0.075 m
    expect(last()).toEqual({ x: 0, y: 0.075, z: 0.6 });
    scrollTo(el, 500);
    expect(last()).toEqual({ x: 0, y: 0, z: 0.6 });
    scrollTo(el, 1000);
    expect(last().y).toBeCloseTo(-0.075);
  });

  it('starts from the current scroll position', async () => {
    await startWith(scroller(2000, 1000, 1000));
    expect(last().y).toBeCloseTo(-0.075);
  });

  it('centers content that does not scroll, and no element at all', async () => {
    await startWith(scroller(800, 1000));
    expect(last()).toEqual({ x: 0, y: 0, z: 0.6 });
    source.destroy();
    await startWith(null);
    expect(last()).toEqual({ x: 0, y: 0, z: 0.6 });
  });

  it('eases to a new element instead of jumping', async () => {
    const first = scroller(2000, 1000, 0);
    const second = scroller(2000, 1000, 1000);
    await startWith(first);
    source.setElement(second);
    frames(5);
    expect(last().y).toBeLessThan(0.075);
    expect(last().y).toBeGreaterThan(-0.075);
    frames(30);
    expect(last().y).toBeCloseTo(-0.075);
    // Old element no longer drives it
    const count = emitted.length;
    scrollTo(first, 500);
    expect(emitted.length).toBe(count);
    scrollTo(second, 500);
    expect(last().y).toBeCloseTo(0);
  });

  it('setDistance changes z immediately', async () => {
    await startWith(scroller(2000, 1000));
    source.setDistance(0.8);
    expect(last()).toEqual({ x: 0, y: 0.075, z: 0.8 });
  });

  it('stops listening after stop()', async () => {
    const el = scroller(2000, 1000);
    await startWith(el);
    source.stop();
    const count = emitted.length;
    scrollTo(el, 1000);
    expect(emitted.length).toBe(count);
  });
});
