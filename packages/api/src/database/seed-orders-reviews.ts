/**
 * Seeds settled orders and the reviews they authorise.
 *
 * ## Why this exists
 *
 * Two features read real signals off this data and both returned empty
 * without it:
 *
 *   - Best selling (#405) sums `order_items.quantity` over settled orders.
 *     With no orders every product scored 0 and the sort fell through to its
 *     tie-break — correct behaviour, no evidence it worked.
 *   - The collection promo tile (#411) reads the catalogue review aggregate
 *     (#407). With no reviews it rendered nothing, so §1.3.6 shipped invisible.
 *
 * Reviews carry a NOT NULL `order_item_id`, which is why the two are seeded
 * together and in this order. A previous attempt worked around that FK by
 * dropping it and restoring it `NOT VALID`; those fixture rows did not
 * survive the next reseed. Seeding the purchase satisfies the constraint
 * honestly instead.
 *
 * ## Determinism
 *
 * Every order number, product, quantity and rating is a literal below. A
 * reseed reproduces the same catalogue, the same units sold and the same
 * average rating. Random ratings would make a number on a public page move
 * every time someone reseeded, which is indistinguishable from a bug.
 *
 * ## Not a substitute for real trade
 *
 * This is dev fixture data. It exists so the real-signal code paths have
 * something true to report, not so the storefront can claim sales it did not
 * make.
 */

import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { inArray, asc, eq, and } from "drizzle-orm";
import type { ProductImage } from "@chobii/shared";

import { db } from "./index";
import { products, productVariants } from "./schema/products";
import {
  orders,
  orderItems,
  type OrderShippingAddress,
  type OrderItemSnapshot,
} from "./schema/orders";
import { reviews } from "./schema/reviews";
import { reviewMedia } from "./schema/review-media";
import { users } from "./schema/users";
import { StoragePaths, uploadFile } from "../lib/storage";
import {
  extractPosterFrame,
  isFfmpegAvailable,
  probeVideo,
  transcodeToMp4,
} from "../lib/video-processing";

const execFileAsync = promisify(execFile);

// ============================================================================
// Fixture data
// ============================================================================

/**
 * Customers created by seed-test-users.ts. If that script has not run, this
 * one no-ops rather than inventing users — a review needs a real author.
 */
const CUSTOMER_IDS = [
  "test-customer-001",
  "test-customer-002",
  "test-customer-003",
  "test-customer-004",
  "test-customer-005",
] as const;

const SHIPPING_ADDRESS: OrderShippingAddress = {
  fullName: "Test Customer",
  phone: "+919000000001",
  addressLine1: "12 Seed Street",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
  countryCode: "IN",
};

interface SeedOrderItem {
  slug: string;
  quantity: number;
}

interface SeedReview {
  /** Index into the order's items — the purchase that authorises the review. */
  itemIndex: number;
  customerIndex: number;
  rating: number;
  title: string;
  content: string;
  status: "approved" | "pending";
}

interface SeedOrder {
  orderNumber: string;
  customerIndex: number;
  status:
    | "delivered"
    | "shipped"
    | "processing"
    | "confirmed"
    | "cancelled"
    | "refunded";
  paymentStatus: "paid" | "refunded" | "cancelled";
  items: SeedOrderItem[];
  reviews: SeedReview[];
}

/**
 * Twelve orders over ten products.
 *
 * Two of them — CH-SEED-0011 and CH-SEED-0012 — must NOT reach any total.
 * One is cancelled, one refunded, and they exist so the denylist in
 * `lib/product-sales.ts` is exercised by real rows rather than only by a
 * mocked assertion. `paper-layers` appears exclusively in those two, so a
 * regression that starts counting voided orders shows up as that product
 * gaining sales from nothing.
 */
const SEED_ORDERS: SeedOrder[] = [
  {
    orderNumber: "CH-SEED-0001",
    customerIndex: 0,
    status: "delivered",
    paymentStatus: "paid",
    items: [
      { slug: "wabi-sabi-study", quantity: 3 },
      { slug: "cosmic-harmony", quantity: 1 },
    ],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 0,
        rating: 5,
        title: "Better in person",
        content:
          "The texture reads as depth rather than noise, which is the thing photographs never manage to show.",
        status: "approved",
      },
      {
        itemIndex: 1,
        customerIndex: 0,
        rating: 4,
        title: "Warmer than expected",
        content:
          "Slightly warmer than the listing image on my wall, and better for it. Framing was square and tight.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0002",
    customerIndex: 1,
    status: "delivered",
    paymentStatus: "paid",
    items: [{ slug: "mountain-majesty", quantity: 2 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 1,
        rating: 5,
        title: "Bought the pair",
        content:
          "Ordered two for a stairwell. Identical tone across both prints, which was the whole worry.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0003",
    customerIndex: 2,
    status: "delivered",
    paymentStatus: "paid",
    items: [
      { slug: "ocean-horizon", quantity: 1 },
      { slug: "serene-waves", quantity: 2 },
    ],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 2,
        rating: 4,
        title: "Quietly good",
        content:
          "Does what a seascape should do in a small room: gives it somewhere to look without shouting.",
        status: "approved",
      },
      {
        itemIndex: 1,
        customerIndex: 2,
        rating: 5,
        title: "Repeat purchase",
        content:
          "Second one of these. Paper weight is the reason — it hangs flat straight out of the tube.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0004",
    customerIndex: 3,
    status: "shipped",
    paymentStatus: "paid",
    items: [{ slug: "forest-whispers", quantity: 1 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 3,
        rating: 5,
        title: "Exactly the green I wanted",
        content:
          "Hard colour to get right and they got it right. Arrived two days ahead of the estimate.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0005",
    customerIndex: 4,
    status: "delivered",
    paymentStatus: "paid",
    items: [{ slug: "desert-bloom", quantity: 4 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 4,
        rating: 4,
        title: "Ordered four, all consistent",
        content:
          "Four across one wall. No visible variation between them, which is the only thing that mattered.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0006",
    customerIndex: 0,
    status: "delivered",
    paymentStatus: "paid",
    items: [{ slug: "wabi-sabi-study", quantity: 2 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 0,
        rating: 5,
        title: "Came back for more",
        content:
          "Bought one, then bought two more for the office. That is the whole review.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0007",
    customerIndex: 1,
    status: "processing",
    paymentStatus: "paid",
    items: [{ slug: "floating-islands", quantity: 1 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 1,
        rating: 3,
        title: "Good print, wrong wall",
        content:
          "Nothing wrong with it. Needs more distance than my hallway gives it, which is on me.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0008",
    customerIndex: 2,
    status: "delivered",
    paymentStatus: "paid",
    items: [
      { slug: "imperfect-vessel", quantity: 1 },
      { slug: "cosmic-harmony", quantity: 2 },
    ],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 2,
        rating: 4,
        title: "Restrained",
        content:
          "Almost nothing on the page and it still holds the room. Matting is generous.",
        status: "approved",
      },
      {
        itemIndex: 1,
        customerIndex: 2,
        rating: 5,
        title: "The one people ask about",
        content:
          "Every visitor asks about this one. Colours have not shifted in the months it has been up.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0009",
    customerIndex: 3,
    status: "delivered",
    paymentStatus: "paid",
    items: [{ slug: "mountain-majesty", quantity: 1 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 3,
        rating: 5,
        title: "Third order, no complaints",
        content:
          "Third thing I have bought here. Packaging has been the same standard every time.",
        status: "approved",
      },
    ],
  },
  {
    orderNumber: "CH-SEED-0010",
    customerIndex: 4,
    status: "confirmed",
    paymentStatus: "paid",
    items: [{ slug: "ocean-horizon", quantity: 2 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 4,
        rating: 4,
        title: "Waiting on delivery",
        content:
          "Ordered on the strength of the first one. Will update once the second arrives.",
        status: "pending",
      },
    ],
  },
  {
    /** Voided. Must never reach a sales total. */
    orderNumber: "CH-SEED-0011",
    customerIndex: 0,
    status: "cancelled",
    paymentStatus: "cancelled",
    items: [{ slug: "paper-layers", quantity: 5 }],
    reviews: [],
  },
  {
    /** Voided. Must never reach a sales total. */
    orderNumber: "CH-SEED-0012",
    customerIndex: 1,
    status: "refunded",
    paymentStatus: "refunded",
    items: [{ slug: "paper-layers", quantity: 3 }],
    reviews: [
      {
        itemIndex: 0,
        customerIndex: 1,
        rating: 2,
        title: "Not for me",
        content:
          "Returned it — the palette was colder than my room takes. Refund was quick and complete.",
        status: "pending",
      },
    ],
  },
];

// ============================================================================
// Review media fixture
// ============================================================================

/**
 * Which approved reviews carry media.
 *
 * Deliberately a subset. A wall where every review has a photo never renders
 * its plain-text branch, and the empty state is the layout most likely to
 * break — so five of the twelve approved reviews carry media and seven do not.
 *
 * Keyed by review title because titles are unique across SEED_ORDERS and
 * survive a reseed; row ids do not.
 */
export interface SeedReviewMedia {
  /** Matches a `SeedReview.title` above. Must be an approved review. */
  reviewTitle: string;
  /** How many of the product's room mockups to attach. */
  photos: number;
  /** Whether this review also carries the generated video clip. */
  video?: boolean;
}

export const REVIEW_MEDIA_PLAN: SeedReviewMedia[] = [
  // The video lives on the highest-rated review of the best-selling product,
  // which is the one the home strip surfaces first.
  { reviewTitle: "Better in person", photos: 2, video: true },
  { reviewTitle: "Bought the pair", photos: 2 },
  { reviewTitle: "Repeat purchase", photos: 1 },
  { reviewTitle: "Exactly the green I wanted", photos: 2 },
  { reviewTitle: "The one people ask about", photos: 1 },
];

/** Generated clip parameters. Six seconds clears extractPosterFrame's 1s seek. */
const SEED_CLIP_SECONDS = 6;
const SEED_CLIP_SIZE = "854x480";
const SEED_CLIP_FPS = 24;

/** Mirrors video-processing.ts, whose binary resolver is module-private. */
function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

/**
 * The photo rows for one review, drawn from renditions the product already has.
 *
 * Room mockups first: a customer photo is the print on someone's wall, and the
 * mockups are the only assets in the catalogue that look like that. A product
 * without mockups falls back to whatever it does have rather than inventing a
 * url that would 404 on the wall.
 *
 * Pure and exported so the selection rule can be asserted without a database.
 */
export function pickReviewPhotos(
  images: ProductImage[] | null | undefined,
  count: number
): Array<{
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}> {
  if (!images || images.length === 0 || count <= 0) return [];

  const mockups = images.filter((image) => image.type === "room-mockup");
  const ordered = (mockups.length > 0 ? mockups : images)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return ordered.slice(0, count).map((image) => ({
    url: image.url,
    thumbnailUrl:
      image.variants?.find((v) => v.name === "thumbnail")?.url ??
      image.thumbnailUrl ??
      null,
    width: image.width ?? null,
    height: image.height ?? null,
  }));
}

// ============================================================================
// Seeding
// ============================================================================

/** Deletes what this module owns. Called before products are re-inserted. */
export async function clearOrdersAndReviews(): Promise<void> {
  // Reviews first: they hold a NOT NULL FK to order_items. review_media is
  // ON DELETE CASCADE from reviews, so it goes with them.
  await db.delete(reviews);
  await db.delete(orderItems);
  await db.delete(orders);
}

export async function seedOrdersAndReviews(): Promise<void> {
  console.log("Seeding orders and reviews...");

  const customers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, [...CUSTOMER_IDS]));

  if (customers.length < CUSTOMER_IDS.length) {
    console.warn(
      `  Skipped: found ${customers.length}/${CUSTOMER_IDS.length} test customers. ` +
        "Run `bun run seed:test-users` first — a review needs a real author, and " +
        "inventing one here would put a fabricated name on a public page."
    );
    return;
  }

  const slugs = [...new Set(SEED_ORDERS.flatMap((o) => o.items.map((i) => i.slug)))];

  const catalogue = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      sku: products.sku,
      images: products.images,
    })
    .from(products)
    .where(inArray(products.slug, slugs));

  const bySlug = new Map(catalogue.map((p) => [p.slug, p]));

  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    console.warn(`  Skipped: catalogue is missing ${missing.join(", ")}.`);
    return;
  }

  /** Smallest variant per product — the snapshot needs real dimensions. */
  const variants = await db
    .select({
      productId: productVariants.productId,
      sizeLabel: productVariants.sizeLabel,
      widthInches: productVariants.widthInches,
      heightInches: productVariants.heightInches,
      price: productVariants.price,
      id: productVariants.id,
    })
    .from(productVariants)
    .where(
      inArray(
        productVariants.productId,
        catalogue.map((p) => p.id)
      )
    )
    .orderBy(asc(productVariants.sortOrder));

  const variantByProduct = new Map<string, (typeof variants)[number]>();
  for (const variant of variants) {
    if (!variantByProduct.has(variant.productId)) {
      variantByProduct.set(variant.productId, variant);
    }
  }

  let orderCount = 0;
  let itemCount = 0;
  let reviewCount = 0;

  for (const seedOrder of SEED_ORDERS) {
    const lines = seedOrder.items.map((item) => {
      const product = bySlug.get(item.slug)!;
      const variant = variantByProduct.get(product.id);
      const unitPrice = Number(variant?.price ?? 0);

      const snapshot: OrderItemSnapshot = {
        title: product.title,
        sku: product.sku,
        sizeLabel: variant?.sizeLabel ?? "Unknown",
        widthInches: variant?.widthInches ?? 0,
        heightInches: variant?.heightInches ?? 0,
        imageUrl: product.images?.[0]?.url,
      };

      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        snapshot,
        unitPrice: unitPrice.toFixed(2),
        quantity: item.quantity,
        lineTotal: (unitPrice * item.quantity).toFixed(2),
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);

    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: seedOrder.orderNumber,
        userId: CUSTOMER_IDS[seedOrder.customerIndex],
        status: seedOrder.status,
        paymentStatus: seedOrder.paymentStatus,
        shippingAddress: SHIPPING_ADDRESS,
        subtotal: subtotal.toFixed(2),
        total: subtotal.toFixed(2),
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      })
      .returning({ id: orders.id });

    if (!order) continue;
    orderCount += 1;

    const insertedItems = await db
      .insert(orderItems)
      .values(lines.map((line) => ({ ...line, orderId: order.id })))
      .returning({ id: orderItems.id });

    itemCount += insertedItems.length;

    for (const seedReview of seedOrder.reviews) {
      const item = insertedItems[seedReview.itemIndex];
      const productId = lines[seedReview.itemIndex]?.productId;
      const authorId = CUSTOMER_IDS[seedReview.customerIndex];
      // A review with no author or no authorising purchase is not a review.
      if (!item || !productId || !authorId) continue;

      await db.insert(reviews).values({
        productId,
        userId: authorId,
        orderItemId: item.id,
        rating: seedReview.rating,
        title: seedReview.title,
        content: seedReview.content,
        status: seedReview.status,
      });

      reviewCount += 1;
    }
  }

  console.log(
    `  Orders: ${orderCount}, items: ${itemCount}, reviews: ${reviewCount}`
  );

  await seedReviewMedia();
}

/**
 * Build one short clip with ffmpeg's own synthetic sources, normalise it
 * through the real upload pipeline, and return the row values for it.
 *
 * `testsrc` is used rather than a committed MP4 so the repository carries no
 * binary fixture: the clip is regenerated on every machine that seeds. It is
 * then put through `transcodeToMp4` and `extractPosterFrame` — the same two
 * functions the review upload worker calls — so the seeded row is produced by
 * the production path rather than by hand-written column values.
 *
 * Returns null when ffmpeg is missing, so seeding still completes on a machine
 * without it. The wall degrades to photos only, which is a visible gap rather
 * than a broken seed.
 */
async function buildSeedVideo(
  reviewId: string,
  sortOrder: number
): Promise<typeof reviewMedia.$inferInsert | null> {
  if (!(await isFfmpegAvailable())) {
    console.warn(
      "  ffmpeg not found — skipping the review video. Photos are still " +
        "seeded; install ffmpeg (macOS: `brew install ffmpeg`) and reseed to " +
        "get the video wall, lightbox and admin queue exercised."
    );
    return null;
  }

  const workDir = await mkdtemp(join(tmpdir(), "chobii-seed-clip-"));

  try {
    const source = join(workDir, "source.mkv");
    const clip = join(workDir, "seed-clip.mp4");
    const poster = join(workDir, "seed-clip-poster.jpg");

    // A synthetic source with a tone, so the transcode's audio path is real.
    await execFileAsync(ffmpegBin(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc=duration=${SEED_CLIP_SECONDS}:size=${SEED_CLIP_SIZE}:rate=${SEED_CLIP_FPS}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${SEED_CLIP_SECONDS}`,
      "-shortest",
      "-y",
      source,
    ]);

    await transcodeToMp4(source, clip);
    await extractPosterFrame(clip, poster);

    const metadata = await probeVideo(clip);

    const [uploadedClip, uploadedPoster] = await Promise.all([
      uploadFile(
        await readFile(clip),
        StoragePaths.reviewMedia(reviewId, "seed-clip.mp4"),
        { contentType: "video/mp4" }
      ),
      uploadFile(
        await readFile(poster),
        StoragePaths.reviewMedia(reviewId, "seed-clip-poster.jpg"),
        { contentType: "image/jpeg" }
      ),
    ]);

    return {
      reviewId,
      mediaType: "video",
      url: uploadedClip.url,
      thumbnailUrl: uploadedPoster.url,
      posterUrl: uploadedPoster.url,
      durationSeconds: Math.max(1, Math.round(metadata.durationSeconds)),
      width: metadata.width,
      height: metadata.height,
      sizeBytes: metadata.sizeBytes,
      sortOrder,
      processingStatus: "ready",
    };
  } catch (error) {
    // A failed clip must not take the whole seed down with it.
    console.warn(
      `  Review video skipped: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Attach photos and one video to the approved reviews named in
 * REVIEW_MEDIA_PLAN.
 *
 * ## Idempotency
 *
 * Guarded per (review, media type): a review that already has image rows is
 * not given more, and a review that already has a video row is not given
 * another. Re-running is therefore a no-op, and a machine that seeded without
 * ffmpeg picks up the video on the next run once ffmpeg is installed rather
 * than being stuck photo-only forever.
 */
export async function seedReviewMedia(): Promise<void> {
  console.log("Seeding review media...");

  const titles = REVIEW_MEDIA_PLAN.map((entry) => entry.reviewTitle);

  const targets = await db
    .select({
      reviewId: reviews.id,
      title: reviews.title,
      images: products.images,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .where(and(eq(reviews.status, "approved"), inArray(reviews.title, titles)));

  if (targets.length === 0) {
    console.warn(
      "  Skipped: none of the planned reviews exist yet. Reviews are seeded " +
        "by seedOrdersAndReviews() — run that first."
    );
    return;
  }

  const byTitle = new Map(targets.map((row) => [row.title, row]));

  let photoCount = 0;
  let videoCount = 0;

  for (const entry of REVIEW_MEDIA_PLAN) {
    const target = byTitle.get(entry.reviewTitle);
    if (!target) {
      console.warn(`  No approved review titled "${entry.reviewTitle}".`);
      continue;
    }

    const existing = await db
      .select({ mediaType: reviewMedia.mediaType })
      .from(reviewMedia)
      .where(eq(reviewMedia.reviewId, target.reviewId));

    const hasImages = existing.some((row) => row.mediaType === "image");
    const hasVideo = existing.some((row) => row.mediaType === "video");

    let sortOrder = existing.length;

    if (!hasImages) {
      const photos = pickReviewPhotos(target.images, entry.photos);
      if (photos.length === 0) {
        console.warn(
          `  "${entry.reviewTitle}": product has no images to reuse as a photo.`
        );
      } else {
        await db.insert(reviewMedia).values(
          photos.map((photo) => ({
            reviewId: target.reviewId,
            mediaType: "image" as const,
            url: photo.url,
            thumbnailUrl: photo.thumbnailUrl,
            width: photo.width,
            height: photo.height,
            sortOrder: sortOrder++,
            processingStatus: "ready" as const,
          }))
        );
        photoCount += photos.length;
      }
    }

    if (entry.video && !hasVideo) {
      const video = await buildSeedVideo(target.reviewId, sortOrder);
      if (video) {
        await db.insert(reviewMedia).values(video);
        sortOrder += 1;
        videoCount += 1;
      }
    }
  }

  console.log(`  Review media - photos: ${photoCount}, videos: ${videoCount}`);
}

/** Products whose sales must stay zero — the voided-order guard. */
export const VOIDED_ONLY_SLUG = "paper-layers";

/** Exported for the seed's own summary and for tests asserting the fixture. */
export { SEED_ORDERS };
