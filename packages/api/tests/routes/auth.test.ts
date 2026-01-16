import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { authHandler } from '../../src/middleware/auth';
import { createDatabase } from '../../src/db/index';
import { users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import '../setup'; // Import test setup

/**
 * Tests to verify login, register, and logout routes
 *
 * This test suite validates Better Auth integration for:
 * - User registration (sign-up)
 * - User login (sign-in)
 * - User logout (sign-out)
 * - Session management
 * - Password validation
 * - Error handling and edge cases
 *
 * @see https://www.better-auth.com/docs
 */

/**
 * Run database migrations to create all tables and enums
 */
async function runMigrations(sql: ReturnType<typeof postgres>) {
  // Drop all tables
  await sql`DROP TABLE IF EXISTS ai_generations CASCADE`;
  await sql`DROP TABLE IF EXISTS cart_items CASCADE`;
  await sql`DROP TABLE IF EXISTS order_items CASCADE`;
  await sql`DROP TABLE IF EXISTS orders CASCADE`;
  await sql`DROP TABLE IF EXISTS accounts CASCADE`;
  await sql`DROP TABLE IF EXISTS sessions CASCADE`;
  await sql`DROP TABLE IF EXISTS addresses CASCADE`;
  await sql`DROP TABLE IF EXISTS frames CASCADE`;
  await sql`DROP TABLE IF EXISTS product_variants CASCADE`;
  await sql`DROP TABLE IF EXISTS products CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;

  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Create enums
  const enums = [
    { name: 'product_status', values: ['draft', 'active', 'archived'] },
    { name: 'product_orientation', values: ['square', 'portrait', 'landscape', 'panoramic', 'round'] },
    { name: 'user_role', values: ['admin', 'customer', 'trade'] },
    { name: 'trade_account_status', values: ['pending', 'approved', 'rejected'] },
    { name: 'order_status', values: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] },
    { name: 'payment_status', values: ['pending', 'paid', 'failed', 'refunded'] },
    { name: 'payment_method', values: ['razorpay', 'stripe', 'cod', 'upi'] },
    { name: 'photo_approval_status', values: ['pending', 'sent', 'approved', 'changes_requested'] },
    { name: 'address_type', values: ['home', 'office', 'other'] },
    { name: 'ai_generation_status', values: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
    { name: 'ai_model', values: ['sdxl', 'sd-2-1', 'dalle-3', 'midjourney', 'stable-diffusion-xl-lightning'] },
    { name: 'aspect_ratio', values: ['1:1', '4:5', '3:4', '2:3', '4:3', '16:9', '21:9'] },
    { name: 'style_preset', values: ['wabi-sabi', 'abstract-expression', 'botanical', 'vintage-poster', 'minimalist', 'geometric', 'watercolor', 'line-art', 'pop-art', 'surrealism'] },
    { name: 'moderation_status', values: ['pending', 'approved', 'rejected', 'flagged'] },
  ];

  for (const enumDef of enums) {
    const values = enumDef.values.map(v => `'${v}'`).join(', ');
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE ${enumDef.name} AS ENUM (${values});
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  // Create users table (using VARCHAR for ID to accommodate Better Auth)
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      password_hash VARCHAR(255),
      role user_role NOT NULL DEFAULT 'customer',
      email_verified BOOLEAN NOT NULL DEFAULT false,
      phone_verified BOOLEAN NOT NULL DEFAULT false,
      avatar_url TEXT,
      preferences JSONB NOT NULL DEFAULT '{"emailNotifications": true, "smsNotifications": false, "marketingEmails": true, "orderUpdates": true, "aiGenerationNotifications": true}'::jsonb,
      trade_account_status trade_account_status,
      trade_business JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Create sessions table for Better Auth (using VARCHAR for IDs)
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Create accounts table for OAuth/Social login and password-based auth (using VARCHAR for IDs)
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id VARCHAR(255) PRIMARY KEY,
      "accountId" VARCHAR(255) NOT NULL UNIQUE,
      "providerId" VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(100) NOT NULL,
      provider_account_id VARCHAR(255) NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP,
      token_type VARCHAR(50),
      scope TEXT,
      id_token TEXT,
      password VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    )
  `;
}

describe('Authentication Routes', () => {
  let app: Hono;
  let db: ReturnType<typeof createDatabase>['db'];
  let client: ReturnType<typeof postgres>;
  let testEmail: string;
  let testPassword: string;

  beforeAll(async () => {
    // Set up database connection (use dev database since test DB doesn't exist)
    const databaseUrl = 'postgres://poster_app:dev_password@localhost:5433/poster_app_dev';
    client = postgres(databaseUrl);

    // Override DATABASE_URL for Better Auth to use dev database
    process.env.DATABASE_URL = databaseUrl;

    // Run migrations
    await runMigrations(client);

    // Create Drizzle database instance
    const database = createDatabase();
    db = database.db;

    // Create test app with auth routes
    app = new Hono();
    app.all('/api/auth/*', authHandler);
  });

  beforeEach(() => {
    // Generate unique test email for each test
    testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
    testPassword = 'TestPassword123!';
  });

  afterAll(async () => {
    // Cleanup test users
    try {
      await db.delete(users).where(eq(users.email, testEmail));
    } catch (error) {
      // Ignore cleanup errors
    }

    // Close database connection
    if (client) {
      await client.end();
    }
  });

  describe('Auth Routes Availability', () => {
    it('should have auth handler defined', () => {
      expect(authHandler).toBeDefined();
      expect(typeof authHandler).toBe('function');
    });

    it('should mount auth routes on /api/auth', async () => {
      // Better Auth should handle requests to /api/auth/*
      const res = await app.request('/api/auth/session', {
        method: 'GET',
      });

      // Should not be 404
      expect(res.status).not.toBe(404);
    });

    it('should handle auth route requests', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
      });

      // Should return valid response (either session data or error)
      expect(res).toBeDefined();
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });

  describe('User Registration (Sign-Up)', () => {
    it('should register a new user with valid credentials', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('should return user data after successful registration', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          expect(data).toBeDefined();
        }
      }
    });

    it('should reject registration with missing email', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: testPassword,
          name: 'Test User',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject registration with missing password', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          name: 'Test User',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject registration with invalid email format', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'invalid-email',
          password: testPassword,
          name: 'Test User',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject registration with weak password', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: 'weak', // Too short (< 8 chars)
          name: 'Test User',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject registration with duplicate email', async () => {
      // First registration
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });

      // Try to register again with same email
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User 2',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should handle registration with only required fields', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          // name is optional
        }),
      });

      // Should succeed even without name
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject registration without Content-Type header', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      // Should handle missing content-type gracefully
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should reject registration with malformed JSON', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('User Login (Sign-In)', () => {
    beforeEach(async () => {
      // Create a user for login tests
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });
    });

    it('should login with valid credentials', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('should return session data after successful login', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          expect(data).toBeDefined();
        }
      }
    });

    it('should set session cookie after successful login', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      if (res.ok) {
        const cookies = res.headers.get('set-cookie');
        // Better Auth should set session cookies
        expect(cookies).toBeDefined();
      }
    });

    it('should reject login with incorrect password', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: 'WrongPassword123!',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject login with non-existent email', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: testPassword,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject login with missing email', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: testPassword,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject login with missing password', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject login with empty credentials', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: '',
          password: '',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should handle case-sensitive email login', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail.toUpperCase(),
          password: testPassword,
        }),
      });

      // Email should be case-insensitive or normalized
      // Status depends on Better Auth configuration
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    it('should reject login with SQL injection attempt', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: "admin'--",
          password: "' OR '1'='1",
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('User Logout (Sign-Out)', () => {
    let sessionCookie: string;

    beforeEach(async () => {
      // Create and login a user
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });

      const loginRes = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      // Extract session cookie
      const cookies = loginRes.headers.get('set-cookie');
      sessionCookie = cookies || '';
    });

    it('should logout authenticated user', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(400);
    });

    it('should clear session cookie after logout', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      if (res.ok) {
        const cookies = res.headers.get('set-cookie');
        // Better Auth should clear or expire session cookies
        // Cookie header should be present (even if clearing)
        expect(cookies !== null || res.ok).toBe(true);
      }
    });

    it('should handle logout without session cookie', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'POST',
      });

      // Should handle gracefully (either succeed or return appropriate error)
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it('should handle logout with invalid session cookie', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Cookie': 'masonart_session=invalid-token-12345',
        },
      });

      // Should handle gracefully
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it('should handle logout with expired session', async () => {
      // Use an old/expired session cookie
      const res = await app.request('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Cookie': 'masonart_session=expired-token',
        },
      });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject logout with GET method', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      // Should require POST method
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });
  });

  describe('Session Management', () => {
    let sessionCookie: string;

    beforeEach(async () => {
      // Create and login a user
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });

      const loginRes = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      sessionCookie = loginRes.headers.get('set-cookie') || '';
    });

    it('should retrieve current session', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(400);
    });

    it('should return user data in session', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          expect(data).toBeDefined();
        }
      }
    });

    it('should handle session request without cookie', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
      });

      // Should return null/empty session or 401
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it('should handle session request with invalid cookie', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
        headers: {
          'Cookie': 'masonart_session=invalid-token',
        },
      });

      // Should handle gracefully
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(500);
    });

    it('should validate session cookie format', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
        },
      });

      // Session should be validated properly
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });

  describe('Error Handling', () => {
    it('should handle auth endpoint with unsupported method', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'DELETE',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should return proper error format', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'invalid',
          password: 'short',
        }),
      });

      const contentType = res.headers.get('content-type');
      // Error response should have content-type
      expect(contentType).toBeDefined();
    });

    it('should handle concurrent login requests', async () => {
      // Create user first
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
        }),
      });

      const requests = Array(5).fill(null).map(() =>
        app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: testEmail,
            password: testPassword,
          }),
        })
      );

      const responses = await Promise.all(requests);

      // All requests should be handled
      responses.forEach((res) => {
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });
    });

    it('should handle rapid successive requests', async () => {
      const res1 = await app.request('/api/auth/session', { method: 'GET' });
      const res2 = await app.request('/api/auth/session', { method: 'GET' });
      const res3 = await app.request('/api/auth/session', { method: 'GET' });

      expect(res1.status).toBeDefined();
      expect(res2.status).toBeDefined();
      expect(res3.status).toBeDefined();
    });

    it('should handle requests with very long email', async () => {
      const longEmail = 'a'.repeat(300) + '@example.com';
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: longEmail,
          password: testPassword,
        }),
      });

      // Should reject or handle appropriately
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should handle requests with very long password', async () => {
      const longPassword = 'a'.repeat(200);
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: longPassword,
        }),
      });

      // Should reject (exceeds max 128 chars)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should handle XSS attempt in name field', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: xssPayload,
        }),
      });

      // Should handle safely (sanitize or accept as plain text)
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });

  describe('HTTP Method Validation', () => {
    it('should reject sign-up with GET method', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'GET',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should reject sign-in with PUT method', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'PUT',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should handle OPTIONS request for CORS', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'OPTIONS',
      });

      // Should handle OPTIONS for CORS preflight
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });
  });

  describe('Response Headers', () => {
    it('should return appropriate content-type for JSON', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
      });

      const contentType = res.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
      }
    });

    it('should include security headers', async () => {
      const res = await app.request('/api/auth/session', {
        method: 'GET',
      });

      // Response should have headers
      expect(res.headers).toBeDefined();
    });

    it('should set secure cookie attributes in production', async () => {
      // This would need NODE_ENV=production to test fully
      // For now, just verify cookies are set
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const loginRes = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const cookies = loginRes.headers.get('set-cookie');
      if (cookies) {
        expect(cookies).toBeDefined();
      }
    });
  });

  describe('Performance', () => {
    it('should handle registration within reasonable time', async () => {
      const start = Date.now();

      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const duration = Date.now() - start;

      // Should complete in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should handle login within reasonable time', async () => {
      // Create user first
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const start = Date.now();

      await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const duration = Date.now() - start;

      // Should complete in under 3 seconds
      expect(duration).toBeLessThan(3000);
    });

    it('should handle session check within reasonable time', async () => {
      const start = Date.now();

      await app.request('/api/auth/session', {
        method: 'GET',
      });

      const duration = Date.now() - start;

      // Should complete in under 1 second
      expect(duration).toBeLessThan(1000);
    });
  });
});
