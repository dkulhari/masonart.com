/**
 * Initialize Super Admin Account
 *
 * Creates the default super-admin account if it doesn't exist.
 * Uses Better Auth's internal API to ensure proper password hashing.
 *
 * Environment Variables:
 * - SUPER_ADMIN_EMAIL: Email for super-admin (default: admin@chobii.art)
 * - SUPER_ADMIN_PASSWORD: Password for super-admin (default: SuperAdmin123!)
 *
 * Run with: bun run packages/api/src/database/init-super-admin.ts
 */

import { db, closeDatabase } from "./index";
import { users } from "./schema";
import { eq } from "drizzle-orm";
import { auth } from "../auth";

// Default super-admin credentials (can be overridden via env vars)
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@chobii.art";
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!";
const SUPER_ADMIN_NAME = "Super Admin";

/**
 * Check if super-admin exists and create if not
 */
export async function initSuperAdmin(): Promise<{
  created: boolean;
  email: string;
  message: string;
}> {
  console.log("\n========================================");
  console.log("  Initializing Super Admin Account");
  console.log("========================================\n");

  try {
    // Check if super-admin already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, SUPER_ADMIN_EMAIL))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      const user = existing[0];

      // Ensure the existing user has super-admin role
      if (user.role !== "super-admin") {
        await db
          .update(users)
          .set({
            role: "super-admin",
            emailVerified: true,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(users.email, SUPER_ADMIN_EMAIL));

        console.log(`  Updated existing user to super-admin: ${SUPER_ADMIN_EMAIL}`);
        return {
          created: false,
          email: SUPER_ADMIN_EMAIL,
          message: "Updated existing user to super-admin role",
        };
      }

      console.log(`  Super-admin already exists: ${SUPER_ADMIN_EMAIL}`);
      return {
        created: false,
        email: SUPER_ADMIN_EMAIL,
        message: "Super-admin already exists",
      };
    }

    // Create super-admin using Better Auth's internal API
    // This ensures proper password hashing
    console.log(`  Creating super-admin via Better Auth API...`);

    const result = await auth.api.signUpEmail({
      body: {
        email: SUPER_ADMIN_EMAIL,
        password: SUPER_ADMIN_PASSWORD,
        name: SUPER_ADMIN_NAME,
      },
    });

    if (!result || !result.user) {
      throw new Error("Failed to create super-admin via Better Auth API");
    }

    console.log(`  Created user via Better Auth: ${result.user.email}`);

    // Now update the role to super-admin
    await db
      .update(users)
      .set({
        role: "super-admin",
        emailVerified: true,
        firstName: "Super",
        lastName: "Admin",
        status: "active",
        aiCreditsRemaining: 999,
        aiSubscriptionTier: "unlimited",
        updatedAt: new Date(),
      })
      .where(eq(users.email, SUPER_ADMIN_EMAIL));

    console.log(`  Updated user role to super-admin`);

    console.log("\n========================================");
    console.log("  Super Admin Created Successfully!");
    console.log("========================================\n");
    console.log(`  Email: ${SUPER_ADMIN_EMAIL}`);
    console.log(`  Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log("");

    return {
      created: true,
      email: SUPER_ADMIN_EMAIL,
      message: "Super-admin created successfully",
    };
  } catch (error) {
    // Check if error is due to user already existing
    if (error instanceof Error && error.message.includes("already")) {
      // User exists but wasn't found - might be a race condition
      // Try to update role
      await db
        .update(users)
        .set({
          role: "super-admin",
          emailVerified: true,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(users.email, SUPER_ADMIN_EMAIL));

      console.log(`  Updated existing user to super-admin: ${SUPER_ADMIN_EMAIL}`);
      return {
        created: false,
        email: SUPER_ADMIN_EMAIL,
        message: "Updated existing user to super-admin role",
      };
    }

    console.error("  Failed to initialize super-admin:", error);
    throw error;
  }
}

// Run if executed directly
if (import.meta.main) {
  initSuperAdmin()
    .then(async (result) => {
      console.log("Result:", result);
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("Fatal error:", error);
      await closeDatabase();
      process.exit(1);
    });
}
