import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        three: resolve(__dirname, 'src/three.ts'),
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'three',
        /^three\//,
        '@mediapipe/tasks-vision',
      ],
    },
  },
});
