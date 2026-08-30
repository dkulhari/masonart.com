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
 * ## The customer-data rule
 *
 * This module used to state a second absolute: *no return value here contains
 * customer data*. It was assertable as a blanket rule for exactly one reason —
 * dispatch was in-house, the piece came back to us before it shipped, so a
 * vendor needed no name, no address, no phone. Not "needed little". Needed none.
 *
 * **That premise is dead.** Vendors despatch directly now and the courier
 * collects from their facility, so a carrier's shipping label necessarily
 * carries the customer's name, address and phone. The absolute cannot survive
 * contact with that. What must survive is the part that made it worth stating:
 * that a machine, not a reviewer, decides whether it holds. So it is replaced
 * by three clauses, each mechanically checkable, NOT by a guideline:
 *
 * **R1 — the JSON stays clean, absolutely.** No JSON body on any
 * `/api/vendor/*` route contains a customer name, address, phone, email or
 * person-linked order reference, at any depth, in any casing. NO EXCEPTION,
 * EVER. Every read below uses an explicit `.select({...})` column list, or reads
 * a table that holds no customer columns at all; `tests/routes/vendor/
 * isolation.test.ts` enforces it with an unchanged forbidden-key vocabulary, a
 * recursive body walker, a ban on wholesale `select()` and an assertion over the
 * SELECT projection itself.
 *
 * **R2 — customer data reaches a vendor only as opaque rendered bytes, behind a
 * short-lived signature.** Only as a rendered document fetched from a signed,
 * expiring URL, and only by handing that file to the operating system. Never as
 * fields, never composed by our API, never rendered into the vendor portal's own
 * DOM. Exactly one such document exists: the carrier's label PDF, reached
 * through `getVendorJobLabelKey` below.
 *
 * **R3 — the allow-list is the enforcement, and the scopes are disjoint.** Every
 * vendor-facing signature is produced through one named scope of
 * `VENDOR_SIGNING_SCOPES`, and a caller may sign only within its own. The scopes
 * are pairwise disjoint and non-substitutable, in both directions, which is what
 * keeps the single label exception from widening into a general PII signer.
 *
 * **Vendors need no pickup address and no delivery pincode.** Do not add one.
 * The courier collects from the vendor's OWN facility, which is already in
 * `vendors.address_*` — theirs, not a customer's — and we choose the courier, so
 * the destination is never the vendor's business either. Every field a vendor
 * could plausibly want "for shipping" is already on the label, inside the PDF,
 * where R2 puts it. Adding one to a JSON body breaks R1, which takes no
 * exceptions.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { requiredQcSlots, type QcStage } from '@chobii/shared'
import { db } from '../database'
import {
  productionJobs,
  productionJobItems,
  productionJobPhotos,
  productionJobReviews,
  vendorSettlements,
} from '../database/schema/production-jobs'
import { orderItems, orders } from '../database/schema/orders'
import {
  orderConsolidation,
  productionTransfers,
  productionTransferJobs,
} from '../database/schema/production-transfers'
import { orderShipments } from '../database/schema/shipping'
import { vendorRates } from '../database/schema/vendors'
import {
  ProductionTransitionError,
  VENDOR_SETTABLE_STATUSES,
  assertTransition,
  guardFor,
  type ProductionJobStatus,
} from './production-transitions'

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

  // vendorId in the WHERE, not checked afterwards: a wrong-vendor job is NOT
  // FOUND, which is also the right thing to leak (nothing). The column list is
  // shared with the post-write re-read, so the two cannot drift apart and start
  // answering the same question with different shapes.
  return readVendorJob(db, vendorId, jobId)
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
 * R3. The ONLY prefixes a vendor-facing signature may ever be produced for,
 * grouped into named, DISJOINT scopes.
 *
 * An ALLOW-list, and it fails closed, for two reasons the isolation suite made
 * concrete:
 *
 * 1. **The key is inside the signed URL.** Half of this bucket is partitioned
 *    by user id — `ai-generations/<userId>/…`, `avatars/<userId>/…`,
 *    `ai-reference-images/<userId>/…` — so signing one of those hands a vendor
 *    a stable person-linked identifier in the URL path, where no assertion
 *    about JSON *keys* can see it.
 * 2. **The key is data.** It is whatever a stored reference decodes to. Without
 *    a bound, a signing route is a general-purpose signer for the whole bucket,
 *    and the day a stored value holds an unexpected path it will happily sign it.
 *
 * **Why SCOPES and not one flat list.** The three prefixes are not
 * interchangeable, and one of them is dangerous:
 *
 * - `artwork` — catalogue print files (`uploadImage` / `uploadOptimizedImage`
 *   default to `StoragePaths.PRODUCTS`, originals under `products/originals/`).
 *   Signed on a route with no consolidator check.
 * - `qcPhoto` — photographs the vendor took and uploaded THEMSELVES. Nothing of
 *   ours, and nothing of a customer's, is in them.
 * - `label` — the carrier PDF. **The only object in this bucket a vendor may
 *   receive that contains customer data**, and it contains all of it: name,
 *   address, phone.
 *
 * A single flat list would let the artwork route sign a label, and the artwork
 * route does not — cannot — check who is consolidating the order. The narrow
 * exception R2 grants would become a wide hole in R1 with no code change at all.
 * So the scopes are pairwise disjoint (no prefix is a prefix of another) and
 * non-substitutable (a caller passes its own scope, never a key's), and
 * `isolation.test.ts` asserts both directions of every pair.
 *
 * If custom, per-customer artwork ever needs to reach a vendor, the answer is to
 * copy it to an identity-free job-scoped key and add that prefix to the scope
 * that needs it — not to widen a scope to the bucket root, and not to merge two.
 */
export const VENDOR_SIGNING_SCOPES = {
  /** Catalogue print files. Unchanged from `VENDOR_ARTWORK_PREFIXES`. */
  artwork: ['products/'],
  /** Photos the vendor uploaded themselves. */
  qcPhoto: ['production-qc/'],
  /** The carrier PDF — the ONLY PII carrier on this boundary. */
  label: ['fulfilment/labels/'],
} as const

export type VendorSigningScope = keyof typeof VENDOR_SIGNING_SCOPES

/**
 * Reduce a stored object reference to a bare key, ADMISSIBLE IN ONE SCOPE.
 *
 * A stored reference is written as whatever `getPublicUrl` produced at the time:
 * a CDN URL when `CDN_URL` is set, a path-style S3 URL when it is not, or a bare
 * key. The presigner needs the KEY, so every form collapses to the same thing
 * here. Returns null rather than a guess when there is nothing usable — the
 * caller turns that into a 404, because signing an empty key would produce a
 * perfectly valid-looking URL to nothing.
 *
 * The scope is the CALLER's, passed in, never inferred from the key. Inferring
 * it would mean the data decides which rules apply to itself, which is the
 * general-signer bug wearing a scope's clothes.
 */
export function objectKeyForScope(
  scope: VendorSigningScope,
  ref: string | null | undefined
): string | null {
  // An unrecognised scope name fails closed rather than throwing or, worse,
  // matching nothing and being read as "no prefix restriction".
  //
  // OWN properties only, and that is the whole point of the `hasOwnProperty`
  // call. A plain index read resolves `'constructor'` and `'hasOwnProperty'` up
  // the prototype chain to a FUNCTION, whose truthy `.length` walks straight
  // past the emptiness guard below and then throws a TypeError inside `.some` —
  // the one behaviour the sentence above promises it will not do. The scope
  // argument is always a code literal, so this is not attacker-reachable; it is
  // fixed because a guard that throws where it claims to return null is a guard
  // nobody can reason about.
  const prefixes: readonly string[] | undefined = Object.prototype.hasOwnProperty.call(
    VENDOR_SIGNING_SCOPES,
    scope
  )
    ? VENDOR_SIGNING_SCOPES[scope]
    : undefined
  if (!prefixes || prefixes.length === 0) return null

  if (typeof ref !== 'string') return null
  let key = ref.trim()
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

  // Fail closed: a prefix outside this scope is a bug, and signing it first and
  // asking later is how that bug becomes an incident.
  if (!prefixes.some((prefix) => key.startsWith(prefix))) return null

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

  const key = objectKeyForScope('artwork', row.imageUrl)
  if (!key) return null

  return { itemId: row.id, key }
}

// ============================================================================
// The carrier label — R2's single exception, and the narrowest one available
// ============================================================================

/**
 * `order_shipments.label_object_token`, referenced as a SEAM.
 *
 * **This column does not exist yet.** It belongs to `order-dispatch-tracking`,
 * which owns every `order_shipments` schema change; the production-pipeline
 * design declares it here and only here, as the join this feature consumes.
 * Written as a SQL fragment rather than a drizzle column for exactly that
 * reason — inventing the column in `schema/shipping.ts` would put this feature's
 * name on another sub-project's table and produce a migration nobody owns.
 * Until that column lands, this query throws; nothing calls it yet (the route is
 * #687), and throwing is the correct failure for a missing seam. Replace this
 * fragment with `orderShipments.labelObjectToken` the day it exists.
 *
 * A random token, following the `production_approvals.approval_token`
 * precedent, and NOT the order id. See `getVendorJobLabelKey`.
 */
const LABEL_OBJECT_TOKEN = sql`"order_shipments"."label_object_token"`

/**
 * A token is DATA, read from a table this feature does not write. It becomes a
 * path segment, so it is constrained to characters that cannot leave the
 * segment: no slash, no dot, no whitespace. `objectKeyForScope` would catch a
 * traversal afterwards; this catches the whole class beforehand, and keeps
 * `fulfilment/labels/<token>.pdf` meaning one file rather than a subtree.
 */
const LABEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * The object key for the carrier label on an order this vendor is consolidating.
 *
 * ## The key is identity-free BY CONSTRUCTION
 *
 * `fulfilment/labels/<random token>.pdf`. **Never** `<orderId>`. An order id in
 * a URL path is a stable, person-linked handle — precisely the sin the isolation
 * suite punishes in `ai-generations/<userId>/…` — and it lives in the one place
 * no assertion about JSON *keys* can ever reach: the path of the signed URL,
 * which is a value, not a field. R1 would report the payload clean while the
 * URL beside it carried the handle. So the identifier is not filtered out of the
 * key; it is never in it. The token follows the
 * `production_approvals.approval_token` precedent.
 *
 * ## Three AUTHORISATION conditions live in the WHERE — and a fourth does not
 *
 * The job is this vendor's; the order's consolidator (`order_consolidation`) is
 * this vendor; a label token exists. One query, three predicates, no branch in
 * application code where one of them can be skipped. A vendor who holds a job on
 * the order but is NOT the consolidator gets `null` — a 404 at the route — and
 * the presigner is **never reached**. That is the actual requirement: a signed
 * URL that is generated and then withheld has still been generated, and lives in
 * whatever log, trace or crash dump saw it. Checking ownership after signing
 * gives the same answer on the happy path and the wrong one every other time.
 *
 * Only the consolidator, because only they hold the parcel. Everyone else on the
 * order shipped their piece onward by inter-vendor transfer and has no business
 * with the customer's address.
 *
 * ## The fourth condition: WHICH shipment
 *
 * It is not an authorisation check and it cannot be written as a predicate, so
 * spelling out "all three" and stopping there was a lie of omission.
 * `order_shipments.order_id` is a plain indexed FK, NOT unique
 * (`schema/shipping.ts`), so an order whose label was voided and re-bought
 * carries more than one row, each with its own `label_object_token`. A bare
 * `LIMIT 1` over that returns whichever row Postgres happened to reach first —
 * possibly the dead label, and possibly a different one on the next call, which
 * is the worse half: a vendor who reloads gets a different PDF.
 *
 * So the row is CHOSEN, explicitly: the newest LABELLED shipment, `id` breaking
 * a same-instant tie so the ordering is total rather than merely usually stable.
 * The `label_object_token is not null` predicate is what makes "labelled" part
 * of the choice — an unlabelled re-buy cannot shadow the live label.
 *
 * **What "correct" means here, and the limit of it.** Correct is *the label the
 * courier will actually honour*. Newest-labelled is the closest approximation
 * `order_shipments` can currently express: the table has no void marker at all —
 * `shipment_status` runs pending → label_created → … → delivered/failed, and
 * `failed` is a failed DELIVERY, not a voided label — and inventing one here
 * would be this feature writing semantics onto another sub-project's table.
 * **SEAM, owned by `order-dispatch-tracking` (same owner as
 * `LABEL_OBJECT_TOKEN` above):** the day that feature lands a void /
 * cancellation marker, or makes the live label single-valued per order, the
 * `ORDER BY` below must become a predicate on it. Until then this is the safest
 * available choice and is deliberately not dressed up as more than that.
 *
 * ## What it returns
 *
 * The KEY, not a URL — this module can never accidentally emit a permanent
 * public path — and the job id, which is the vendor's own handle on their own
 * work. Nothing else: R1 is untouched by this exception, because the customer
 * data is inside the PDF the caller will sign, never in a field beside it.
 */
export async function getVendorJobLabelKey(
  vendorId: string | null | undefined,
  jobId?: string
): Promise<{ jobId: string; key: string } | null> {
  assertVendorId(vendorId)
  if (!jobId) return null

  const [row] = await db
    // Narrow on purpose, like every read above: the token and nothing else.
    // `orders`, `order_shipments` and `order_consolidation` all hold or point
    // at customer data, and a wholesale select of any of them would drag it
    // across a boundary R1 says it may never cross.
    .select({ token: sql<string | null>`${LABEL_OBJECT_TOKEN}` })
    .from(productionJobs)
    .innerJoin(orderConsolidation, eq(orderConsolidation.orderId, productionJobs.orderId))
    .innerJoin(orderShipments, eq(orderShipments.orderId, productionJobs.orderId))
    .where(
      and(
        eq(productionJobs.id, jobId),
        // The job is theirs...
        eq(productionJobs.vendorId, vendorId),
        // ...AND they are the one despatching the order...
        eq(orderConsolidation.vendorId, vendorId),
        // ...AND a label actually exists. All three, or no row.
        sql`${LABEL_OBJECT_TOKEN} is not null`
      )
    )
    // The fourth condition, and the reason this is not a bare LIMIT 1. Several
    // labelled shipments can hang off one order (voided and re-bought); without
    // an ORDER BY the row is whichever one the planner reached first. Newest
    // labelled shipment wins, `id` making the ordering total.
    // SEAM (`order-dispatch-tracking`): replace with a predicate on the void
    // marker the day one exists. See the doc block above.
    .orderBy(desc(orderShipments.createdAt), desc(orderShipments.id))
    .limit(1)

  const token = row?.token
  if (typeof token !== 'string' || !LABEL_TOKEN_PATTERN.test(token)) return null

  // Through the same allow-list every other signature passes, under its OWN
  // scope. R3 is an enforcement here, not a naming convention: a token that
  // somehow escaped the prefix resolves to null rather than to a signable key.
  const key = objectKeyForScope('label', `${VENDOR_SIGNING_SCOPES.label[0]}${token}.pdf`)
  if (!key) return null

  return { jobId, key }
}

/**
 * The ONE write a vendor gets, and the only mutation this module will ever
 * expose.
 *
 * ## What it stopped being
 *
 * A blind whitelist patch: copy `status`, `sentAt` and `receivedAt` across if
 * they were present, UPDATE, re-read. It asked no question except "is this
 * status in a list", which meant a vendor could
 *
 * - move a **cancelled** job to `received` and go on working on a piece nobody
 *   would pay for, walking straight around the freeze the admin side installed
 *   — through a different door;
 * - move a **settled** job, which makes the settlement's stored `amount`
 *   disagree with the derived sum of its jobs, silently and forever;
 * - back-date `receivedAt` to three days ago, which is not a data-entry
 *   convenience but a lie about an SLA clock.
 *
 * ## What it is now
 *
 * Read under a lock, ask the matrix, evaluate the guard the matrix NAMES,
 * stamp the clock ourselves, write with the predicate repeated, audit inside
 * the transaction, re-read. All of it in ONE transaction, because every one of
 * those steps reads a fact the next one depends on.
 *
 * `assertTransition` is only half the answer and `lib/production-transitions.ts`
 * says so in as many words: the `guard` on an edge "*names* the circumstance a
 * route still has to check". Both vendor-guarded edges are checked below —
 * `received -> qc_submitted` against the shot list, `qc_passed -> dispatched`
 * against the despatch evidence — because an edge whose guard nobody evaluates
 * is an unguarded edge with a comment.
 *
 * ## Why a discriminated result and not `null`
 *
 * It used to answer `null` for "not yours", `null` for "no such job" and
 * `throw` for "not a status you may set", so the route could only ever say 404.
 * A vendor whose job was cancelled under them got the same answer as a vendor
 * guessing at somebody else's id. The four outcomes are genuinely different
 * — 404, 409, 422 and success — so the return type says which.
 *
 * ## The timestamps are ours
 *
 * `sentAt` and `receivedAt` are gone from the patch surface entirely; the
 * server stamps `receivedAt`, `qcSubmittedAt` and `dispatchedAt` from its own
 * clock at the instant of the write. Note that `qc_failed -> received`
 * re-stamps `receivedAt`: rework is a second attempt at the piece and its clock
 * restarts, rather than being back-dated to the first attempt.
 *
 * Returns the re-read row (the same customer-free column list as every other
 * read), never the raw `.returning()` row, which would carry `orderId`.
 *
 * ## The status vocabulary is NOT written down here
 *
 * It used to be — `'sent' | 'received'`, a second literal beside the one in
 * `routes/vendor.ts`. Both went stale the moment #676 landed
 * `lib/production-transitions.ts`, where `sent` is EDGELESS in both directions:
 * nothing enters it, nothing leaves it, because #675 retired it and
 * `database/retire-sent-status.ts` erased it from the rows that already had it.
 * A parallel literal here meant a vendor could PATCH a job straight back to
 * `sent` and re-create exactly what that backfill had just removed.
 *
 * So the vocabulary is IMPORTED and derived. `VENDOR_SETTABLE_STATUSES` is a
 * `filter` over the transition matrix, not a list somebody maintains, so an edge
 * added or removed there moves this boundary with it and there is no second
 * place to forget.
 */
export type VendorSettableStatus = (typeof VENDOR_SETTABLE_STATUSES)[number]

/**
 * The runtime half of the same fact, tested against the derived tuple rather
 * than a `switch`, for the same reason the type is derived.
 */
function isVendorSettableStatus(status: unknown): status is VendorSettableStatus {
  return (
    typeof status === 'string' && (VENDOR_SETTABLE_STATUSES as readonly string[]).includes(status)
  )
}

/** The columns this module is allowed to stamp. Not `sentAt`: see below. */
type VendorStampColumn = 'receivedAt' | 'qcSubmittedAt' | 'dispatchedAt'

/**
 * The clock each vendor-settable status stamps, checked TOTAL at module load.
 *
 * A vendor edge added to the matrix without a clock behind it would move a job
 * and record nothing about when — a gap nobody notices until an SLA argument,
 * by which time the only evidence is an `updated_at` that has been overwritten
 * a dozen times. So the completeness is enforced rather than trusted.
 *
 * **Enforced at load and not by the type checker, on purpose.**
 * `VENDOR_SETTABLE_STATUSES` is derived by a runtime `filter` over the matrix,
 * so its element type is the whole enum and `Record<VendorSettableStatus, …>`
 * would demand a clock for `draft` and `cancelled` too. A type that has to be
 * satisfied with lies is worse than a check that runs: this one throws before
 * the process serves a request, which no cast can silence.
 *
 * `sentAt` is deliberately absent from the vocabulary. `sent` is retired and
 * has no edge in either direction, and `retire-sent-status.ts` LEAVES `sent_at`
 * alone precisely because the date the material went out is evidence — evidence
 * this module must not be able to overwrite.
 */
function stampColumnsForVendorEdges(): Record<VendorSettableStatus, VendorStampColumn> {
  const declared: Partial<Record<ProductionJobStatus, VendorStampColumn>> = {
    received: 'receivedAt',
    qc_submitted: 'qcSubmittedAt',
    dispatched: 'dispatchedAt',
  }

  const missing = VENDOR_SETTABLE_STATUSES.filter((status) => declared[status] === undefined)
  if (missing.length > 0) {
    throw new Error(
      `vendor-scope: the transition matrix gives a vendor an edge into ` +
        `${missing.join(', ')}, but no server-side timestamp is declared for it.`
    )
  }

  // Sound for every status this map is ever READ with: the only lookups below
  // are statuses `isVendorSettableStatus` and `assertTransition` have both
  // already passed, and the check above proves each of those has an entry.
  return declared as Record<VendorSettableStatus, VendorStampColumn>
}

export const VENDOR_STATUS_STAMP = stampColumnsForVendorEdges()

/** Every refusal this module can answer with, named rather than inferred. */
export type VendorJobRefusalCode =
  | 'JOB_NOT_FOUND'
  | 'JOB_CANCELLED'
  | 'JOB_SETTLED'
  | 'ILLEGAL_TRANSITION'
  | 'SHOT_LIST_INCOMPLETE'
  | 'GUARD_UNSATISFIED'
  | 'CONCURRENT_MODIFICATION'

export interface VendorJobRefusal {
  ok: false
  /**
   * 404 the job is not theirs (or is gone), 409 the world moved, 422 the caller
   * can fix it. The split matters: 422 in this router means "your payload names
   * things that do not line up", which a client retries by CHANGING something.
   * A transition conflict is not that, and conflating them teaches clients to
   * retry the wrong thing.
   */
  status: 404 | 409 | 422
  body: { error: string; code: VendorJobRefusalCode } & Record<string, unknown>
}

export interface VendorJobAccepted {
  ok: true
  job: NonNullable<Awaited<ReturnType<typeof getVendorJob>>>
  from: ProductionJobStatus
  to: VendorSettableStatus
}

export type VendorJobUpdateResult = VendorJobAccepted | VendorJobRefusal

/** Thrown inside the transaction so a refusal ROLLS BACK rather than returns. */
class VendorWriteRefused extends Error {
  readonly refusal: VendorJobRefusal

  constructor(status: VendorJobRefusal['status'], body: VendorJobRefusal['body']) {
    super(body.error)
    this.name = 'VendorWriteRefused'
    this.refusal = { ok: false, status, body }
  }
}

/** The reader half of `db` and of a transaction handle alike. */
type VendorReader = { select: typeof db.select }

/** The handle `db.transaction` hands its callback — it reads AND writes. */
type VendorTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The insert surface `recordAudit` needs, named here so `routes/vendor.ts` can
 * hand the transaction straight to it WITHOUT importing `db`, a table or a
 * query builder. The route's zero-database-import invariant is the reason this
 * type exists rather than the route simply taking a `PgTransaction`.
 */
export type VendorAuditWriter = { insert: typeof db.insert }

export interface VendorTransitionRecord {
  from: ProductionJobStatus
  to: VendorSettableStatus
  before: Record<string, unknown>
  after: Record<string, unknown>
}

/**
 * Called INSIDE the transaction, after the write and before the commit.
 *
 * The audit vocabulary stays in the route (which holds the request context);
 * the transaction stays here (which holds the data access). A row saying "the
 * job moved" beside a job that did not move is worse than no row, so this one
 * shares the transaction — and shares its failures, which is the point: an
 * audit write that throws must abort the move rather than be swallowed.
 */
export type VendorTransitionAudit = (
  tx: VendorAuditWriter,
  move: VendorTransitionRecord
) => Promise<void>

/** The one column list every vendor-facing job read uses. */
const VENDOR_JOB_COLUMNS = {
  id: productionJobs.id,
  stage: productionJobs.stage,
  status: productionJobs.status,
  dueAt: productionJobs.dueAt,
  sentAt: productionJobs.sentAt,
  receivedAt: productionJobs.receivedAt,
  amountExpected: productionJobs.amountExpected,
  amountActual: productionJobs.amountActual,
}

/**
 * Does the order carry a shipping label?
 *
 * The same three fields `routes/admin/production-jobs.ts` reads for the same
 * guard, asked as a BOOLEAN rather than fetched: the AWB is a courier's handle
 * on a customer's parcel, and R1 says no vendor-facing projection names it. The
 * vendor needs the answer, never the value.
 */
const ORDER_HAS_LABEL = sql<boolean>`coalesce(
  ${orders.shippingDetails} ->> 'awbNumber',
  ${orders.shippingDetails} ->> 'trackingNumber',
  ${orders.shippingDetails} ->> 'shipmentId'
) is not null`

/**
 * The guard the matrix NAMES on this edge, evaluated or refused.
 *
 * Until Phase 3 nothing in `src/` called `guardFor` at all, so every guarded
 * edge was taken unchecked. Both edges a vendor can reach are guarded, so for
 * this module "evaluate the guard" is not an extra — it is most of the job.
 */
async function assertVendorGuardSatisfied(
  tx: VendorTx,
  job: { jobId: string; vendorId: string; stage: string },
  from: ProductionJobStatus,
  to: VendorSettableStatus
): Promise<void> {
  const guard = guardFor(from, to)
  if (!guard) return

  if (guard === 'shot-list-complete') {
    // LIVE photos only. A superseded row is one the vendor REPLACED, and
    // counting it would let a reshoot that never happened satisfy the list.
    const live = await tx
      .select({ slot: productionJobPhotos.slot })
      .from(productionJobPhotos)
      .where(
        and(
          eq(productionJobPhotos.jobId, job.jobId),
          isNull(productionJobPhotos.supersededAt)
        )
      )

    const uploaded = new Set(live.map((row) => row.slot))
    const missing = requiredQcSlots(job.stage as QcStage).filter((slot) => !uploaded.has(slot))
    if (missing.length === 0) return

    // 422, not 409: this refusal IS fixable by the caller — upload the photos —
    // which is exactly what separates the two codes in this router.
    throw new VendorWriteRefused(422, {
      error:
        `This job cannot go to QC until every required photograph is uploaded. ` +
        `Still missing: ${missing.join(', ')}.`,
      code: 'SHOT_LIST_INCOMPLETE',
      guard,
      from,
      to,
      missingSlots: missing,
      allowed: [],
    })
  }

  if (guard === 'open-transfer-or-order-label') {
    // ONE scoped query, shaped like `getVendorJobLabelKey`: FROM the vendor's
    // own job, out to the order-keyed rows, selecting an opaque transfer id and
    // a boolean. `orders` holds customer data in every direction; nothing about
    // it comes back as a field.
    const [evidence] = await tx
      .select({ transferId: productionTransfers.id, hasOrderLabel: ORDER_HAS_LABEL })
      .from(productionJobs)
      .leftJoin(productionTransferJobs, eq(productionTransferJobs.jobId, productionJobs.id))
      .leftJoin(
        productionTransfers,
        and(
          eq(productionTransfers.id, productionTransferJobs.transferId),
          // A LOST parcel is not an open one: the replacement job carries the
          // work, and this job must not report itself despatched on a parcel
          // that is gone.
          isNull(productionTransfers.lostAt)
        )
      )
      .innerJoin(orders, eq(orders.id, productionJobs.orderId))
      .where(and(eq(productionJobs.id, job.jobId), eq(productionJobs.vendorId, job.vendorId)))
      .limit(1)

    if (evidence?.transferId || evidence?.hasOrderLabel) return

    throw new VendorWriteRefused(409, {
      error:
        "This job is on no open transfer and its order carries no shipping label, " +
        "so nothing has moved the goods anywhere. 'dispatched' is terminal: " +
        'marking it now would leave this order permanently unlabelable.',
      code: 'GUARD_UNSATISFIED',
      guard,
      from,
      to,
      allowed: [],
    })
  }

  // Unreachable through today's matrix — the vendor's two guarded edges are
  // both handled above. Refused rather than ignored, because a guard nobody
  // evaluates is the exact defect this function exists to close, and a new
  // guarded vendor edge must land here deliberately.
  throw new VendorWriteRefused(409, {
    error:
      `Moving a job from '${from}' to '${to}' has to satisfy the '${guard}' guard, ` +
      `which the vendor portal cannot evaluate.`,
    code: 'GUARD_UNSATISFIED',
    guard,
    from,
    to,
    allowed: [],
  })
}

/** One job through the customer-free column list, from `db` or from a `tx`. */
async function readVendorJob(reader: VendorReader, vendorId: string, jobId: string) {
  const [job] = await reader
    .select(VENDOR_JOB_COLUMNS)
    .from(productionJobs)
    .where(and(eq(productionJobs.id, jobId), eq(productionJobs.vendorId, vendorId)))
    .limit(1)

  return job ?? null
}

export async function updateVendorJob(
  vendorId: string | null | undefined,
  jobId: string | undefined,
  patch: { status: VendorSettableStatus },
  hooks: { onTransition?: VendorTransitionAudit } = {}
): Promise<VendorJobUpdateResult> {
  assertVendorId(vendorId)

  const notFound: VendorJobRefusal = {
    ok: false,
    status: 404,
    body: { error: 'Job not found', code: 'JOB_NOT_FOUND' },
  }

  if (!jobId) return notFound

  const to = patch.status

  // Defence in depth. `routes/vendor.ts` narrows this at the schema from the
  // same derived tuple, so this is unreachable through the router — but this
  // module is the boundary, and a boundary that trusts its only caller is a
  // boundary that stops being one the day a second caller appears.
  if (!isVendorSettableStatus(to)) {
    return {
      ok: false,
      status: 409,
      body: {
        error:
          `'${to}' is not a status a vendor may set. ` +
          `A vendor may set: ${VENDOR_SETTABLE_STATUSES.join(', ')}.`,
        code: 'ILLEGAL_TRANSITION',
        to,
        allowed: [...VENDOR_SETTABLE_STATUSES],
      },
    }
  }

  try {
    return await db.transaction(async (tx) => {
      // FOR UPDATE, and a RE-READ: the route's load-first check answered the
      // 404 before any write was built, but it answered it a round trip ago.
      // Two vendors' tabs, or a vendor and an admin, serialise here instead.
      const [before] = await tx
        .select({
          id: productionJobs.id,
          stage: productionJobs.stage,
          status: productionJobs.status,
          // Not in any response projection, and never will be. The freeze is
          // about this column; the vendor is told what it means, not its value.
          settlementId: productionJobs.settlementId,
        })
        .from(productionJobs)
        // Scoped again, not trusted from the pre-read: an admin who reassigned
        // the job in between must win, and this must find nothing.
        .where(and(eq(productionJobs.id, jobId), eq(productionJobs.vendorId, vendorId)))
        .limit(1)
        .for('update')

      if (!before) throw new VendorWriteRefused(404, notFound.body)

      const from = before.status

      // A DELIBERATE exception to the portal's 404-not-403 rule, and it is
      // checked FIRST because it is the one refusal that changes what the
      // vendor should do next. They already know this job exists — it is theirs
      // and it is in their queue — so naming its fate leaks nothing, and
      // withholding it means they keep working on something nobody will pay
      // for. Cancellation wins every race by having no out-edge at all.
      if (from === 'cancelled') {
        throw new VendorWriteRefused(409, {
          error:
            'This job was cancelled, so there is nothing left to do on it. ' +
            'Stop work on this piece and check your queue for the current one.',
          code: 'JOB_CANCELLED',
          from,
          to,
          allowed: [],
        })
      }

      // Frozen, not merely protected from amount edits: payables are DERIVED
      // with no stored total, so a move after settlement makes the settlement
      // disagree with the sum of its jobs silently — and the
      // `settlement_id IS NULL` that keeps the write honest would match no row
      // anyway.
      if (before.settlementId !== null) {
        throw new VendorWriteRefused(409, {
          error:
            'This job has already been settled and can no longer be moved. ' +
            'Raise it with us rather than re-opening a paid job.',
          code: 'JOB_SETTLED',
          from,
          to,
          allowed: [],
        })
      }

      // The matrix decides; this module only asks. There is no vendor self-edge
      // anywhere in it, so a repeated PATCH is a refusal with the remedy
      // attached rather than a silent no-op.
      try {
        assertTransition(from, to, 'vendor')
      } catch (error) {
        if (error instanceof ProductionTransitionError) {
          throw new VendorWriteRefused(409, {
            ...error.toResponseBody(),
            code: 'ILLEGAL_TRANSITION',
          })
        }
        throw error
      }

      // ...and then the circumstance the edge NAMES, which `assertTransition`
      // deliberately does not answer.
      await assertVendorGuardSatisfied(tx, { jobId, vendorId, stage: before.stage }, from, to)

      // OUR clock, at the instant of the write. A vendor cannot say "I received
      // it three days ago", because there is no field in which to say it.
      const stampedAt = new Date()
      const stamp = VENDOR_STATUS_STAMP[to]

      const written = await tx
        .update(productionJobs)
        .set({ status: to, [stamp]: stampedAt, updatedAt: stampedAt })
        .where(
          and(
            eq(productionJobs.id, jobId),
            eq(productionJobs.vendorId, vendorId),
            // The predicate REPEATED rather than trusted from the read: anybody
            // who moved or settled the job in between wins, and we match
            // nothing.
            eq(productionJobs.status, from),
            isNull(productionJobs.settlementId)
          )
        )
        // Narrow on purpose: the raw row carries `orderId`.
        .returning({ id: productionJobs.id })

      if (written.length !== 1) {
        throw new VendorWriteRefused(409, {
          error: `Expected to update 1 job but matched ${written.length}; nothing was recorded`,
          code: 'CONCURRENT_MODIFICATION',
          from,
          to,
          allowed: [],
        })
      }

      // Inside the transaction, and its failure aborts the move. Catching it
      // here to "keep going" would answer 200 over a write about to roll back.
      await hooks.onTransition?.(tx, {
        from,
        to,
        before: { status: from },
        after: { status: to, [stamp]: stampedAt },
      })

      // Re-read through the same customer-free column list every other read
      // uses, from the TRANSACTION — a read outside it could not see the write.
      const job = await readVendorJob(tx, vendorId, jobId)
      if (!job) throw new VendorWriteRefused(404, notFound.body)

      return { ok: true as const, job, from, to }
    })
  } catch (error) {
    // The refusal already rolled its transaction back; the ROUTE writes the
    // audit row for it, outside any transaction, because a refusal row records
    // that a transaction was rolled back and writing it inside erases it.
    if (error instanceof VendorWriteRefused) return error.refusal
    throw error
  }
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
