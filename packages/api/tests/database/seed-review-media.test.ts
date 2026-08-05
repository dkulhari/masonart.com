/**
 * Review media seeding (#491).
 *
 * The PDP media wall, the home strip and the post-submit toast all render off
 * `review_media`. Without seeded rows every one of those surfaces ships as an
 * empty state and there is no evidence any of them work. These tests guard the
 * properties those surfaces depend on:
 *
 *   - media lands on a SUBSET of the approved reviews, so "review with media"
 *     and "review without media" are both exercised;
 *   - every seeded row is `ready` with a resolvable url — a `processing` row
 *     would make the wall render a spinner forever;
 *   - at least one row is a real video, with the poster frame and duration the
 *     lightbox needs;
 *   - re-running the seed does not duplicate media.
 *
 * Storage is mocked (the same way seed-images.test.ts mocks it) so no test
 * writes to a bucket. ffmpeg is NOT mocked: the clip is genuinely generated,
 * transcoded and probed, because a mocked transcode would prove nothing about
 * the path the seed actually takes.
 *
 * The database half skips loudly when Postgres is unreachable.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import postgres from "postgres";
import type { ProductImage } from "@chobii/shared";

vi.mock("../../src/lib/storage", () => {
  const publicUrl = (key: string) =>
    `http://localhost:9000/poster-app-dev/${key}`;
  return {
    StoragePaths: {
      PRODUCTS: "products/",
      REVIEW_MEDIA: "reviews/",
      reviewMedia: (reviewId: string, filename: string) =>
        `reviews/${reviewId}/media/${filename}`,
    },
    getPublicUrl: publicUrl,
    uploadFile: vi.fn(async (_buffer: Buffer, key: string) => ({
      url: publicUrl(key),
      key,
      bucket: "poster-app-dev",
    })),
    uploadImage: vi.fn(async (_buffer: Buffer, filename: string) => ({
      url: publicUrl(`reviews/${filename}`),
      key: `reviews/${filename}`,
      bucket: "poster-app-dev",
    })),
  };
});

const {
  SEED_ORDERS,
  REVIEW_MEDIA_PLAN,
  pickReviewPhotos,
  seedReviewMedia,
} = await import("../../src/database/seed-orders-reviews");

const { isFfmpegAvailable } = await import("../../src/lib/video-processing");

const APPROVED_TITLES = new Set(
  SEED_ORDERS.flatMap((order) =>
    order.reviews.filter((r) => r.status === "approved").map((r) => r.title)
  )
);

// ============================================================================
// Fixture invariants — no database, always run
// ============================================================================

describe("review media plan", () => {
  it("targets a subset of the approved reviews, not all of them", () => {
    // Both branches of the wall have to exist in dev: a review carrying
    // photos and a review carrying none.
    expect(REVIEW_MEDIA_PLAN.length).toBeGreaterThan(0);
    expect(REVIEW_MEDIA_PLAN.length).toBeLessThan(APPROVED_TITLES.size);
  });

  it("names only reviews that exist and are approved", () => {
    // Media inherits the parent review's moderation status. Attaching it to a
    // pending review would publish an unapproved photo.
    for (const entry of REVIEW_MEDIA_PLAN) {
      expect(APPROVED_TITLES.has(entry.reviewTitle)).toBe(true);
    }
  });

  it("names each review at most once", () => {
    const titles = REVIEW_MEDIA_PLAN.map((e) => e.reviewTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("carries exactly one video, so the lightbox and admin queue are exercised", () => {
    expect(REVIEW_MEDIA_PLAN.filter((e) => e.video).length).toBe(1);
  });

  it("asks for at least one photo on every entry", () => {
    for (const entry of REVIEW_MEDIA_PLAN) {
      expect(entry.photos).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("pickReviewPhotos", () => {
  const image = (
    id: string,
    type: ProductImage["type"],
    sortOrder: number
  ): ProductImage => ({
    id,
    url: `http://cdn.test/${id}.webp`,
    altText: `${id} alt`,
    type,
    sortOrder,
    width: 1500,
    height: 1500,
    variants: [
      { name: "thumbnail", width: 150, url: `http://cdn.test/${id}-thumb.webp` },
      { name: "card", width: 400, url: `http://cdn.test/${id}-card.webp` },
    ],
    originalKey: `products/originals/${id}.webp`,
  });

  const gallery: ProductImage[] = [
    image("main", "main", 0),
    image("room-1", "room-mockup", 1),
    image("room-2", "room-mockup", 2),
    image("detail-1", "detail", 3),
  ];

  it("prefers the room mockups — a customer photo shows the print in a room", () => {
    const picked = pickReviewPhotos(gallery, 2);
    expect(picked.map((p) => p.url)).toEqual([
      "http://cdn.test/room-1.webp",
      "http://cdn.test/room-2.webp",
    ]);
  });

  it("uses the thumbnail rendition for the grid thumb", () => {
    const [first] = pickReviewPhotos(gallery, 1);
    expect(first.thumbnailUrl).toBe("http://cdn.test/room-1-thumb.webp");
    expect(first.width).toBe(1500);
    expect(first.height).toBe(1500);
  });

  it("falls back to any image when the product has no room mockup", () => {
    const picked = pickReviewPhotos([image("main", "main", 0)], 2);
    expect(picked).toHaveLength(1);
    expect(picked[0].url).toBe("http://cdn.test/main.webp");
  });

  it("returns nothing for a product with no images rather than inventing a url", () => {
    expect(pickReviewPhotos([], 2)).toEqual([]);
    expect(pickReviewPhotos(null, 2)).toEqual([]);
  });

  it("never returns more than asked for", () => {
    expect(pickReviewPhotos(gallery, 1)).toHaveLength(1);
  });
});

// ============================================================================
// Database behaviour
// ============================================================================

const SKIP_TESTS = process.env.SKIP_DB_RUNTIME_TESTS === "true";

let client: ReturnType<typeof postgres> | null = null;
let isDatabaseAvailable = false;
let ffmpegReady = false;

/** Only rows this suite created are removed in afterAll. */
const seedStartedAt = new Date();

interface MediaRow {
  id: string;
  review_id: string;
  media_type: string;
  url: string;
  poster_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
  processing_status: string;
}

let rows: MediaRow[] = [];
let countAfterFirstRun = 0;
let countAfterSecondRun = 0;
let approvedReviewCount = 0;

beforeAll(async () => {
  if (SKIP_TESTS) {
    console.log("⏭️  Skipping database tests (SKIP_DB_RUNTIME_TESTS=true)");
    return;
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    "postgresql://poster_app:dev_password@localhost:5440/poster_app_dev";

  try {
    client = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 5,
      idle_timeout: 5,
    });
    await client`SELECT 1`;

    const tableCheck = await client`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'review_media'
    `;
    if (tableCheck.length === 0) {
      console.log("⚠️  review_media table missing — run db:migrate first");
      await client.end();
      client = null;
      return;
    }

    const [{ count }] = (await client`
      SELECT count(*)::int AS count FROM reviews WHERE status = 'approved'
    `) as unknown as [{ count: number }];
    approvedReviewCount = count;

    if (approvedReviewCount === 0) {
      console.log("⚠️  No approved reviews seeded — run `bun run seed` first");
      await client.end();
      client = null;
      return;
    }

    isDatabaseAvailable = true;
  } catch {
    console.log("⚠️  Database not available, runtime tests will be skipped");
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore cleanup errors
      }
      client = null;
    }
    return;
  }

  ffmpegReady = await isFfmpegAvailable();

  // Twice, deliberately: the second run is the idempotency assertion.
  await seedReviewMedia();
  countAfterFirstRun = await mediaCount();
  await seedReviewMedia();
  countAfterSecondRun = await mediaCount();

  rows = (await client`
    SELECT id, review_id, media_type, url, poster_url, duration_seconds,
           sort_order, processing_status
    FROM review_media
    ORDER BY review_id, sort_order
  `) as unknown as MediaRow[];
}, 120_000);

async function mediaCount(): Promise<number> {
  const [{ count }] = (await client!`
    SELECT count(*)::int AS count FROM review_media
  `) as unknown as [{ count: number }];
  return count;
}

afterAll(async () => {
  if (!client) return;
  try {
    await client`DELETE FROM review_media WHERE created_at >= ${seedStartedAt}`;
  } catch {
    // ignore cleanup errors
  }
  try {
    await client.end();
  } catch {
    // ignore cleanup errors
  }
});

const dbTest = (name: string, fn: () => Promise<void> | void) => {
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

describe("seedReviewMedia", () => {
  dbTest("attaches media to some reviews", async () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  dbTest("leaves most approved reviews without media", async () => {
    // The empty-state branch of the wall has to stay reachable in dev.
    const withMedia = new Set(rows.map((r) => r.review_id));
    expect(withMedia.size).toBeLessThan(approvedReviewCount);
  });

  dbTest("attaches media only to approved reviews", async () => {
    const pending = await client!`
      SELECT count(*)::int AS count
      FROM review_media m
      JOIN reviews r ON r.id = m.review_id
      WHERE r.status <> 'approved'
    `;
    expect((pending[0] as unknown as { count: number }).count).toBe(0);
  });

  dbTest("marks every row ready with a resolvable url", async () => {
    for (const row of rows) {
      expect(row.processing_status).toBe("ready");
      expect(row.url).toMatch(/^https?:\/\/\S+$/);
    }
  });

  dbTest("numbers sort order from zero within each review", async () => {
    const byReview = new Map<string, number[]>();
    for (const row of rows) {
      byReview.set(row.review_id, [
        ...(byReview.get(row.review_id) ?? []),
        row.sort_order,
      ]);
    }
    for (const orders of byReview.values()) {
      expect([...orders].sort((a, b) => a - b)).toEqual(
        orders.map((_, index) => index)
      );
    }
  });

  dbTest("seeds a real video with a poster frame and a duration", async () => {
    const videos = rows.filter((r) => r.media_type === "video");

    if (!ffmpegReady) {
      // Documented degradation: the seed logs a warning and skips the video
      // half rather than failing on a machine without ffmpeg.
      console.log("⏭️  ffmpeg unavailable — asserting the skip path instead");
      expect(videos).toHaveLength(0);
      return;
    }

    expect(videos.length).toBeGreaterThanOrEqual(1);
    for (const video of videos) {
      expect(video.url).toMatch(/\.mp4$/);
      expect(video.poster_url).toMatch(/^https?:\/\/\S+$/);
      expect(video.duration_seconds).toBeGreaterThan(0);
    }
  });

  dbTest("also seeds photos, not only the video", async () => {
    expect(rows.filter((r) => r.media_type === "image").length).toBeGreaterThan(
      0
    );
  });

  dbTest("is idempotent — a second run adds nothing", async () => {
    expect(countAfterSecondRun).toBe(countAfterFirstRun);
    expect(countAfterFirstRun).toBe(rows.length);
  });
});
