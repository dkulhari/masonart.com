/**
 * Orders API Routes
 *
 * Provides API endpoints for order management:
 * - POST /api/orders - Create a new order from cart
 * - GET /api/orders - List user's orders with pagination
 * - GET /api/orders/:id - Get order by ID or order number
 * - POST /api/orders/:id/payment - Initiate payment for an order
 * - POST /api/orders/:id/payment/verify - Verify payment after checkout
 *
 * Requires authentication for all endpoints.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, inArray, notInArray, isNotNull } from "drizzle-orm";

import { db } from "../database";
import {
  orders,
  orderItems,
  type OrderShippingAddress,
  type OrderItemSnapshot,
  type GiftCardPurchase,
  type OrderPaymentDetails,
} from "../database/schema/orders";
import { carts, cartItems } from "../database/schema/cart";
import { invalidateCartCache } from "./cart";
import { productionApprovals } from "../database/schema/approvals";
import { reviews } from "../database/schema/reviews";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  generateOrderNumber,
  ORDER_NUMBER_PREFIX,
} from "../lib/order-number";
import { deliverImmediateGiftCard } from "../services/gift-card-delivery";
import {
  quoteGiftCard,
  redeemGiftCards,
  voidGiftCardHold,
  GiftCardError,
} from "../services/gift-card";
import {
  giftCardCodeRateLimit,
  giftCardCodeSchema,
} from "./gift-cards";
import type { Promotion } from "../database/schema/promotions";
import {
  getActivePromotions,
  loadPromotionProductSets,
  resolveSalePrice,
} from "../lib/promotion-pricing";
import { isGalleryMember } from "../services/gallery-membership";
import { getFreeShippingThreshold } from "../lib/shipping-config";
import {
  netAmountForShipping,
  qualifiesForFreeShipping,
} from "@chobii/shared";
import { VOIDED_ORDER_STATUSES } from "../lib/product-sales";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  getRazorpayKeyId,
  toPaise,
  isRazorpayConfigured,
  RazorpayError,
} from "../lib/razorpay";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

/**
 * Raised when a payment needs the gateway and there isn't one configured.
 *
 * Thrown from inside the payment transaction rather than checked at the top of
 * the handler, so an order fully covered by gift cards — which creates no
 * Razorpay order at all — is not refused for the absence of something it never
 * touches (#578). Throwing rolls the gift card debit back with it.
 */
class PaymentGatewayUnavailableError extends Error {
  constructor() {
    super("Payment gateway not configured");
    this.name = "PaymentGatewayUnavailableError";
  }
}

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for shipping address in order creation
 */
const shippingAddressSchema = z.object({
  fullName: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  landmark: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(5).max(10),
  countryCode: z.string().length(2).default("IN"),
});

/**
 * Schema for creating a new order
 *
 * Deliberately carries no price and no coupon code. Money is resolved from the
 * database at order time (see `resolvePromotionDiscounts`), so anything the
 * request says about what this order costs is ignored — and a `couponCode` the
 * request supplies used to be persisted beside a hardcoded zero discount, which
 * made the order record claim a code was applied when none was.
 *
 * Exported so a test can assert what is *absent*: zod strips unknown keys
 * silently, so a re-added `couponCode` would never surface as a 400.
 */
export const createOrderSchema = z.object({
  shippingAddress: shippingAddressSchema,
  shippingMethod: z.enum(["standard", "express"]).optional().default("standard"),
  customerNotes: z.string().max(500).optional(),
});

/**
 * Query parameters for listing orders
 */
const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(DEFAULT_PAGE_SIZE),
  status: z
    .enum([
      "pending",
      "pending_payment",
      "confirmed",
      "processing",
      "shipped",
      "out_for_delivery",
      "delivered",
      "cancelled",
      "refund_requested",
      "refunded",
      "failed",
    ])
    .optional(),
});

/**
 * Schema for payment verification
 */
const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

/**
 * Schema for creating a review from an order item
 */
const createOrderReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(255).optional(),
  content: z.string().min(10).max(5000),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gift card codes sent with a payment request.
 *
 * The payment endpoint predates gift cards and most callers still send no
 * body at all, so a missing or unparseable body means "no cards" rather than
 * an error. Duplicates are dropped: applying the same code twice in one
 * request would otherwise try to lock the same row twice.
 */
async function readGiftCardCodes(c: Context): Promise<string[]> {
  try {
    const body = (await c.req.json()) as { giftCardCodes?: unknown };
    if (!Array.isArray(body?.giftCardCodes)) return [];

    const codes = body.giftCardCodes.filter(
      (code): code is string => typeof code === "string" && code.length > 0,
    );
    return [...new Set(codes)];
  } catch {
    return [];
  }
}

/**
 * Calculate shipping cost based on method and the NET, post-discount amount.
 *
 * The threshold is an admin setting (`shipping_config`, #569) and is read
 * through `getFreeShippingThreshold`, which falls back to the same
 * `@chobii/shared` constant the cart page renders. Both halves matter: the
 * value has to be changeable without a deploy, and a database hiccup must not
 * decide that every order — or no order — ships free.
 *
 * `netSubtotal` is a PRICE — base line totals minus price-level discounts. A
 * gift card is tender applied after tax and must never reach this function; see
 * `netAmountForShipping`.
 */
async function calculateShippingCost(
  method: string,
  netSubtotal: string
): Promise<string> {
  const threshold = await getFreeShippingThreshold();

  if (qualifiesForFreeShipping(parseFloat(netSubtotal), threshold)) {
    return "0.00";
  }

  // Express shipping costs more
  if (method === "express") {
    return "199.00";
  }

  // Standard shipping
  return "99.00";
}

/**
 * Create order item snapshot from product data
 */
function createItemSnapshot(
  product: { title: string; sku: string; images: unknown },
  variant: {
    sizeLabel: string;
    widthInches: number;
    heightInches: number;
  },
  frame?: { name: string; type: string } | null
): OrderItemSnapshot {
  const images = product.images as Array<{ url?: string }> | null;
  const imageUrl = images?.[0]?.url;

  return {
    title: product.title,
    sku: product.sku,
    sizeLabel: variant.sizeLabel,
    widthInches: variant.widthInches,
    heightInches: variant.heightInches,
    frameName: frame?.name,
    frameType: frame?.type,
    imageUrl,
  };
}

/**
 * The snapshot for a gift card line.
 *
 * `order_items.snapshot` is NOT NULL and every surface that renders an order —
 * confirmation, order detail, admin, emails — reads `title` out of it. A gift
 * card has no product row to snapshot, so it describes itself: the dimensions
 * are zero because there is nothing to print, and the SKU is a marker rather
 * than a catalogue reference.
 *
 * The recipient's address is deliberately absent. The snapshot is rendered on
 * screens the buyer may share, and the card itself is emailed from the
 * purchase record instead.
 */
function createGiftCardSnapshot(purchase: GiftCardPurchase): OrderItemSnapshot {
  return {
    title: `Gift card — ₹${(purchase.amountPaise / 100).toLocaleString("en-IN")}`,
    sku: "GIFT-CARD",
    sizeLabel: purchase.sendAt
      ? `Scheduled for ${purchase.sendAt.slice(0, 10)}`
      : "Emailed on payment",
    widthInches: 0,
    heightInches: 0,
  };
}

/**
 * How much of this order is stored value being bought, in paise.
 *
 * Gift card tender may not pay for gift card lines — that cycles balance
 * between instruments and makes every refund a graph traversal — so this is
 * subtracted from what a card is allowed to cover (#579). Zero for every
 * ordinary order, and for the standalone `/gift-cards` flow, whose order has
 * no line items at all.
 */
export async function sumGiftCardLinesPaise(orderId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${orderItems.lineTotal}), 0)::text`,
    })
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, orderId),
        isNotNull(orderItems.giftCardPurchase),
      ),
    );

  return toPaise(row?.total ?? "0");
}

// ============================================================================
// Sale pricing at order time
// ============================================================================

/** Half-up to 2dp, applied per line — the same rule the resolver uses. */
function toMoney(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** A line's own discount and the promotion that granted it. */
type LineDiscount = { promotionId: string; amount: number };

/** The lines `resolvePromotionDiscounts` prices, as little of them as it needs. */
type PricedOrderLine = {
  id: string;
  unitPrice: string;
  quantity: number;
  product: { id: string; basePrice: string } | null;
};

/**
 * How many settled orders this customer already has under `promotionId`.
 *
 * "Settled" means the same thing here as it does for the best-selling rank:
 * payment succeeded and the order was not undone. Sharing
 * `VOIDED_ORDER_STATUSES` with `lib/product-sales.ts` is what keeps the two
 * definitions from drifting — a refunded order must not burn a customer's
 * allowance any more than it counts as a unit sold.
 */
async function countSettledOrdersForPromotion(
  userId: string,
  promotionId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.promotionId, promotionId),
        eq(orders.paymentStatus, "paid"),
        notInArray(orders.status, [...VOIDED_ORDER_STATUSES])
      )
    );

  return result[0]?.count ?? 0;
}

/**
 * Whether a members-only price applies to this order.
 *
 * Read from the users row, never from the session (#526). `galleryMember` is a
 * Better Auth additional field, so it rides on the session — and better-auth
 * serves the session from a five-minute signed cookie. That cache is stale in
 * both directions: a customer who joined a minute ago still reads as a guest,
 * and a flag cleared a minute ago still reads as a member. `routes/cart.ts` and
 * `routes/products.ts` can live with that — they render prices. This is the one
 * place money actually moves, and it does not get to be wrong for five minutes
 * in either direction.
 *
 * The read is lazy because it is only ever needed by a members-only promotion:
 * `resolveSalePrice` consults `isMember` nowhere else, so with no such
 * promotion in play the answer cannot change a single figure and the query is
 * simply not issued.
 */
async function resolveMembership(
  userId: string,
  activePromotions: Promotion[]
): Promise<boolean> {
  if (!activePromotions.some((promotion) => promotion.membersOnly)) {
    return false;
  }

  return isGalleryMember(userId);
}

/**
 * What comes off this order, resolved from the database.
 *
 * The client sends no prices and none are read from the cart's stored
 * `lineTotal`: every line is re-resolved through `resolveSalePrice`, so a sale
 * that ended while the cart sat open is simply not found.
 *
 * The discount comes off the line's own `unitPrice` — the variant's price,
 * which is the money actually being charged — exactly as `routes/cart.ts`
 * prices the same basket. Feeding the product's `basePrice` in instead would
 * discount an A1 print by the A4's saving, and the cart and the order would
 * quote different totals for the same items. The frame stays at full price:
 * the sale is on the artwork, and a frame is not a product a promotion scopes
 * over.
 */
async function resolvePromotionDiscounts(
  userId: string,
  items: PricedOrderLine[]
): Promise<{
  discountByLine: Map<string, string>;
  promotionId: string | null;
  promotionDiscount: string;
}> {
  const activePromotions = await getActivePromotions();
  const { includedIds, excludedIds } =
    await loadPromotionProductSets(activePromotions);
  const isMember = await resolveMembership(userId, activePromotions);
  const ctx = { isMember, includedIds, excludedIds };

  const perLine = new Map<string, LineDiscount>();

  for (const item of items) {
    if (!item.product) continue;

    const sale = resolveSalePrice(
      { ...item.product, basePrice: item.unitPrice },
      activePromotions,
      ctx
    );

    // `locked` is a members-only price this buyer has not earned: shown on the
    // storefront, base at the till.
    if (!sale || sale.locked) continue;

    const perUnit = parseFloat(sale.basePrice) - parseFloat(sale.salePrice);
    if (perUnit <= 0) continue;

    perLine.set(item.id, {
      promotionId: sale.promotionId,
      amount: parseFloat(toMoney(perUnit * item.quantity)),
    });
  }

  // One count per promotion actually in play — usually one, often none. A
  // promotion without a limit asks the database nothing.
  const promotionIds = new Set(
    [...perLine.values()].map((line) => line.promotionId)
  );

  for (const promotionId of promotionIds) {
    const limit = activePromotions.find(
      (promotion) => promotion.id === promotionId
    )?.perCustomerOrderLimit;
    if (!limit || limit <= 0) continue;

    const settled = await countSettledOrdersForPromotion(userId, promotionId);
    if (settled < limit) continue;

    // Spent. The order still goes through, at base — refusing it at the till
    // loses the sale rather than the discount.
    for (const [lineId, line] of perLine) {
      if (line.promotionId === promotionId) perLine.delete(lineId);
    }
  }

  // One promotion id fits on the order row. Promotions never stack per
  // product, so two of them pricing one basket is already an admin overlap;
  // the deepest contributor is what gets recorded.
  const totals = new Map<string, number>();
  let promotionId: string | null = null;
  let leadingTotal = 0;

  for (const line of perLine.values()) {
    const total = (totals.get(line.promotionId) ?? 0) + line.amount;
    totals.set(line.promotionId, total);
    if (total > leadingTotal) {
      leadingTotal = total;
      promotionId = line.promotionId;
    }
  }

  const discountByLine = new Map(
    [...perLine].map(([lineId, line]) => [lineId, toMoney(line.amount)])
  );
  const promotionDiscount = toMoney(
    [...perLine.values()].reduce((sum, line) => sum + line.amount, 0)
  );

  return { discountByLine, promotionId, promotionDiscount };
}

// ============================================================================
// Route Handler
// ============================================================================

const ordersApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication to all routes
ordersApp.use("*", requireAuth);

// ============================================================================
// POST /api/orders - Create Order
// ============================================================================

ordersApp.post(
  "/",
  zValidator("json", createOrderSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");

    try {
      // Get user's active cart with items
      const userCart = await db.query.carts.findFirst({
        where: and(eq(carts.userId, user.id), eq(carts.isActive, true)),
        with: {
          items: {
            where: eq(cartItems.isSavedForLater, false),
            with: {
              product: true,
              variant: true,
              frame: true,
            },
          },
        },
      });

      if (!userCart) {
        return c.json({ error: "No active cart found" }, 404);
      }

      const activeItems = userCart.items.filter((item) => !item.isSavedForLater);

      if (activeItems.length === 0) {
        return c.json({ error: "Cart is empty" }, 400);
      }

      // Validate all items are still available. A gift card has no catalogue
      // entry to go out of stock or be delisted (#579) — what makes it valid
      // is its stored purchase, checked below.
      for (const item of activeItems) {
        if (item.lineType === "gift_card") {
          if (!item.giftCardPurchase) {
            return c.json(
              { error: "A gift card in your cart is incomplete. Remove it and add it again." },
              400,
            );
          }
          continue;
        }

        if (!item.product || item.product.status !== "active") {
          return c.json(
            { error: `Product "${item.product?.title || "Unknown"}" is no longer available` },
            400
          );
        }
        if (!item.variant || !item.variant.isInStock) {
          return c.json(
            { error: `Selected size for "${item.product?.title}" is out of stock` },
            400
          );
        }
      }

      // Re-resolve every price from the database. Nothing the request said
      // about money reaches this point.
      const { discountByLine, promotionId, promotionDiscount } =
        await resolvePromotionDiscounts(user.id, activeItems);

      // Calculate totals
      //
      // Settled by owner decision, 2026-08-07 (design §5):
      //
      // `subtotal` stays GROSS — the sum of base line totals, as it has always
      // been — and `total` subtracts the discount exactly once. Making subtotal
      // net while `total` still subtracts would take the promotion off twice,
      // and would reinterpret a column every settled order already carries.
      //
      // The free-shipping threshold, by contrast, reads the NET figure: the
      // discount is price-level, and §5's layering puts it above shipping. So
      // the discount has to be composed BEFORE shipping is priced, which is why
      // these two blocks are in this order.
      const subtotal = activeItems.reduce((sum, item) => {
        return sum + parseFloat(item.lineTotal);
      }, 0);

      const subtotalStr = subtotal.toFixed(2);
      // Reserved for discount codes (design D8). Nothing here writes it.
      const couponDiscount = "0.00";
      // Derived, not assigned: composing the total from its two source columns
      // means the expression is already correct the day codes land.
      const discount = toMoney(
        parseFloat(promotionDiscount) + parseFloat(couponDiscount)
      );
      // Price minus price. `orders.giftCardAmount` is tender — it is settled at
      // the payment endpoint, after tax, against the amount due — and is
      // deliberately absent here: a gift card must not buy free shipping.
      const netSubtotal = netAmountForShipping(
        subtotal,
        parseFloat(discount)
      ).toFixed(2);
      const shippingCost = await calculateShippingCost(
        input.shippingMethod,
        netSubtotal
      );
      const tax = "0.00"; // TODO: Calculate tax based on location
      const total = (
        subtotal +
        parseFloat(shippingCost) -
        parseFloat(discount) +
        parseFloat(tax)
      ).toFixed(2);

      // Generate order number
      const orderNumber = await generateOrderNumber();

      // Create order in a transaction
      const newOrder = await db.transaction(async (tx) => {
        // Create the order
        const insertedOrders = await tx
          .insert(orders)
          .values({
            orderNumber,
            userId: user.id,
            status: "pending",
            paymentStatus: "pending",
            orderType: activeItems.some((i) => i.isAiGenerated) ? "ai_generated" : "regular",
            shippingAddress: input.shippingAddress as OrderShippingAddress,
            shippingMethod: input.shippingMethod,
            shippingCost,
            subtotal: subtotalStr,
            discount,
            tax,
            total,
            // No code was applied, so none is recorded. See createOrderSchema.
            couponCode: null,
            couponDiscount,
            promotionId,
            promotionDiscount,
            itemCount: activeItems.reduce((sum, item) => sum + item.quantity, 0),
            customerNotes: input.customerNotes || null,
            currency: "INR",
          })
          .returning();

        const createdOrder = insertedOrders[0];
        if (!createdOrder) {
          throw new Error("Failed to create order");
        }

        // Create order items
        const orderItemsToInsert = activeItems.map((item) => ({
          orderId: createdOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          frameId: item.frameId,
          // The purchase travels with the line it was bought as, so an order
          // can hold several cards alongside posters (#579).
          giftCardPurchase:
            item.lineType === "gift_card" ? item.giftCardPurchase : null,
          snapshot:
            item.lineType === "gift_card"
              ? createGiftCardSnapshot(item.giftCardPurchase!)
              : createItemSnapshot(item.product!, item.variant!, item.frame),
          unitPrice: item.unitPrice,
          framePrice: item.framePrice,
          quantity: item.quantity,
          // Base, always. The sale comes off in `itemDiscount` beside it, so a
          // settled line still shows what it would have cost.
          lineTotal: item.lineTotal,
          itemDiscount: discountByLine.get(item.id) ?? "0.00",
          isAiGenerated: item.isAiGenerated,
          aiGenerationId: item.aiGenerationId,
          customizations: item.customizations as Record<string, unknown> | null,
        }));

        await tx.insert(orderItems).values(orderItemsToInsert);

        // Clear cart items (but keep saved for later items)
        await tx
          .delete(cartItems)
          .where(
            and(
              eq(cartItems.cartId, userCart.id),
              eq(cartItems.isSavedForLater, false)
            )
          );

        // Update cart totals
        await tx
          .update(carts)
          .set({
            itemCount: 0,
            subtotal: "0.00",
            lastActivityAt: new Date(),
          })
          .where(eq(carts.id, userCart.id));

        return createdOrder;
      });

      /**
       * The cart this order just emptied is cached for five minutes, and both
       * viewer variants of it (#511 final review, finding 4).
       *
       * Outside the transaction, deliberately: the cache is not transactional,
       * and dropping the entry before the rows are committed would leave the
       * next read to repopulate it from the pre-order state — the exact
       * staleness this is here to prevent.
       *
       * Without it, verifying payment invalidates the client's cart query,
       * `CartSync` refetches, and `GET /api/cart` answers out of the cache with
       * the items that were just bought: the customer lands on the success page
       * with a full cart badge and can order them again.
       */
      await invalidateCartCache(userCart.id);

      // Return created order
      return c.json(
        {
          message: "Order created successfully",
          order: {
            id: newOrder.id,
            orderNumber: newOrder.orderNumber,
            status: newOrder.status,
            paymentStatus: newOrder.paymentStatus,
            subtotal: newOrder.subtotal,
            shippingCost: newOrder.shippingCost,
            discount: newOrder.discount,
            promotionId: newOrder.promotionId,
            promotionDiscount: newOrder.promotionDiscount,
            tax: newOrder.tax,
            total: newOrder.total,
            itemCount: newOrder.itemCount,
            currency: newOrder.currency,
            createdAt: newOrder.createdAt,
          },
        },
        201
      );
    } catch (error) {
      console.error("Error creating order:", error);
      return c.json({ error: "Failed to create order" }, 500);
    }
  }
);

// ============================================================================
// GET /api/orders - List User Orders
// ============================================================================

ordersApp.get(
  "/",
  zValidator("query", listOrdersQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { page, pageSize, status } = c.req.valid("query");

    try {
      // Build where conditions
      const conditions = [eq(orders.userId, user.id)];

      if (status) {
        conditions.push(eq(orders.status, status));
      }

      // Calculate offset
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(...conditions));

      const total = countResult[0]?.count ?? 0;

      // Get orders with basic info
      const orderList = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          orderType: orders.orderType,
          subtotal: orders.subtotal,
          shippingCost: orders.shippingCost,
          discount: orders.discount,
          total: orders.total,
          itemCount: orders.itemCount,
          currency: orders.currency,
          shippingMethod: orders.shippingMethod,
          createdAt: orders.createdAt,
          paidAt: orders.paidAt,
          shippedAt: orders.shippedAt,
          deliveredAt: orders.deliveredAt,
        })
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset);

      return c.json({
        items: orderList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      console.error("Error fetching orders:", error);
      return c.json({ error: "Failed to fetch orders" }, 500);
    }
  }
);

// ============================================================================
// GET /api/orders/:id - Get Order by ID or Order Number
// ============================================================================

ordersApp.get("/:id", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  try {
    // Determine if ID is UUID or order number
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    // Build where condition
    const whereCondition = isUUID
      ? and(eq(orders.id, id), eq(orders.userId, user.id))
      : and(eq(orders.orderNumber, id), eq(orders.userId, user.id));

    // Get order with items
    const order = await db.query.orders.findFirst({
      where: whereCondition,
      with: {
        items: {
          with: {
            product: {
              columns: {
                id: true,
                slug: true,
                title: true,
                images: true,
              },
            },
            variant: {
              columns: {
                id: true,
                sizeLabel: true,
                widthInches: true,
                heightInches: true,
              },
            },
            frame: {
              columns: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Fetch reviews for products in this order by this user
    const productIds = order.items
      .map((item) => item.productId)
      .filter((id): id is string => id !== null);

    const userReviews =
      productIds.length > 0
        ? await db
            .select({
              id: reviews.id,
              productId: reviews.productId,
              status: reviews.status,
            })
            .from(reviews)
            .where(
              and(eq(reviews.userId, user.id), inArray(reviews.productId, productIds))
            )
        : [];

    // Create a map for quick lookup
    const reviewsByProductId = new Map(
      userReviews.map((r) => [r.productId, { id: r.id, status: r.status }])
    );

    // Fetch approvals for this order
    const approvals = await db
      .select({
        id: productionApprovals.id,
        orderItemId: productionApprovals.orderItemId,
        status: productionApprovals.status,
        approvalToken: productionApprovals.approvalToken,
        deadlineAt: productionApprovals.deadlineAt,
        approvedAt: productionApprovals.approvedAt,
        createdAt: productionApprovals.createdAt,
      })
      .from(productionApprovals)
      .where(eq(productionApprovals.orderId, order.id));

    // Return full order details
    return c.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      orderType: order.orderType,
      shippingAddress: order.shippingAddress,
      shippingDetails: order.shippingDetails,
      shippingMethod: order.shippingMethod,
      shippingCost: order.shippingCost,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount,
      promotionId: order.promotionId,
      promotionDiscount: order.promotionDiscount,
      // Tender, not a discount. Surfaces render it below the total.
      giftCardAmount: order.giftCardAmount,
      itemCount: order.itemCount,
      currency: order.currency,
      customerNotes: order.customerNotes,
      items: order.items.map((item) => ({
        id: item.id,
        snapshot: item.snapshot,
        unitPrice: item.unitPrice,
        framePrice: item.framePrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        isAiGenerated: item.isAiGenerated,
        customizations: item.customizations,
        isFulfilled: item.isFulfilled,
        product: item.product
          ? {
              id: item.product.id,
              slug: item.product.slug,
              title: item.product.title,
              images: item.product.images,
            }
          : null,
        variant: item.variant
          ? {
              id: item.variant.id,
              sizeLabel: item.variant.sizeLabel,
            }
          : null,
        frame: item.frame
          ? {
              id: item.frame.id,
              name: item.frame.name,
              type: item.frame.type,
            }
          : null,
        review: item.productId
          ? reviewsByProductId.get(item.productId) || null
          : null,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      approvals: approvals.map((a) => ({
        id: a.id,
        orderItemId: a.orderItemId,
        status: a.status,
        approvalToken: a.approvalToken,
        deadlineAt: a.deadlineAt,
        approvedAt: a.approvedAt,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching order:", error);
    return c.json({ error: "Failed to fetch order" }, 500);
  }
});

// ============================================================================
// POST /api/orders/:id/gift-card - Quote a gift card against this order
// ============================================================================

/**
 * What a card would cover on this order. Debits nothing.
 *
 * The customer is still deciding at this point, and may add or remove cards
 * freely. The figure returned is advisory: payment initiation re-clamps it
 * against the live balance under a row lock, because the quote can be hours
 * old by the time they pay.
 */
ordersApp.post(
  "/:id/gift-card",
  giftCardCodeRateLimit,
  zValidator("json", giftCardCodeSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);
    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    const order = await db.query.orders.findFirst({
      where: isUUID
        ? and(eq(orders.id, id), eq(orders.userId, user.id))
        : and(eq(orders.orderNumber, id), eq(orders.userId, user.id)),
    });

    // 404 rather than 403: whether someone else's order exists is not the
    // caller's business.
    if (!order) return c.json({ error: "Order not found" }, 404);

    try {
      const quote = await quoteGiftCard(
        c.req.valid("json").code,
        toPaise(order.total),
      );
      return c.json(quote);
    } catch (error) {
      if (error instanceof GiftCardError) {
        return c.json({ error: error.message }, 400);
      }
      console.error("Error quoting gift card:", error);
      return c.json({ error: "Failed to check gift card" }, 500);
    }
  },
);

// ============================================================================
// POST /api/orders/:id/payment - Initiate Payment
// ============================================================================

ordersApp.post("/:id/payment", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  /**
   * No early gateway check.
   *
   * An order fully covered by gift cards is charged nothing and creates no
   * Razorpay order at all, so refusing it here made the one journey that
   * needs no gateway depend on the gateway being configured (#578). The check
   * moved to where the gateway is actually used: inside the transaction,
   * once the remainder is known.
   */

  try {
    // Determine if ID is UUID or order number
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

    if (!isUUID && !isOrderNumber) {
      return c.json({ error: "Invalid order ID format" }, 400);
    }

    // Build where condition
    const whereCondition = isUUID
      ? and(eq(orders.id, id), eq(orders.userId, user.id))
      : and(eq(orders.orderNumber, id), eq(orders.userId, user.id));

    // Get order
    const order = await db.query.orders.findFirst({
      where: whereCondition,
    });

    if (!order) {
      return c.json({ error: "Order not found" }, 404);
    }

    // Check order status - only allow payment for pending orders
    if (order.paymentStatus === "paid") {
      return c.json({ error: "Order has already been paid" }, 400);
    }

    if (order.status === "cancelled") {
      return c.json({ error: "Cannot pay for a cancelled order" }, 400);
    }

    // Gift card codes the customer applied at checkout. Quoted earlier, but
    // the quote was advisory — the amounts are re-clamped under a row lock
    // below.
    const giftCardCodes = await readGiftCardCodes(c);

    /**
     * A gift card cannot be bought with a gift card. Now measured per line.
     *
     * Cycling balance between instruments turns every refund into a graph
     * traversal, so the rule stays — but `orderType === 'gift_card'` was only
     * ever a proxy for it, and a mixed order has no single type (#579). What
     * matters is how much of THIS order is stored value: tender may pay for
     * the posters and never for the cards.
     *
     * Refused outright when the whole order is cards, so the customer is told
     * why rather than watching their codes silently do nothing.
     */
    const orderTotalPaise = toPaise(order.total);
    const storedValuePaise =
      // The standalone /gift-cards flow: no line items at all, and the whole
      // order IS the card. Counting only lines here would have let a gift card
      // buy a gift card again, which is exactly what this rule forbids.
      order.orderType === "gift_card"
        ? orderTotalPaise
        : await sumGiftCardLinesPaise(order.id);

    const giftCardTenderCapPaise = Math.max(
      0,
      orderTotalPaise - storedValuePaise,
    );

    if (giftCardCodes.length > 0 && giftCardTenderCapPaise === 0) {
      return c.json(
        { error: "A gift card cannot be bought with a gift card" },
        400,
      );
    }

    // Check if there's an existing Razorpay order that's still valid
    const existingPaymentDetails = order.paymentDetails as OrderPaymentDetails | null;
    if (existingPaymentDetails?.orderId) {
      // Return existing Razorpay order if payment is still pending.
      // The amount is the remainder, not the total: gift cards already paid
      // part of this order, and quoting the total would show the customer a
      // figure they are not being charged.
      return c.json({
        razorpayOrderId: existingPaymentDetails.orderId,
        razorpayKeyId: getRazorpayKeyId(),
        amount: toPaise(order.total) - toPaise(order.giftCardAmount),
        currency: order.currency,
        orderNumber: order.orderNumber,
        orderId: order.id,
        prefill: {
          email: user.email || undefined,
          name: user.name || undefined,
        },
      });
    }

    /**
     * The debit, the tender record and the Razorpay order are one unit of
     * work.
     *
     * createRazorpayOrder is called INSIDE the transaction on purpose: if the
     * gateway fails, the gift card debit rolls back with it. Debiting first
     * and creating the payment afterwards would take the customer's balance
     * and leave them with nothing to pay against.
     */
    const payment = await db.transaction(async (tx) => {
      const applied = await redeemGiftCards(
        tx,
        order.id,
        giftCardCodes,
        // Not the order total: the cap excludes any gift card lines in it, so
        // tender pays for the posters and never for the cards (#579). On an
        // order with no gift card lines the two figures are the same.
        giftCardTenderCapPaise,
        user.id,
      );

      const giftCardPaise = applied.reduce(
        (sum, application) => sum + application.amountPaise,
        0,
      );
      const remainder = toPaise(order.total) - giftCardPaise;

      if (giftCardPaise > 0) {
        await tx
          .update(orders)
          .set({
            giftCardAmount: (giftCardPaise / 100).toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
      }

      // Exactly zero, never a threshold. A one-paisa remainder is still a
      // payment, and rounding it away would mark an order paid that was not.
      if (remainder === 0) {
        await tx
          .update(orders)
          .set({
            status: "confirmed",
            paymentStatus: "paid",
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        return { fullyCovered: true as const, giftCardPaise };
      }

      // Something is still owed, so a gateway is genuinely required. Throwing
      // inside the transaction rolls the gift card debit back with it: taking
      // a balance and leaving the customer nothing to pay the rest with is the
      // one outcome worth failing hard to avoid.
      if (!isRazorpayConfigured()) {
        throw new PaymentGatewayUnavailableError();
      }

      const razorpayOrder = await createRazorpayOrder({
        amount: remainder,
        currency: order.currency,
        receipt: order.id,
        notes: {
          orderNumber: order.orderNumber,
          orderId: order.id,
        },
      });

      return { fullyCovered: false as const, giftCardPaise, razorpayOrder };
    });

    if (payment.fullyCovered) {
      return c.json({
        fullyCoveredByGiftCard: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        giftCardAmount: (payment.giftCardPaise / 100).toFixed(2),
      });
    }

    const razorpayOrder = payment.razorpayOrder;

    // Update order with Razorpay order ID
    await db
      .update(orders)
      .set({
        status: "pending_payment",
        paymentDetails: {
          provider: "razorpay",
          orderId: razorpayOrder.id,
        } as OrderPaymentDetails,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    // Return payment details for frontend
    return c.json({
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: getRazorpayKeyId(),
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      orderNumber: order.orderNumber,
      orderId: order.id,
      prefill: {
        email: user.email || undefined,
        name: user.name || undefined,
      },
    });
  } catch (error) {
    if (error instanceof PaymentGatewayUnavailableError) {
      return c.json({ error: "Payment gateway not configured" }, 503);
    }
    if (error instanceof RazorpayError) {
      return c.json({ error: `Payment initiation failed: ${error.message}` }, 500);
    }
    return c.json({ error: "Failed to initiate payment" }, 500);
  }
});

// ============================================================================
// POST /api/orders/:id/payment/verify - Verify Payment
// ============================================================================

ordersApp.post(
  "/:id/payment/verify",
  zValidator("json", verifyPaymentSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.param();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = c.req.valid("json");

    try {
      // Determine if ID is UUID or order number
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const isOrderNumber = id.startsWith(ORDER_NUMBER_PREFIX);

      if (!isUUID && !isOrderNumber) {
        return c.json({ error: "Invalid order ID format" }, 400);
      }

      // Build where condition
      const whereCondition = isUUID
        ? and(eq(orders.id, id), eq(orders.userId, user.id))
        : and(eq(orders.orderNumber, id), eq(orders.userId, user.id));

      // Get order
      const order = await db.query.orders.findFirst({
        where: whereCondition,
      });

      if (!order) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Verify the Razorpay order ID matches
      const paymentDetails = order.paymentDetails as OrderPaymentDetails | null;
      if (paymentDetails?.orderId !== razorpayOrderId) {
        return c.json({ error: "Invalid payment order ID" }, 400);
      }

      // Verify payment signature
      const isValid = verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      if (!isValid) {
        // Update order with failed payment, and hand back any gift card
        // balance held for it. Payment initiation debited those cards; a
        // failed verification means the order is going nowhere, and holding
        // the balance would consume it silently — a card with less on it
        // looks exactly like one that was spent.
        await db.transaction(async (tx) => {
          await tx
            .update(orders)
            .set({
              paymentStatus: "failed",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await voidGiftCardHold(tx, order.id);
        });

        return c.json({ error: "Payment verification failed" }, 400);
      }

      // Update order to confirmed/paid status
      // Note: The webhook will also update this, but we update here for immediate response
      await db
        .update(orders)
        .set({
          status: "confirmed",
          paymentStatus: "paid",
          paymentDetails: {
            ...paymentDetails,
            paymentId: razorpayPaymentId,
            transactionId: razorpayPaymentId,
            capturedAt: new Date().toISOString(),
          } as OrderPaymentDetails,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      // A gift card order mints its card now, once the money is real. A
      // future send date is left for the delivery sweep: the code is
      // returned once and never stored, so a card created today could not be
      // emailed in three months. Failure here must not fail the payment —
      // the customer has paid, and an undelivered card is recoverable.
      if (order.orderType === "gift_card") {
        await deliverImmediateGiftCard(order.id).catch((error) => {
          console.error("Gift card delivery failed after payment:", error);
        });
      }

      return c.json({
        success: true,
        message: "Payment verified successfully",
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: "confirmed",
          paymentStatus: "paid",
        },
      });
    } catch (error) {
      return c.json({ error: "Failed to verify payment" }, 500);
    }
  }
);

// ============================================================================
// POST /api/orders/:orderId/items/:itemId/review - Create Review for Order Item
// ============================================================================

ordersApp.post(
  "/:orderId/items/:itemId/review",
  zValidator("json", createOrderReviewSchema),
  async (c) => {
    const user = c.get("user");
    const { orderId, itemId } = c.req.param();
    const { rating, title, content } = c.req.valid("json");

    try {
      // Validate UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(orderId) || !uuidRegex.test(itemId)) {
        return c.json({ error: "Invalid order or item ID" }, 400);
      }

      // Get order and verify ownership
      const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.userId, user.id)),
      });

      if (!order) {
        return c.json({ error: "Order not found" }, 404);
      }

      // Check order is delivered
      if (order.status !== "delivered") {
        return c.json(
          { error: "Reviews can only be submitted for delivered orders" },
          400
        );
      }

      // Get order item
      const orderItem = await db.query.orderItems.findFirst({
        where: and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)),
      });

      if (!orderItem) {
        return c.json({ error: "Order item not found" }, 404);
      }

      if (!orderItem.productId) {
        return c.json({ error: "Product no longer available" }, 400);
      }

      // Check for existing review
      const existingReview = await db
        .select({ id: reviews.id })
        .from(reviews)
        .where(
          and(eq(reviews.productId, orderItem.productId), eq(reviews.userId, user.id))
        )
        .limit(1);

      if (existingReview.length > 0) {
        return c.json({ error: "You have already reviewed this product" }, 409);
      }

      // Create review
      const [newReview] = await db
        .insert(reviews)
        .values({
          productId: orderItem.productId,
          userId: user.id,
          orderItemId: itemId,
          rating,
          title: title || null,
          content,
          status: "pending",
        })
        .returning();

      if (!newReview) {
        throw new Error("Failed to create review");
      }

      return c.json(
        {
          message: "Review submitted successfully",
          review: {
            id: newReview.id,
            rating: newReview.rating,
            title: newReview.title,
            content: newReview.content,
            status: newReview.status,
            orderItemId: newReview.orderItemId,
            createdAt: newReview.createdAt,
          },
        },
        201
      );
    } catch (error) {
      console.error("Error creating review:", error);
      return c.json({ error: "Failed to create review" }, 500);
    }
  }
);

// Export the router
export { ordersApp };
export default ordersApp;
