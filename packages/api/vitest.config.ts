import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://poster_app:dev_password@localhost:5433/poster_app_test',
      REDIS_URL: 'redis://localhost:6380',
      BETTER_AUTH_SECRET: 'test-secret-key-minimum-32-characters-long-for-testing',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:3001',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
