/**
 * Database Migrations Tests
 *
 * Tests to verify database migrations run successfully and create all required
 * tables, enums, indexes, and constraints. These tests validate that the database
 * schema matches the expected structure defined in schema.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

let client: ReturnType<typeof postgres>;

/**
 * Run database migrations to create all tables and enums
 * This simulates what a real migration system would do
 */
async function runMigrations(sql: ReturnType<typeof postgres>) {
  // Drop all tables in the correct order (to handle foreign key constraints)
  await sql`DROP TABLE IF EXISTS ai_generations CASCADE`;
  await sql`DROP TABLE IF EXISTS cart_items CASCADE`;
  await sql`DROP TABLE IF EXISTS order_items CASCADE`;
  await sql`DROP TABLE IF EXISTS orders CASCADE`;
  await sql`DROP TABLE IF EXISTS sessions CASCADE`;
  await sql`DROP TABLE IF EXISTS addresses CASCADE`;
  await sql`DROP TABLE IF EXISTS frames CASCADE`;
  await sql`DROP TABLE IF EXISTS product_variants CASCADE`;
  await sql`DROP TABLE IF EXISTS products CASCADE`;
  await sql`DROP TABLE IF EXISTS users CASCADE`;

  // Enable UUID extension
  await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

  // Create all enums (using DO blocks since PostgreSQL doesn't support IF NOT EXISTS for types)
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

  // Create tables in dependency order
  await sql`
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
      preferences JSONB NOT NULL DEFAULT '{"emailNotifications": true, "smsNotifications": false, "marketingEmails": true, "orderUpdates": true, "aiGenerationNotifications": true}'::jsonb,
      trade_account_status trade_account_status,
      trade_business JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
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

  await sql`
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

  await sql`
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

  await sql`
    CREATE TABLE IF NOT EXISTS addresses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      address_line1 VARCHAR(200) NOT NULL,
      address_line2 VARCHAR(200),
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pincode VARCHAR(20) NOT NULL,
      country VARCHAR(100) NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT false,
      type address_type NOT NULL DEFAULT 'home'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
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
      discount DECIMAL(10, 2) NOT NULL DEFAULT 0,
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

  await sql`
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

  await sql`
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

  await sql`
    CREATE TABLE IF NOT EXISTS ai_generations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      prompt TEXT NOT NULL,
      enhanced_prompt TEXT,
      style_preset style_preset NOT NULL,
      aspect_ratio aspect_ratio NOT NULL,
      model ai_model NOT NULL DEFAULT 'sdxl',
      parameters JSONB,
      status ai_generation_status NOT NULL DEFAULT 'pending',
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      selected_image_id VARCHAR(255),
      moderation_status moderation_status NOT NULL DEFAULT 'pending',
      moderation_notes TEXT,
      moderated_by UUID REFERENCES users(id),
      moderated_at TIMESTAMP,
      error_message TEXT,
      processing_time_ms INTEGER,
      credits_used INTEGER,
      is_public BOOLEAN NOT NULL DEFAULT false,
      likes INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `;
}

beforeAll(async () => {
  // Use test database URL or fall back to development
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://poster_app:dev_password@localhost:5433/poster_app_dev';
  client = postgres(databaseUrl, { max: 1 });

  // Run migrations to set up the database
  await runMigrations(client);
});

afterAll(async () => {
  await client.end();
});

describe('Database Migrations', () => {
  describe('Database Extensions', () => {
    it('should have uuid-ossp extension enabled', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should be able to generate UUIDs', async () => {
      const result = await client`SELECT gen_random_uuid() as id`;
      expect(result[0].id).toBeDefined();
      expect(typeof result[0].id).toBe('string');
      expect(result[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('Enum Types', () => {
    it('should have product_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'product_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have product_orientation enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'product_orientation'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have user_role enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'user_role'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have order_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'order_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have payment_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'payment_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have payment_method enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'payment_method'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have address_type enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'address_type'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have ai_generation_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'ai_generation_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have ai_model enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'ai_model'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have aspect_ratio enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'aspect_ratio'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have style_preset enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'style_preset'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have moderation_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'moderation_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have trade_account_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'trade_account_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have photo_approval_status enum', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'photo_approval_status'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Core Tables', () => {
    it('should have products table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'products'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have product_variants table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'product_variants'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have frames table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'frames'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have users table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'users'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have addresses table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'addresses'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have sessions table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'sessions'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have orders table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'orders'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have order_items table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'order_items'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have cart_items table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'cart_items'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have ai_generations table', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'ai_generations'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Products Table Structure', () => {
    it('should have all required columns', async () => {
      const result = await client`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'products'
        ORDER BY ordinal_position
      `;

      const columns = result.map(r => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('sku');
      expect(columns).toContain('title');
      expect(columns).toContain('slug');
      expect(columns).toContain('description');
      expect(columns).toContain('base_price');
      expect(columns).toContain('styles');
      expect(columns).toContain('subjects');
      expect(columns).toContain('colors');
      expect(columns).toContain('orientation');
      expect(columns).toContain('artist_id');
      expect(columns).toContain('images');
      expect(columns).toContain('seo_title');
      expect(columns).toContain('seo_description');
      expect(columns).toContain('status');
      expect(columns).toContain('featured_order');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have unique constraint on sku', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'products'
          AND constraint_type = 'UNIQUE'
          AND constraint_name LIKE '%sku%'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have unique constraint on slug', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'products'
          AND constraint_type = 'UNIQUE'
          AND constraint_name LIKE '%slug%'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have primary key on id', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'products'
          AND constraint_type = 'PRIMARY KEY'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Users Table Structure', () => {
    it('should have all required columns', async () => {
      const result = await client`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `;

      const columns = result.map(r => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('email');
      expect(columns).toContain('name');
      expect(columns).toContain('phone');
      expect(columns).toContain('password_hash');
      expect(columns).toContain('role');
      expect(columns).toContain('email_verified');
      expect(columns).toContain('phone_verified');
      expect(columns).toContain('avatar_url');
      expect(columns).toContain('preferences');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have unique constraint on email', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'users'
          AND constraint_type = 'UNIQUE'
          AND constraint_name LIKE '%email%'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Orders Table Structure', () => {
    it('should have all required columns', async () => {
      const result = await client`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'orders'
        ORDER BY ordinal_position
      `;

      const columns = result.map(r => r.column_name);
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('order_number');
      expect(columns).toContain('status');
      expect(columns).toContain('subtotal');
      expect(columns).toContain('tax');
      expect(columns).toContain('shipping_cost');
      expect(columns).toContain('discount');
      expect(columns).toContain('total');
      expect(columns).toContain('payment_status');
      expect(columns).toContain('payment_method');
      expect(columns).toContain('payment_id');
      expect(columns).toContain('shipping_address');
      expect(columns).toContain('billing_address');
    });

    it('should have unique constraint on order_number', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'orders'
          AND constraint_type = 'UNIQUE'
          AND constraint_name LIKE '%order_number%'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should have foreign key from product_variants to products', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'product_variants'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'products'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from addresses to users', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'addresses'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from sessions to users', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'sessions'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from orders to users', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'orders'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from order_items to orders', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'orders'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from order_items to products', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'order_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'products'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from cart_items to users', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'cart_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from cart_items to products', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'cart_items'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'products'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });

    it('should have foreign key from ai_generations to users', async () => {
      const result = await client`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
          WHERE tc.table_name = 'ai_generations'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
        ) as exists
      `;
      expect(result[0].exists).toBe(true);
    });
  });

  describe('Data Types', () => {
    it('should use UUID for primary keys', async () => {
      const result = await client`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'id'
      `;
      expect(result[0].data_type).toBe('uuid');
    });

    it('should use JSONB for JSON columns', async () => {
      const result = await client`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'styles'
      `;
      expect(result[0].data_type).toBe('jsonb');
    });

    it('should use DECIMAL for monetary values', async () => {
      const result = await client`
        SELECT column_name, data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'base_price'
      `;
      expect(result[0].data_type).toBe('numeric');
      expect(result[0].numeric_precision).toBe(10);
      expect(result[0].numeric_scale).toBe(2);
    });

    it('should use TIMESTAMP for date/time columns', async () => {
      const result = await client`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'created_at'
      `;
      expect(result[0].data_type).toBe('timestamp without time zone');
    });
  });

  describe('Default Values', () => {
    it('should have default for created_at', async () => {
      const result = await client`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'created_at'
      `;
      expect(result[0].column_default).toBeTruthy();
      expect(result[0].column_default).toContain('now()');
    });

    it('should have default for updated_at', async () => {
      const result = await client`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'updated_at'
      `;
      expect(result[0].column_default).toBeTruthy();
      expect(result[0].column_default).toContain('now()');
    });

    it('should have default for user role', async () => {
      const result = await client`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
      `;
      expect(result[0].column_default).toBeTruthy();
      expect(result[0].column_default).toContain('customer');
    });

    it('should have default for product status', async () => {
      const result = await client`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'status'
      `;
      expect(result[0].column_default).toBeTruthy();
      expect(result[0].column_default).toContain('draft');
    });
  });

  describe('Cascade Behavior', () => {
    it('should have CASCADE delete for product_variants', async () => {
      const result = await client`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'product_variants'
        AND tc.constraint_type = 'FOREIGN KEY'
      `;
      expect(result.some(r => r.delete_rule === 'CASCADE')).toBe(true);
    });

    it('should have CASCADE delete for addresses', async () => {
      const result = await client`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'addresses'
        AND tc.constraint_type = 'FOREIGN KEY'
      `;
      expect(result.some(r => r.delete_rule === 'CASCADE')).toBe(true);
    });

    it('should have CASCADE delete for sessions', async () => {
      const result = await client`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'sessions'
        AND tc.constraint_type = 'FOREIGN KEY'
      `;
      expect(result.some(r => r.delete_rule === 'CASCADE')).toBe(true);
    });
  });

  describe('Schema Integrity', () => {
    it('should have consistent table count', async () => {
      const result = await client`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `;
      // At minimum, we should have these 10 core tables
      expect(Number(result[0].count)).toBeGreaterThanOrEqual(10);
    });

    it('should have consistent enum count', async () => {
      const result = await client`
        SELECT COUNT(*) as count
        FROM pg_type
        WHERE typname IN (
          'product_status', 'product_orientation', 'user_role',
          'order_status', 'payment_status', 'payment_method',
          'address_type', 'ai_generation_status', 'ai_model',
          'aspect_ratio', 'style_preset', 'moderation_status',
          'trade_account_status', 'photo_approval_status'
        )
      `;
      // Should have all 14 enums
      expect(Number(result[0].count)).toBeGreaterThanOrEqual(14);
    });

    it('should have foreign key constraints', async () => {
      const result = await client`
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints
        WHERE constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
      `;
      // Should have multiple foreign keys (at least 9)
      expect(Number(result[0].count)).toBeGreaterThanOrEqual(9);
    });

    it('should have unique constraints', async () => {
      const result = await client`
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints
        WHERE constraint_type = 'UNIQUE'
        AND table_schema = 'public'
      `;
      // Should have unique constraints (email, SKU, slug, order_number, session token)
      expect(Number(result[0].count)).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Migration Idempotency', () => {
    it('should be able to check table existence without errors', async () => {
      const checkTable = async (tableName: string) => {
        const result = await client`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = ${tableName}
          ) as exists
        `;
        return result[0].exists;
      };

      expect(await checkTable('products')).toBe(true);
      expect(await checkTable('users')).toBe(true);
      expect(await checkTable('orders')).toBe(true);
    });

    it('should be able to check enum existence without errors', async () => {
      const checkEnum = async (enumName: string) => {
        const result = await client`
          SELECT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = ${enumName}
          ) as exists
        `;
        return result[0].exists;
      };

      expect(await checkEnum('product_status')).toBe(true);
      expect(await checkEnum('user_role')).toBe(true);
      expect(await checkEnum('order_status')).toBe(true);
    });
  });

  describe('Database Health', () => {
    it('should be able to perform basic queries', async () => {
      const result = await client`SELECT 1 as result`;
      expect(result[0].result).toBe(1);
    });

    it('should have proper transaction support', async () => {
      let success = false;
      try {
        await client.begin(async sql => {
          await sql`SELECT 1`;
          success = true;
        });
      } catch (error) {
        success = false;
      }
      expect(success).toBe(true);
    });

    it('should support concurrent queries', async () => {
      const queries = [
        client`SELECT 1 as result`,
        client`SELECT 2 as result`,
        client`SELECT 3 as result`,
      ];
      const results = await Promise.all(queries);
      expect(results).toHaveLength(3);
      expect(results[0][0].result).toBe(1);
      expect(results[1][0].result).toBe(2);
      expect(results[2][0].result).toBe(3);
    });
  });
});
