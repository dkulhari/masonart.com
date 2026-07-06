/**
 * Orders Database Schema Tests
 *
 * Tests for orders and order_items database tables.
 * Validates schema structure, relationships, and CRUD operations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { users, products, productVariants, frames, orders, orderItems } from "../../src/db/schema";

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

// Helper to check if tests should be skipped
const shouldSkip = () => SKIP_TESTS || !isDatabaseAvailable;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  try {
    const databaseUrl =
      process.env.DATABASE_URL ||
      "postgresql://poster_app:dev_password@localhost:5433/poster_app_test";
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
    await client`DROP TABLE IF EXISTS order_items CASCADE`;
    await client`DROP TABLE IF EXISTS orders CASCADE`;
    await client`DROP TABLE IF EXISTS product_variants CASCADE`;
    await client`DROP TABLE IF EXISTS frames CASCADE`;
    await client`DROP TABLE IF EXISTS products CASCADE`;
    await client`DROP TABLE IF EXISTS users CASCADE`;

    await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // Create enums
    await client`DO $$ BEGIN CREATE TYPE user_role AS ENUM ('admin', 'customer', 'trade'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await client`DO $$ BEGIN CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await client`DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
    await client`DO $$ BEGIN CREATE TYPE payment_method AS ENUM ('razorpay', 'stripe', 'cod', 'upi'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
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
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number VARCHAR(50) NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id),
      status order_status NOT NULL DEFAULT 'pending',
      shipping_address JSONB NOT NULL,
      billing_address JSONB,
      payment_method payment_method NOT NULL,
      payment_status payment_status NOT NULL DEFAULT 'pending',
      payment_id VARCHAR(255),
      subtotal DECIMAL(10, 2) NOT NULL,
      shipping_cost DECIMAL(10, 2) NOT NULL,
      tax DECIMAL(10, 2) NOT NULL,
      discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      total DECIMAL(10, 2) NOT NULL,
      tracking_number VARCHAR(100),
      shipping_carrier VARCHAR(100),
      estimated_delivery TIMESTAMP,
      notes TEXT,
      internal_notes TEXT,
      photo_approval JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMP,
      delivered_at TIMESTAMP
    )
  `;

    await client`
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      variant_id UUID NOT NULL REFERENCES product_variants(id),
      frame_id UUID REFERENCES frames(id),
      product_title VARCHAR(200) NOT NULL,
      product_sku VARCHAR(100) NOT NULL,
      size_label VARCHAR(50) NOT NULL,
      frame_type VARCHAR(50),
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      subtotal DECIMAL(10, 2) NOT NULL,
      image_url TEXT NOT NULL,
      customizations JSONB
    )
  `;

    console.log("✅ Database connection established for orders schema tests");
  } catch (error) {
    console.log("⚠️  Database not available, runtime tests will be skipped");
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
    await client`DROP TABLE IF EXISTS order_items CASCADE`;
    await client`DROP TABLE IF EXISTS orders CASCADE`;
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

  await client`DELETE FROM order_items`;
  await client`DELETE FROM orders`;
  await client`DELETE FROM product_variants`;
  await client`DELETE FROM products`;
  await client`DELETE FROM frames`;
  await client`DELETE FROM users`;
});

describe("Orders Table Schema", () => {
  let testUserId: string;
  let testProductId: string;
  let testVariantId: string;

  beforeEach(async () => {
    if (shouldSkip() || !db) return;

    const [user] = await db
      .insert(users)
      .values({
        email: "order-test@example.com",
        name: "Order Test User",
        role: "customer",
      })
      .returning();
    testUserId = user.id;

    const [product] = await db
      .insert(products)
      .values({
        sku: "ORDER-TEST-001",
        title: "Test Product for Orders",
        slug: "test-product-orders",
        description: "Product for order testing",
        basePrice: "99.99",
        styles: ["modern"],
        subjects: ["art"],
        colors: ["blue"],
        orientation: "portrait",
        images: [
          {
            url: "https://example.com/img.jpg",
            alt: "Test",
            width: 1000,
            height: 1500,
            isPrimary: true,
          },
        ],
        seoTitle: "Test Product",
        seoDescription: "Test",
        status: "active",
      })
      .returning();
    testProductId = product.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: testProductId,
        sizeLabel: "12x16 inches",
        widthInches: "12.00",
        heightInches: "16.00",
        price: "129.99",
        stockQuantity: 50,
      })
      .returning();
    testVariantId = variant.id;
  });

  describe("Table Structure", () => {
    it.skipIf(shouldSkip())("should have orders table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'orders'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(shouldSkip())("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'orders'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("order_number");
      expect(columnNames).toContain("user_id");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("shipping_address");
      expect(columnNames).toContain("payment_method");
      expect(columnNames).toContain("payment_status");
      expect(columnNames).toContain("subtotal");
      expect(columnNames).toContain("total");
    });

    it.skipIf(shouldSkip())("should have unique constraint on order_number", async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'orders' AND constraint_type = 'UNIQUE'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Order CRUD Operations", () => {
    it.skipIf(shouldSkip())("should insert an order", async () => {
      const [result] = await db!
        .insert(orders)
        .values({
          orderNumber: "ORD-2024-001",
          userId: testUserId,
          status: "pending",
          shippingAddress: {
            id: "123",
            fullName: "John Doe",
            phone: "+919876543210",
            addressLine1: "123 Main St",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            country: "India",
            isDefault: true,
            type: "home",
          },
          paymentMethod: "razorpay",
          paymentStatus: "pending",
          subtotal: "129.99",
          shippingCost: "10.00",
          tax: "18.00",
          discount: "0.00",
          total: "157.99",
        })
        .returning();

      expect(result).toHaveProperty("id");
      expect(result.orderNumber).toBe("ORD-2024-001");
      expect(result.userId).toBe(testUserId);
    });

    it.skipIf(shouldSkip())("should select orders", async () => {
      await db!.insert(orders).values({
        orderNumber: "ORD-2024-002",
        userId: testUserId,
        status: "pending",
        shippingAddress: {
          id: "123",
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "123 Main St",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          isDefault: true,
          type: "home",
        },
        paymentMethod: "razorpay",
        paymentStatus: "pending",
        subtotal: "129.99",
        shippingCost: "10.00",
        tax: "18.00",
        discount: "0.00",
        total: "157.99",
      });

      const result = await db!.select().from(orders).where(eq(orders.userId, testUserId));
      expect(result).toHaveLength(1);
    });

    it.skipIf(shouldSkip())("should update order status", async () => {
      const [inserted] = await db!
        .insert(orders)
        .values({
          orderNumber: "ORD-2024-003",
          userId: testUserId,
          status: "pending",
          shippingAddress: {
            id: "123",
            fullName: "John Doe",
            phone: "+919876543210",
            addressLine1: "123 Main St",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            country: "India",
            isDefault: true,
            type: "home",
          },
          paymentMethod: "razorpay",
          paymentStatus: "pending",
          subtotal: "129.99",
          shippingCost: "10.00",
          tax: "18.00",
          discount: "0.00",
          total: "157.99",
        })
        .returning();

      await db!
        .update(orders)
        .set({ status: "confirmed", paymentStatus: "paid" })
        .where(eq(orders.id, inserted.id));

      const [result] = await db!.select().from(orders).where(eq(orders.id, inserted.id));
      expect(result.status).toBe("confirmed");
      expect(result.paymentStatus).toBe("paid");
    });
  });

  describe("Order Status Workflow", () => {
    it.skipIf(shouldSkip())("should support all order statuses", async () => {
      const statuses = [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ];

      for (const status of statuses) {
        const [result] = await db!
          .insert(orders)
          .values({
            orderNumber: `ORD-STATUS-${status}`,
            userId: testUserId,
            status: status as any,
            shippingAddress: {
              id: "123",
              fullName: "John Doe",
              phone: "+919876543210",
              addressLine1: "123 Main St",
              city: "Mumbai",
              state: "Maharashtra",
              pincode: "400001",
              country: "India",
              isDefault: true,
              type: "home",
            },
            paymentMethod: "razorpay",
            paymentStatus: "pending",
            subtotal: "100.00",
            shippingCost: "10.00",
            tax: "15.00",
            discount: "0.00",
            total: "125.00",
          })
          .returning();

        expect(result.status).toBe(status);
        await db!.delete(orders).where(eq(orders.id, result.id));
      }
    });
  });

  describe("Payment Methods", () => {
    it.skipIf(shouldSkip())("should support all payment methods", async () => {
      const methods = ["razorpay", "stripe", "cod", "upi"];

      for (const method of methods) {
        const [result] = await db!
          .insert(orders)
          .values({
            orderNumber: `ORD-PAY-${method}`,
            userId: testUserId,
            status: "pending",
            shippingAddress: {
              id: "123",
              fullName: "John Doe",
              phone: "+919876543210",
              addressLine1: "123 Main St",
              city: "Mumbai",
              state: "Maharashtra",
              pincode: "400001",
              country: "India",
              isDefault: true,
              type: "home",
            },
            paymentMethod: method as any,
            paymentStatus: "pending",
            subtotal: "100.00",
            shippingCost: "10.00",
            tax: "15.00",
            discount: "0.00",
            total: "125.00",
          })
          .returning();

        expect(result.paymentMethod).toBe(method);
        await db!.delete(orders).where(eq(orders.id, result.id));
      }
    });
  });

  describe("Photo Approval", () => {
    it.skipIf(shouldSkip())("should store photo approval data", async () => {
      const [result] = await db!
        .insert(orders)
        .values({
          orderNumber: "ORD-PHOTO-001",
          userId: testUserId,
          status: "pending",
          shippingAddress: {
            id: "123",
            fullName: "John Doe",
            phone: "+919876543210",
            addressLine1: "123 Main St",
            city: "Mumbai",
            state: "Maharashtra",
            pincode: "400001",
            country: "India",
            isDefault: true,
            type: "home",
          },
          paymentMethod: "razorpay",
          paymentStatus: "pending",
          subtotal: "129.99",
          shippingCost: "10.00",
          tax: "18.00",
          discount: "0.00",
          total: "157.99",
          photoApproval: {
            required: true,
            status: "pending",
            photoUrls: ["https://example.com/photo1.jpg"],
          },
        })
        .returning();

      expect(result.photoApproval).toBeDefined();
      expect(result.photoApproval?.required).toBe(true);
      expect(result.photoApproval?.status).toBe("pending");
    });
  });
});

describe("Order Items Table Schema", () => {
  let testUserId: string;
  let testOrderId: string;
  let testProductId: string;
  let testVariantId: string;

  beforeEach(async () => {
    if (shouldSkip() || !db) return;

    const [user] = await db
      .insert(users)
      .values({
        email: "item-test@example.com",
        name: "Item Test User",
        role: "customer",
      })
      .returning();
    testUserId = user.id;

    const [product] = await db
      .insert(products)
      .values({
        sku: "ITEM-TEST-001",
        title: "Test Product",
        slug: "test-product-items",
        description: "Product for item testing",
        basePrice: "99.99",
        styles: ["modern"],
        subjects: ["art"],
        colors: ["blue"],
        orientation: "portrait",
        images: [
          {
            url: "https://example.com/img.jpg",
            alt: "Test",
            width: 1000,
            height: 1500,
            isPrimary: true,
          },
        ],
        seoTitle: "Test Product",
        seoDescription: "Test",
        status: "active",
      })
      .returning();
    testProductId = product.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: testProductId,
        sizeLabel: "12x16 inches",
        widthInches: "12.00",
        heightInches: "16.00",
        price: "129.99",
        stockQuantity: 50,
      })
      .returning();
    testVariantId = variant.id;

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: "ORD-ITEMS-001",
        userId: testUserId,
        status: "pending",
        shippingAddress: {
          id: "123",
          fullName: "John Doe",
          phone: "+919876543210",
          addressLine1: "123 Main St",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
          country: "India",
          isDefault: true,
          type: "home",
        },
        paymentMethod: "razorpay",
        paymentStatus: "pending",
        subtotal: "129.99",
        shippingCost: "10.00",
        tax: "18.00",
        discount: "0.00",
        total: "157.99",
      })
      .returning();
    testOrderId = order.id;
  });

  describe("Table Structure", () => {
    it.skipIf(shouldSkip())("should have order_items table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'order_items'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(shouldSkip())("should have foreign keys", async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'order_items' AND constraint_type = 'FOREIGN KEY'
      `;
      expect(result.length).toBeGreaterThanOrEqual(3); // order_id, product_id, variant_id
    });
  });

  describe("Order Item CRUD Operations", () => {
    it.skipIf(shouldSkip())("should insert an order item", async () => {
      const [result] = await db!
        .insert(orderItems)
        .values({
          orderId: testOrderId,
          productId: testProductId,
          variantId: testVariantId,
          productTitle: "Test Product",
          productSku: "ITEM-TEST-001",
          sizeLabel: "12x16 inches",
          quantity: 2,
          unitPrice: "129.99",
          subtotal: "259.98",
          imageUrl: "https://example.com/product.jpg",
        })
        .returning();

      expect(result).toHaveProperty("id");
      expect(result.orderId).toBe(testOrderId);
      expect(result.quantity).toBe(2);
    });

    it.skipIf(shouldSkip())("should select order items for an order", async () => {
      await db!.insert(orderItems).values([
        {
          orderId: testOrderId,
          productId: testProductId,
          variantId: testVariantId,
          productTitle: "Item 1",
          productSku: "SKU-001",
          sizeLabel: "12x16 inches",
          quantity: 1,
          unitPrice: "100.00",
          subtotal: "100.00",
          imageUrl: "https://example.com/1.jpg",
        },
        {
          orderId: testOrderId,
          productId: testProductId,
          variantId: testVariantId,
          productTitle: "Item 2",
          productSku: "SKU-002",
          sizeLabel: "16x20 inches",
          quantity: 2,
          unitPrice: "150.00",
          subtotal: "300.00",
          imageUrl: "https://example.com/2.jpg",
        },
      ]);

      const result = await db!.select().from(orderItems).where(eq(orderItems.orderId, testOrderId));
      expect(result).toHaveLength(2);
    });

    it.skipIf(shouldSkip())("should delete order items when order is deleted", async () => {
      await db!.insert(orderItems).values({
        orderId: testOrderId,
        productId: testProductId,
        variantId: testVariantId,
        productTitle: "Test Item",
        productSku: "TEST-SKU",
        sizeLabel: "12x16 inches",
        quantity: 1,
        unitPrice: "100.00",
        subtotal: "100.00",
        imageUrl: "https://example.com/test.jpg",
      });

      await db!.delete(orders).where(eq(orders.id, testOrderId));

      const result = await db!.select().from(orderItems).where(eq(orderItems.orderId, testOrderId));
      expect(result).toHaveLength(0);
    });
  });

  describe("Order Item Customizations", () => {
    it.skipIf(shouldSkip())("should store customization data", async () => {
      const [result] = await db!
        .insert(orderItems)
        .values({
          orderId: testOrderId,
          productId: testProductId,
          variantId: testVariantId,
          productTitle: "Custom Product",
          productSku: "CUSTOM-001",
          sizeLabel: "12x16 inches",
          quantity: 1,
          unitPrice: "150.00",
          subtotal: "150.00",
          imageUrl: "https://example.com/custom.jpg",
          customizations: {
            matOption: "white-mat",
            glassType: "anti-reflective",
            signaturePlacement: "bottom-right",
            specialInstructions: "Handle with care",
          },
        })
        .returning();

      expect(result.customizations).toBeDefined();
      expect(result.customizations?.matOption).toBe("white-mat");
      expect(result.customizations?.glassType).toBe("anti-reflective");
    });
  });
});
