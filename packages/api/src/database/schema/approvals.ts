// Production Photo Approvals database schema for Photo Approval Workflow feature
// Following the patterns defined in the existing schema files

import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { orders, orderItems } from "./orders";
import { users } from "./users";

// ============================================================================
// Enums
// ============================================================================

/**
 * Approval status enum for tracking production approval lifecycle
 */
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending_upload", // Awaiting admin to upload production photos
  "pending_approval", // Photos uploaded, awaiting customer review
  "changes_requested", // Customer requested changes
  "approved", // Customer approved for shipping
  "expired", // Approval deadline passed without action
]);

/**
 * Approval comment author type enum
 */
export const approvalAuthorTypeEnum = pgEnum("approval_author_type", [
  "admin", // Comment from admin/staff
  "customer", // Comment from customer
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Production approvals table - main approval records for made-to-order items
 * Tracks the approval workflow from production photo upload to customer approval
 */
export const productionApprovals = pgTable(
  "production_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Order references
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    orderItemId: uuid("order_item_id")
      .references(() => orderItems.id, { onDelete: "cascade" })
      .notNull(),

    // Approval status
    status: approvalStatusEnum("status").default("pending_upload").notNull(),

    // Token-based access for customers (similar to order tracking tokens)
    approvalToken: text("approval_token").unique().notNull(),
    tokenExpiresAt: timestamp("token_expires_at"),

    // Approval tracking
    approvedAt: timestamp("approved_at"),
    approvedBy: text("approved_by"), // User ID or guest identifier

    // Deadline for customer action
    deadlineAt: timestamp("deadline_at"),
    reminderSentAt: timestamp("reminder_sent_at"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    orderIdIdx: index("production_approvals_order_id_idx").on(table.orderId),
    orderItemIdIdx: index("production_approvals_order_item_id_idx").on(
      table.orderItemId
    ),
    statusIdx: index("production_approvals_status_idx").on(table.status),
    approvalTokenIdx: index("production_approvals_token_idx").on(
      table.approvalToken
    ),
    deadlineAtIdx: index("production_approvals_deadline_idx").on(
      table.deadlineAt
    ),
  })
);

/**
 * Approval photos table - production photos attached to an approval
 * Stores photo URLs and metadata for customer review
 */
export const approvalPhotos = pgTable(
  "approval_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Parent approval reference
    approvalId: uuid("approval_id")
      .references(() => productionApprovals.id, { onDelete: "cascade" })
      .notNull(),

    // Photo URLs
    url: text("url").notNull(), // Full-size photo URL
    thumbnailUrl: text("thumbnail_url"), // Thumbnail for gallery view

    // Display order
    sortOrder: integer("sort_order").default(0).notNull(),

    // Upload tracking
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
    uploadedBy: text("uploaded_by").notNull(), // Admin user ID
  },
  (table) => ({
    approvalIdIdx: index("approval_photos_approval_id_idx").on(table.approvalId),
    sortOrderIdx: index("approval_photos_sort_order_idx").on(table.sortOrder),
  })
);

/**
 * Approval comments table - communication between admin and customer
 * Tracks change requests and admin responses
 */
export const approvalComments = pgTable(
  "approval_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Parent approval reference
    approvalId: uuid("approval_id")
      .references(() => productionApprovals.id, { onDelete: "cascade" })
      .notNull(),

    // Author info
    authorType: approvalAuthorTypeEnum("author_type").notNull(),
    authorId: text("author_id"), // User ID for logged-in users, null for guests

    // Comment content
    comment: text("comment").notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    approvalIdIdx: index("approval_comments_approval_id_idx").on(
      table.approvalId
    ),
    createdAtIdx: index("approval_comments_created_at_idx").on(table.createdAt),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Production approvals relations
 */
export const productionApprovalsRelations = relations(
  productionApprovals,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [productionApprovals.orderId],
      references: [orders.id],
    }),
    orderItem: one(orderItems, {
      fields: [productionApprovals.orderItemId],
      references: [orderItems.id],
    }),
    photos: many(approvalPhotos),
    comments: many(approvalComments),
  })
);

/**
 * Approval photos relations
 */
export const approvalPhotosRelations = relations(approvalPhotos, ({ one }) => ({
  approval: one(productionApprovals, {
    fields: [approvalPhotos.approvalId],
    references: [productionApprovals.id],
  }),
}));

/**
 * Approval comments relations
 */
export const approvalCommentsRelations = relations(
  approvalComments,
  ({ one }) => ({
    approval: one(productionApprovals, {
      fields: [approvalComments.approvalId],
      references: [productionApprovals.id],
    }),
  })
);

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type ProductionApproval = typeof productionApprovals.$inferSelect;
export type NewProductionApproval = typeof productionApprovals.$inferInsert;

export type ApprovalPhoto = typeof approvalPhotos.$inferSelect;
export type NewApprovalPhoto = typeof approvalPhotos.$inferInsert;

export type ApprovalComment = typeof approvalComments.$inferSelect;
export type NewApprovalComment = typeof approvalComments.$inferInsert;

export type ApprovalStatus = (typeof approvalStatusEnum.enumValues)[number];
export type ApprovalAuthorType =
  (typeof approvalAuthorTypeEnum.enumValues)[number];
