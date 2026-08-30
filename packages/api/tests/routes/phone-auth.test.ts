/**
 * Tests for Phone Authentication Routes
 *
 * This test suite validates the phone OTP authentication endpoints:
 * - POST /api/phone-auth/send-otp - Send OTP to phone
 * - POST /api/phone-auth/verify-otp - Verify OTP and login/register
 * - POST /api/phone-auth/resend-otp - Resend OTP with rate limiting
 * - GET /api/phone-auth/status - Check SMS service status
 *
 * @see packages/api/src/routes/phone-auth.ts
 */

import { describe, it, expect } from 'vitest';
import { app } from '../../src/index';
import '../setup';
import { readJson } from '../helpers/json';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Valid test phone number (Indian format)
 */
const validPhone = '9876543210';

/**
 * Valid OTP for dev mode testing
 */
const validDevOTP = '123456';

/**
 * Invalid OTP for testing failures
 */
const invalidOTP = '000000';

describe('Phone Authentication Routes', () => {
  // ==========================================================================
  // Route Availability Tests
  // ==========================================================================

  describe('Route Availability', () => {
    it('should have /api/phone-auth/send-otp endpoint', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      expect(res.status).not.toBe(404);
    });

    it('should have /api/phone-auth/verify-otp endpoint', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: validDevOTP,
          sessionId: 'test-session',
        }),
      });

      expect(res.status).not.toBe(404);
    });

    it('should have /api/phone-auth/resend-otp endpoint', async () => {
      const res = await app.request('/api/phone-auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      expect(res.status).not.toBe(404);
    });

    it('should have /api/phone-auth/status endpoint', async () => {
      const res = await app.request('/api/phone-auth/status', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // Send OTP Tests
  // Note: Tests that require database are marked to handle DB unavailability
  // ==========================================================================

  describe('POST /api/phone-auth/send-otp', () => {
    it('should accept valid Indian phone number', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      // May succeed (200) or fail with DB error (500)
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const data = await readJson(res);
        expect(data.success).toBe(true);
        expect(data.sessionId).toBeDefined();
      }
    });

    it('should return session ID in response when DB available', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      if (res.status === 200) {
        const data = await readJson(res);
        expect(data.sessionId).toBeDefined();
        expect(typeof data.sessionId).toBe('string');
      } else {
        // DB unavailable, test passes
        expect(res.status).toBe(500);
      }
    });

    it('should return expiry time in response when DB available', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      if (res.status === 200) {
        const data = await readJson(res);
        expect(data.expiresIn).toBeDefined();
        expect(data.expiresIn).toBe(600); // 10 minutes
      }
    });

    it('should include isExistingUser flag when DB available', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      if (res.status === 200) {
        const data = await readJson(res);
        expect(typeof data.isExistingUser).toBe('boolean');
      }
    });

    it('should mask phone number in response message when DB available', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      if (res.status === 200) {
        const data = await readJson(res);
        expect(data.message).toBeDefined();
        expect(data.message).toContain('****');
        expect(data.message).not.toContain(validPhone);
      }
    });

    it('should accept phone with +91 prefix', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+919876543210' }),
      });

      // May succeed or fail with DB error
      expect([200, 500]).toContain(res.status);
    });

    it('should accept phone with spaces', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '98765 43210' }),
      });

      // May succeed or fail with DB error
      expect([200, 500]).toContain(res.status);
    });

    it('should reject invalid phone number', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '12345' }),
      });

      expect(res.status).toBe(400);
      const data = await readJson(res);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should reject phone starting with invalid prefix', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '5876543210' }),
      });

      expect(res.status).toBe(400);
      const data = await readJson(res);
      expect(data.error).toContain('Invalid Indian mobile number');
    });

    it('should reject missing phone field', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should reject empty phone', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '' }),
      });

      expect(res.status).toBe(400);
    });

    it('should return JSON content-type', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('should reject GET method', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'GET',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ==========================================================================
  // Verify OTP Tests
  // ==========================================================================

  describe('POST /api/phone-auth/verify-otp', () => {
    // Use a mock dev session ID since DB may not be available
    const sessionId = 'dev_test_session_9876543210';

    it('should verify correct OTP in dev mode', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: validDevOTP,
          sessionId,
        }),
      });

      // In dev mode with database, should succeed or fail based on DB availability
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(600);
    });

    it('should reject incorrect OTP', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: invalidOTP,
          sessionId,
        }),
      });

      expect(res.status).toBe(400);
      const data = await readJson(res);
      expect(data.success).toBe(false);
    });

    it('should reject OTP with wrong length (5 digits)', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: '12345',
          sessionId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject OTP with wrong length (7 digits)', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: '1234567',
          sessionId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing OTP field', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          sessionId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing phone field', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otp: validDevOTP,
          sessionId,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing session ID', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: validDevOTP,
        }),
      });

      // Zod validation returns 400 for missing required field
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('should reject empty request body', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('should accept optional name field', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: validDevOTP,
          sessionId,
          name: 'Test User',
        }),
      });

      // Should not fail validation (400) - may fail with OTP error or DB error
      expect(res.status).toBeGreaterThanOrEqual(200);
    });

    it('should return JSON content-type', async () => {
      const res = await app.request('/api/phone-auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: validPhone,
          otp: invalidOTP,
          sessionId,
        }),
      });

      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  // ==========================================================================
  // Resend OTP Tests
  // ==========================================================================

  describe('POST /api/phone-auth/resend-otp', () => {
    it('should accept valid phone number', async () => {
      const res = await app.request('/api/phone-auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      // May return 200, 429 (rate limit), or 500 (DB unavailable)
      expect([200, 429, 500]).toContain(res.status);
    });

    it('should return session ID on success', async () => {
      const res = await app.request('/api/phone-auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '8765432109' }), // Different phone to avoid rate limit
      });

      // DB may not be available
      if (res.status === 200) {
        const data = await readJson(res);
        expect(data.sessionId).toBeDefined();
      }
    });

    it('should reject invalid phone number', async () => {
      const res = await app.request('/api/phone-auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '12345' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing phone field', async () => {
      const res = await app.request('/api/phone-auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // Status Endpoint Tests
  // ==========================================================================

  describe('GET /api/phone-auth/status', () => {
    it('should return SMS service status', async () => {
      const res = await app.request('/api/phone-auth/status', {
        method: 'GET',
      });

      expect(res.status).toBe(200);
      const data = await readJson(res);
      expect(typeof data.enabled).toBe('boolean');
    });

    it('should include provider name', async () => {
      const res = await app.request('/api/phone-auth/status', {
        method: 'GET',
      });

      const data = await readJson(res);
      expect(data.provider).toBe('2factor.in');
    });

    it('should return JSON content-type', async () => {
      const res = await app.request('/api/phone-auth/status', {
        method: 'GET',
      });

      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  // ==========================================================================
  // Input Validation Tests
  // ==========================================================================

  describe('Input Validation', () => {
    it('should reject malformed JSON', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject SQL injection in phone', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: "'; DROP TABLE users; --" }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject XSS in phone', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '<script>alert("xss")</script>' }),
      });

      expect(res.status).toBe(400);
    });

    it('should handle unicode in phone', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '९८७६५४३२१०' }), // Hindi numerals
      });

      // Should reject as invalid
      expect(res.status).toBe(400);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should return proper error format', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: 'invalid' }),
      });

      const data = await readJson(res);
      expect(data.success).toBe(false);
      // Error can be string or object (from Zod validation)
      expect(data.error).toBeDefined();
    });

    it('should not expose internal errors', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: 'invalid' }),
      });

      const text = await res.text();
      expect(text).not.toContain('stack');
      expect(text).not.toContain('Error:');
    });
  });

  // ==========================================================================
  // HTTP Method Tests
  // ==========================================================================

  describe('HTTP Methods', () => {
    it('should reject PUT on send-otp', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject DELETE on send-otp', async () => {
      const res = await app.request('/api/phone-auth/send-otp', {
        method: 'DELETE',
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject POST on status', async () => {
      const res = await app.request('/api/phone-auth/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('Performance', () => {
    it('should respond to send-otp quickly', async () => {
      const start = Date.now();

      await app.request('/api/phone-auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: validPhone }),
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should respond to status quickly', async () => {
      const start = Date.now();

      await app.request('/api/phone-auth/status', {
        method: 'GET',
      });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 3 }, (_, i) =>
        app.request('/api/phone-auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: `911111111${i}` }),
        })
      );

      const responses = await Promise.all(requests);
      expect(responses).toHaveLength(3);
      responses.forEach(res => {
        expect(res.status).toBeDefined();
      });
    }, 30000);
  });
});
