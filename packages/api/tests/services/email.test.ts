/**
 * Tests for Email Service (Resend Integration)
 *
 * This test suite validates the email service functions:
 * - sendEmail() - Sends email via Resend
 * - sendTemplateEmail() - Sends email using a template
 * - isEmailServiceConfigured() - Checks if email service is configured
 * - getEmailServiceStatus() - Gets email service status
 *
 * @see packages/api/src/services/email.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';

// ============================================================================
// Service Imports
// ============================================================================

import {
  sendEmail,
  sendTemplateEmail,
  isEmailServiceConfigured,
  getEmailServiceStatus,
  type SendEmailOptions,
  type EmailTemplate,
} from '../../src/services/email';

// ============================================================================
// Test Constants
// ============================================================================

const TEST_EMAIL = 'test@example.com';
const TEST_SUBJECT = 'Test Email Subject';
const TEST_HTML = '<p>Test email content</p>';
const TEST_TEXT = 'Test email content';

// ============================================================================
// Email Service Configuration Tests
// ============================================================================

describe('Email Service', () => {
  describe('isEmailServiceConfigured', () => {
    it('should return true in test mode', () => {
      // In test mode, service is always considered configured
      expect(isEmailServiceConfigured()).toBe(true);
    });
  });

  describe('getEmailServiceStatus', () => {
    it('should return development mode status without API key', () => {
      const status = getEmailServiceStatus();

      expect(status.configured).toBe(true);
      expect(status.provider).toBe('resend');
      // Without RESEND_API_KEY, should be in development mode
      expect(status.mode).toBe('development');
    });

    it('should have correct structure', () => {
      const status = getEmailServiceStatus();

      expect(status).toHaveProperty('configured');
      expect(status).toHaveProperty('provider');
      expect(status).toHaveProperty('mode');
      expect(typeof status.configured).toBe('boolean');
      expect(typeof status.provider).toBe('string');
      expect(['production', 'development']).toContain(status.mode);
    });
  });

  // ==========================================================================
  // sendEmail Tests (Development Mode)
  // ==========================================================================

  describe('sendEmail', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should return success with dev message ID in dev/test mode', async () => {
      const options: SendEmailOptions = {
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain('dev_');
    });

    it('should log email details in dev mode', async () => {
      const options: SendEmailOptions = {
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
      };

      await sendEmail(options);

      expect(consoleSpy).toHaveBeenCalled();
      // Check that email details were logged
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toContain(TEST_EMAIL);
      expect(calls).toContain(TEST_SUBJECT);
    });

    it('should handle array of recipients', async () => {
      const recipients = ['user1@example.com', 'user2@example.com'];
      const options: SendEmailOptions = {
        to: recipients,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should accept optional text content', async () => {
      const options: SendEmailOptions = {
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
        text: TEST_TEXT,
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
    });

    it('should accept optional from address', async () => {
      const options: SendEmailOptions = {
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
        from: 'custom@chobi.art',
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
    });

    it('should accept optional replyTo address', async () => {
      const options: SendEmailOptions = {
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
        replyTo: 'reply@chobi.art',
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
    });

    it('should accept optional tags', async () => {
      const options: SendEmailOptions = {
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
        tags: [
          { name: 'order_id', value: 'ORD-123' },
          { name: 'type', value: 'confirmation' },
        ],
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
    });

    it('should handle all options together', async () => {
      const options: SendEmailOptions = {
        to: ['user1@example.com', 'user2@example.com'],
        subject: TEST_SUBJECT,
        html: TEST_HTML,
        text: TEST_TEXT,
        from: 'Custom <custom@chobi.art>',
        replyTo: 'support@chobi.art',
        tags: [{ name: 'test', value: 'true' }],
      };

      const result = await sendEmail(options);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });
  });

  // ==========================================================================
  // sendTemplateEmail Tests
  // ==========================================================================

  describe('sendTemplateEmail', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should send email using template', async () => {
      const template: EmailTemplate = {
        subject: 'Template Subject',
        html: '<h1>Template Content</h1>',
        text: 'Template Content',
      };

      const result = await sendTemplateEmail(TEST_EMAIL, template);

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should send to multiple recipients', async () => {
      const template: EmailTemplate = {
        subject: 'Template Subject',
        html: '<h1>Template Content</h1>',
      };
      const recipients = ['user1@example.com', 'user2@example.com'];

      const result = await sendTemplateEmail(recipients, template);

      expect(result.success).toBe(true);
    });

    it('should accept additional options', async () => {
      const template: EmailTemplate = {
        subject: 'Template Subject',
        html: '<h1>Template Content</h1>',
      };

      const result = await sendTemplateEmail(TEST_EMAIL, template, {
        from: 'Custom <custom@chobi.art>',
        replyTo: 'reply@example.com',
        tags: [{ name: 'template_test', value: 'true' }],
      });

      expect(result.success).toBe(true);
    });

    it('should pass template text to sendEmail', async () => {
      const template: EmailTemplate = {
        subject: 'Template Subject',
        html: '<h1>HTML Content</h1>',
        text: 'Plain text content',
      };

      const result = await sendTemplateEmail(TEST_EMAIL, template);

      expect(result.success).toBe(true);
      // Template data is passed through successfully
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Edge Cases and Error Handling
  // ==========================================================================

  describe('Edge Cases', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should handle very long HTML content', async () => {
      const longHtml = '<p>' + 'a'.repeat(10000) + '</p>';
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: longHtml,
      });

      expect(result.success).toBe(true);
    });

    it('should handle special characters in subject', async () => {
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: 'Test 🎨 Email with émojis & special <chars>',
        html: TEST_HTML,
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty HTML content', async () => {
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: '',
      });

      expect(result.success).toBe(true);
    });

    it('should handle special characters in recipient email', async () => {
      const result = await sendEmail({
        to: 'user+tag@example.com',
        subject: TEST_SUBJECT,
        html: TEST_HTML,
      });

      expect(result.success).toBe(true);
    });

    it('should handle HTML with script tags (sanitization not performed at this level)', async () => {
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: '<script>alert("xss")</script><p>Content</p>',
      });

      // Service sends as-is, sanitization should happen at template level
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Response Structure Tests
  // ==========================================================================

  describe('Response Structure', () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should return SendEmailResponse structure on success', async () => {
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('messageId');
      expect(result.success).toBe(true);
      expect(typeof result.messageId).toBe('string');
    });

    it('should not include error on success', async () => {
      const result = await sendEmail({
        to: TEST_EMAIL,
        subject: TEST_SUBJECT,
        html: TEST_HTML,
      });

      expect(result.error).toBeUndefined();
    });
  });

  // ==========================================================================
  // Service Exports Tests
  // ==========================================================================

  describe('Service Exports', () => {
    it('should export sendEmail function', async () => {
      const emailService = await import('../../src/services/email');
      expect(typeof emailService.sendEmail).toBe('function');
    });

    it('should export sendTemplateEmail function', async () => {
      const emailService = await import('../../src/services/email');
      expect(typeof emailService.sendTemplateEmail).toBe('function');
    });

    it('should export isEmailServiceConfigured function', async () => {
      const emailService = await import('../../src/services/email');
      expect(typeof emailService.isEmailServiceConfigured).toBe('function');
    });

    it('should export getEmailServiceStatus function', async () => {
      const emailService = await import('../../src/services/email');
      expect(typeof emailService.getEmailServiceStatus).toBe('function');
    });
  });
});
