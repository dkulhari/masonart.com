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
    // Type-level suites, run by `bun run test:types` rather than the default
    // run. tsconfig.json covers app/** only, so a `@ts-expect-error` sitting
    // in tests/ is checked by nothing without this (#576).
    typecheck: {
      include: ['tests/**/*.test-d.ts'],
      // Without this the runner reuses tsconfig.json, which scopes the project
      // to app/** — test files then get no diagnostics whatsoever and the run
      // reports "no errors" no matter what is in them.
      tsconfig: './tsconfig.typecheck.json',
      // app/** already carries pre-existing unused-symbol errors that
      // `bun run typecheck` reports; repeating them here would drown the
      // assertions this run exists to make.
      ignoreSourceErrors: true,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './app'),
    },
  },
});
