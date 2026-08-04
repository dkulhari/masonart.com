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

import { inArray, asc } from "drizzle-orm";

import { db } from "./index";
import { products, productVariants } from "./schema/products";
import {
  orders,
  orderItems,
  type OrderShippingAddress,
  type OrderItemSnapshot,
} from "./schema/orders";
import { reviews } from "./schema/reviews";
import { users } from "./schema/users";

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
// Seeding
// ============================================================================

/** Deletes what this module owns. Called before products are re-inserted. */
export async function clearOrdersAndReviews(): Promise<void> {
  // Reviews first: they hold a NOT NULL FK to order_items.
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
}

/** Products whose sales must stay zero — the voided-order guard. */
export const VOIDED_ONLY_SLUG = "paper-layers";

/** Exported for the seed's own summary and for tests asserting the fixture. */
export { SEED_ORDERS };
