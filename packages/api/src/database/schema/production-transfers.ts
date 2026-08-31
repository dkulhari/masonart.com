/**
 * Inter-vendor transfers and order consolidation.
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
 *
 * ## Why the transfer is its own entity
 *
 * The tempting encoding is "A's job goes `dispatched`, B's job goes
 * `received`" — two status changes and no new table. It provably cannot express
 * the thing, for four reasons, the first of which is fatal:
 *
 * 1. In the consolidation case the rolled poster has `frame_id NULL`, so
 *    **vendor B has no job for it at all**. There is no second row to move.
 * 2. One parcel carries several jobs. Two statuses describe one job each.
 * 3. There is freight money, and it has nowhere to sit.
 * 4. "Lost" is a *gap* in the record — no docket, no counterparty, nothing to
 *    chase. A gap is not a state either status can hold.
 *
 * ## No transfer status enum
 *
 * State derives from `dispatched_at` / `received_at` / `lost_at` by a pure
 * function over the row, mirroring `production_jobs`' own date-driven shape.
 * Given this repo's enum hazard — `ALTER TYPE … ADD VALUE` and its first use
 * cannot share a transaction, and `drizzle-kit migrate` makes the whole pending
 * batch one transaction (#580, #673) — a fourth transfer state next year costs
 * a nullable timestamp rather than a migration nobody can apply.
 *
 * ## The unique index is the point
 *
 * `production_transfer_jobs` has a composite primary key AND a unique index on
 * `job_id` alone. The composite alone does not give the invariant: `(t1, j)`
 * and `(t2, j)` are two perfectly good pairs, and one job on two parcels makes
 * "which leg did this take" unanswerable for the readiness gate. A job is on at
 * most one transfer, EVER — a lost transfer produces a *replacement* job
 * (`production_jobs.replaces_job_id`), so the original never needs a second leg.
 *
 * ## Money
 *
 * `cost_amount` is `decimal(10,2)` INR, matching orders, products and
 * vendor_rates. Not paise, not whole rupees. It is also deliberately **not a
 * payable**: we chose the routing, so a vendor cannot be asked to price a
 * distance we picked, and asking A to absorb it is how rate cards get padded.
 * `cost_amount` never enters `sumPayable`, which keeps `amount_expected` versus
 * `amount_actual` meaning "negotiation on the work" and nothing else.
 *
 * ## No CHECK constraints
 *
 * Zero exist in this repo, and `tests/database/raw-sql-objects.test.ts` scans
 * migrations only for FUNCTION|TRIGGER|POLICY — so one added here would be
 * silently absent from any database built with `db:push`, the exact shape of
 * #663. The interesting invariants read *other* rows anyway (a job on a
 * transfer must belong to `from_vendor_id`), and a trigger doing that under
 * READ COMMITTED is a race dressed as enforcement. The one database object that
 * genuinely serialises writers — a unique index — is used where it is needed.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  decimal,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { orders } from './orders'
import { vendors } from './vendors'
import { productionJobs } from './production-jobs'

/**
 * One parcel from vendor A to vendor B.
 *
 * What vendor B is ever told about one of these is
 * `{ id, reference, carrier, pieceCount, dispatchedAt, expectedBy, receivedAt }`
 * — no vendor names, no order id, no customer anything. B does not learn the
 * parcel came from A; surfacing another vendor's row through `vendor-scope.ts`
 * would break the isolation suite's first property. If B needs to chase, an
 * admin chases, because the admin sees both ends.
 */
export const productionTransfers = pgTable(
  'production_transfers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * restrict, like `production_jobs.orderId`: this row carries a freight cost
     * and a carrier docket, so it is a financial and evidentiary record.
     * Deleting an order with goods in transit against it should be blocked and
     * dealt with deliberately.
     */
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'restrict' })
      .notNull(),
    /** Both ends, because a leg has direction and somebody has to be chased. */
    fromVendorId: uuid('from_vendor_id')
      .references(() => vendors.id, { onDelete: 'restrict' })
      .notNull(),
    toVendorId: uuid('to_vendor_id')
      .references(() => vendors.id, { onDelete: 'restrict' })
      .notNull(),
    /** Nullable: the courier is often booked after the row is created. */
    carrier: text('carrier'),
    /** The A→B docket. This is what an admin quotes when chasing a parcel. */
    reference: text('reference'),
    /** One parcel is the overwhelming case, so it is the default. */
    pieceCount: integer('piece_count').default(1).notNull(),
    /**
     * INR, decimal(10,2) — matching orders/products/vendor_rates. NOT paise and
     * NOT whole rupees. Nullable because we book the leg and learn the price
     * later, and never set by a vendor: we chose the routing.
     */
    costAmount: decimal('cost_amount', { precision: 10, scale: 2 }),

    /** The three timestamps that ARE the state machine. All nullable. */
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    expectedBy: timestamp('expected_by', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    /**
     * Admin only, because declaring a parcel lost costs money and a vendor
     * declaring it is a vendor deciding who eats that cost. A transfer with
     * `received_at` set can never later be declared lost.
     */
    lostAt: timestamp('lost_at', { withTimezone: true }),
    /** Free text: "what the carrier finally said" has no vocabulary. */
    lostNote: text('lost_note'),

    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /** The readiness gate reads every transfer on one order. */
    orderIdIdx: index('production_transfers_order_id_idx').on(table.orderId),
    /** A's outbound list. */
    fromVendorIdIdx: index('production_transfers_from_vendor_id_idx').on(table.fromVendorId),
    /** B's inbound list — the vendor portal's whole transfers screen. */
    toVendorIdIdx: index('production_transfers_to_vendor_id_idx').on(table.toVendorId),
  })
)

/**
 * Which jobs rode which parcel.
 *
 * The composite primary key lets one parcel carry many jobs. The unique index
 * on `job_id` ALONE is what stops one job riding two parcels — see the module
 * note above; the primary key does not imply it.
 */
export const productionTransferJobs = pgTable(
  'production_transfer_jobs',
  {
    transferId: uuid('transfer_id')
      .references(() => productionTransfers.id, { onDelete: 'cascade' })
      .notNull(),
    /**
     * restrict, NOT cascade. The job carries `amount_expected`,
     * `amount_actual` and `settlement_id`, so it is a financial record;
     * deleting a transfer must not be able to reach through this row and
     * destroy a payable. Compare `production_job_items.orderItemId`, restricted
     * for the same reason while its own `jobId` side cascades.
     */
    jobId: uuid('job_id')
      .references(() => productionJobs.id, { onDelete: 'restrict' })
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.transferId, table.jobId] }),
    /** A job is on at most one transfer, ever. */
    jobIdUnique: uniqueIndex('production_transfer_jobs_job_id_unique').on(table.jobId),
  })
)

/**
 * Which vendor assembles the order and ships it to the customer.
 *
 * A table rather than a column on `orders`, so a supplier foreign key stays off
 * the customer table and out of every wholesale `select()` of orders — of which
 * the storefront and admin have many. The primary key enforces exactly one
 * consolidator per order, and the ABSENCE of a row is meaningful: undecided,
 * which the label gate reads as a blocker.
 *
 * The system proposes and an admin confirms. `decided_by = NULL` records
 * "system default" — case 1 of §5, where one vendor already holds every job on
 * the order, written automatically at first assignment with no admin involved.
 *
 * That does collide with `ON DELETE set null`: deleting the admin's account
 * retroactively re-labels their decision as a system one. The alternatives are
 * worse (cascade deletes the routing decision itself; restrict blocks deleting
 * a user forever), and the durable answer to "who decided" is
 * `admin_audit_log`, which snapshots `actor_email` and `actor_role` at write
 * time precisely so it survives the account.
 */
export const orderConsolidation = pgTable(
  'order_consolidation',
  {
    /**
     * cascade, unlike `production_transfers.orderId`: this row is a routing
     * decision, not a financial record. Nothing is owed on the strength of it.
     */
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id')
      .references(() => vendors.id, { onDelete: 'restrict' })
      .notNull(),
    /** NULL means the system chose it. See the note above. */
    decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    /** "What is this vendor consolidating right now" — the vendor's own queue. */
    vendorIdIdx: index('order_consolidation_vendor_id_idx').on(table.vendorId),
  })
)

export const productionTransfersRelations = relations(productionTransfers, ({ one, many }) => ({
  order: one(orders, { fields: [productionTransfers.orderId], references: [orders.id] }),
  fromVendor: one(vendors, {
    fields: [productionTransfers.fromVendorId],
    references: [vendors.id],
    relationName: 'transferFromVendor',
  }),
  toVendor: one(vendors, {
    fields: [productionTransfers.toVendorId],
    references: [vendors.id],
    relationName: 'transferToVendor',
  }),
  creator: one(users, { fields: [productionTransfers.createdBy], references: [users.id] }),
  jobs: many(productionTransferJobs),
}))

export const productionTransferJobsRelations = relations(productionTransferJobs, ({ one }) => ({
  transfer: one(productionTransfers, {
    fields: [productionTransferJobs.transferId],
    references: [productionTransfers.id],
  }),
  job: one(productionJobs, {
    fields: [productionTransferJobs.jobId],
    references: [productionJobs.id],
  }),
}))

export const orderConsolidationRelations = relations(orderConsolidation, ({ one }) => ({
  order: one(orders, { fields: [orderConsolidation.orderId], references: [orders.id] }),
  vendor: one(vendors, { fields: [orderConsolidation.vendorId], references: [vendors.id] }),
  decider: one(users, { fields: [orderConsolidation.decidedBy], references: [users.id] }),
}))

export type ProductionTransfer = typeof productionTransfers.$inferSelect
export type NewProductionTransfer = typeof productionTransfers.$inferInsert
export type ProductionTransferJob = typeof productionTransferJobs.$inferSelect
export type NewProductionTransferJob = typeof productionTransferJobs.$inferInsert
export type OrderConsolidation = typeof orderConsolidation.$inferSelect
export type NewOrderConsolidation = typeof orderConsolidation.$inferInsert
