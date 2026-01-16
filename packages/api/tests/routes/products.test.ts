/**
 * Products API Routes Tests
 *
 * Comprehensive tests for products CRUD endpoints:
 * - GET /api/products - List products with filtering, sorting, and pagination
 * - GET /api/products/:id - Get a single product
 * - POST /api/products - Create a new product (admin only)
 * - PUT /api/products/:id - Update a product (admin only)
 * - DELETE /api/products/:id - Delete a product (admin only)
 * - GET /api/products/:id/variants - Get product variants
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import productsRouter from '../../src/routes/products';
import { createDatabase } from '../../src/db/index';
import { products, productVariants, frames, users, sessions, accounts } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { createProduct, createProductVariant, createFrame, createProducts } from '../../../../tests/fixtures/products';
import '../setup';

/**
 * Run database migrations to create all tables
 */
async function runMigrations(sql: ReturnType<typeof postgres>) {
  // Drop all tables in dependency order
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

  // Create users table
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
      preferences JSONB NOT NULL DEFAULT '{"emailNotifications": true, "smsNotifications": false, "marketingEmails": true, "orderUpdates": true, "aiGenerationNotifications": true}'::jsonb,
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

  // Create accounts table
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id VARCHAR(255) PRIMARY KEY,
      "accountId" VARCHAR(255) NOT NULL UNIQUE,
      "providerId" VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(100),
      provider_account_id VARCHAR(255),
      access_token TEXT,
      refresh_token TEXT,
      expires_at TIMESTAMP,
      token_type VARCHAR(50),
      scope TEXT,
      id_token TEXT,
      password VARCHAR(255),
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
}

describe('Products API Routes', () => {
  let app: Hono;
  let db: ReturnType<typeof createDatabase>['db'];
  let client: ReturnType<typeof postgres>;
  let adminUserId: string;
  let adminToken: string;

  beforeAll(async () => {
    // Set up database connection
    const databaseUrl = 'postgres://poster_app:dev_password@localhost:5433/poster_app_dev';
    client = postgres(databaseUrl);
    process.env.DATABASE_URL = databaseUrl;

    // Run migrations
    await runMigrations(client);

    // Create Drizzle database instance
    const database = createDatabase();
    db = database.db;

    // Create Hono app with products router
    app = new Hono();
    app.route('/api/products', productsRouter);

    // Create admin user for authenticated tests
    adminUserId = 'admin_test_' + Date.now();
    await db.insert(users).values({
      id: adminUserId,
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'admin',
      emailVerified: true,
    });

    // Create session for admin
    const sessionId = 'session_' + Date.now();
    adminToken = 'token_' + Date.now();
    await db.insert(sessions).values({
      id: sessionId,
      userId: adminUserId,
      token: adminToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    // Clean up products before each test
    await client`DELETE FROM product_variants`;
    await client`DELETE FROM products`;
    await client`DELETE FROM frames`;
  });

  describe('GET /api/products', () => {
    it('should return empty list when no products exist', async () => {
      const res = await app.request('/api/products');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toEqual([]);
      expect(data.meta.total).toBe(0);
      expect(data.meta.page).toBe(1);
    });

    it('should list all products', async () => {
      // Create test products with unique SKUs
      const timestamp = Date.now();
      for (let i = 0; i < 3; i++) {
        const product = createProduct({ sku: `TEST${timestamp}_${i}`, slug: `test-product-${timestamp}-${i}` });
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const res = await app.request('/api/products');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(data.meta.total).toBe(3);
      expect(data.meta.totalPages).toBe(1);
    });

    it('should filter products by status', async () => {
      // Create products with different statuses
      await db.insert(products).values({
        sku: 'TX001',
        title: 'Active Product',
        slug: 'active-product',
        description: 'An active product',
        basePrice: '1000.00',
        styles: ['modern'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'square',
        images: [{ url: 'test.jpg', alt: 'test', width: 100, height: 100, isPrimary: true }],
        seoTitle: 'Active Product',
        seoDescription: 'Active product description',
        status: 'active',
      });

      await db.insert(products).values({
        sku: 'TX002',
        title: 'Draft Product',
        slug: 'draft-product',
        description: 'A draft product',
        basePrice: '1000.00',
        styles: ['modern'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'square',
        images: [{ url: 'test.jpg', alt: 'test', width: 100, height: 100, isPrimary: true }],
        seoTitle: 'Draft Product',
        seoDescription: 'Draft product description',
        status: 'draft',
      });

      const res = await app.request('/api/products?status=active');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe('active');
    });

    it('should filter products by orientation', async () => {
      const product = createProduct({ orientation: 'portrait' });
      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      const res = await app.request('/api/products?orientation=portrait');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].orientation).toBe('portrait');
    });

    it('should filter products by style', async () => {
      const product = createProduct({ styles: ['wabi-sabi', 'minimalist'] });
      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      const res = await app.request('/api/products?style=wabi-sabi');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].styles).toContain('wabi-sabi');
    });

    it('should filter products by multiple styles', async () => {
      const product = createProduct({ styles: ['wabi-sabi', 'minimalist'] });
      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      const res = await app.request('/api/products?style=wabi-sabi,minimalist');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
    });

    it('should search products by title', async () => {
      const product = createProduct({ title: 'Ocean Waves Abstract' });
      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      const res = await app.request('/api/products?search=ocean');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].title.toLowerCase()).toContain('ocean');
    });

    it('should search products by SKU', async () => {
      const product = createProduct({ sku: 'SEARCH123' });
      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      const res = await app.request('/api/products?search=SEARCH123');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].sku).toBe('SEARCH123');
    });

    it('should filter products by price range', async () => {
      await db.insert(products).values({
        sku: 'LOW001',
        title: 'Low Price Product',
        slug: 'low-price',
        description: 'Low price',
        basePrice: '500.00',
        styles: ['modern'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'square',
        images: [{ url: 'test.jpg', alt: 'test', width: 100, height: 100, isPrimary: true }],
        seoTitle: 'Low Price',
        seoDescription: 'Low price',
        status: 'active',
      });

      await db.insert(products).values({
        sku: 'HIGH001',
        title: 'High Price Product',
        slug: 'high-price',
        description: 'High price',
        basePrice: '5000.00',
        styles: ['modern'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'square',
        images: [{ url: 'test.jpg', alt: 'test', width: 100, height: 100, isPrimary: true }],
        seoTitle: 'High Price',
        seoDescription: 'High price',
        status: 'active',
      });

      const res = await app.request('/api/products?minPrice=1000&maxPrice=2000');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(0); // Neither product is in this range
    });

    it('should sort products by price ascending', async () => {
      const testProducts = [
        createProduct({ sku: 'P1', basePrice: '3000.00' }),
        createProduct({ sku: 'P2', basePrice: '1000.00' }),
        createProduct({ sku: 'P3', basePrice: '2000.00' }),
      ];

      for (const product of testProducts) {
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug + '-' + product.sku,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const res = await app.request('/api/products?sort=price&order=asc');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(parseFloat(data.data[0].base_price)).toBeLessThanOrEqual(parseFloat(data.data[1].base_price));
      expect(parseFloat(data.data[1].base_price)).toBeLessThanOrEqual(parseFloat(data.data[2].base_price));
    });

    it('should sort products by price descending', async () => {
      const testProducts = [
        createProduct({ sku: 'P1', basePrice: '1000.00' }),
        createProduct({ sku: 'P2', basePrice: '3000.00' }),
        createProduct({ sku: 'P3', basePrice: '2000.00' }),
      ];

      for (const product of testProducts) {
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug + '-' + product.sku,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const res = await app.request('/api/products?sort=price&order=desc');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(parseFloat(data.data[0].base_price)).toBeGreaterThanOrEqual(parseFloat(data.data[1].base_price));
      expect(parseFloat(data.data[1].base_price)).toBeGreaterThanOrEqual(parseFloat(data.data[2].base_price));
    });

    it('should sort products by title', async () => {
      const testProducts = [
        createProduct({ sku: 'P1', title: 'Zebra Art' }),
        createProduct({ sku: 'P2', title: 'Alpha Art' }),
        createProduct({ sku: 'P3', title: 'Beta Art' }),
      ];

      for (const product of testProducts) {
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug + '-' + product.sku,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const res = await app.request('/api/products?sort=title&order=asc');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(data.data[0].title).toBe('Alpha Art');
      expect(data.data[1].title).toBe('Beta Art');
      expect(data.data[2].title).toBe('Zebra Art');
    });

    it('should paginate products correctly', async () => {
      // Create 25 products with unique SKUs
      const timestamp = Date.now();
      for (let i = 0; i < 25; i++) {
        const product = createProduct({ sku: `PAGE${timestamp}_${i}`, slug: `page-product-${timestamp}-${i}` });
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      // Get first page
      const res1 = await app.request('/api/products?page=1&limit=10');
      const data1 = await res1.json();

      expect(res1.status).toBe(200);
      expect(data1.data).toHaveLength(10);
      expect(data1.meta.page).toBe(1);
      expect(data1.meta.total).toBe(25);
      expect(data1.meta.totalPages).toBe(3);

      // Get second page
      const res2 = await app.request('/api/products?page=2&limit=10');
      const data2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(data2.data).toHaveLength(10);
      expect(data2.meta.page).toBe(2);

      // Get third page (should have 5 items)
      const res3 = await app.request('/api/products?page=3&limit=10');
      const data3 = await res3.json();

      expect(res3.status).toBe(200);
      expect(data3.data).toHaveLength(5);
      expect(data3.meta.page).toBe(3);
    });

    it('should respect limit parameter', async () => {
      const timestamp = Date.now();
      for (let i = 0; i < 10; i++) {
        const product = createProduct({ sku: `LIMIT${timestamp}_${i}`, slug: `limit-product-${timestamp}-${i}` });
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const res = await app.request('/api/products?limit=5');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(5);
      expect(data.meta.limit).toBe(5);
    });

    it('should enforce maximum limit of 100', async () => {
      const res = await app.request('/api/products?limit=200');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.meta.limit).toBe(100); // Should be capped at 100
    });

    it('should combine multiple filters', async () => {
      const product = createProduct({
        status: 'active',
        orientation: 'landscape',
        styles: ['wabi-sabi'],
        basePrice: '1500.00',
      });

      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      const res = await app.request('/api/products?status=active&orientation=landscape&style=wabi-sabi&minPrice=1000&maxPrice=2000');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe('active');
      expect(data.data[0].orientation).toBe('landscape');
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get a product by ID', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe(inserted[0].id);
      expect(data.title).toBe(product.title);
      expect(data.sku).toBe(product.sku);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await app.request('/api/products/00000000-0000-0000-0000-000000000000');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Product not found');
    });

    it('should return 500 for invalid UUID', async () => {
      const res = await app.request('/api/products/invalid-uuid');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/products/:id/variants', () => {
    it('should get product variants', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      // Create variants
      const variant1 = createProductVariant({ productId: inserted[0].id, sizeLabel: '12x16 inches' });
      const variant2 = createProductVariant({ productId: inserted[0].id, sizeLabel: '24x32 inches' });

      await db.insert(productVariants).values([
        {
          productId: inserted[0].id,
          sizeLabel: variant1.sizeLabel,
          widthInches: variant1.widthInches.toString(),
          heightInches: variant1.heightInches.toString(),
          price: variant1.price,
          stockQuantity: variant1.stockQuantity,
        },
        {
          productId: inserted[0].id,
          sizeLabel: variant2.sizeLabel,
          widthInches: variant2.widthInches.toString(),
          heightInches: variant2.heightInches.toString(),
          price: variant2.price,
          stockQuantity: variant2.stockQuantity,
        },
      ]);

      const res = await app.request(`/api/products/${inserted[0].id}/variants`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].size_label).toBe('12x16 inches');
      expect(data.data[1].size_label).toBe('24x32 inches');
    });

    it('should return empty array when product has no variants', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}/variants`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.data).toHaveLength(0);
    });

    it('should return 404 for non-existent product variants', async () => {
      const res = await app.request('/api/products/00000000-0000-0000-0000-000000000000/variants');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Product not found');
    });
  });

  describe('POST /api/products', () => {
    it('should create a new product as admin', async () => {
      const product = createProduct({ sku: 'NEW001' });

      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.sku).toBe(product.sku);
      expect(data.title).toBe(product.title);
      expect(data.id).toBeDefined();
    });

    it('should reject creation without authentication', async () => {
      const product = createProduct();

      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject creation with missing required fields', async () => {
      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: 'MISSING001',
          title: 'Missing Fields Product',
          // Missing other required fields
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('Missing required fields');
      expect(data.fields).toBeDefined();
    });

    it('should reject duplicate SKU', async () => {
      const product = createProduct({ sku: 'DUP001' });

      // Create first product
      await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      // Try to create duplicate
      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: product.sku,
          title: 'Different Title',
          slug: 'different-slug',
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe('Product with this SKU already exists');
    });

    it('should reject duplicate slug', async () => {
      const product = createProduct({ slug: 'duplicate-slug' });

      // Create first product
      await db.insert(products).values({
        sku: 'SLUG001',
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      });

      // Try to create duplicate
      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: 'SLUG002',
          title: 'Different Title',
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe('Product with this slug already exists');
    });

    it('should set default status to draft if not provided', async () => {
      const product = createProduct();

      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          // status not provided
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.status).toBe('draft');
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update a product as admin', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          title: 'Updated Title',
          basePrice: '2999.00',
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.title).toBe('Updated Title');
      expect(data.base_price).toBe('2999.00');
      expect(data.sku).toBe(product.sku); // SKU unchanged
    });

    it('should reject update without authentication', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Updated Title',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent product', async () => {
      const res = await app.request('/api/products/00000000-0000-0000-0000-000000000000', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          title: 'Updated Title',
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Product not found');
    });

    it('should reject duplicate SKU on update', async () => {
      // Create two products
      const product1 = createProduct({ sku: 'UPDATE001' });
      const product2 = createProduct({ sku: 'UPDATE002' });

      const inserted1 = await db.insert(products).values({
        sku: product1.sku,
        title: product1.title,
        slug: product1.slug + '-1',
        description: product1.description,
        basePrice: product1.basePrice,
        styles: product1.styles,
        subjects: product1.subjects,
        colors: product1.colors,
        orientation: product1.orientation,
        images: product1.images,
        seoTitle: product1.seoTitle,
        seoDescription: product1.seoDescription,
        status: product1.status,
      }).returning();

      await db.insert(products).values({
        sku: product2.sku,
        title: product2.title,
        slug: product2.slug + '-2',
        description: product2.description,
        basePrice: product2.basePrice,
        styles: product2.styles,
        subjects: product2.subjects,
        colors: product2.colors,
        orientation: product2.orientation,
        images: product2.images,
        seoTitle: product2.seoTitle,
        seoDescription: product2.seoDescription,
        status: product2.status,
      });

      // Try to update product1 with product2's SKU
      const res = await app.request(`/api/products/${inserted1[0].id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: product2.sku,
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe('Product with this SKU already exists');
    });

    it('should reject duplicate slug on update', async () => {
      // Create two products
      const product1 = createProduct({ sku: 'SLUG001' });
      const product2 = createProduct({ sku: 'SLUG002' });

      const inserted1 = await db.insert(products).values({
        sku: product1.sku,
        title: product1.title,
        slug: 'slug-one',
        description: product1.description,
        basePrice: product1.basePrice,
        styles: product1.styles,
        subjects: product1.subjects,
        colors: product1.colors,
        orientation: product1.orientation,
        images: product1.images,
        seoTitle: product1.seoTitle,
        seoDescription: product1.seoDescription,
        status: product1.status,
      }).returning();

      await db.insert(products).values({
        sku: product2.sku,
        title: product2.title,
        slug: 'slug-two',
        description: product2.description,
        basePrice: product2.basePrice,
        styles: product2.styles,
        subjects: product2.subjects,
        colors: product2.colors,
        orientation: product2.orientation,
        images: product2.images,
        seoTitle: product2.seoTitle,
        seoDescription: product2.seoDescription,
        status: product2.status,
      });

      // Try to update product1 with product2's slug
      const res = await app.request(`/api/products/${inserted1[0].id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          slug: 'slug-two',
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error).toBe('Product with this slug already exists');
    });

    it('should allow updating product with same SKU', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `masonart-session=${adminToken}`,
        },
        body: JSON.stringify({
          sku: product.sku, // Same SKU
          title: 'Updated Title',
        }),
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.title).toBe('Updated Title');
      expect(data.sku).toBe(product.sku);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete a product as admin', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}`, {
        method: 'DELETE',
        headers: {
          'Cookie': `masonart-session=${adminToken}`,
        },
      });

      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Product deleted successfully');

      // Verify product is deleted
      const check = await db.select().from(products).where(eq(products.id, inserted[0].id));
      expect(check).toHaveLength(0);
    });

    it('should reject deletion without authentication', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      const res = await app.request(`/api/products/${inserted[0].id}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent product deletion', async () => {
      const res = await app.request('/api/products/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
        headers: {
          'Cookie': `masonart-session=${adminToken}`,
        },
      });

      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Product not found');
    });

    it('should cascade delete product variants', async () => {
      const product = createProduct();
      const inserted = await db.insert(products).values({
        sku: product.sku,
        title: product.title,
        slug: product.slug,
        description: product.description,
        basePrice: product.basePrice,
        styles: product.styles,
        subjects: product.subjects,
        colors: product.colors,
        orientation: product.orientation,
        images: product.images,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        status: product.status,
      }).returning();

      // Create variants
      const variant = createProductVariant({ productId: inserted[0].id });
      await db.insert(productVariants).values({
        productId: inserted[0].id,
        sizeLabel: variant.sizeLabel,
        widthInches: variant.widthInches.toString(),
        heightInches: variant.heightInches.toString(),
        price: variant.price,
        stockQuantity: variant.stockQuantity,
      });

      // Delete product
      await app.request(`/api/products/${inserted[0].id}`, {
        method: 'DELETE',
        headers: {
          'Cookie': `masonart-session=${adminToken}`,
        },
      });

      // Verify variants are also deleted
      const checkVariants = await db.select().from(productVariants).where(eq(productVariants.productId, inserted[0].id));
      expect(checkVariants).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close database connection to simulate error
      await client.end();

      const res = await app.request('/api/products');

      expect(res.status).toBe(500);

      // Reconnect for cleanup
      client = postgres('postgres://poster_app:dev_password@localhost:5433/poster_app_dev');
    });
  });

  describe('Performance', () => {
    it('should list products within reasonable time', async () => {
      // Create 50 products
      const timestamp = Date.now();
      for (let i = 0; i < 50; i++) {
        const product = createProduct({ sku: `PERF${timestamp}_${i}`, slug: `perf-product-${timestamp}-${i}` });
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const start = Date.now();
      const res = await app.request('/api/products?limit=20');
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should handle complex filters efficiently', async () => {
      const timestamp = Date.now();
      for (let i = 0; i < 20; i++) {
        const product = createProduct({ sku: `FILTER${timestamp}_${i}`, slug: `filter-product-${timestamp}-${i}` });
        await db.insert(products).values({
          sku: product.sku,
          title: product.title,
          slug: product.slug,
          description: product.description,
          basePrice: product.basePrice,
          styles: product.styles,
          subjects: product.subjects,
          colors: product.colors,
          orientation: product.orientation,
          images: product.images,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          status: product.status,
        });
      }

      const start = Date.now();
      const res = await app.request('/api/products?status=active&style=wabi-sabi&minPrice=1000&maxPrice=3000&sort=price&order=asc');
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(500); // Complex query should still be fast
    });
  });
});
