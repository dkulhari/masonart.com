import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    // Several agents run suites concurrently on one 8-core machine; vitest's
    // default (cores - 1) means each run claims the whole box and load average
    // hits the high 50s. Raise with VITEST_MAX_WORKERS for a solo run.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './app'),
    },
  },
});
