import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import productsRouter from '../../src/routes/products';
import { createDatabase } from '../../src/db/index';
import { products, productVariants, users, sessions } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import '../setup'; // Import test setup

/**
 * Tests for products CRUD endpoints
 *
 * This test suite validates the products API routes:
 * - GET /api/products - List products with filtering, sorting, pagination
 * - GET /api/products/:id - Get a single product
 * - GET /api/products/:id/variants - Get product variants
 * - POST /api/products - Create product (admin only)
 * - PUT /api/products/:id - Update product (admin only)
 * - DELETE /api/products/:id - Delete product (admin only)
 *
 * @see packages/api/src/routes/products.ts
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
}

describe('Products API Routes', () => {
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof createDatabase>['db'];
  let app: Hono;

  beforeAll(async () => {
    // Set up database connection - use dev database for tests
    const connectionString = 'postgres://poster_app:dev_password@localhost:5433/poster_app_dev';
    sql = postgres(connectionString);
    const dbInstance = createDatabase();
    db = dbInstance.db;

    // Run migrations
    await runMigrations(sql);

    // Set up Hono app with routes (no auth for read operations in tests)
    app = new Hono();
    app.route('/api/products', productsRouter);
  });

  afterAll(async () => {
    // Clean up using raw SQL
    await sql`DELETE FROM sessions`;
    await sql`DELETE FROM users`;
    await sql`DELETE FROM product_variants`;
    await sql`DELETE FROM products`;
    await sql.end();
  });

  beforeEach(async () => {
    // Clean up products before each test using raw SQL
    await sql`DELETE FROM product_variants`;
    await sql`DELETE FROM products`;
  });

  describe('GET /api/products - List Products', () => {
    it('should return empty list when no products exist', async () => {
      const res = await app.request('/api/products');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toBeInstanceOf(Array);
      expect(json.data).toHaveLength(0);
      expect(json.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('should list products with default pagination', async () => {
      // Create test products
      await db.insert(products).values([
        {
          sku: 'TEST001',
          title: 'Test Product 1',
          slug: 'test-product-1',
          description: 'Description 1',
          basePrice: '1499.00',
          styles: ['minimalist'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/1.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Test Product 1',
          seoDescription: 'Test description 1',
          status: 'active',
        },
        {
          sku: 'TEST002',
          title: 'Test Product 2',
          slug: 'test-product-2',
          description: 'Description 2',
          basePrice: '2499.00',
          styles: ['wabi-sabi'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/2.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Test Product 2',
          seoDescription: 'Test description 2',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.meta.total).toBe(2);
      expect(json.meta.page).toBe(1);
      expect(json.meta.limit).toBe(20);
    });

    it('should filter products by status', async () => {
      await db.insert(products).values([
        {
          sku: 'DRAFT001',
          title: 'Draft Product',
          slug: 'draft-product',
          description: 'Draft description',
          basePrice: '1499.00',
          styles: ['minimalist'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/draft.jpg', alt: 'Draft', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Draft Product',
          seoDescription: 'Draft description',
          status: 'draft',
        },
        {
          sku: 'ACTIVE001',
          title: 'Active Product',
          slug: 'active-product',
          description: 'Active description',
          basePrice: '2499.00',
          styles: ['wabi-sabi'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/active.jpg', alt: 'Active', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Active Product',
          seoDescription: 'Active description',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products?status=active');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].status).toBe('active');
      expect(json.data[0].title).toBe('Active Product');
    });

    it('should filter products by orientation', async () => {
      await db.insert(products).values([
        {
          sku: 'LAND001',
          title: 'Landscape Product',
          slug: 'landscape-product',
          description: 'Landscape description',
          basePrice: '1499.00',
          styles: ['minimalist'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/land.jpg', alt: 'Land', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Landscape Product',
          seoDescription: 'Landscape description',
          status: 'active',
        },
        {
          sku: 'PORT001',
          title: 'Portrait Product',
          slug: 'portrait-product',
          description: 'Portrait description',
          basePrice: '2499.00',
          styles: ['wabi-sabi'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/port.jpg', alt: 'Port', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Portrait Product',
          seoDescription: 'Portrait description',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products?orientation=portrait');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].orientation).toBe('portrait');
    });

    it('should filter products by style', async () => {
      await db.insert(products).values([
        {
          sku: 'MINI001',
          title: 'Minimalist Product',
          slug: 'minimalist-product',
          description: 'Minimalist description',
          basePrice: '1499.00',
          styles: ['minimalist', 'abstract'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/mini.jpg', alt: 'Mini', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Minimalist Product',
          seoDescription: 'Minimalist description',
          status: 'active',
        },
        {
          sku: 'WABI001',
          title: 'Wabi-Sabi Product',
          slug: 'wabi-sabi-product',
          description: 'Wabi-Sabi description',
          basePrice: '2499.00',
          styles: ['wabi-sabi', 'botanical'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/wabi.jpg', alt: 'Wabi', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Wabi-Sabi Product',
          seoDescription: 'Wabi-Sabi description',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products?style=minimalist');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].styles).toContain('minimalist');
    });

    it('should search products by title', async () => {
      await db.insert(products).values([
        {
          sku: 'OCEAN001',
          title: 'Ocean Waves Abstract',
          slug: 'ocean-waves-abstract',
          description: 'Ocean description',
          basePrice: '1499.00',
          styles: ['minimalist'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/ocean.jpg', alt: 'Ocean', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Ocean Waves',
          seoDescription: 'Ocean description',
          status: 'active',
        },
        {
          sku: 'FOREST001',
          title: 'Forest Landscape',
          slug: 'forest-landscape',
          description: 'Forest description',
          basePrice: '2499.00',
          styles: ['wabi-sabi'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/forest.jpg', alt: 'Forest', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Forest Landscape',
          seoDescription: 'Forest description',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products?search=ocean');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].title.toLowerCase()).toContain('ocean');
    });

    it('should filter products by price range', async () => {
      await db.insert(products).values([
        {
          sku: 'CHEAP001',
          title: 'Cheap Product',
          slug: 'cheap-product',
          description: 'Cheap description',
          basePrice: '999.00',
          styles: ['minimalist'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/cheap.jpg', alt: 'Cheap', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Cheap Product',
          seoDescription: 'Cheap description',
          status: 'active',
        },
        {
          sku: 'MID001',
          title: 'Mid-Range Product',
          slug: 'mid-range-product',
          description: 'Mid-range description',
          basePrice: '1999.00',
          styles: ['wabi-sabi'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/mid.jpg', alt: 'Mid', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Mid-Range Product',
          seoDescription: 'Mid-range description',
          status: 'active',
        },
        {
          sku: 'EXP001',
          title: 'Expensive Product',
          slug: 'expensive-product',
          description: 'Expensive description',
          basePrice: '4999.00',
          styles: ['abstract-expression'],
          subjects: ['abstract'],
          colors: ['gold'],
          orientation: 'square',
          images: [{ url: 'https://example.com/exp.jpg', alt: 'Exp', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Expensive Product',
          seoDescription: 'Expensive description',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products?minPrice=1500&maxPrice=3000');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].title).toBe('Mid-Range Product');
    });

    it('should sort products by price ascending', async () => {
      await db.insert(products).values([
        {
          sku: 'EXP001',
          title: 'Expensive',
          slug: 'expensive',
          description: 'Expensive',
          basePrice: '4999.00',
          styles: ['minimalist'],
          subjects: ['abstract'],
          colors: ['blue'],
          orientation: 'landscape',
          images: [{ url: 'https://example.com/exp.jpg', alt: 'Exp', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Expensive',
          seoDescription: 'Expensive',
          status: 'active',
        },
        {
          sku: 'CHEAP001',
          title: 'Cheap',
          slug: 'cheap',
          description: 'Cheap',
          basePrice: '999.00',
          styles: ['wabi-sabi'],
          subjects: ['nature'],
          colors: ['green'],
          orientation: 'portrait',
          images: [{ url: 'https://example.com/cheap.jpg', alt: 'Cheap', width: 2000, height: 1500, isPrimary: true }],
          seoTitle: 'Cheap',
          seoDescription: 'Cheap',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/products?sort=price&order=asc');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      // Check that first item has lower price using basePrice field (camelCase)
      const price1 = parseFloat(json.data[0].basePrice);
      const price2 = parseFloat(json.data[1].basePrice);
      expect(price1).toBeLessThanOrEqual(price2);
    });

    it('should paginate products correctly', async () => {
      // Create 25 products
      const productsData = Array.from({ length: 25 }, (_, i) => ({
        sku: `PROD${String(i + 1).padStart(3, '0')}`,
        title: `Product ${i + 1}`,
        slug: `product-${i + 1}`,
        description: `Description ${i + 1}`,
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape' as const,
        images: [{ url: `https://example.com/${i + 1}.jpg`, alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: `Product ${i + 1}`,
        seoDescription: `Description ${i + 1}`,
        status: 'active' as const,
      }));
      await db.insert(products).values(productsData);

      // Get first page (default 20 items)
      const res1 = await app.request('/api/products?page=1');
      const json1 = await res1.json();
      expect(json1.data).toHaveLength(20);
      expect(json1.meta.page).toBe(1);
      expect(json1.meta.total).toBe(25);
      expect(json1.meta.totalPages).toBe(2);

      // Get second page
      const res2 = await app.request('/api/products?page=2');
      const json2 = await res2.json();
      expect(json2.data).toHaveLength(5);
      expect(json2.meta.page).toBe(2);
    });
  });

  describe('GET /api/products/:id - Get Single Product', () => {
    it('should get a product by ID', async () => {
      const insertResult = await db.insert(products).values({
        sku: 'TEST001',
        title: 'Test Product',
        slug: 'test-product',
        description: 'Test description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Test Product',
        seoDescription: 'Test description',
        status: 'active',
      }).returning();

      const productId = insertResult[0].id;

      const res = await app.request(`/api/products/${productId}`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.id).toBe(productId);
      expect(json.sku).toBe('TEST001');
      expect(json.title).toBe('Test Product');
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await app.request(`/api/products/${fakeId}`);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Product not found');
    });

    it('should return 500 for invalid UUID', async () => {
      const res = await app.request('/api/products/invalid-uuid');
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toBe('Failed to get product');
    });
  });

  describe('GET /api/products/:id/variants - Get Product Variants', () => {
    it('should get product variants', async () => {
      const insertResult = await db.insert(products).values({
        sku: 'TEST001',
        title: 'Test Product',
        slug: 'test-product',
        description: 'Test description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Test Product',
        seoDescription: 'Test description',
        status: 'active',
      }).returning();

      const productId = insertResult[0].id;

      // Create variants
      await db.insert(productVariants).values([
        {
          productId,
          sizeLabel: '12" x 18"',
          widthInches: '12.00',
          heightInches: '18.00',
          price: '1499.00',
          stockQuantity: 10,
        },
        {
          productId,
          sizeLabel: '18" x 24"',
          widthInches: '18.00',
          heightInches: '24.00',
          price: '2499.00',
          stockQuantity: 5,
        },
      ]);

      const res = await app.request(`/api/products/${productId}/variants`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(2);
      expect(json.data[0].sizeLabel).toBe('12" x 18"');
      expect(json.data[1].sizeLabel).toBe('18" x 24"');
    });

    it('should return empty array for product with no variants', async () => {
      const insertResult = await db.insert(products).values({
        sku: 'TEST001',
        title: 'Test Product',
        slug: 'test-product',
        description: 'Test description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Test Product',
        seoDescription: 'Test description',
        status: 'active',
      }).returning();

      const productId = insertResult[0].id;

      const res = await app.request(`/api/products/${productId}/variants`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data).toHaveLength(0);
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await app.request(`/api/products/${fakeId}/variants`);
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Product not found');
    });
  });

  describe('POST /api/products - Create Product (Admin Only)', () => {
    it('should return 401 without authentication', async () => {
      const newProduct = {
        sku: 'NEW001',
        title: 'New Product',
        slug: 'new-product',
        description: 'New product description',
        basePrice: '1999.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/new.jpg', alt: 'New', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'New Product',
        seoDescription: 'New product description',
      };

      const res = await app.request('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newProduct),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/products/:id - Update Product (Admin Only)', () => {
    it('should return 401 without authentication', async () => {
      const insertResult = await db.insert(products).values({
        sku: 'UPDATE002',
        title: 'Test Product',
        slug: 'test-product-002',
        description: 'Test description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Test',
        seoDescription: 'Test',
        status: 'draft',
      }).returning();

      const productId = insertResult[0].id;

      const res = await app.request(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'Updated' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/products/:id - Delete Product (Admin Only)', () => {
    it('should return 401 without authentication', async () => {
      const insertResult = await db.insert(products).values({
        sku: 'DELETE002',
        title: 'Test Product',
        slug: 'test-product-delete',
        description: 'Test description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/test.jpg', alt: 'Test', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Test',
        seoDescription: 'Test',
        status: 'draft',
      }).returning();

      const productId = insertResult[0].id;

      const res = await app.request(`/api/products/${productId}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('Response Format', () => {
    it('should return correct JSON structure for list', async () => {
      await db.insert(products).values({
        sku: 'FORMAT001',
        title: 'Format Test',
        slug: 'format-test',
        description: 'Format test description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/format.jpg', alt: 'Format', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Format Test',
        seoDescription: 'Format test',
        status: 'active',
      });

      const res = await app.request('/api/products');
      const json = await res.json();

      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('meta');
      expect(json.meta).toHaveProperty('page');
      expect(json.meta).toHaveProperty('limit');
      expect(json.meta).toHaveProperty('total');
      expect(json.meta).toHaveProperty('totalPages');
    });

    it('should return correct JSON structure for single product', async () => {
      const insertResult = await db.insert(products).values({
        sku: 'SINGLE001',
        title: 'Single Product',
        slug: 'single-product',
        description: 'Single product description',
        basePrice: '1499.00',
        styles: ['minimalist'],
        subjects: ['abstract'],
        colors: ['blue'],
        orientation: 'landscape',
        images: [{ url: 'https://example.com/single.jpg', alt: 'Single', width: 2000, height: 1500, isPrimary: true }],
        seoTitle: 'Single',
        seoDescription: 'Single',
        status: 'active',
      }).returning();

      const productId = insertResult[0].id;

      const res = await app.request(`/api/products/${productId}`);
      const json = await res.json();

      expect(json).toHaveProperty('id');
      expect(json).toHaveProperty('sku');
      expect(json).toHaveProperty('title');
      expect(json).toHaveProperty('slug');
      expect(json).toHaveProperty('description');
      expect(json).toHaveProperty('basePrice');
      expect(json).toHaveProperty('styles');
      expect(json).toHaveProperty('subjects');
      expect(json).toHaveProperty('colors');
      expect(json).toHaveProperty('orientation');
      expect(json).toHaveProperty('images');
      expect(json).toHaveProperty('seoTitle');
      expect(json).toHaveProperty('seoDescription');
      expect(json).toHaveProperty('status');
      expect(json).toHaveProperty('createdAt');
      expect(json).toHaveProperty('updatedAt');
    });
  });
});
