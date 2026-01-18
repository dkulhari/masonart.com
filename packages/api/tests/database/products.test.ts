/**
 * Products Database Schema Tests
 *
 * Tests for products, product variants, and frames database tables.
 * Validates schema structure, relationships, and CRUD operations.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import {
  products,
  productVariants,
  frames,
  type Product,
  type ProductVariant,
  type Frame,
} from '../../src/db/schema';

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === 'true';

console.log('🧪 Starting test suite...');
if (SKIP_TESTS) {
  console.log('⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)');
}

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) return;

  // Use test database URL or fall back to development
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://poster_app:dev_password@localhost:5433/poster_app_dev';
  client = postgres(databaseUrl, { max: 1 });
  db = drizzle(client);

  // Drop tables to ensure clean state
  await client`DROP TABLE IF EXISTS product_variants CASCADE`;
  await client`DROP TABLE IF EXISTS frames CASCADE`;
  await client`DROP TABLE IF EXISTS products CASCADE`;

  // Create tables (in real app, this would be done via migrations)
  await client`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Create enums
  await client`
    DO $$ BEGIN
      CREATE TYPE product_status AS ENUM ('draft', 'active', 'archived');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  await client`
    DO $$ BEGIN
      CREATE TYPE product_orientation AS ENUM ('square', 'portrait', 'landscape', 'panoramic', 'round');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // Create products table
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

  // Create product_variants table
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

  // Create frames table
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
});

afterAll(async () => {
  if (SKIP_TESTS || !client) return;

  // Clean up tables
  await client`DROP TABLE IF EXISTS product_variants CASCADE`;
  await client`DROP TABLE IF EXISTS products CASCADE`;
  await client`DROP TABLE IF EXISTS frames CASCADE`;
  await client.end();
});

beforeEach(async () => {
  if (SKIP_TESTS || !client) return;

  // Clean up data before each test
  await client`DELETE FROM product_variants`;
  await client`DELETE FROM products`;
  await client`DELETE FROM frames`;
});

describe('Products Table Schema', () => {
  describe('Table Structure', () => {
    it.skipIf(SKIP_TESTS)('should have products table', async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'products'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(SKIP_TESTS)('should have all required columns', async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'products'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('sku');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('slug');
      expect(columnNames).toContain('description');
      expect(columnNames).toContain('base_price');
      expect(columnNames).toContain('styles');
      expect(columnNames).toContain('subjects');
      expect(columnNames).toContain('colors');
      expect(columnNames).toContain('orientation');
      expect(columnNames).toContain('images');
      expect(columnNames).toContain('seo_title');
      expect(columnNames).toContain('seo_description');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it.skipIf(SKIP_TESTS)('should have id as primary key', async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'products' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(SKIP_TESTS)('should have unique constraint on sku', async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'products' AND constraint_type = 'UNIQUE'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Product CRUD Operations', () => {
    it.skipIf(SKIP_TESTS)('should insert a product', async () => {
      const result = await db!.insert(products).values({
        sku: 'TEST-001',
        title: 'Test Product',
        slug: 'test-product',
        description: 'A test product description',
        basePrice: '99.99',
        styles: ['modern', 'abstract'],
        subjects: ['art', 'design'],
        colors: ['blue', 'red'],
        orientation: 'portrait',
        images: [{
          url: 'https://example.com/image.jpg',
          alt: 'Test image',
          width: 1000,
          height: 1500,
          isPrimary: true,
        }],
        seoTitle: 'Test Product - Buy Now',
        seoDescription: 'Amazing test product with great quality',
        status: 'active',
      }).returning();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('id');
      expect(result[0].sku).toBe('TEST-001');
      expect(result[0].title).toBe('Test Product');
    });

    it.skipIf(SKIP_TESTS)('should select products', async () => {
      // Insert a product
      await db!.insert(products).values({
        sku: 'TEST-002',
        title: 'Another Product',
        slug: 'another-product',
        description: 'Another test product',
        basePrice: '149.99',
        styles: ['minimalist'],
        subjects: ['photography'],
        colors: ['black', 'white'],
        orientation: 'landscape',
        images: [{
          url: 'https://example.com/image2.jpg',
          alt: 'Test image 2',
          width: 1500,
          height: 1000,
          isPrimary: true,
        }],
        seoTitle: 'Another Product',
        seoDescription: 'Another great product',
        status: 'active',
      });

      const result = await db!.select().from(products);
      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe('TEST-002');
    });

    it.skipIf(SKIP_TESTS)('should update a product', async () => {
      // Insert a product
      const [inserted] = await db!.insert(products).values({
        sku: 'TEST-003',
        title: 'Update Test',
        slug: 'update-test',
        description: 'Product to update',
        basePrice: '199.99',
        styles: ['classic'],
        subjects: ['art'],
        colors: ['gold'],
        orientation: 'square',
        images: [{
          url: 'https://example.com/image3.jpg',
          alt: 'Test image 3',
          width: 1000,
          height: 1000,
          isPrimary: true,
        }],
        seoTitle: 'Update Test',
        seoDescription: 'Product for update testing',
        status: 'draft',
      }).returning();

      // Update the product
      await db!.update(products)
        .set({ title: 'Updated Title', status: 'active' })
        .where(eq(products.id, inserted.id));

      const result = await db!.select().from(products).where(eq(products.id, inserted.id));
      expect(result[0].title).toBe('Updated Title');
      expect(result[0].status).toBe('active');
    });

    it.skipIf(SKIP_TESTS)('should delete a product', async () => {
      // Insert a product
      const [inserted] = await db!.insert(products).values({
        sku: 'TEST-004',
        title: 'Delete Test',
        slug: 'delete-test',
        description: 'Product to delete',
        basePrice: '299.99',
        styles: ['vintage'],
        subjects: ['poster'],
        colors: ['sepia'],
        orientation: 'portrait',
        images: [{
          url: 'https://example.com/image4.jpg',
          alt: 'Test image 4',
          width: 800,
          height: 1200,
          isPrimary: true,
        }],
        seoTitle: 'Delete Test',
        seoDescription: 'Product for delete testing',
        status: 'active',
      }).returning();

      // Delete the product
      await db!.delete(products).where(eq(products.id, inserted.id));

      const result = await db!.select().from(products).where(eq(products.id, inserted.id));
      expect(result).toHaveLength(0);
    });
  });

  describe('Product Data Validation', () => {
    it.skipIf(SKIP_TESTS)('should store JSON arrays in styles, subjects, colors', async () => {
      const [result] = await db!.insert(products).values({
        sku: 'TEST-005',
        title: 'JSON Test',
        slug: 'json-test',
        description: 'Testing JSON storage',
        basePrice: '99.99',
        styles: ['style1', 'style2', 'style3'],
        subjects: ['subject1', 'subject2'],
        colors: ['color1', 'color2', 'color3', 'color4'],
        orientation: 'landscape',
        images: [{
          url: 'https://example.com/image5.jpg',
          alt: 'Test image 5',
          width: 1600,
          height: 900,
          isPrimary: true,
        }],
        seoTitle: 'JSON Test Product',
        seoDescription: 'Testing JSON fields',
        status: 'active',
      }).returning();

      expect(result.styles).toEqual(['style1', 'style2', 'style3']);
      expect(result.subjects).toEqual(['subject1', 'subject2']);
      expect(result.colors).toHaveLength(4);
    });

    it.skipIf(SKIP_TESTS)('should store product images as JSON', async () => {
      const testImages = [
        {
          url: 'https://example.com/primary.jpg',
          alt: 'Primary image',
          width: 2000,
          height: 3000,
          isPrimary: true,
        },
        {
          url: 'https://example.com/secondary.jpg',
          alt: 'Secondary image',
          width: 2000,
          height: 3000,
          isPrimary: false,
        },
      ];

      const [result] = await db!.insert(products).values({
        sku: 'TEST-006',
        title: 'Images Test',
        slug: 'images-test',
        description: 'Testing image storage',
        basePrice: '129.99',
        styles: ['photography'],
        subjects: ['nature'],
        colors: ['green'],
        orientation: 'portrait',
        images: testImages,
        seoTitle: 'Images Test',
        seoDescription: 'Product with multiple images',
        status: 'active',
      }).returning();

      expect(result.images).toHaveLength(2);
      expect(result.images[0].isPrimary).toBe(true);
      expect(result.images[1].isPrimary).toBe(false);
    });

    it.skipIf(SKIP_TESTS)('should enforce SKU uniqueness', async () => {
      await db!.insert(products).values({
        sku: 'UNIQUE-SKU',
        title: 'First Product',
        slug: 'first-product',
        description: 'First product with unique SKU',
        basePrice: '99.99',
        styles: ['modern'],
        subjects: ['art'],
        colors: ['blue'],
        orientation: 'square',
        images: [{
          url: 'https://example.com/image.jpg',
          alt: 'Test',
          width: 1000,
          height: 1000,
          isPrimary: true,
        }],
        seoTitle: 'First Product',
        seoDescription: 'Testing SKU uniqueness',
        status: 'active',
      });

      // Attempt to insert duplicate SKU should fail
      let error;
      try {
        await db!.insert(products).values({
          sku: 'UNIQUE-SKU',
          title: 'Second Product',
          slug: 'second-product',
          description: 'Second product with duplicate SKU',
          basePrice: '99.99',
          styles: ['modern'],
          subjects: ['art'],
          colors: ['blue'],
          orientation: 'square',
          images: [{
            url: 'https://example.com/image.jpg',
            alt: 'Test',
            width: 1000,
            height: 1000,
            isPrimary: true,
          }],
          seoTitle: 'Second Product',
          seoDescription: 'Testing SKU uniqueness',
          status: 'active',
        }).execute();
      } catch (e: any) {
        error = e;
      }
      expect(error).toBeDefined();
      // PostgreSQL unique violation error - should fail due to duplicate SKU
      expect(error.message).toContain('unique');
    });
  });
});

describe('Product Variants Table Schema', () => {
  let testProductId: string;

  beforeEach(async () => {
    if (SKIP_TESTS || !db) return;

    // Insert a test product
    const [product] = await db.insert(products).values({
      sku: 'TEST-VARIANT',
      title: 'Variant Test Product',
      slug: 'variant-test-product',
      description: 'Product for variant testing',
      basePrice: '99.99',
      styles: ['modern'],
      subjects: ['art'],
      colors: ['blue'],
      orientation: 'portrait',
      images: [{
        url: 'https://example.com/image.jpg',
        alt: 'Test',
        width: 1000,
        height: 1500,
        isPrimary: true,
      }],
      seoTitle: 'Variant Test',
      seoDescription: 'Product with variants',
      status: 'active',
    }).returning();
    testProductId = product.id;
  });

  describe('Table Structure', () => {
    it.skipIf(SKIP_TESTS)('should have product_variants table', async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'product_variants'
      `;
      expect(result.length).toBe(1);
    });

    it.skipIf(SKIP_TESTS)('should have foreign key to products', async () => {
      const result = await client!`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_name = 'product_variants' AND constraint_type = 'FOREIGN KEY'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Variant CRUD Operations', () => {
    it.skipIf(SKIP_TESTS)('should insert a product variant', async () => {
      const [result] = await db!.insert(productVariants).values({
        productId: testProductId,
        sizeLabel: '12x16 inches',
        widthInches: '12.00',
        heightInches: '16.00',
        price: '129.99',
        stockQuantity: 50,
      }).returning();

      expect(result).toHaveProperty('id');
      expect(result.sizeLabel).toBe('12x16 inches');
      expect(result.productId).toBe(testProductId);
    });

    it.skipIf(SKIP_TESTS)('should select variants for a product', async () => {
      // Insert multiple variants
      await db!.insert(productVariants).values([
        {
          productId: testProductId,
          sizeLabel: '8x10 inches',
          widthInches: '8.00',
          heightInches: '10.00',
          price: '79.99',
          stockQuantity: 100,
        },
        {
          productId: testProductId,
          sizeLabel: '16x20 inches',
          widthInches: '16.00',
          heightInches: '20.00',
          price: '159.99',
          stockQuantity: 25,
        },
      ]);

      const result = await db!.select().from(productVariants).where(eq(productVariants.productId, testProductId));
      expect(result).toHaveLength(2);
    });

    it.skipIf(SKIP_TESTS)('should delete variants when product is deleted', async () => {
      // Insert a variant
      await db!.insert(productVariants).values({
        productId: testProductId,
        sizeLabel: '12x16 inches',
        widthInches: '12.00',
        heightInches: '16.00',
        price: '129.99',
        stockQuantity: 50,
      });

      // Delete the product
      await db!.delete(products).where(eq(products.id, testProductId));

      // Verify variants are also deleted (CASCADE)
      const result = await db!.select().from(productVariants).where(eq(productVariants.productId, testProductId));
      expect(result).toHaveLength(0);
    });
  });
});

describe('Frames Table Schema', () => {
  describe('Table Structure', () => {
    it.skipIf(SKIP_TESTS)('should have frames table', async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'frames'
      `;
      expect(result.length).toBe(1);
    });
  });

  describe('Frame CRUD Operations', () => {
    it.skipIf(SKIP_TESTS)('should insert a frame', async () => {
      const [result] = await db!.insert(frames).values({
        name: 'Classic Oak Frame',
        type: 'classic',
        material: 'oak',
        priceModifier: '1.40',
        imageUrl: 'https://example.com/frames/oak.jpg',
        isActive: true,
      }).returning();

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('Classic Oak Frame');
      expect(result.material).toBe('oak');
    });

    it.skipIf(SKIP_TESTS)('should select frames', async () => {
      await db!.insert(frames).values([
        {
          name: 'Modern Black Frame',
          type: 'modern',
          material: 'aluminum',
          priceModifier: '1.30',
          imageUrl: 'https://example.com/frames/black.jpg',
          isActive: true,
        },
        {
          name: 'Vintage Gold Frame',
          type: 'vintage',
          material: 'gold-leaf',
          priceModifier: '2.00',
          imageUrl: 'https://example.com/frames/gold.jpg',
          isActive: false,
        },
      ]);

      const result = await db!.select().from(frames);
      expect(result).toHaveLength(2);
    });

    it.skipIf(SKIP_TESTS)('should filter active frames', async () => {
      await db!.insert(frames).values([
        {
          name: 'Active Frame',
          type: 'modern',
          material: 'wood',
          priceModifier: '1.20',
          imageUrl: 'https://example.com/frames/active.jpg',
          isActive: true,
        },
        {
          name: 'Inactive Frame',
          type: 'classic',
          material: 'metal',
          priceModifier: '1.50',
          imageUrl: 'https://example.com/frames/inactive.jpg',
          isActive: false,
        },
      ]);

      const result = await db!.select().from(frames).where(eq(frames.isActive, true));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active Frame');
    });
  });
});
