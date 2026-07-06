/**
 * Database Seeding Integration Tests
 *
 * Tests to verify the database can be seeded with test data.
 * This tests the seed script functionality and validates that
 * seed data is correctly inserted into the database.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', runtime tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Dynamically import postgres only when needed for runtime tests
type PostgresClient = any;

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

let client: PostgresClient | null = null;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database seeding tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  try {
    // Dynamically import postgres
    const postgres = (await import("postgres")).default;

    // Use test database URL or fall back to development
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

    console.log("✅ Database connection established for seed tests");
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
    await client.end();
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Helper to check if tests should be skipped
const shouldSkip = () => SKIP_TESTS || !isDatabaseAvailable;

describe("Database Seeding Tests", () => {
  describe("Seed Script File Validation", () => {
    it("should have seed.ts file in database directory", () => {
      const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
      expect(fs.existsSync(seedPath)).toBe(true);
    });

    it("should have package.json seed script defined", () => {
      const pkgPath = path.join(process.cwd(), "packages", "api", "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

      // The seed script might be db:seed, seed, or similar
      const hasSeedScript =
        pkg.scripts?.["db:seed"] || pkg.scripts?.["seed"] || pkg.scripts?.["database:seed"];

      expect(hasSeedScript).toBeTruthy();
    });

    it("should have database schema exports", () => {
      const schemaIndexPath = path.join(
        process.cwd(),
        "packages",
        "api",
        "src",
        "database",
        "schema",
        "index.ts"
      );
      expect(fs.existsSync(schemaIndexPath)).toBe(true);

      const content = fs.readFileSync(schemaIndexPath, "utf-8");
      expect(content).toContain("products");
    });
  });

  describe("Seed Data Content Validation", () => {
    let seedContent: string;

    beforeAll(() => {
      const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
      seedContent = fs.readFileSync(seedPath, "utf-8");
    });

    describe("Sample Products", () => {
      it("should define sample products array", () => {
        expect(seedContent).toContain("sampleProducts");
        expect(seedContent).toContain("NewProduct[]");
      });

      it("should include products from multiple collections", () => {
        // Abstract Collection
        expect(seedContent).toContain("ABS-001");
        expect(seedContent).toContain("Cosmic Harmony");

        // Nature Collection
        expect(seedContent).toContain("NAT-001");
        expect(seedContent).toContain("Mountain Majesty");

        // Botanical Collection
        expect(seedContent).toContain("BOT-001");
        expect(seedContent).toContain("Monstera Dreams");

        // Minimalist Collection
        expect(seedContent).toContain("MIN-001");
        expect(seedContent).toContain("Circle of Zen");

        // Typography Collection
        expect(seedContent).toContain("TYP-001");
        expect(seedContent).toContain("Stay Curious");
      });

      it("should have required product fields", () => {
        // Check for required fields in product definitions
        expect(seedContent).toContain("sku:");
        expect(seedContent).toContain("title:");
        expect(seedContent).toContain("slug:");
        expect(seedContent).toContain("description:");
        expect(seedContent).toContain("basePrice:");
        expect(seedContent).toContain("styles:");
        expect(seedContent).toContain("subjects:");
        expect(seedContent).toContain("colors:");
        expect(seedContent).toContain("rooms:");
        expect(seedContent).toContain("orientation:");
        expect(seedContent).toContain("images:");
        expect(seedContent).toContain("seoTitle:");
        expect(seedContent).toContain("seoDescription:");
        expect(seedContent).toContain("status:");
      });

      it("should have products with different orientations", () => {
        expect(seedContent).toContain('orientation: "square"');
        expect(seedContent).toContain('orientation: "portrait"');
        expect(seedContent).toContain('orientation: "landscape"');
        expect(seedContent).toContain('orientation: "panoramic"');
      });

      it("should have featured products", () => {
        expect(seedContent).toContain("isFeatured: true");
        expect(seedContent).toContain("featuredOrder:");
      });

      it("should have products with valid status", () => {
        expect(seedContent).toContain('status: "active"');
      });

      it("should have products with tags", () => {
        expect(seedContent).toContain("tags:");
        expect(seedContent).toContain("bestseller");
      });
    });

    describe("Product Variants", () => {
      it("should define variants by orientation", () => {
        expect(seedContent).toContain("variantsByOrientation");
      });

      it("should have variants for all orientations", () => {
        expect(seedContent).toContain("square:");
        expect(seedContent).toContain("portrait:");
        expect(seedContent).toContain("landscape:");
        expect(seedContent).toContain("panoramic:");
      });

      it("should have required variant fields", () => {
        expect(seedContent).toContain("sizeLabel:");
        expect(seedContent).toContain("widthInches:");
        expect(seedContent).toContain("heightInches:");
        expect(seedContent).toContain("widthCm:");
        expect(seedContent).toContain("heightCm:");
        expect(seedContent).toContain("price:");
        expect(seedContent).toContain("stockQuantity:");
        expect(seedContent).toContain("sortOrder:");
      });

      it("should have multiple size options per orientation", () => {
        // Each orientation should have multiple variants
        const squareVariants = seedContent.match(/square:\s*\[[\s\S]*?\{[\s\S]*?sizeLabel/g);
        expect(squareVariants).toBeTruthy();
      });
    });

    describe("Frame Options", () => {
      it("should define sample frames array", () => {
        expect(seedContent).toContain("sampleFrames");
        expect(seedContent).toContain("NewFrame[]");
      });

      it("should include various frame types", () => {
        expect(seedContent).toContain('type: "none"');
        expect(seedContent).toContain('type: "black"');
        expect(seedContent).toContain('type: "white"');
        expect(seedContent).toContain('type: "oak"');
        expect(seedContent).toContain('type: "walnut"');
        expect(seedContent).toContain('type: "gold"');
        expect(seedContent).toContain('type: "silver"');
        expect(seedContent).toContain('type: "wood"');
      });

      it("should have required frame fields", () => {
        expect(seedContent).toContain("name:");
        expect(seedContent).toContain("type:");
        expect(seedContent).toContain("description:");
        expect(seedContent).toContain("material:");
        expect(seedContent).toContain("priceModifier:");
        expect(seedContent).toContain("priceAddition:");
        expect(seedContent).toContain("isActive:");
        expect(seedContent).toContain("sortOrder:");
      });

      it("should have frame with no frame option", () => {
        expect(seedContent).toContain("No Frame");
        expect(seedContent).toContain('priceAddition: "0.00"');
      });

      it("should have frames with different price additions", () => {
        expect(seedContent).toContain('priceAddition: "399.00"');
        expect(seedContent).toContain('priceAddition: "599.00"');
        expect(seedContent).toContain('priceAddition: "699.00"');
        expect(seedContent).toContain('priceAddition: "799.00"');
      });
    });

    describe("Seed Functions", () => {
      it("should have clearData function", () => {
        expect(seedContent).toContain("async function clearData()");
        expect(seedContent).toContain("db.delete(productVariants)");
        expect(seedContent).toContain("db.delete(products)");
        expect(seedContent).toContain("db.delete(frames)");
      });

      it("should have seedProducts function", () => {
        expect(seedContent).toContain("async function seedProducts()");
        expect(seedContent).toContain(".insert(products)");
        expect(seedContent).toContain(".insert(productVariants)");
      });

      it("should have seedFrames function", () => {
        expect(seedContent).toContain("async function seedFrames()");
        expect(seedContent).toContain(".insert(frames).values(sampleFrames)");
      });

      it("should have main seed function", () => {
        expect(seedContent).toContain("async function seed()");
        expect(seedContent).toContain("await clearData()");
        expect(seedContent).toContain("await seedProducts()");
        expect(seedContent).toContain("await seedFrames()");
      });

      it("should have proper error handling", () => {
        expect(seedContent).toContain("try {");
        expect(seedContent).toContain("catch (error)");
        expect(seedContent).toContain("console.error");
      });

      it("should close database connection", () => {
        expect(seedContent).toContain("closeDatabase()");
        expect(seedContent).toContain("finally {");
      });

      it("should have entry point for direct execution", () => {
        expect(seedContent).toContain("seed()");
        expect(seedContent).toContain("process.exit(0)");
        expect(seedContent).toContain("process.exit(1)");
      });
    });
  });

  describe("Database Runtime Tests", () => {
    describe("Database Connectivity", () => {
      it.skipIf(shouldSkip())("should be able to connect to database", async () => {
        const result = await client!`SELECT 1 as value`;
        expect(result[0].value).toBe(1);
      });

      it.skipIf(shouldSkip())("should have required tables exist", async () => {
        const tables = await client!`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name IN ('products', 'product_variants', 'frames')
        `;

        const tableNames = tables.map((t: any) => t.table_name);
        expect(tableNames).toContain("products");
        expect(tableNames).toContain("product_variants");
        expect(tableNames).toContain("frames");
      });
    });

    describe("Seed Data Insertion", () => {
      beforeEach(async () => {
        if (shouldSkip() || !client) return;

        // Clean up existing data before each test
        await client`DELETE FROM product_variants`;
        await client`DELETE FROM products`;
        await client`DELETE FROM frames`;
      });

      it.skipIf(shouldSkip())("should be able to insert sample products", async () => {
        // Insert a test product following the seed data structure
        const result = await client!`
          INSERT INTO products (
            sku, title, slug, description, base_price,
            styles, subjects, colors, rooms, tags,
            orientation, images, seo_title, seo_description,
            status, is_featured, featured_order
          ) VALUES (
            'TEST-SEED-001',
            'Test Seed Product',
            'test-seed-product',
            'A test product for seeding verification',
            1499.00,
            '["abstract", "modern"]'::jsonb,
            '["art", "design"]'::jsonb,
            '["blue", "purple"]'::jsonb,
            '["living-room", "bedroom"]'::jsonb,
            '["test", "seed"]'::jsonb,
            'square',
            '[{"id": "img-1", "url": "https://example.com/test.jpg", "alt": "Test Image", "width": 800, "height": 800, "isPrimary": true, "sortOrder": 0}]'::jsonb,
            'Test Seed Product | MasonArt',
            'A test product for verifying database seeding functionality',
            'active',
            true,
            1
          )
          RETURNING id, sku, title
        `;

        expect(result).toHaveLength(1);
        expect(result[0].sku).toBe("TEST-SEED-001");
        expect(result[0].title).toBe("Test Seed Product");
      });

      it.skipIf(shouldSkip())("should be able to insert product variants", async () => {
        // First insert a product
        const [product] = await client!`
          INSERT INTO products (
            sku, title, slug, description, base_price,
            styles, subjects, colors, orientation, images,
            seo_title, seo_description, status
          ) VALUES (
            'TEST-SEED-002',
            'Test Variant Product',
            'test-variant-product',
            'A test product for variant seeding',
            999.00,
            '["minimalist"]'::jsonb,
            '["geometric"]'::jsonb,
            '["black", "white"]'::jsonb,
            'portrait',
            '[{"id": "img-2", "url": "https://example.com/test2.jpg", "alt": "Test Image 2", "width": 600, "height": 800, "isPrimary": true, "sortOrder": 0}]'::jsonb,
            'Test Variant Product',
            'Product for variant testing',
            'active'
          )
          RETURNING id
        `;

        // Insert variants for the product
        await client!`
          INSERT INTO product_variants (
            product_id, variant_sku, size_label,
            width_inches, height_inches, width_cm, height_cm,
            price, stock_quantity, sort_order
          ) VALUES
            (${product.id}, 'TEST-SEED-002-12x16', '12" x 16"', 12, 16, 30, 41, 999.00, 50, 1),
            (${product.id}, 'TEST-SEED-002-18x24', '18" x 24"', 18, 24, 46, 61, 1199.00, 40, 2),
            (${product.id}, 'TEST-SEED-002-24x36', '24" x 36"', 24, 36, 61, 91, 1499.00, 30, 3)
        `;

        const variants = await client!`
          SELECT * FROM product_variants WHERE product_id = ${product.id}
        `;

        expect(variants).toHaveLength(3);
        expect(variants[0].size_label).toBe('12" x 16"');
      });

      it.skipIf(shouldSkip())("should be able to insert frame options", async () => {
        await client!`
          INSERT INTO frames (
            name, type, description, material, thickness, color,
            price_modifier, price_addition, image_url, thumbnail_url,
            is_active, sort_order
          ) VALUES
            ('No Frame', 'none', 'Print only', 'N/A', NULL, 'N/A', 1.00, 0.00, NULL, NULL, true, 0),
            ('Classic Black', 'black', 'Sleek matte black frame', 'Aluminum', '0.75', 'Matte Black', 1.00, 399.00, 'https://example.com/black.jpg', 'https://example.com/black-thumb.jpg', true, 1),
            ('Pure White', 'white', 'Crisp white frame', 'Aluminum', '0.75', 'Matte White', 1.00, 399.00, 'https://example.com/white.jpg', 'https://example.com/white-thumb.jpg', true, 2)
        `;

        const frames = await client!`SELECT * FROM frames ORDER BY sort_order`;

        expect(frames).toHaveLength(3);
        expect(frames[0].name).toBe("No Frame");
        expect(frames[0].price_addition).toBe("0.00");
        expect(frames[1].name).toBe("Classic Black");
        expect(frames[1].price_addition).toBe("399.00");
      });

      it.skipIf(shouldSkip())(
        "should cascade delete variants when product is deleted",
        async () => {
          // Insert a product with variants
          const [product] = await client!`
          INSERT INTO products (
            sku, title, slug, description, base_price,
            styles, subjects, colors, orientation, images,
            seo_title, seo_description, status
          ) VALUES (
            'TEST-CASCADE',
            'Cascade Test Product',
            'cascade-test-product',
            'Testing cascade delete',
            799.00,
            '["abstract"]'::jsonb,
            '["art"]'::jsonb,
            '["red"]'::jsonb,
            'square',
            '[]'::jsonb,
            'Cascade Test',
            'Cascade test description',
            'active'
          )
          RETURNING id
        `;

          await client!`
          INSERT INTO product_variants (
            product_id, variant_sku, size_label,
            width_inches, height_inches, width_cm, height_cm,
            price, stock_quantity, sort_order
          ) VALUES
            (${product.id}, 'TEST-CASCADE-12x12', '12" x 12"', 12, 12, 30, 30, 799.00, 25, 1)
        `;

          // Verify variant exists
          const variantsBefore = await client!`
          SELECT * FROM product_variants WHERE product_id = ${product.id}
        `;
          expect(variantsBefore).toHaveLength(1);

          // Delete the product
          await client!`DELETE FROM products WHERE id = ${product.id}`;

          // Verify variants are also deleted
          const variantsAfter = await client!`
          SELECT * FROM product_variants WHERE product_id = ${product.id}
        `;
          expect(variantsAfter).toHaveLength(0);
        }
      );
    });

    describe("Seed Data Counts", () => {
      it.skipIf(shouldSkip())("should have correct expected product count (12)", async () => {
        // This validates the seed data structure matches documentation
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        // Count SKU definitions
        const skuMatches = seedContent.match(/sku:\s*["'][\w-]+["']/g);
        expect(skuMatches).toBeTruthy();
        expect(skuMatches!.length).toBe(12);
      });

      it.skipIf(shouldSkip())("should have correct expected frame count (8)", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        // Count frame type definitions in sampleFrames
        const frameMatches = seedContent.match(/name:\s*["'][^"']+["'],\s*\n\s*type:/g);
        expect(frameMatches).toBeTruthy();
        expect(frameMatches!.length).toBe(8);
      });

      it.skipIf(shouldSkip())("should have 4 variants per orientation", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        // Each orientation block should have 4 sizeLabel entries
        const orientations = ["square", "portrait", "landscape", "panoramic"];

        for (const orientation of orientations) {
          const regex = new RegExp(`${orientation}:\\s*\\[([\\s\\S]*?)\\],`, "g");
          const match = regex.exec(seedContent);
          expect(match).toBeTruthy();

          if (match) {
            const sizeLabelMatches = match[1].match(/sizeLabel:/g);
            expect(sizeLabelMatches).toBeTruthy();
            expect(sizeLabelMatches!.length).toBe(4);
          }
        }
      });
    });

    describe("Product Collection Distribution", () => {
      it.skipIf(shouldSkip())("should have products from Abstract collection (3)", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const abstractSkus = seedContent.match(/sku:\s*["']ABS-\d+["']/g);
        expect(abstractSkus).toBeTruthy();
        expect(abstractSkus!.length).toBe(3);
      });

      it.skipIf(shouldSkip())("should have products from Nature collection (3)", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const natureSkus = seedContent.match(/sku:\s*["']NAT-\d+["']/g);
        expect(natureSkus).toBeTruthy();
        expect(natureSkus!.length).toBe(3);
      });

      it.skipIf(shouldSkip())("should have products from Botanical collection (2)", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const botanicalSkus = seedContent.match(/sku:\s*["']BOT-\d+["']/g);
        expect(botanicalSkus).toBeTruthy();
        expect(botanicalSkus!.length).toBe(2);
      });

      it.skipIf(shouldSkip())("should have products from Minimalist collection (2)", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const minimalistSkus = seedContent.match(/sku:\s*["']MIN-\d+["']/g);
        expect(minimalistSkus).toBeTruthy();
        expect(minimalistSkus!.length).toBe(2);
      });

      it.skipIf(shouldSkip())("should have products from Typography collection (2)", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const typographySkus = seedContent.match(/sku:\s*["']TYP-\d+["']/g);
        expect(typographySkus).toBeTruthy();
        expect(typographySkus!.length).toBe(2);
      });
    });

    describe("Price Validation", () => {
      it.skipIf(shouldSkip())("should have valid base prices", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const priceMatches = seedContent.match(/basePrice:\s*["']\d+\.\d{2}["']/g);
        expect(priceMatches).toBeTruthy();
        expect(priceMatches!.length).toBeGreaterThanOrEqual(12);

        // All prices should be valid decimal format
        for (const priceMatch of priceMatches!) {
          const price = priceMatch.match(/["'](\d+\.\d{2})["']/);
          expect(price).toBeTruthy();
          expect(parseFloat(price![1])).toBeGreaterThan(0);
        }
      });

      it.skipIf(shouldSkip())("should have frame price additions in valid format", async () => {
        const seedPath = path.join(process.cwd(), "packages", "api", "src", "database", "seed.ts");
        const seedContent = fs.readFileSync(seedPath, "utf-8");

        const frameAdditions = seedContent.match(/priceAddition:\s*["']\d+\.\d{2}["']/g);
        expect(frameAdditions).toBeTruthy();

        // All frame price additions should be valid
        for (const addition of frameAdditions!) {
          const price = addition.match(/["'](\d+\.\d{2})["']/);
          expect(price).toBeTruthy();
          expect(parseFloat(price![1])).toBeGreaterThanOrEqual(0);
        }
      });
    });

    describe("Test Fixtures Integration", () => {
      it("should be able to import test fixtures", async () => {
        const { generateTestDataSet, quickTestData } =
          await import("../../tests/fixtures/database");

        expect(typeof generateTestDataSet).toBe("function");
        expect(typeof quickTestData).toBe("function");
      });

      it("should generate valid test data set", async () => {
        const { generateTestDataSet } = await import("../../tests/fixtures/database");

        const dataSet = generateTestDataSet({
          productCount: 3,
          userCount: 2,
          ordersPerUser: 1,
          includeAdmin: true,
          includeTradeUser: false,
        });

        expect(dataSet.products).toHaveLength(3);
        expect(dataSet.users.length).toBeGreaterThanOrEqual(2);
        expect(dataSet.frames).toBeTruthy();
        expect(dataSet.productVariants.size).toBe(3);
      });

      it("should generate quick test data", async () => {
        const { quickTestData } = await import("../../tests/fixtures/database");

        const dataSet = quickTestData();

        expect(dataSet.products).toBeTruthy();
        expect(dataSet.users).toBeTruthy();
        expect(dataSet.orders).toBeTruthy();
      });
    });
  });
});
