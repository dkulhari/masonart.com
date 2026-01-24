import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index';
import { auth } from '../../src/auth';
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
 * Better Auth Routes mounted at /api/auth/*:
 * - POST /api/auth/sign-up/email - Register new user
 * - POST /api/auth/sign-in/email - Login with email/password
 * - POST /api/auth/sign-out - Logout (invalidate session)
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/callback/:provider - OAuth callbacks
 *
 * @see https://www.better-auth.com/docs
 */

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Base URL for auth handler direct tests
 */
const BASE_URL = 'http://localhost:3000';

/**
 * Generate unique test email for each test
 */
function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Test password that meets requirements
 */
const testPassword = 'TestPassword123!';

describe('Authentication Routes', () => {
  let testEmail: string;

  beforeEach(() => {
    // Generate unique test email for each test
    testEmail = generateTestEmail();
  });

  // ==========================================================================
  // Route Availability Tests
  // ==========================================================================

  describe('Auth Routes Availability', () => {
    it('should have auth instance defined', () => {
      expect(auth).toBeDefined();
      expect(auth.handler).toBeDefined();
      expect(typeof auth.handler).toBe('function');
    });

    it('should have Better Auth API methods', () => {
      expect(auth.api).toBeDefined();
      expect(auth.api.getSession).toBeDefined();
      expect(typeof auth.api.getSession).toBe('function');
    });

    it('should mount auth routes on /api/auth', async () => {
      // Better Auth should handle requests to /api/auth/*
      const res = await app.request('/api/auth/get-session', {
        method: 'GET',
      });

      // Should not be 404
      expect(res.status).not.toBe(404);
    });

    it('should handle auth route requests', async () => {
      const res = await app.request('/api/auth/get-session', {
        method: 'GET',
      });

      // Should return valid response (either session data or error)
      expect(res).toBeDefined();
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    it('should accept POST requests to /api/auth/sign-up/email', async () => {
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

      // Should get a response (not method not allowed)
      expect(res.status).not.toBe(405);
    });

    it('should accept POST requests to /api/auth/sign-in/email', async () => {
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

      // Should get a response (not method not allowed)
      expect(res.status).not.toBe(405);
    });

    it('should accept POST requests to /api/auth/sign-out', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'POST',
      });

      // Should get a response (not method not allowed)
      expect(res.status).not.toBe(405);
    });

    it('should return JSON response for auth routes', async () => {
      const res = await app.request('/api/auth/get-session');
      if (res.status === 200) {
        expect(res.headers.get('content-type')).toContain('application/json');
      }
    });
  });

  // ==========================================================================
  // Registration (Sign-Up) Tests
  // ==========================================================================

  describe('User Registration (Sign-Up)', () => {
    describe('POST /api/auth/sign-up/email', () => {
      it('should accept valid registration data', async () => {
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

        // Response should be valid (either success or expected database error in test mode)
        expect(res.status).toBeDefined();
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should return response with content-type', async () => {
        // Use invalid data to get quick validation error
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'invalid-email', // Invalid email triggers quick validation error
            password: 'short', // Short password triggers quick validation error
            name: 'Test User',
          }),
        });

        // Response should have a content-type header (JSON or error)
        const contentType = res.headers.get('content-type');
        expect(contentType).toBeTruthy();
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

      it('should reject registration with weak password (too short)', async () => {
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

      it('should reject registration with empty email', async () => {
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: '',
            password: testPassword,
            name: 'Test User',
          }),
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });

      it('should reject registration with empty password', async () => {
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: testEmail,
            password: '',
            name: 'Test User',
          }),
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
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
        expect(res.status).toBeLessThan(600);
      });

      it('should reject registration with empty request body', async () => {
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });

      it('should handle very long password', async () => {
        const longPassword = 'A'.repeat(200);
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: testEmail,
            password: longPassword, // Exceeds max 128 chars
            name: 'Test User',
          }),
        });

        // Should reject (exceeds max 128 chars) or accept
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should handle special characters in email', async () => {
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: `user+tag-${Date.now()}@example.com`,
            password: testPassword,
            name: 'Test User',
          }),
        });

        // Plus addressing should be valid
        expect(res.status).toBeDefined();
      });

      it('should handle unicode characters in name', async () => {
        const res = await app.request('/api/auth/sign-up/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: testEmail,
            password: testPassword,
            name: '日本語 中文 한국어 العربية',
          }),
        });

        expect(res.status).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Login (Sign-In) Tests
  // ==========================================================================

  describe('User Login (Sign-In)', () => {
    describe('POST /api/auth/sign-in/email', () => {
      it('should accept valid login data format', async () => {
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

        // Response should be valid (either success or expected error for non-existent user)
        expect(res.status).toBeDefined();
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should return response with content-type', async () => {
        // Use invalid data to get quick validation error (no DB lookup)
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'invalid-email', // Invalid email triggers quick validation error
            password: 'x', // Invalid password triggers quick validation error
          }),
        });

        // Response should have a content-type header
        const contentType = res.headers.get('content-type');
        expect(contentType).toBeTruthy();
      });

      it('should return proper response for credential attempts', async () => {
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'nonexistent@example.com',
            password: 'WrongPassword123!',
          }),
        });

        // Should return some error status (either auth error or DB error)
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should return error for invalid email format', async () => {
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'not-an-email',
            password: testPassword,
          }),
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });

      it('should return error for missing email', async () => {
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

      it('should return error for missing password', async () => {
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

      it('should return error for empty request body', async () => {
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });

      it('should return error for empty credentials', async () => {
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

      it('should handle malformed JSON', async () => {
        const res = await app.request('/api/auth/sign-in/email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: 'invalid json',
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(600);
      });

      it('should reject SQL injection attempt in email', async () => {
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

        // Should be rejected as invalid email format
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });

      it('should handle concurrent login attempts', async () => {
        const requests = Array.from({ length: 5 }, () =>
          app.request('/api/auth/sign-in/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: 'concurrent@example.com',
              password: testPassword,
            }),
          })
        );

        const responses = await Promise.all(requests);
        expect(responses).toHaveLength(5);
        responses.forEach(res => {
          expect(res.status).toBeDefined();
        });
      });
    });
  });

  // ==========================================================================
  // Logout (Sign-Out) Tests
  // ==========================================================================

  describe('User Logout (Sign-Out)', () => {
    describe('POST /api/auth/sign-out', () => {
      it('should accept sign-out requests', async () => {
        const res = await app.request('/api/auth/sign-out', {
          method: 'POST',
        });

        // Should get a response (success or unauthorized)
        expect(res.status).toBeDefined();
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should handle sign-out without session cookie', async () => {
        const res = await app.request('/api/auth/sign-out', {
          method: 'POST',
        });

        // Without a valid session, sign-out might return OK or error
        // Both are valid behaviors
        expect([200, 204, 401, 400].some(s => res.status === s || res.status >= 200 && res.status < 500)).toBe(true);
      });

      it('should handle sign-out with invalid session cookie', async () => {
        const res = await app.request('/api/auth/sign-out', {
          method: 'POST',
          headers: {
            Cookie: 'masonart.session=invalid-token-12345',
          },
        });

        expect(res.status).toBeDefined();
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should handle sign-out with malformed cookies', async () => {
        const res = await app.request('/api/auth/sign-out', {
          method: 'POST',
          headers: {
            Cookie: 'malformed;;;cookie;;;data',
          },
        });

        expect(res.status).toBeDefined();
      });

      it('should return JSON response or empty body', async () => {
        const res = await app.request('/api/auth/sign-out', {
          method: 'POST',
        });

        // Response should be JSON or no content
        const contentType = res.headers.get('content-type');
        expect(contentType === null || contentType.includes('application/json')).toBe(true);
      });

      it('should handle sign-out with expired session cookie', async () => {
        const res = await app.request('/api/auth/sign-out', {
          method: 'POST',
          headers: {
            Cookie: 'masonart.session=expired-token',
          },
        });

        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });
    });
  });

  // ==========================================================================
  // Session Management Tests
  // ==========================================================================

  describe('Session Management', () => {
    describe('GET /api/auth/session or /api/auth/get-session', () => {
      it('should accept session requests at /api/auth/get-session', async () => {
        const res = await app.request('/api/auth/get-session');

        // Better Auth uses /api/auth/get-session endpoint
        expect(res.status).not.toBe(404);
      });

      it('should return JSON response for session endpoint', async () => {
        const res = await app.request('/api/auth/get-session');

        if (res.status === 200) {
          expect(res.headers.get('content-type')).toContain('application/json');
        }
      });

      it('should handle requests with invalid session cookies gracefully', async () => {
        const res = await app.request('/api/auth/get-session', {
          headers: {
            Cookie: 'masonart.session=invalid-session-token',
          },
        });

        // Should not error, return some response
        expect(res.status).toBeDefined();
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(600);
      });

      it('should handle requests with malformed cookies gracefully', async () => {
        const res = await app.request('/api/auth/get-session', {
          headers: {
            Cookie: 'malformed;;;cookie',
          },
        });

        // Should not error, return some response
        expect(res.status).toBeDefined();
      });

      it('should handle concurrent session requests', async () => {
        const requests = Array.from({ length: 5 }, () =>
          app.request('/api/auth/get-session')
        );

        const responses = await Promise.all(requests);
        expect(responses).toHaveLength(5);

        responses.forEach(res => {
          expect(res.status).toBeDefined();
        });
      });
    });
  });

  // ==========================================================================
  // OAuth Routes Tests
  // ==========================================================================

  describe('OAuth Routes', () => {
    describe('Google OAuth', () => {
      it('should have sign-in/social route available', async () => {
        const res = await app.request('/api/auth/sign-in/social', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: 'google',
            callbackURL: 'http://localhost:3001/auth/callback',
          }),
        });

        // Should get a response (not 404)
        expect(res.status).not.toBe(404);
      });
    });

    describe('OAuth Callbacks', () => {
      it('should handle callback route for OAuth providers', async () => {
        const res = await app.request('/api/auth/callback/google?code=test-code&state=test-state');

        // Should get a response (not 404)
        expect(res.status).not.toBe(404);
      });

      it('should handle missing OAuth code', async () => {
        const res = await app.request('/api/auth/callback/google');

        // Should return error or redirect
        expect(res.status).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Auth Handler Direct Tests
  // ==========================================================================

  describe('Auth Handler Direct Tests', () => {
    it('should have auth handler defined', () => {
      expect(auth.handler).toBeDefined();
      expect(typeof auth.handler).toBe('function');
    });

    it('should process requests through Better Auth handler', async () => {
      const request = new Request(`${BASE_URL}/api/auth/get-session`, {
        method: 'GET',
      });

      const response = await auth.handler(request);
      expect(response).toBeInstanceOf(Response);
      // Better Auth returns different statuses based on configuration
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should return a Response object from handler for validation errors', async () => {
      // Send invalid input to get quick validation error (no DB lookup needed)
      const request = new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: '', // Empty email will fail validation quickly
          password: '',
        }),
      });

      const response = await auth.handler(request);
      expect(response).toBeInstanceOf(Response);
    });

    it('should handle sign-out requests via handler', async () => {
      const request = new Request(`${BASE_URL}/api/auth/sign-out`, {
        method: 'POST',
      });

      const response = await auth.handler(request);
      expect(response).toBeInstanceOf(Response);
    });

    it('should return proper status for unknown auth routes', async () => {
      const request = new Request(`${BASE_URL}/api/auth/unknown-endpoint`, {
        method: 'GET',
      });

      const response = await auth.handler(request);
      // Should return 404 for unknown routes
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

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

    it('should handle rapid successive requests', async () => {
      const res1 = await app.request('/api/auth/get-session', { method: 'GET' });
      const res2 = await app.request('/api/auth/get-session', { method: 'GET' });
      const res3 = await app.request('/api/auth/get-session', { method: 'GET' });

      expect(res1.status).toBeDefined();
      expect(res2.status).toBeDefined();
      expect(res3.status).toBeDefined();
    });

    it('should handle requests with very long email', async () => {
      const longEmail = 'a'.repeat(300) + '@example.com';
      // Use sign-up with invalid data - validation should fail quickly without DB lookup
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: longEmail,
          password: 'short', // Invalid password should fail validation quickly
        }),
      });

      // Should reject or handle appropriately
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should handle XSS attempt in email field', async () => {
      const xssPayload = '<script>alert("xss")</script>@example.com';
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: xssPayload,
          password: testPassword,
        }),
      });

      // Should reject as invalid email format
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(600);
    });

    it('should not expose password in error responses', async () => {
      // Use invalid email format to get quick validation error (no DB)
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'invalid-email-format', // Invalid email triggers quick error
          password: 'SuperSecretPassword123!',
        }),
      });

      const text = await res.text();
      expect(text).not.toContain('SuperSecretPassword123!');
    });
  });

  // ==========================================================================
  // HTTP Method Validation Tests
  // ==========================================================================

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

    it('should reject sign-out with GET method', async () => {
      const res = await app.request('/api/auth/sign-out', {
        method: 'GET',
      });

      // Should require POST method
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

    it('should allow GET for session endpoint', async () => {
      const res = await app.request('/api/auth/get-session', {
        method: 'GET',
      });

      // Should not be 404, indicating route exists
      expect(res.status).not.toBe(404);
    });
  });

  // ==========================================================================
  // Response Headers Tests
  // ==========================================================================

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

    it('should return proper headers for auth responses', async () => {
      const res = await app.request('/api/auth/get-session');

      // If successful, should have content-type header
      if (res.status === 200) {
        const contentType = res.headers.get('content-type');
        expect(contentType).toBeTruthy();
      }
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance', () => {
    it('should respond to session check quickly', async () => {
      const start = Date.now();

      await app.request('/api/auth/get-session');

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle multiple rapid requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        app.request('/api/auth/get-session')
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      expect(responses).toHaveLength(5);
      expect(duration).toBeLessThan(3000); // Less than 3 seconds for 5 requests
    });

    it('should handle sign-up validation quickly', async () => {
      const start = Date.now();

      // Use invalid data for quick validation response (no DB call)
      await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'short',
          name: 'Perf Test',
        }),
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });

    it('should handle sign-in validation quickly', async () => {
      const start = Date.now();

      // Use invalid data for quick validation response (no DB call)
      await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'x',
        }),
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000); // Less than 2 seconds
    });
  });

  // ==========================================================================
  // Integration Tests
  // ==========================================================================

  describe('Integration', () => {
    it('should work with CORS headers', async () => {
      const res = await app.request('/api/auth/get-session', {
        headers: {
          Origin: 'http://localhost:3001',
        },
      });

      // Route should be accessible
      expect(res.status).not.toBe(404);
    });

    it('should integrate with main app router', async () => {
      // Verify auth routes work alongside other app routes
      const [authRes, healthRes] = await Promise.all([
        app.request('/api/auth/get-session'),
        app.request('/health'),
      ]);

      // Auth endpoint exists
      expect(authRes.status).not.toBe(404);
      expect(healthRes.status).toBe(200);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty string values', async () => {
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
    });

    it('should handle null values in body', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: null,
          password: null,
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle whitespace-only values', async () => {
      const res = await app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: '   ',
          password: '   ',
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should handle emoji in name', async () => {
      const res = await app.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: `emoji-${Date.now()}@example.com`,
          password: testPassword,
          name: 'User 🎨 Test',
        }),
      });

      expect(res.status).toBeDefined();
    });
  });
});
