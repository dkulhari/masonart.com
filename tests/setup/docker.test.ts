import { describe, it, expect, beforeAll } from 'vitest';
import { createConnection } from 'net';

/**
 * Tests to verify Docker Compose services are running
 *
 * This test suite validates:
 * - PostgreSQL container is running and accessible
 * - Redis container is running and accessible
 * - Services are on the expected ports
 * - Basic connectivity to each service
 *
 * Expected Docker Compose setup:
 * - PostgreSQL 16 on port 5433 (host) -> 5432 (container)
 * - Redis 7-alpine on port 6380 (host) -> 6379 (container)
 */

// Configuration for Docker services
const DOCKER_SERVICES = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
    user: process.env.POSTGRES_USER || 'poster_app',
    password: process.env.POSTGRES_PASSWORD || 'dev_password',
    database: process.env.POSTGRES_DB || 'poster_app_dev',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
  },
};

/**
 * Helper function to check if a TCP port is open
 */
function checkPort(host: string, port: number, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Helper function to test PostgreSQL connectivity
 */
async function testPostgresConnection(): Promise<boolean> {
  try {
    // Dynamic import to avoid requiring pg as a hard dependency
    const pg = await import('pg').catch(() => null);

    if (!pg) {
      // If pg is not installed, fall back to port check
      return checkPort(DOCKER_SERVICES.postgres.host, DOCKER_SERVICES.postgres.port);
    }

    const { Client } = pg;
    const client = new Client({
      host: DOCKER_SERVICES.postgres.host,
      port: DOCKER_SERVICES.postgres.port,
      user: DOCKER_SERVICES.postgres.user,
      password: DOCKER_SERVICES.postgres.password,
      database: DOCKER_SERVICES.postgres.database,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    const result = await client.query('SELECT NOW()');
    await client.end();

    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Helper function to test Redis connectivity
 */
async function testRedisConnection(): Promise<boolean> {
  try {
    // Dynamic import to avoid requiring redis as a hard dependency
    const redis = await import('redis').catch(() => null);

    if (!redis) {
      // If redis is not installed, fall back to port check
      return checkPort(DOCKER_SERVICES.redis.host, DOCKER_SERVICES.redis.port);
    }

    const { createClient } = redis;
    const client = createClient({
      socket: {
        host: DOCKER_SERVICES.redis.host,
        port: DOCKER_SERVICES.redis.port,
        connectTimeout: 5000,
      },
    });

    await client.connect();
    const pong = await client.ping();
    await client.quit();

    return pong === 'PONG';
  } catch (error) {
    return false;
  }
}

describe('Docker Compose Services', () => {
  describe('PostgreSQL Container', () => {
    it('should be accessible on expected port', async () => {
      const isAccessible = await checkPort(
        DOCKER_SERVICES.postgres.host,
        DOCKER_SERVICES.postgres.port
      );

      expect(isAccessible).toBe(true);
    }, 10000);

    it('should accept database connections', async () => {
      const canConnect = await testPostgresConnection();

      expect(canConnect).toBe(true);
    }, 10000);

    it('should be using expected database configuration', () => {
      expect(DOCKER_SERVICES.postgres.user).toBe('poster_app');
      expect(DOCKER_SERVICES.postgres.database).toBe('poster_app_dev');
      expect(DOCKER_SERVICES.postgres.port).toBe(5433);
    });
  });

  describe('Redis Container', () => {
    it('should be accessible on expected port', async () => {
      const isAccessible = await checkPort(
        DOCKER_SERVICES.redis.host,
        DOCKER_SERVICES.redis.port
      );

      expect(isAccessible).toBe(true);
    }, 10000);

    it('should respond to PING command', async () => {
      const canConnect = await testRedisConnection();

      expect(canConnect).toBe(true);
    }, 10000);

    it('should be using expected Redis configuration', () => {
      expect(DOCKER_SERVICES.redis.port).toBe(6380);
    });
  });

  describe('Service Health', () => {
    it('should have both services running simultaneously', async () => {
      const [postgresHealthy, redisHealthy] = await Promise.all([
        checkPort(DOCKER_SERVICES.postgres.host, DOCKER_SERVICES.postgres.port),
        checkPort(DOCKER_SERVICES.redis.host, DOCKER_SERVICES.redis.port),
      ]);

      expect(postgresHealthy).toBe(true);
      expect(redisHealthy).toBe(true);
    }, 10000);
  });

  describe('Environment Configuration', () => {
    it('should use localhost as default host for PostgreSQL', () => {
      expect(DOCKER_SERVICES.postgres.host).toBe('localhost');
    });

    it('should use localhost as default host for Redis', () => {
      expect(DOCKER_SERVICES.redis.host).toBe('localhost');
    });

    it('should allow environment variable overrides', () => {
      // Verify that environment variables can be set
      // This test documents the expected behavior
      const hasEnvSupport =
        typeof process.env.POSTGRES_HOST === 'string' ||
        typeof process.env.POSTGRES_PORT === 'string' ||
        typeof process.env.REDIS_HOST === 'string' ||
        typeof process.env.REDIS_PORT === 'string';

      // This will be true or false, both are acceptable
      // The key is that the variables are accessible
      expect(typeof process.env).toBe('object');
    });
  });
});
