/**
 * Seed Admin - Minimal database setup for development
 *
 * Seeds frames (needed for product pages to work) and creates one admin user
 * (so admin panel is accessible). This is the minimal seed for a usable app.
 *
 * Run with: bun run seed:admin
 */

import { db, closeDatabase } from "./index";
import { frames, users, accounts } from "./schema";
import { sampleFrames } from "./seed-frames";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

const ADMIN_EMAIL = "admin@chobii.art";
const ADMIN_PASSWORD = "AdminPass123!";


async function seedFrames(): Promise<void> {
  const existing = await db.select({ type: frames.type }).from(frames).limit(1);
  if (existing.length > 0) {
    console.log(`  Frames already exist, skipping`);
    return;
  }

  await db.insert(frames).values(sampleFrames);
  console.log(`  Seeded ${sampleFrames.length} frames`);
}

async function seedAdmin(): Promise<void> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`  Admin user already exists: ${ADMIN_EMAIL}`);
    // Output credentials line even if user exists
    console.log(`CREDENTIALS:${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (admin)`);
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await db.insert(users).values({
    id: "admin-001",
    email: ADMIN_EMAIL,
    name: "Admin",
    firstName: "Admin",
    lastName: "chobii.art",
    role: "admin",
    emailVerified: true,
    phoneVerified: false,
    status: "active",
    tradeStatus: "none",
    aiCreditsRemaining: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.insert(accounts).values({
    id: "account-admin-001",
    userId: "admin-001",
    accountId: "admin-001",
    providerId: "credential",
    password: passwordHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`  Created admin user: ${ADMIN_EMAIL}`);
  console.log(`CREDENTIALS:${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (admin)`);
}

async function main(): Promise<void> {
  console.log("\n========================================");
  console.log("  chobii.art Minimal Seed (Admin + Frames)");
  console.log("========================================\n");

  try {
    await seedFrames();
    await seedAdmin();
    console.log("\n  Done!\n");
  } catch (error) {
    console.error("Seed failed:", error);
    throw error;
  } finally {
    await closeDatabase();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
