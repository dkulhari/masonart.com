// Cart and cart items database schema for the Poster & Frame E-Commerce Platform
// Following the patterns defined in docs/poster-app-tech-stack.md

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  decimal,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { products, productVariants, frames } from "./products";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cart item customization options stored as JSONB
 */
export interface CartItemCustomizations {
  matWidth?: number; // Mat border width in inches
  matColor?: string; // Mat color (if applicable)
  mountingStyle?: string; // e.g., "mounted", "unmounted"
  glazingType?: string; // e.g., "glass", "acrylic", "museum-glass"
  notes?: string; // Custom notes from customer
}

/**
 * AI generation details for AI-generated cart items
 */
export interface CartItemAIDetails {
  generationId: string;
  prompt: string;
  stylePreset?: string;
  thumbnailUrl?: string;
}

// ============================================================================
// Tables
// ============================================================================

/**
 * Carts table - Shopping cart for users and guests
 * Supports both authenticated users and guest sessions
 */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Owner identification (either userId OR sessionId)
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id"), // For guest carts (anonymous session token)

    // Cart status
    isActive: boolean("is_active").default(true).notNull(),

    // Currency for pricing consistency
    currency: text("currency").default("INR").notNull(),

    // Denormalized totals for performance (recalculated on item changes)
    itemCount: integer("item_count").default(0).notNull(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).default("0.00").notNull(),

    // Coupon/discount applied to cart
    couponCode: text("coupon_code"),
    couponDiscount: decimal("coupon_discount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    // Expiration for abandoned cart cleanup (guests only)
    expiresAt: timestamp("expires_at"),

    // Last activity tracking for abandoned cart emails
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("carts_user_id_idx").on(table.userId),
    sessionIdIdx: index("carts_session_id_idx").on(table.sessionId),
    activeIdx: index("carts_active_idx").on(table.isActive),
    expiresAtIdx: index("carts_expires_at_idx").on(table.expiresAt),
    lastActivityAtIdx: index("carts_last_activity_at_idx").on(table.lastActivityAt),
  })
);

/**
 * Cart items table - Individual items in a shopping cart
 */
export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .references(() => carts.id, { onDelete: "cascade" })
      .notNull(),

    // Product references
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    variantId: uuid("variant_id")
      .references(() => productVariants.id, { onDelete: "cascade" })
      .notNull(),

    // Optional frame selection
    frameId: uuid("frame_id").references(() => frames.id, {
      onDelete: "set null",
    }),

    // Quantity
    quantity: integer("quantity").default(1).notNull(),

    // Pricing at time of adding to cart (for comparison/validation)
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(), // Variant base price
    framePrice: decimal("frame_price", { precision: 10, scale: 2 }).default("0.00").notNull(), // Frame price addition
    lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(), // (unitPrice + framePrice) * quantity

    // AI generation reference (for AI-generated posters)
    isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
    aiGenerationId: uuid("ai_generation_id"),
    aiDetails: jsonb("ai_details").$type<CartItemAIDetails>(),

    // Customization options
    customizations: jsonb("customizations").$type<CartItemCustomizations>(),

    // Reserved inventory flag (for checkout hold)
    isReserved: boolean("is_reserved").default(false).notNull(),
    reservedUntil: timestamp("reserved_until"),

    // Saved for later feature
    isSavedForLater: boolean("is_saved_for_later").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    cartIdIdx: index("cart_items_cart_id_idx").on(table.cartId),
    productIdIdx: index("cart_items_product_id_idx").on(table.productId),
    variantIdIdx: index("cart_items_variant_id_idx").on(table.variantId),
    frameIdIdx: index("cart_items_frame_id_idx").on(table.frameId),
    savedForLaterIdx: index("cart_items_saved_for_later_idx").on(
      table.cartId,
      table.isSavedForLater
    ),
    reservedUntilIdx: index("cart_items_reserved_until_idx").on(table.reservedUntil),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Carts relations
 */
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  items: many(cartItems),
}));

/**
 * Cart items relations
 */
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
  frame: one(frames, {
    fields: [cartItems.frameId],
    references: [frames.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type Cart = typeof carts.$inferSelect;
export type NewCart = typeof carts.$inferInsert;

export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
