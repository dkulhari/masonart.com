/**
 * Seed Test Users for E2E Testing
 *
 * Creates test users with verified emails for Playwright E2E tests.
 * These users can log in without email verification.
 *
 * Run with: bun run packages/api/src/database/seed-test-users.ts
 */

import { db, closeDatabase } from "./index";
import { users, accounts } from "./schema";
import { eq } from "drizzle-orm";

// Password for all test users
const TEST_PASSWORD = "TestPassword123!";

/**
 * Hash password using Bun's bcrypt implementation (same as Better Auth)
 */
async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

/**
 * Test user configurations matching tests/fixtures/playwright.ts
 */
const testUsers = [
  {
    id: "test-customer-001",
    email: "test-customer@example.com",
    name: "Test Customer",
    firstName: "Test",
    lastName: "Customer",
    role: "customer" as const,
    emailVerified: true,
  },
  {
    id: "test-admin-001",
    email: "test-admin@masonart.com",
    name: "Test Admin",
    firstName: "Test",
    lastName: "Admin",
    role: "admin" as const,
    emailVerified: true,
  },
  {
    id: "test-trade-001",
    email: "test-trade@interior.com",
    name: "Test Trade User",
    firstName: "Test",
    lastName: "Trade",
    role: "trade" as const,
    emailVerified: true,
    tradeStatus: "approved" as const,
  },
];

/**
 * Create or update test users in the database
 */
async function seedTestUsers(): Promise<void> {
  console.log("\n========================================");
  console.log("  Seeding Test Users for E2E Tests");
  console.log("========================================\n");

  for (const userData of testUsers) {
    try {
      // Check if user already exists
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existing.length > 0) {
        // Update existing user to ensure email is verified
        await db
          .update(users)
          .set({
            emailVerified: true,
            name: userData.name,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(users.email, userData.email));
        console.log(`  Updated existing user: ${userData.email}`);
      } else {
        // Create new user
        await db.insert(users).values({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          emailVerified: true,
          phoneVerified: false,
          status: "active",
          tradeStatus: userData.tradeStatus || "none",
          aiCreditsRemaining: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`  Created user: ${userData.email}`);
      }

      // Check if credential account exists for email/password login
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userData.id))
        .limit(1);

      if (existingAccount.length === 0) {
        // Hash the password for Better Auth
        const passwordHash = await hashPassword(TEST_PASSWORD);

        // Create credential account for Better Auth
        await db.insert(accounts).values({
          id: `account-${userData.id}`,
          userId: userData.id,
          accountId: userData.id,
          providerId: "credential",
          password: passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`    Created credential account for: ${userData.email}`);
      }
    } catch (error) {
      console.error(`  Failed to create user ${userData.email}:`, error);
    }
  }

  console.log("\n========================================");
  console.log("  Test Users Seeded Successfully!");
  console.log("========================================\n");

  console.log("Test Credentials:");
  console.log("  Customer: test-customer@example.com / TestPassword123!");
  console.log("  Admin:    test-admin@masonart.com / TestPassword123!");
  console.log("  Trade:    test-trade@interior.com / TestPassword123!");
  console.log("");
}

// Run if executed directly
seedTestUsers()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Fatal error:", error);
    await closeDatabase();
    process.exit(1);
  });
