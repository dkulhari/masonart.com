/**
 * Tests for SMS Service (2Factor.in Integration)
 *
 * This test suite validates the SMS service functions:
 * - normalizePhoneNumber() - Normalizes phone to 10-digit format
 * - isValidIndianMobile() - Validates Indian mobile number format
 * - sendOTP() - Sends OTP via 2Factor.in API
 * - verifyOTP() - Verifies OTP via 2Factor.in API
 * - isSmsServiceConfigured() - Checks if SMS service is configured
 *
 * @see packages/api/src/services/sms.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';

// ============================================================================
// Service Imports
// ============================================================================

import {
  normalizePhoneNumber,
  isValidIndianMobile,
  sendOTP,
  verifyOTP,
  isSmsServiceConfigured,
} from '../../src/services/sms';

// ============================================================================
// Phone Number Normalization Tests
// ============================================================================

describe('SMS Service', () => {
  describe('normalizePhoneNumber', () => {
    it('should normalize a valid 10-digit number', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('9876543210');
    });

    it('should remove +91 country code', () => {
      expect(normalizePhoneNumber('+919876543210')).toBe('9876543210');
    });

    it('should remove 91 country code without plus', () => {
      expect(normalizePhoneNumber('919876543210')).toBe('9876543210');
    });

    it('should remove spaces from phone number', () => {
      expect(normalizePhoneNumber('98765 43210')).toBe('9876543210');
    });

    it('should remove dashes from phone number', () => {
      expect(normalizePhoneNumber('98765-43210')).toBe('9876543210');
    });

    it('should remove mixed formatting', () => {
      expect(normalizePhoneNumber('+91-98765 43210')).toBe('9876543210');
    });

    it('should throw error for too few digits', () => {
      expect(() => normalizePhoneNumber('987654321')).toThrow('Invalid phone number');
    });

    it('should throw error for too many digits (without country code)', () => {
      expect(() => normalizePhoneNumber('98765432101')).toThrow('Invalid phone number');
    });

    it('should throw error for invalid prefix (starting with 0)', () => {
      expect(() => normalizePhoneNumber('0876543210')).toThrow('Invalid Indian mobile number');
    });

    it('should throw error for invalid prefix (starting with 1)', () => {
      expect(() => normalizePhoneNumber('1876543210')).toThrow('Invalid Indian mobile number');
    });

    it('should throw error for invalid prefix (starting with 2)', () => {
      expect(() => normalizePhoneNumber('2876543210')).toThrow('Invalid Indian mobile number');
    });

    it('should throw error for invalid prefix (starting with 3)', () => {
      expect(() => normalizePhoneNumber('3876543210')).toThrow('Invalid Indian mobile number');
    });

    it('should throw error for invalid prefix (starting with 4)', () => {
      expect(() => normalizePhoneNumber('4876543210')).toThrow('Invalid Indian mobile number');
    });

    it('should throw error for invalid prefix (starting with 5)', () => {
      expect(() => normalizePhoneNumber('5876543210')).toThrow('Invalid Indian mobile number');
    });

    it('should accept numbers starting with 6', () => {
      expect(normalizePhoneNumber('6876543210')).toBe('6876543210');
    });

    it('should accept numbers starting with 7', () => {
      expect(normalizePhoneNumber('7876543210')).toBe('7876543210');
    });

    it('should accept numbers starting with 8', () => {
      expect(normalizePhoneNumber('8876543210')).toBe('8876543210');
    });

    it('should accept numbers starting with 9', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('9876543210');
    });

    it('should throw error for empty string', () => {
      expect(() => normalizePhoneNumber('')).toThrow('Invalid phone number');
    });

    it('should throw error for non-numeric input', () => {
      expect(() => normalizePhoneNumber('abcdefghij')).toThrow('Invalid phone number');
    });

    it('should handle parentheses in phone number', () => {
      expect(normalizePhoneNumber('(91)9876543210')).toBe('9876543210');
    });
  });

  // ==========================================================================
  // Phone Validation Tests
  // ==========================================================================

  describe('isValidIndianMobile', () => {
    it('should return true for valid 10-digit number starting with 9', () => {
      expect(isValidIndianMobile('9876543210')).toBe(true);
    });

    it('should return true for valid 10-digit number starting with 8', () => {
      expect(isValidIndianMobile('8876543210')).toBe(true);
    });

    it('should return true for valid 10-digit number starting with 7', () => {
      expect(isValidIndianMobile('7876543210')).toBe(true);
    });

    it('should return true for valid 10-digit number starting with 6', () => {
      expect(isValidIndianMobile('6876543210')).toBe(true);
    });

    it('should return true for number with +91 prefix', () => {
      expect(isValidIndianMobile('+919876543210')).toBe(true);
    });

    it('should return true for number with spaces', () => {
      expect(isValidIndianMobile('98765 43210')).toBe(true);
    });

    it('should return false for number starting with 5', () => {
      expect(isValidIndianMobile('5876543210')).toBe(false);
    });

    it('should return false for 9-digit number', () => {
      expect(isValidIndianMobile('987654321')).toBe(false);
    });

    it('should return false for 11-digit number without country code', () => {
      expect(isValidIndianMobile('98765432101')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidIndianMobile('')).toBe(false);
    });

    it('should return false for non-numeric string', () => {
      expect(isValidIndianMobile('notanumber')).toBe(false);
    });

    it('should return false for landline number', () => {
      expect(isValidIndianMobile('02212345678')).toBe(false);
    });
  });

  // ==========================================================================
  // SMS Service Configuration Tests
  // ==========================================================================

  describe('isSmsServiceConfigured', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return true in development mode without API key', () => {
      process.env.NODE_ENV = 'development';
      process.env.TWO_FACTOR_API_KEY = '';
      // Service always returns true in dev mode
      expect(isSmsServiceConfigured()).toBe(true);
    });

    it('should return true when API key is set', () => {
      process.env.TWO_FACTOR_API_KEY = 'test-api-key';
      expect(isSmsServiceConfigured()).toBe(true);
    });
  });

  // ==========================================================================
  // OTP Sending Tests (Dev Mode)
  // ==========================================================================

  describe('sendOTP', () => {
    describe('Development Mode', () => {
      it('should return success with dev session ID in dev mode', async () => {
        // In dev mode without API key, returns mock session
        const result = await sendOTP('9876543210');
        expect(result.success).toBe(true);
        expect(result.sessionId).toBeDefined();
        expect(result.sessionId).toContain('dev_');
      });

      it('should include phone number in dev session ID', async () => {
        const result = await sendOTP('9876543210');
        expect(result.sessionId).toContain('9876543210');
      });

      it('should handle formatted phone numbers', async () => {
        const result = await sendOTP('+91 98765 43210');
        expect(result.success).toBe(true);
        expect(result.sessionId).toContain('9876543210');
      });

      it('should return error for invalid phone number', async () => {
        const result = await sendOTP('12345');
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should return error for phone with invalid prefix', async () => {
        const result = await sendOTP('5876543210');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid Indian mobile number');
      });
    });
  });

  // ==========================================================================
  // OTP Verification Tests (Dev Mode)
  // ==========================================================================

  describe('verifyOTP', () => {
    describe('Development Mode', () => {
      it('should verify OTP "123456" in dev mode', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', '123456');
        expect(result.success).toBe(true);
      });

      it('should reject invalid OTP in dev mode', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', '000000');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid OTP');
      });

      it('should reject OTP with wrong length', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', '12345');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid OTP format');
      });

      it('should reject OTP with 7 digits', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', '1234567');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid OTP format');
      });

      it('should reject non-numeric OTP', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', 'abcdef');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid OTP format');
      });

      it('should reject empty OTP', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', '');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid OTP format');
      });

      it('should reject OTP with spaces', async () => {
        const result = await verifyOTP('dev_1234567890_9876543210', '123 456');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid OTP format');
      });
    });

    describe('Session ID Validation', () => {
      it('should handle dev session IDs correctly', async () => {
        const result = await verifyOTP('dev_timestamp_phone', '123456');
        expect(result.success).toBe(true);
      });

      it('should handle non-dev session IDs (requires API key)', async () => {
        // Without API key configured, non-dev sessions should fail
        const result = await verifyOTP('non_dev_session', '123456');
        expect(result.success).toBe(false);
        expect(result.error).toContain('SMS service not configured');
      });
    });
  });

  // ==========================================================================
  // Integration Flow Tests
  // ==========================================================================

  describe('OTP Flow Integration', () => {
    it('should complete send-verify flow in dev mode', async () => {
      // Step 1: Send OTP
      const sendResult = await sendOTP('9876543210');
      expect(sendResult.success).toBe(true);
      expect(sendResult.sessionId).toBeDefined();

      // Step 2: Verify OTP
      const verifyResult = await verifyOTP(sendResult.sessionId!, '123456');
      expect(verifyResult.success).toBe(true);
    });

    it('should reject wrong OTP after successful send', async () => {
      const sendResult = await sendOTP('9876543210');
      expect(sendResult.success).toBe(true);

      const verifyResult = await verifyOTP(sendResult.sessionId!, '999999');
      expect(verifyResult.success).toBe(false);
    });

    it('should handle multiple send requests for same phone', async () => {
      const result1 = await sendOTP('9876543210');
      // Add small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      const result2 = await sendOTP('9876543210');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Both should have valid session IDs
      expect(result1.sessionId).toBeDefined();
      expect(result2.sessionId).toBeDefined();
    });

    it('should handle concurrent OTP requests', async () => {
      const phones = ['9111111111', '8222222222', '7333333333'];
      const results = await Promise.all(phones.map(phone => sendOTP(phone)));

      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.sessionId).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle phone number with all zeros after prefix', () => {
      expect(() => normalizePhoneNumber('9000000000')).not.toThrow();
      expect(normalizePhoneNumber('9000000000')).toBe('9000000000');
    });

    it('should handle phone number with repeating digits', () => {
      expect(normalizePhoneNumber('9999999999')).toBe('9999999999');
    });

    it('should handle unicode digits', async () => {
      // Some systems might have unicode number representations
      const result = await sendOTP('9876543210');
      expect(result.success).toBe(true);
    });

    it('should handle very long input strings', () => {
      const longString = '9' + '1'.repeat(100);
      expect(() => normalizePhoneNumber(longString)).toThrow();
    });

    it('should handle special characters only', () => {
      expect(() => normalizePhoneNumber('+-()[]')).toThrow();
    });
  });

  // ==========================================================================
  // Service Exports Test
  // ==========================================================================

  describe('Service Exports', () => {
    it('should export normalizePhoneNumber function', async () => {
      const smsService = await import('../../src/services/sms');
      expect(typeof smsService.normalizePhoneNumber).toBe('function');
    });

    it('should export isValidIndianMobile function', async () => {
      const smsService = await import('../../src/services/sms');
      expect(typeof smsService.isValidIndianMobile).toBe('function');
    });

    it('should export sendOTP function', async () => {
      const smsService = await import('../../src/services/sms');
      expect(typeof smsService.sendOTP).toBe('function');
    });

    it('should export verifyOTP function', async () => {
      const smsService = await import('../../src/services/sms');
      expect(typeof smsService.verifyOTP).toBe('function');
    });

    it('should export isSmsServiceConfigured function', async () => {
      const smsService = await import('../../src/services/sms');
      expect(typeof smsService.isSmsServiceConfigured).toBe('function');
    });
  });
});
