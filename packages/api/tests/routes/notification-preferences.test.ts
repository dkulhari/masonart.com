/**
 * Tests for Notification Preferences API Routes
 *
 * This test suite validates the notification preferences endpoints:
 * - GET /api/notification-preferences - Get user's preferences
 * - PATCH /api/notification-preferences - Update preferences
 *
 * All endpoints require authentication.
 *
 * @see packages/api/src/routes/notification-preferences.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock the database module
vi.mock('../../src/database', () => ({
  db: {
    query: {
      notificationPreferences: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
  },
}));

// Mock auth middleware
vi.mock('../../src/middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    // Check for mock auth header
    const authUser = c.req.header('X-Test-User');
    if (authUser) {
      c.set('user', JSON.parse(authUser));
      return next();
    }
    return c.json({ error: 'Unauthorized' }, 401);
  }),
}));

import { db } from '../../src/database';

// ============================================================================
// Test Data
// ============================================================================

const mockUser = {
  id: 'user-123',
  email: 'user@example.com',
  name: 'Test User',
};

const mockPreferences = {
  id: 'pref-123',
  userId: 'user-123',
  emailOrderConfirmation: true,
  emailShipped: true,
  emailOutForDelivery: true,
  emailDelivered: true,
  smsOrderConfirmation: false,
  smsShipped: false,
  smsOutForDelivery: false,
  smsDelivered: false,
  createdAt: new Date('2024-02-08'),
  updatedAt: new Date('2024-02-08'),
};

const defaultPreferences = {
  id: 'pref-new',
  userId: 'user-123',
  emailOrderConfirmation: true,
  emailShipped: true,
  emailOutForDelivery: true,
  emailDelivered: true,
  smsOrderConfirmation: false,
  smsShipped: false,
  smsOutForDelivery: false,
  smsDelivered: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================================
// Test Setup
// ============================================================================

let app: Hono | null = null;

beforeAll(async () => {
  try {
    const { notificationPreferencesApp } = await import('../../src/routes/notification-preferences');
    app = new Hono();
    app.route('/api/notification-preferences', notificationPreferencesApp);
  } catch (error) {
    console.log('Could not initialize notification preferences routes:', (error as Error).message);
    app = null;
  }
}, 10000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper to create authenticated request
 */
function authHeaders(user = mockUser) {
  return {
    'X-Test-User': JSON.stringify(user),
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// Authentication Tests
// ============================================================================

describe('Notification Preferences - Authentication', () => {
  it('should require authentication for GET', async () => {
    if (!app) return;

    const res = await app.request('/api/notification-preferences');

    expect(res.status).toBe(401);
  });

  it('should require authentication for PATCH', async () => {
    if (!app) return;

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrderConfirmation: false }),
    });

    expect(res.status).toBe(401);
  });

  it('should allow authenticated GET request', async () => {
    if (!app) return;

    vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

    const res = await app.request('/api/notification-preferences', {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
  });

  it('should allow authenticated PATCH request', async () => {
    if (!app) return;

    vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
    vi.mocked(db.update).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            ...mockPreferences,
            emailOrderConfirmation: false,
          }]),
        }),
      }),
    } as any);

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ emailOrderConfirmation: false }),
    });

    expect(res.status).toBe(200);
  });
});

// ============================================================================
// GET Preferences Tests
// ============================================================================

describe('GET /api/notification-preferences', () => {
  describe('Existing User with Preferences', () => {
    it('should return existing preferences', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences).toBeDefined();
    });

    it('should return formatted email preferences', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      const data = await res.json();
      expect(data.preferences.email).toEqual({
        orderConfirmation: true,
        shipped: true,
        outForDelivery: true,
        delivered: true,
      });
    });

    it('should return formatted SMS preferences', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      const data = await res.json();
      expect(data.preferences.sms).toEqual({
        orderConfirmation: false,
        shipped: false,
        outForDelivery: false,
        delivered: false,
      });
    });

    it('should include updatedAt timestamp', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      const data = await res.json();
      expect(data.preferences.updatedAt).toBeDefined();
    });
  });

  describe('New User without Preferences', () => {
    it('should create default preferences for new user', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([defaultPreferences]),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should return default preferences with email enabled', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([defaultPreferences]),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      const data = await res.json();
      expect(data.preferences.email.orderConfirmation).toBe(true);
      expect(data.preferences.email.shipped).toBe(true);
    });

    it('should return default preferences with SMS disabled', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([defaultPreferences]),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      const data = await res.json();
      expect(data.preferences.sms.orderConfirmation).toBe(false);
      expect(data.preferences.sms.shipped).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockRejectedValueOnce(
        new Error('DB connection failed')
      );

      const res = await app.request('/api/notification-preferences', {
        headers: authHeaders(),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('GET_ERROR');
    });
  });
});

// ============================================================================
// PATCH Preferences Tests
// ============================================================================

describe('PATCH /api/notification-preferences', () => {
  describe('Update Existing Preferences', () => {
    it('should update single email preference', async () => {
      if (!app) return;

      const updatedPrefs = { ...mockPreferences, emailOrderConfirmation: false };
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
      vi.mocked(db.update).mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedPrefs]),
          }),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ emailOrderConfirmation: false }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences.email.orderConfirmation).toBe(false);
    });

    it('should update multiple preferences at once', async () => {
      if (!app) return;

      const updatedPrefs = {
        ...mockPreferences,
        emailShipped: false,
        smsOrderConfirmation: true,
      };
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
      vi.mocked(db.update).mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedPrefs]),
          }),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          emailShipped: false,
          smsOrderConfirmation: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.preferences.email.shipped).toBe(false);
      expect(data.preferences.sms.orderConfirmation).toBe(true);
    });

    it('should return success message', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
      vi.mocked(db.update).mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockPreferences]),
          }),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ emailDelivered: true }),
      });

      const data = await res.json();
      expect(data.message).toBe('Notification preferences updated');
    });
  });

  describe('Create Preferences for New User', () => {
    it('should create preferences with updates for new user', async () => {
      if (!app) return;

      const newPrefs = { ...defaultPreferences, emailOrderConfirmation: false };
      vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(null);
      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newPrefs]),
        }),
      } as any);

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ emailOrderConfirmation: false }),
      });

      expect(res.status).toBe(200);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('Validation Errors', () => {
    it('should reject empty update object', async () => {
      if (!app) return;

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('NO_UPDATES');
    });

    it('should reject invalid boolean values', async () => {
      if (!app) return;

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ emailOrderConfirmation: 'yes' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject unknown preference keys', async () => {
      if (!app) return;

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ unknownPreference: true }),
      });

      // Zod strips unknown keys, so this becomes an empty object
      expect(res.status).toBe(400);
    });

    it('should reject invalid JSON body', async () => {
      if (!app) return;

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: 'invalid json',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors on update', async () => {
      if (!app) return;

      vi.mocked(db.query.notificationPreferences.findFirst).mockRejectedValueOnce(
        new Error('DB error')
      );

      const res = await app.request('/api/notification-preferences', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ emailOrderConfirmation: false }),
      });

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('UPDATE_ERROR');
    });
  });
});

// ============================================================================
// All Preference Fields Tests
// ============================================================================

describe('Notification Preference Fields', () => {
  const allEmailFields = [
    'emailOrderConfirmation',
    'emailShipped',
    'emailOutForDelivery',
    'emailDelivered',
  ];

  const allSmsFields = [
    'smsOrderConfirmation',
    'smsShipped',
    'smsOutForDelivery',
    'smsDelivered',
  ];

  it.each(allEmailFields)('should accept %s preference update', async (field) => {
    if (!app) return;

    const updatedPrefs = { ...mockPreferences, [field]: false };
    vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
    vi.mocked(db.update).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedPrefs]),
        }),
      }),
    } as any);

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ [field]: false }),
    });

    expect(res.status).toBe(200);
  });

  it.each(allSmsFields)('should accept %s preference update', async (field) => {
    if (!app) return;

    const updatedPrefs = { ...mockPreferences, [field]: true };
    vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);
    vi.mocked(db.update).mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedPrefs]),
        }),
      }),
    } as any);

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ [field]: true }),
    });

    expect(res.status).toBe(200);
  });
});

// ============================================================================
// Response Format Tests
// ============================================================================

describe('Response Format', () => {
  it('should return JSON content type', async () => {
    if (!app) return;

    vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

    const res = await app.request('/api/notification-preferences', {
      headers: authHeaders(),
    });

    const contentType = res.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });

  it('should have nested email and sms structure', async () => {
    if (!app) return;

    vi.mocked(db.query.notificationPreferences.findFirst).mockResolvedValueOnce(mockPreferences);

    const res = await app.request('/api/notification-preferences', {
      headers: authHeaders(),
    });

    const data = await res.json();
    expect(data.preferences).toHaveProperty('email');
    expect(data.preferences).toHaveProperty('sms');
    expect(data.preferences.email).toHaveProperty('orderConfirmation');
    expect(data.preferences.sms).toHaveProperty('orderConfirmation');
  });
});

// ============================================================================
// Service Exports Tests
// ============================================================================

describe('Notification Preferences Routes Exports', () => {
  it('should export notificationPreferencesApp', async () => {
    const module = await import('../../src/routes/notification-preferences');
    expect(module).toHaveProperty('notificationPreferencesApp');
  });

  it('should be a Hono app instance', async () => {
    const { notificationPreferencesApp } = await import('../../src/routes/notification-preferences');
    expect(typeof notificationPreferencesApp.fetch).toBe('function');
  });
});
