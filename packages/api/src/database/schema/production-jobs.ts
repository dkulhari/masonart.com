/**
 * Production Job Schema
 *
 * The minimal record a QC rating and a payable attach to. This module defines
 * the job RECORD; production-pipeline defines the WORKFLOW over it — the
 * status enum here is a vocabulary, not a state machine, and deliberately
 * carries no transition guards.
 *
 * Payables are DERIVED from these rows, never stored:
 *   SUM(COALESCE(amount_actual, amount_expected)) WHERE settlement_id IS NULL
 * There is no balance column anywhere, so there is no parallel ledger to drift.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
  decimal,
  unique,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { orders, orderItems } from './orders'
import { vendors } from './vendors'

export const productionJobStageEnum = pgEnum('production_job_stage', ['print', 'frame'])

/**
 * Vocabulary only. Legal transitions live in `lib/production-transitions.ts`.
 *
 * Order matches the order Postgres holds, which is what `0023` positions with
 * `ADD VALUE … BEFORE`. Keep the two in step: drizzle-kit compares the arrays,
 * and a reordering reads as drift it would rather fix by recreating the type.
 *
 * `received` is re-meant by production-pipeline: it was "the vendor received the
 * physical piece from us", it is now "the vendor has everything needed to
 * start" — the artwork for a print job, the printed sheet for a frame job. Same
 * actor, same moment in the vendor's day; only the label changed.
 *
 * `qc_submitted` is the one state meaning the ball is in OUR court: work
 * finished, shot list uploaded, blocked on us. `dispatched` is one value and not
 * two because parcel-to-next-vendor and parcel-to-courier are the same fact —
 * this vendor's custody ended.
 *
 * `sent` is RETIRED but deliberately still here. Dropping an enum value means
 * recreating the type and rewriting every dependent column, and rows carry it
 * until #675's backfill script runs, so the DSL has to keep reading them. The
 * retirement is enforced by the transition matrix giving it zero in-edges and
 * zero out-edges (#676) — never by removing it from this list.
 */
export const productionJobStatusEnum = pgEnum('production_job_status', [
  'draft',
  'assigned',
  'sent',
  'received',
  'qc_submitted',
  'qc_passed',
  'qc_failed',
  'dispatched',
  'cancelled',
])

export const productionJobVerdictEnum = pgEnum('production_job_verdict', ['pass', 'fail'])

/** Out-of-band payment record. The system records what was paid; money moves elsewhere. */
export const vendorSettlements = pgTable(
  'vendor_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .references(() => vendors.id, { onDelete: 'restrict' })
      .notNull(),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    reference: text('reference'),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    note: text('note'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    vendorIdIdx: index('vendor_settlements_vendor_id_idx').on(table.vendorId),
    paidAtIdx: index('vendor_settlements_paid_at_idx').on(table.paidAt),
  })
)

export const productionJobs = pgTable(
  'production_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * restrict, not cascade: a job carries amountExpected, amountActual and
     * settlementId, so it is a financial record. Cascading it away with the
     * order would destroy the proof that we owe — or have already paid — a
     * vendor for work they actually did. Deleting an order with production
     * against it should be blocked and dealt with deliberately.
     */
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    stage: productionJobStageEnum('stage').notNull(),
    vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'restrict' }),
    status: productionJobStatusEnum('status').default('draft').notNull(),

    assignedAt: timestamp('assigned_at'),
    sentAt: timestamp('sent_at'),
    dueAt: timestamp('due_at'),
    receivedAt: timestamp('received_at'),

    /** Computed from the rate card live at assignment. */
    amountExpected: decimal('amount_expected', { precision: 10, scale: 2 }),
    /** The override. Print shops negotiate; making that invisible is worse. */
    amountActual: decimal('amount_actual', { precision: 10, scale: 2 }),

    /** NULL is the definition of unsettled — the payables query keys on it. */
    settlementId: uuid('settlement_id').references(() => vendorSettlements.id, {
      onDelete: 'set null',
    }),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orderIdIdx: index('production_jobs_order_id_idx').on(table.orderId),
    vendorIdIdx: index('production_jobs_vendor_id_idx').on(table.vendorId),
    statusIdx: index('production_jobs_status_idx').on(table.status),
    stageIdx: index('production_jobs_stage_idx').on(table.stage),
    /** Drives the payables query: unsettled jobs for one vendor. */
    settlementIdx: index('production_jobs_settlement_idx').on(table.vendorId, table.settlementId),
  })
)

/**
 * Jobs join to order_items rather than to orders, so a mixed basket splits
 * across vendors instead of forcing one vendor per order.
 */
export const productionJobItems = pgTable(
  'production_job_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .references(() => productionJobs.id, { onDelete: 'cascade' })
      .notNull(),
    /**
     * restrict for the same reason as production_jobs.orderId: this row is the
     * record of WHAT the billed work was for. Losing it leaves a job with an
     * amount and no explanation. jobId above stays cascade — a join row really
     * is meaningless without its job — but the order item side is history.
     */
    orderItemId: uuid('order_item_id')
      .references(() => orderItems.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    jobIdIdx: index('production_job_items_job_id_idx').on(table.jobId),
    orderItemIdIdx: index('production_job_items_order_item_id_idx').on(table.orderItemId),
    jobItemUnique: unique('production_job_items_job_item_unique').on(table.jobId, table.orderItemId),
  })
)

/**
 * Append-only. MULTIPLE rows per job are expected and are how rework history
 * is preserved — hence no updated_at. Mirrors ai_generation_reviews.
 *
 * `defects` is an open vocabulary at this stage; production-qc-inspection
 * replaces it with a controlled one.
 */
export const productionJobReviews = pgTable(
  'production_job_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .references(() => productionJobs.id, { onDelete: 'cascade' })
      .notNull(),
    reviewerId: text('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
    verdict: productionJobVerdictEnum('verdict').notNull(),
    defects: text('defects').array(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    jobIdIdx: index('production_job_reviews_job_id_idx').on(table.jobId),
    createdAtIdx: index('production_job_reviews_created_at_idx').on(table.createdAt),
  })
)

export const productionJobsRelations = relations(productionJobs, ({ one, many }) => ({
  order: one(orders, { fields: [productionJobs.orderId], references: [orders.id] }),
  vendor: one(vendors, { fields: [productionJobs.vendorId], references: [vendors.id] }),
  settlement: one(vendorSettlements, {
    fields: [productionJobs.settlementId],
    references: [vendorSettlements.id],
  }),
  items: many(productionJobItems),
  reviews: many(productionJobReviews),
}))

export const productionJobItemsRelations = relations(productionJobItems, ({ one }) => ({
  job: one(productionJobs, { fields: [productionJobItems.jobId], references: [productionJobs.id] }),
  orderItem: one(orderItems, {
    fields: [productionJobItems.orderItemId],
    references: [orderItems.id],
  }),
}))

export const productionJobReviewsRelations = relations(productionJobReviews, ({ one }) => ({
  job: one(productionJobs, { fields: [productionJobReviews.jobId], references: [productionJobs.id] }),
  reviewer: one(users, { fields: [productionJobReviews.reviewerId], references: [users.id] }),
}))

export const vendorSettlementsRelations = relations(vendorSettlements, ({ one, many }) => ({
  vendor: one(vendors, { fields: [vendorSettlements.vendorId], references: [vendors.id] }),
  jobs: many(productionJobs),
}))

export type ProductionJob = typeof productionJobs.$inferSelect
export type NewProductionJob = typeof productionJobs.$inferInsert
export type ProductionJobItem = typeof productionJobItems.$inferSelect
export type NewProductionJobItem = typeof productionJobItems.$inferInsert
export type ProductionJobReview = typeof productionJobReviews.$inferSelect
export type NewProductionJobReview = typeof productionJobReviews.$inferInsert
export type VendorSettlement = typeof vendorSettlements.$inferSelect
export type NewVendorSettlement = typeof vendorSettlements.$inferInsert
export type ProductionJobStage = (typeof productionJobStageEnum.enumValues)[number]
export type ProductionJobStatus = (typeof productionJobStatusEnum.enumValues)[number]
export type ProductionJobVerdict = (typeof productionJobVerdictEnum.enumValues)[number]
