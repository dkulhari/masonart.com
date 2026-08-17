/**
 * Vendor-Scoped Data Access
 *
 * ALL vendor-facing reads go through this module. Routes do not reach the
 * tables directly.
 *
 * Why a module and not care-taken-per-route: every other role in this system
 * is a blanket grant, so `requireRole` is a complete check for it. A vendor
 * sees only their own rows, which `requireRole` cannot express. Putting the
 * filter in one place with `vendorId` as a required first argument makes an
 * unfiltered query inexpressible rather than merely discouraged, and gives the
 * isolation guarantee ONE testable home instead of an audit across every route
 * that will ever be added.
 *
 * Second rule, equally absolute: **no return value here contains customer
 * data.** Not a name, not an address, not a phone, not a person-linked order
 * reference. Dispatch is in-house — the piece comes back to us before it ships
 * — so a vendor never needs any of it. Stated as an absolute so it can be
 * tested as one. Every read below uses an explicit `.select({...})` column
 * list, or reads a table that holds no customer columns at all.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../database'
import {
  productionJobs,
  productionJobItems,
  productionJobReviews,
  vendorSettlements,
} from '../database/schema/production-jobs'
import { vendorRates } from '../database/schema/vendors'

/**
 * The guard every export starts with. Throws rather than returning empty:
 * an empty result reads as "this vendor has nothing", which is a lie that
 * looks like data. A throw is a bug report.
 */
function assertVendorId(vendorId: string | null | undefined): asserts vendorId is string {
  if (!vendorId || typeof vendorId !== 'string') {
    throw new Error('vendor-scope: vendorId is required and was not supplied')
  }
}

export async function listVendorJobs(
  vendorId: string | null | undefined,
  opts: { status?: string; limit?: number; offset?: number } = {}
) {
  assertVendorId(vendorId)
  const limit = Math.min(opts.limit ?? 20, 100)
  const offset = opts.offset ?? 0

  return db
    .select({
      id: productionJobs.id,
      stage: productionJobs.stage,
      status: productionJobs.status,
      dueAt: productionJobs.dueAt,
      sentAt: productionJobs.sentAt,
      receivedAt: productionJobs.receivedAt,
      amountExpected: productionJobs.amountExpected,
      amountActual: productionJobs.amountActual,
      createdAt: productionJobs.createdAt,
      // Deliberately absent: orderId, any customer field, any retail price.
    })
    .from(productionJobs)
    .where(
      opts.status
        ? and(eq(productionJobs.vendorId, vendorId), eq(productionJobs.status, opts.status as any))
        : eq(productionJobs.vendorId, vendorId)
    )
    .orderBy(desc(productionJobs.createdAt))
    .limit(limit)
    .offset(offset)
}

export async function getVendorJob(vendorId: string | null | undefined, jobId?: string) {
  assertVendorId(vendorId)
  if (!jobId) return null

  const [job] = await db
    .select({
      id: productionJobs.id,
      stage: productionJobs.stage,
      status: productionJobs.status,
      dueAt: productionJobs.dueAt,
      sentAt: productionJobs.sentAt,
      receivedAt: productionJobs.receivedAt,
      amountExpected: productionJobs.amountExpected,
      amountActual: productionJobs.amountActual,
    })
    .from(productionJobs)
    // vendorId in the WHERE, not checked afterwards: a wrong-vendor job is
    // NOT FOUND, which is also the right thing to leak (nothing).
    .where(and(eq(productionJobs.id, jobId), eq(productionJobs.vendorId, vendorId)))
    .limit(1)

  return job ?? null
}

export async function listVendorRates(vendorId: string | null | undefined) {
  assertVendorId(vendorId)
  return db
    .select({
      id: vendorRates.id,
      vendorId: vendorRates.vendorId,
      kind: vendorRates.kind,
      longestEdgeMinInches: vendorRates.longestEdgeMinInches,
      longestEdgeMaxInches: vendorRates.longestEdgeMaxInches,
      finish: vendorRates.finish,
      amount: vendorRates.amount,
      effectiveFrom: vendorRates.effectiveFrom,
      effectiveTo: vendorRates.effectiveTo,
    })
    .from(vendorRates)
    .where(eq(vendorRates.vendorId, vendorId))
    .orderBy(desc(vendorRates.effectiveFrom))
}

export async function listVendorSettlements(vendorId: string | null | undefined) {
  assertVendorId(vendorId)
  return db
    .select({
      id: vendorSettlements.id,
      vendorId: vendorSettlements.vendorId,
      amount: vendorSettlements.amount,
      reference: vendorSettlements.reference,
      note: vendorSettlements.note,
      paidAt: vendorSettlements.paidAt,
      createdAt: vendorSettlements.createdAt,
    })
    .from(vendorSettlements)
    .where(eq(vendorSettlements.vendorId, vendorId))
    .orderBy(desc(vendorSettlements.paidAt))
}

/**
 * Payables are DERIVED, never stored: no parallel ledger to drift.
 * owed = SUM(COALESCE(amountActual, amountExpected)) over unsettled jobs.
 */
export async function getVendorPayableTotal(vendorId: string | null | undefined) {
  assertVendorId(vendorId)
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(COALESCE(${productionJobs.amountActual}, ${productionJobs.amountExpected})), 0)`,
    })
    .from(productionJobs)
    .where(and(eq(productionJobs.vendorId, vendorId), isNull(productionJobs.settlementId)))

  return row?.total ?? '0'
}

/** Item rows for a job the caller owns. Artwork/size/finish only — no customer. */
export async function getVendorJobItems(vendorId: string | null | undefined, jobId?: string) {
  assertVendorId(vendorId)
  const job = await getVendorJob(vendorId, jobId)
  if (!job || !jobId) return []
  return db
    .select({ id: productionJobItems.id, orderItemId: productionJobItems.orderItemId })
    .from(productionJobItems)
    .where(eq(productionJobItems.jobId, jobId))
}

/**
 * The ONE write a vendor gets, and the only mutation this module will ever
 * expose. Scoped exactly like the reads, twice over:
 *
 * 1. The row is loaded through `getVendorJob` FIRST, so a job belonging to
 *    another vendor is NOT FOUND before an UPDATE is ever built. Updating by id
 *    and checking ownership afterwards gives the same answer on the happy path
 *    and the wrong one whenever the check is wrong.
 * 2. `vendorId` is in the UPDATE's own WHERE as well, so even a bug that skipped
 *    the pre-read could not touch another vendor's row.
 *
 * The patch is a WHITELIST, not a spread: `status`, `sentAt` and `receivedAt`
 * are copied field by field. Amounts are what we owe, priced from the rate card
 * at assignment — a vendor may not price their own job, so no amount can arrive
 * here even if a caller puts one in the object.
 *
 * Returns the re-read row (the same customer-free column list as every other
 * read), never the raw `.returning()` row, which would carry `orderId`.
 */
export type VendorSettableStatus = 'sent' | 'received'

export async function updateVendorJob(
  vendorId: string | null | undefined,
  jobId?: string,
  patch: {
    status?: VendorSettableStatus
    sentAt?: Date | null
    receivedAt?: Date | null
  } = {}
) {
  assertVendorId(vendorId)

  const existing = await getVendorJob(vendorId, jobId)
  if (!existing || !jobId) return null

  const fields: Record<string, unknown> = {}
  if (patch.status !== undefined) fields.status = patch.status
  if (patch.sentAt !== undefined) fields.sentAt = patch.sentAt
  if (patch.receivedAt !== undefined) fields.receivedAt = patch.receivedAt
  if (Object.keys(fields).length === 0) return existing

  await db
    .update(productionJobs)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(productionJobs.id, jobId), eq(productionJobs.vendorId, vendorId)))

  return getVendorJob(vendorId, jobId)
}

/** QC history for a job the caller owns. */
export async function getVendorJobReviews(vendorId: string | null | undefined, jobId?: string) {
  assertVendorId(vendorId)
  const job = await getVendorJob(vendorId, jobId)
  if (!job || !jobId) return []
  return db
    .select({
      id: productionJobReviews.id,
      verdict: productionJobReviews.verdict,
      defects: productionJobReviews.defects,
      notes: productionJobReviews.notes,
      createdAt: productionJobReviews.createdAt,
      // reviewerId omitted: that is our staff, not their business.
    })
    .from(productionJobReviews)
    .where(eq(productionJobReviews.jobId, jobId))
    .orderBy(desc(productionJobReviews.createdAt))
}
