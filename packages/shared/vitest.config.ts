import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Concurrent agent runs share one 8-core machine — see packages/web/vitest.config.ts
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
