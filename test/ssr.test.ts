// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Fails the test if anything loads MediaPipe at import or construction time
vi.mock('@mediapipe/tasks-vision', () => {
  throw new Error('@mediapipe/tasks-vision was loaded');
});

describe('SSR safety', () => {
  it('runs without DOM globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it.each(['index', 'three', 'react'])('imports src/%s.ts under Node', async (entry) => {
    const mod = await import(`../src/${entry}.ts`);
    expect(mod.ParallaxEngine).toBeTypeOf('function');
  });

  it('constructs the engine and sources without touching the DOM', async () => {
    const { ParallaxEngine, FaceSource } = await import('../src/index');
    const adapter = { update: vi.fn(), updateScreen: vi.fn() };
    const engine = new ParallaxEngine({ adapter: adapter as never });
    expect(engine.getSource()).toBeInstanceOf(FaceSource);
    new FaceSource();
  });
});
