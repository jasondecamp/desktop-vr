import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useRef, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useParallaxCSS, useParallaxEngine, type UseParallaxReturn } from '../src/react';
import type { EyeSource } from '../src/sources/types';
import { PointerSource } from '../src/sources/PointerSource';
import { ScrollSource } from '../src/sources/ScrollSource';
import { OrientationSource } from '../src/sources/OrientationSource';
import { FaceSource } from '../src/sources/FaceSource';
import { ManualSource, fakeAdapter } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function renderCSSHook(options: Parameters<typeof useParallaxCSS>[1], strict = false) {
  const result: { current: UseParallaxReturn | null } = { current: null };
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    result.current = useParallaxCSS(ref, options);
    return createElement('div', { ref });
  }
  const container = document.createElement('div');
  root = createRoot(container);
  const tree = createElement(Probe);
  act(() => root!.render(strict ? createElement(StrictMode, null, tree) : tree));
  return result;
}

/** A source that reports itself as started and records calls */
function spied<T extends EyeSource>(source: T): T {
  vi.spyOn(source, 'start').mockResolvedValue(undefined);
  vi.spyOn(source, 'destroy');
  return source;
}

describe('useParallaxCSS', () => {
  it.each([
    ['pointer', () => new PointerSource()],
    ['scroll', () => new ScrollSource()],
  ])('auto-starts a %s source on mount', async (_, make) => {
    const source = spied(make());
    renderCSSHook({ source });
    await act(async () => {});
    expect(source.start).toHaveBeenCalledOnce();
  });

  it.each([
    ['camera', () => new FaceSource()],
    ['tilt', () => new OrientationSource()],
  ])('does not auto-start a %s source', async (_, make) => {
    const source = spied(make());
    const hook = renderCSSHook({ source });
    await act(async () => {});
    expect(source.start).not.toHaveBeenCalled();
    await act(() => hook.current!.start());
    expect(source.start).toHaveBeenCalledOnce();
    expect(hook.current!.tracking).toBe(true);
  });

  it('honors an explicit autoStart', async () => {
    const source = spied(new PointerSource());
    renderCSSHook({ source, autoStart: false });
    await act(async () => {});
    expect(source.start).not.toHaveBeenCalled();
  });

  it('setSource switches the running engine to the new source', async () => {
    const pointer = spied(new PointerSource());
    const manual = new ManualSource();
    const hook = renderCSSHook({ source: pointer });
    await act(async () => {});
    await act(() => hook.current!.setSource(manual));
    expect(manual.started).toBe(1);
    expect(hook.current!.engine!.getSource()).toBe(manual);
    expect(pointer.destroy).toHaveBeenCalled();
    act(() => manual.emit!({ x: 0.01, y: 0, z: 0.6 }));
    expect(hook.current!.eyePosition).toEqual({ x: 0.01, y: 0, z: 0.6 });
  });

  it('keeps the switched-to source when the engine is re-created', async () => {
    const pointer = spied(new PointerSource());
    const manual = new ManualSource();
    let sensitivity = 1;
    const result: { current: UseParallaxReturn | null } = { current: null };
    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      result.current = useParallaxCSS(ref, { source: pointer, sensitivity });
      return createElement('div', { ref });
    }
    root = createRoot(document.createElement('div'));
    act(() => root!.render(createElement(Probe)));
    await act(async () => {});
    await act(() => result.current!.setSource(manual));
    const firstEngine = result.current!.engine;

    sensitivity = 2; // a dependency change re-creates the engine
    act(() => root!.render(createElement(Probe)));
    await act(async () => {});
    act(() => root!.render(createElement(Probe))); // pick up the new engine ref
    expect(result.current!.engine).not.toBe(firstEngine);
    expect(result.current!.engine!.getSource()).toBe(manual);
    expect(manual.started).toBe(2);
  });

  it('survives StrictMode double-mounting', async () => {
    const source = spied(new PointerSource());
    const hook = renderCSSHook({ source }, true);
    await act(async () => {});
    expect(hook.current!.engine!.getSource()).toBe(source);
    expect(hook.current!.tracking).toBe(true);
  });
});

describe('useParallaxEngine', () => {
  it('passes the source through and auto-starts a pointer source', async () => {
    const adapter = fakeAdapter();
    const source = spied(new PointerSource());
    const result: { current: UseParallaxReturn | null } = { current: null };
    function Probe() {
      result.current = useParallaxEngine({ adapter: adapter as never, source });
      return null;
    }
    root = createRoot(document.createElement('div'));
    act(() => root!.render(createElement(Probe)));
    await act(async () => {});
    expect(source.start).toHaveBeenCalledOnce();
    expect(result.current!.engine!.getSource()).toBe(source);
    expect(result.current!.tracking).toBe(true);
  });
});
