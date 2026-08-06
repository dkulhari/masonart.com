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

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, inArray, notInArray } from "drizzle-orm";

import { db } from "../database";
import {
  orders,
  orderItems,
  type OrderShippingAddress,
  type OrderItemSnapshot,
  type OrderPaymentDetails,
} from "../database/schema/orders";
import { carts, cartItems } from "../database/schema/cart";
import { productionApprovals } from "../database/schema/approvals";
import { reviews } from "../database/schema/reviews";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import type { Promotion } from "../database/schema/promotions";
import {
  getActivePromotions,
  loadPromotionProductSets,
  resolveSalePrice,
} from "../lib/promotion-pricing";
import { isGalleryMember } from "../services/gallery-membership";
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
const ORDER_NUMBER_PREFIX = "MA";

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
 * Generate a unique order number
 * Format: MA-YYYY-NNNNNN (e.g., MA-2024-000123)
 */
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${ORDER_NUMBER_PREFIX}-${year}-`;

  // Get the count of orders this year for sequential numbering
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.orderNumber} LIKE ${prefix + "%"}`);

  const count = (result[0]?.count ?? 0) + 1;
  const sequenceNumber = count.toString().padStart(6, "0");

  return `${prefix}${sequenceNumber}`;
}

/**
 * Calculate shipping cost based on method and subtotal
 */
function calculateShippingCost(
  method: string,
  subtotal: string
): string {
  const subtotalNum = parseFloat(subtotal);

  // Free shipping for orders over 2000 INR
  if (subtotalNum >= 2000) {
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

      // Validate all items are still available
      for (const item of activeItems) {
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
      // `subtotal` stays GROSS — the sum of base line totals, as it has always
      // been — and `total` subtracts the discount exactly once. Making subtotal
      // net while `total` still subtracts would take the promotion off twice,
      // and the free-shipping threshold below reads the same gross figure it
      // read before this feature existed. Interim, pending #510.
      const subtotal = activeItems.reduce((sum, item) => {
        return sum + parseFloat(item.lineTotal);
      }, 0);

      const subtotalStr = subtotal.toFixed(2);
      const shippingCost = calculateShippingCost(input.shippingMethod, subtotalStr);
      // Reserved for discount codes (design D8). Nothing here writes it.
      const couponDiscount = "0.00";
      // Derived, not assigned: composing the total from its two source columns
      // means the expression is already correct the day codes land.
      const discount = toMoney(
        parseFloat(promotionDiscount) + parseFloat(couponDiscount)
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
          snapshot: createItemSnapshot(
            item.product!,
            item.variant!,
            item.frame
          ),
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
// POST /api/orders/:id/payment - Initiate Payment
// ============================================================================

ordersApp.post("/:id/payment", async (c) => {
  const user = c.get("user");
  const { id } = c.req.param();

  // Check if Razorpay is configured
  if (!isRazorpayConfigured()) {
    return c.json({ error: "Payment gateway not configured" }, 503);
  }

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

    // Check if there's an existing Razorpay order that's still valid
    const existingPaymentDetails = order.paymentDetails as OrderPaymentDetails | null;
    if (existingPaymentDetails?.orderId) {
      // Return existing Razorpay order if payment is still pending
      return c.json({
        razorpayOrderId: existingPaymentDetails.orderId,
        razorpayKeyId: getRazorpayKeyId(),
        amount: toPaise(order.total),
        currency: order.currency,
        orderNumber: order.orderNumber,
        orderId: order.id,
        prefill: {
          email: user.email || undefined,
          name: user.name || undefined,
        },
      });
    }

    // Create a new Razorpay order
    const razorpayOrder = await createRazorpayOrder({
      amount: toPaise(order.total),
      currency: order.currency,
      receipt: order.id,
      notes: {
        orderNumber: order.orderNumber,
        orderId: order.id,
      },
    });

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
        // Update order with failed payment
        await db
          .update(orders)
          .set({
            paymentStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

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
