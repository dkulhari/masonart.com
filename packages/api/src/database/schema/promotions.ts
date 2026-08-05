/**
 * Sale promotions.
 *
 * Active state is derived, never stored: `isEnabled && now in [startsAt, endsAt)`.
 * A stored status column would need a job to flip it and would be wrong for the
 * window between the sale ending and the job running.
 *
 * `endsAt` is private. Only the resolved countdown deadline crosses the wire —
 * see lib/promotion-pricing.ts and the countdown resolver.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { users } from "./users";

// ============================================================================
// Enums
// ============================================================================

export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed",
]);

export const promotionScopeEnum = pgEnum("promotion_scope", [
  "all",
  "filter",
  "products",
]);

export const countdownModeEnum = pgEnum("countdown_mode", ["real", "rolling"]);

// ============================================================================
// Tables
// ============================================================================

export const promotions = pgTable(
  "promotion",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /** Internal label, e.g. "Summer Sale 2026". Never rendered. */
    name: text("name").notNull(),

    /** Customer-facing, e.g. "SUMMER SALE — 40% OFF EVERYTHING". */
    headline: text("headline").notNull(),

    discountType: discountTypeEnum("discount_type").notNull(),

    /** Percent when type='percentage', paise when type='fixed'. */
    discountValue: integer("discount_value").notNull(),

    scopeType: promotionScopeEnum("scope_type").notNull(),

    /** { styles: [], subjects: [], rooms: [], isFeatured: bool } when scopeType='filter'. */
    scopeFilter: jsonb("scope_filter"),

    membersOnly: boolean("members_only").default(true).notNull(),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),

    /** Null = open-ended. PRIVATE: never serialized to the storefront. */
    endsAt: timestamp("ends_at", { withTimezone: true }),

    isEnabled: boolean("is_enabled").default(false).notNull(),

    /** Highest wins when two promotions overlap. Promotions never stack. */
    priority: integer("priority").default(0).notNull(),

    perCustomerOrderLimit: integer("per_customer_order_limit"),

    countdownMode: countdownModeEnum("countdown_mode")
      .default("rolling")
      .notNull(),
    rollingWindowMinutes: integer("rolling_window_minutes")
      .default(720)
      .notNull(),
    rollingJitterMinutes: integer("rolling_jitter_minutes")
      .default(90)
      .notNull(),

    createdBy: text("created_by").references(() => users.id),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    activeIdx: index("promotion_active_idx").on(
      table.isEnabled,
      table.startsAt,
      table.endsAt
    ),
    priorityIdx: index("promotion_priority_idx").on(table.priority),
  })
);

export const promotionProducts = pgTable(
  "promotion_product",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.promotionId, table.productId] }),
    productIdx: index("promotion_product_product_idx").on(table.productId),
  })
);

/** Always wins, whatever the scope. */
export const promotionExclusions = pgTable(
  "promotion_exclusion",
  {
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.promotionId, table.productId] }),
    productIdx: index("promotion_exclusion_product_idx").on(table.productId),
  })
);

// ============================================================================
// Relations
// ============================================================================

export const promotionsRelations = relations(promotions, ({ many }) => ({
  includedProducts: many(promotionProducts),
  exclusions: many(promotionExclusions),
}));

export const promotionProductsRelations = relations(
  promotionProducts,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotionProducts.promotionId],
      references: [promotions.id],
    }),
    product: one(products, {
      fields: [promotionProducts.productId],
      references: [products.id],
    }),
  })
);

export const promotionExclusionsRelations = relations(
  promotionExclusions,
  ({ one }) => ({
    promotion: one(promotions, {
      fields: [promotionExclusions.promotionId],
      references: [promotions.id],
    }),
    product: one(products, {
      fields: [promotionExclusions.productId],
      references: [products.id],
    }),
  })
);

// ============================================================================
// Types
// ============================================================================

export type Promotion = typeof promotions.$inferSelect;
export type NewPromotion = typeof promotions.$inferInsert;
export type PromotionProduct = typeof promotionProducts.$inferSelect;
export type NewPromotionProduct = typeof promotionProducts.$inferInsert;
export type PromotionExclusion = typeof promotionExclusions.$inferSelect;
export type NewPromotionExclusion = typeof promotionExclusions.$inferInsert;
