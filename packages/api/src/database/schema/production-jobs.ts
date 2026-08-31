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
  uniqueIndex,
  integer,
  decimal,
  unique,
} from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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

    /**
     * These four, plus createdAt/updatedAt below, are bare `timestamp` and stay
     * that way. Converting them is recorded debt (§11), not this ticket: they
     * predate the feature and hold rows. Every column ADDED by
     * production-pipeline is `timestamptz`, so that a server timezone change
     * cannot desynchronise a job from the `admin_audit_log` row describing it.
     */
    assignedAt: timestamp('assigned_at'),
    sentAt: timestamp('sent_at'),
    dueAt: timestamp('due_at'),
    receivedAt: timestamp('received_at'),

    /**
     * Work finished and the shot list uploaded: the moment the ball moved to
     * our court. The admin QC queue sorts on it.
     */
    qcSubmittedAt: timestamp('qc_submitted_at', { withTimezone: true }),
    /**
     * This vendor's custody ended — one column, not two, because
     * parcel-to-next-vendor and parcel-to-courier are the same fact.
     */
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    /**
     * Set on a job created to replace one lost in transit.
     *
     * Without it, two print jobs against one order item read as a
     * duplicate-entry mistake. `set null`, never cascade: deleting the original
     * must not delete the work that replaced it. The original also KEEPS its
     * payable and stays `dispatched` — we owe vendor A for work they genuinely
     * did, and the parcel is what vanished, not the work. Moving it to
     * `qc_failed` would slander their QC record and pollute the defect history
     * future scorecards read.
     */
    replacesJobId: uuid('replaces_job_id').references((): AnyPgColumn => productionJobs.id, {
      onDelete: 'set null',
    }),

    /** Computed from the rate card live at assignment. */
    amountExpected: decimal('amount_expected', { precision: 10, scale: 2 }),
    /** The override. Print shops negotiate; making that invisible is worse. */
    amountActual: decimal('amount_actual', { precision: 10, scale: 2 }),

    /**
     * NULL is the definition of unsettled — the payables query keys on it.
     *
     * `restrict`, not `set null` (#675). Under `set null`, deleting a
     * settlement did not merely drop a pointer: every job it paid for went back
     * to `settlement_id IS NULL` and reappeared as owed, with nothing left in
     * the record to say the money had already moved. Unwinding a settlement has
     * to be a deliberate act that re-points its jobs first.
     */
    settlementId: uuid('settlement_id').references(() => vendorSettlements.id, {
      onDelete: 'restrict',
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

/**
 * One QC photograph. Append-only, like production_job_reviews above.
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §7
 *
 * A vendor photographs the finished piece against a fixed shot list before we
 * will accept the work. `superseded_at` plus the partial unique index below
 * gives exactly one LIVE photo per slot while keeping every earlier attempt:
 * a reshoot after a failed inspection supersedes, it does not overwrite, so a
 * dispute can still see what was originally submitted.
 *
 * `slot` is `text`, NOT a pgEnum, and that is not laziness. `schema/shipping.ts`
 * records that a *value* import from the ESM-only `@chobii/shared` inside
 * `schema/` breaks `drizzle-kit generate` outright, so the vocabulary cannot
 * live beside the table. It lives in `@chobii/shared/schemas/production-qc` as
 * `QC_SHOT_LIST`, where the vendor portal and the API read one copy, and
 * `qcSlotSchema` checks it at every write. The database checks nothing here.
 *
 * No CHECK constraint enforces that either. Zero CHECKs exist in this repo, and
 * `tests/database/raw-sql-objects.test.ts` scans migrations only for
 * FUNCTION|TRIGGER|POLICY — one added here would be silently absent from any
 * database built with `db:push`, which is the exact shape of #663.
 */
export const productionJobPhotos = pgTable(
  'production_job_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * cascade, unlike productionJobs.orderId: a photograph of a job is not a
     * financial record and means nothing without the job. It does leave the R2
     * objects orphaned, which is why the 400-day retention sweep in
     * `queues/qc-photo-retention.ts` (#697) calls
     * `deleteByPrefix('production-qc/<jobId>/')` BEFORE deleting rows — a
     * cascade cannot reach into object storage.
     */
    jobId: uuid('job_id')
      .references(() => productionJobs.id, { onDelete: 'cascade' })
      .notNull(),
    /** A key from `QC_SHOT_LIST`. See the note above on why this is text. */
    slot: text('slot').notNull(),
    /**
     * The R2 object KEY — `production-qc/<jobId>/<slot>/<filename>`, built by
     * `StoragePaths.productionQcPhoto`. NEVER a URL.
     *
     * `approval_photos.url` is the counter-example this deliberately does not
     * copy: a stored URL cannot be re-signed when it expires, and it puts the
     * object outside the signing-scope allow-list, so the URL itself becomes
     * the capability. A key can always be signed again, and only for a caller
     * the allow-list permits.
     */
    objectKey: text('object_key').notNull(),
    /**
     * Recorded at `complete`, not trusted from `presign`. The two calls are
     * minutes apart, so what was promised and what landed can differ.
     */
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** set null, never cascade: deleting a vendor user must not delete the work. */
    uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    /**
     * timestamptz, like every column production-pipeline adds. #674 landed this
     * and `superseded_at` as bare `timestamp`; 0025 alters both, which is free
     * because the table was new and empty. The point is comparability with
     * `admin_audit_log.created_at`, which is already timestamptz — a QC dispute
     * reads a photo row and an audit row side by side, and a server timezone
     * change must not silently pull them apart.
     */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    /**
     * NULL is the definition of live — the partial unique index keys on it.
     * Set when a newer photo takes this slot; the row is never deleted, and
     * there is no `updated_at` because nothing else about it ever changes.
     */
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    /**
     * The review that judged this photograph, stamped onto every live photo
     * when a verdict is recorded. Nullable until then, and set null rather
     * than cascade so losing a review never destroys the evidence it saw.
     */
    reviewId: uuid('review_id').references(() => productionJobReviews.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    jobIdIdx: index('production_job_photos_job_id_idx').on(table.jobId),
    /**
     * Exactly one live photo per slot, with the full history kept.
     *
     * Partial, following gift_card_standalone_purchase_order_unique (0018): a
     * blanket unique would REFUSE the reshoot after a failed inspection, which
     * is the one moment this table exists to record.
     *
     * The predicate is a timestamp test and names no enum value on purpose.
     * #673 added `qc_submitted`, `dispatched` and `fulfilment`, and
     * `drizzle-kit migrate` replays the whole pending batch in ONE transaction
     * — so any use of a new value here, even though it lives in a different
     * migration file, dies on a fresh database with "unsafe use of new value".
     * See tests/database/migration-enum-literals.test.ts.
     */
    liveSlotUnique: uniqueIndex('production_job_photos_live_slot_unique')
      .on(table.jobId, table.slot)
      .where(sql`${table.supersededAt} IS NULL`),
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
  photos: many(productionJobPhotos),
}))

export const productionJobItemsRelations = relations(productionJobItems, ({ one }) => ({
  job: one(productionJobs, { fields: [productionJobItems.jobId], references: [productionJobs.id] }),
  orderItem: one(orderItems, {
    fields: [productionJobItems.orderItemId],
    references: [orderItems.id],
  }),
}))

export const productionJobReviewsRelations = relations(
  productionJobReviews,
  ({ one, many }) => ({
    job: one(productionJobs, {
      fields: [productionJobReviews.jobId],
      references: [productionJobs.id],
    }),
    reviewer: one(users, { fields: [productionJobReviews.reviewerId], references: [users.id] }),
    /** The shots this verdict judged. */
    photos: many(productionJobPhotos),
  })
)

export const productionJobPhotosRelations = relations(productionJobPhotos, ({ one }) => ({
  job: one(productionJobs, { fields: [productionJobPhotos.jobId], references: [productionJobs.id] }),
  uploader: one(users, { fields: [productionJobPhotos.uploadedBy], references: [users.id] }),
  review: one(productionJobReviews, {
    fields: [productionJobPhotos.reviewId],
    references: [productionJobReviews.id],
  }),
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
export type ProductionJobPhoto = typeof productionJobPhotos.$inferSelect
export type NewProductionJobPhoto = typeof productionJobPhotos.$inferInsert
export type VendorSettlement = typeof vendorSettlements.$inferSelect
export type NewVendorSettlement = typeof vendorSettlements.$inferInsert
export type ProductionJobStage = (typeof productionJobStageEnum.enumValues)[number]
export type ProductionJobStatus = (typeof productionJobStatusEnum.enumValues)[number]
export type ProductionJobVerdict = (typeof productionJobVerdictEnum.enumValues)[number]
