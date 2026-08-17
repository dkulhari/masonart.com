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
import { orderItems } from '../database/schema/orders'
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

/**
 * Item rows for a job the caller owns.
 *
 * `orderItemId` is DELIBERATELY not selected. It was, until the isolation suite
 * pointed out that this module states "no person-linked order reference" as an
 * absolute and then shipped one: an order item id joins straight to
 * `order_items.order_id` and from there to the buyer, and it is a stable handle
 * a vendor could keep. Nothing needs it — a vendor addresses their work by JOB,
 * and the artwork route keys on `production_job_items.id`, which is what this
 * returns. Narrowed at the SELECT rather than deleted from the object
 * afterwards, so the next read written against this table starts from a column
 * list that never had it.
 */
export async function getVendorJobItems(vendorId: string | null | undefined, jobId?: string) {
  assertVendorId(vendorId)
  const job = await getVendorJob(vendorId, jobId)
  if (!job || !jobId) return []
  return db
    .select({ id: productionJobItems.id })
    .from(productionJobItems)
    .where(eq(productionJobItems.jobId, jobId))
}

/**
 * The only prefixes a vendor artwork URL may ever be signed for.
 *
 * An ALLOW-list, and it fails closed, for two reasons the isolation suite made
 * concrete:
 *
 * 1. **The key is inside the signed URL.** Half of this bucket is partitioned
 *    by user id — `ai-generations/<userId>/…`, `avatars/<userId>/…`,
 *    `ai-reference-images/<userId>/…` — so signing one of those hands a vendor
 *    a stable person-linked identifier in the URL path, where no assertion
 *    about JSON *keys* can see it.
 * 2. **The key is data.** It is whatever `snapshot.imageUrl` decodes to. Without
 *    a bound, this route is a general-purpose signer for the whole bucket, and
 *    the day a snapshot holds an unexpected path it will happily sign it.
 *
 * Catalogue artwork lives under `products/` (`uploadImage` /
 * `uploadOptimizedImage` default to `StoragePaths.PRODUCTS`, originals under
 * `products/originals/`). If custom, per-customer artwork ever needs to reach a
 * vendor, the answer is to copy it to an identity-free job-scoped key and add
 * that prefix here — not to widen this to the bucket root.
 */
const VENDOR_ARTWORK_PREFIXES = ['products/'] as const

/**
 * Reduce a stored image reference to a bare object key.
 *
 * `order_items.snapshot.imageUrl` is written as whatever `getPublicUrl` produced
 * at purchase time: a CDN URL when `CDN_URL` is set, a path-style S3 URL when it
 * is not. The presigner needs the KEY, so both forms collapse to the same thing
 * here. Returns null rather than a guess when there is nothing usable — the
 * caller turns that into a 404, because signing an empty key would produce a
 * perfectly valid-looking URL to nothing.
 */
function objectKeyFromImageRef(imageRef: string | null | undefined): string | null {
  if (typeof imageRef !== 'string') return null
  let key = imageRef.trim()
  if (!key) return null

  if (/^https?:\/\//i.test(key)) {
    try {
      key = decodeURIComponent(new URL(key).pathname)
    } catch {
      return null
    }
  }

  key = key.replace(/^\/+/, '')

  // Path-style endpoints put the bucket in the path; CDN URLs do not.
  const bucket = process.env.R2_BUCKET || 'poster-app-dev'
  if (key.startsWith(`${bucket}/`)) key = key.slice(bucket.length + 1)

  // No traversal out of the bucket, whatever was stored.
  if (!key || key.includes('..')) return null

  // Fail closed: an unrecognised prefix is a bug, and signing it first and
  // asking later is how that bug becomes an incident.
  if (!VENDOR_ARTWORK_PREFIXES.some((prefix) => key.startsWith(prefix))) return null

  return key
}

/**
 * The object key for ONE item's artwork, on a job the caller owns.
 *
 * Scoped twice, deliberately:
 *
 * 1. `getVendorJob` runs first, so a job belonging to another vendor is NOT
 *    FOUND before an item is ever looked at.
 * 2. The item read filters on `jobId` as well as on the item id. Looking the
 *    item up by id alone would hand vendor B a URL for vendor A's artwork the
 *    moment they guessed — or were once legitimately told — a real item id.
 *
 * The select is NARROW on purpose. `order_items` is joined for one JSON field,
 * `snapshot->>'imageUrl'`; selecting the row wholesale would drag `orderId`,
 * `customizations` and the rest of the snapshot across a boundary that is
 * supposed to carry no customer data at all. Returning the key — not a URL —
 * also means this module can never accidentally emit a permanent public path.
 */
export async function getVendorJobArtwork(
  vendorId: string | null | undefined,
  jobId?: string,
  itemId?: string
): Promise<{ itemId: string; key: string } | null> {
  assertVendorId(vendorId)
  if (!jobId || !itemId) return null

  const job = await getVendorJob(vendorId, jobId)
  if (!job) return null

  const [row] = await db
    .select({
      id: productionJobItems.id,
      imageUrl: sql<string | null>`${orderItems.snapshot} ->> 'imageUrl'`,
    })
    .from(productionJobItems)
    .innerJoin(orderItems, eq(orderItems.id, productionJobItems.orderItemId))
    .where(and(eq(productionJobItems.id, itemId), eq(productionJobItems.jobId, jobId)))
    .limit(1)

  if (!row) return null

  const key = objectKeyFromImageRef(row.imageUrl)
  if (!key) return null

  return { itemId: row.id, key }
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
