/**
 * Tests for Notification Orchestration Service
 *
 * This test suite validates the notification service functions:
 * - sendOrderNotification() - Sends notifications via email/SMS
 * - notifyOrderStatusChange() - Maps order status to notification type
 * - getOrderNotifications() - Gets notification history
 * - retryNotification() - Retries failed notifications
 *
 * Note: These tests use mocks since the notification service depends on
 * database operations and external services (email/SMS).
 *
 * @see packages/api/src/services/notifications.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the database module
vi.mock('../../src/database', () => ({
  db: {
    query: {
      orders: {
        findFirst: vi.fn(),
      },
      notifications: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      notificationPreferences: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'notif-123' }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

// Mock email service
vi.mock('../../src/services/email', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ success: true, messageId: 'msg_123' })),
}));

// Mock SMS service
vi.mock('../../src/services/sms', () => ({
  sendOTP: vi.fn(() => Promise.resolve({ success: true, sessionId: 'sms_123' })),
}));

// Mock email templates
vi.mock('../../src/services/email-templates', () => ({
  getOrderConfirmationTemplate: vi.fn(() => ({
    subject: 'Order Confirmed',
    html: '<p>Order confirmed</p>',
    text: 'Order confirmed',
  })),
  getShippedTemplate: vi.fn(() => ({
    subject: 'Order Shipped',
    html: '<p>Order shipped</p>',
    text: 'Order shipped',
  })),
  getOutForDeliveryTemplate: vi.fn(() => ({
    subject: 'Out for Delivery',
    html: '<p>Out for delivery</p>',
    text: 'Out for delivery',
  })),
  getDeliveredTemplate: vi.fn(() => ({
    subject: 'Order Delivered',
    html: '<p>Order delivered</p>',
    text: 'Order delivered',
  })),
}));

// ============================================================================
// Test Data
// ============================================================================

/**
 * Typed for real, unlike the fixture below. This is where drift actually hides:
 * this object declared `country: 'India'`, but OrderShippingAddress requires
 * `countryCode` and has no `country` field at all (#662). The template read
 * neither, so nothing failed — it just tested a shape production never builds.
 */
const mockShippingAddress: OrderShippingAddress = {
  fullName: 'John Doe',
  phone: '9876543210',
  addressLine1: '123 Main Street',
  city: 'Mumbai',
  state: 'Maharashtra',
  postalCode: '400001',
  countryCode: 'IN',
};

/**
 * The service reads a handful of columns; these fixtures supply those and stand
 * in for the full rows, so they are cast once here rather than at every
 * mockResolvedValueOnce call site.
 */
type OrderRow = NonNullable<Awaited<ReturnType<typeof db.query.orders.findFirst>>>;
type PrefsRow = NonNullable<
  Awaited<ReturnType<typeof db.query.notificationPreferences.findFirst>>
>;
type NotificationRow = NonNullable<
  Awaited<ReturnType<typeof db.query.notifications.findFirst>>
>;

const mockOrder = {
  id: 'order-123',
  orderNumber: 'MA-2024-001234',
  userId: 'user-123',
  guestEmail: null,
  guestPhone: null,
  status: 'confirmed',
  itemCount: 2,
  total: '2999.00',
  shippingAddress: mockShippingAddress,
  shippingDetails: {
    trackingUrl: 'https://tracking.example.com/123',
    trackingNumber: 'TRK123',
    carrier: 'blue_dart',
  },
  user: {
    id: 'user-123',
    email: 'john@example.com',
    phone: '9876543210',
  },
  createdAt: new Date('2024-02-08'),
  updatedAt: new Date('2024-02-08'),
} as unknown as OrderRow;

const mockPreferences = {
  userId: 'user-123',
  emailOrderConfirmation: true,
  emailShipped: true,
  emailOutForDelivery: true,
  emailDelivered: true,
  smsOrderConfirmation: false,
  smsShipped: false,
  smsOutForDelivery: false,
  smsDelivered: false,
} as unknown as PrefsRow;

// ============================================================================
// Service Import (after mocks)
// ============================================================================

import {
  sendOrderNotification,
  notifyOrderStatusChange,
  getOrderNotifications,
  retryNotification,
} from '../../src/services/notifications';
import { db } from '../../src/database';
import type { OrderShippingAddress } from '../../src/database/schema/orders';
import { sendEmail } from '../../src/services/email';

// ============================================================================
// Tests
// ============================================================================

describe('Notification Service', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ==========================================================================
  // sendOrderNotification Tests
  // ==========================================================================

  describe('sendOrderNotification', () => {
    it('should return error for non-existent order', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(undefined);

      const result = await sendOrderNotification({
        orderId: 'non-existent',
        type: 'order_confirmation',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Order not found: non-existent');
    });

    it('should send email notification when enabled in preferences', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(result.success).toBe(true);
      expect(result.channels.email?.sent).toBe(true);
      expect(sendEmail).toHaveBeenCalled();
    });

    it('should not send SMS when disabled in preferences', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      // SMS is disabled in mock preferences
      expect(result.channels.sms).toBeUndefined();
    });

    it('should use default preferences for users without saved preferences', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(undefined);

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      // Default preferences have email enabled
      expect(result.success).toBe(true);
      expect(result.channels.email?.sent).toBe(true);
    });

    it('should use guest email for orders without userId', async () => {
      const guestOrder = {
        ...mockOrder,
        userId: null,
        guestEmail: 'guest@example.com',
        user: null,
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(guestOrder);

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(result.success).toBe(true);
      expect(sendEmail).toHaveBeenCalled();
    });

    it('should return error when no contact information available', async () => {
      const orderWithoutContact = {
        ...mockOrder,
        userId: null,
        guestEmail: null,
        guestPhone: null,
        user: null,
      };
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(orderWithoutContact);

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No contact information available for order');
    });

    it('should force specific channels when forceChannels is provided', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce({
        ...mockPreferences,
        emailOrderConfirmation: false, // Disabled in preferences
      });

      await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
        forceChannels: ['email'], // Force email anyway
      });

      expect(sendEmail).toHaveBeenCalled();
    });

    it('should succeed with no channels if all are disabled', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce({
        ...mockPreferences,
        emailOrderConfirmation: false,
        smsOrderConfirmation: false,
      });

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      // Success because no channels enabled is not an error
      expect(result.success).toBe(true);
      expect(result.channels).toEqual({});
    });

    it('should log notification to database', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(db.insert).toHaveBeenCalled();
    });

    it('should return notification IDs', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(result.notificationIds).toContain('notif-123');
    });

    it('should handle email send failure', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
      vi.mocked(sendEmail).mockResolvedValueOnce({ success: false, error: 'SMTP error' });

      const result = await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(result.success).toBe(false);
      expect(result.channels.email?.sent).toBe(false);
      expect(result.channels.email?.error).toBe('SMTP error');
      expect(result.errors).toContain('Email failed: SMTP error');
    });
  });

  // ==========================================================================
  // notifyOrderStatusChange Tests
  // ==========================================================================

  describe('notifyOrderStatusChange', () => {
    it('should send order_confirmation notification for confirmed status', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await notifyOrderStatusChange('order-123', 'confirmed');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });

    it('should send shipped notification for shipped status', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await notifyOrderStatusChange('order-123', 'shipped');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });

    it('should send out_for_delivery notification', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await notifyOrderStatusChange('order-123', 'out_for_delivery');

      expect(result).not.toBeNull();
    });

    it('should send delivered notification for delivered status', async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const result = await notifyOrderStatusChange('order-123', 'delivered');

      expect(result).not.toBeNull();
    });

    it('should return null for status that does not trigger notification', async () => {
      const result = await notifyOrderStatusChange('order-123', 'processing');

      expect(result).toBeNull();
    });

    it('should return null for unknown status', async () => {
      const result = await notifyOrderStatusChange('order-123', 'unknown_status');

      expect(result).toBeNull();
    });

    it('should return null for pending status', async () => {
      const result = await notifyOrderStatusChange('order-123', 'pending');

      expect(result).toBeNull();
    });

    it('should return null for cancelled status', async () => {
      const result = await notifyOrderStatusChange('order-123', 'cancelled');

      expect(result).toBeNull();
    });
  });

  // ==========================================================================
  // getOrderNotifications Tests
  // ==========================================================================

  describe('getOrderNotifications', () => {
    it('should fetch notifications for an order', async () => {
      const mockNotifications = [
        { id: 'notif-1', type: 'order_confirmation', status: 'sent' },
        { id: 'notif-2', type: 'shipped', status: 'sent' },
      ] as unknown as NotificationRow[];
      vi.mocked(db.query.notifications.findMany).mockResolvedValueOnce(mockNotifications);

      const result = await getOrderNotifications('order-123');

      expect(db.query.notifications.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockNotifications);
    });

    it('should return empty array for order with no notifications', async () => {
      vi.mocked(db.query.notifications.findMany).mockResolvedValueOnce([]);

      const result = await getOrderNotifications('order-456');

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // retryNotification Tests
  // ==========================================================================

  describe('retryNotification', () => {
    it('should return error for non-existent notification', async () => {
      vi.mocked(db.query.notifications.findFirst).mockResolvedValueOnce(undefined);

      const result = await retryNotification('non-existent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Notification not found');
    });

    it('should return error for notification not in failed status', async () => {
      vi.mocked(db.query.notifications.findFirst).mockResolvedValueOnce({
        id: 'notif-123',
        orderId: 'order-123',
        type: 'order_confirmation',
        channel: 'email',
        status: 'sent', // Not failed
      } as unknown as NotificationRow);

      const result = await retryNotification('notif-123');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Notification is not in failed status');
    });

    it('should retry failed notification', async () => {
      vi.mocked(db.query.notifications.findFirst).mockResolvedValueOnce({
        id: 'notif-123',
        orderId: 'order-123',
        type: 'order_confirmation',
        channel: 'email',
        status: 'failed',
      } as unknown as NotificationRow);
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      await retryNotification('notif-123');

      expect(sendEmail).toHaveBeenCalled();
    });

    it('should force the original channel when retrying', async () => {
      vi.mocked(db.query.notifications.findFirst).mockResolvedValueOnce({
        id: 'notif-123',
        orderId: 'order-123',
        type: 'order_confirmation',
        channel: 'email',
        status: 'failed',
      } as unknown as NotificationRow);
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce({
        ...mockPreferences,
        emailOrderConfirmation: false, // Even if disabled now
      });

      // Should still try to send email because it forces the channel
      await retryNotification('notif-123');
      expect(sendEmail).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Notification Type Mapping Tests
  // ==========================================================================

  describe('Notification Type Mapping', () => {
    beforeEach(() => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue(mockOrder);
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValue(mockPreferences);
    });

    it('should use order_confirmation template for order_confirmation type', async () => {
      const templates = await import('../../src/services/email-templates');

      await sendOrderNotification({
        orderId: 'order-123',
        type: 'order_confirmation',
      });

      expect(templates.getOrderConfirmationTemplate).toHaveBeenCalled();
    });

    it('should use shipped template for shipped type', async () => {
      const templates = await import('../../src/services/email-templates');

      await sendOrderNotification({
        orderId: 'order-123',
        type: 'shipped',
      });

      expect(templates.getShippedTemplate).toHaveBeenCalled();
    });

    it('should use out_for_delivery template for out_for_delivery type', async () => {
      const templates = await import('../../src/services/email-templates');

      await sendOrderNotification({
        orderId: 'order-123',
        type: 'out_for_delivery',
      });

      expect(templates.getOutForDeliveryTemplate).toHaveBeenCalled();
    });

    it('should use delivered template for delivered type', async () => {
      const templates = await import('../../src/services/email-templates');

      await sendOrderNotification({
        orderId: 'order-123',
        type: 'delivered',
      });

      expect(templates.getDeliveredTemplate).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Service Exports Tests
  // ==========================================================================

  describe('Service Exports', () => {
    it('should export sendOrderNotification function', async () => {
      const notificationService = await import('../../src/services/notifications');
      expect(typeof notificationService.sendOrderNotification).toBe('function');
    });

    it('should export notifyOrderStatusChange function', async () => {
      const notificationService = await import('../../src/services/notifications');
      expect(typeof notificationService.notifyOrderStatusChange).toBe('function');
    });

    it('should export getOrderNotifications function', async () => {
      const notificationService = await import('../../src/services/notifications');
      expect(typeof notificationService.getOrderNotifications).toBe('function');
    });

    it('should export retryNotification function', async () => {
      const notificationService = await import('../../src/services/notifications');
      expect(typeof notificationService.retryNotification).toBe('function');
    });
  });
});
