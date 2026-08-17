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
 *    the day the check is wrong.
 *
 * 3. **The PATCH body schema has no amount fields at all.** Not rejected —
 *    absent, so `amountExpected` and `amountActual` cannot arrive by accident
 *    and are stripped by zod before the handler sees the body. Amounts come from
 *    the rate card at assignment; a vendor may not price their own job. Status
 *    is likewise a subset: `sent` and `received` are the vendor's own two
 *    events. Passing QC is ours to record, not theirs to claim.
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
 * The statuses a vendor may set on their own job. `qc_passed` / `qc_failed` are
 * our verdict on their work, `assigned` and `cancelled` are our decisions, and
 * `draft` is a job that has not reached them. What is left is the two events
 * they alone can report: received it, sent it back.
 */
const VENDOR_SETTABLE_STATUSES = ["sent", "received"] as const;

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
 * Status and the two date fields. Nothing else — in particular no amount field
 * exists in this schema, so no amount can reach the update path.
 */
const updateJobSchema = z
  .object({
    status: z.enum(VENDOR_SETTABLE_STATUSES).optional(),
    sentAt: z.coerce.date().nullable().optional(),
    receivedAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No updatable fields were supplied");

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
      // whole difference between this and update-then-check.
      const existing = await getVendorJob(vendorId, id);
      if (!existing) return c.json({ error: "Job not found" }, 404);

      const job = await updateVendorJob(vendorId, id, {
        status: body.status,
        sentAt: body.sentAt,
        receivedAt: body.receivedAt,
      });

      // Lost a race with an admin reassigning the job: still not ours to touch.
      if (!job) return c.json({ error: "Job not found" }, 404);

      return c.json({ message: "Job updated", job });
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
