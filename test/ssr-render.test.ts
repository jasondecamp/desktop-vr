// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createElement, useRef } from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('@mediapipe/tasks-vision', () => {
  throw new Error('@mediapipe/tasks-vision was loaded');
});

describe('server rendering', () => {
  it('renders a component using useParallaxCSS with each source', async () => {
    const { useParallaxCSS, PointerSource, ScrollSource, FaceSource } = await import('../src/react');
    for (const make of [() => new PointerSource(), () => new ScrollSource(), () => new FaceSource(), () => undefined]) {
      function Page() {
        const ref = useRef<HTMLDivElement>(null);
        const { tracking } = useParallaxCSS(ref, { source: make() });
        return createElement('div', { ref }, tracking ? 'on' : 'off');
      }
      expect(renderToString(createElement(Page))).toBe('<div>off</div>');
    }
  });
});
