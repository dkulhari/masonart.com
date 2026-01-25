/**
 * Cleanup Test Users
 *
 * Deletes all test users from the database to start fresh.
 * Run with: bun run packages/api/src/database/cleanup-test-users.ts
 */

import { db, closeDatabase } from "./index";
import { users, accounts, sessions } from "./schema";
import { eq } from "drizzle-orm";

const testEmails = [
  "test-customer@example.com",
  "test-admin@masonart.com",
  "test-trade@interior.com",
  "test-e2e-customer@example.com",
  "test-e2e-admin@masonart.com",
];

async function cleanup() {
  console.log("\n========================================");
  console.log("  Cleaning up test users");
  console.log("========================================\n");

  for (const email of testEmails) {
    try {
      // Find user
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (user.length > 0) {
        const userId = user[0].id;
        console.log(`  Found user: ${email} (id: ${userId})`);

        // Delete sessions
        await db.delete(sessions).where(eq(sessions.userId, userId));
        console.log("    Deleted sessions");

        // Delete accounts
        await db.delete(accounts).where(eq(accounts.userId, userId));
        console.log("    Deleted accounts");

        // Delete user
        await db.delete(users).where(eq(users.id, userId));
        console.log("    Deleted user");
      } else {
        console.log(`  User not found: ${email}`);
      }
    } catch (error) {
      console.error(`  Error cleaning up ${email}:`, error);
    }
  }

  console.log("\n========================================");
  console.log("  Cleanup complete");
  console.log("========================================\n");
}

cleanup()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Fatal error:", error);
    await closeDatabase();
    process.exit(1);
  });
