/**
 * Better Auth Configuration for MasonArt E-Commerce Platform
 *
 * This module configures authentication with:
 * - Drizzle ORM adapter for PostgreSQL
 * - Email/password authentication with email verification
 * - Google OAuth social provider
 * - Admin plugin with RBAC (Role-Based Access Control)
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";
import { db } from "../database";
import * as schema from "../database/schema";

// ============================================================================
// Access Control Statements
// ============================================================================

/**
 * Define permission statements for the platform
 * These extend Better Auth's default statements with custom permissions
 */
const statement = {
  ...defaultStatements,
  // Product permissions
  product: ["create", "read", "update", "delete", "publish"] as const,
  // Order permissions
  order: ["create", "read", "read:own", "update", "cancel", "refund"] as const,
  // Review permissions
  review: ["create", "read", "update", "delete", "moderate"] as const,
  // AI generation permissions
  ai: ["generate", "view:gallery", "moderate"] as const,
  // Trade program permissions
  trade: ["access", "apply", "manage"] as const,
  // Admin-specific permissions
  admin: ["dashboard", "analytics", "settings"] as const,
} as const;

/**
 * Create the access controller with our custom statements
 */
export const ac = createAccessControl(statement);

// ============================================================================
// Role Definitions
// ============================================================================

/**
 * Customer role - Basic authenticated user
 * Can create orders, reviews, and use AI generation
 */
export const customerRole = ac.newRole({
  order: ["create", "read:own"],
  review: ["create", "read"],
  ai: ["generate", "view:gallery"],
});

/**
 * Trade role - Interior designers, architects, etc.
 * Extended permissions for wholesale access
 */
export const tradeRole = ac.newRole({
  order: ["create", "read:own"],
  review: ["create", "read"],
  ai: ["generate", "view:gallery"],
  trade: ["access"],
});

/**
 * Admin role - Full access to admin panel and management
 * Includes all permissions from Better Auth's admin role
 */
export const adminRole = ac.newRole({
  ...adminAc.statements,
  product: ["create", "read", "update", "delete", "publish"],
  order: ["create", "read", "update", "cancel", "refund"],
  review: ["create", "read", "update", "delete", "moderate"],
  ai: ["generate", "view:gallery", "moderate"],
  trade: ["access", "apply", "manage"],
  admin: ["dashboard", "analytics", "settings"],
});

/**
 * Super admin role - System-level access
 * All permissions including user management
 */
export const superAdminRole = ac.newRole({
  ...adminAc.statements,
  product: ["create", "read", "update", "delete", "publish"],
  order: ["create", "read", "update", "cancel", "refund"],
  review: ["create", "read", "update", "delete", "moderate"],
  ai: ["generate", "view:gallery", "moderate"],
  trade: ["access", "apply", "manage"],
  admin: ["dashboard", "analytics", "settings"],
});

// ============================================================================
// Auth Configuration
// ============================================================================

/**
 * Main Better Auth configuration
 */
export const auth = betterAuth({
  /**
   * Base URL for auth callbacks
   * Required for OAuth redirects to work correctly
   */
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",

  /**
   * Secret for signing tokens and cookies
   */
  secret: process.env.BETTER_AUTH_SECRET,

  /**
   * Trusted origins for CORS
   */
  trustedOrigins: [
    process.env.FRONTEND_URL || "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:3001",
  ],

  /**
   * Database configuration using Drizzle adapter
   */
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      // Map schema tables to Better Auth expected names
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  /**
   * Email and password authentication
   */
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Password requirements
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },

  /**
   * Email verification configuration
   */
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24, // 24 hours
    sendVerificationEmail: async ({ user, url, token }, _request) => {
      // TODO: Integrate with Resend email service
      // For now, log the verification URL in development
      if (process.env.NODE_ENV === "development") {
        console.log(`[Auth] Verification email for ${user.email}:`);
        console.log(`[Auth] URL: ${url}`);
        console.log(`[Auth] Token: ${token}`);
      }

      // TODO: Replace with actual email sending logic
      // Example with Resend:
      // await resend.emails.send({
      //   from: 'MasonArt <noreply@masonart.com>',
      //   to: user.email,
      //   subject: 'Verify your email address',
      //   html: `<p>Click <a href="${url}">here</a> to verify your email.</p>`,
      // });
    },
  },

  /**
   * Social OAuth providers
   */
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },

  /**
   * Account linking configuration
   * Allow linking multiple OAuth accounts to same email
   */
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  /**
   * User configuration with additional fields
   */
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
      },
      lastName: {
        type: "string",
        required: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      phoneVerified: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "active",
      },
      tradeStatus: {
        type: "string",
        required: false,
        defaultValue: "none",
      },
      aiCreditsRemaining: {
        type: "number",
        required: false,
        defaultValue: 5,
      },
      aiSubscriptionTier: {
        type: "string",
        required: false,
        defaultValue: "free",
      },
      lastLoginAt: {
        type: "date",
        required: false,
      },
    },
    // Enable change email feature
    changeEmail: {
      enabled: true,
    },
  },

  /**
   * Session configuration
   */
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // Cache for 5 minutes
    },
  },

  /**
   * Plugins
   */
  plugins: [
    /**
     * Admin plugin for user management and RBAC
     */
    admin({
      ac,
      roles: {
        customer: customerRole,
        trade: tradeRole,
        admin: adminRole,
        "super-admin": superAdminRole,
      },
      // Default role for new users
      defaultRole: "customer",
      // Allow admins to impersonate other users (for debugging)
      allowImpersonatingAdmins: false,
    }),
  ],

  /**
   * Advanced configuration
   */
  advanced: {
    // Use secure cookies in production
    useSecureCookies: process.env.NODE_ENV === "production",
    // Cookie prefix
    cookiePrefix: "masonart",
    // Generate secure session tokens
    generateId: () => crypto.randomUUID(),
  },
});

// ============================================================================
// Type Exports
// ============================================================================

/**
 * Export auth type for use in middleware and route handlers
 */
export type Auth = typeof auth;

/**
 * User role type matching the database enum
 */
export type UserRole = "customer" | "trade" | "admin" | "super-admin";

/**
 * Session type from Better Auth
 */
export type Session = typeof auth.$Infer.Session;

/**
 * User type from Better Auth
 */
export type User = typeof auth.$Infer.Session.user;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validation result type for auth configuration
 */
export interface AuthConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate auth configuration
 * Checks that all required environment variables are set
 * and validates their format
 */
export function validateAuthConfig(): AuthConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  if (!process.env.BETTER_AUTH_SECRET) {
    errors.push("BETTER_AUTH_SECRET is required");
  } else if (process.env.BETTER_AUTH_SECRET.length < 32) {
    errors.push("BETTER_AUTH_SECRET must be at least 32 characters");
  }

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required for auth");
  }

  // Check Google OAuth configuration
  const hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;

  if (hasGoogleClientId !== hasGoogleClientSecret) {
    warnings.push(
      "Google OAuth partially configured - both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET should be set"
    );
  }

  // Check base URL format
  const baseURL = process.env.BETTER_AUTH_URL;
  if (baseURL && !baseURL.match(/^https?:\/\//)) {
    warnings.push("BETTER_AUTH_URL should start with http:// or https://");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get the current session from a request
 * Returns null if no valid session exists
 */
export async function getSession(request: Request): Promise<Session | null> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    return session;
  } catch {
    return null;
  }
}

/**
 * Require authentication for a request
 * Throws an error if no valid session exists
 */
export async function requireAuth(request: Request): Promise<Session> {
  const session = await getSession(request);
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}
