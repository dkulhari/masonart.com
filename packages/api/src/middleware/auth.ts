/**
 * Auth Middleware for Protected Routes
 *
 * This module provides Hono middleware for authentication and authorization:
 * - requireAuth: Requires a valid session
 * - requireRole: Requires specific user role(s)
 * - optionalAuth: Attaches user if authenticated, but doesn't require it
 * - requirePermission: Requires specific permission(s) based on RBAC
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth, type UserRole } from "../auth";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Session user type with all Better Auth and custom fields
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  role: UserRole;
  // Custom chobii.art fields
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  phoneVerified?: boolean;
  status?: string;
  tradeStatus?: string;
  aiCreditsRemaining?: number;
  aiSubscriptionTier?: string;
}

/**
 * Session type from Better Auth
 */
export interface AuthSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Variables added to Hono context by auth middleware
 */
export interface AuthVariables {
  user: AuthUser;
  session: AuthSession;
}

/**
 * Optional auth variables (user and session may be null)
 */
export interface OptionalAuthVariables {
  user: AuthUser | null;
  session: AuthSession | null;
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Create a standardized 401 Unauthorized error
 */
export function createUnauthorizedError(message = "Unauthorized"): HTTPException {
  return new HTTPException(401, {
    message,
    res: new Response(
      JSON.stringify({
        error: "Unauthorized",
        message,
        code: "UNAUTHORIZED",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    ),
  });
}

/**
 * Create a standardized 403 Forbidden error
 */
export function createForbiddenError(message = "Forbidden"): HTTPException {
  return new HTTPException(403, {
    message,
    res: new Response(
      JSON.stringify({
        error: "Forbidden",
        message,
        code: "FORBIDDEN",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    ),
  });
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Require authenticated session
 *
 * This middleware:
 * 1. Gets session from Better Auth using request headers
 * 2. Throws 401 if no valid session exists
 * 3. Sets user and session on context for downstream handlers
 *
 * @example
 * ```typescript
 * app.get('/api/profile', requireAuth, async (c) => {
 *   const user = c.get('user');
 *   return c.json({ user });
 * });
 * ```
 */
export const requireAuth = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session || !session.user) {
      throw createUnauthorizedError("Authentication required");
    }

    // Check if user is active
    const userStatus = (session.user as AuthUser).status;
    if (userStatus && userStatus !== "active") {
      throw createForbiddenError(`Account is ${userStatus}`);
    }

    // Set user and session on context
    c.set("user", session.user as AuthUser);
    c.set("session", session.session as AuthSession);

    await next();
  } catch (error) {
    // Re-throw HTTPException as-is
    if (error instanceof HTTPException) {
      throw error;
    }

    // Handle other errors (e.g., database issues)
    throw createUnauthorizedError("Invalid or expired session");
  }
});

/**
 * Optional authentication
 *
 * Similar to requireAuth but doesn't throw if no session exists.
 * Useful for routes that work with or without authentication.
 *
 * @example
 * ```typescript
 * app.get('/api/products', optionalAuth, async (c) => {
 *   const user = c.get('user'); // May be null
 *   // Show personalized content if logged in
 * });
 * ```
 */
export const optionalAuth = createMiddleware<{
  Variables: OptionalAuthVariables;
}>(async (c, next) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session?.user) {
      c.set("user", session.user as AuthUser);
      c.set("session", session.session as AuthSession);
    } else {
      c.set("user", null);
      c.set("session", null);
    }
  } catch {
    // Silently ignore auth errors for optional auth
    c.set("user", null);
    c.set("session", null);
  }

  await next();
});

/**
 * Require specific role(s)
 *
 * Must be used after requireAuth middleware.
 * Checks if the authenticated user has one of the specified roles.
 *
 * @param roles - Single role or array of allowed roles
 *
 * @example
 * ```typescript
 * // Single role
 * app.get('/api/admin/users', requireAuth, requireRole('admin'), handler);
 *
 * // Multiple roles
 * app.get('/api/admin/dashboard', requireAuth, requireRole(['admin', 'super-admin']), handler);
 * ```
 */
export function requireRole(roles: UserRole | UserRole[]) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return createMiddleware<{
    Variables: AuthVariables;
  }>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw createUnauthorizedError("Authentication required");
    }

    const userRole = user.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      throw createForbiddenError(
        `Access denied. Required role: ${allowedRoles.join(" or ")}`
      );
    }

    await next();
  });
}

/**
 * Require admin role (admin or super-admin)
 *
 * Convenience middleware for admin-only routes.
 * Must be used after requireAuth middleware.
 *
 * @example
 * ```typescript
 * app.use('/api/admin/*', requireAuth, requireAdmin);
 * ```
 */
export const requireAdmin = requireRole(["admin", "super-admin"]);

/**
 * Require content management access (content-manager, admin, or super-admin)
 *
 * Gates product/content management routes. Content-managers can manage the
 * catalog but have no access to orders, customers, or other admin areas.
 * Must be used after requireAuth middleware.
 *
 * @example
 * ```typescript
 * app.use('/api/admin/products/*', requireAuth, requireContentManager);
 * ```
 */
export const requireContentManager = requireRole([
  "content-manager",
  "admin",
  "super-admin",
]);

/**
 * Require trade program access
 *
 * Checks if user has trade role OR admin role.
 * Must be used after requireAuth middleware.
 *
 * @example
 * ```typescript
 * app.get('/api/trade/pricing', requireAuth, requireTrade, handler);
 * ```
 */
export const requireTrade = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    throw createUnauthorizedError("Authentication required");
  }

  const hasTradeAccess =
    user.role === "trade" ||
    user.role === "admin" ||
    user.role === "super-admin" ||
    user.tradeStatus === "approved";

  if (!hasTradeAccess) {
    throw createForbiddenError("Trade program access required");
  }

  await next();
});

/**
 * Require email verification
 *
 * Ensures the user's email is verified.
 * Must be used after requireAuth middleware.
 *
 * @example
 * ```typescript
 * app.post('/api/orders', requireAuth, requireVerified, handler);
 * ```
 */
export const requireVerified = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    throw createUnauthorizedError("Authentication required");
  }

  if (!user.emailVerified) {
    throw createForbiddenError("Email verification required");
  }

  await next();
});

/**
 * Check AI credits availability
 *
 * Ensures the user has available AI generation credits.
 * Must be used after requireAuth middleware.
 *
 * @param creditsRequired - Number of credits needed (default: 1)
 *
 * @example
 * ```typescript
 * app.post('/api/ai/generate', requireAuth, requireAICredits(1), handler);
 * ```
 */
export function requireAICredits(creditsRequired = 1) {
  return createMiddleware<{
    Variables: AuthVariables;
  }>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw createUnauthorizedError("Authentication required");
    }

    const credits = user.aiCreditsRemaining ?? 0;

    // Unlimited tier always has access
    if (user.aiSubscriptionTier === "unlimited") {
      await next();
      return;
    }

    if (credits < creditsRequired) {
      throw createForbiddenError(
        `Insufficient AI credits. Required: ${creditsRequired}, Available: ${credits}`
      );
    }

    await next();
  });
}

/**
 * Rate limit by user
 *
 * Helper to get user ID for rate limiting.
 * Falls back to IP address for unauthenticated requests.
 *
 * @example
 * ```typescript
 * import { rateLimiter } from 'hono-rate-limiter';
 *
 * app.use('/api/ai/*', rateLimiter({
 *   keyGenerator: (c) => getUserRateLimitKey(c),
 *   limit: 10,
 *   windowMs: 60000,
 * }));
 * ```
 */
export function getUserRateLimitKey(c: {
  get: (key: "user") => AuthUser | null | undefined;
  req: { header: (name: string) => string | undefined };
}): string {
  const user = c.get("user");
  if (user?.id) {
    return `user:${user.id}`;
  }

  // Fall back to IP for unauthenticated requests
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  return `ip:${ip}`;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if user has specific role
 */
export function hasRole(user: AuthUser | null, role: UserRole): boolean {
  return user?.role === role;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(
  user: AuthUser | null,
  roles: UserRole[]
): boolean {
  return user?.role ? roles.includes(user.role) : false;
}

/**
 * Check if user is admin (admin or super-admin)
 */
export function isAdmin(user: AuthUser | null): boolean {
  return hasAnyRole(user, ["admin", "super-admin"]);
}

/**
 * Check if user can manage content (content-manager, admin, or super-admin)
 */
export function isContentManager(user: AuthUser | null): boolean {
  return hasAnyRole(user, ["content-manager", "admin", "super-admin"]);
}

/**
 * Check if user can access resource
 *
 * Useful for checking ownership or admin access
 *
 * @example
 * ```typescript
 * const order = await getOrder(orderId);
 * if (!canAccess(user, order.userId)) {
 *   throw new Error('Access denied');
 * }
 * ```
 */
export function canAccess(
  user: AuthUser | null,
  resourceOwnerId: string
): boolean {
  if (!user) return false;
  // Admins can access everything
  if (isAdmin(user)) return true;
  // Users can only access their own resources
  return user.id === resourceOwnerId;
}
