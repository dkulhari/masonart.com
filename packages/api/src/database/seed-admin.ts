/**
 * Seed Admin - Minimal database setup for development
 *
 * Seeds frames (needed for product pages to work) and creates one admin user
 * (so admin panel is accessible). This is the minimal seed for a usable app.
 *
 * Run with: bun run seed:admin
 */

import { db, closeDatabase } from "./index";
import { frames, users, accounts, type NewFrame } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

const ADMIN_EMAIL = "admin@chobii.art";
const ADMIN_PASSWORD = "AdminPass123!";

/**
 * Frame options - same data as seed.ts to keep them in sync.
 * These are the 8 standard frame options offered on every product page.
 */
const sampleFrames: NewFrame[] = [
  {
    name: "No Frame",
    type: "none",
    description: "Print only - no frame included",
    material: "N/A",
    color: "N/A",
    priceModifier: "1.00",
    priceAddition: "0.00",
    isActive: true,
    sortOrder: 0,
  },
  {
    name: "Classic Black",
    type: "black",
    description:
      "Sleek matte black frame with clean lines. A timeless choice that works with any decor.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Matte Black",
    priceModifier: "1.00",
    priceAddition: "399.00",
    imageUrl: "https://placehold.co/400x400/1a1a1a/ffffff?text=Black+Frame",
    thumbnailUrl: "https://placehold.co/100x100/1a1a1a/ffffff?text=Black",
    isActive: true,
    sortOrder: 1,
  },
  {
    name: "Pure White",
    type: "white",
    description:
      "Crisp white frame that brightens any space. Perfect for minimalist and Scandinavian styles.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Matte White",
    priceModifier: "1.00",
    priceAddition: "399.00",
    imageUrl: "https://placehold.co/400x400/ffffff/333333?text=White+Frame",
    thumbnailUrl: "https://placehold.co/100x100/ffffff/333333?text=White",
    isActive: true,
    sortOrder: 2,
  },
  {
    name: "Natural Oak",
    type: "oak",
    description:
      "Warm natural oak frame with visible grain. Brings organic warmth to any room.",
    material: "Oak Wood",
    thickness: "1.00",
    color: "Natural Oak",
    priceModifier: "1.00",
    priceAddition: "599.00",
    imageUrl: "https://placehold.co/400x400/d4a574/ffffff?text=Oak+Frame",
    thumbnailUrl: "https://placehold.co/100x100/d4a574/ffffff?text=Oak",
    isActive: true,
    sortOrder: 3,
  },
  {
    name: "Rich Walnut",
    type: "walnut",
    description:
      "Deep walnut frame with elegant grain patterns. Adds sophistication and depth.",
    material: "Walnut Wood",
    thickness: "1.00",
    color: "Dark Walnut",
    priceModifier: "1.00",
    priceAddition: "699.00",
    imageUrl: "https://placehold.co/400x400/5d4e37/ffffff?text=Walnut+Frame",
    thumbnailUrl: "https://placehold.co/100x100/5d4e37/ffffff?text=Walnut",
    isActive: true,
    sortOrder: 4,
  },
  {
    name: "Antique Gold",
    type: "gold",
    description:
      "Luxurious gold frame with subtle antiquing. Perfect for traditional and glamorous interiors.",
    material: "Composite with Gold Leaf",
    thickness: "1.25",
    color: "Antique Gold",
    priceModifier: "1.00",
    priceAddition: "799.00",
    imageUrl: "https://placehold.co/400x400/c9a227/ffffff?text=Gold+Frame",
    thumbnailUrl: "https://placehold.co/100x100/c9a227/ffffff?text=Gold",
    isActive: true,
    sortOrder: 5,
  },
  {
    name: "Modern Silver",
    type: "silver",
    description:
      "Contemporary silver frame with brushed finish. Ideal for modern and industrial spaces.",
    material: "Aluminum",
    thickness: "0.75",
    color: "Brushed Silver",
    priceModifier: "1.00",
    priceAddition: "449.00",
    imageUrl: "https://placehold.co/400x400/c0c0c0/333333?text=Silver+Frame",
    thumbnailUrl: "https://placehold.co/100x100/c0c0c0/333333?text=Silver",
    isActive: true,
    sortOrder: 6,
  },
  {
    name: "Rustic Wood",
    type: "wood",
    description:
      "Rustic wooden frame with distressed finish. Perfect for farmhouse and bohemian styles.",
    material: "Reclaimed Pine",
    thickness: "1.50",
    color: "Weathered Brown",
    priceModifier: "1.00",
    priceAddition: "549.00",
    imageUrl: "https://placehold.co/400x400/8b7355/ffffff?text=Wood+Frame",
    thumbnailUrl: "https://placehold.co/100x100/8b7355/ffffff?text=Wood",
    isActive: true,
    sortOrder: 7,
  },
];

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
