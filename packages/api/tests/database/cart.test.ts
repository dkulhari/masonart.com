/**
 * Cart Database Schema Tests
 *
 * Tests for cart_items database table.
 * Validates schema structure, relationships, and CRUD operations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import {
  users,
  products,
  productVariants,
  frames,
  cartItems,
} from '../../src/db/schema';

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === 'true';

// Track database availability
let isDatabaseAvailable = false;

// Helper to check if tests should be skipped
const shouldSkip = () => SKIP_TESTS || !isDatabaseAvailable;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log('⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)');
    return;
  }

  try {
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://poster_app:dev_password@localhost:5433/poster_app_test';
    client = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });

    // Test connection
    await client`SELECT 1`;
    isDatabaseAvailable = true;
    db = drizzle(client);

  // Drop tables to ensure clean state
  await client`DROP TABLE IF EXISTS cart_items CASCADE`;
  await client`DROP TABLE IF EXISTS product_variants CASCADE`;
  await client`DROP TABLE IF EXISTS frames CASCADE`;
  await client`DROP TABLE IF EXISTS products CASCADE`;
  await client`DROP TABLE IF EXISTS users CASCADE`;

  await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Create enums
  await client`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'customer', 'trade'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await client`DO $$ BEGIN CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
  await client`DO $$ BEGIN CREATE TYPE product_orientation AS ENUM ('square', 'portrait', 'landscape', 'panoramic', 'round'); EXCEPTION WHEN duplicate_object THEN null; END $$`;

  // Create tables
  await client`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      password_hash VARCHAR(255),
      role user_role NOT NULL DEFAULT 'customer',
      email_verified BOOLEAN NOT NULL DEFAULT false,
      phone_verified BOOLEAN NOT NULL DEFAULT false,
      avatar_url TEXT,
      preferences JSONB NOT NULL DEFAULT '{}',
      trade_account_status VARCHAR(50),
      trade_business JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sku VARCHAR(100) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(250) NOT NULL UNIQUE,
      description TEXT NOT NULL,
      base_price DECIMAL(10, 2) NOT NULL,
      styles JSONB NOT NULL,
      subjects JSONB NOT NULL,
      colors JSONB NOT NULL,
      orientation product_orientation NOT NULL,
      artist_id UUID,
      images JSONB NOT NULL,
      seo_title VARCHAR(70) NOT NULL,
      seo_description VARCHAR(160) NOT NULL,
      status product_status NOT NULL DEFAULT 'draft',
      featured_order INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS product_variants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size_label VARCHAR(50) NOT NULL,
      width_inches DECIMAL(6, 2) NOT NULL,
      height_inches DECIMAL(6, 2) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS frames (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL,
      material VARCHAR(100) NOT NULL,
      price_modifier DECIMAL(5, 2) NOT NULL,
      image_url TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS cart_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      variant_id UUID NOT NULL REFERENCES product_variants(id),
      frame_id UUID REFERENCES frames(id),
      quantity INTEGER NOT NULL,
      added_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

    console.log('✅ Database connection established for cart schema tests');
  } catch (error) {
    console.log('⚠️  Database not available, runtime tests will be skipped');
    isDatabaseAvailable = false;
    if (client) {
      try {
        await client.end();
      } catch (e) {
        // Ignore cleanup errors
      }
      client = null;
    }
  }
});

afterAll(async () => {
  if (!isDatabaseAvailable || !client) return;

  try {
    await client`DROP TABLE IF EXISTS cart_items CASCADE`;
    await client`DROP TABLE IF EXISTS frames CASCADE`;
    await client`DROP TABLE IF EXISTS product_variants CASCADE`;
    await client`DROP TABLE IF EXISTS products CASCADE`;
    await client`DROP TABLE IF EXISTS users CASCADE`;
    await client.end();
  } catch (error) {
    // Ignore cleanup errors
  }
});

beforeEach(async () => {
  if (!isDatabaseAvailable || !client) return;

  await client`DELETE FROM cart_items`;
  await client`DELETE FROM frames`;
  await client`DELETE FROM product_variants`;
  await client`DELETE FROM products`;
  await client`DELETE FROM users`;
});

describe('Cart Items Table Schema', () => {
  let testUserId: string;
  let testProductId: string;
  let testVariantId: string;
  let testFrameId: string;

  beforeEach(async () => {
    if (shouldSkip() || !db) return;

    // Create test user
    const [user] = await db.insert(users).values({
      email: 'cart-test@example.com',
      name: 'Cart Test User',
      role: 'customer',
    }).returning();
    testUserId = user.id;

    // Create test product
    const [product] = await db.insert(products).values({
      sku: 'CART-TEST-001',
      title: 'Test Product for Cart',
      slug: 'test-product-cart',
      description: 'Product for cart testing',
      basePrice: '99.99',
      styles: ['modern'],
      subjects: ['art'],
      colors: ['blue'],
      orientation: 'portrait',
      images: [{ url: 'https://example.com/img.jpg', alt: 'Test', width: 1000, height: 1500, isPrimary: true }],
      seoTitle: 'Test Product',
      seoDescription: 'Test',
      status: 'active',
    }).returning();
    testProductId = product.id;

    // Create test variant
    const [variant] = await db.insert(productVariants).values({
      productId: testProductId,
      sizeLabel: '12x16 inches',
      widthInches: '12.00',
      heightInches: '16.00',
      price: '129.99',
      stockQuantity: 50,
    }).returning();
    testVariantId = variant.id;

    // Create test frame
    const [frame] = await db.insert(frames).values({
      name: 'Classic Frame',
      type: 'classic',
      material: 'wood',
      priceModifier: '1.30',
      imageUrl: 'https://example.com/frame.jpg',
      isActive: true,
    }).returning();
    testFrameId = frame.id;
  });

  describe('Table Structure', () => {
    it.skipIf(shouldSkip())('should have cart_items table', async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'cart_items'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(shouldSkip())('should have all required columns', async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'cart_items'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('product_id');
      expect(columnNames).toContain('variant_id');
      expect(columnNames).toContain('frame_id');
      expect(columnNames).toContain('quantity');
      expect(columnNames).toContain('added_at');
    });

    it.skipIf(shouldSkip())('should have foreign keys', async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'cart_items' AND constraint_type = 'FOREIGN KEY'
      `;
      expect(result.length).toBeGreaterThanOrEqual(3); // user_id, product_id, variant_id (frame_id is optional)
    });
  });

  describe('Cart Item CRUD Operations', () => {
    it.skipIf(shouldSkip())('should insert a cart item', async () => {
      const [result] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 2,
      }).returning();

      expect(result).toHaveProperty('id');
      expect(result.userId).toBe(testUserId);
      expect(result.productId).toBe(testProductId);
      expect(result.variantId).toBe(testVariantId);
      expect(result.quantity).toBe(2);
      expect(result.addedAt).toBeDefined();
    });

    it.skipIf(shouldSkip())('should insert cart item with frame', async () => {
      const [result] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        frameId: testFrameId,
        quantity: 1,
      }).returning();

      expect(result.frameId).toBe(testFrameId);
    });

    it.skipIf(shouldSkip())('should select cart items for a user', async () => {
      await db!.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        },
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId,
          quantity: 2,
        },
      ]);

      const result = await db!.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(result).toHaveLength(2);
    });

    it.skipIf(shouldSkip())('should update cart item quantity', async () => {
      const [inserted] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      await db!.update(cartItems)
        .set({ quantity: 5 })
        .where(eq(cartItems.id, inserted.id));

      const [result] = await db!.select().from(cartItems).where(eq(cartItems.id, inserted.id));
      expect(result.quantity).toBe(5);
    });

    it.skipIf(shouldSkip())('should delete cart item', async () => {
      const [inserted] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      await db!.delete(cartItems).where(eq(cartItems.id, inserted.id));

      const result = await db!.select().from(cartItems).where(eq(cartItems.id, inserted.id));
      expect(result).toHaveLength(0);
    });

    it.skipIf(shouldSkip())('should delete all cart items for a user', async () => {
      await db!.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        },
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 2,
        },
      ]);

      await db!.delete(cartItems).where(eq(cartItems.userId, testUserId));

      const result = await db!.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(result).toHaveLength(0);
    });
  });

  describe('Cart Item Cascade Deletion', () => {
    it.skipIf(shouldSkip())('should delete cart items when user is deleted', async () => {
      await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      await db!.delete(users).where(eq(users.id, testUserId));

      const result = await db!.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(result).toHaveLength(0);
    });
  });

  describe('Cart Item Filtering', () => {
    it.skipIf(shouldSkip())('should filter cart items by user', async () => {
      // Create second user
      const [user2] = await db!.insert(users).values({
        email: 'cart-test2@example.com',
        name: 'Cart Test User 2',
        role: 'customer',
      }).returning();

      // Add items for both users
      await db!.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        },
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 2,
        },
        {
          userId: user2.id,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 3,
        },
      ]);

      const user1Items = await db!.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      const user2Items = await db!.select().from(cartItems).where(eq(cartItems.userId, user2.id));

      expect(user1Items).toHaveLength(2);
      expect(user2Items).toHaveLength(1);
    });

    it.skipIf(shouldSkip())('should filter cart items by product and variant', async () => {
      // Create second product and variant
      const [product2] = await db!.insert(products).values({
        sku: 'CART-TEST-002',
        title: 'Second Product',
        slug: 'second-product-cart',
        description: 'Second product for cart testing',
        basePrice: '149.99',
        styles: ['classic'],
        subjects: ['photography'],
        colors: ['black'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/img2.jpg', alt: 'Test 2', width: 1500, height: 1000, isPrimary: true }],
        seoTitle: 'Second Product',
        seoDescription: 'Test 2',
        status: 'active',
      }).returning();

      const [variant2] = await db!.insert(productVariants).values({
        productId: product2.id,
        sizeLabel: '16x20 inches',
        widthInches: '16.00',
        heightInches: '20.00',
        price: '179.99',
        stockQuantity: 30,
      }).returning();

      // Add items
      await db!.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        },
        {
          userId: testUserId,
          productId: product2.id,
          variantId: variant2.id,
          quantity: 2,
        },
      ]);

      const product1Items = await db!.select().from(cartItems)
        .where(and(
          eq(cartItems.userId, testUserId),
          eq(cartItems.productId, testProductId)
        ));

      expect(product1Items).toHaveLength(1);
      expect(product1Items[0].variantId).toBe(testVariantId);
    });
  });

  describe('Cart Item with Frames', () => {
    it.skipIf(shouldSkip())('should store cart items with frames', async () => {
      const [result] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        frameId: testFrameId,
        quantity: 1,
      }).returning();

      expect(result.frameId).toBe(testFrameId);
    });

    it.skipIf(shouldSkip())('should store cart items without frames', async () => {
      const [result] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      expect(result.frameId).toBeNull();
    });

    it.skipIf(shouldSkip())('should filter cart items with frames', async () => {
      await db!.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId,
          quantity: 1,
        },
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 2,
        },
      ]);

      const withFrame = await db!.select().from(cartItems)
        .where(and(
          eq(cartItems.userId, testUserId),
          eq(cartItems.frameId, testFrameId)
        ));

      expect(withFrame).toHaveLength(1);
      expect(withFrame[0].frameId).toBe(testFrameId);
    });
  });

  describe('Cart Item Quantities', () => {
    it.skipIf(shouldSkip())('should store quantity correctly', async () => {
      const quantities = [1, 5, 10, 99];

      for (const qty of quantities) {
        const [result] = await db!.insert(cartItems).values({
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: qty,
        }).returning();

        expect(result.quantity).toBe(qty);

        // Clean up for next iteration
        await db!.delete(cartItems).where(eq(cartItems.id, result.id));
      }
    });

    it.skipIf(shouldSkip())('should update quantity', async () => {
      const [inserted] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      await db!.update(cartItems)
        .set({ quantity: 10 })
        .where(eq(cartItems.id, inserted.id));

      const [result] = await db!.select().from(cartItems).where(eq(cartItems.id, inserted.id));
      expect(result.quantity).toBe(10);
    });
  });

  describe('Cart Item Timestamps', () => {
    it.skipIf(shouldSkip())('should set added_at timestamp automatically', async () => {
      const before = new Date(Date.now() - 1000); // 1 second before

      const [result] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      const after = new Date(Date.now() + 1000); // 1 second after

      expect(result.addedAt).toBeDefined();
      expect(result.addedAt instanceof Date).toBe(true);
      expect(result.addedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.addedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it.skipIf(shouldSkip())('should maintain added_at timestamp on updates', async () => {
      const [inserted] = await db!.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      const originalAddedAt = inserted.addedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      await db!.update(cartItems)
        .set({ quantity: 5 })
        .where(eq(cartItems.id, inserted.id));

      const [result] = await db!.select().from(cartItems).where(eq(cartItems.id, inserted.id));

      // added_at should not change on update
      expect(result.addedAt.getTime()).toBe(originalAddedAt.getTime());
    });
  });
});
