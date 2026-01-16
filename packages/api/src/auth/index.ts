import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDatabase } from '../db/index.js';
import * as schema from '../db/schema.js';

/**
 * Better Auth Configuration
 *
 * Configures the Better Auth authentication system for the MasonArt platform.
 * Provides user authentication, session management, and social provider integration.
 *
 * Features:
 * - Email/password authentication
 * - Google OAuth integration
 * - Session-based authentication with secure cookies
 * - PostgreSQL database storage via Drizzle ORM
 * - CSRF protection
 *
 * @see https://www.better-auth.com/docs
 */

// Validate required environment variables
const requiredEnvVars = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};

// Check for missing environment variables (only in non-test environments)
if (process.env.NODE_ENV !== 'test') {
  const missing = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.warn(`⚠️  Warning: Missing environment variables: ${missing.join(', ')}`);
  }
}

// Get the database instance
const { db } = createDatabase();

/**
 * Create and configure the Better Auth instance
 */
export const auth = betterAuth({
  // Database adapter using Drizzle ORM
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
    },
  }),

  // Base URL for auth endpoints
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',

  // Secret key for signing tokens and cookies
  secret: process.env.BETTER_AUTH_SECRET || 'fallback-secret-for-testing-only-minimum-32-characters',

  // Email and password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  // Social providers
  socialProviders: {
    google: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          redirectURI: `${process.env.BETTER_AUTH_URL || 'http://localhost:3000'}/api/auth/callback/google`,
        }
      : undefined,
  },

  // Advanced options
  advanced: {
    cookiePrefix: 'masonart',
    useSecureCookies: process.env.NODE_ENV === 'production',
    crossSubDomainCookies: {
      enabled: false,
    },
    generateId: false, // Use database-generated UUIDs
  },

  // Trust proxy headers (for production behind reverse proxy)
  trustedOrigins: process.env.VITE_WEB_URL
    ? [process.env.VITE_WEB_URL]
    : ['http://localhost:3001'],
});

/**
 * Export auth types for type safety across the application
 */
export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.User;

/**
 * Helper function to get the current session from a request
 * @param request - The incoming HTTP request
 * @returns Session object or null if not authenticated
 */
export async function getSession(request: Request): Promise<Session | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session;
  } catch {
    return null;
  }
}

/**
 * Helper function to require authentication
 * @param request - The incoming HTTP request
 * @returns Session object or throws error
 * @throws Error if not authenticated
 */
export async function requireAuth(request: Request): Promise<Session> {
  const session = await getSession(request);
  if (!session) {
    throw new Error('Authentication required');
  }
  return session;
}

/**
 * Validate auth configuration on module load
 */
export function validateAuthConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check secret key
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    errors.push('BETTER_AUTH_SECRET is required');
  } else if (secret.length < 32) {
    errors.push('BETTER_AUTH_SECRET must be at least 32 characters');
  } else if (secret === 'fallback-secret-for-testing-only-minimum-32-characters') {
    warnings.push('Using fallback secret key (not secure for production)');
  }

  // Check base URL
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!baseURL && process.env.NODE_ENV !== 'test') {
    warnings.push('BETTER_AUTH_URL not set, using default');
  }

  // Check database URL
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required for auth');
  }

  // Check Google OAuth
  const hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  if (hasGoogleClientId !== hasGoogleClientSecret) {
    warnings.push('Google OAuth partially configured (need both CLIENT_ID and CLIENT_SECRET)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export default auth;
