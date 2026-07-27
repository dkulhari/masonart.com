import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      // Respect externally-set URLs (alt ports, CI) instead of clobbering
      // them — the hardcoded dev URL here is what let destructive suites
      // reach the real dev database (#332).
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://poster_app:dev_password@localhost:5433/poster_app_dev',
      // Destructive suites (tests/database/) only run when this points at a
      // *_test database — see tests/helpers/destructive-db.ts (#332).
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || '',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6380',
      BETTER_AUTH_SECRET: 'test-secret-key-minimum-32-characters-long-for-testing',
      PORT: '3000',
      CORS_ORIGIN: 'http://localhost:3001',
      // Storage (R2/S3) configuration for tests
      R2_ENDPOINT: 'http://localhost:9000',
      R2_ACCESS_KEY: 'test-access-key',
      R2_SECRET_KEY: 'test-secret-key',
      R2_BUCKET: 'poster-app-test',
      CDN_URL: 'https://cdn.test.example.com',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
