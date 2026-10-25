import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite config for building the demo site (deployed to Vercel).
 * Builds the examples as a multi-page app instead of a library bundle.
 */
export default defineConfig({
  build: {
    outDir: 'dist-site',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, 'examples/three-demo/index.html'),
        css: resolve(__dirname, 'examples/css-demo/index.html'),
        uicontrols: resolve(__dirname, 'examples/ui-controls-demo/index.html'),
      },
    },
  },
  server: {
    https: false,
    open: '/examples/three-demo/index.html',
  },
});
