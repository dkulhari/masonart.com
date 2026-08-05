/**
 * Review Media Database Schema Tests
 *
 * Tests for the media-agnostic `review_media` table that carries customer
 * photos AND videos attached to product reviews.
 *
 * Media has no moderation status of its own — it inherits the parent review's
 * `status`. `processing_status` tracks the transcode pipeline only.
 *
 * These tests require a running PostgreSQL database. When SKIP_DB_RUNTIME_TESTS
 * is set to 'true', all tests are skipped (useful for CI without database).
 * Tests also gracefully skip when database is unavailable.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import {
  reviewMedia,
  reviewMediaTypeEnum,
  reviewMediaStatusEnum,
  type ReviewMediaType,
  type ReviewMediaStatus,
} from "../../src/database/schema/review-media";

// Check if we should skip database runtime tests
const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

// Track database availability
let isDatabaseAvailable = false;

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Parent review rows created by this suite, cleaned up in afterAll
const createdReviewIds: string[] = [];

/**
 * Create a throwaway parent review row reusing existing seed FK targets.
 * Returns the new review id, or null when the database has no seed data.
 */
async function createParentReview(): Promise<string | null> {
  const [fks] = await client!`
    SELECT
      (SELECT id FROM products LIMIT 1) AS product_id,
      (SELECT id FROM "user" LIMIT 1) AS user_id,
      (SELECT id FROM order_items LIMIT 1) AS order_item_id
  `;

  if (!fks?.product_id || !fks?.user_id || !fks?.order_item_id) return null;

  const [row] = await client!`
    INSERT INTO reviews (product_id, user_id, order_item_id, rating, content, status)
    VALUES (${fks.product_id}, ${fks.user_id}, ${fks.order_item_id}, 5, 'review-media schema test', 'pending')
    RETURNING id
  `;

  createdReviewIds.push(row.id as string);
  return row.id as string;
}

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  try {
    // Use test database URL or fall back to development
    const databaseUrl =
      process.env.DATABASE_URL ||
      "postgresql://poster_app:dev_password@localhost:5440/poster_app_dev";
    client = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });

    // Test connection
    await client`SELECT 1`;
    isDatabaseAvailable = true;
    db = drizzle(client);

    // Verify review_media table exists (created by the migration)
    const tableCheck = await client`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'review_media'
    `;

    if (tableCheck.length === 0) {
      console.log("⚠️  review_media table does not exist - run db:migrate first");
      isDatabaseAvailable = false;
      return;
    }

    console.log(
      "✅ Database connection established for review_media schema tests"
    );
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
    for (const reviewId of createdReviewIds) {
      await client`DELETE FROM reviews WHERE id = ${reviewId}`;
    }
  } catch (error) {
    // Ignore cleanup errors
  }

  try {
    await client.end();
  } catch (error) {
    // Ignore cleanup errors
  }
});

// Wrapper that skips when the database is unavailable
const dbTest = (name: string, fn: () => Promise<void>) => {
  it(name, async () => {
    if (SKIP_TESTS) {
      console.log(`⏭️  Skipping: ${name} (SKIP_DB_RUNTIME_TESTS=true)`);
      return;
    }
    if (!isDatabaseAvailable) {
      console.log(`⏭️  Skipping: ${name} (database not available)`);
      return;
    }
    await fn();
  });
};

describe("Review Media Table Schema", () => {
  describe("Drizzle Schema Type Exports", () => {
    it("should export reviewMediaTypeEnum with image and video", () => {
      expect(reviewMediaTypeEnum.enumValues).toEqual(["image", "video"]);
    });

    it("should export reviewMediaStatusEnum for the transcode pipeline", () => {
      expect(reviewMediaStatusEnum.enumValues).toEqual([
        "processing",
        "ready",
        "failed",
      ]);
    });

    it("should export ReviewMediaType and ReviewMediaStatus types", () => {
      const types: ReviewMediaType[] = ["image", "video"];
      const statuses: ReviewMediaStatus[] = ["processing", "ready", "failed"];
      expect(types).toHaveLength(2);
      expect(statuses).toHaveLength(3);
    });

    it("should export reviewMedia table with the expected columns", () => {
      expect(reviewMedia).toBeDefined();
      const columns = Object.keys(reviewMedia);
      expect(columns).toContain("id");
      expect(columns).toContain("reviewId");
      expect(columns).toContain("mediaType");
      expect(columns).toContain("url");
      expect(columns).toContain("thumbnailUrl");
      expect(columns).toContain("posterUrl");
      expect(columns).toContain("durationSeconds");
      expect(columns).toContain("width");
      expect(columns).toContain("height");
      expect(columns).toContain("sizeBytes");
      expect(columns).toContain("sortOrder");
      expect(columns).toContain("processingStatus");
      expect(columns).toContain("processingError");
      expect(columns).toContain("createdAt");
      expect(columns).toContain("updatedAt");
    });
  });

  describe("Table Structure", () => {
    dbTest("should have review_media table", async () => {
      const result = await client!`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'review_media'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have all required columns", async () => {
      const result = await client!`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'review_media'
        ORDER BY ordinal_position
      `;

      const columnNames = result.map((row: any) => row.column_name);
      for (const column of [
        "id",
        "review_id",
        "media_type",
        "url",
        "thumbnail_url",
        "poster_url",
        "duration_seconds",
        "width",
        "height",
        "size_bytes",
        "sort_order",
        "processing_status",
        "processing_error",
        "created_at",
        "updated_at",
      ]) {
        expect(columnNames).toContain(column);
      }
    });

    dbTest("should have id as primary key", async () => {
      const result = await client!`
        SELECT constraint_type FROM information_schema.table_constraints
        WHERE table_name = 'review_media' AND constraint_type = 'PRIMARY KEY'
      `;
      expect(result.length).toBe(1);
    });

    dbTest("should have foreign key to reviews", async () => {
      const result = await client!`
        SELECT tc.constraint_name, ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'review_media'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'reviews'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    dbTest("should have ON DELETE CASCADE for review_id", async () => {
      const result = await client!`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_name = 'review_media'
          AND kcu.column_name = 'review_id'
      `;
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].delete_rule).toBe("CASCADE");
    });

    dbTest(
      "should keep poster_url, duration_seconds, width and height nullable",
      async () => {
        const result = await client!`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'review_media'
          AND column_name IN ('poster_url', 'duration_seconds', 'width', 'height', 'thumbnail_url', 'size_bytes')
      `;

        expect(result.length).toBe(6);
        for (const row of result as any[]) {
          expect(`${row.column_name}:${row.is_nullable}`).toBe(
            `${row.column_name}:YES`
          );
        }
      }
    );

    dbTest("should require url, review_id and media_type", async () => {
      const result = await client!`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'review_media'
          AND column_name IN ('url', 'review_id', 'media_type')
      `;

      expect(result.length).toBe(3);
      for (const row of result as any[]) {
        expect(`${row.column_name}:${row.is_nullable}`).toBe(
          `${row.column_name}:NO`
        );
      }
    });

    dbTest("should default processing_status to 'ready'", async () => {
      const result = await client!`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_name = 'review_media' AND column_name = 'processing_status'
      `;
      expect(result.length).toBe(1);
      expect(result[0].column_default).toContain("ready");
    });

    dbTest("should have indexes for review lookups and ordering", async () => {
      const result = await client!`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'review_media'
      `;

      const indexNames = result.map((row: any) => row.indexname);
      expect(indexNames).toContain("review_media_review_id_idx");
      expect(indexNames).toContain("review_media_review_sort_idx");
    });
  });

  describe("Postgres Enums", () => {
    dbTest("should have review_media_type enum with correct values", async () => {
      const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'review_media_type'
        ORDER BY enumsortorder
      `;

      const enumValues = result.map((row: any) => row.enumlabel);
      expect(enumValues).toEqual(["image", "video"]);
    });

    dbTest(
      "should have review_media_status enum with correct values",
      async () => {
        const result = await client!`
        SELECT enumlabel FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'review_media_status'
        ORDER BY enumsortorder
      `;

        const enumValues = result.map((row: any) => row.enumlabel);
        expect(enumValues).toEqual(["processing", "ready", "failed"]);
      }
    );
  });

  describe("Insert Behaviour", () => {
    dbTest("should insert an image row with just reviewId, type and url", async () => {
      const reviewId = await createParentReview();
      if (!reviewId) {
        console.log("⏭️  Skipping: no seed data to build a parent review");
        return;
      }

      const [row] = await db!
        .insert(reviewMedia)
        .values({
          reviewId,
          mediaType: "image",
          url: "https://cdn.example.com/review-media/photo.jpg",
        })
        .returning();

      expect(row.id).toBeDefined();
      expect(row.mediaType).toBe("image");
      expect(row.url).toBe("https://cdn.example.com/review-media/photo.jpg");
      // Optional media columns stay null for a plain image
      expect(row.posterUrl).toBeNull();
      expect(row.durationSeconds).toBeNull();
      expect(row.width).toBeNull();
      expect(row.height).toBeNull();
      // Defaults
      expect(row.sortOrder).toBe(0);
      expect(row.processingStatus).toBe("ready");
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
    });

    dbTest("should insert a video row with posterUrl and durationSeconds", async () => {
      const reviewId = await createParentReview();
      if (!reviewId) {
        console.log("⏭️  Skipping: no seed data to build a parent review");
        return;
      }

      const [row] = await db!
        .insert(reviewMedia)
        .values({
          reviewId,
          mediaType: "video",
          url: "https://cdn.example.com/review-media/clip.mp4",
          thumbnailUrl: "https://cdn.example.com/review-media/clip-thumb.webp",
          posterUrl: "https://cdn.example.com/review-media/clip-poster.jpg",
          durationSeconds: 24,
          width: 1080,
          height: 1920,
          sizeBytes: 4_812_003,
          sortOrder: 1,
          processingStatus: "processing",
        })
        .returning();

      expect(row.mediaType).toBe("video");
      expect(row.posterUrl).toBe(
        "https://cdn.example.com/review-media/clip-poster.jpg"
      );
      expect(row.durationSeconds).toBe(24);
      expect(row.width).toBe(1080);
      expect(row.height).toBe(1920);
      expect(row.sizeBytes).toBe(4_812_003);
      expect(row.sortOrder).toBe(1);
      expect(row.processingStatus).toBe("processing");
    });

    dbTest("should reject an unknown media type", async () => {
      const reviewId = await createParentReview();
      if (!reviewId) {
        console.log("⏭️  Skipping: no seed data to build a parent review");
        return;
      }

      await expect(
        client!`
          INSERT INTO review_media (review_id, media_type, url)
          VALUES (${reviewId}, 'audio', 'https://cdn.example.com/nope.mp3')
        `
      ).rejects.toThrow();
    });
  });

  describe("Cascade Delete", () => {
    dbTest("should delete media rows when the parent review is deleted", async () => {
      const reviewId = await createParentReview();
      if (!reviewId) {
        console.log("⏭️  Skipping: no seed data to build a parent review");
        return;
      }

      await db!.insert(reviewMedia).values({
        reviewId,
        mediaType: "image",
        url: "https://cdn.example.com/review-media/cascade.jpg",
      });

      const before = await db!
        .select()
        .from(reviewMedia)
        .where(eq(reviewMedia.reviewId, reviewId));
      expect(before.length).toBe(1);

      await client!`DELETE FROM reviews WHERE id = ${reviewId}`;

      const after = await db!
        .select()
        .from(reviewMedia)
        .where(eq(reviewMedia.reviewId, reviewId));
      expect(after.length).toBe(0);
    });
  });
});
