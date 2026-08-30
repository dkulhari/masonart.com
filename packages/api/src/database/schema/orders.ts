// Orders and order items database schema for the Poster & Frame E-Commerce Platform
// Following the patterns defined in docs/poster-app-tech-stack.md

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  decimal,
  jsonb,
  pgEnum,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, addresses } from "./users";
import { products, productVariants, frames } from "./products";
import { promotions } from "./promotions";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Shipping address snapshot stored with order (immutable copy)
 */
export interface OrderShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
}

/**
 * Payment details stored with order
 */
export interface OrderPaymentDetails {
  provider: "razorpay" | "stripe";
  transactionId?: string;
  orderId?: string; // Provider's order ID
  paymentId?: string; // Provider's payment ID
  method?: string; // card, upi, netbanking, wallet
  lastFourDigits?: string; // For card payments
  bankName?: string; // For netbanking
  walletName?: string; // For wallet payments
  capturedAt?: string; // ISO timestamp
  refundedAt?: string; // ISO timestamp
  refundId?: string;
  refundAmount?: number;
}

/**
 * Shipping details for order fulfillment
 */
export interface OrderShippingDetails {
  carrier?: string; // e.g., "Shiprocket", "Delhivery"
  trackingNumber?: string;
  trackingUrl?: string;
  awbNumber?: string; // Air Waybill number
  shipmentId?: string;
  estimatedDelivery?: string; // ISO date
  shippedAt?: string; // ISO timestamp
  deliveredAt?: string; // ISO timestamp
}

/**
 * What a gift card order bought.
 *
 * Lives on the order between payment and delivery, because a scheduled card
 * is not minted until the day it is sent — see `orders.giftCardPurchase`.
 */
export interface GiftCardPurchase {
  amountPaise: number;
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  message: string | null;
  /** ISO timestamp; null means deliver as soon as payment is confirmed. */
  sendAt: string | null;
}

/**
 * Order item snapshot - product details at time of purchase
 */
export interface OrderItemSnapshot {
  title: string;
  sku: string;
  sizeLabel: string;
  widthInches: number;
  heightInches: number;
  frameName?: string;
  frameType?: string;
  imageUrl?: string;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * Order status enum for order lifecycle management
 */
export const orderStatusEnum = pgEnum("order_status", [
  "pending", // Order created, awaiting payment
  "pending_payment", // Payment initiated but not confirmed
  "confirmed", // Payment confirmed, order accepted
  "processing", // Order being prepared/printed
  "shipped", // Order dispatched
  "out_for_delivery", // With delivery partner
  "delivered", // Successfully delivered
  "cancelled", // Order cancelled
  "refund_requested", // Customer requested refund
  "refunded", // Refund processed
  "failed", // Order failed (payment failed, etc.)
]);

/**
 * Payment status enum for payment tracking
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", // Awaiting payment
  "processing", // Payment in progress
  "paid", // Payment successful
  "failed", // Payment failed
  "refunded", // Full refund processed
  "partially_refunded", // Partial refund processed
  "cancelled", // Payment cancelled
]);

/**
 * Order type enum
 */
export const orderTypeEnum = pgEnum("order_type", [
  "regular", // Standard product order
  "ai_generated", // AI-generated poster order
  "trade", // Trade program order (wholesale)
  "gift_card", // Buys a gift card; no shipping, no tax, not from the cart
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Orders table - main order records
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").unique().notNull(), // Human-readable order ID (e.g., "CA-2026-001234")

    // Customer info
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }), // null for guest checkout
    guestEmail: text("guest_email"), // Email for guest orders
    guestPhone: text("guest_phone"), // Phone for guest orders

    // Order status
    status: orderStatusEnum("status").default("pending").notNull(),
    orderType: orderTypeEnum("order_type").default("regular").notNull(),

    // Payment info
    paymentStatus: paymentStatusEnum("payment_status").default("pending").notNull(),
    paymentDetails: jsonb("payment_details").$type<OrderPaymentDetails>(),

    // Shipping address (immutable snapshot)
    shippingAddress: jsonb("shipping_address")
      .$type<OrderShippingAddress>()
      .notNull(),
    billingAddressId: uuid("billing_address_id").references(() => addresses.id, {
      onDelete: "set null",
    }),

    // Shipping details
    shippingDetails: jsonb("shipping_details").$type<OrderShippingDetails>(),
    shippingMethod: text("shipping_method"), // e.g., "standard", "express"
    shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    // Pricing breakdown
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(), // Sum of item prices
    discount: decimal("discount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).default("0.00").notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(), // Final amount

    // Coupon/discount tracking
    couponCode: text("coupon_code"),
    couponDiscount: decimal("coupon_discount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    /**
     * Which promotion priced this order. Nullable: most orders carry none.
     * Recorded so the discount is visible in reporting rather than buried in
     * an inflated compare-at price.
     */
    promotionId: uuid("promotion_id").references(() => promotions.id, {
      onDelete: "set null",
    }),

    /**
     * The promotion's own share of the discount. Deliberately NOT merged into
     * `discount` or `couponDiscount`: `discount` is the derived total the
     * customer sees, and `couponDiscount` is reserved for codes (design D8).
     * Sharing one column makes a settled order unattributable — reporting
     * could not separate an automatic sale from a leaked code.
     */
    promotionDiscount: decimal("promotion_discount", {
      precision: 10,
      scale: 2,
    })
      .default("0.00")
      .notNull(),

    // Trade discount (for trade program members)
    tradeDiscount: decimal("trade_discount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    /**
     * Gift card tender applied to this order, in rupees.
     *
     * NOT a discount. It sits here, below every discount bucket, because that
     * is where it sits in the money path (sale-promotions design §5):
     *
     *   subtotal - promotionDiscount - couponDiscount + shipping + tax = total
     *   total - giftCardAmount = what Razorpay is asked for
     *
     * So it is never summed into `discount` — that column is the derived total
     * of the discount buckets above — and never becomes a fourth bucket
     * beside couponDiscount / promotionDiscount / tradeDiscount. A discount
     * reduces the price before tax; tender reduces what is charged after it.
     *
     * The charged amount stays derived rather than stored:
     *   toPaise(total) - toPaise(giftCardAmount)
     * Persisting it too would give two sources of truth for what is owed.
     */
    giftCardAmount: decimal("gift_card_amount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    /**
     * What a `gift_card` order bought, held until the card is minted.
     *
     * A scheduled card is deliberately not created when payment clears. The
     * plaintext code is returned once by `issueGiftCard()` and never stored,
     * so a card minted in March for a June send date would have no
     * recoverable code when June arrives — minting happens at delivery time
     * instead, and the sweep reads the recipient from here.
     *
     * Null on every ordinary order.
     */
    giftCardPurchase: jsonb("gift_card_purchase").$type<GiftCardPurchase>(),

    // Currency (for future multi-currency support)
    currency: text("currency").default("INR").notNull(),

    // Item count (denormalized for performance)
    itemCount: integer("item_count").default(0).notNull(),

    // Notes
    customerNotes: text("customer_notes"), // Notes from customer
    internalNotes: text("internal_notes"), // Notes for admin/staff

    // Tracking token (for guest order tracking links)
    trackingToken: text("tracking_token").unique(), // UUID-like token for email links
    trackingTokenExpiresAt: timestamp("tracking_token_expires_at"), // Optional expiration

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    paidAt: timestamp("paid_at"),
    shippedAt: timestamp("shipped_at"),
    deliveredAt: timestamp("delivered_at"),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    orderNumberIdx: index("orders_order_number_idx").on(table.orderNumber),
    userIdIdx: index("orders_user_id_idx").on(table.userId),
    statusIdx: index("orders_status_idx").on(table.status),
    paymentStatusIdx: index("orders_payment_status_idx").on(table.paymentStatus),
    createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
    guestEmailIdx: index("orders_guest_email_idx").on(table.guestEmail),
    trackingTokenIdx: index("orders_tracking_token_idx").on(table.trackingToken),
    /**
     * The gift card delivery sweep (`services/gift-card-delivery.ts`) runs
     * every five minutes and asks: which paid gift card orders are due and
     * have no card yet? Without this it scans all of `orders` — the largest
     * table here and one that only grows — to find the fraction of a percent
     * that are gift cards.
     *
     * Partial on `order_type = 'gift_card'` for that reason, and on
     * `payment_status = 'paid'` because an unpaid gift card order is never
     * due. Both are constants in the sweep's WHERE clause, so the planner can
     * prove the predicate holds.
     *
     * The send date is deliberately *not* in the index. Indexing
     * `(gift_card_purchase ->> 'sendAt')::timestamptz` is impossible —
     * text-to-timestamptz is STABLE, not IMMUTABLE, and Postgres rejects it
     * with "functions in index expression must be marked IMMUTABLE". Indexing
     * the raw text instead would only work while every stored `sendAt` shares
     * one ISO format, which is a property of past input, not a guarantee. The
     * date is filtered from the heap; the subset reached is already tiny.
     *
     * Measured at 200k orders (~0.5% gift cards): 17.1ms sequential scan to
     * 6.3ms bitmap scan, index 48kB. An `INCLUDE (gift_card_purchase)` gets
     * it to 1.2ms with an index-only scan, but drizzle-kit cannot express
     * INCLUDE, and a hand-edited migration would drift from this file every
     * time anyone regenerates.
     */
    giftCardDeliveryIdx: index("orders_gift_card_delivery_idx")
      .on(table.id)
      .where(
        // NOT `order_type = 'gift_card'`, deliberately. That enum value is
        // added by migration 0011, drizzle-kit applies the whole batch in one
        // transaction, and Postgres refuses to USE a new enum value in the
        // transaction that added it — so a predicate naming it makes the chain
        // unappliable to any fresh database (#580). This selects the same rows.
        sql`${table.giftCardPurchase} IS NOT NULL AND ${table.paymentStatus} = 'paid'`,
      ),
  })
);

/**
 * Order items table - individual line items in an order
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),

    // Product references (nullable for data retention if product deleted)
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    frameId: uuid("frame_id").references(() => frames.id, {
      onDelete: "set null",
    }),

    // Product snapshot (immutable copy of product details at purchase time)
    snapshot: jsonb("snapshot").$type<OrderItemSnapshot>().notNull(),

    /**
     * What is being bought, on a gift card line. Null on a product line.
     *
     * `orders.giftCardPurchase` carries the same shape for an order that is
     * nothing but a gift card, which is how the standalone `/gift-cards` flow
     * still works. A mixed order has no single answer — it can hold several
     * cards alongside posters — so the purchase lives on the line that is
     * actually being bought (#579). Delivery reads both.
     */
    giftCardPurchase: jsonb("gift_card_purchase").$type<GiftCardPurchase>(),

    // Pricing at time of purchase
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // Price per unit (variant + frame)
    framePrice: decimal("frame_price", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    quantity: integer("quantity").default(1).notNull(),
    lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(), // unitPrice * quantity

    // Discount applied to this item
    itemDiscount: decimal("item_discount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    // AI generation reference (for AI-generated posters)
    aiGenerationId: uuid("ai_generation_id"),
    isAiGenerated: boolean("is_ai_generated").default(false).notNull(),

    // Personalization/customization options (stored as JSON)
    customizations: jsonb("customizations").$type<Record<string, unknown>>(),

    // Item status (for partial fulfillment scenarios)
    isFulfilled: boolean("is_fulfilled").default(false).notNull(),
    fulfilledAt: timestamp("fulfilled_at"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orderIdIdx: index("order_items_order_id_idx").on(table.orderId),
    productIdIdx: index("order_items_product_id_idx").on(table.productId),
    variantIdIdx: index("order_items_variant_id_idx").on(table.variantId),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Orders relations
 */
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  billingAddress: one(addresses, {
    fields: [orders.billingAddressId],
    references: [addresses.id],
  }),
  items: many(orderItems),
}));

/**
 * Order items relations
 */
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  frame: one(frames, {
    fields: [orderItems.frameId],
    references: [frames.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type OrderType = (typeof orderTypeEnum.enumValues)[number];
