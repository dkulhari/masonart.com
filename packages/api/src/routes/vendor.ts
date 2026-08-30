/**
 * Vendor Portal Routes
 *
 * - GET   /api/vendor/jobs       my queue; what to work on next
 * - GET   /api/vendor/jobs/:id   one job, its items and its QC history
 * - PATCH /api/vendor/jobs/:id   the only write a vendor gets
 * - GET   /api/vendor/jobs/:id/artwork/:itemId   a short-lived signed download
 * - GET   /api/vendor/rates      my rate card, read-only
 * - GET   /api/vendor/payments   my settlements and what is still owed
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
 * Zero customer data crosses this boundary — no name, address, phone, email or
 * person-linked order reference. Dispatch is in-house, so a vendor never needs
 * any of it. Every response here is built from the scoped module's explicit
 * column lists, which is what makes that an absolute rather than a habit.
 *
 * `tests/routes/vendor/isolation.test.ts` asserts all of that as PROPERTIES
 * over a route table rather than per handler, so a route added below without a
 * table entry fails that suite instead of quietly going uncovered.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { requireAuth } from "../middleware/auth";
import { requireVendor, type VendorVariables } from "../middleware/vendor";
import { recordAudit } from "../lib/audit";
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
} from "../lib/vendor-scope";
import { getPresignedDownloadUrl } from "../lib/storage";

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

// ============================================================================
// Route Handler
// ============================================================================

const vendorApp = new Hono<{ Variables: VendorVariables }>();

// requireVendor resolves the caller into exactly one vendorId, or refuses.
// A vendor role with no link is 403 there, never an unscoped read here.
vendorApp.use("*", requireAuth, requireVendor);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
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
          onTransition: (tx, move) =>
            recordAudit(
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
            ),
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
