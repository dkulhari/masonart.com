/**
 * Vendor Portal Routes
 *
 * - GET    /api/vendor/jobs       my queue; what to work on next
 * - GET    /api/vendor/jobs/:id   one job, its items and its QC history
 * - PATCH  /api/vendor/jobs/:id   the transition a vendor may take
 * - GET    /api/vendor/jobs/:id/artwork/:itemId   a short-lived signed download
 * - GET    /api/vendor/jobs/:id/label             the carrier PDF, signed
 * - GET    /api/vendor/jobs/:id/photos            my shot list, signed
 * - POST   /api/vendor/jobs/:id/photos/presign    authorise a direct-to-R2 PUT
 * - POST   /api/vendor/jobs/:id/photos/complete   record what landed
 * - DELETE /api/vendor/jobs/:id/photos/:photoId   withdraw a shot
 * - GET    /api/vendor/transfers                  parcels at either of my ends
 * - GET    /api/vendor/transfers/:id              one parcel, and my jobs on it
 * - POST   /api/vendor/transfers                  despatch a parcel to the consolidator
 * - POST   /api/vendor/transfers/:id/received     confirm one arrived
 * - GET    /api/vendor/rates      my rate card, read-only
 * - GET    /api/vendor/payments   my settlements and what is still owed
 *
 * **This file contains no database access.** There is no `db` import, no table
 * import and no query builder anywhere below — every read and the single write
 * go through `lib/vendor-scope.ts` with the `vendorId` the `requireVendor`
 * middleware resolved into context. That is not a stylistic preference: a
 * vendor sees only their own rows, which `requireRole` cannot express, so the
 * filter lives in one module where it has ONE testable home. A handler that
 * needs data the scoped module does not expose gets a new scoped function
 * there; reaching around the module reintroduces the audit-every-route problem
 * the module exists to delete.
 *
 * Three specifics worth the ink:
 *
 * 1. **A wrong-vendor job is 404, never 403.** The scoped read puts `vendorId`
 *    in the WHERE, so the row simply is not found. 403 would confirm the job
 *    exists, which is exactly the fact a vendor should not learn.
 *
 * 2. **PATCH loads the job FIRST.** `getVendorJob(vendorId, id)` runs before any
 *    write is built, and a miss ends the request. Updating by id and checking
 *    ownership afterwards behaves identically on the happy path and disastrously
 *    the day the check is wrong. The scoped module then re-reads the row under
 *    `FOR UPDATE` inside its transaction, because this answer is a round trip
 *    old by the time the write is built.
 *
 * 3. **The PATCH body is ONE field, and it names a transition.** Not a patch:
 *    `status`, and nothing else. No amount field exists in the schema, so
 *    `amountExpected` and `amountActual` cannot arrive by accident — amounts
 *    come from the rate card at assignment, and a vendor may not price their own
 *    job. No date field exists either, so the SERVER stamps `receivedAt`,
 *    `qcSubmittedAt` and `dispatchedAt`: a vendor back-dating receipt is a lie
 *    about an SLA clock, and the only way to make it unsayable is to give it no
 *    field to say it in.
 *
 *    The status vocabulary is IMPORTED from `lib/production-transitions.ts`,
 *    where it is a `filter` over the transition matrix. It used to be a literal
 *    here — `["sent", "received"]` — which is how the RETIRED `sent` stayed in a
 *    vendor's public vocabulary for two phases after #675 erased it from the
 *    rows, and how `qc_submitted` and `dispatched` stayed out of it long after
 *    the matrix gave a vendor both. Passing QC is still ours to record, not
 *    theirs to claim: `qc_passed` and `qc_failed` have no vendor edge, so they
 *    are not in the derived tuple and cannot be named here.
 *
 * 4. **The photo upload is a presign/complete pair, and the bytes are not ours
 *    to carry.** `routes/review-media.ts`'s pattern, reused rather than
 *    re-derived: the browser PUTs straight to R2 against a short-lived
 *    signature, and `complete` re-validates everything `presign` checked
 *    because the two calls are minutes apart. `complete` also verifies the
 *    returned key by REBUILDING it from `(jobId, slot, filename)` — a key is a
 *    claim, and one naming another job or another slot would file a photograph
 *    under a shot nobody took. Every signature on this file is produced inside
 *    ONE named scope of `VENDOR_SIGNING_SCOPES`: artwork under `artwork`,
 *    photographs under `qcPhoto`, and neither may sign the other's key.
 *
 * 5. **A transfer tells a vendor about a PARCEL, never about the vendor at the
 *    other end.** `{ id, reference, carrier, pieceCount, dispatchedAt,
 *    expectedBy, receivedAt }` and a `direction` computed from the caller's own
 *    id — no vendor name, no vendor id, no order id, no cost. Vendor B does not
 *    learn the parcel came from vendor A; if B needs to chase a carrier, an
 *    admin chases it, because the admin sees both ends. The two writes belong to
 *    opposite ends and neither may borrow the other's: a transfer is created
 *    only by `from_vendor_id` and received only by `to_vendor_id`, both as
 *    predicates in the scoped module rather than as branches here. And
 *    `cost_amount` has no field in either direction — we pay the leg because we
 *    chose the routing.
 *
 * 6. **The carrier label is the ONE exception, and it is not an exception to
 *    R1.** Vendors despatch directly now, so the label the courier honours
 *    carries the customer's name, address and phone — there is no version of
 *    this feature where a vendor never touches that. What is still absolute is
 *    HOW: rendered bytes behind a five-minute signature, handed to the operating
 *    system, never as fields and never composed here. `GET /jobs/:id/label`
 *    answers `{ jobId, url, expiresInSeconds, expiresAt }` and the customer is
 *    inside the PDF, never beside it. `getVendorJobLabelKey` puts all four
 *    authorisation conditions in ONE WHERE — the job is theirs, they are the
 *    order's consolidator, the job is in a status where a label is legitimately
 *    needed, a label exists — so a vendor who holds a job on the
 *    order but is not despatching it gets `null`, a 404, AND NO SIGNATURE. The
 *    ordering is the requirement, not the status code: a signed URL that is
 *    generated and then withheld has still been generated, and lives in
 *    whatever log, trace or crash dump saw it.
 *
 * Zero customer data crosses this boundary AS DATA — no name, address, phone,
 * email or person-linked order reference in any response body. Every response
 * here is built from the scoped module's explicit column lists, which is what
 * makes that an absolute rather than a habit. The one document that carries
 * customer data is the carrier label, and it arrives as rendered bytes behind a
 * signature, never as fields.
 *
 * `tests/routes/vendor/isolation.test.ts` asserts all of that as PROPERTIES
 * over a route table rather than per handler, so a route added below without a
 * table entry fails that suite instead of quietly going uncovered.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import {
  QC_PHOTO_CONTENT_TYPES,
  QC_PHOTO_MAX_BYTES,
  qcShotsForStage,
  qcSlotSchema,
  requiredQcSlots,
  type QcStage,
} from "@chobii/shared";

import { requireAuth } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";
import { requireVendor, type VendorVariables } from "../middleware/vendor";
import { recordAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { VENDOR_SETTABLE_STATUSES } from "../lib/production-transitions";
import {
  listVendorJobs,
  getVendorJob,
  getVendorJobItems,
  getVendorJobReviews,
  updateVendorJob,
  listVendorRates,
  listVendorSettlements,
  getVendorPayableTotal,
  getVendorJobArtwork,
  getVendorJobLabelKey,
  LabelSeamNotReady,
  listVendorJobPhotos,
  assertVendorMayUploadQcPhoto,
  recordVendorQcPhoto,
  retractVendorQcPhoto,
  listVendorTransferCandidates,
  listVendorTransfers,
  getVendorTransfer,
  createVendorTransfer,
  markVendorTransferReceived,
  type VendorQcPhoto,
} from "../lib/vendor-scope";
import {
  StoragePaths,
  fileExists,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
} from "../lib/storage";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * How long an artwork link lives. FIVE MINUTES — long enough to click, far too
 * short to be worth pasting anywhere.
 *
 * This is a customer's commissioned artwork. A permanent public path would work
 * just as well for the vendor and would stay readable by anyone who ever saw it
 * — a chat log, a proxy log, a screenshot — forever. `getPublicUrl` is
 * therefore never used on this route; the presigner is, every time, so a stale
 * link is a dead link rather than an open one.
 */
const ARTWORK_URL_TTL_SECONDS = 300;

/**
 * How long a QC photo's DOWNLOAD link lives. Five minutes, the same as artwork
 * and the same as the admin review screen's, so "expires in minutes, not days"
 * is one number rather than three that drift.
 */
const QC_PHOTO_URL_TTL_SECONDS = 300;

/**
 * How long a CARRIER LABEL link lives. Five minutes — artwork's number, chosen
 * because it is artwork's number and not because a label deserves its own.
 *
 * This is the one URL on this boundary that resolves to a customer's name,
 * address and phone. Every argument for keeping the artwork link short applies
 * here with more force, and none for lengthening it survives contact with what
 * is inside the PDF: a vendor clicks it and prints; nobody needs it an hour
 * later, and by then it is a dead link rather than an open one.
 */
const LABEL_URL_TTL_SECONDS = 300;

/**
 * How long the UPLOAD signature lives. Fifteen minutes, matching
 * `routes/review-media.ts`: a 25MB photograph on a print shop's wifi is not a
 * five-minute job, and an expired PUT means the vendor reshoots for no reason.
 *
 * This is also exactly why `complete` re-validates: fifteen minutes is long
 * enough for the job to be cancelled, reassigned or moved to QC in between.
 */
const QC_PHOTO_PRESIGN_TTL_SECONDS = 15 * 60;

// ============================================================================
// Validation
// ============================================================================

const listQuerySchema = z.object({
  status: z.string().min(1).max(40).optional(),
  /** Clamped, not rejected: `?limit=100000` is answered with 100 rows. */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  offset: z.coerce.number().int().min(0).default(0),
});

const jobParamSchema = z.object({ id: z.string().uuid() });

const artworkParamSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * ONE field: the status to move to.
 *
 * The vocabulary is `lib/production-transitions.ts`'s, imported — a `filter`
 * over the transition matrix rather than a list anybody maintains. This file
 * used to hold its own `["sent", "received"]` literal, which is how the RETIRED
 * `sent` stayed in a vendor's public vocabulary for two phases after #675
 * erased it from the rows.
 *
 * No amount field exists here, so no amount can reach the update path: amounts
 * are what we owe, priced from the rate card at assignment, and a vendor may
 * not price their own job.
 *
 * **And no date field exists here either.** `sentAt` and `receivedAt` used to
 * be settable; the server now stamps `receivedAt`, `qcSubmittedAt` and
 * `dispatchedAt` from its own clock. A vendor back-dating "I received it three
 * days ago" is not a data-entry convenience, it is a lie about an SLA clock —
 * and the only way to make it unsayable is to give it no field to say it in.
 */
const updateJobSchema = z.object({
  status: z.enum(VENDOR_SETTABLE_STATUSES),
});

const photoParamSchema = z.object({
  id: z.string().uuid(),
  photoId: z.string().uuid(),
});

/**
 * `slot` goes through `qcSlotSchema`, which is the ONLY thing standing between
 * a typo and a photograph nobody can find: `production_job_photos.slot` is a
 * `text` column with no enum under it, because a *value* import from the
 * ESM-only `@chobii/shared` inside `schema/` breaks `drizzle-kit generate`
 * outright. A slot the vocabulary does not know is a 400 here; a slot the
 * vocabulary knows but this job's STAGE does not ask for is a 422 from the
 * scoped module, which is a different mistake with a different remedy.
 *
 * `sizeBytes` is the browser's DECLARED size, not a measured one — a cheap
 * early reject, exactly as in `routes/review-media.ts`. R2 is told the same
 * content type in the signature, and `complete` re-checks both.
 */
/**
 * The list a vendor asks for. `direction` narrows to one end of their own legs;
 * omitted, they get both, which is the only default that shows a vendor all of
 * their own work.
 */
const transferListQuerySchema = z.object({
  direction: z.enum(["inbound", "outbound"]).optional(),
  /** Clamped, not rejected: `?limit=100000` is answered with 100 rows. */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  offset: z.coerce.number().int().min(0).default(0),
});

const transferParamSchema = z.object({ id: z.string().uuid() });

/**
 * What a vendor may say when despatching a parcel — and `.strict()`, so what
 * they may not say is a 400 rather than a silently dropped field.
 *
 * Four fields are absent on purpose, and each absence is a rule:
 *
 * - **`costAmount`.** We pay the leg because we chose the routing, so a vendor
 *   cannot price a distance we picked. Asking A to absorb it is how rate cards
 *   get padded.
 * - **`toVendorId`.** The destination is DERIVED from the order's consolidator.
 *   Letting A name B would be A learning who else is working this order, which
 *   is the fact this whole boundary is built to withhold.
 * - **`fromVendorId`.** The sender is the session. A transfer is created only by
 *   its sending end, and there is no field in which to claim otherwise.
 * - **`dispatchedAt` and `receivedAt`.** The server stamps both. A vendor
 *   back-dating a despatch is a lie about an SLA clock, and the only way to make
 *   it unsayable is to give it no field to say it in.
 *
 * `orderId` is absent for a fifth reason: it is a person-linked handle R1
 * forbids, and the scoped module never lets it into this process at all.
 *
 * `expectedBy` IS settable, and it is the one date here that is not ours: it is
 * the carrier's promise, off the docket in the vendor's hand, and it makes no
 * claim about the vendor's own performance.
 */
const createTransferSchema = z
  .object({
    jobIds: z.array(z.string().uuid()).min(1).max(50),
    carrier: z.string().trim().min(1).max(120).nullish(),
    reference: z.string().trim().min(1).max(120).nullish(),
    /** One parcel is the overwhelming case, so it is the default. */
    pieceCount: z.coerce.number().int().min(1).max(999).default(1),
    expectedBy: z.string().datetime().nullish(),
  })
  .strict();

const photoPresignSchema = z.object({
  slot: qcSlotSchema,
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
});

/**
 * `complete` takes the KEY back, and every field is re-checked against it.
 *
 * The key is client-supplied and the two calls are minutes apart, so it is
 * treated as a claim rather than as a fact: the handler REBUILDS the key it
 * would have issued for `(jobId, slot, filename)` and refuses anything that
 * does not match exactly. That is stricter than `review-media.ts`'s prefix test
 * because a QC key carries the slot as well, and a key pointing at the right
 * job but the wrong slot would file the photograph under a shot nobody took.
 */
const photoCompleteSchema = z.object({
  slot: qcSlotSchema,
  key: z.string().min(1).max(1024),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive(),
});

// ============================================================================
// Route Handler
// ============================================================================

const vendorApp = new Hono<{ Variables: VendorVariables }>();

// requireVendor resolves the caller into exactly one vendorId, or refuses.
// A vendor role with no link is 403 there, never an unscoped read here.
vendorApp.use("*", requireAuth, requireVendor);

/**
 * The last-resort answer, and it says NOTHING it was not asked to say.
 *
 * It used to append `error.message` verbatim. On most routers that is merely
 * untidy; here it sat on `GET /jobs/:id/label` — the one route on this boundary
 * whose entire purpose is to move a customer's name, address and phone — and it
 * echoed whatever the driver had raised. The label seam is the concrete case:
 * `label_object_token` does not exist yet, so every Print Label click answered
 * `500 Failed to sign label URL: column "order_shipments"."label_object_token"
 * does not exist`, which is our schema, narrated to a supplier, from the route
 * that must give the least away.
 *
 * A wider argument for the same fix: nothing constrains what a driver puts in a
 * message. node-postgres keeps constraint VALUES in `detail` rather than in
 * `message` today, which is the only reason this was a schema disclosure and not
 * a data one — a property of a dependency, not of our code, and not one worth
 * betting a customer's address on.
 *
 * So the caller gets the action that failed and nothing else, and the details go
 * to the log, where an operator can read them and a vendor cannot.
 */
function failed(action: string, error: unknown) {
  logger.error({ err: error }, `vendor portal: failed to ${action}`);
  return { error: `Failed to ${action}` } as const;
}

// ============================================================================
// GET /api/vendor/jobs
// ============================================================================

vendorApp.get("/jobs", zValidator("query", listQuerySchema), async (c) => {
  const vendorId = c.get("vendorId");
  const { status, limit, offset } = c.req.valid("query");

  try {
    const items = await listVendorJobs(vendorId, { status, limit, offset });
    return c.json({ items, limit, offset });
  } catch (error) {
    return c.json(failed("list jobs", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/jobs/:id
// ============================================================================

vendorApp.get("/jobs/:id", zValidator("param", jobParamSchema), async (c) => {
  const vendorId = c.get("vendorId");
  const { id } = c.req.valid("param");

  try {
    const job = await getVendorJob(vendorId, id);
    // Scoped read, so this covers both "no such job" and "not yours" — and
    // deliberately does not distinguish them.
    if (!job) return c.json({ error: "Job not found" }, 404);

    const [items, reviews] = await Promise.all([
      getVendorJobItems(vendorId, id),
      getVendorJobReviews(vendorId, id),
    ]);

    return c.json({ job, items, reviews });
  } catch (error) {
    return c.json(failed("read job", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/jobs/:id/artwork/:itemId
// ============================================================================

/**
 * A short-lived signed download for one item's print file.
 *
 * Job-scoped, not id-scoped: the scoped module resolves the key only when the
 * item sits on a job this vendor owns, so a real item id from someone else's
 * job is NOT FOUND — and, crucially, the presigner is never reached on that
 * path. A signed URL that is generated and then withheld has still been
 * generated, and lives in whatever log or trace saw it.
 *
 * The response carries the signed URL and its expiry, and nothing else. No
 * public path, no key, no order reference.
 */
vendorApp.get(
  "/jobs/:id/artwork/:itemId",
  zValidator("param", artworkParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id, itemId } = c.req.valid("param");

    try {
      const artwork = await getVendorJobArtwork(vendorId, id, itemId);
      // Covers all three of: no such job, not your job, no artwork on file.
      // None of them is worth distinguishing to the caller.
      if (!artwork) return c.json({ error: "Artwork not found" }, 404);

      const url = await getPresignedDownloadUrl(
        artwork.key,
        ARTWORK_URL_TTL_SECONDS
      );

      return c.json({
        itemId: artwork.itemId,
        url,
        expiresInSeconds: ARTWORK_URL_TTL_SECONDS,
        expiresAt: new Date(
          Date.now() + ARTWORK_URL_TTL_SECONDS * 1000
        ).toISOString(),
      });
    } catch (error) {
      return c.json(failed("sign artwork URL", error), 500);
    }
  }
);

// ============================================================================
// GET /api/vendor/jobs/:id/label
// ============================================================================

/**
 * The carrier's shipping label, as bytes, for the vendor despatching the order.
 *
 * ## Why this route is allowed to exist at all
 *
 * `lib/vendor-scope.ts` used to state an absolute — no return value on this
 * boundary contains customer data — and it was assertable for exactly one
 * reason: dispatch was in-house. That premise is dead. The courier collects from
 * the vendor's own facility now, so the label they hand over necessarily carries
 * the customer's name, address and phone. What replaced the absolute is not a
 * softer version of it but three clauses a machine checks:
 *
 * - **R1 — the JSON stays clean, absolutely.** The body below is `{ jobId, url,
 *   expiresInSeconds, expiresAt }`. No name, no address, no phone, no email, no
 *   order reference, at any depth. R1 took NO exception when dispatch moved out
 *   of house, and this route does not ask for one: the customer is inside the
 *   PDF the vendor fetches, never in a field beside it.
 * - **R2 — customer data reaches a vendor only as opaque rendered bytes, behind
 *   a short-lived signature**, and only by handing that file to the operating
 *   system. Never composed by us, never rendered into the portal's own DOM.
 * - **R3 — the allow-list is the enforcement.** The key resolves through the
 *   `label` scope of `VENDOR_SIGNING_SCOPES` and no other; a `products/…` or
 *   `production-qc/…` key cannot arrive here, and a label key cannot be signed
 *   by the artwork route — which performs no consolidator check.
 *
 * ## The order of the two calls IS the security property
 *
 * `getVendorJobLabelKey` runs FIRST and answers `null` unless all three
 * conditions hold, which it puts in one WHERE rather than in three branches:
 * the job is this vendor's, the order's consolidator is this vendor, and a label
 * token exists. Only the consolidator, because only they hold the parcel —
 * everyone else on the order shipped their piece onward by transfer and has no
 * business with the customer's address.
 *
 * A fourth condition rides in the same WHERE and is the one this route was
 * missing: the job's STATUS. `LABEL_ACCESS_STATUSES` is derived from the
 * transition matrix — the statuses a vendor can take the
 * `open-transfer-or-order-label` edge from, which today is `qc_passed` alone —
 * so the window opens where decision 4 of the design says it does ("photo QC
 * gates the label") and closes at despatch. Without it a vendor whose job had
 * been CANCELLED, and who had been told in as many words to stop work, could
 * still print the customer's name, address and phone for as long as the
 * consolidation row survived.
 *
 * A miss ends the request at the 404 below, BEFORE `getPresignedDownloadUrl` is
 * reached. That is the requirement, not the status code. A signed URL that is
 * generated and then withheld has still been generated, and lives in whatever
 * log, trace, metric or crash dump saw it; checking authorisation after signing
 * gives the same answer on the happy path and the wrong one every other time.
 *
 * ## The key never leaves, and never named a person in the first place
 *
 * The response carries the signature and its expiry — no key, no public path, no
 * order reference. And the key it signs is `fulfilment/labels/<random token>.pdf`,
 * identity-free BY CONSTRUCTION rather than by filtering: an order id in a URL
 * path is a stable person-linked handle living in the one place an assertion
 * about JSON *keys* can never reach, since the object key rides in the path of
 * the signed URL as a value.
 *
 * ## The seam under all of this, and the 503
 *
 * `order_shipments.label_object_token` does not exist yet — it belongs to
 * `order-dispatch-tracking` — so in every environment today this route's read
 * raises, and the catch answers **503 with a fixed body**. Not a 404, which
 * would make a missing seam indistinguishable from "no label bought yet", and
 * not the old 500, which echoed the driver's sentence and so published our
 * schema from the one route that must give the least away.
 *
 * ## The audit row
 *
 * `production_job.label_issued`, written on SUCCESS — after the URL exists, so
 * no row ever claims a disclosure a throw then unmade — and with NO `tx`,
 * because no transaction exists on this path and inventing one would give
 * `recordAudit` something to rethrow into a handler that has already produced a
 * working signature. The row records that a customer document crossed to a
 * vendor; `recordAudit` adds the actor and the `vendorId` itself.
 */
vendorApp.get("/jobs/:id/label", zValidator("param", jobParamSchema), async (c) => {
  const vendorId = c.get("vendorId");
  const { id } = c.req.valid("param");

  try {
    // FIRST, and the whole point. Covers all of: no such job, not your job, you
    // are not the consolidator, no label bought yet. None of them is worth
    // distinguishing to the caller — and 404, never 403, because 403 confirms
    // the order exists and names somebody else's parcel.
    const labelRef = await getVendorJobLabelKey(vendorId, id);
    if (!labelRef) return c.json({ error: "Label not found" }, 404);

    // Only now. Nothing above this line produced a signature.
    const url = await getPresignedDownloadUrl(
      labelRef.key,
      LABEL_URL_TTL_SECONDS
    );

    await recordAudit(c, {
      action: "production_job.label_issued",
      entityType: "production_job",
      entityId: labelRef.jobId,
      summary: "Vendor was issued a signed carrier label for the order they consolidate",
      after: {
        // Identity-free by construction, exactly like the QC photo keys the
        // `photos_submitted` row records, so naming the object costs nothing
        // under R1 and lets a dispute say WHICH label was handed over — which
        // matters on an order whose label was voided and re-bought.
        key: labelRef.key,
        expiresInSeconds: LABEL_URL_TTL_SECONDS,
      },
    });

    return c.json({
      jobId: labelRef.jobId,
      url,
      expiresInSeconds: LABEL_URL_TTL_SECONDS,
      expiresAt: new Date(
        Date.now() + LABEL_URL_TTL_SECONDS * 1000
      ).toISOString(),
    });
  } catch (error) {
    // The SEAM, answered deliberately. `order_shipments.label_object_token`
    // belongs to `order-dispatch-tracking` and has not landed, so this route
    // cannot work yet in any environment. Three answers were possible and two
    // are wrong: a 404 would dress a missing seam up as "no label bought yet"
    // and hide it for as long as nobody checked, and the 500 this used to give
    // quoted the driver's own sentence back — our schema, narrated to a
    // supplier, from the one route that carries a customer's address.
    //
    // So: 503, a FIXED body naming no column, table or driver, and a message the
    // consolidator can act on — the label is not available here yet, ask the
    // office. `LabelSeamNotReady` is a type rather than a parsed message, so it
    // cannot be raised by anything except the seam, and every other failure
    // still falls through to the generic 500 below.
    //
    // `tests/lib/vendor-label-seam.test.ts` goes RED the day the column lands.
    // Delete this branch then, and the catch in `getVendorJobLabelKey` with it.
    if (error instanceof LabelSeamNotReady) {
      logger.error(
        { err: error },
        "vendor portal: label requested before the dispatch-tracking seam landed"
      );
      return c.json(
        {
          error:
            "Carrier labels are not available in the portal yet. Nothing is " +
            "wrong with this order — ask the office for the label.",
          code: "LABEL_NOT_AVAILABLE",
        },
        503
      );
    }

    return c.json(failed("sign label URL", error), 500);
  }
});

// ============================================================================
// QC photographs
// ============================================================================

/**
 * The upload half of this router, and the one place bytes are involved.
 *
 * **They do not come through here.** A 25MB photograph routed through Hono
 * means buffering it in the Node process and holding a request open for the
 * whole transfer, on a box that also serves the storefront. The browser PUTs
 * straight to R2 against a short-lived presigned URL and only tells us the
 * object key afterwards — `routes/review-media.ts`'s pattern, reused rather
 * than re-derived.
 *
 * That split is the entire reason `complete` exists, and the reason it
 * re-validates everything `presign` already checked: the two calls are minutes
 * apart, and nothing guarantees the second one came from the same page, or that
 * the job has not been cancelled, reassigned or moved to QC in between.
 *
 * The key is `production-qc/<jobId>/<slot>/<uuid>.<ext>`, built by
 * `StoragePaths.productionQcPhoto`. It is identity-free by construction — a job
 * id is a production handle and names no customer, no order and no staff — and
 * it is RECOMPUTABLE, which is what lets `complete` verify the returned key by
 * rebuilding it rather than by trusting a prefix.
 */

/** The extension this content type keys under, or null if we do not take it. */
function qcPhotoExtension(contentType: string): string | null {
  return QC_PHOTO_CONTENT_TYPES[contentType.toLowerCase().trim()] ?? null;
}

/**
 * Is this key one WE would have issued for this job and this slot?
 *
 * Rebuilt and compared, not prefix-tested. `review-media.ts` can get away with
 * `startsWith` because its keys carry only the review id; a QC key carries the
 * slot too, and a key pointing at the right job but the wrong slot would file a
 * photograph under a shot nobody took. Equality also disposes of traversal,
 * bucket-qualified paths and full URLs in one move, since none of them rebuild
 * to themselves.
 */
function qcPhotoKeyIsOurs(jobId: string, slot: string, key: string): boolean {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  if (!filename) return false;
  return key === StoragePaths.productionQcPhoto(jobId, slot, filename);
}

/**
 * The shot list laid out slot by slot, with each live photograph in its place.
 *
 * The WHOLE list comes back, not only what was uploaded: an empty slot is the
 * point of the screen. A live photo in a slot this stage does not ask for is
 * appended rather than dropped — `slot` is `text` with no enum under it, so a
 * photograph nobody can find is a real failure mode, and hiding it here is how
 * it stays invisible.
 */
function qcShotEntries(stage: string, photos: VendorQcPhoto[]) {
  const bySlot = new Map(photos.map((photo) => [photo.slot, photo]));
  const listed = qcShotsForStage(stage as QcStage) ?? [];
  const listedSlots = new Set(listed.map((shot) => shot.slot));

  const entries = listed.map((shot) => ({
    slot: shot.slot,
    label: shot.label,
    required: shot.required,
    onShotList: true,
    photo: bySlot.get(shot.slot) ?? null,
  }));

  for (const photo of photos) {
    if (listedSlots.has(photo.slot)) continue;
    entries.push({
      slot: photo.slot,
      label: `Uploaded outside the ${stage} shot list`,
      required: false,
      onShotList: false,
      photo,
    });
  }

  return entries;
}

// ============================================================================
// GET /api/vendor/jobs/:id/photos
// ============================================================================

/**
 * What this job has been photographed with, and what it still owes.
 *
 * `missingRequiredSlots` is the one actionable field on the response: it is
 * exactly what the `received -> qc_submitted` refusal would name, computed from
 * the same `QC_SHOT_LIST`, so the screen and the refusal can never disagree.
 *
 * **The object key never leaves.** Each live photo answers with a presigned
 * download URL and nothing else. `approval_photos.url` is the counter-example
 * this deliberately does not copy: a stored URL cannot be re-signed when it
 * expires, and the URL itself becomes the capability. A key whose stored value
 * falls outside the `qcPhoto` scope is answered with a NULL url rather than
 * signed — R3 fails closed — and is still listed, because a photograph that
 * exists and cannot be shown is worth seeing on the screen.
 */
vendorApp.get(
  "/jobs/:id/photos",
  zValidator("param", jobParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");

    try {
      const found = await listVendorJobPhotos(vendorId, id);
      // Covers "no such job" and "not yours" alike, and does not distinguish
      // them. The photo table is never reached on this path.
      if (!found) return c.json({ error: "Job not found" }, 404);

      const signedAt = Date.now();

      const shots = await Promise.all(
        qcShotEntries(found.stage, found.photos).map(async (entry) => ({
          slot: entry.slot,
          label: entry.label,
          required: entry.required,
          onShotList: entry.onShotList,
          photo: entry.photo
            ? {
                id: entry.photo.id,
                contentType: entry.photo.contentType,
                sizeBytes: entry.photo.sizeBytes,
                uploadedAt: entry.photo.uploadedAt,
                /** The review that judged this shot, once one has. */
                reviewId: entry.photo.reviewId,
                url: entry.photo.key
                  ? await getPresignedDownloadUrl(
                      entry.photo.key,
                      QC_PHOTO_URL_TTL_SECONDS
                    )
                  : null,
              }
            : null,
        }))
      );

      const uploaded = new Set(found.photos.map((photo) => photo.slot));

      return c.json({
        jobId: id,
        stage: found.stage,
        status: found.status,
        shots,
        missingRequiredSlots: requiredQcSlots(found.stage as QcStage).filter(
          (slot) => !uploaded.has(slot)
        ),
        expiresInSeconds: QC_PHOTO_URL_TTL_SECONDS,
        expiresAt: new Date(
          signedAt + QC_PHOTO_URL_TTL_SECONDS * 1000
        ).toISOString(),
      });
    } catch (error) {
      return c.json(failed("list QC photos", error), 500);
    }
  }
);

// ============================================================================
// POST /api/vendor/jobs/:id/photos/presign
// ============================================================================

/**
 * Authorise a direct-to-R2 PUT. Creates NO row — an abandoned upload should
 * leave nothing behind but an unreferenced object, which the retention sweep
 * collects by prefix.
 *
 * Every refusal is answered BEFORE the presigner is reached. A signed URL that
 * is generated and then withheld has still been generated, and lives in
 * whatever log, trace or crash dump saw it.
 *
 * ## Two bounds on VOLUME, because this route hands out write capability
 *
 * A presigned PUT is permission to put bytes in our bucket, and this route used
 * to hand them out without limit: no row is created, so nothing counted, and
 * `getPresignedUploadUrl` signs `Key` and `ContentType` only — with no
 * content-length range in the policy, `QC_PHOTO_MAX_BYTES` below is a declared
 * size we check, not a size R2 enforces.
 *
 * 1. **Per job.** `assertVendorMayUploadQcPhoto` now refuses once the job holds
 *    `MAX_QC_PHOTOS_PER_JOB` photograph rows, superseded ones included —
 *    `review-media.ts`'s `MAX_MEDIA_PER_REVIEW` check, moved into the scoped
 *    module because this file holds no database access. Bytes per job are
 *    bounded by that count times the size cap.
 * 2. **Per caller, per minute.** A vendor who never calls `complete` writes no
 *    rows at all, so the count alone cannot bound the RATE. The shared IP
 *    limiter does, and 60 a minute is far past photographing eight shots and far
 *    short of a script.
 *
 * The remaining gap is deliberate and named: a content-length range belongs in
 * the signing policy in `lib/storage.ts`, which `routes/review-media.ts` shares,
 * and widening that signature is not this route's change to make.
 */
vendorApp.post(
  "/jobs/:id/photos/presign",
  rateLimit({ limit: 60, windowSeconds: 60, keyPrefix: "vendor-qc-presign" }),
  zValidator("param", jobParamSchema),
  zValidator("json", photoPresignSchema, (result, c) => {
    if (!result.success) {
      // A slot outside the vocabulary lands here: `qcSlotSchema` is the only
      // thing between a typo and a photograph nobody can find.
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");
    const { slot, contentType, sizeBytes } = c.req.valid("json");

    try {
      const allowed = await assertVendorMayUploadQcPhoto(vendorId, id, slot);
      if (!allowed.ok) return c.json(allowed.body, allowed.status);

      const extension = qcPhotoExtension(contentType);
      if (!extension) {
        return c.json(
          {
            error:
              "That file type cannot be reviewed. Send a JPEG, PNG or WebP.",
            allowed: Object.keys(QC_PHOTO_CONTENT_TYPES),
          },
          400
        );
      }

      if (sizeBytes > QC_PHOTO_MAX_BYTES) {
        return c.json(
          {
            error: `That photograph is too large. The limit is ${Math.round(
              QC_PHOTO_MAX_BYTES / (1024 * 1024)
            )}MB.`,
            maxBytes: QC_PHOTO_MAX_BYTES,
          },
          400
        );
      }

      // The client's filename never reaches the key: it is attacker-controlled,
      // and `complete` has to be able to RECOMPUTE this key from the same three
      // values, so nothing time-varying or caller-supplied may enter it.
      const key = StoragePaths.productionQcPhoto(
        id,
        slot,
        `${crypto.randomUUID()}.${extension}`
      );

      const uploadUrl = await getPresignedUploadUrl(
        key,
        contentType,
        QC_PHOTO_PRESIGN_TTL_SECONDS
      );

      return c.json({
        uploadUrl,
        key,
        slot,
        contentType,
        maxBytes: QC_PHOTO_MAX_BYTES,
        expiresInSeconds: QC_PHOTO_PRESIGN_TTL_SECONDS,
      });
    } catch (error) {
      return c.json(failed("prepare photo upload", error), 500);
    }
  }
);

// ============================================================================
// POST /api/vendor/jobs/:id/photos/complete
// ============================================================================

/**
 * Record the object that landed, superseding whatever held the slot.
 *
 * Everything `presign` checked is checked AGAIN — the job is still theirs,
 * still in the window, the slot is still on its shot list, the type is still
 * one we take, the size is still under the cap — and the key is verified by
 * REBUILDING it rather than by trusting it. That is not belt and braces: the
 * two calls are minutes apart, and the second one is the first time we learn
 * what actually got uploaded.
 *
 * The previous live photo is superseded, never deleted, and the stamp happens
 * before the insert so the partial unique index on `(job_id, slot) WHERE
 * superseded_at IS NULL` is never violated. Both are in one transaction.
 *
 * **And the object is checked for.** Re-validating the claim is not the same as
 * verifying it: a well-formed key names an object that may never have been
 * uploaded, and a row written for one is QC evidence of nothing. 422, because it
 * is the refusal the caller can actually fix — retry the PUT, then say so.
 */
vendorApp.post(
  "/jobs/:id/photos/complete",
  zValidator("param", jobParamSchema),
  zValidator("json", photoCompleteSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const vendorId = c.get("vendorId");
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const { slot, key, contentType, sizeBytes } = c.req.valid("json");

    try {
      // The key is a CLAIM. Without this a caller can point a photo row at any
      // object in the bucket — another job's shot, a catalogue print file, a
      // carrier label — and have it filed as their own QC evidence.
      //
      // Checked BEFORE the job is loaded, unlike `presign`, and that is not an
      // inconsistency: this answer is computed from the URL's own job id and
      // the body alone, so it says nothing about whether the job exists or
      // whose it is. It costs no round trip and leaks nothing.
      if (!qcPhotoKeyIsOurs(id, slot, key)) {
        return c.json(
          { error: "That upload key does not belong to this job and slot." },
          400
        );
      }

      const extension = qcPhotoExtension(contentType);
      if (!extension) {
        return c.json(
          {
            error:
              "That file type cannot be reviewed. Send a JPEG, PNG or WebP.",
            allowed: Object.keys(QC_PHOTO_CONTENT_TYPES),
          },
          400
        );
      }

      if (sizeBytes > QC_PHOTO_MAX_BYTES) {
        return c.json(
          {
            error: `That photograph is too large. The limit is ${Math.round(
              QC_PHOTO_MAX_BYTES / (1024 * 1024)
            )}MB.`,
            maxBytes: QC_PHOTO_MAX_BYTES,
          },
          400
        );
      }

      // AND THE OBJECT IS REALLY THERE. Everything above judges the SHAPE of a
      // claim; nothing above it has looked in the bucket, and the shot-list
      // guard that holds the label shut is satisfied by rows, not by
      // photographs. Three `complete` calls with well-formed fabricated keys
      // used to take a job `received -> qc_submitted` with nobody having
      // photographed anything — the QC gate passing on evidence that does not
      // exist, which is worse than no gate, because the audit row says a human
      // looked.
      //
      // A HEAD on one key, after the cheap checks and before any row is written.
      // It leaks nothing: the key embeds a uuid WE minted at presign, so only a
      // caller who already held the job can name one at all.
      if (!(await fileExists(key))) {
        return c.json(
          {
            error:
              "We cannot find that photograph in storage. The upload did not " +
              "finish — send the file again, then record it.",
            code: "PHOTO_OBJECT_MISSING",
          },
          422
        );
      }

      const result = await recordVendorQcPhoto(vendorId, id, {
        slot,
        objectKey: key,
        contentType,
        sizeBytes,
        // Their own staff, so it is theirs to keep — and it never comes back
        // out in any response on this boundary.
        uploadedBy: user?.id ?? null,
      });

      if (!result.ok) return c.json(result.body, result.status);

      return c.json(
        {
          photo: {
            id: result.photo.id,
            slot: result.photo.slot,
            contentType: result.photo.contentType,
            sizeBytes: result.photo.sizeBytes,
            uploadedAt: result.photo.uploadedAt,
          },
          /**
           * Named rather than implied: the vendor replaced a shot, and a UI
           * that silently swapped the thumbnail would hide the fact that the
           * earlier one is still on file.
           */
          supersededPhotoId: result.supersededPhotoId,
        },
        201
      );
    } catch (error) {
      return c.json(failed("record photo upload", error), 500);
    }
  }
);

// ============================================================================
// DELETE /api/vendor/jobs/:id/photos/:photoId
// ============================================================================

/**
 * Withdraw a shot from the LIVE list.
 *
 * The row is superseded, not deleted, and the R2 object is left alone. The
 * collection this removes the photograph from is "the live shot list", which is
 * what `superseded_at IS NULL` means — so the verb is honest while the history
 * survives, exactly as `production_job_reviews` does it.
 *
 * Deleting the row would also orphan the object forever: a cascade cannot reach
 * into object storage, which is why the 400-day retention sweep has to call
 * `deleteByPrefix` first and delete rows second.
 */
vendorApp.delete(
  "/jobs/:id/photos/:photoId",
  zValidator("param", photoParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id, photoId } = c.req.valid("param");

    try {
      const result = await retractVendorQcPhoto(vendorId, id, photoId);
      if (!result.ok) return c.json(result.body, result.status);

      return c.json({
        message: "Photograph withdrawn",
        photoId: result.photoId,
        slot: result.slot,
      });
    } catch (error) {
      return c.json(failed("withdraw photo", error), 500);
    }
  }
);

// ============================================================================
// PATCH /api/vendor/jobs/:id
// ============================================================================

/**
 * The one write a vendor gets, and it is a TRANSITION rather than a patch.
 *
 * Three things happen here and nowhere else in this file:
 *
 * 1. **The decision is not taken here.** `updateVendorJob` re-reads under a
 *    lock, asks `lib/production-transitions.ts` whether this actor may take
 *    this edge, evaluates the guard the matrix NAMES on it, stamps the clock
 *    itself and writes with the predicate repeated — all in one transaction.
 *    This handler translates its answer into a status code.
 *
 * 2. **404, 409 and 422 are three different answers.** The scoped module used
 *    to answer `null` for everything, so a vendor whose job was cancelled under
 *    them got the same reply as a vendor guessing at somebody else's id. 409 is
 *    "the world moved" — cancelled, settled, illegal edge, lost race — and 422
 *    is the one refusal the caller can fix, an incomplete QC shot list.
 *
 * 3. **The audit rows go on opposite sides of the transaction.** The success row
 *    SHARES it, because a row saying "the job moved" beside a job that did not
 *    is worse than no row. The refusal row must NOT: a refusal records that a
 *    transaction was rolled back, so writing it inside that transaction rolls
 *    the evidence back too. `updateVendorJob` has already returned by then, so
 *    the refusal below is written outside every transaction by construction.
 *
 * A 404 gets no refusal row at all. There is no entity to refuse, and a row
 * confirming one exists is the fact the 404 is there to withhold; the audit
 * middleware's floor row is the right level of detail.
 */
vendorApp.patch(
  "/jobs/:id",
  zValidator("param", jobParamSchema),
  zValidator("json", updateJobSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      // LOAD FIRST. The 404 below happens before any write exists, which is the
      // whole difference between this and update-then-check. The locked re-read
      // inside the transaction repeats the same scoped predicate, because this
      // answer is a round trip old by the time the write is built.
      const existing = await getVendorJob(vendorId, id);
      if (!existing) return c.json({ error: "Job not found" }, 404);

      const result = await updateVendorJob(
        vendorId,
        id,
        { status: body.status },
        {
          onTransition: async (tx, move) => {
            await recordAudit(
              c,
              {
                action: "production_job.transitioned",
                entityType: "production_job",
                entityId: id,
                summary: `Production job moved from ${move.from} to ${move.to} by the vendor`,
                before: move.before,
                after: move.after,
                metadata: { from: move.from, to: move.to },
              },
              // Shares the transaction. See point 3 above.
              tx
            );

            // The shot list is a SECOND fact about the same move, and it is the
            // one a QC dispute is argued from: which photographs were submitted,
            // and which objects they were. Recorded from the guard's OWN result
            // rather than re-queried — the photo table is not locked, and a
            // re-upload landing between the two reads would produce a row naming
            // a shot the guard never counted.
            //
            // Shares the transaction for the same reason the move does: a row
            // saying "these shots were submitted" beside a job that never left
            // `received` is worse than no row.
            if (!move.evidence) return;

            await recordAudit(
              c,
              {
                action: "production_job.photos_submitted",
                entityType: "production_job",
                entityId: id,
                summary: `Vendor submitted ${move.evidence.slots.length} QC photographs for review`,
                after: {
                  slots: move.evidence.slots,
                  // Identity-free by construction
                  // (`production-qc/<jobId>/<slot>/<file>`), so recording it
                  // costs nothing under R1 and lets a dispute name the object.
                  keys: move.evidence.keys,
                },
                metadata: { from: move.from, to: move.to },
              },
              tx
            );
          },
        }
      );

      if (result.ok) {
        return c.json({ message: "Job updated", job: result.job });
      }

      // No entity, so nothing to refuse.
      if (result.status === 404) return c.json(result.body, 404);

      await recordAudit(c, {
        action: "production_job.transition_refused",
        entityType: "production_job",
        entityId: id,
        summary: result.body.error,
        outcome: "failure",
        metadata: result.body,
        // NO `tx`, deliberately, and there is none to pass: the transaction
        // this row is ABOUT has already rolled back.
      });

      return c.json(result.body, result.status);
    } catch (error) {
      return c.json(failed("update job", error), 500);
    }
  }
);

// ============================================================================
// Inter-vendor transfers
// ============================================================================

/**
 * A parcel from one vendor's bench to another's, and the two ends that may act
 * on it.
 *
 * The design's whole position on this surface is a subtraction: **what vendor B
 * is told about an inbound parcel is `{ id, reference, carrier, pieceCount,
 * dispatchedAt, expectedBy, receivedAt }` and nothing else.** No vendor names,
 * no order id, no customer anything, and no `costAmount` — B does not learn the
 * parcel came from A. That is not politeness; surfacing another vendor's row
 * through `lib/vendor-scope.ts` would break the isolation suite's first
 * property, which is a hard, already-tested boundary. If B needs to chase a
 * carrier, an admin chases it: `routes/admin/transfers.ts` aliases `vendors`
 * twice and sees both ends, because if somebody has to argue with a courier it
 * is us.
 *
 * The one field added to those seven is `direction`, computed in SQL from the
 * CALLER'S own vendor id. It answers "is this coming to me", never "who is at
 * the other end", and without it the confirm-receipt screen cannot exist.
 *
 * As everywhere else in this file, the decision is not taken here: the scoped
 * module locks the rows, evaluates the guard the transition matrix names, stamps
 * the clocks and writes with the predicate repeated. These handlers translate
 * its answer into a status code and own the audit vocabulary.
 */

// ============================================================================
// GET /api/vendor/transfers
// ============================================================================

vendorApp.get(
  "/transfers",
  zValidator("query", transferListQuerySchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { direction, limit, offset } = c.req.valid("query");

    try {
      const items = await listVendorTransfers(vendorId, {
        direction,
        limit,
        offset,
      });
      return c.json({ items, limit, offset });
    } catch (error) {
      return c.json(failed("list transfers", error), 500);
    }
  }
);

// ============================================================================
// GET /api/vendor/transfers/candidates
// ============================================================================

/**
 * What this vendor could put on a parcel right now, grouped per order.
 *
 * Registered BEFORE `/transfers/:id`, and that order is load-bearing: Hono
 * matches in registration order, so the `:id` route would swallow this path and
 * answer 400 on a uuid check against the word "candidates" — a route that
 * exists and is unreachable.
 *
 * The despatch screen exists because of this read. `POST /transfers` refuses
 * `JOBS_SPAN_ORDERS`, and no vendor-facing projection carries `order_id`, so
 * the portal cannot work out which jobs belong together; the grouping is ours,
 * and `lib/vendor-scope.ts` does it without the value it grouped by ever
 * leaving the database.
 */
vendorApp.get("/transfers/candidates", async (c) => {
  const vendorId = c.get("vendorId");

  try {
    return c.json({ groups: await listVendorTransferCandidates(vendorId) });
  } catch (error) {
    return c.json(failed("list what can be despatched", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/transfers/:id
// ============================================================================

/**
 * One parcel, and the caller's OWN jobs on it.
 *
 * `jobIds` is scoped a second time at `production_jobs.vendor_id`, so a
 * receiving vendor gets an empty list rather than a set of stable handles on the
 * sender's work. A parcel with neither end at this vendor is 404, never 403.
 */
vendorApp.get(
  "/transfers/:id",
  zValidator("param", transferParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");

    try {
      const found = await getVendorTransfer(vendorId, id);
      // Covers "no such parcel" and "neither end is yours" alike, and
      // deliberately does not distinguish them.
      if (!found) return c.json({ error: "Transfer not found" }, 404);

      const { jobIds, ...transfer } = found;
      return c.json({ transfer, jobIds });
    } catch (error) {
      return c.json(failed("read transfer", error), 500);
    }
  }
);

// ============================================================================
// POST /api/vendor/transfers
// ============================================================================

/**
 * Vendor A despatches, and the jobs on the parcel move with it.
 *
 * Despatching is what makes `qc_passed -> dispatched` legal — that edge's guard
 * is `open-transfer-or-order-label` — so the scoped module inserts the transfer
 * FIRST and then evaluates the guard against it, inside one transaction. A
 * transfer whose jobs never moved leaves the order permanently unlabelable
 * (`dispatched` is terminal); jobs that moved with no transfer is the same
 * failure from the other side. One transaction makes both unreachable.
 *
 * The audit row SHARES that transaction: a row saying "this parcel was
 * despatched" beside a transfer that rolled back is worse than no row. The
 * refusal row must NOT, and by construction cannot — `createVendorTransfer` has
 * already returned, and its transaction is already rolled back, by the time the
 * refusal below is written.
 */
vendorApp.post(
  "/transfers",
  zValidator("json", createTransferSchema, (result, c) => {
    if (!result.success) {
      // Where `costAmount`, `toVendorId`, `fromVendorId`, `orderId` and any
      // back-dated timestamp land: `.strict()` refuses them rather than dropping
      // them quietly, so a vendor who tries is told, not ignored.
      return c.json({ error: "Invalid request body" }, 400);
    }
  }),
  async (c) => {
    const vendorId = c.get("vendorId");
    const user = c.get("user");
    const { jobIds, carrier, reference, pieceCount, expectedBy } =
      c.req.valid("json");

    try {
      const result = await createVendorTransfer(
        vendorId,
        {
          jobIds,
          carrier: carrier ?? null,
          reference: reference ?? null,
          pieceCount,
          expectedBy: expectedBy ? new Date(expectedBy) : null,
          createdBy: user?.id ?? null,
        },
        {
          onDispatch: async (tx, move) => {
            await recordAudit(
              c,
              {
                action: "production_transfer.dispatched",
                entityType: "production_transfer",
                entityId: move.transferId,
                summary:
                  `Vendor despatched ${move.pieceCount} piece(s) carrying ` +
                  `${move.jobIds.length} job(s) as ${move.reference ?? move.transferId}`,
                after: {
                  dispatchedAt: move.dispatchedAt,
                  expectedBy: move.expectedBy,
                  carrier: move.carrier,
                  pieceCount: move.pieceCount,
                },
                // The job ids and the docket: a reader chasing "what was on this
                // parcel" has to be able to answer it from the trail alone, and
                // the reference is what an admin quotes to a carrier. Neither
                // names a customer.
                metadata: {
                  jobIds: move.jobIds,
                  reference: move.reference,
                  carrier: move.carrier,
                },
              },
              // Shares the transaction. See the note above.
              tx
            );
          },
        }
      );

      if (result.ok) {
        return c.json(
          { message: "Transfer despatched", transfer: result.transfer, jobIds: result.jobIds },
          201
        );
      }

      // No entity, so nothing to refuse — and a row confirming the jobs exist is
      // the very fact the 404 is there to withhold.
      if (result.status === 404) return c.json(result.body, 404);

      await recordAudit(c, {
        action: "production_transfer.dispatched",
        entityType: "production_transfer",
        entityId: null,
        outcome: "failure",
        summary: `Refused to despatch a transfer: ${result.body.error}`,
        metadata: result.body,
        // NO `tx`, deliberately, and there is none to pass: the transaction
        // this row is ABOUT has already rolled back.
      });

      return c.json(result.body, result.status);
    } catch (error) {
      return c.json(failed("despatch transfer", error), 500);
    }
  }
);

// ============================================================================
// POST /api/vendor/transfers/:id/received
// ============================================================================

/**
 * Vendor B confirms a parcel arrived.
 *
 * **There is no body.** `received_at` is stamped from our clock, and the only
 * other thing a vendor could put in one is `cost_amount`, which is not theirs to
 * set in either direction. A route with no payload cannot be talked into
 * accepting a field it does not have.
 *
 * `received_at` is settable only by `to_vendor_id`, and that is a predicate in
 * the scoped module's WHERE rather than a branch here: the sending vendor asking
 * about their own outbound parcel simply finds nothing, and gets a 404 rather
 * than a 403 that would confirm the row.
 *
 * No job moves. A received parcel is a fact about the PARCEL — in the
 * consolidation case the receiving vendor has no job for the piece at all — and
 * `lib/production-readiness.ts` reads the transfer, not a second status.
 */
vendorApp.post(
  "/transfers/:id/received",
  zValidator("param", transferParamSchema),
  async (c) => {
    const vendorId = c.get("vendorId");
    const { id } = c.req.valid("param");

    try {
      const result = await markVendorTransferReceived(vendorId, id, {
        onReceipt: async (tx, move) => {
          await recordAudit(
            c,
            {
              action: "production_transfer.received",
              entityType: "production_transfer",
              entityId: move.transferId,
              summary: `Vendor confirmed parcel ${move.reference ?? move.transferId} arrived`,
              before: { receivedAt: null },
              after: { receivedAt: move.receivedAt },
              // The job ids and the docket, exactly as the despatch row carries
              // them, so an admin reading the trail can answer "what arrived"
              // without joining anything. This is the AUDIT log, which is ours;
              // none of it reaches the vendor's response.
              metadata: { jobIds: move.jobIds, reference: move.reference },
            },
            // Shares the transaction: a row saying "it arrived" beside a parcel
            // still in transit is worse than no row.
            tx
          );
        },
      });

      if (result.ok) {
        return c.json({ message: "Transfer received", transfer: result.transfer });
      }

      // No entity to refuse, and the 404 is withholding its existence.
      if (result.status === 404) return c.json(result.body, 404);

      await recordAudit(c, {
        action: "production_transfer.received",
        entityType: "production_transfer",
        entityId: id,
        outcome: "failure",
        summary: `Refused to confirm receipt: ${result.body.error}`,
        metadata: result.body,
        // NO `tx`: the transaction this row is ABOUT has already rolled back.
      });

      return c.json(result.body, result.status);
    } catch (error) {
      return c.json(failed("confirm transfer receipt", error), 500);
    }
  }
);

// ============================================================================
// GET /api/vendor/rates
// ============================================================================

vendorApp.get("/rates", async (c) => {
  const vendorId = c.get("vendorId");

  try {
    // Read-only by omission: there is no POST/PATCH/DELETE beside this route.
    // The rate card is negotiated with us and written on the admin side.
    const items = await listVendorRates(vendorId);
    return c.json({ items });
  } catch (error) {
    return c.json(failed("list rates", error), 500);
  }
});

// ============================================================================
// GET /api/vendor/payments
// ============================================================================

vendorApp.get("/payments", async (c) => {
  const vendorId = c.get("vendorId");

  try {
    const [settlements, payableTotal] = await Promise.all([
      listVendorSettlements(vendorId),
      // Derived from unsettled jobs, never a stored balance — there is no
      // parallel ledger here to disagree with the admin side.
      getVendorPayableTotal(vendorId),
    ]);

    return c.json({ settlements, payableTotal });
  } catch (error) {
    return c.json(failed("read payments", error), 500);
  }
});

export { vendorApp };
export default vendorApp;
