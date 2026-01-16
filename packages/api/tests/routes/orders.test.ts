import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import ordersRouter from '../../src/routes/orders';
import { createDatabase } from '../../src/db/index';
import {
  orders,
  orderItems,
  cartItems,
  products,
  productVariants,
  frames,
  users,
  sessions
} from '../../src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import postgres from 'postgres';
import '../setup'; // Import test setup

/**
 * Tests for orders management endpoints
 *
 * This test suite validates the orders API routes:
 * - GET /api/orders - Get all orders for authenticated user (with pagination and filtering)
 * - GET /api/orders/:id - Get single order with details
 * - POST /api/orders - Create order from cart
 * - PUT /api/orders/:id - Update order (admin only - for status/tracking updates)
 * - PUT /api/orders/:id/cancel - Cancel order (user or admin)
 *
 * @see packages/api/src/routes/orders.ts
 */

/**
 * Run database migrations to create all tables and enums
 */
async function runMigrations(sql: ReturnType<typeof postgres>) {
  // Drop all tables
  await sql`DROP TABLE IF EXISTS ai_generations CASCADE`;
  await sql`DROP TABLE IF EXISTS cart_items CASCADE`;
  await sql`DROP TABLE IF EXISTS order_items CASCADE`;
  await sql`DROP TABLE IF EXISTS orders CASCADE`;
  await sql`DROP TABLE IF EXISTS accounts CASCADE`;
  await sql`DROP TABLE IF EXISTS sessions CASCADE`;
  await sql`DROP TABLE IF EXISTS addresses CASCADE`;
  await sql`DROP TABLE IF EXISTS frames CASCADE`;
  await sql`DROP TABLE IF EXISTS product_variants CASCADE`;
  await sql`DROP TABLE IF EXISTS products CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;

  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Create enums
  const enums = [
    { name: 'product_status', values: ['draft', 'active', 'archived'] },
    { name: 'product_orientation', values: ['square', 'portrait', 'landscape', 'panoramic', 'round'] },
    { name: 'user_role', values: ['admin', 'customer', 'trade'] },
    { name: 'trade_account_status', values: ['pending', 'approved', 'rejected'] },
    { name: 'order_status', values: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] },
    { name: 'payment_status', values: ['pending', 'paid', 'failed', 'refunded'] },
    { name: 'payment_method', values: ['razorpay', 'stripe', 'cod', 'upi'] },
    { name: 'photo_approval_status', values: ['pending', 'sent', 'approved', 'changes_requested'] },
    { name: 'address_type', values: ['home', 'office', 'other'] },
    { name: 'ai_generation_status', values: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
    { name: 'ai_model', values: ['sdxl', 'sd-2-1', 'dalle-3', 'midjourney', 'stable-diffusion-xl-lightning'] },
    { name: 'aspect_ratio', values: ['1:1', '4:5', '3:4', '2:3', '4:3', '16:9', '21:9'] },
    { name: 'style_preset', values: ['wabi-sabi', 'abstract-expression', 'botanical', 'vintage-poster', 'minimalist', 'geometric', 'watercolor', 'line-art', 'pop-art', 'surrealism'] },
    { name: 'moderation_status', values: ['pending', 'approved', 'rejected', 'flagged'] },
  ];

  for (const enumDef of enums) {
    const values = enumDef.values.map(v => `'${v}'`).join(', ');
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE ${enumDef.name} AS ENUM (${values});
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  // Create users table (using VARCHAR for ID to accommodate Better Auth)
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      password_hash VARCHAR(255),
      role user_role NOT NULL DEFAULT 'customer',
      email_verified BOOLEAN NOT NULL DEFAULT false,
      phone_verified BOOLEAN NOT NULL DEFAULT false,
      avatar_url TEXT,
      preferences JSONB NOT NULL DEFAULT '{"emailNotifications": true}'::jsonb,
      trade_account_status trade_account_status,
      trade_business JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Create sessions table
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(500) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Create products table
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

  // Create product_variants table
  await sql`
    CREATE TABLE IF NOT EXISTS product_variants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size_label VARCHAR(50) NOT NULL,
      width_inches DECIMAL(6, 2) NOT NULL,
      height_inches DECIMAL(6, 2) NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  // Create frames table
  await sql`
    CREATE TABLE IF NOT EXISTS frames (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL,
      material VARCHAR(100) NOT NULL,
      price_modifier DECIMAL(5, 2) NOT NULL,
      image_url TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true
    )
  `;

  // Create orders table
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_number VARCHAR(50) NOT NULL UNIQUE,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

  // Create order_items table
  await sql`
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

  // Create cart_items table
  await sql`
    CREATE TABLE IF NOT EXISTS cart_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id),
      variant_id UUID NOT NULL REFERENCES product_variants(id),
      frame_id UUID REFERENCES frames(id),
      quantity INTEGER NOT NULL,
      added_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;
}

describe('Orders API Routes', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof createDatabase>['db'];
  let app: Hono;
  let adminApp: Hono;
  let testUserId: string;
  let testAdminId: string;
  let testProductId: string;
  let testVariantId: string;
  let testFrameId: string;

  beforeAll(async () => {
    // Set up database connection - use dev database for tests
    const connectionString = 'postgres://poster_app:dev_password@localhost:5433/poster_app_dev';
    sql = postgres(connectionString);
    const dbInstance = createDatabase(connectionString);
    db = dbInstance.db;

    // Run migrations
    await runMigrations(sql);

    // Create test customer user
    const userResult = await db.insert(users).values({
      id: 'test_user_orders_' + Date.now(),
      email: 'orderstest@example.com',
      name: 'Orders Test User',
      role: 'customer',
    }).returning();
    testUserId = userResult[0].id;

    // Create test admin user
    const adminResult = await db.insert(users).values({
      id: 'test_admin_orders_' + Date.now(),
      email: 'ordersadmin@example.com',
      name: 'Orders Admin User',
      role: 'admin',
    }).returning();
    testAdminId = adminResult[0].id;

    // Create test product
    const productResult = await db.insert(products).values({
      sku: 'ORDER-TEST-001',
      title: 'Test Order Product',
      slug: 'test-order-product',
      description: 'Test product for order testing',
      basePrice: '2999.00',
      styles: ['minimalist'],
      subjects: ['abstract'],
      colors: ['blue'],
      orientation: 'landscape',
      images: [{ url: 'https://example.com/order-test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
      seoTitle: 'Test Order Product',
      seoDescription: 'Test product description',
      status: 'active',
    }).returning();
    testProductId = productResult[0].id;

    // Create test variant
    const variantResult = await db.insert(productVariants).values({
      productId: testProductId,
      sizeLabel: '24" x 36"',
      widthInches: '24.00',
      heightInches: '36.00',
      price: '2999.00',
      stockQuantity: 20,
    }).returning();
    testVariantId = variantResult[0].id;

    // Create test frame
    const frameResult = await db.insert(frames).values({
      name: 'Walnut Frame',
      type: 'standard',
      material: 'wood',
      priceModifier: '699.00',
      imageUrl: 'https://example.com/frame-walnut.jpg',
      isActive: true,
    }).returning();
    testFrameId = frameResult[0].id;

    // Set up Hono app with customer auth
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { id: testUserId, email: 'orderstest@example.com', role: 'customer' });
      await next();
    });
    app.route('/api/orders', ordersRouter);

    // Set up Hono app with admin auth
    adminApp = new Hono();
    adminApp.use('*', async (c, next) => {
      c.set('user', { id: testAdminId, email: 'ordersadmin@example.com', role: 'admin' });
      await next();
    });
    adminApp.route('/api/orders', ordersRouter);
  });

  afterAll(async () => {
    // Clean up using raw SQL
    await sql`DELETE FROM order_items`;
    await sql`DELETE FROM orders`;
    await sql`DELETE FROM cart_items`;
    await sql`DELETE FROM product_variants`;
    await sql`DELETE FROM products`;
    await sql`DELETE FROM frames`;
    await sql`DELETE FROM sessions`;
    await sql`DELETE FROM users`;
    await sql.end();
  });

  beforeEach(async () => {
    // Clean up orders and cart before each test
    await sql`DELETE FROM order_items`;
    await sql`DELETE FROM orders`;
    await sql`DELETE FROM cart_items`;
  });

  describe('GET /api/orders - List Orders', () => {
    it('should return empty list when no orders exist', async () => {
      const res = await app.request('/api/orders');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toBeInstanceOf(Array);
      expect(json.data).toHaveLength(0);
      expect(json.meta).toHaveProperty('total', 0);
      expect(json.meta).toHaveProperty('page', 1);
    });

    it('should return orders for authenticated user', async () => {
      // Create test orders
      await db.insert(orders).values([
        {
          orderNumber: 'ORD-TEST-001',
          userId: testUserId,
          status: 'pending',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'pending',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
        },
        {
          orderNumber: 'ORD-TEST-002',
          userId: testUserId,
          status: 'delivered',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'paid',
          paymentId: 'pay_test123',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
          trackingNumber: 'TRK123456',
          shippingCarrier: 'Delhivery',
        },
      ]);

      const res = await app.request('/api/orders');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.meta.total).toBe(2);
    });

    it('should return orders in descending order by creation date', async () => {
      // Create test orders with different timestamps
      const order1 = await db.insert(orders).values({
        orderNumber: 'ORD-TEST-001',
        userId: testUserId,
        status: 'pending',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'pending',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const order2 = await db.insert(orders).values({
        orderNumber: 'ORD-TEST-002',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const res = await app.request('/api/orders');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      // Most recent order should be first
      expect(json.data[0].orderNumber).toBe('ORD-TEST-002');
      expect(json.data[1].orderNumber).toBe('ORD-TEST-001');
    });

    it('should filter orders by status', async () => {
      // Create orders with different statuses
      await db.insert(orders).values([
        {
          orderNumber: 'ORD-PENDING',
          userId: testUserId,
          status: 'pending',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'pending',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
        },
        {
          orderNumber: 'ORD-SHIPPED',
          userId: testUserId,
          status: 'shipped',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'paid',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
          trackingNumber: 'TRK123',
        },
        {
          orderNumber: 'ORD-DELIVERED',
          userId: testUserId,
          status: 'delivered',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'paid',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
        },
      ]);

      const res = await app.request('/api/orders?status=shipped');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].orderNumber).toBe('ORD-SHIPPED');
      expect(json.data[0].status).toBe('shipped');
    });

    it('should support pagination', async () => {
      // Create 15 orders
      const orderPromises = [];
      for (let i = 1; i <= 15; i++) {
        orderPromises.push(
          db.insert(orders).values({
            orderNumber: `ORD-PAGE-${i.toString().padStart(3, '0')}`,
            userId: testUserId,
            status: 'confirmed',
            shippingAddress: {
              fullName: 'John Doe',
              phone: '+919876543210',
              addressLine1: '123 Test St',
              city: 'Mumbai',
              state: 'Maharashtra',
              pincode: '400001',
              country: 'India',
              isDefault: true,
              type: 'home'
            },
            paymentMethod: 'razorpay',
            paymentStatus: 'paid',
            subtotal: '2999.00',
            shippingCost: '0.00',
            tax: '539.82',
            discount: '0.00',
            total: '3538.82',
          })
        );
      }
      await Promise.all(orderPromises);

      // Get first page (default limit is 10)
      const page1 = await app.request('/api/orders?page=1&limit=10');
      expect(page1.status).toBe(200);

      const json1 = await page1.json();
      expect(json1.data).toHaveLength(10);
      expect(json1.meta.total).toBe(15);
      expect(json1.meta.page).toBe(1);
      expect(json1.meta.totalPages).toBe(2);

      // Get second page
      const page2 = await app.request('/api/orders?page=2&limit=10');
      expect(page2.status).toBe(200);

      const json2 = await page2.json();
      expect(json2.data).toHaveLength(5);
      expect(json2.meta.page).toBe(2);
    });

    it('should not return other users orders', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_other_orders_' + Date.now(),
        email: 'other-orders@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Create orders for both users
      await db.insert(orders).values([
        {
          orderNumber: 'ORD-USER1',
          userId: testUserId,
          status: 'confirmed',
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'paid',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
        },
        {
          orderNumber: 'ORD-USER2',
          userId: otherUserId,
          status: 'confirmed',
          shippingAddress: {
            fullName: 'Jane Doe',
            phone: '+919876543211',
            addressLine1: '456 Test Ave',
            city: 'Delhi',
            state: 'Delhi',
            pincode: '110001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
          paymentStatus: 'paid',
          subtotal: '2999.00',
          shippingCost: '0.00',
          tax: '539.82',
          discount: '0.00',
          total: '3538.82',
        },
      ]);

      const res = await app.request('/api/orders');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].orderNumber).toBe('ORD-USER1');

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });
  });

  describe('GET /api/orders/:id - Get Single Order', () => {
    it('should return order with details', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-DETAIL-001',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          addressLine2: 'Apt 4B',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        paymentId: 'pay_detail_test',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      // Create order items
      await db.insert(orderItems).values({
        orderId,
        productId: testProductId,
        variantId: testVariantId,
        frameId: testFrameId,
        productTitle: 'Test Order Product',
        productSku: 'ORDER-TEST-001',
        sizeLabel: '24" x 36"',
        frameType: 'Walnut Frame',
        quantity: 1,
        unitPrice: '2999.00',
        subtotal: '2999.00',
        imageUrl: 'https://example.com/order-test.jpg',
      });

      const res = await app.request(`/api/orders/${orderId}`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.id).toBe(orderId);
      expect(json.orderNumber).toBe('ORD-DETAIL-001');
      expect(json.status).toBe('confirmed');
      expect(json.paymentStatus).toBe('paid');
      expect(json).toHaveProperty('shippingAddress');
      expect(json.shippingAddress.fullName).toBe('John Doe');
      expect(json).toHaveProperty('items');
      expect(json.items).toHaveLength(1);
      expect(json.items[0].productTitle).toBe('Test Order Product');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await app.request(`/api/orders/${fakeId}`);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('Order');
    });

    it('should return 403 for other users order', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_other_detail_' + Date.now(),
        email: 'other-detail@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Create order for other user
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-OTHER-001',
        userId: otherUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'Other User',
          phone: '+919876543211',
          addressLine1: '456 Test Ave',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await app.request(`/api/orders/${orderId}`);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toContain('permission');

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });

    it('should allow admin to view any order', async () => {
      // Create order for regular user
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-ADMIN-VIEW',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      // Admin should be able to view
      const res = await adminApp.request(`/api/orders/${orderId}`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.orderNumber).toBe('ORD-ADMIN-VIEW');
    });
  });

  describe('POST /api/orders - Create Order', () => {
    it('should create order from cart items', async () => {
      // Add items to cart
      await db.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId,
          quantity: 2,
        },
      ]);

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('orderNumber');
      expect(json.status).toBe('pending');
      expect(json.paymentStatus).toBe('pending');
      expect(json).toHaveProperty('items');
      expect(json.items).toHaveLength(1);

      // Verify cart is cleared
      const cartItemsResult = await db.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(cartItemsResult).toHaveLength(0);
    });

    it('should reject order creation with empty cart', async () => {
      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('Cart');
    });

    it('should reject order creation with missing shipping address', async () => {
      // Add items to cart
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod: 'razorpay',
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('shippingAddress');
    });

    it('should reject order creation with invalid payment method', async () => {
      // Add items to cart
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'invalid_method',
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('paymentMethod');
    });

    it('should calculate order totals correctly', async () => {
      // Add items to cart
      await db.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId, // +699
          quantity: 2, // 2 x (2999 + 699) = 7396
        },
      ]);

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(parseFloat(json.subtotal)).toBeCloseTo(7396, 2);
      expect(parseFloat(json.tax)).toBeCloseTo(7396 * 0.18, 2); // 18% GST
      expect(parseFloat(json.total)).toBeCloseTo(7396 * 1.18, 2);
    });

    it('should generate unique order number', async () => {
      // Add items to cart
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      const res = await app.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: 'John Doe',
            phone: '+919876543210',
            addressLine1: '123 Test St',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.orderNumber).toMatch(/^ORD-\d{8}$/);
    });
  });

  describe('PUT /api/orders/:id - Update Order (Admin)', () => {
    it('should allow admin to update order status', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-UPDATE-001',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await adminApp.request(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'shipped',
          trackingNumber: 'TRK123456789',
          shippingCarrier: 'Delhivery',
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('shipped');
      expect(json.trackingNumber).toBe('TRK123456789');
      expect(json.shippingCarrier).toBe('Delhivery');
    });

    it('should allow admin to update payment status', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-PAYMENT-001',
        userId: testUserId,
        status: 'pending',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'pending',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await adminApp.request(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentStatus: 'paid',
          paymentId: 'pay_admin_123',
          status: 'confirmed',
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.paymentStatus).toBe('paid');
      expect(json.paymentId).toBe('pay_admin_123');
      expect(json.status).toBe('confirmed');
    });

    it('should reject update from non-admin user', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-NONADMIN-001',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await app.request(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'shipped',
        }),
      });

      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toContain('admin');
    });

    it('should reject update with invalid status', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-INVALID-001',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await adminApp.request(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'invalid_status',
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('status');
    });
  });

  describe('PUT /api/orders/:id/cancel - Cancel Order', () => {
    it('should allow user to cancel their own pending order', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-CANCEL-001',
        userId: testUserId,
        status: 'pending',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'pending',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await app.request(`/api/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Changed my mind',
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('cancelled');
      expect(json).toHaveProperty('cancelledAt');
      expect(json.notes).toContain('Changed my mind');
    });

    it('should allow admin to cancel any order', async () => {
      // Create order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-ADMIN-CANCEL',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await adminApp.request(`/api/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Admin cancellation - stock issue',
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('cancelled');
    });

    it('should reject cancellation of other users order', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_cancel_' + Date.now(),
        email: 'other-cancel@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Create order for other user
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-OTHER-CANCEL',
        userId: otherUserId,
        status: 'pending',
        shippingAddress: {
          fullName: 'Other User',
          phone: '+919876543211',
          addressLine1: '456 Test Ave',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'pending',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      const res = await app.request(`/api/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Test cancellation',
        }),
      });

      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toContain('permission');

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });

    it('should reject cancellation of delivered order', async () => {
      // Create delivered order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-DELIVERED-CANCEL',
        userId: testUserId,
        status: 'delivered',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
        deliveredAt: new Date(),
      }).returning();

      const orderId = orderResult[0].id;

      const res = await app.request(`/api/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Changed my mind',
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('cannot be cancelled');
    });

    it('should reject cancellation of already cancelled order', async () => {
      // Create cancelled order
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-ALREADY-CANCELLED',
        userId: testUserId,
        status: 'cancelled',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'refunded',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
        cancelledAt: new Date(),
      }).returning();

      const orderId = orderResult[0].id;

      const res = await app.request(`/api/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Try to cancel again',
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('already cancelled');
    });
  });

  describe('Orders API - Authentication', () => {
    it('should require Authentication for GET /api/orders', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/orders', ordersRouter);

      const res = await noAuthApp.request('/api/orders');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Authentication');
    });

    it('should require Authentication for GET /api/orders/:id', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/orders', ordersRouter);

      const res = await noAuthApp.request('/api/orders/some-id');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Authentication');
    });

    it('should require Authentication for POST /api/orders', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/orders', ordersRouter);

      const res = await noAuthApp.request('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shippingAddress: {
            fullName: 'Test',
            phone: '+919876543210',
            addressLine1: 'Test',
            city: 'Test',
            state: 'Test',
            pincode: '400001',
            country: 'India',
            isDefault: true,
            type: 'home'
          },
          paymentMethod: 'razorpay',
        }),
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Authentication');
    });

    it('should require Authentication for PUT /api/orders/:id/cancel', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/orders', ordersRouter);

      const res = await noAuthApp.request('/api/orders/some-id/cancel', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Test',
        }),
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Authentication');
    });
  });

  describe('Response Format Validation', () => {
    it('should return correct JSON structure for GET /api/orders', async () => {
      // Create order
      await db.insert(orders).values({
        orderNumber: 'ORD-FORMAT-001',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      });

      const res = await app.request('/api/orders');
      const json = await res.json();

      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('meta');
      expect(json.meta).toHaveProperty('total');
      expect(json.meta).toHaveProperty('page');
      expect(json.meta).toHaveProperty('limit');
      expect(json.meta).toHaveProperty('totalPages');
      expect(json.data[0]).toHaveProperty('id');
      expect(json.data[0]).toHaveProperty('orderNumber');
      expect(json.data[0]).toHaveProperty('status');
      expect(json.data[0]).toHaveProperty('total');
      expect(json.data[0]).toHaveProperty('createdAt');
    });

    it('should return correct JSON structure for GET /api/orders/:id', async () => {
      // Create order with items
      const orderResult = await db.insert(orders).values({
        orderNumber: 'ORD-DETAIL-FORMAT',
        userId: testUserId,
        status: 'confirmed',
        shippingAddress: {
          fullName: 'John Doe',
          phone: '+919876543210',
          addressLine1: '123 Test St',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
          type: 'home'
        },
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        subtotal: '2999.00',
        shippingCost: '0.00',
        tax: '539.82',
        discount: '0.00',
        total: '3538.82',
      }).returning();

      const orderId = orderResult[0].id;

      await db.insert(orderItems).values({
        orderId,
        productId: testProductId,
        variantId: testVariantId,
        productTitle: 'Test Product',
        productSku: 'TEST-001',
        sizeLabel: '24" x 36"',
        quantity: 1,
        unitPrice: '2999.00',
        subtotal: '2999.00',
        imageUrl: 'https://example.com/test.jpg',
      });

      const res = await app.request(`/api/orders/${orderId}`);
      const json = await res.json();

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('orderNumber');
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('paymentStatus');
      expect(json).toHaveProperty('paymentMethod');
      expect(json).toHaveProperty('shippingAddress');
      expect(json).toHaveProperty('items');
      expect(json).toHaveProperty('subtotal');
      expect(json).toHaveProperty('tax');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
      expect(json.items).toBeInstanceOf(Array);
      expect(json.items[0]).toHaveProperty('productTitle');
      expect(json.items[0]).toHaveProperty('quantity');
      expect(json.items[0]).toHaveProperty('unitPrice');
    });

    it('should return Content-Type application/json for all responses', async () => {
      const getRes = await app.request('/api/orders');
      expect(getRes.headers.get('Content-Type')).toContain('application/json');
    });
  });
});
