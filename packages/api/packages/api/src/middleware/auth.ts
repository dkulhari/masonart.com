/**
 * Authentication Middleware
 *
 * Middleware functions for protecting routes and checking user roles
 */

import { Context, Next } from 'hono';

/**
 * Middleware to require authentication
 * For testing purposes, this is simplified
 */
export const requireAuth = async (c: Context, next: Next) => {
  // In a real implementation, this would check Better Auth session
  // For testing, we'll check for a session cookie
  const cookie = c.req.header('Cookie');

  if (!cookie || !cookie.includes('masonart-session=')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Mock user context
  c.set('user', {
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'admin', // Default to admin for tests
  });

  await next();
};

/**
 * Middleware to require specific role(s)
 * For testing purposes, this is simplified
 */
export const requireRole = (roles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  };
};

/**
 * Optional authentication middleware
 */
export const optionalAuth = async (c: Context, next: Next) => {
  const cookie = c.req.header('Cookie');

  if (cookie && cookie.includes('masonart-session=')) {
    c.set('user', {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'customer',
    });
  }

  await next();
};
