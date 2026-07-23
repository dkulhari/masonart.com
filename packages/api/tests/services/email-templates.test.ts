/**
 * Tests for Email Templates
 *
 * This test suite validates the email template functions:
 * - getOrderConfirmationTemplate() - Order confirmation email
 * - getShippedTemplate() - Order shipped email
 * - getOutForDeliveryTemplate() - Out for delivery email
 * - getDeliveredTemplate() - Order delivered email
 *
 * @see packages/api/src/services/email-templates.ts
 */

import { describe, it, expect } from 'vitest';
import '../setup';

// ============================================================================
// Service Imports
// ============================================================================

import {
  getOrderConfirmationTemplate,
  getShippedTemplate,
  getOutForDeliveryTemplate,
  getDeliveredTemplate,
  type EmailTemplate,
} from '../../src/services/email-templates';
import type { Order } from '../../src/database/schema/orders';

// ============================================================================
// Test Data
// ============================================================================

const createMockOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-123',
  orderNumber: 'MA-2024-001234',
  userId: 'user-123',
  guestEmail: null,
  guestPhone: null,
  status: 'confirmed',
  itemCount: 2,
  subtotal: '2999.00',
  shippingCost: '0.00',
  tax: '0.00',
  discount: '0.00',
  total: '2999.00',
  paymentStatus: 'paid',
  paymentMethod: 'card',
  paymentId: 'pay_123',
  shippingAddress: {
    fullName: 'John Doe',
    phone: '9876543210',
    addressLine1: '123 Main Street',
    addressLine2: 'Apartment 4B',
    landmark: 'Near City Mall',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
  },
  billingAddress: null,
  shippingDetails: {
    carrier: 'blue_dart',
    trackingNumber: 'BD123456789',
    trackingUrl: 'https://bluedart.com/track/BD123456789',
    estimatedDelivery: new Date('2024-02-15'),
    shippedAt: new Date('2024-02-10'),
    deliveredAt: null,
  },
  notes: null,
  trackingToken: null,
  trackingTokenExpiresAt: null,
  createdAt: new Date('2024-02-08'),
  updatedAt: new Date('2024-02-08'),
  ...overrides,
});

// ============================================================================
// Template Structure Tests
// ============================================================================

describe('Email Templates', () => {
  describe('Template Structure', () => {
    it('should return EmailTemplate structure for order confirmation', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('html');
      expect(template).toHaveProperty('text');
      expect(typeof template.subject).toBe('string');
      expect(typeof template.html).toBe('string');
      expect(typeof template.text).toBe('string');
    });

    it('should return EmailTemplate structure for shipped', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('html');
      expect(template).toHaveProperty('text');
    });

    it('should return EmailTemplate structure for out for delivery', () => {
      const order = createMockOrder();
      const template = getOutForDeliveryTemplate(order);

      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('html');
      expect(template).toHaveProperty('text');
    });

    it('should return EmailTemplate structure for delivered', () => {
      const order = createMockOrder();
      const template = getDeliveredTemplate(order);

      expect(template).toHaveProperty('subject');
      expect(template).toHaveProperty('html');
      expect(template).toHaveProperty('text');
    });
  });

  // ==========================================================================
  // Order Confirmation Template Tests
  // ==========================================================================

  describe('getOrderConfirmationTemplate', () => {
    it('should include order number in subject', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.subject).toContain(order.orderNumber);
      expect(template.subject.toLowerCase()).toContain('confirmed');
    });

    it('should include customer name in HTML', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('John Doe');
    });

    it('should include order number in HTML', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain(order.orderNumber);
    });

    it('should include item count in HTML', () => {
      const order = createMockOrder({ itemCount: 3 });
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('3');
    });

    it('should include formatted total in HTML', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      // Should contain currency formatted total (INR)
      expect(template.html).toContain('2,999');
    });

    it('should include shipping address in HTML', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('123 Main Street');
      expect(template.html).toContain('Mumbai');
      expect(template.html).toContain('Maharashtra');
      expect(template.html).toContain('400001');
    });

    it('should include view order link', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain(`chobi.art/orders/${order.orderNumber}`);
    });

    it('should have plain text version with order details', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.text).toContain(order.orderNumber);
      expect(template.text).toContain('John Doe');
    });

    it('should handle order without customer name', () => {
      const order = createMockOrder({
        shippingAddress: {
          ...createMockOrder().shippingAddress!,
          fullName: '',
        },
      });
      const template = getOrderConfirmationTemplate(order);

      // Should fall back to "there"
      expect(template.html).toContain('there');
    });

    it('should include chobi.art branding', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('CHOBI.ART');
    });
  });

  // ==========================================================================
  // Shipped Template Tests
  // ==========================================================================

  describe('getShippedTemplate', () => {
    it('should include order number in subject', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      expect(template.subject).toContain(order.orderNumber);
      expect(template.subject.toLowerCase()).toContain('shipped');
    });

    it('should include tracking information in HTML', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      expect(template.html).toContain('BD123456789');
    });

    it('should include carrier information', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      expect(template.html).toContain('blue_dart');
    });

    it('should include tracking URL', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      expect(template.html).toContain('bluedart.com/track/BD123456789');
    });

    it('should handle order without tracking URL', () => {
      const order = createMockOrder({
        shippingDetails: {
          ...createMockOrder().shippingDetails!,
          trackingUrl: null,
        },
      });
      const template = getShippedTemplate(order);

      // Should use default tracking URL
      expect(template.html).toContain(`chobi.art/track/${order.orderNumber}`);
    });

    it('should handle order without tracking number', () => {
      const order = createMockOrder({
        shippingDetails: {
          ...createMockOrder().shippingDetails!,
          trackingNumber: null,
        },
      });
      const template = getShippedTemplate(order);

      // Should still render successfully
      expect(template.subject).toContain('Shipped');
    });

    it('should include estimated delivery when available', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      // Should contain formatted date
      expect(template.html).toContain('Estimated Delivery');
    });

    it('should have plain text with tracking info', () => {
      const order = createMockOrder();
      const template = getShippedTemplate(order);

      expect(template.text).toContain('BD123456789');
      expect(template.text).toContain(order.orderNumber);
    });
  });

  // ==========================================================================
  // Out for Delivery Template Tests
  // ==========================================================================

  describe('getOutForDeliveryTemplate', () => {
    it('should include order number in subject', () => {
      const order = createMockOrder();
      const template = getOutForDeliveryTemplate(order);

      expect(template.subject).toContain(order.orderNumber);
      expect(template.subject.toLowerCase()).toContain('delivery');
    });

    it('should include urgent delivery message', () => {
      const order = createMockOrder();
      const template = getOutForDeliveryTemplate(order);

      expect(template.html.toLowerCase()).toContain('today');
    });

    it('should include shipping address', () => {
      const order = createMockOrder();
      const template = getOutForDeliveryTemplate(order);

      expect(template.html).toContain('123 Main Street');
      expect(template.html).toContain('Mumbai');
    });

    it('should include track delivery button', () => {
      const order = createMockOrder();
      const template = getOutForDeliveryTemplate(order);

      expect(template.html).toContain('Track');
    });

    it('should have plain text version', () => {
      const order = createMockOrder();
      const template = getOutForDeliveryTemplate(order);

      expect(template.text).toContain(order.orderNumber);
      expect(template.text.toLowerCase()).toContain('today');
    });
  });

  // ==========================================================================
  // Delivered Template Tests
  // ==========================================================================

  describe('getDeliveredTemplate', () => {
    it('should include order number in subject', () => {
      const order = createMockOrder();
      const template = getDeliveredTemplate(order);

      expect(template.subject).toContain(order.orderNumber);
      expect(template.subject.toLowerCase()).toContain('delivered');
    });

    it('should include review link', () => {
      const order = createMockOrder();
      const template = getDeliveredTemplate(order);

      expect(template.html).toContain('reviews/new');
      expect(template.html).toContain(order.orderNumber);
    });

    it('should include social sharing prompt', () => {
      const order = createMockOrder();
      const template = getDeliveredTemplate(order);

      expect(template.html.toLowerCase()).toContain('instagram');
      expect(template.html).toContain('@chobiart');
    });

    it('should include customer name', () => {
      const order = createMockOrder();
      const template = getDeliveredTemplate(order);

      expect(template.html).toContain('John Doe');
    });

    it('should have plain text with review link', () => {
      const order = createMockOrder();
      const template = getDeliveredTemplate(order);

      expect(template.text).toContain('reviews/new');
      expect(template.text).toContain(order.orderNumber);
    });
  });

  // ==========================================================================
  // HTML Structure Tests
  // ==========================================================================

  describe('HTML Structure', () => {
    it('should have valid HTML structure', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('<!DOCTYPE html>');
      expect(template.html).toContain('<html');
      expect(template.html).toContain('</html>');
      expect(template.html).toContain('<head>');
      expect(template.html).toContain('<body>');
    });

    it('should have responsive meta viewport', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('viewport');
      expect(template.html).toContain('width=device-width');
    });

    it('should have CSS styles embedded', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('<style>');
      expect(template.html).toContain('</style>');
    });

    it('should have media queries for mobile', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('@media');
      expect(template.html).toContain('600px');
    });

    it('should have footer with social links', () => {
      const order = createMockOrder();
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('instagram.com/chobiart');
      expect(template.html).toContain('support@chobi.art');
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle null shipping address', () => {
      const order = createMockOrder({ shippingAddress: null });

      // Should not throw
      expect(() => getOrderConfirmationTemplate(order)).not.toThrow();
      expect(() => getShippedTemplate(order)).not.toThrow();
      expect(() => getOutForDeliveryTemplate(order)).not.toThrow();
      expect(() => getDeliveredTemplate(order)).not.toThrow();
    });

    it('should handle null shipping details', () => {
      const order = createMockOrder({ shippingDetails: null });

      expect(() => getShippedTemplate(order)).not.toThrow();
      const template = getShippedTemplate(order);
      expect(template.html).toContain('our carrier partner');
    });

    it('should handle very large order totals', () => {
      const order = createMockOrder({ total: '9999999.00' });
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('99,99,999'); // Indian format
    });

    it('should handle zero item count', () => {
      const order = createMockOrder({ itemCount: 0 });
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('0 item');
    });

    it('should handle single item grammatically', () => {
      const order = createMockOrder({ itemCount: 1 });
      const template = getOrderConfirmationTemplate(order);

      // Should use "item" not "items"
      expect(template.html).toContain('1 item');
      expect(template.html).not.toContain('1 items');
    });

    it('should handle multiple items grammatically', () => {
      const order = createMockOrder({ itemCount: 5 });
      const template = getOrderConfirmationTemplate(order);

      // Should use "items" for plural
      expect(template.html).toContain('5 items');
    });

    it('should handle special characters in customer name', () => {
      const order = createMockOrder({
        shippingAddress: {
          ...createMockOrder().shippingAddress!,
          fullName: 'José García-López',
        },
      });
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('José García-López');
    });

    it('should handle address with missing optional fields', () => {
      const order = createMockOrder({
        shippingAddress: {
          fullName: 'John Doe',
          phone: '9876543210',
          addressLine1: '123 Main Street',
          addressLine2: null,
          landmark: null,
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400001',
          country: 'India',
        },
      });
      const template = getOrderConfirmationTemplate(order);

      expect(template.html).toContain('123 Main Street');
      expect(template.html).toContain('Mumbai');
    });
  });

  // ==========================================================================
  // Service Exports Tests
  // ==========================================================================

  describe('Service Exports', () => {
    it('should export getOrderConfirmationTemplate function', async () => {
      const templates = await import('../../src/services/email-templates');
      expect(typeof templates.getOrderConfirmationTemplate).toBe('function');
    });

    it('should export getShippedTemplate function', async () => {
      const templates = await import('../../src/services/email-templates');
      expect(typeof templates.getShippedTemplate).toBe('function');
    });

    it('should export getOutForDeliveryTemplate function', async () => {
      const templates = await import('../../src/services/email-templates');
      expect(typeof templates.getOutForDeliveryTemplate).toBe('function');
    });

    it('should export getDeliveredTemplate function', async () => {
      const templates = await import('../../src/services/email-templates');
      expect(typeof templates.getDeliveredTemplate).toBe('function');
    });
  });
});
