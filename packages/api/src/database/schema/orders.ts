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
import { relations } from "drizzle-orm";
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
    orderNumber: text("order_number").unique().notNull(), // Human-readable order ID (e.g., "MA-2024-001234")

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
