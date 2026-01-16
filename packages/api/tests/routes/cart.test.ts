import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import cartRouter from '../../src/routes/cart';
import { createDatabase } from '../../src/db/index';
import {
  cartItems,
  products,
  productVariants,
  frames,
  users,
  sessions
} from '../../src/db/schema';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import '../setup'; // Import test setup

/**
 * Tests for cart management endpoints
 *
 * This test suite validates the cart API routes:
 * - GET /api/cart - Get cart items for authenticated user
 * - POST /api/cart - Add item to cart
 * - PUT /api/cart/:id - Update cart item quantity
 * - DELETE /api/cart/:id - Remove item from cart
 * - DELETE /api/cart - Clear entire cart
 *
 * @see packages/api/src/routes/cart.ts
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

describe('Cart API Routes', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof createDatabase>['db'];
  let app: Hono;
  let testUserId: string;
  let testProductId: string;
  let testVariantId: string;
  let testFrameId: string;

  beforeAll(async () => {
    // Set up database connection - use test database
    const connectionString = process.env.DATABASE_URL || 'postgresql://poster_app:dev_password@localhost:5433/poster_app_test';
    sql = postgres(connectionString);
    const dbInstance = createDatabase(connectionString);
    db = dbInstance.db;

    // Run migrations
    await runMigrations(sql);

    // Create test user
    const userResult = await db.insert(users).values({
      id: 'test_user_cart_' + Date.now(),
      email: 'carttest@example.com',
      name: 'Cart Test User',
      role: 'customer',
    }).returning();
    testUserId = userResult[0].id;

    // Create test product
    const productResult = await db.insert(products).values({
      sku: 'CART-TEST-001',
      title: 'Test Cart Product',
      slug: 'test-cart-product',
      description: 'Test product for cart testing',
      basePrice: '1499.00',
      styles: ['minimalist'],
      subjects: ['abstract'],
      colors: ['blue'],
      orientation: 'landscape',
      images: [{ url: 'https://example.com/cart-test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
      seoTitle: 'Test Cart Product',
      seoDescription: 'Test product description',
      status: 'active',
    }).returning();
    testProductId = productResult[0].id;

    // Create test variant
    const variantResult = await db.insert(productVariants).values({
      productId: testProductId,
      sizeLabel: '24" x 32"',
      widthInches: '24.00',
      heightInches: '32.00',
      price: '1499.00',
      stockQuantity: 10,
    }).returning();
    testVariantId = variantResult[0].id;

    // Create test frame
    const frameResult = await db.insert(frames).values({
      name: 'Black Wood Frame',
      type: 'standard',
      material: 'wood',
      priceModifier: '499.00',
      imageUrl: 'https://example.com/frame-black.jpg',
      isActive: true,
    }).returning();
    testFrameId = frameResult[0].id;

    // Set up Hono app with routes
    app = new Hono();
    // Add a simple auth context middleware for testing
    app.use('*', async (c, next) => {
      c.set('user', { id: testUserId, email: 'carttest@example.com', role: 'customer' });
      await next();
    });
    app.route('/api/cart', cartRouter);
  });

  afterAll(async () => {
    // Clean up using raw SQL
    await sql`DELETE FROM cart_items`;
    await sql`DELETE FROM product_variants`;
    await sql`DELETE FROM products`;
    await sql`DELETE FROM frames`;
    await sql`DELETE FROM sessions`;
    await sql`DELETE FROM users`;
    await sql.end();
  });

  beforeEach(async () => {
    // Clean up cart items before each test
    await sql`DELETE FROM cart_items`;
  });

  describe('GET /api/cart - Get Cart Items', () => {
    it('should return empty cart when no items exist', async () => {
      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toBeInstanceOf(Array);
      expect(json.items).toHaveLength(0);
      expect(json.total).toBe(0);
      expect(json.subtotal).toBe('0.00');
    });

    it('should return cart items for authenticated user', async () => {
      // Add items to cart
      await db.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 2,
        },
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId,
          quantity: 1,
        },
      ]);

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toHaveLength(2);
      expect(json.total).toBe(2);
    });

    it('should include product details in cart items', async () => {
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items[0]).toHaveProperty('product');
      expect(json.items[0].product).toHaveProperty('title');
      expect(json.items[0].product).toHaveProperty('images');
    });

    it('should include variant details in cart items', async () => {
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items[0]).toHaveProperty('variant');
      expect(json.items[0].variant).toHaveProperty('sizeLabel');
      expect(json.items[0].variant).toHaveProperty('price');
    });

    it('should include frame details when frame is selected', async () => {
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        frameId: testFrameId,
        quantity: 1,
      });

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items[0]).toHaveProperty('frame');
      expect(json.items[0].frame).toHaveProperty('name');
      expect(json.items[0].frame).toHaveProperty('priceModifier');
    });

    it('should calculate correct subtotal', async () => {
      await db.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 2, // 2 × 1499 = 2998
        },
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId,
          quantity: 1, // 1 × (1499 + 499) = 1998
        },
      ]);

      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      // Total should be 2998 + 1998 = 4996
      expect(parseFloat(json.subtotal)).toBeCloseTo(4996, 2);
    });

    it('should not return other users cart items', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_other_' + Date.now(),
        email: 'other@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Add items for other user
      await db.insert(cartItems).values({
        userId: otherUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 5,
      });

      // Request should only show current user's cart (empty)
      const res = await app.request('/api/cart');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.items).toHaveLength(0);
      expect(json.total).toBe(0);

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });
  });

  describe('POST /api/cart - Add Item to Cart', () => {
    it('should add new item to cart', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json).toHaveProperty('id');
      expect(json.productId).toBe(testProductId);
      expect(json.variantId).toBe(testVariantId);
      expect(json.quantity).toBe(1);
    });

    it('should add item with frame', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          frameId: testFrameId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.frameId).toBe(testFrameId);
    });

    it('should add item with multiple quantity', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 3,
        }),
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.quantity).toBe(3);
    });

    it('should update quantity if same item already exists', async () => {
      // Add initial item
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 2,
      });

      // Add same item again
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.quantity).toBe(3); // Should be updated to 2 + 1 = 3

      // Verify only one cart item exists
      const items = await db.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(items).toHaveLength(1);
    });

    it('should reject request with missing productId', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variantId: testVariantId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('productId');
    });

    it('should reject request with missing variantId', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('variantId');
    });

    it('should reject request with invalid quantity (zero)', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 0,
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('quantity');
    });

    it('should reject request with invalid quantity (negative)', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: -1,
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('quantity');
    });

    it('should reject request with non-existent product', async () => {
      const fakeProductId = '00000000-0000-0000-0000-000000000000';

      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: fakeProductId,
          variantId: testVariantId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('Product');
    });

    it('should reject request with non-existent variant', async () => {
      const fakeVariantId = '00000000-0000-0000-0000-000000000000';

      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: fakeVariantId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('Variant');
    });

    it('should reject request with non-existent frame', async () => {
      const fakeFrameId = '00000000-0000-0000-0000-000000000000';

      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          frameId: fakeFrameId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('Frame');
    });
  });

  describe('PUT /api/cart/:id - Update Cart Item', () => {
    it('should update cart item quantity', async () => {
      // Add item to cart
      const cartItemResult = await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 2,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: 5,
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.id).toBe(cartItemId);
      expect(json.quantity).toBe(5);
    });

    it('should update cart item frame', async () => {
      // Add item to cart without frame
      const cartItemResult = await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frameId: testFrameId,
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.frameId).toBe(testFrameId);
    });

    it('should remove frame from cart item', async () => {
      // Add item with frame
      const cartItemResult = await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        frameId: testFrameId,
        quantity: 1,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          frameId: null,
        }),
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.frameId).toBeNull();
    });

    it('should return 404 for non-existent cart item', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await app.request(`/api/cart/${fakeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: 5,
        }),
      });

      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('Cart item');
    });

    it('should reject update with invalid quantity (zero)', async () => {
      const cartItemResult = await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 2,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: 0,
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('quantity');
    });

    it('should reject update with invalid quantity (negative)', async () => {
      const cartItemResult = await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 2,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: -1,
        }),
      });

      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('quantity');
    });

    it('should not allow updating another users cart item', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_other_update_' + Date.now(),
        email: 'other-update@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Add item for other user
      const cartItemResult = await db.insert(cartItems).values({
        userId: otherUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: 5,
        }),
      });

      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toContain('permission');

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });
  });

  describe('DELETE /api/cart/:id - Remove Cart Item', () => {
    it('should remove cart item', async () => {
      // Add item to cart
      const cartItemResult = await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 2,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.message).toContain('removed');

      // Verify item is deleted
      const items = await db.select().from(cartItems).where(eq(cartItems.id, cartItemId));
      expect(items).toHaveLength(0);
    });

    it('should return 404 for non-existent cart item', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await app.request(`/api/cart/${fakeId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toContain('Cart item');
    });

    it('should not allow deleting another users cart item', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_other_delete_' + Date.now(),
        email: 'other-delete@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Add item for other user
      const cartItemResult = await db.insert(cartItems).values({
        userId: otherUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      }).returning();

      const cartItemId = cartItemResult[0].id;

      const res = await app.request(`/api/cart/${cartItemId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toContain('permission');

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });
  });

  describe('DELETE /api/cart - Clear Cart', () => {
    it('should clear all cart items for user', async () => {
      // Add multiple items to cart
      await db.insert(cartItems).values([
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

      const res = await app.request('/api/cart', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.message).toContain('cleared');

      // Verify all items are deleted
      const items = await db.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(items).toHaveLength(0);
    });

    it('should return success even if cart is already empty', async () => {
      const res = await app.request('/api/cart', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.message).toContain('cleared');
    });

    it('should only clear current users cart items', async () => {
      // Create another user
      const otherUserResult = await db.insert(users).values({
        id: 'test_user_other_clear_' + Date.now(),
        email: 'other-clear@example.com',
        name: 'Other User',
        role: 'customer',
      }).returning();
      const otherUserId = otherUserResult[0].id;

      // Add items for both users
      await db.insert(cartItems).values([
        {
          userId: testUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        },
        {
          userId: otherUserId,
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        },
      ]);

      const res = await app.request('/api/cart', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);

      // Verify only current user's items are deleted
      const currentUserItems = await db.select().from(cartItems).where(eq(cartItems.userId, testUserId));
      expect(currentUserItems).toHaveLength(0);

      const otherUserItems = await db.select().from(cartItems).where(eq(cartItems.userId, otherUserId));
      expect(otherUserItems).toHaveLength(1);

      // Cleanup
      await db.delete(users).where(eq(users.id, otherUserId));
    });
  });

  describe('Cart Operations - Authentication', () => {
    it('should require authentication for GET /api/cart', async () => {
      // Create app without auth middleware
      const noAuthApp = new Hono();
      noAuthApp.route('/api/cart', cartRouter);

      const res = await noAuthApp.request('/api/cart');
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('authentication');
    });

    it('should require authentication for POST /api/cart', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/cart', cartRouter);

      const res = await noAuthApp.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        }),
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('authentication');
    });

    it('should require authentication for PUT /api/cart/:id', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/cart', cartRouter);

      const res = await noAuthApp.request('/api/cart/some-id', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: 5,
        }),
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('authentication');
    });

    it('should require authentication for DELETE /api/cart/:id', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/cart', cartRouter);

      const res = await noAuthApp.request('/api/cart/some-id', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('authentication');
    });

    it('should require authentication for DELETE /api/cart', async () => {
      const noAuthApp = new Hono();
      noAuthApp.route('/api/cart', cartRouter);

      const res = await noAuthApp.request('/api/cart', {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('authentication');
    });
  });

  describe('Response Format Validation', () => {
    it('should return correct JSON structure for GET /api/cart', async () => {
      await db.insert(cartItems).values({
        userId: testUserId,
        productId: testProductId,
        variantId: testVariantId,
        quantity: 1,
      });

      const res = await app.request('/api/cart');
      const json = await res.json();

      expect(json).toHaveProperty('items');
      expect(json).toHaveProperty('total');
      expect(json).toHaveProperty('subtotal');
      expect(json.items[0]).toHaveProperty('id');
      expect(json.items[0]).toHaveProperty('quantity');
      expect(json.items[0]).toHaveProperty('product');
      expect(json.items[0]).toHaveProperty('variant');
      expect(json.items[0]).toHaveProperty('addedAt');
    });

    it('should return correct JSON structure for POST /api/cart', async () => {
      const res = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        }),
      });

      const json = await res.json();
      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('userId');
      expect(json).toHaveProperty('productId');
      expect(json).toHaveProperty('variantId');
      expect(json).toHaveProperty('quantity');
      expect(json).toHaveProperty('addedAt');
    });

    it('should return Content-Type application/json for all responses', async () => {
      const getRes = await app.request('/api/cart');
      expect(getRes.headers.get('Content-Type')).toContain('application/json');

      const postRes = await app.request('/api/cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: testProductId,
          variantId: testVariantId,
          quantity: 1,
        }),
      });
      expect(postRes.headers.get('Content-Type')).toContain('application/json');
    });
  });
});
