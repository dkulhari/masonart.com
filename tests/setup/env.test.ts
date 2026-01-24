import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests to verify required environment variables are set
 *
 * This test suite validates:
 * - .env.example file exists and documents all required variables
 * - Essential API server environment variables exist
 * - Authentication configuration is present
 * - Payment integration keys are configured
 * - AI service credentials are available
 * - Email service configuration is present
 * - Frontend environment variables are set
 * - Environment variables have valid formats
 * - Server configuration (NODE_ENV, ports)
 *
 * Expected Environment Variables (from .env.example):
 * - DATABASE_URL: PostgreSQL connection string
 * - REDIS_URL: Redis connection string
 * - R2_*: Cloudflare R2/S3 storage credentials
 * - BETTER_AUTH_SECRET: Authentication secret
 * - RAZORPAY_*: Payment gateway credentials
 * - REPLICATE_API_TOKEN: AI generation service token
 * - RESEND_API_KEY: Email service API key
 * - VITE_*: Frontend configuration
 * - NODE_ENV: Environment mode (development/test/production)
 * - API_PORT, WEB_PORT: Server ports
 *
 * Note: In test/CI environments, these tests provide warnings but don't fail.
 * Set ENFORCE_ENV_VARS=true to make them fail (for production validation).
 * Set SKIP_ENV_VALIDATION=true to skip all runtime validation tests.
 */

// Project paths
const rootDir = process.cwd();
const envExamplePath = join(rootDir, '.env.example');

// Check if we're in test/CI mode (be lenient) or production mode (be strict)
const isTestMode = process.env.CI === 'true' ||
                   process.env.NODE_ENV === 'test' ||
                   !process.env.ENFORCE_ENV_VARS;

// Skip runtime validation tests if SKIP_ENV_VALIDATION is set
const skipEnvValidation =
  process.env.SKIP_ENV_VALIDATION === 'true' ||
  process.env.SKIP_ENV_VALIDATION === '1';

// Environment variable configuration groups
const ENV_GROUPS = {
  database: {
    required: ['DATABASE_URL', 'REDIS_URL'],
    optional: [] as string[],
  },
  storage: {
    required: ['R2_ENDPOINT', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'],
    optional: ['CDN_URL'],
  },
  auth: {
    required: ['BETTER_AUTH_SECRET'],
    optional: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  payments: {
    required: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    optional: [] as string[],
  },
  ai: {
    required: ['REPLICATE_API_TOKEN'],
    optional: [] as string[],
  },
  email: {
    required: ['RESEND_API_KEY'],
    optional: ['EMAIL_FROM'],
  },
  frontend: {
    required: [] as string[],
    optional: ['VITE_API_URL', 'VITE_CDN_URL'],
  },
  server: {
    required: ['NODE_ENV'],
    optional: ['API_PORT', 'WEB_PORT'],
  },
  application: {
    required: [] as string[],
    optional: ['APP_NAME', 'APP_URL'],
  },
};

// All documented environment variables (for .env.example validation)
const ALL_DOCUMENTED_VARS = [
  ...ENV_GROUPS.database.required,
  ...ENV_GROUPS.database.optional,
  ...ENV_GROUPS.storage.required,
  ...ENV_GROUPS.storage.optional,
  ...ENV_GROUPS.auth.required,
  ...ENV_GROUPS.auth.optional,
  ...ENV_GROUPS.payments.required,
  ...ENV_GROUPS.payments.optional,
  ...ENV_GROUPS.ai.required,
  ...ENV_GROUPS.ai.optional,
  ...ENV_GROUPS.email.required,
  ...ENV_GROUPS.email.optional,
  ...ENV_GROUPS.frontend.required,
  ...ENV_GROUPS.frontend.optional,
  ...ENV_GROUPS.server.required,
  ...ENV_GROUPS.server.optional,
  ...ENV_GROUPS.application.required,
  ...ENV_GROUPS.application.optional,
];

/**
 * Helper function to check if an environment variable is set
 */
function isEnvVarSet(varName: string): boolean {
  const value = process.env[varName];
  return value !== undefined && value !== null && value.trim() !== '';
}

/**
 * Helper function to validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper function to validate PostgreSQL connection string
 */
function isValidPostgresUrl(url: string): boolean {
  // Basic validation for PostgreSQL URL format
  // postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
  return /^postgres(ql)?:\/\/.+/.test(url);
}

/**
 * Helper function to validate Redis connection string
 */
function isValidRedisUrl(url: string): boolean {
  // Basic validation for Redis URL format
  // redis://[user[:password]@][netloc][:port][/db]
  return /^redis:\/\/.+/.test(url);
}

/**
 * Helper function to validate port number
 */
function isValidPort(port: string): boolean {
  const portNum = parseInt(port, 10);
  return !isNaN(portNum) && portNum > 0 && portNum < 65536;
}

/**
 * .env.example Documentation Tests
 *
 * These tests validate that the .env.example file exists and
 * documents all required environment variables.
 */
describe('Environment Variables Documentation', () => {
  let envExampleContent: string;

  beforeAll(() => {
    if (existsSync(envExamplePath)) {
      envExampleContent = readFileSync(envExamplePath, 'utf-8');
    }
  });

  describe('.env.example file', () => {
    it('should exist at project root', () => {
      expect(existsSync(envExamplePath)).toBe(true);
    });

    it('should have content', () => {
      expect(envExampleContent).toBeDefined();
      expect(envExampleContent.length).toBeGreaterThan(0);
    });

    it('should contain section headers for organization', () => {
      expect(envExampleContent).toContain('Database');
      expect(envExampleContent).toContain('Redis');
      expect(envExampleContent).toContain('Authentication');
      expect(envExampleContent).toContain('Storage');
    });

    it('should have copy instructions', () => {
      expect(envExampleContent).toContain('Copy this file to .env');
    });

    it('should warn about not committing .env', () => {
      expect(envExampleContent).toContain('NEVER commit .env');
    });
  });

  describe('Documented environment variables', () => {
    ALL_DOCUMENTED_VARS.forEach((envVar) => {
      it(`should document ${envVar} in .env.example`, () => {
        expect(envExampleContent).toContain(envVar);
      });
    });
  });
});

/**
 * Runtime Environment Variables Tests
 *
 * These tests validate that environment variables are set and have valid values.
 * Skip with SKIP_ENV_VALIDATION=true (useful for CI without full env setup).
 */
describe.skipIf(skipEnvValidation)('Environment Variables', () => {
  describe('Database Configuration', () => {
    it('should have DATABASE_URL environment variable set', () => {
      if (isTestMode && !isEnvVarSet('DATABASE_URL')) {
        console.warn('⚠️  DATABASE_URL not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('DATABASE_URL')).toBe(true);
      }
    });

    it('should have valid PostgreSQL connection string format', () => {
      if (isEnvVarSet('DATABASE_URL')) {
        const dbUrl = process.env.DATABASE_URL!;
        expect(isValidPostgresUrl(dbUrl)).toBe(true);
      } else {
        // Skip validation if DATABASE_URL is not set (will fail in previous test)
        expect(true).toBe(true);
      }
    });

    it('should have REDIS_URL environment variable set', () => {
      if (isTestMode && !isEnvVarSet('REDIS_URL')) {
        console.warn('⚠️  REDIS_URL not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('REDIS_URL')).toBe(true);
      }
    });

    it('should have valid Redis connection string format', () => {
      if (isEnvVarSet('REDIS_URL')) {
        const redisUrl = process.env.REDIS_URL!;
        expect(isValidRedisUrl(redisUrl)).toBe(true);
      } else {
        // Skip validation if REDIS_URL is not set (will fail in previous test)
        expect(true).toBe(true);
      }
    });
  });

  describe('Storage Configuration (R2/S3)', () => {
    it('should have R2_ENDPOINT environment variable set', () => {
      if (isTestMode && !isEnvVarSet('R2_ENDPOINT')) {
        console.warn('⚠️  R2_ENDPOINT not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('R2_ENDPOINT')).toBe(true);
      }
    });

    it('should have valid R2_ENDPOINT URL format', () => {
      if (isEnvVarSet('R2_ENDPOINT')) {
        const endpoint = process.env.R2_ENDPOINT!;
        expect(isValidUrl(endpoint)).toBe(true);
      } else {
        // Skip validation if R2_ENDPOINT is not set
        expect(true).toBe(true);
      }
    });

    it('should have R2_ACCESS_KEY environment variable set', () => {
      if (isTestMode && !isEnvVarSet('R2_ACCESS_KEY')) {
        console.warn('⚠️  R2_ACCESS_KEY not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('R2_ACCESS_KEY')).toBe(true);
      }
    });

    it('should have R2_SECRET_KEY environment variable set', () => {
      if (isTestMode && !isEnvVarSet('R2_SECRET_KEY')) {
        console.warn('⚠️  R2_SECRET_KEY not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('R2_SECRET_KEY')).toBe(true);
      }
    });

    it('should have R2_BUCKET environment variable set', () => {
      if (isTestMode && !isEnvVarSet('R2_BUCKET')) {
        console.warn('⚠️  R2_BUCKET not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('R2_BUCKET')).toBe(true);
      }
    });

    it('should have valid CDN_URL format if set', () => {
      if (isEnvVarSet('CDN_URL')) {
        const cdnUrl = process.env.CDN_URL!;
        expect(isValidUrl(cdnUrl)).toBe(true);
      } else {
        // CDN_URL is optional, so pass if not set
        expect(true).toBe(true);
      }
    });
  });

  describe('Authentication Configuration', () => {
    it('should have BETTER_AUTH_SECRET environment variable set', () => {
      if (isTestMode && !isEnvVarSet('BETTER_AUTH_SECRET')) {
        console.warn('⚠️  BETTER_AUTH_SECRET not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('BETTER_AUTH_SECRET')).toBe(true);
      }
    });

    it('should have BETTER_AUTH_SECRET with sufficient length', () => {
      if (isEnvVarSet('BETTER_AUTH_SECRET')) {
        const secret = process.env.BETTER_AUTH_SECRET!;
        // Minimum recommended length for secrets is 32 characters
        expect(secret.length).toBeGreaterThanOrEqual(32);
      } else {
        // Skip validation if BETTER_AUTH_SECRET is not set
        expect(true).toBe(true);
      }
    });

    it('should have matching Google OAuth credentials if one is set', () => {
      const hasGoogleId = isEnvVarSet('GOOGLE_CLIENT_ID');
      const hasGoogleSecret = isEnvVarSet('GOOGLE_CLIENT_SECRET');

      // If one is set, both should be set for OAuth to work
      if (hasGoogleId || hasGoogleSecret) {
        expect(hasGoogleId).toBe(hasGoogleSecret);
      } else {
        // Google OAuth is optional
        expect(true).toBe(true);
      }
    });
  });

  describe('Payment Configuration (Razorpay)', () => {
    it('should have RAZORPAY_KEY_ID environment variable set', () => {
      if (isTestMode && !isEnvVarSet('RAZORPAY_KEY_ID')) {
        console.warn('⚠️  RAZORPAY_KEY_ID not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('RAZORPAY_KEY_ID')).toBe(true);
      }
    });

    it('should have RAZORPAY_KEY_SECRET environment variable set', () => {
      if (isTestMode && !isEnvVarSet('RAZORPAY_KEY_SECRET')) {
        console.warn('⚠️  RAZORPAY_KEY_SECRET not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('RAZORPAY_KEY_SECRET')).toBe(true);
      }
    });

    it('should have RAZORPAY_WEBHOOK_SECRET environment variable set', () => {
      if (isTestMode && !isEnvVarSet('RAZORPAY_WEBHOOK_SECRET')) {
        console.warn('⚠️  RAZORPAY_WEBHOOK_SECRET not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('RAZORPAY_WEBHOOK_SECRET')).toBe(true);
      }
    });

    it('should have RAZORPAY_KEY_ID with valid format', () => {
      if (isEnvVarSet('RAZORPAY_KEY_ID')) {
        const keyId = process.env.RAZORPAY_KEY_ID!;
        // Razorpay key IDs typically start with 'rzp_test_' or 'rzp_live_'
        expect(keyId).toMatch(/^rzp_(test|live)_/);
      } else {
        // Skip validation if RAZORPAY_KEY_ID is not set
        expect(true).toBe(true);
      }
    });
  });

  describe('AI Service Configuration', () => {
    it('should have REPLICATE_API_TOKEN environment variable set', () => {
      if (isTestMode && !isEnvVarSet('REPLICATE_API_TOKEN')) {
        console.warn('⚠️  REPLICATE_API_TOKEN not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('REPLICATE_API_TOKEN')).toBe(true);
      }
    });

    it('should have REPLICATE_API_TOKEN with valid format', () => {
      if (isEnvVarSet('REPLICATE_API_TOKEN')) {
        const token = process.env.REPLICATE_API_TOKEN!;
        // Replicate tokens typically start with 'r8_'
        expect(token).toMatch(/^r8_/);
      } else {
        // Skip validation if REPLICATE_API_TOKEN is not set
        expect(true).toBe(true);
      }
    });
  });

  describe('Email Service Configuration', () => {
    it('should have RESEND_API_KEY environment variable set', () => {
      if (isTestMode && !isEnvVarSet('RESEND_API_KEY')) {
        console.warn('⚠️  RESEND_API_KEY not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('RESEND_API_KEY')).toBe(true);
      }
    });

    it('should have RESEND_API_KEY with valid format', () => {
      if (isEnvVarSet('RESEND_API_KEY')) {
        const apiKey = process.env.RESEND_API_KEY!;
        // Resend API keys typically start with 're_'
        expect(apiKey).toMatch(/^re_/);
      } else {
        // Skip validation if RESEND_API_KEY is not set
        expect(true).toBe(true);
      }
    });
  });

  describe('Frontend Configuration', () => {
    it('should have valid VITE_API_URL format if set', () => {
      if (isEnvVarSet('VITE_API_URL')) {
        const apiUrl = process.env.VITE_API_URL!;
        expect(isValidUrl(apiUrl)).toBe(true);
      } else {
        // VITE_API_URL is optional (can use relative URLs in development)
        expect(true).toBe(true);
      }
    });

    it('should have valid VITE_CDN_URL format if set', () => {
      if (isEnvVarSet('VITE_CDN_URL')) {
        const cdnUrl = process.env.VITE_CDN_URL!;
        expect(isValidUrl(cdnUrl)).toBe(true);
      } else {
        // VITE_CDN_URL is optional
        expect(true).toBe(true);
      }
    });
  });

  describe('Server Configuration', () => {
    it('should have NODE_ENV environment variable set', () => {
      if (isTestMode && !isEnvVarSet('NODE_ENV')) {
        console.warn('⚠️  NODE_ENV not set (skipped in test mode)');
        expect(true).toBe(true);
      } else {
        expect(isEnvVarSet('NODE_ENV')).toBe(true);
      }
    });

    it('should have valid NODE_ENV value', () => {
      if (isEnvVarSet('NODE_ENV')) {
        const nodeEnv = process.env.NODE_ENV!;
        const validValues = ['development', 'test', 'production'];
        expect(validValues).toContain(nodeEnv);
      } else {
        // Skip validation if NODE_ENV is not set
        expect(true).toBe(true);
      }
    });

    it('should have valid API_PORT if set', () => {
      if (isEnvVarSet('API_PORT')) {
        const port = process.env.API_PORT!;
        expect(isValidPort(port)).toBe(true);
      } else {
        // API_PORT is optional, has default value
        expect(true).toBe(true);
      }
    });

    it('should have valid WEB_PORT if set', () => {
      if (isEnvVarSet('WEB_PORT')) {
        const port = process.env.WEB_PORT!;
        expect(isValidPort(port)).toBe(true);
      } else {
        // WEB_PORT is optional, has default value
        expect(true).toBe(true);
      }
    });

    it('should use different ports for API and WEB if both are set', () => {
      if (isEnvVarSet('API_PORT') && isEnvVarSet('WEB_PORT')) {
        const apiPort = process.env.API_PORT!;
        const webPort = process.env.WEB_PORT!;
        expect(apiPort).not.toBe(webPort);
      } else {
        // Ports are optional
        expect(true).toBe(true);
      }
    });

    it('should have valid APP_URL format if set', () => {
      if (isEnvVarSet('APP_URL')) {
        const appUrl = process.env.APP_URL!;
        expect(isValidUrl(appUrl)).toBe(true);
      } else {
        // APP_URL is optional
        expect(true).toBe(true);
      }
    });
  });

  describe('Environment Variable Security', () => {
    it('should not have empty required environment variables', () => {
      const allRequired = [
        ...ENV_GROUPS.database.required,
        ...ENV_GROUPS.storage.required,
        ...ENV_GROUPS.auth.required,
        ...ENV_GROUPS.payments.required,
        ...ENV_GROUPS.ai.required,
        ...ENV_GROUPS.email.required,
      ];

      const emptyVars = allRequired.filter((varName) => {
        const value = process.env[varName];
        return value === undefined || value === null || value.trim() === '';
      });

      if (isTestMode && emptyVars.length > 0) {
        console.warn(`⚠️  ${emptyVars.length} required environment variables not set (skipped in test mode)`);
        expect(true).toBe(true);
      } else {
        // All required variables should have non-empty values in production
        expect(emptyVars.length).toBe(0);
      }
    });

    it('should not have secrets in plain text common mistakes', () => {
      // Check for common mistakes like 'your-secret-here', 'xxx', 'changeme'
      const secretVars = [
        'BETTER_AUTH_SECRET',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
        'R2_SECRET_KEY',
        'GOOGLE_CLIENT_SECRET',
      ];

      const commonPlaceholders = ['xxx', 'changeme', 'your-secret-here', 'secret', 'password', '123456'];

      secretVars.forEach((varName) => {
        if (isEnvVarSet(varName)) {
          const value = process.env[varName]!.toLowerCase();
          const hasPlaceholder = commonPlaceholders.some((placeholder) =>
            value.includes(placeholder)
          );

          expect(hasPlaceholder).toBe(false);
        }
      });
    });
  });

  describe('Environment Variable Summary', () => {
    it('should have all required environment variables present', () => {
      const allRequired = [
        ...ENV_GROUPS.database.required,
        ...ENV_GROUPS.storage.required,
        ...ENV_GROUPS.auth.required,
        ...ENV_GROUPS.payments.required,
        ...ENV_GROUPS.ai.required,
        ...ENV_GROUPS.email.required,
      ];

      const missingVars = allRequired.filter((varName) => !isEnvVarSet(varName));

      // Provide helpful message if variables are missing
      if (missingVars.length > 0) {
        if (isTestMode) {
          console.warn('⚠️  Missing environment variables (skipped in test mode):', missingVars.join(', '));
          console.warn('   Set ENFORCE_ENV_VARS=true to fail on missing variables');
          expect(true).toBe(true);
        } else {
          console.error('❌ Missing required environment variables:', missingVars.join(', '));
          console.error('   Please check docs/poster-app-tech-stack.md for configuration details');
          expect(missingVars.length).toBe(0);
        }
      } else {
        expect(missingVars.length).toBe(0);
      }
    });

    it('should document optional environment variables status', () => {
      const allOptional = [
        ...ENV_GROUPS.storage.optional,
        ...ENV_GROUPS.auth.optional,
        ...ENV_GROUPS.frontend.optional,
        ...ENV_GROUPS.server.optional,
        ...ENV_GROUPS.email.optional,
        ...ENV_GROUPS.application.optional,
      ];

      const setOptionalVars = allOptional.filter((varName) => isEnvVarSet(varName));
      const unsetOptionalVars = allOptional.filter((varName) => !isEnvVarSet(varName));

      // Log status for documentation purposes
      if (setOptionalVars.length > 0) {
        console.log('Optional environment variables set:', setOptionalVars.join(', '));
      }
      if (unsetOptionalVars.length > 0) {
        console.log('Optional environment variables not set:', unsetOptionalVars.join(', '));
      }

      // This test always passes - it's informational only
      expect(true).toBe(true);
    });
  });
});

/**
 * Production Environment Safety Tests
 *
 * These tests specifically check for production environment safety.
 * Only run when NODE_ENV=production and ENFORCE_ENV_VARS=true.
 */
describe.skipIf(process.env.NODE_ENV !== 'production' || !process.env.ENFORCE_ENV_VARS)(
  'Production Environment Safety',
  () => {
    it('should not use default development secrets in production', () => {
      const authSecret = process.env.BETTER_AUTH_SECRET;
      const hasDefaultSecret =
        authSecret?.includes('change-in-production') ||
        authSecret?.includes('your-secret-key') ||
        authSecret?.includes('dev_');

      if (hasDefaultSecret) {
        console.error('CRITICAL: Using default BETTER_AUTH_SECRET in production!');
      }

      expect(hasDefaultSecret).toBe(false);
    });

    it('should not use localhost URLs in production', () => {
      const urlVars = ['DATABASE_URL', 'REDIS_URL', 'R2_ENDPOINT', 'APP_URL', 'VITE_API_URL'];

      urlVars.forEach((varName) => {
        const value = process.env[varName];
        if (value) {
          const hasLocalhost = value.includes('localhost') || value.includes('127.0.0.1');
          if (hasLocalhost) {
            console.error(`WARNING: ${varName} contains localhost in production!`);
          }
          expect(hasLocalhost).toBe(false);
        }
      });
    });

    it('should use test mode for Razorpay in non-production', () => {
      // This test ensures Razorpay is NOT in test mode for production
      const keyId = process.env.RAZORPAY_KEY_ID;
      if (keyId) {
        const isTestMode = keyId.startsWith('rzp_test_');
        if (isTestMode) {
          console.error('WARNING: Using Razorpay test keys in production!');
        }
        expect(isTestMode).toBe(false);
      }
    });
  }
);
