// Shipping options and order shipments database schema
// Part of the Shipping & Returns feature for chobii.art E-Commerce Platform

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  decimal,
  pgEnum,
  boolean,
  index,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { orders } from "./orders";
import { users } from "./users";
import { vendors } from "./vendors";

// ============================================================================
// Enums
// ============================================================================

/**
 * Shipment status enum for tracking order delivery lifecycle.
 *
 * Sorted as the work moves, not as the values were added: an NDR happens on a
 * delivery ATTEMPT so it sits before `delivered`, and the three ways a parcel
 * ends up somewhere other than the customer sit after it. The order matters
 * because `enumsortorder` is what a status filter sorts by.
 *
 * `failed` is a failed DELIVERY and always was — it is NOT a voided label.
 * `cancelled` is the voided one. Keeping them apart is why this type grew:
 * `order_shipments` had no way to say "this label is dead", so
 * `lib/vendor-scope.ts` had to guess the live label by recency and a vendor who
 * reloaded could be handed a PDF the courier would not honour.
 */
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending", // Shipment created, awaiting label
  "label_created", // Shipping label generated
  "shipped", // Package handed to carrier
  "in_transit", // Package in transit
  "out_for_delivery", // Out for final delivery
  "undelivered", // NDR: an attempt failed, the courier is holding it
  "delivered", // Successfully delivered
  "rto_initiated", // On its way back to the pickup location
  "rto_delivered", // Back at the pickup location
  "lost", // The courier cannot account for it
  "cancelled", // The label was voided, or the shipment cancelled
  "failed", // Delivery failed
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Shipping options table - configurable shipping methods
 * Stores available shipping options with carriers and pricing
 */
export const shippingOptions = pgTable(
  "shipping_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(), // e.g., "Standard Shipping", "Express"
    carrier: varchar("carrier", { length: 100 }).notNull(), // e.g., "USPS", "FedEx", "UPS", "Delhivery"
    description: text("description"),
    baseCost: decimal("base_cost", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    estimatedDaysMin: integer("estimated_days_min").notNull(), // Minimum delivery days
    estimatedDaysMax: integer("estimated_days_max").notNull(), // Maximum delivery days
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(), // For display ordering

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    isActiveIdx: index("shipping_options_is_active_idx").on(table.isActive),
    sortOrderIdx: index("shipping_options_sort_order_idx").on(table.sortOrder),
  })
);

/**
 * Order shipments table - tracks shipment details for orders
 * Links orders to their shipping status and tracking information
 */
export const orderShipments = pgTable(
  "order_shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    shippingOptionId: uuid("shipping_option_id").references(
      () => shippingOptions.id,
      { onDelete: "set null" }
    ),

    // Tracking information
    trackingNumber: varchar("tracking_number", { length: 100 }),
    carrier: varchar("carrier", { length: 100 }).notNull(),
    trackingUrl: varchar("tracking_url", { length: 500 }),

    // Status
    status: shipmentStatusEnum("status").default("pending").notNull(),

    // Timestamps for shipment lifecycle
    shippedAt: timestamp("shipped_at"),
    estimatedDeliveryAt: timestamp("estimated_delivery_at"),
    deliveredAt: timestamp("delivered_at"),

    // Admin notes
    notes: text("notes"),

    // ------------------------------------------------------------------
    // Dispatch (order-dispatch-tracking)
    //
    // Every one of these is nullable. `POST /admin/orders/:orderId/ship`
    // opens a row before any label is bought, and that is an ordinary state.
    // ------------------------------------------------------------------

    /**
     * The identity-free handle on this shipment's label object.
     *
     * The object lives at `fulfilment/labels/<token>.pdf` and the token rides
     * in the PATH of a signed URL — the one place an assertion about JSON keys
     * can never reach. So it is RANDOM, following the
     * `production_approvals.approval_token` precedent, and NEVER the order id,
     * which is a stable person-linked handle.
     *
     * `text`, not `uuid`: `LABEL_TOKEN_PATTERN` in `lib/vendor-scope.ts` admits
     * any `[A-Za-z0-9_-]+`, so typing it as a uuid would forbid the base64url
     * tokens that pattern was written for.
     *
     * Unique across the table: two orders resolving to one object key means
     * one customer's address handed to the other's vendor.
     */
    labelObjectToken: text("label_object_token").unique(),

    /**
     * This label is dead — voided, or the shipment cancelled.
     *
     * The marker `lib/vendor-scope.ts` asks for by name. Before it,
     * `getVendorJobLabelKey` chose the live label by recency because the table
     * had no way to say which one a courier would still honour, so a vendor who
     * reloaded could be handed either.
     */
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedReason: text("voided_reason"),

    /** The courier's own handle on the parcel. */
    awbNumber: varchar("awb_number", { length: 64 }),
    /** The aggregator's ids, so a support call can be traced in both directions. */
    externalShipmentId: varchar("external_shipment_id", { length: 64 }),
    externalOrderId: varchar("external_order_id", { length: 64 }),
    /**
     * Who actually carries it, which is not `carrier`.
     *
     * `carrier` is the aggregator we bought through (Shiprocket). This is the
     * courier it picked (Delhivery, Bluedart). Collapsing them loses the only
     * name a customer recognises on a tracking page.
     */
    courierName: varchar("courier_name", { length: 100 }),

    /** What actually went out, which is not what the cart estimated. */
    shippedWeightGrams: integer("shipped_weight_grams"),
    lengthCm: integer("length_cm"),
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),

    /**
     * What WE paid, in paise.
     *
     * Not what the customer paid. Shipping is baked into the item price and the
     * customer is charged ₹0 for it, so this is the only number margin can be
     * computed from. Paise because it is a real cost, unlike
     * `shipping_config`'s displayed rupee figures.
     */
    costPaise: integer("cost_paise"),

    /**
     * The consolidating vendor, whose address is the pickup location.
     *
     * `restrict`, matching `production_jobs.vendor_id`: a vendor who has
     * despatched an order cannot be deleted out from under the record of where
     * the courier collected the parcel.
     */
    pickupVendorId: uuid("pickup_vendor_id").references(() => vendors.id, {
      onDelete: "restrict",
    }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orderIdIdx: index("order_shipments_order_id_idx").on(table.orderId),
    statusIdx: index("order_shipments_status_idx").on(table.status),
    trackingNumberIdx: index("order_shipments_tracking_number_idx").on(
      table.trackingNumber
    ),
    pickupVendorIdIdx: index("order_shipments_pickup_vendor_id_idx").on(
      table.pickupVendorId
    ),

    /**
     * At most ONE live labelled shipment per order.
     *
     * `order_id` is a plain indexed FK, so an order whose label was voided and
     * re-bought carries several rows. Without this, "which label will the
     * courier honour" is answered by whichever row the planner reached first —
     * and a vendor who reloads their label page gets a different PDF.
     *
     * Partial on BOTH predicates, not one. Dropping `voided_at IS NULL` makes
     * it a blanket unique that refuses the re-buy after a void, so voiding a
     * label would permanently prevent buying another. Dropping
     * `label_object_token IS NOT NULL` refuses the second unlabelled row, and
     * `POST /admin/orders/:orderId/ship` opens exactly those.
     *
     * The predicate is timestamp and null tests and names no enum value on
     * purpose: 0026 added five `shipment_status` values, `drizzle-kit migrate`
     * replays the whole pending batch in ONE transaction, and any use of a new
     * value here would die on a fresh database with "unsafe use of new value"
     * even though it lives in a different migration file. See
     * tests/database/migration-enum-literals.test.ts.
     */
    liveLabelIdx: uniqueIndex("order_shipments_live_label_idx")
      .on(table.orderId)
      .where(
        sql`${table.voidedAt} IS NULL AND ${table.labelObjectToken} IS NOT NULL`
      ),
  })
);

/**
 * Shipping configuration table - admin-editable shipping money rules.
 *
 * Mirrors `walletPricingConfig` (schema/wallet.ts) rather than inventing a
 * second config shape: key / integer value / effective window / description /
 * `createdBy` audit reference.
 *
 * ## Effective dating is kept, and honoured on read
 *
 * `effectiveFrom` / `effectiveTo` are not decoration. A threshold that moves at
 * a scheduled time is the ordinary case for a sale weekend, and the reader
 * (`lib/shipping-config.ts`) resolves the row against the caller's clock and
 * clamps its cache to the next boundary, so a value scheduled for Friday takes
 * effect on Friday with nothing to run and nothing to purge. Storing a future
 * value that reads ignored would be worse than having no column at all.
 *
 * ## Values are whole rupees
 *
 * `walletPricingConfig` stores money in paise, but the wallet's figures are
 * derived (a markup applied to an API cost) where a paisa matters. This one is
 * a *displayed* figure — the same number the storefront prints as "Free
 * shipping on orders over ₹999" — and every consumer compares it against a
 * rupee amount. Keeping the stored unit identical to
 * `FREE_SHIPPING_THRESHOLD`'s makes the fallback a literal substitution with no
 * unit hop for the admin form (#570) or a future reader to get wrong by 100x.
 */
export const shippingConfig = pgTable(
  "shipping_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Configuration key (see SHIPPING_CONFIG_KEYS)
    key: text("key").notNull(),

    // Integer value, in whole rupees for money keys
    valueInt: integer("value_int").notNull(),

    // Description of the config
    description: text("description"),

    // Effective dates for scheduled changes
    effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
    effectiveTo: timestamp("effective_to"),

    // Who created this config
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    keyIdx: index("shipping_config_key_idx").on(table.key),
    effectiveIdx: index("shipping_config_effective_idx").on(
      table.effectiveFrom,
      table.effectiveTo
    ),
    uniqueKeyEffective: unique("shipping_config_unique_key_effective").on(
      table.key,
      table.effectiveFrom
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Shipping options relations
 */
export const shippingOptionsRelations = relations(
  shippingOptions,
  ({ many }) => ({
    shipments: many(orderShipments),
  })
);

/**
 * Order shipments relations
 */
export const orderShipmentsRelations = relations(orderShipments, ({ one }) => ({
  order: one(orders, {
    fields: [orderShipments.orderId],
    references: [orders.id],
  }),
  shippingOption: one(shippingOptions, {
    fields: [orderShipments.shippingOptionId],
    references: [shippingOptions.id],
  }),
}));

/**
 * Shipping config relations - who last set a value, for the admin screen (#570)
 */
export const shippingConfigRelations = relations(shippingConfig, ({ one }) => ({
  creator: one(users, {
    fields: [shippingConfig.createdBy],
    references: [users.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type ShippingOption = typeof shippingOptions.$inferSelect;
export type NewShippingOption = typeof shippingOptions.$inferInsert;

export type OrderShipment = typeof orderShipments.$inferSelect;
export type NewOrderShipment = typeof orderShipments.$inferInsert;

export type ShippingConfig = typeof shippingConfig.$inferSelect;
export type NewShippingConfig = typeof shippingConfig.$inferInsert;

export type ShipmentStatus = (typeof shipmentStatusEnum.enumValues)[number];

/**
 * Config keys and their defaults live in `src/lib/shipping-config.ts`, not
 * here beside the table the way `WALLET_CONFIG_KEYS` does.
 *
 * The default has to be `FREE_SHIPPING_THRESHOLD` itself rather than a second
 * literal, and `@chobii/shared` is ESM-only (no `require` condition in its
 * exports map). drizzle-kit loads this schema through a CJS loader, so a *value*
 * import from shared here breaks `drizzle-kit generate` outright — which is why
 * schema/products.ts imports only erasable types from it.
 */
