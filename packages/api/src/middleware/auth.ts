import { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { auth, getSession } from '../auth/index.js';

/**
 * Authentication Middleware
 *
 * Provides middleware functions for protecting routes with authentication.
 * Integrates with Better Auth to verify user sessions and enforce authorization.
 *
 * Available middleware:
 * - requireAuth: Requires authentication, returns 401 if not authenticated
 * - optionalAuth: Attaches session to context if available (optional)
 * - requireRole: Requires specific role (e.g., admin)
 * - requireAdmin: Requires admin role
 */

/**
 * Extended context type with session
 */
export interface AuthContext {
  user: {
    id: string;
    email: string;
    name?: string;
    role?: string;
    emailVerified?: boolean;
    image?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token?: string;
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Middleware that requires authentication
 * Returns 401 Unauthorized if no valid session exists
 *
 * @example
 * app.get('/api/profile', requireAuth, (c) => {
 *   const { user, session } = c.get('auth');
 *   return c.json({ user });
 * });
 */
export const requireAuth = createMiddleware(async (c: Context, next: Next) => {
  try {
    const request = c.req.raw;
    const session = await getSession(request);

    if (!session || !session.user) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
        },
        401
      );
    }

    // Attach auth info to context
    c.set('auth', {
      user: session.user,
      session: session.session,
    });

    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Invalid or expired session',
      },
      401
    );
  }
});

/**
 * Middleware that optionally attaches authentication
 * Does not block the request if user is not authenticated
 *
 * @example
 * app.get('/api/products', optionalAuth, (c) => {
 *   const auth = c.get('auth');
 *   const isAuthenticated = !!auth;
 *   return c.json({ isAuthenticated });
 * });
 */
export const optionalAuth = createMiddleware(async (c: Context, next: Next) => {
  try {
    const request = c.req.raw;
    const session = await getSession(request);

    if (session && session.user) {
      c.set('auth', {
        user: session.user,
        session: session.session,
      });
    } else {
      c.set('auth', null);
    }

    await next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    c.set('auth', null);
    await next();
  }
});

/**
 * Middleware that requires a specific role
 * Returns 403 Forbidden if user doesn't have required role
 *
 * @param role - Required role (e.g., 'admin', 'moderator')
 *
 * @example
 * app.delete('/api/products/:id', requireRole('admin'), (c) => {
 *   // Only admins can delete products
 * });
 */
export const requireRole = (role: string) => {
  return createMiddleware(async (c: Context, next: Next) => {
    // First ensure user is authenticated
    const auth = c.get('auth') as AuthContext | null;

    if (!auth || !auth.user) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
        },
        401
      );
    }

    // Check if user has required role
    const userRole = auth.user.role || 'customer';
    if (userRole !== role) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Access denied. Required role: ${role}`,
        },
        403
      );
    }

    await next();
  });
};

/**
 * Middleware that requires admin role
 * Convenience function for requireRole('admin')
 *
 * @example
 * app.get('/api/admin/dashboard', requireAdmin, (c) => {
 *   return c.json({ message: 'Admin dashboard' });
 * });
 */
export const requireAdmin = createMiddleware(async (c: Context, next: Next) => {
  const auth = c.get('auth') as AuthContext | null;

  if (!auth || !auth.user) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required',
      },
      401
    );
  }

  const userRole = auth.user.role || 'customer';
  if (userRole !== 'admin') {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Admin access required',
      },
      403
    );
  }

  await next();
});

/**
 * Middleware that checks if user's email is verified
 * Returns 403 Forbidden if email is not verified
 *
 * @example
 * app.post('/api/orders', requireAuth, requireEmailVerified, (c) => {
 *   // Only users with verified emails can create orders
 * });
 */
export const requireEmailVerified = createMiddleware(async (c: Context, next: Next) => {
  const auth = c.get('auth') as AuthContext | null;

  if (!auth || !auth.user) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Authentication required',
      },
      401
    );
  }

  if (!auth.user.emailVerified) {
    return c.json(
      {
        error: 'Forbidden',
        message: 'Email verification required',
      },
      403
    );
  }

  await next();
});

/**
 * Export auth handler for mounting on /api/auth
 * This handles all Better Auth routes (sign-in, sign-up, callback, etc.)
 */
export const authHandler = async (c: Context) => {
  const request = c.req.raw;
  const response = await auth.handler(request);
  return response;
};

export default {
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireEmailVerified,
  authHandler,
};
