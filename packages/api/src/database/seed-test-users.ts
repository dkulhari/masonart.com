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
// Import Better Auth's password hashing to ensure compatibility
// Better Auth uses scrypt with salt:key format, not bcrypt
import { hashPassword } from "better-auth/crypto";

// Password for all test users
const TEST_PASSWORD = "TestPassword123!";

/**
 * Test user configurations matching tests/fixtures/playwright.ts
 * Includes multiple customers to test cart independence
 */
const testUsers = [
  // Primary test customer
  {
    id: "test-customer-001",
    email: "test-customer@example.com",
    name: "Test Customer",
    firstName: "Test",
    lastName: "Customer",
    role: "customer" as const,
    emailVerified: true,
  },
  // Additional customers for cart independence testing
  {
    id: "test-customer-002",
    email: "test-customer-2@example.com",
    name: "Alice Tester",
    firstName: "Alice",
    lastName: "Tester",
    role: "customer" as const,
    emailVerified: true,
  },
  {
    id: "test-customer-003",
    email: "test-customer-3@example.com",
    name: "Bob Buyer",
    firstName: "Bob",
    lastName: "Buyer",
    role: "customer" as const,
    emailVerified: true,
  },
  {
    id: "test-customer-004",
    email: "test-customer-4@example.com",
    name: "Carol Checkout",
    firstName: "Carol",
    lastName: "Checkout",
    role: "customer" as const,
    emailVerified: true,
  },
  {
    id: "test-customer-005",
    email: "test-customer-5@example.com",
    name: "Dave Demo",
    firstName: "Dave",
    lastName: "Demo",
    role: "customer" as const,
    emailVerified: true,
  },
  // Admin user
  {
    id: "test-admin-001",
    email: "test-admin@chobii.art",
    name: "Test Admin",
    firstName: "Test",
    lastName: "Admin",
    role: "admin" as const,
    emailVerified: true,
  },
  // Additional admin for parallel testing
  {
    id: "test-admin-002",
    email: "test-admin-2@chobii.art",
    name: "Admin Secondary",
    firstName: "Admin",
    lastName: "Secondary",
    role: "admin" as const,
    emailVerified: true,
  },
  // Content manager user
  {
    id: "test-content-manager-001",
    email: "test-content-manager@chobii.art",
    name: "Test Content Manager",
    firstName: "Test",
    lastName: "ContentManager",
    role: "content-manager" as const,
    emailVerified: true,
  },
  // Trade user
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
  // Pending trade user for testing approval flow
  {
    id: "test-trade-002",
    email: "test-trade-pending@interior.com",
    name: "Pending Trade",
    firstName: "Pending",
    lastName: "Trade",
    role: "trade" as const,
    emailVerified: true,
    tradeStatus: "pending" as const,
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

      const existingUser = existing[0];
      if (existingUser) {
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

        // Also update the credential account password for existing users
        const passwordHash = await hashPassword(TEST_PASSWORD);
        const existingAccount = await db
          .select()
          .from(accounts)
          .where(eq(accounts.userId, existingUser.id))
          .limit(1);

        if (existingAccount.length > 0) {
          await db
            .update(accounts)
            .set({
              password: passwordHash,
              updatedAt: new Date(),
            })
            .where(eq(accounts.userId, existingUser.id));
          console.log(`    Updated password for: ${userData.email}`);
        } else {
          // Create credential account if missing
          await db.insert(accounts).values({
            id: `account-${existingUser.id}`,
            userId: existingUser.id,
            accountId: existingUser.id,
            providerId: "credential",
            password: passwordHash,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`    Created credential account for existing user: ${userData.email}`);
        }
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

  console.log("Test Credentials (all use password: TestPassword123!):");
  console.log("");
  console.log("  Customers (5 for cart independence testing):");
  console.log("    - test-customer@example.com");
  console.log("    - test-customer-2@example.com (Alice)");
  console.log("    - test-customer-3@example.com (Bob)");
  console.log("    - test-customer-4@example.com (Carol)");
  console.log("    - test-customer-5@example.com (Dave)");
  console.log("");
  console.log("  Admins:");
  console.log("    - test-admin@chobii.art");
  console.log("    - test-admin-2@chobii.art");
  console.log("");
  console.log("  Trade:");
  console.log("    - test-trade@interior.com (approved)");
  console.log("    - test-trade-pending@interior.com (pending)");
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
