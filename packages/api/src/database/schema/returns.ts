// Return policies and return requests database schema
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
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { orders } from "./orders";
import { users } from "./users";
import { giftCards } from "./gift-cards";

// ============================================================================
// Enums
// ============================================================================

/**
 * Return reason enum - reasons customers can select for returns
 */
export const returnReasonEnum = pgEnum("return_reason", [
  "defective", // Product arrived damaged/defective
  "wrong_item", // Received wrong item
  "not_as_described", // Product not as described
  "changed_mind", // Customer changed their mind
  "other", // Other reason (details in reasonDetails)
]);

/**
 * Return status enum - lifecycle of a return request
 */
export const returnStatusEnum = pgEnum("return_status", [
  "pending", // Return requested, awaiting review
  "approved", // Return approved, awaiting shipment
  "rejected", // Return rejected
  "shipped_back", // Customer shipped item back
  "received", // Returned item received
  "refunded", // Refund processed
  "closed", // Return case closed
]);

/**
 * Refund type enum - how refunds are processed
 */
export const refundTypeEnum = pgEnum("refund_type", [
  "full", // Full refund
  "partial", // Partial refund
  "store_credit", // Store credit instead of refund
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Return policies table - configurable return policies
 * Defines the rules for accepting returns
 */
export const returnPolicies = pgTable(
  "return_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(), // e.g., "Standard Return Policy"
    description: text("description"),
    daysAllowed: integer("days_allowed").notNull(), // Days within which returns are allowed
    conditionRequired: varchar("condition_required", { length: 255 }), // e.g., "unopened", "unused"
    refundType: refundTypeEnum("refund_type").default("full").notNull(),
    refundPercentage: integer("refund_percentage").default(100).notNull(), // 1-100
    isActive: boolean("is_active").default(true).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    isActiveIdx: index("return_policies_is_active_idx").on(table.isActive),
  })
);

/**
 * Return requests table - customer return requests
 * Tracks the lifecycle of return requests
 */
export const returnRequests = pgTable(
  "return_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // Return reason
    reason: returnReasonEnum("reason").notNull(),
    reasonDetails: text("reason_details"), // Additional details from customer

    // Status
    status: returnStatusEnum("status").default("pending").notNull(),

    // Timestamps for return lifecycle
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    approvedAt: timestamp("approved_at"),
    processedAt: timestamp("processed_at"), // When refund was processed

    // Refund information
    refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),

    /**
     * How this return was actually settled. Null until a refund is processed.
     *
     * `return_policies.refundType` says what a policy prefers; this says what
     * happened to this return. Reporting cannot tell money returned to a card
     * apart from money returned as store credit without it, and they are not
     * the same liability.
     */
    refundType: refundTypeEnum("refund_type"),

    /**
     * When the customer agreed to take store credit instead of their money.
     *
     * Required before a store credit refund can be processed. Converting a
     * card payment into credit without agreement is what invites chargebacks,
     * so the agreement is a stored fact rather than an assumption about what
     * some screen showed.
     */
    storeCreditAcceptedAt: timestamp("store_credit_accepted_at", {
      withTimezone: true,
    }),

    /**
     * The card issued for a store credit settlement.
     *
     * Also the idempotency guard: a return that already has one cannot be
     * settled as store credit twice.
     */
    storeCreditGiftCardId: uuid("store_credit_gift_card_id").references(
      () => giftCards.id,
      { onDelete: "set null" },
    ),

    // Admin notes
    adminNotes: text("admin_notes"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orderIdIdx: index("return_requests_order_id_idx").on(table.orderId),
    userIdIdx: index("return_requests_user_id_idx").on(table.userId),
    statusIdx: index("return_requests_status_idx").on(table.status),
    requestedAtIdx: index("return_requests_requested_at_idx").on(
      table.requestedAt
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Return policies relations
 */
export const returnPoliciesRelations = relations(returnPolicies, () => ({
  // Return policies don't have direct relations to other tables currently
  // They serve as configuration/reference data
}));

/**
 * Return requests relations
 */
export const returnRequestsRelations = relations(returnRequests, ({ one }) => ({
  order: one(orders, {
    fields: [returnRequests.orderId],
    references: [orders.id],
  }),
  user: one(users, {
    fields: [returnRequests.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type ReturnPolicy = typeof returnPolicies.$inferSelect;
export type NewReturnPolicy = typeof returnPolicies.$inferInsert;

export type ReturnRequest = typeof returnRequests.$inferSelect;
export type NewReturnRequest = typeof returnRequests.$inferInsert;

export type ReturnReason = (typeof returnReasonEnum.enumValues)[number];
export type ReturnStatus = (typeof returnStatusEnum.enumValues)[number];
export type RefundType = (typeof refundTypeEnum.enumValues)[number];
