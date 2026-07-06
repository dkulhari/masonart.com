// Shipping options and order shipments database schema
// Part of the Shipping & Returns feature for MasonArt E-Commerce Platform

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
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { orders } from "./orders";

// ============================================================================
// Enums
// ============================================================================

/**
 * Shipment status enum for tracking order delivery lifecycle
 */
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending", // Shipment created, awaiting label
  "label_created", // Shipping label generated
  "shipped", // Package handed to carrier
  "in_transit", // Package in transit
  "out_for_delivery", // Out for final delivery
  "delivered", // Successfully delivered
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
    baseCost: decimal("base_cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
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
    shippingOptionId: uuid("shipping_option_id").references(() => shippingOptions.id, {
      onDelete: "set null",
    }),

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
    trackingNumberIdx: index("order_shipments_tracking_number_idx").on(table.trackingNumber),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Shipping options relations
 */
export const shippingOptionsRelations = relations(shippingOptions, ({ many }) => ({
  shipments: many(orderShipments),
}));

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

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type ShippingOption = typeof shippingOptions.$inferSelect;
export type NewShippingOption = typeof shippingOptions.$inferInsert;

export type OrderShipment = typeof orderShipments.$inferSelect;
export type NewOrderShipment = typeof orderShipments.$inferInsert;

export type ShipmentStatus = (typeof shipmentStatusEnum.enumValues)[number];
