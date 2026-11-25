import { defineConfig } from 'vitest/config';

// `--mode plugin` builds the UI embedded in the VST3 / Standalone plugin: no WASM vendor files
// (analysis runs natively there) and a separate output folder.
export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: mode === 'plugin' ? false : 'public',
  build: {
    outDir: mode === 'plugin' ? 'dist-plugin' : 'dist',
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      // Not in the package's exports map; see src/types/effetune-telemetry.d.ts.
      'effetune-telemetry': '/node_modules/@effetune/dsp/dist/telemetry.js',
    },
  },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
