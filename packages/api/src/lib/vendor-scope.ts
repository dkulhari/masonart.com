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

import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import {
  QC_SHOT_LIST,
  QC_STAGES,
  qcShotsForStage,
  requiredQcSlots,
  type QcStage,
} from '@chobii/shared'
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
  PRODUCTION_TRANSITIONS,
  ProductionTransitionError,
  QC_PHOTO_UPLOAD_STATUSES,
  VENDOR_SETTABLE_STATUSES,
  assertTransition,
  guardFor,
  type ProductionJobStatus,
  type TransitionGuard,
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
 * Until that column lands, this query throws — Postgres raises `42703`,
 * `column "label_object_token" does not exist`.
 *
 * **That throw is CAUGHT, and it is caught here.** It used to travel to
 * `routes/vendor.ts`'s catch-all and come back as a 500 whose body quoted the
 * database's own sentence — on the one route that exists to carry customer PII,
 * which is the last place to be narrating our schema to a supplier. The reasons
 * it must not be a 404 are unchanged and still right: "no label has been bought
 * for this order yet" and "the column this feature reads does not exist" are
 * different facts, and answering the second with the first hides a missing seam
 * behind an ordinary empty state. So it becomes a THIRD answer — a
 * `LabelSeamNotReady` throw, which the route turns into a fixed 503 that names
 * no column, no table and no driver. The vendor is told the label is not
 * available yet; nobody is told what our shipping table looks like.
 *
 * Nothing here becomes a FALLBACK. Substituting the order id, or any other
 * handle that names a person, would put it in the path of a signed URL where no
 * assertion about JSON keys can see it. Replace this fragment with
 * `orderShipments.labelObjectToken` the day it exists, and delete the catch
 * below with it — `tests/lib/vendor-label-seam.test.ts` goes red on the day the
 * column lands and says so, so this is noticed rather than discovered.
 *
 * A random token, following the `production_approvals.approval_token`
 * precedent, and NOT the order id. See `getVendorJobLabelKey`.
 */
const LABEL_OBJECT_TOKEN = sql`"order_shipments"."label_object_token"`

/** The column name, once, so the catch below and the doc above cannot drift. */
const LABEL_OBJECT_TOKEN_COLUMN = 'label_object_token'

/** Postgres `undefined_column`. The exact class of failure the seam produces. */
const UNDEFINED_COLUMN = '42703'

/**
 * The label seam has not landed yet, said as a TYPE rather than as a message.
 *
 * Carries no cause and no driver text on purpose: the route answers it with a
 * fixed body, and a class the route can `instanceof` cannot accidentally echo
 * what it wrapped. `Error.message` here is what an operator reads in a log, not
 * what a vendor reads in a response.
 */
export class LabelSeamNotReady extends Error {
  readonly code = 'LABEL_SEAM_NOT_READY' as const

  constructor() {
    super(
      'vendor-scope: order_shipments has no label token column yet — the ' +
        'order-dispatch-tracking seam has not landed'
    )
    this.name = 'LabelSeamNotReady'
  }
}

/**
 * Every error in a `cause` chain, outermost first.
 *
 * Drizzle does not hand its callers the driver's error. It wraps it in a
 * `DrizzleQueryError` whose `message` is `Failed query: <sql>\nparams: <args>`
 * — the SQL and nothing else — and hangs the `postgres.js` error, which is
 * where `code` and Postgres's own sentence live, on `cause`. Neither half of
 * the test below can be answered from one link alone, so the chain is walked.
 *
 * Bounded and cycle-safe: an error whose `cause` points back at itself would
 * otherwise spin here, and a diagnostic helper must not be able to hang the
 * request it is diagnosing.
 */
function causeChain(error: unknown): object[] {
  const chain: object[] = []
  const seen = new Set<unknown>()
  let current = error

  while (typeof current === 'object' && current !== null && !seen.has(current) && chain.length < 8) {
    seen.add(current)
    chain.push(current)
    current = (current as { cause?: unknown }).cause
  }

  return chain
}

/**
 * Is this failure the MISSING SEAM, and not some other broken query?
 *
 * Both halves are required, and they are asked of the whole `cause` chain
 * rather than of one error. `42703` alone would swallow a genuine typo in a
 * column somewhere else in this select and report it to an operator as "the
 * label feature is not wired up yet", which is a bug that hides for months. The
 * column name alone would catch a permissions error that happened to quote it.
 * A driver that reports no `code` still gets recognised by the sentence
 * Postgres always renders, so this does not depend on one client library.
 *
 * **The chain walk is not defensive coding.** Reading only the top-level error
 * made the 503 below unreachable in every environment: the wrapper carries the
 * column name (it quotes the SQL) but neither the code nor the sentence, so the
 * test failed and every label request answered the generic 500 this seam exists
 * to prevent. `tests/lib/vendor-label-seam.test.ts` fabricated a bare `Error`
 * with both fields on it — a shape the driver does not produce — so the suite
 * guarding this could not fail. It now builds the wrapped shape, and #694's
 * end-to-end run is what found the difference.
 */
function isMissingLabelSeam(error: unknown): boolean {
  const chain = causeChain(error)
  if (chain.length === 0) return false

  const messages = chain.map((link) => {
    const { message } = link as { message?: unknown }
    return typeof message === 'string' ? message : ''
  })

  if (!messages.some((text) => text.includes(LABEL_OBJECT_TOKEN_COLUMN))) return false

  return (
    chain.some((link) => (link as { code?: unknown }).code === UNDEFINED_COLUMN) ||
    messages.some((text) => /does not exist/i.test(text))
  )
}

/**
 * A token is DATA, read from a table this feature does not write. It becomes a
 * path segment, so it is constrained to characters that cannot leave the
 * segment: no slash, no dot, no whitespace. `objectKeyForScope` would catch a
 * traversal afterwards; this catches the whole class beforehand, and keeps
 * `fulfilment/labels/<token>.pdf` meaning one file rather than a subtree.
 */
const LABEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

/** The guard a label exists, on this boundary, in order to satisfy. */
const LABEL_GUARD: TransitionGuard = 'open-transfer-or-order-label'

/**
 * The job statuses in which a vendor may fetch the carrier label.
 *
 * ## Derived from the matrix, not listed
 *
 * The same move `QC_PHOTO_UPLOAD_STATUSES` makes, for the same reason. A
 * photograph exists to satisfy `shot-list-complete`, so its window is the set of
 * statuses a vendor can take THAT edge from. A label exists, on this boundary, to
 * satisfy `open-transfer-or-order-label` on the one edge a vendor takes with it —
 * `qc_passed -> dispatched`, §4 of the design — so its window is the set of
 * statuses a vendor can take that edge from. Today: `qc_passed`, alone. A guard
 * that moves to a different edge moves this window with it, and neither this
 * file nor the design has to be edited twice.
 *
 * ## Why each excluded status is excluded, since this is a PII bound
 *
 * - `draft`, `assigned`, `received`, `qc_submitted` — the work has not been
 *   accepted. Decision 4 of the design is "photo QC gates the label"; a label
 *   readable before the gate opens is the gate not existing. A vendor who has
 *   not yet been told their work is good has no parcel to hand a courier.
 * - `cancelled` — the freeze `updateVendorJob` installs says, in as many words,
 *   *"stop work on this piece"*. A route that then hands over the customer's
 *   name, address and phone is that same refusal walking in through another
 *   door, and it was the more serious half: the audit row recorded the fetch and
 *   nothing prevented it.
 * - `dispatched` — TERMINAL. Nothing leaves it, so including it would not be a
 *   window at all: it would make every consolidated order's label permanently
 *   fetchable by that vendor, for as long as the `order_consolidation` row
 *   survives, which is the unbounded half of the same defect. The label is
 *   printed and stuck to the parcel BEFORE the vendor says it went, so the
 *   window closes exactly where the need does. A reprint after handover is an
 *   admin's job, and an admin has the order.
 *
 * ## It fails closed
 *
 * If the guard is ever renamed and this derives empty, `inArray(status, [])`
 * renders `false` and the label becomes unreachable for everybody — the safe
 * direction, and `tests/lib/vendor-label-seam.test.ts` asserts the derivation is
 * non-empty so the silence is not how anyone finds out.
 */
export const LABEL_ACCESS_STATUSES: readonly ProductionJobStatus[] = (
  Object.keys(PRODUCTION_TRANSITIONS) as ProductionJobStatus[]
).filter((from) =>
  Object.values(PRODUCTION_TRANSITIONS[from]).some(
    (edge) => edge?.guard === LABEL_GUARD && edge.actors.includes('vendor')
  )
)

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
 * ## Four AUTHORISATION conditions live in the WHERE — and a fifth does not
 *
 * The job is this vendor's; the order's consolidator (`order_consolidation`) is
 * this vendor; the job is in a status where a label is legitimately needed
 * (`LABEL_ACCESS_STATUSES`, derived from the matrix); a label token exists. One
 * query, four predicates, no branch in application code where one of them can be
 * skipped. A vendor who holds a job on
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
 * And only WHILE they need it. The status predicate is not decoration: without
 * it a vendor whose job was cancelled — told in as many words to stop work —
 * could still fetch the customer's name, address and phone as a PDF, for as long
 * as the `order_consolidation` row survived, and a `draft` or `assigned` job
 * granted the same. The audit row recorded each fetch; nothing prevented one.
 * `LABEL_ACCESS_STATUSES` above says which statuses those are and why.
 *
 * ## The fifth condition: WHICH shipment
 *
 * It is not an authorisation check and it cannot be written as a predicate, so
 * spelling out the authorisation conditions and stopping there was a lie of
 * omission.
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

  const read = db
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
        // ...AND the job is in a status where a label is legitimately needed,
        // which is derived from the matrix rather than listed here...
        inArray(productionJobs.status, [...LABEL_ACCESS_STATUSES]),
        // ...AND a label actually exists. All four, or no row.
        sql`${LABEL_OBJECT_TOKEN} is not null`
      )
    )
    // The fifth condition, and the reason this is not a bare LIMIT 1. Several
    // labelled shipments can hang off one order (voided and re-bought); without
    // an ORDER BY the row is whichever one the planner reached first. Newest
    // labelled shipment wins, `id` making the ordering total.
    // SEAM (`order-dispatch-tracking`): replace with a predicate on the void
    // marker the day one exists. See the doc block above.
    .orderBy(desc(orderShipments.createdAt), desc(orderShipments.id))
    .limit(1)

  // The SEAM's failure is caught at the seam. `label_object_token` does not
  // exist yet, so this read raises `42703` in every environment; letting that
  // travel to the route made a schema disclosure out of the one route that
  // carries customer data. See `LABEL_OBJECT_TOKEN` above for the whole story
  // and for what to delete the day the column lands.
  let rows: { token: string | null }[] = []
  try {
    rows = await read
  } catch (error) {
    if (isMissingLabelSeam(error)) throw new LabelSeamNotReady()
    throw error
  }

  const token = rows[0]?.token
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
  /** The job is outside the window in which its shot list may change. */
  | 'JOB_NOT_ACCEPTING_PHOTOS'
  /** A real slot, but not one this job's stage asks for. */
  | 'SLOT_NOT_ON_SHOT_LIST'
  /** No LIVE photo with that id on that job. Superseded counts as gone. */
  | 'PHOTO_NOT_FOUND'
  /** The job has had every photograph we keep for one piece. */
  | 'PHOTO_LIMIT_REACHED'
  /**
   * The object the caller says it uploaded is not in the bucket. Emitted by
   * `routes/vendor.ts`, which owns the storage call, and named here so the
   * portal reads ONE vocabulary of refusal codes.
   */
  | 'PHOTO_OBJECT_MISSING'
  /** No parcel with that id at either of this vendor's ends. */
  | 'TRANSFER_NOT_FOUND'
  /** One parcel, one order: `production_transfers.order_id` is single-valued. */
  | 'JOBS_SPAN_ORDERS'
  /** Nobody has decided who assembles this order, so there is nowhere to send it. */
  | 'NO_CONSOLIDATOR'
  /** The caller IS the consolidator. There is no leg to book to your own bench. */
  | 'CONSOLIDATOR_IS_SELF'
  /** A job is on at most one transfer, EVER. A lost parcel is replaced, not re-sent. */
  | 'JOB_ALREADY_ON_TRANSFER'
  /** Nothing has left the sending vendor, so there is nothing to have arrived. */
  | 'TRANSFER_NOT_DISPATCHED'
  /** It is already on the receiving bench. */
  | 'TRANSFER_ALREADY_RECEIVED'
  /** An admin wrote it off. Receipt after a loss is an admin's correction, not a vendor's. */
  | 'TRANSFER_LOST'

export interface VendorJobRefusal {
  ok: false
  /**
   * 400 the payload is malformed, 404 the job is not theirs (or is gone), 409
   * the world moved, 422 the caller can fix it. The split matters: 422 in this
   * router means "your payload names things that do not line up", which a
   * client retries by CHANGING something. A transition conflict is not that,
   * and conflating them teaches clients to retry the wrong thing. 400 is
   * narrower still — the request could not be parsed as a claim about this job
   * at all, which is where an object key belonging somewhere else lands.
   */
  status: 400 | 404 | 409 | 422
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

/**
 * What a guard SAW when it let the edge through.
 *
 * The shot-list guard already reads every live photograph in order to decide;
 * `production_job.photos_submitted` has to name the same set. Handing the
 * guard's own result up is what makes the audit row a record of the decision
 * rather than a second, later query that could disagree with it — the photo
 * table is not locked, and a re-upload landing between the two would produce an
 * audit row naming a shot the guard never counted.
 */
export interface VendorGuardEvidence {
  slots: string[]
  keys: string[]
}

export interface VendorTransitionRecord {
  from: ProductionJobStatus
  to: VendorSettableStatus
  before: Record<string, unknown>
  after: Record<string, unknown>
  /** Present only for a guarded edge that had something to show. */
  evidence?: VendorGuardEvidence
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
 *
 * Returns what it SAW, so the audit row can name the same evidence the decision
 * was taken on rather than re-reading it afterwards.
 */
async function assertVendorGuardSatisfied(
  tx: VendorTx,
  job: { jobId: string; vendorId: string; stage: string },
  from: ProductionJobStatus,
  to: VendorSettableStatus
): Promise<VendorGuardEvidence | undefined> {
  const guard = guardFor(from, to)
  if (!guard) return undefined

  if (guard === 'shot-list-complete') {
    // LIVE photos only. A superseded row is one the vendor REPLACED, and
    // counting it would let a reshoot that never happened satisfy the list.
    //
    // The KEY comes back beside the slot because the audit row records both,
    // and the key is identity-free by construction
    // (`production-qc/<jobId>/<slot>/<file>`), so carrying it costs nothing
    // under R1 and makes a dispute able to name the exact object.
    const live = await tx
      .select({ slot: productionJobPhotos.slot, objectKey: productionJobPhotos.objectKey })
      .from(productionJobPhotos)
      .where(
        and(
          eq(productionJobPhotos.jobId, job.jobId),
          isNull(productionJobPhotos.supersededAt)
        )
      )

    const uploaded = new Set(live.map((row) => row.slot))
    const missing = requiredQcSlots(job.stage as QcStage).filter((slot) => !uploaded.has(slot))
    if (missing.length === 0) {
      return { slots: live.map((row) => row.slot), keys: live.map((row) => row.objectKey) }
    }

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

    if (evidence?.transferId || evidence?.hasOrderLabel) return undefined

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
      // deliberately does not answer. What it saw travels with the move, so the
      // audit row names the evidence the decision was taken on.
      const evidence = await assertVendorGuardSatisfied(
        tx,
        { jobId, vendorId, stage: before.stage },
        from,
        to
      )

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
        evidence,
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

// ============================================================================
// QC photographs — the vendor's own evidence that the piece is right
// ============================================================================

/**
 * ## Why the photo writes live here and not in the route
 *
 * Same reason as every read above: `vendorId` is a required first argument, so
 * an unscoped write is inexpressible rather than merely discouraged. And the
 * three refusals below — not yours, not the moment, not that slot — have to be
 * decided against the SAME locked row the write uses, which is a transaction,
 * which is data access.
 *
 * ## What a photograph is allowed to be
 *
 * A photograph is only ever evidence for one guard: `shot-list-complete` on
 * `received -> qc_submitted`. So the window in which the list may change is
 * derived from that edge (`QC_PHOTO_UPLOAD_STATUSES`) rather than listed, and a
 * job outside it is refused with the window NAMED — a vendor who sees "not now"
 * and nothing else opens a support ticket.
 *
 * That window is the ONLY gate. There is deliberately no settlement freeze on
 * these writes, unlike `updateVendorJob`: the freeze exists because payables
 * are derived with no stored total, so moving a settled job makes the
 * settlement disagree with the sum of its jobs. A photo row carries no amount
 * and moves no job, so there is nothing for it to falsify.
 *
 * ## Append-only, like `production_job_reviews`
 *
 * Nothing here deletes a row, including the route spelled `DELETE`. A re-upload
 * and a retraction both stamp `superseded_at` on the row they replace, which is
 * what the partial unique index on `(job_id, slot) WHERE superseded_at IS NULL`
 * means by "live". The write ORDER is therefore load-bearing — stamp first,
 * insert second — and both halves sit in one transaction with the job row
 * locked, so two `complete` calls for one slot serialise instead of racing into
 * the index.
 *
 * The R2 objects outlive the rows on purpose. A cascade would drop rows and
 * leave the objects orphaned forever, so the 400-day retention sweep has to
 * call `deleteByPrefix('production-qc/<jobId>/')` and only THEN delete rows.
 * That sweep is not in this module and not yet written — see #685's completion
 * note.
 */

/** One live photograph as this module answers it: a KEY, never a URL. */
export interface VendorQcPhoto {
  id: string
  slot: string
  /**
   * Null when the stored reference falls outside the `qcPhoto` scope. Fails
   * CLOSED rather than signing, and is not silently dropped either: a
   * photograph that exists and cannot be shown is a real failure mode, and
   * hiding it here is how it stays invisible.
   */
  key: string | null
  contentType: string
  sizeBytes: number
  uploadedAt: Date
  reviewId: string | null
}

export interface VendorJobPhotos {
  stage: string
  status: ProductionJobStatus
  photos: VendorQcPhoto[]
}

/**
 * Every LIVE photograph on a job the caller owns, oldest first.
 *
 * Scoped twice, like the artwork read: `getVendorJob` runs first, so another
 * vendor's job is NOT FOUND before the photo table is touched at all, and the
 * photo read is keyed on that same job id.
 *
 * `uploaded_by` is deliberately absent from the projection. It is the vendor's
 * own staff, so it is not R1's business — but it is a user id in a payload
 * whose whole point is to carry none, and the portal has no use for one.
 */
export async function listVendorJobPhotos(
  vendorId: string | null | undefined,
  jobId?: string
): Promise<VendorJobPhotos | null> {
  assertVendorId(vendorId)
  if (!jobId) return null

  const job = await getVendorJob(vendorId, jobId)
  if (!job) return null

  const live = await db
    .select({
      id: productionJobPhotos.id,
      slot: productionJobPhotos.slot,
      objectKey: productionJobPhotos.objectKey,
      contentType: productionJobPhotos.contentType,
      sizeBytes: productionJobPhotos.sizeBytes,
      uploadedAt: productionJobPhotos.uploadedAt,
      reviewId: productionJobPhotos.reviewId,
    })
    .from(productionJobPhotos)
    .where(and(eq(productionJobPhotos.jobId, jobId), isNull(productionJobPhotos.supersededAt)))
    .orderBy(asc(productionJobPhotos.uploadedAt))

  return {
    stage: job.stage,
    status: job.status,
    photos: live.map((row) => ({
      id: row.id,
      slot: row.slot,
      // Through the allow-list under its OWN scope, so a stored value that
      // somehow reads `products/…` or `fulfilment/labels/…` resolves to null
      // instead of to a signable key. R3 is an enforcement, not a convention.
      key: objectKeyForScope('qcPhoto', row.objectKey),
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt,
      reviewId: row.reviewId,
    })),
  }
}

/**
 * Shots at one slot before we stop taking photographs: the original round, a
 * reshoot after a failed inspection, and three more for one that came out badly.
 * Comfortably past any honest workflow, which is the point — this is a backstop
 * against abuse, not a workflow limit.
 */
const QC_PHOTO_ATTEMPTS_PER_SLOT = 5

/**
 * The most photographs one job will ever hold, SUPERSEDED ROWS INCLUDED.
 *
 * `routes/review-media.ts` caps a review at `MAX_MEDIA_PER_REVIEW = 5` and
 * counts every row it already has; this is the same cap on the same reasoning,
 * sized for a different collection. Without one, a vendor holding a single job
 * could write rows — and objects behind them — without end: `presign` creates no
 * row and refuses nothing on volume, and `complete` supersedes rather than
 * replaces, so re-uploading one slot appends for ever.
 *
 * **Every row counts, including the ones a re-upload superseded.** Counting only
 * the live shot list would cap nothing: the whole point of the append-only table
 * is that the old row survives, and so does the object behind it. This is a cap
 * on bytes as much as on rows, and the object behind a superseded row is exactly
 * the byte cost this bounds.
 *
 * **DERIVED, not chosen**: attempts per slot times the longest shot list
 * (`frame`'s eight), so a stage that grows a shot moves the cap with it. One job
 * is therefore bounded at `MAX_QC_PHOTOS_PER_JOB × QC_PHOTO_MAX_BYTES` — 40 × 25MB
 * today — and a vendor's total by the jobs an ADMIN assigned them, rather than by
 * their own patience.
 */
export const MAX_QC_PHOTOS_PER_JOB =
  QC_PHOTO_ATTEMPTS_PER_SLOT * Math.max(...QC_STAGES.map((stage) => QC_SHOT_LIST[stage].length))

/**
 * How many photograph rows this job holds, live and superseded alike.
 *
 * Takes the READER so the pre-check can ask `db` and the enforcement can ask the
 * transaction that holds the job's lock. `production_job_photos` carries no
 * vendor column: it is job-keyed, and every caller here has already read the job
 * with `vendorId` in its WHERE, which is what makes this safe.
 */
async function countJobPhotos(reader: VendorReader, jobId: string): Promise<number> {
  const [row] = await reader
    .select({ count: sql<number>`count(*)::int` })
    .from(productionJobPhotos)
    .where(eq(productionJobPhotos.jobId, jobId))

  return Number(row?.count ?? 0)
}

/**
 * Refuse a job that has already had all the photographs we keep.
 *
 * 409, like `review-media.ts`'s sixth upload and for the same reason: the world
 * is the way it is and no edit to the payload changes it. At `presign` this is
 * answered before a signature exists at all; at `complete` it is answered inside
 * the transaction, under the job's lock, which is what stops two calls landing
 * either side of one count and both passing.
 */
async function assertJobUnderPhotoCap(reader: VendorReader, jobId: string): Promise<void> {
  const held = await countJobPhotos(reader, jobId)
  if (held < MAX_QC_PHOTOS_PER_JOB) return

  throw new VendorWriteRefused(409, {
    error:
      `This job already holds the ${MAX_QC_PHOTOS_PER_JOB} photographs we keep for one ` +
      `piece, counting shots that were replaced. Tell us what is missing rather than ` +
      `uploading more.`,
    code: 'PHOTO_LIMIT_REACHED',
    limit: MAX_QC_PHOTOS_PER_JOB,
    held,
  })
}

/** Refuse unless the job is in the window where its shot list may change. */
function assertJobAcceptsPhotos(status: ProductionJobStatus): void {
  if (QC_PHOTO_UPLOAD_STATUSES.includes(status)) return

  throw new VendorWriteRefused(409, {
    error:
      `This job is '${status}', so its photographs can no longer be changed. ` +
      `Shots can be added, replaced or withdrawn while it is ` +
      `${QC_PHOTO_UPLOAD_STATUSES.join(' or ')}.`,
    code: 'JOB_NOT_ACCEPTING_PHOTOS',
    status,
    allowed: [...QC_PHOTO_UPLOAD_STATUSES],
  })
}

/**
 * Refuse a slot this job's stage does not ask for.
 *
 * 422, not 400: `qcSlotSchema` already rejected anything outside the vocabulary
 * at the route, so what reaches here is a REAL slot aimed at the wrong stage —
 * `frame_back` on a print job. The payload parses; it just names things that do
 * not line up, which is exactly the 422/400 split this router keeps.
 */
function assertSlotOnShotList(stage: string, slot: string): void {
  const slots = qcShotsForStage(stage as QcStage)?.map((shot) => shot.slot) ?? []
  if (slots.includes(slot)) return

  throw new VendorWriteRefused(422, {
    error:
      `'${slot}' is not a shot this job asks for. A ${stage} job is photographed as: ` +
      `${slots.join(', ')}.`,
    code: 'SLOT_NOT_ON_SHOT_LIST',
    slot,
    stage,
    slots,
  })
}

/** Run a body that refuses by throwing, and answer the refusal instead. */
async function refusable<T>(body: () => Promise<T>): Promise<T | VendorJobRefusal> {
  try {
    return await body()
  } catch (error) {
    if (error instanceof VendorWriteRefused) return error.refusal
    throw error
  }
}

export interface VendorQcPhotoSlotAccepted {
  ok: true
  jobId: string
  stage: string
  slot: string
}

/**
 * May this vendor upload THIS slot on THIS job, right now?
 *
 * Read-only, and it signs nothing: the caller builds the key and reaches the
 * presigner only on an `ok` answer. That ordering is the requirement — a signed
 * URL that is generated and then withheld has still been generated, and lives
 * in whatever log, trace or crash dump saw it.
 */
export async function assertVendorMayUploadQcPhoto(
  vendorId: string | null | undefined,
  jobId: string | undefined,
  slot: string
): Promise<VendorQcPhotoSlotAccepted | VendorJobRefusal> {
  assertVendorId(vendorId)

  return refusable(async () => {
    const job = jobId ? await getVendorJob(vendorId, jobId) : null
    if (!job || !jobId) {
      throw new VendorWriteRefused(404, { error: 'Job not found', code: 'JOB_NOT_FOUND' })
    }

    assertJobAcceptsPhotos(job.status)
    assertSlotOnShotList(job.stage, slot)
    // Volume, checked BEFORE a signature exists. `presign` writes no row, so
    // this is the only place the count can stop an upload that would otherwise
    // put bytes in the bucket and be refused afterwards at `complete`.
    await assertJobUnderPhotoCap(db, jobId)

    return { ok: true as const, jobId, stage: job.stage, slot }
  })
}

export interface VendorQcPhotoInput {
  slot: string
  objectKey: string
  contentType: string
  sizeBytes: number
  uploadedBy: string | null
}

export interface VendorQcPhotoAccepted {
  ok: true
  photo: VendorQcPhoto
  /** The shot this one replaced, or null when the slot was empty. */
  supersededPhotoId: string | null
}

/**
 * Record an uploaded photograph, superseding whatever held the slot.
 *
 * Everything `assertVendorMayUploadQcPhoto` checked is checked AGAIN, against a
 * locked row. The two calls are minutes apart — that is the whole reason the
 * presign/complete split exists — and nothing guarantees the second came from
 * the same page, or that the job has not been cancelled or moved to QC in
 * between.
 *
 * The job row is locked FOR UPDATE first, which is what serialises two
 * `complete` calls for the same slot. Without it both read an empty slot, both
 * insert, and the partial unique index turns the second into a 500 instead of a
 * supersession — the same reasoning `routes/review-media.ts` locks the parent
 * review row for.
 */
export async function recordVendorQcPhoto(
  vendorId: string | null | undefined,
  jobId: string | undefined,
  input: VendorQcPhotoInput
): Promise<VendorQcPhotoAccepted | VendorJobRefusal> {
  assertVendorId(vendorId)

  // Defence in depth. The route rebuilds the key from `(jobId, slot, filename)`
  // and refuses a mismatch, so this is unreachable through the router — but
  // this module is the boundary, and a boundary that trusts its only caller is
  // a boundary that stops being one the day a second caller appears.
  const key = objectKeyForScope('qcPhoto', input.objectKey)
  if (!key || !jobId || !key.startsWith(`production-qc/${jobId}/`)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'That upload key does not belong to this job.',
        code: 'PHOTO_NOT_FOUND',
      },
    }
  }

  return refusable(async () =>
    db.transaction(async (tx) => {
      const [job] = await tx
        .select({
          id: productionJobs.id,
          stage: productionJobs.stage,
          status: productionJobs.status,
        })
        .from(productionJobs)
        // Scoped again, not trusted from the pre-read: an admin who reassigned
        // the job in between must win, and this must find nothing.
        .where(and(eq(productionJobs.id, jobId), eq(productionJobs.vendorId, vendorId)))
        .limit(1)
        .for('update')

      if (!job) {
        throw new VendorWriteRefused(404, { error: 'Job not found', code: 'JOB_NOT_FOUND' })
      }

      assertJobAcceptsPhotos(job.status)
      assertSlotOnShotList(job.stage, input.slot)
      // The ENFORCEMENT half. Inside the transaction and behind the job's
      // `FOR UPDATE`, so two `complete` calls cannot read the same count either
      // side of one insert and both pass it — `review-media.ts` locks its parent
      // review row for exactly this, and the lock above is already held here.
      await assertJobUnderPhotoCap(tx, jobId)

      const [held] = await tx
        .select({ id: productionJobPhotos.id })
        .from(productionJobPhotos)
        .where(
          and(
            eq(productionJobPhotos.jobId, jobId),
            eq(productionJobPhotos.slot, input.slot),
            isNull(productionJobPhotos.supersededAt)
          )
        )
        .limit(1)

      const now = new Date()

      // STAMP FIRST, insert second. The partial unique index allows exactly one
      // row per `(job_id, slot)` with a null `superseded_at`; inserting before
      // the old row is stamped violates it, and deleting the old row instead
      // would throw away the history this table exists to keep.
      if (held) {
        await tx
          .update(productionJobPhotos)
          .set({ supersededAt: now })
          .where(
            and(
              eq(productionJobPhotos.id, held.id),
              eq(productionJobPhotos.jobId, jobId),
              // Repeated rather than trusted from the read: anybody who
              // superseded it in between wins, and we match nothing.
              isNull(productionJobPhotos.supersededAt)
            )
          )
      }

      const [row] = await tx
        .insert(productionJobPhotos)
        .values({
          jobId,
          slot: input.slot,
          objectKey: key,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          uploadedBy: input.uploadedBy,
          uploadedAt: now,
        })
        // Narrow on purpose, and it is also the customer-free list: nothing on
        // this table names a customer, and the projection stays explicit so the
        // next column added to it does not arrive in a response by default.
        .returning({
          id: productionJobPhotos.id,
          slot: productionJobPhotos.slot,
          objectKey: productionJobPhotos.objectKey,
          contentType: productionJobPhotos.contentType,
          sizeBytes: productionJobPhotos.sizeBytes,
          uploadedAt: productionJobPhotos.uploadedAt,
          reviewId: productionJobPhotos.reviewId,
        })

      if (!row) {
        throw new VendorWriteRefused(409, {
          error: 'The photograph was not recorded; nothing was changed.',
          code: 'CONCURRENT_MODIFICATION',
        })
      }

      return {
        ok: true as const,
        photo: {
          id: row.id,
          slot: row.slot,
          key: objectKeyForScope('qcPhoto', row.objectKey),
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
          uploadedAt: row.uploadedAt,
          reviewId: row.reviewId,
        },
        supersededPhotoId: held?.id ?? null,
      }
    })
  )
}

export interface VendorQcPhotoRetracted {
  ok: true
  photoId: string
  slot: string
}

/**
 * Withdraw a photograph — by SUPERSEDING it, never by deleting it.
 *
 * The route is spelled `DELETE` and the collection it removes the row from is
 * the LIVE shot list, which is what `superseded_at IS NULL` means. The row and
 * the R2 object both survive: a hard delete would orphan the object forever,
 * and the 400-day retention window exists precisely so the audit row and the
 * photograph it refers to do not outlive each other in opposite directions.
 *
 * A photograph a review already judged can still be withdrawn. That is not an
 * oversight: `qc_failed -> received` is a REWORK, and reshooting is the whole
 * point of it. The judged row keeps its `review_id` and its place in history,
 * so what the reviewer saw remains answerable.
 */
export async function retractVendorQcPhoto(
  vendorId: string | null | undefined,
  jobId: string | undefined,
  photoId: string | undefined
): Promise<VendorQcPhotoRetracted | VendorJobRefusal> {
  assertVendorId(vendorId)

  return refusable(async () =>
    db.transaction(async (tx) => {
      if (!jobId || !photoId) {
        throw new VendorWriteRefused(404, { error: 'Job not found', code: 'JOB_NOT_FOUND' })
      }

      const [job] = await tx
        .select({ id: productionJobs.id, status: productionJobs.status })
        .from(productionJobs)
        .where(and(eq(productionJobs.id, jobId), eq(productionJobs.vendorId, vendorId)))
        .limit(1)
        .for('update')

      if (!job) {
        throw new VendorWriteRefused(404, { error: 'Job not found', code: 'JOB_NOT_FOUND' })
      }

      assertJobAcceptsPhotos(job.status)

      // Keyed on the job as well as on the id: a real photo id from another
      // job would otherwise be withdrawn by whoever guessed it.
      const [live] = await tx
        .select({ id: productionJobPhotos.id, slot: productionJobPhotos.slot })
        .from(productionJobPhotos)
        .where(
          and(
            eq(productionJobPhotos.id, photoId),
            eq(productionJobPhotos.jobId, jobId),
            isNull(productionJobPhotos.supersededAt)
          )
        )
        .limit(1)

      if (!live) {
        throw new VendorWriteRefused(404, {
          error: 'That photograph is not on this job, or has already been replaced.',
          code: 'PHOTO_NOT_FOUND',
        })
      }

      await tx
        .update(productionJobPhotos)
        .set({ supersededAt: new Date() })
        .where(
          and(
            eq(productionJobPhotos.id, live.id),
            eq(productionJobPhotos.jobId, jobId),
            isNull(productionJobPhotos.supersededAt)
          )
        )

      return { ok: true as const, photoId: live.id, slot: live.slot }
    })
  )
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

// ============================================================================
// Inter-vendor transfers — the parcel between two benches
// ============================================================================

/**
 * ## What a vendor is told about a parcel, and why it is so little
 *
 * `{ id, reference, carrier, pieceCount, dispatchedAt, expectedBy, receivedAt }`
 * — the design's list (§5), verbatim — plus a `direction` computed from the
 * CALLER'S OWN id. No vendor names, no vendor ids, no order id, no cost, no
 * `lostAt`.
 *
 * **Vendor B does not learn the parcel came from vendor A.** That is not
 * discretion, it is the isolation suite's first property: surfacing another
 * vendor's row through this module is precisely what the whole file exists to
 * make inexpressible, and a `fromVendorName` on an inbound parcel would be one.
 * If B needs to chase a carrier, an admin chases it — `routes/admin/transfers.ts`
 * aliases `vendors` twice and sees both ends, because if somebody has to argue
 * with a courier it is us.
 *
 * `direction` is the ONE field added to the design's seven, and it is safe for
 * the reason the other seven are not enough without it: a vendor is a sender on
 * some parcels and a receiver on others, and the receipt confirmation only
 * exists for the inbound ones. It is computed as a SQL `case` over the caller's
 * own vendor id, so neither vendor column is ever selected at all — the answer
 * is "is this coming to me", never "who is at the other end".
 *
 * ## `cost_amount` is absent from every projection AND every input
 *
 * We pay the leg because we chose the routing, so a vendor cannot price a
 * distance we picked, and asking A to absorb it is how rate cards get padded. It
 * is not filtered out of a response; there is no field for it in either
 * direction, which is the only version of that rule a refactor cannot lose.
 *
 * ## The order id never enters this process
 *
 * `production_transfers.order_id` is NOT NULL, so a transfer cannot be created
 * without one — and an order id is a person-linked handle R1 forbids at any
 * depth, in any casing. Both are satisfied by never reading it out: the insert
 * writes it through a scoped SQL sub-select, and "these jobs are all on one
 * order" is a `count(distinct …)` rather than a comparison between values we
 * hold. The value exists only inside the database, where no response, log or
 * crash dump can reach it.
 */
export interface VendorTransfer {
  id: string
  reference: string | null
  carrier: string | null
  pieceCount: number
  dispatchedAt: Date | null
  expectedBy: Date | null
  receivedAt: Date | null
  /** Relative to the CALLER, and the only thing they learn about the other end. */
  direction: 'inbound' | 'outbound'
}

/**
 * The one column list every vendor-facing transfer read uses.
 *
 * A function of `vendorId` rather than a constant, because `direction` is
 * relative to the caller. That is also what keeps `from_vendor_id` and
 * `to_vendor_id` out of the projection entirely: the comparison happens in SQL
 * and only its answer comes back.
 */
function vendorTransferColumns(vendorId: string) {
  return {
    id: productionTransfers.id,
    reference: productionTransfers.reference,
    carrier: productionTransfers.carrier,
    pieceCount: productionTransfers.pieceCount,
    dispatchedAt: productionTransfers.dispatchedAt,
    expectedBy: productionTransfers.expectedBy,
    receivedAt: productionTransfers.receivedAt,
    // Deliberately absent: orderId, fromVendorId, toVendorId, costAmount,
    // lostAt, lostNote, createdBy. Every one of them is either a person-linked
    // handle, another vendor's identity, or money that is not theirs to see.
    direction: sql<'inbound' | 'outbound'>`case when ${productionTransfers.toVendorId} = ${vendorId} then 'inbound' else 'outbound' end`,
  }
}

/** The caller is at one end of this leg — either end. */
function callerIsAnEnd(vendorId: string) {
  return or(
    eq(productionTransfers.fromVendorId, vendorId),
    eq(productionTransfers.toVendorId, vendorId)
  )
}

/**
 * Every parcel with the caller at one end of it, newest first.
 *
 * BOTH ends in one predicate by default. A list showing only the outbound side
 * would leave a vendor unable to confirm anything they were sent, and a list
 * showing only the inbound side would hide the legs they are still on the hook
 * for. `direction` is how the screen tells them apart, and `?direction=` is how
 * it asks for one.
 */
export async function listVendorTransfers(
  vendorId: string | null | undefined,
  opts: { direction?: 'inbound' | 'outbound'; limit?: number; offset?: number } = {}
): Promise<VendorTransfer[]> {
  assertVendorId(vendorId)
  const limit = Math.min(opts.limit ?? 20, 100)
  const offset = opts.offset ?? 0

  const side =
    opts.direction === 'inbound'
      ? eq(productionTransfers.toVendorId, vendorId)
      : opts.direction === 'outbound'
        ? eq(productionTransfers.fromVendorId, vendorId)
        : callerIsAnEnd(vendorId)

  return db
    .select(vendorTransferColumns(vendorId))
    .from(productionTransfers)
    .where(side)
    .orderBy(desc(productionTransfers.createdAt))
    .limit(limit)
    .offset(offset)
}

/**
 * One parcel the caller is an end of, with the caller's OWN jobs on it.
 *
 * `jobIds` is scoped a second time, at `production_jobs.vendor_id`, and that is
 * the whole point of entering the join from the job side: the jobs on a parcel
 * belong to the SENDER, so a receiving vendor gets an empty list rather than a
 * handle on somebody else's row. Listing them unscoped would hand B a set of
 * stable identifiers for A's work — a smaller leak than a vendor name, and the
 * same kind.
 */
export async function getVendorTransfer(
  vendorId: string | null | undefined,
  transferId?: string
): Promise<(VendorTransfer & { jobIds: string[] }) | null> {
  assertVendorId(vendorId)
  if (!transferId) return null

  // vendorId in the WHERE, not checked afterwards: a parcel with neither end at
  // this vendor is NOT FOUND, which is also the right thing to leak (nothing).
  const [transfer] = await db
    .select(vendorTransferColumns(vendorId))
    .from(productionTransfers)
    .where(and(eq(productionTransfers.id, transferId), callerIsAnEnd(vendorId)))
    .limit(1)

  if (!transfer) return null

  const jobs = await db
    .select({ id: productionJobs.id })
    .from(productionJobs)
    .innerJoin(productionTransferJobs, eq(productionTransferJobs.jobId, productionJobs.id))
    .where(
      and(
        eq(productionTransferJobs.transferId, transferId),
        eq(productionJobs.vendorId, vendorId)
      )
    )
    .orderBy(asc(productionJobs.createdAt))

  return { ...transfer, jobIds: jobs.map((job) => job.id) }
}

/** What the vendor supplies. Every other column is ours, or derived. */
export interface VendorTransferInput {
  jobIds: string[]
  carrier: string | null
  reference: string | null
  pieceCount: number
  /**
   * The CARRIER'S promise, which the vendor holds the docket for. Not an SLA
   * clock about their own performance — `dispatched_at` is that, and the server
   * stamps it — so there is no lie available here that back-dating a despatch
   * would be.
   */
  expectedBy: Date | null
  createdBy: string | null
}

export interface VendorTransferAccepted {
  ok: true
  transfer: VendorTransfer
  /** The caller's own jobs that rode it. Empty on a receipt: they hold none. */
  jobIds: string[]
}

/** What the despatch audit row records, taken from the write itself. */
export interface VendorTransferDispatchRecord {
  transferId: string
  reference: string | null
  carrier: string | null
  pieceCount: number
  jobIds: string[]
  dispatchedAt: Date
  expectedBy: Date | null
}

/**
 * What the receipt audit row records.
 *
 * `jobIds` is the parcel's MANIFEST — the sending vendor's jobs — and it exists
 * for the trail and for nothing else. An admin reading
 * `production_transfer.received` has to be able to answer "what arrived" without
 * joining anything, which is the same reason the despatch row carries them. It
 * never reaches a response: `markVendorTransferReceived` answers `jobIds: []`,
 * because the receiving vendor holds none of them and a set of stable handles on
 * the sender's work is a smaller version of the sender's name.
 */
export interface VendorTransferReceiptRecord {
  transferId: string
  reference: string | null
  receivedAt: Date
  jobIds: string[]
}

/**
 * Called INSIDE the transaction, after the write and before the commit.
 *
 * Same split as `VendorTransitionAudit`: the audit vocabulary stays in the route
 * (which holds the request context), the transaction stays here (which holds the
 * data access). A row saying "this parcel was despatched" beside a transfer that
 * rolled back is worse than no row, so these share the transaction — and share
 * its failures, which is the point.
 */
export type VendorTransferDispatchAudit = (
  tx: VendorAuditWriter,
  move: VendorTransferDispatchRecord
) => Promise<void>

export type VendorTransferReceiptAudit = (
  tx: VendorAuditWriter,
  move: VendorTransferReceiptRecord
) => Promise<void>

/**
 * Vendor A despatches a parcel, and the jobs on it move with it.
 *
 * ## The two halves cannot come apart
 *
 * Despatching is what makes `qc_passed -> dispatched` legal — that edge's guard
 * is `open-transfer-or-order-label` — so the ORDER of this transaction is the
 * design, not an implementation detail:
 *
 * 1. lock the caller's jobs, and refuse anything the matrix will not move;
 * 2. INSERT the transfer and its job links;
 * 3. EVALUATE the guard, which now sees the parcel we just created;
 * 4. move the jobs, with the predicate repeated.
 *
 * A transfer whose jobs never moved leaves an order permanently unlabelable —
 * `dispatched` is terminal and the readiness gate wants every job either
 * `qc_passed` at the consolidator or `dispatched` on a received transfer. Jobs
 * that moved with no transfer is the same failure from the other side. One
 * transaction makes both unreachable; the guard being evaluated rather than
 * assumed is what makes step 3 worth writing at all, since an edge whose guard
 * nobody evaluates is an unguarded edge with a comment.
 *
 * ## The destination is DERIVED, never named
 *
 * `to_vendor_id` is the order's consolidator, read through
 * `order_consolidation` joined off the caller's OWN job. A vendor does not get
 * to name a counterparty: we chose the routing (which is exactly why we, not
 * they, pay for the leg), and letting A name B would be A learning who else is
 * working this order. `from_vendor_id` is the session, so a transfer is created
 * only by its sending end and there is no field in which to say otherwise.
 *
 * ## A job is on at most one transfer, EVER
 *
 * `production_transfer_jobs_job_id_unique` is the enforcement. The explicit
 * check below exists so the answer is a 409 naming the jobs rather than a 500
 * out of the index — and it is checked against the caller's own rows, so it
 * cannot be used to probe whether somebody else's job is in transit. A lost
 * parcel produces a REPLACEMENT job (`routes/admin/transfers.ts`), never a
 * second leg for the original.
 */
export async function createVendorTransfer(
  vendorId: string | null | undefined,
  input: VendorTransferInput,
  hooks: { onDispatch?: VendorTransferDispatchAudit } = {}
): Promise<VendorTransferAccepted | VendorJobRefusal> {
  assertVendorId(vendorId)

  const jobNotFound: VendorJobRefusal['body'] = {
    error: 'Job not found',
    code: 'JOB_NOT_FOUND',
  }

  const requested = [...new Set(input.jobIds)]
  if (requested.length === 0) {
    return { ok: false, status: 404, body: jobNotFound }
  }

  return refusable(async () =>
    db.transaction(async (tx) => {
      // FOR UPDATE, and SCOPED: an admin who reassigned one of these in between
      // must win, and this must find nothing. Two tabs despatching the same jobs
      // serialise here rather than both reading "not yet on a parcel".
      const jobs = await tx
        .select({
          id: productionJobs.id,
          stage: productionJobs.stage,
          status: productionJobs.status,
          // Not in any response projection, and never will be. The freeze is
          // about this column; the vendor is told what it means, not its value.
          settlementId: productionJobs.settlementId,
        })
        .from(productionJobs)
        .where(and(inArray(productionJobs.id, requested), eq(productionJobs.vendorId, vendorId)))
        .for('update')

      // 404 for "not yours" and for "no such job" alike, and deliberately not
      // distinguished — nor are the missing ids named, because naming them is
      // exactly the confirmation the 404 exists to withhold.
      if (jobs.length !== requested.length) {
        throw new VendorWriteRefused(404, jobNotFound)
      }

      for (const job of jobs) {
        // Checked FIRST, like `updateVendorJob`: it is the one refusal that
        // changes what the vendor should do next, and they already know the job
        // exists because it is theirs.
        if (job.status === 'cancelled') {
          throw new VendorWriteRefused(409, {
            error:
              'One of these jobs was cancelled, so there is nothing left to send. ' +
              'Take it off the parcel and check your queue for the current work.',
            code: 'JOB_CANCELLED',
            jobIds: [job.id],
          })
        }

        if (job.settlementId !== null) {
          throw new VendorWriteRefused(409, {
            error:
              'One of these jobs has already been settled and can no longer be moved. ' +
              'Raise it with us rather than re-opening a paid job.',
            code: 'JOB_SETTLED',
            jobIds: [job.id],
          })
        }

        // The matrix decides; this module only asks. Only `qc_passed` carries a
        // vendor edge into `dispatched`, and that fact lives in ONE place.
        try {
          assertTransition(job.status, 'dispatched', 'vendor')
        } catch (error) {
          if (error instanceof ProductionTransitionError) {
            throw new VendorWriteRefused(409, {
              ...error.toResponseBody(),
              code: 'ILLEGAL_TRANSITION',
              jobIds: [job.id],
            })
          }
          throw error
        }
      }

      // ONE row, and the order id is not in it. `count(distinct)` answers "are
      // these all on one order" without the value ever leaving the database, and
      // the consolidator is reached by JOIN off the caller's own scoped rows —
      // the same shape `getVendorJobLabelKey` uses for the same reason.
      const [routing] = await tx
        .select({
          orderCount: sql<number>`count(distinct ${productionJobs.orderId})`,
          consolidatorVendorId: sql<
            string | null
          >`max(${orderConsolidation.vendorId}::text)`,
        })
        .from(productionJobs)
        .leftJoin(orderConsolidation, eq(orderConsolidation.orderId, productionJobs.orderId))
        .where(and(inArray(productionJobs.id, requested), eq(productionJobs.vendorId, vendorId)))

      if (Number(routing?.orderCount ?? 0) !== 1) {
        // One parcel, one order. `production_transfers.order_id` is
        // single-valued, and the readiness gate reads every transfer on ONE
        // order — a parcel spanning two would be invisible to one of them.
        throw new VendorWriteRefused(422, {
          error:
            'These jobs are not all on the same order, so they cannot ride one parcel. ' +
            'Send one parcel per order.',
          code: 'JOBS_SPAN_ORDERS',
        })
      }

      const toVendorId = routing?.consolidatorVendorId ?? null
      if (!toVendorId) {
        // Absence is meaningful: no `order_consolidation` row means nobody has
        // decided who assembles this order, so there is nowhere to send it.
        throw new VendorWriteRefused(409, {
          error:
            'Nobody has been chosen to assemble this order yet, so there is nowhere ' +
            'to send it. We will route it and it will appear in your queue.',
          code: 'NO_CONSOLIDATOR',
        })
      }

      if (toVendorId === vendorId) {
        // The receiving end of a leg is the vendor who assembles the order. They
        // have no leg to book — the goods are already on their bench — which is
        // what closes the whole create surface to the receiving end without a
        // single check that names a counterparty.
        throw new VendorWriteRefused(422, {
          error:
            'You are assembling this order yourself, so there is no parcel to send. ' +
            'Keep the pieces and despatch the order when the rest arrives.',
          code: 'CONSOLIDATOR_IS_SELF',
        })
      }

      // The unique index is the real enforcement; this is here so the answer
      // NAMES the job instead of being a 500 out of a constraint. Scoped through
      // the caller's own jobs, so it cannot be used to probe somebody else's.
      const already = await tx
        .select({ jobId: productionTransferJobs.jobId })
        .from(productionTransferJobs)
        .innerJoin(productionJobs, eq(productionJobs.id, productionTransferJobs.jobId))
        .where(
          and(
            inArray(productionTransferJobs.jobId, requested),
            eq(productionJobs.vendorId, vendorId)
          )
        )

      if (already.length > 0) {
        throw new VendorWriteRefused(409, {
          error:
            'These jobs have already been sent on a parcel, and a job rides exactly one. ' +
            'If that parcel went missing we will raise a replacement job for it.',
          code: 'JOB_ALREADY_ON_TRANSFER',
          jobIds: already.map((row) => row.jobId),
        })
      }

      const dispatchedAt = new Date()
      const anchor = jobs[0]!

      const [transfer] = await tx
        .insert(productionTransfers)
        .values({
          /**
           * NEVER read out. `order_id` is NOT NULL and it is a person-linked
           * handle R1 forbids at any depth — so it is copied from the caller's
           * own job INSIDE the database, with the vendor predicate repeated in
           * the sub-select, and never becomes a value this process holds.
           */
          orderId: sql<string>`(select ${productionJobs.orderId} from ${productionJobs} where ${productionJobs.id} = ${anchor.id} and ${productionJobs.vendorId} = ${vendorId})` as never,
          // The session, not the body. A transfer is created only by its
          // sending end, and there is no field in which to claim otherwise.
          fromVendorId: vendorId,
          // DERIVED. We chose the routing, so a vendor does not name a
          // counterparty — and naming one would be a vendor learning who else
          // is working this order.
          toVendorId,
          carrier: input.carrier,
          reference: input.reference,
          pieceCount: input.pieceCount,
          // OUR clock. A vendor back-dating a despatch is a lie about an SLA
          // clock, and there is no field in which to say it.
          dispatchedAt,
          expectedBy: input.expectedBy,
          createdBy: input.createdBy,
          // `costAmount` is deliberately absent, in both directions. We pay the
          // leg because we picked the route.
        })
        .returning(vendorTransferColumns(vendorId))

      if (!transfer) {
        throw new VendorWriteRefused(409, {
          error: 'The parcel was not recorded; nothing was changed.',
          code: 'CONCURRENT_MODIFICATION',
        })
      }

      await tx
        .insert(productionTransferJobs)
        .values(jobs.map((job) => ({ transferId: transfer.id, jobId: job.id })))

      // ...and NOW the guard, which the matrix names on the edge we are about to
      // take. It reads the parcel we just inserted, inside this transaction,
      // which is the entire reason the insert comes first.
      for (const job of jobs) {
        await assertVendorGuardSatisfied(
          tx,
          { jobId: job.id, vendorId, stage: job.stage },
          job.status,
          'dispatched'
        )
      }

      // The statuses we actually READ, repeated in the WHERE rather than trusted
      // from the read: anybody who moved or settled one in between wins, and we
      // match nothing. Derived from the rows, so no second copy of the matrix.
      const fromStatuses = [...new Set(jobs.map((job) => job.status))]

      const written = await tx
        .update(productionJobs)
        .set({ status: 'dispatched', dispatchedAt, updatedAt: dispatchedAt })
        .where(
          and(
            inArray(
              productionJobs.id,
              jobs.map((job) => job.id)
            ),
            eq(productionJobs.vendorId, vendorId),
            inArray(productionJobs.status, fromStatuses),
            isNull(productionJobs.settlementId)
          )
        )
        // Narrow on purpose: the raw row carries `orderId`.
        .returning({ id: productionJobs.id })

      if (written.length !== jobs.length) {
        // The whole transaction goes back — including the transfer. A parcel
        // whose jobs never moved is exactly the state the ordering above exists
        // to make impossible.
        throw new VendorWriteRefused(409, {
          error: `Expected to move ${jobs.length} job(s) but matched ${written.length}; nothing was recorded`,
          code: 'CONCURRENT_MODIFICATION',
        })
      }

      // Inside the transaction, and its failure aborts the despatch. Catching it
      // here to "keep going" would answer 201 over a write about to roll back.
      await hooks.onDispatch?.(tx, {
        transferId: transfer.id,
        reference: transfer.reference,
        carrier: transfer.carrier,
        pieceCount: transfer.pieceCount,
        jobIds: jobs.map((job) => job.id),
        dispatchedAt,
        expectedBy: transfer.expectedBy,
      })

      return { ok: true as const, transfer, jobIds: jobs.map((job) => job.id) }
    })
  )
}

/**
 * Vendor B confirms a parcel arrived.
 *
 * ## Only the receiving end, and it is not an `if`
 *
 * `to_vendor_id` is in the WHERE of both the locked read and the UPDATE, so
 * vendor A asking about their own outbound parcel finds NOTHING — a 404, not a
 * 403, because 403 would confirm a row they are not entitled to know about.
 * There is no branch in application code where that check could be skipped.
 *
 * ## No job moves
 *
 * A received parcel is a fact about the PARCEL. In the consolidation case the
 * receiving vendor has no job for the piece at all — the rolled poster has
 * `frame_id NULL`, so there is no second row to move — which is the first of the
 * four reasons the transfer is its own entity. The readiness gate reads the
 * transfer, not a status: a `dispatched` job counts only if it rode a transfer
 * to the consolidator that is received and not lost.
 *
 * ## What it refuses, and why each one is a 409
 *
 * Already received (the dispute is about something else), already declared lost
 * (an admin wrote it off and raised replacement work; a vendor un-writing that
 * off is a vendor deciding who eats a cost), and not yet dispatched (nothing
 * left the sending vendor, so nothing can have arrived). All three are "the
 * world moved", never "your payload is wrong" — there is no payload.
 */
export async function markVendorTransferReceived(
  vendorId: string | null | undefined,
  transferId?: string,
  hooks: { onReceipt?: VendorTransferReceiptAudit } = {}
): Promise<VendorTransferAccepted | VendorJobRefusal> {
  assertVendorId(vendorId)

  const notFound: VendorJobRefusal['body'] = {
    error: 'Transfer not found',
    code: 'TRANSFER_NOT_FOUND',
  }

  if (!transferId) return { ok: false, status: 404, body: notFound }

  return refusable(async () =>
    db.transaction(async (tx) => {
      // FOR UPDATE: two of the receiving vendor's tabs confirming the same
      // parcel must serialise here rather than both read "not yet arrived".
      const [before] = await tx
        .select({
          id: productionTransfers.id,
          reference: productionTransfers.reference,
          dispatchedAt: productionTransfers.dispatchedAt,
          receivedAt: productionTransfers.receivedAt,
          // READ, NEVER PROJECTED. `lostAt` decides the refusal below and has
          // never been in a vendor-facing projection. The refusal itself does
          // say the parcel was written off and the work is being remade, and
          // that is deliberate: this reaches the RECEIVING vendor, the one
          // standing there waiting for a parcel that is never coming, and
          // "cannot be confirmed" with no reason is how a consolidator stays
          // frozen holding an order open for a piece nobody is sending. What
          // stays inside is the ledger around it — WHEN we wrote it off, what it
          // cost, who is remaking it and at whose expense. None of that is a
          // vendor's to see, and none of it is in the message.
          lostAt: productionTransfers.lostAt,
        })
        .from(productionTransfers)
        // The receiving end ONLY. The sending vendor finds nothing here, which
        // is what makes "received_at is settable only by to_vendor_id" a
        // predicate rather than a comment.
        .where(
          and(
            eq(productionTransfers.id, transferId),
            eq(productionTransfers.toVendorId, vendorId)
          )
        )
        .limit(1)
        .for('update')

      if (!before) throw new VendorWriteRefused(404, notFound)

      if (before.receivedAt) {
        throw new VendorWriteRefused(409, {
          error: `This parcel was already confirmed as arrived on ${before.receivedAt.toISOString()}.`,
          code: 'TRANSFER_ALREADY_RECEIVED',
        })
      }

      if (before.lostAt) {
        throw new VendorWriteRefused(409, {
          error:
            'This parcel was written off and the work is being remade. ' +
            'If it has turned up, tell us rather than confirming it here.',
          code: 'TRANSFER_LOST',
        })
      }

      if (!before.dispatchedAt) {
        throw new VendorWriteRefused(409, {
          error:
            'This parcel has not been sent yet, so it cannot have arrived. ' +
            'Confirm it once the sending vendor despatches it.',
          code: 'TRANSFER_NOT_DISPATCHED',
        })
      }

      // The manifest, read behind the scoped parcel and only for the audit row.
      // No vendor id in the WHERE and none is available: the join table has no
      // vendor column. What makes this safe is the read above — the parcel was
      // proved to be at this caller's receiving end before anything here ran,
      // which is exactly what `JOB_KEYED_TABLES` means in the isolation suite.
      const carried = await tx
        .select({ jobId: productionTransferJobs.jobId })
        .from(productionTransferJobs)
        .where(eq(productionTransferJobs.transferId, transferId))

      const receivedAt = new Date()

      // Every predicate REPEATED, and the row count turns a race into a
      // rollback rather than a second confirmation over a parcel somebody has
      // meanwhile declared lost.
      const claimed = await tx
        .update(productionTransfers)
        .set({ receivedAt, updatedAt: receivedAt })
        .where(
          and(
            eq(productionTransfers.id, transferId),
            eq(productionTransfers.toVendorId, vendorId),
            isNotNull(productionTransfers.dispatchedAt),
            isNull(productionTransfers.receivedAt),
            isNull(productionTransfers.lostAt)
          )
        )
        .returning({ id: productionTransfers.id })

      if (claimed.length !== 1) {
        throw new VendorWriteRefused(409, {
          error:
            'This parcel was confirmed or written off by someone else; nothing was recorded',
          code: 'CONCURRENT_MODIFICATION',
        })
      }

      await hooks.onReceipt?.(tx, {
        transferId,
        reference: before.reference,
        receivedAt,
        jobIds: carried.map((row) => row.jobId),
      })

      // Re-read through the same narrow column list every other read uses, from
      // the TRANSACTION — a read outside it could not see the write.
      const [transfer] = await tx
        .select(vendorTransferColumns(vendorId))
        .from(productionTransfers)
        .where(
          and(
            eq(productionTransfers.id, transferId),
            eq(productionTransfers.toVendorId, vendorId)
          )
        )
        .limit(1)

      if (!transfer) throw new VendorWriteRefused(404, notFound)

      // The receiving vendor holds no job on the parcel — they belong to the
      // sender — so there is nothing of theirs to list.
      return { ok: true as const, transfer, jobIds: [] }
    })
  )
}
