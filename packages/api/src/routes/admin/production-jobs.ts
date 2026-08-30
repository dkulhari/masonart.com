/**
 * Admin Production Job Routes
 *
 * - GET   /api/admin/production                 paginated queue; stage/status/vendor filters
 * - POST  /api/admin/production                 create a job + its items in ONE transaction
 * - GET   /api/admin/production/:jobId          job + items + reviews + payable
 * - PATCH /api/admin/production/:jobId          amountActual override, dates, status
 * - POST  /api/admin/production/:jobId/assign   price against the live rate card and assign
 * - POST  /api/admin/production/:jobId/reviews  the QC verdict, and the move it IS
 * - GET   /api/admin/production/:jobId/photos   the shot list, signed for review
 *
 * File shape follows `routes/admin/vendors.ts` — `new Hono<{ Variables:
 * AuthVariables }>()`, zod schemas at the top, one `use('*')` gate, a bounded
 * list. `requireAdmin`, not `requireContentManager`, for the same reason: these
 * rows carry what we pay a supplier.
 *
 * **This module defines the job RECORD; `lib/production-transitions.ts` holds
 * the WORKFLOW.** `production_job_status` is a vocabulary; the grammar over it
 * is that module's matrix, and every write path here asks it rather than
 * deciding for itself. All three writers — PATCH, assign and the QC verdict —
 * take a job by its from-status and refuse anything the matrix does not allow.
 *
 * Seven decisions worth the ink:
 *
 * 1. **Jobs join to `order_items`, never to the order.** A basket holding a
 *    poster and a frame splits into two jobs against two vendors. POST checks
 *    every submitted item really is on the named order and 422s the ones that
 *    are not, so a typo cannot attach another customer's line to this job.
 *
 * 2. **Assignment prices at the assignment INSTANT.** One `new Date()` is taken
 *    and passed to `lib/vendor-rates.selectRateInForce` for every item, so a
 *    price rise scheduled for next month is not charged today and a long loop
 *    cannot straddle midnight. Band selection and effective-dating live in that
 *    module; nothing here re-implements them.
 *
 * 3. **An unpriced item is a 422, never a zero.** If any item's longest edge
 *    falls outside the vendor's bands — or its variant has no dimensions at all
 *    — the whole assignment is refused, naming each item and its size, and
 *    NOTHING is written. Defaulting the miss to zero produces a job that is
 *    silently unbillable with no record of why, which is discovered at
 *    settlement time by an argument with the vendor.
 *
 * 4. **Reviews are INSERT-only, and a verdict MOVES the job.** There is no
 *    PATCH or DELETE on a review, by construction rather than by convention:
 *    fail -> rework -> pass has to leave three rows, because that sequence IS
 *    the QC history. The table has no `updated_at` for the same reason. The
 *    verdict and the status move are one fact and share one transaction — if
 *    the move is refused the review is not inserted either, so nothing is
 *    written and the append-only guarantee is untouched.
 *
 * 7. **A key never leaves; a signed URL does.** GET /:jobId/photos answers with
 *    presigned DOWNLOAD urls from `lib/storage` and never the object key, and
 *    signs nothing until after the 404 — a signed URL that is generated and
 *    then withheld has still been generated. `lib/vendor-scope`'s signers are
 *    deliberately not used: they are scoped to one shop's own objects, which is
 *    the wrong question for an admin who oversees every shop.
 *
 * 5. **A refusal is 409, never 422.** In this router 422 already means "your
 *    payload names things that do not line up" — `missingOrderItemIds`,
 *    `unpriced` — which the caller fixes by editing the body. A transition
 *    conflict is not that: the body is fine and the world moved. The 409 body
 *    carries `{ error, code, from, to, allowed }` so the UI re-renders its
 *    buttons without a second round trip.
 *
 * 6. **One audit row per act, and the refusal rows have to survive.** A move
 *    shares the transaction it describes, because a row saying the job moved,
 *    beside a job that did not, is worse than no row. A refusal does the
 *    opposite: it records that a transaction was ROLLED BACK, so writing it
 *    inside that transaction would erase the evidence it exists to preserve.
 *    See `lib/audit.ts`. `draft -> assigned` produces one `assigned` row and no
 *    `transitioned` row beside it — two rows for one act would break the "one
 *    row per transition" property the timeline is read through.
 *
 * Money arithmetic is `lib/vendor-payables`' throughout — `sumPayable` adds the
 * matched rates in integer paise and `jobPayableAmount` answers
 * `COALESCE(actual, expected)`. A second money implementation in a router is
 * how a ledger starts disagreeing with itself.
 *
 * Concurrency is `routes/admin/vendor-payables.ts`' shape, copied deliberately:
 * `FOR UPDATE` on the read, the predicate REPEATED in the UPDATE's WHERE, and a
 * row-count mismatch that throws and rolls back rather than returning a 200
 * over a write that matched nothing.
 */

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { qcShotsForStage, requiredQcSlots } from "@chobii/shared";

import { db } from "../../database";
import {
  productionJobs,
  productionJobItems,
  productionJobPhotos,
  productionJobReviews,
  productionJobStageEnum,
  productionJobStatusEnum,
  productionJobVerdictEnum,
} from "../../database/schema/production-jobs";
import { orders, orderItems } from "../../database/schema/orders";
import { productVariants } from "../../database/schema/products";
import { vendors, vendorRates } from "../../database/schema/vendors";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  selectRateInForce,
  longestEdgeInches,
  type RateRow,
} from "../../lib/vendor-rates";
import {
  sumPayable,
  jobPayableAmount,
  type PayableJob,
} from "../../lib/vendor-payables";
import {
  assertTransition,
  ProductionTransitionError,
  type ProductionJobStatus,
} from "../../lib/production-transitions";
import { recordAudit, diffRecords } from "../../lib/audit";
import { getPresignedDownloadUrl } from "../../lib/storage";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * How long a QC photo URL stays valid. Five minutes, matching
 * `routes/vendor.ts`' artwork TTL: long enough to open a shot list and look at
 * every frame in it, short enough that a URL copied out of a browser's history
 * has expired by the time anyone else finds it.
 */
const QC_PHOTO_URL_TTL_SECONDS = 300;

/**
 * decimal(10,2) as a string, the shape the whole vendor stack passes money in.
 *
 * Non-negative, matching vendor-rates (amount >= 0) and settlements
 * (amount > 0). This is the only field that takes a free-form amount from an
 * admin, and it feeds the payables sum directly: a negative override would
 * quietly reduce what we owe a vendor, which is a credit note — something this
 * system deliberately does not model. Money leaves via settlements or not at
 * all.
 */
const decimalString = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Expected a non-negative decimal amount like '1234.56'");

// ============================================================================
// Validation
// ============================================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** Clamped, not rejected: `?pageSize=100000` is answered with 100 rows. */
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  stage: z.enum(productionJobStageEnum.enumValues).optional(),
  status: z.enum(productionJobStatusEnum.enumValues).optional(),
  vendorId: z.string().uuid().optional(),
});

const jobParamSchema = z.object({ jobId: z.string().uuid() });

const createJobSchema = z.object({
  orderId: z.string().uuid(),
  stage: z.enum(productionJobStageEnum.enumValues),
  orderItemIds: z.array(z.string().uuid()).min(1, "At least one order item is required"),
  dueAt: z.coerce.date().nullish(),
});

const assignJobSchema = z.object({
  vendorId: z.string().uuid(),
  /**
   * Compare-and-swap on the vendor. Optional, because a first assignment has
   * nothing to compare against; `null` asserts "I believe this job is
   * unassigned". A mismatch is answered with the vendor that ACTUALLY holds the
   * job, so the losing screen can name who took it rather than say "version
   * mismatch".
   */
  expectedVendorId: z.string().uuid().nullable().optional(),
});

/**
 * Reachable only through `POST /:jobId/reviews`: a verdict with no review row is
 * a verdict with no evidence, and the review is the evidence.
 */
const VERDICT_ONLY_STATUSES: readonly ProductionJobStatus[] = ["qc_passed", "qc_failed"];

/**
 * Subtracted from the enum rather than listed out, so a status added to the
 * vocabulary is patchable by default and only the two verdicts stay out. The
 * matrix still decides whether any particular move is legal — this is the
 * narrower question of what PATCH will even parse.
 */
const patchableStatuses = productionJobStatusEnum.enumValues.filter(
  (status) => !VERDICT_ONLY_STATUSES.includes(status)
) as [ProductionJobStatus, ...ProductionJobStatus[]];

const updateJobSchema = z
  .object({
    /** The negotiated price. Print shops negotiate; hiding that invites workarounds. */
    amountActual: decimalString.nullable().optional(),
    status: z.enum(patchableStatuses).optional(),
    dueAt: z.coerce.date().nullable().optional(),
    sentAt: z.coerce.date().nullable().optional(),
    receivedAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

/**
 * `defects` is optional on a pass and REQUIRED on a fail.
 *
 * It used to be `nullish` either way, which let a reviewer reject a job and
 * tell the vendor nothing: a fail with no defect is unactionable, because the
 * vendor cannot know what to redo. `production-transitions.ts` names the same
 * rule on the edge itself — `review-verdict-fail` "additionally requires >= 1
 * defect" — and this is where that is enforced.
 *
 * A 400, not a 422: the body is malformed on its own terms, exactly like an
 * unknown verdict, and nothing has to be read from the database to know it.
 */
const createReviewSchema = z
  .object({
    verdict: z.enum(productionJobVerdictEnum.enumValues),
    defects: z.array(z.string().min(1).max(120)).max(50).nullish(),
    notes: z.string().max(2000).nullish(),
  })
  .refine((body) => body.verdict !== "fail" || (body.defects?.length ?? 0) > 0, {
    message: "A failing verdict must name at least one defect",
    path: ["defects"],
  });

// ============================================================================
// Route Handler
// ============================================================================

const adminProductionApp = new Hono<{ Variables: AuthVariables }>();

// requireAdmin, NOT requireContentManager — vendor cost is finance data.
adminProductionApp.use("*", requireAuth, requireAdmin);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
}

/** Thrown out of a transaction so the read that found nothing still rolls back. */
class JobNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobNotFound";
  }
}

/**
 * A refusal this router raises itself, as opposed to one the matrix raises.
 *
 * Carries its own status because the two kinds are genuinely different: 409 for
 * "the world moved" (settled, stale vendor, lost race) and 422 for "your
 * payload names things that do not line up" (no items, nothing priced).
 */
class JobWriteRefused extends Error {
  readonly httpStatus: 409 | 422;
  readonly body: Record<string, unknown>;

  constructor(httpStatus: 409 | 422, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : "Production job write refused");
    this.name = "JobWriteRefused";
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

type ProductionContext = Context<{ Variables: AuthVariables }>;

/**
 * The response for a refused write, and the audit row that outlives it.
 *
 * The row is written with NO transaction, deliberately: it records that a
 * transaction was rolled back, so writing it inside that transaction would roll
 * the evidence back too. Returns `null` for anything that is not a refusal, so
 * the caller can fall through to its 500.
 */
async function refusedResponse(
  c: ProductionContext,
  jobId: string,
  error: unknown
): Promise<Response | null> {
  if (error instanceof JobNotFound) {
    // No entity, so nothing to refuse — the audit middleware's floor row is the
    // right level of detail for a 404.
    return c.json({ error: error.message }, 404);
  }

  const refusal =
    error instanceof ProductionTransitionError
      ? { status: error.httpStatus, body: error.toResponseBody() as Record<string, unknown> }
      : error instanceof JobWriteRefused
        ? { status: error.httpStatus, body: error.body }
        : null;

  if (!refusal) return null;

  await recordAudit(c, {
    action: "production_job.transition_refused",
    entityType: "production_job",
    entityId: jobId,
    summary: error instanceof Error ? error.message : "Production job write refused",
    outcome: "failure",
    metadata: refusal.body,
  });

  return c.json(refusal.body, refusal.status);
}

interface PricedItem {
  orderItemId: string;
  /**
   * The order line's quantity. A rate is charged per PIECE, so a line of three
   * posters is three of them — this module used to add one rate per item ROW
   * and underpay the vendor for every line above one.
   */
  units: number;
  longestEdge: number | null;
  size: string | null;
  rate: RateRow | null;
}

/** Absent or nonsensical is one piece; `order_items.quantity` is NOT NULL DEFAULT 1. */
function unitsOf(quantity: number | null | undefined): number {
  return quantity != null && Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 1;
}

/**
 * The rate in force for each item at ONE instant. Returns the priced items
 * alongside the misses; the caller refuses the whole assignment if there is
 * even one miss.
 */
function priceItems(
  items: Array<{
    orderItemId: string;
    quantity: number | null;
    widthInches: number | null;
    heightInches: number | null;
  }>,
  rates: RateRow[],
  kind: "print" | "frame",
  at: Date
): PricedItem[] {
  return items.map((item) => {
    const units = unitsOf(item.quantity);

    if (item.widthInches == null || item.heightInches == null) {
      // No dimensions is a miss, not a zero: the variant is gone and we cannot
      // say what size was made.
      return { orderItemId: item.orderItemId, units, longestEdge: null, size: null, rate: null };
    }

    const longestEdge = longestEdgeInches({
      widthInches: item.widthInches,
      heightInches: item.heightInches,
    });

    return {
      orderItemId: item.orderItemId,
      units,
      longestEdge,
      size: `${item.widthInches}x${item.heightInches}`,
      rate: selectRateInForce(rates, { longestEdge, kind, finish: null, at }),
    };
  });
}

// ============================================================================
// GET /api/admin/production
// ============================================================================

adminProductionApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { page, pageSize, stage, status, vendorId } = c.req.valid("query");
  const offset = (page - 1) * pageSize;

  try {
    const conditions = [];
    if (stage) conditions.push(eq(productionJobs.stage, stage));
    if (status) conditions.push(eq(productionJobs.status, status));
    if (vendorId) conditions.push(eq(productionJobs.vendorId, vendorId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(productionJobs)
      .where(where);
    const total = Number(totalRows[0]?.value ?? 0);

    const rows = await db
      .select({
        id: productionJobs.id,
        orderId: productionJobs.orderId,
        stage: productionJobs.stage,
        status: productionJobs.status,
        vendorId: productionJobs.vendorId,
        vendorName: vendors.name,
        assignedAt: productionJobs.assignedAt,
        sentAt: productionJobs.sentAt,
        dueAt: productionJobs.dueAt,
        receivedAt: productionJobs.receivedAt,
        amountExpected: productionJobs.amountExpected,
        amountActual: productionJobs.amountActual,
        settlementId: productionJobs.settlementId,
        createdAt: productionJobs.createdAt,
        updatedAt: productionJobs.updatedAt,
      })
      .from(productionJobs)
      .leftJoin(vendors, eq(productionJobs.vendorId, vendors.id))
      .where(where)
      .orderBy(desc(productionJobs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const items = rows.map((row) => ({
      ...row,
      /** COALESCE(actual, expected) — the payables module's rule, not a second one. */
      payableAmount: jobPayableAmount(row as unknown as PayableJob),
    }));

    return c.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return c.json(failed("list production jobs", error), 500);
  }
});

// ============================================================================
// POST /api/admin/production
// ============================================================================

adminProductionApp.post("/", zValidator("json", createJobSchema), async (c) => {
  const user = c.get("user");
  const { orderId, stage, orderItemIds, dueAt } = c.req.valid("json");

  try {
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) return c.json({ error: "Order not found" }, 404);

    // Every submitted item must be on THIS order. Left to the foreign key, a
    // stray id would happily attach another customer's line to this job.
    const foundItems = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(
        and(inArray(orderItems.id, orderItemIds), eq(orderItems.orderId, orderId))
      );

    const foundIds = new Set(foundItems.map((i) => i.id));
    const missingOrderItemIds = orderItemIds.filter((id) => !foundIds.has(id));

    if (missingOrderItemIds.length > 0) {
      return c.json(
        {
          error: "Some order items do not belong to this order",
          missingOrderItemIds,
        },
        422
      );
    }

    // One transaction. A job with no items is an unbillable orphan, so the two
    // writes succeed together or neither happens.
    const created = await db.transaction(async (tx) => {
      const [job] = await tx
        .insert(productionJobs)
        .values({
          orderId,
          stage,
          status: "draft",
          dueAt: dueAt ?? null,
          createdBy: user.id,
        })
        .returning();

      if (!job) throw new Error("Job insert returned no row");

      const items = await tx
        .insert(productionJobItems)
        .values(orderItemIds.map((orderItemId) => ({ jobId: job.id, orderItemId })))
        .returning();

      return { job, items };
    });

    return c.json({ message: "Production job created", ...created }, 201);
  } catch (error) {
    return c.json(failed("create production job", error), 500);
  }
});

// ============================================================================
// GET /api/admin/production/:jobId
// ============================================================================

adminProductionApp.get("/:jobId", zValidator("param", jobParamSchema), async (c) => {
  const { jobId } = c.req.valid("param");

  try {
    const [job] = await db
      .select()
      .from(productionJobs)
      .where(eq(productionJobs.id, jobId))
      .limit(1);

    if (!job) return c.json({ error: "Production job not found" }, 404);

    const items = await db
      .select({
        id: productionJobItems.id,
        orderItemId: productionJobItems.orderItemId,
        quantity: orderItems.quantity,
        widthInches: productVariants.widthInches,
        heightInches: productVariants.heightInches,
        sizeLabel: productVariants.sizeLabel,
      })
      .from(productionJobItems)
      .leftJoin(orderItems, eq(productionJobItems.orderItemId, orderItems.id))
      .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .where(eq(productionJobItems.jobId, jobId));

    // Newest first: the latest verdict is the current one, and the rows behind
    // it are the rework history.
    const reviews = await db
      .select()
      .from(productionJobReviews)
      .where(eq(productionJobReviews.jobId, jobId))
      .orderBy(desc(productionJobReviews.createdAt));

    return c.json({
      job,
      items,
      reviews,
      payableAmount: jobPayableAmount(job as unknown as PayableJob),
    });
  } catch (error) {
    return c.json(failed("read production job", error), 500);
  }
});

// ============================================================================
// POST /api/admin/production/:jobId/assign
// ============================================================================

adminProductionApp.post(
  "/:jobId/assign",
  zValidator("param", jobParamSchema),
  zValidator("json", assignJobSchema),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const { vendorId, expectedVendorId } = c.req.valid("json");

    try {
      const result = await db.transaction(async (tx) => {
        // FOR UPDATE: two admins assigning one job serialise here, and the row
        // read is the row the write is guarded against.
        const [job] = await tx
          .select()
          .from(productionJobs)
          .where(eq(productionJobs.id, jobId))
          .limit(1)
          .for("update");

        if (!job) throw new JobNotFound("Production job not found");

        const [vendor] = await tx
          .select({ id: vendors.id, name: vendors.name })
          .from(vendors)
          .where(eq(vendors.id, vendorId))
          .limit(1);

        if (!vendor) throw new JobNotFound("Vendor not found");

        const from = job.status;

        // Settled jobs are frozen. Payables are DERIVED with no stored total, so
        // re-pricing one after settlement makes the settlement's amount disagree
        // with the sum of its jobs, silently.
        if (job.settlementId !== null) {
          throw new JobWriteRefused(409, {
            error: "This job is already settled and cannot be assigned or re-priced.",
            code: "JOB_SETTLED",
            from,
            to: "assigned",
            allowed: [],
            settlementId: job.settlementId,
          });
        }

        // The guard this route never had. It did not read `job.status` at all,
        // so a cancelled, dispatched or qc_passed job was freely assignable.
        assertTransition(from, "assigned", "admin");

        // Compare-and-swap on the vendor. Answered with the vendor that ACTUALLY
        // holds the job, so the losing screen names who took it.
        if (
          expectedVendorId !== undefined &&
          (job.vendorId ?? null) !== (expectedVendorId ?? null)
        ) {
          throw new JobWriteRefused(409, {
            error:
              `This job is held by ${job.vendorId ?? "nobody"}, not by the vendor this ` +
              `request expected. Reload before reassigning it.`,
            code: "VENDOR_MISMATCH",
            from,
            to: "assigned",
            allowed: [],
            currentVendorId: job.vendorId,
            currentStatus: job.status,
          });
        }

        const items = await tx
          .select({
            orderItemId: productionJobItems.orderItemId,
            // A rate is charged per piece, so the line's quantity is part of the
            // question. Without it a line of three was priced as one.
            quantity: orderItems.quantity,
            widthInches: productVariants.widthInches,
            heightInches: productVariants.heightInches,
          })
          .from(productionJobItems)
          .leftJoin(orderItems, eq(productionJobItems.orderItemId, orderItems.id))
          .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
          .where(eq(productionJobItems.jobId, jobId));

        if (items.length === 0) {
          throw new JobWriteRefused(422, {
            error: "Cannot assign a job with no items",
            unpriced: [],
          });
        }

        const rateRows = await tx
          .select()
          .from(vendorRates)
          .where(eq(vendorRates.vendorId, vendorId));

        // ONE instant for the whole job. Taken before the loop so a slow loop
        // cannot price two items on opposite sides of a scheduled rate change.
        const at = new Date();
        const priced = priceItems(items, rateRows as RateRow[], job.stage, at);

        const unpriced = priced
          .filter((p) => p.rate === null)
          .map((p) => ({
            orderItemId: p.orderItemId,
            longestEdge: p.longestEdge,
            size: p.size,
          }));

        if (unpriced.length > 0) {
          // Nothing is written. A zero here would be an unbillable job with no
          // record of why it is unbillable.
          throw new JobWriteRefused(422, {
            error: `${vendor.name} has no rate covering ${unpriced.length} item(s) on this job`,
            unpriced,
          });
        }

        // Summed in integer paise by the payables module rather than by a float
        // add here — the amounts are decimals precisely so they stay exact. One
        // entry per PIECE: three posters on one line are three rates.
        const amountExpected = sumPayable(
          priced.flatMap((p) =>
            Array.from({ length: p.units }, (_unit, index) => ({
              id: `${p.orderItemId}#${index}`,
              amountExpected: p.rate?.amount ?? null,
              amountActual: null,
              settlementId: null,
            }))
          )
        );

        // The predicate is repeated rather than trusted from the read, and the
        // row count below turns a lost race into a rollback rather than a 200
        // over a write that matched nothing.
        const written = await tx
          .update(productionJobs)
          .set({
            vendorId,
            amountExpected,
            assignedAt: at,
            status: "assigned",
            updatedAt: at,
          })
          .where(
            and(
              eq(productionJobs.id, jobId),
              eq(productionJobs.status, from),
              isNull(productionJobs.settlementId)
            )
          )
          .returning();

        const [updated] = written;

        if (written.length !== 1 || !updated) {
          throw new JobWriteRefused(409, {
            error: `Expected to assign 1 job but matched ${written.length}; nothing was recorded`,
            code: "CONCURRENT_MODIFICATION",
            from,
            to: "assigned",
            allowed: [],
          });
        }

        // ONE row for one act. `draft -> assigned` does not also get a
        // `transitioned` row: the action that names what happened is the
        // assignment, and `assigned -> assigned` is a legal self-edge whose
        // whole content is the vendor change.
        const reassignment = job.vendorId !== null;

        await recordAudit(
          c,
          {
            action: reassignment
              ? "production_job.reassigned"
              : "production_job.assigned",
            entityType: "production_job",
            entityId: jobId,
            summary: reassignment
              ? `Production job reassigned to ${vendor.name} at ${amountExpected}`
              : `Production job assigned to ${vendor.name} at ${amountExpected}`,
            ...diffRecords(job, updated, [
              "status",
              "vendorId",
              "amountExpected",
              "assignedAt",
            ]),
            metadata: {
              from,
              to: "assigned",
              // NOT `vendorId`: `recordAudit` reserves that key for the shop a
              // VENDOR request was written for, and an admin acts for nobody.
              assignedVendorId: vendorId,
              previousVendorId: job.vendorId,
              pricedAt: at.toISOString(),
            },
          },
          // Shares the transaction: a row saying a vendor now owes us this work,
          // beside a job that was never assigned, is worse than no row.
          tx
        );

        return { job: updated, amountExpected, at };
      });

      return c.json({
        message: "Production job assigned",
        job: result.job,
        amountExpected: result.amountExpected,
        pricedAt: result.at.toISOString(),
      });
    } catch (error) {
      const refused = await refusedResponse(c, jobId, error);
      if (refused) return refused;
      return c.json(failed("assign production job", error), 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/production/:jobId
// ============================================================================

adminProductionApp.patch(
  "/:jobId",
  zValidator("param", jobParamSchema),
  zValidator("json", updateJobSchema),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const job = await db.transaction(async (tx) => {
        // Read first, and lock. The 404 comes from here rather than from an
        // empty `returning()`, the guard needs the from-status, and `diffRecords`
        // needs a `before` that is a row rather than an inference.
        const [before] = await tx
          .select()
          .from(productionJobs)
          .where(eq(productionJobs.id, jobId))
          .limit(1)
          .for("update");

        if (!before) throw new JobNotFound("Production job not found");

        const from = before.status;
        const to = body.status ?? from;

        // A settled job is frozen here, not merely protected from amount edits:
        // payables are DERIVED with no stored total, so an edit after settlement
        // makes the settlement disagree with the sum of its jobs silently — and
        // the `settlement_id IS NULL` that keeps the write honest would match no
        // row anyway.
        if (before.settlementId !== null) {
          throw new JobWriteRefused(409, {
            error: "This job is already settled and can no longer be edited here.",
            code: "JOB_SETTLED",
            from,
            to,
            allowed: [],
            settlementId: before.settlementId,
          });
        }

        // The matrix decides; this route only asks. A self-edge is legal and
        // lands below as a no-op with no audit row.
        if (body.status !== undefined) assertTransition(from, body.status, "admin");

        const written = await tx
          .update(productionJobs)
          .set({ ...body, updatedAt: new Date() })
          .where(
            and(
              eq(productionJobs.id, jobId),
              // Repeated, not trusted from the read: an admin who moved the job
              // between the two statements wins, and we match nothing.
              eq(productionJobs.status, from),
              isNull(productionJobs.settlementId)
            )
          )
          .returning();

        const [after] = written;

        if (written.length !== 1 || !after) {
          throw new JobWriteRefused(409, {
            error: `Expected to update 1 job but matched ${written.length}; nothing was recorded`,
            code: "CONCURRENT_MODIFICATION",
            from,
            to,
            allowed: [],
          });
        }

        // One row per TRANSITION, so a self-edge writes none: nothing moved.
        if (to !== from) {
          await recordAudit(
            c,
            {
              action: "production_job.transitioned",
              entityType: "production_job",
              entityId: jobId,
              summary: `Production job moved from ${from} to ${to}`,
              ...diffRecords(before, after, [
                "status",
                "dueAt",
                "sentAt",
                "receivedAt",
              ]),
              metadata: { from, to },
            },
            tx
          );
        }

        // A separate act, and a separate category: what we OWE a supplier is
        // money, not fulfilment.
        if (
          body.amountActual !== undefined &&
          (before.amountActual ?? null) !== (after.amountActual ?? null)
        ) {
          await recordAudit(
            c,
            {
              action: "production_job.amount_overridden",
              entityType: "production_job",
              entityId: jobId,
              summary:
                `Vendor amount overridden from ${before.amountActual ?? "none"} ` +
                `to ${after.amountActual ?? "none"}`,
              ...diffRecords(before, after, ["amountActual", "amountExpected"]),
              metadata: { from, to },
            },
            tx
          );
        }

        return after;
      });

      return c.json({
        message: "Production job updated",
        job,
        payableAmount: jobPayableAmount(job as unknown as PayableJob),
      });
    } catch (error) {
      const refused = await refusedResponse(c, jobId, error);
      if (refused) return refused;
      return c.json(failed("update production job", error), 500);
    }
  }
);

// ============================================================================
// POST /api/admin/production/:jobId/reviews
// ============================================================================

/**
 * The QC verdict, and the transition it IS.
 *
 * This route used to insert a row and touch nothing else, so the queue could
 * show `received` for a job that failed inspection an hour ago. The verdict and
 * the status move are one fact and are now one transaction: guard, insert the
 * review, move the job, stamp the photos it judged, audit it once.
 *
 * **APPEND ONLY.** There is deliberately no PATCH or DELETE beside this route:
 * fail -> rework -> pass must leave three rows, because that sequence is the QC
 * history and overwriting the verdict destroys it. `qc_passed -> qc_failed`
 * exists for the same reason at the other end — a supervisor re-inspecting and
 * overturning leaves a SECOND row while the first survives.
 *
 * **The `qc_submitted` guard is `assertTransition`, not a literal.** The matrix
 * gives `qc_passed` and `qc_failed` exactly one in-edge each from
 * `qc_submitted`, plus that overturn edge, which it documents as reachable only
 * through here. Repeating `from === 'qc_submitted'` beside the matrix would
 * refuse the overturn and leave an edge nothing in the codebase can take.
 *
 * If the transition is refused NOTHING is written — not the review either — so
 * `production_job_reviews`' append-only guarantee is untouched: there is no row
 * to be sorry about.
 */
adminProductionApp.post(
  "/:jobId/reviews",
  zValidator("param", jobParamSchema),
  zValidator("json", createReviewSchema),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const { verdict, defects, notes } = c.req.valid("json");
    const user = c.get("user");

    const to: ProductionJobStatus = verdict === "pass" ? "qc_passed" : "qc_failed";

    try {
      const result = await db.transaction(async (tx) => {
        // FOR UPDATE, like every other writer here: the row read is the row the
        // write is guarded against, and two reviewers on one job serialise.
        const [job] = await tx
          .select()
          .from(productionJobs)
          .where(eq(productionJobs.id, jobId))
          .limit(1)
          .for("update");

        if (!job) throw new JobNotFound("Production job not found");

        const from = job.status;

        // A settled job is frozen, as everywhere else in this router: payables
        // are DERIVED with no stored total, and a job that moves after
        // settlement makes the settlement disagree with the sum of its jobs.
        if (job.settlementId !== null) {
          throw new JobWriteRefused(409, {
            error: "This job is already settled and can no longer be inspected here.",
            code: "JOB_SETTLED",
            from,
            to,
            allowed: [],
            settlementId: job.settlementId,
          });
        }

        // The guard. A verdict on work that was never submitted is meaningless,
        // and the matrix is where that is written down.
        assertTransition(from, to, "admin");

        const [review] = await tx
          .insert(productionJobReviews)
          .values({
            jobId,
            // From the session, never from the body: who signed off is not the
            // caller's to assert.
            reviewerId: user.id,
            verdict,
            defects: defects ?? null,
            notes: notes ?? null,
          })
          .returning();

        if (!review) throw new Error("Review insert returned no row");

        const at = new Date();

        // The predicate is repeated rather than trusted from the read, and the
        // row count below turns a lost race into a rollback rather than a 201
        // over a write that matched nothing.
        const written = await tx
          .update(productionJobs)
          .set({ status: to, updatedAt: at })
          .where(
            and(
              eq(productionJobs.id, jobId),
              eq(productionJobs.status, from),
              isNull(productionJobs.settlementId)
            )
          )
          .returning();

        const [updated] = written;

        if (written.length !== 1 || !updated) {
          throw new JobWriteRefused(409, {
            error: `Expected to move 1 job but matched ${written.length}; nothing was recorded`,
            code: "CONCURRENT_MODIFICATION",
            from,
            to,
            allowed: [],
          });
        }

        // Stamp the verdict onto the shots it actually saw. LIVE photos only:
        // a superseded shot was judged by an earlier review, and re-stamping it
        // would rewrite that history. This is what lets a dispute a year later
        // say WHICH photographs were approved rather than merely that the job
        // was.
        const judged = await tx
          .update(productionJobPhotos)
          .set({ reviewId: review.id })
          .where(
            and(
              eq(productionJobPhotos.jobId, jobId),
              isNull(productionJobPhotos.supersededAt)
            )
          )
          .returning({ id: productionJobPhotos.id, slot: productionJobPhotos.slot });

        const judgedSlots = judged.map((photo) => photo.slot);

        // ONE row for one act. The verdict and the status move are the same
        // fact, so there is deliberately no `transitioned` row beside this one:
        // two rows for one act breaks the "one row per transition" property the
        // timeline is read through.
        await recordAudit(
          c,
          {
            action:
              verdict === "pass"
                ? "production_job.qc_approved"
                : "production_job.qc_rejected",
            entityType: "production_job",
            entityId: jobId,
            summary:
              verdict === "pass"
                ? `QC passed on ${judgedSlots.length} photo(s)`
                : `QC failed on ${judgedSlots.length} photo(s): ${(defects ?? []).join(", ")}`,
            ...diffRecords(job, updated, ["status"]),
            metadata: {
              from,
              to,
              // The evidence this row rests on. Without it the verdict and the
              // review that justifies it are two rows nobody can join.
              reviewId: review.id,
              verdict,
              defects: defects ?? [],
              judgedSlots,
              judgedPhotoIds: judged.map((photo) => photo.id),
            },
          },
          // Shares the transaction: a row saying the job passed QC, beside a
          // job still sitting in qc_submitted, is worse than no row.
          tx
        );

        return { review, job: updated, judgedSlots };
      });

      return c.json(
        {
          message: `Review recorded and job moved to ${to}`,
          review: result.review,
          job: result.job,
          judgedSlots: result.judgedSlots,
        },
        201
      );
    } catch (error) {
      const refused = await refusedResponse(c, jobId, error);
      if (refused) return refused;
      return c.json(failed("record review", error), 500);
    }
  }
);

// ============================================================================
// GET /api/admin/production/:jobId/photos
// ============================================================================

/**
 * The shot list an admin judges, laid out slot by slot.
 *
 * The whole list comes back, not only what was uploaded: an EMPTY slot is the
 * point of the screen, and `missingRequiredSlots` names what still has to be
 * reshot. `QC_SHOT_LIST` in `@chobii/shared` is the one copy of that list, read
 * here and by the vendor portal.
 *
 * **Live photos only.** `superseded_at IS NULL` is the definition of live, and
 * a superseded shot belongs to the review that judged it rather than to this
 * screen.
 *
 * **The object key never leaves.** Each live photo is answered with a presigned
 * DOWNLOAD url and nothing else — `approval_photos.url` is the counter-example
 * this deliberately does not copy, because a stored URL cannot be re-signed
 * when it expires and the URL itself becomes the capability. The signing helper
 * is `lib/storage`'s, NOT `lib/vendor-scope`'s: those are scope-limited to one
 * shop's own objects, which is the wrong question for an admin who oversees
 * every shop.
 *
 * The 404 is answered BEFORE anything is signed. A signed URL that is generated
 * and then withheld has still been generated, and lives in whatever log or
 * trace saw it.
 */
adminProductionApp.get(
  "/:jobId/photos",
  zValidator("param", jobParamSchema),
  async (c) => {
    const { jobId } = c.req.valid("param");

    try {
      const [job] = await db
        .select({
          id: productionJobs.id,
          stage: productionJobs.stage,
          status: productionJobs.status,
        })
        .from(productionJobs)
        .where(eq(productionJobs.id, jobId))
        .limit(1);

      if (!job) return c.json({ error: "Production job not found" }, 404);

      const live = await db
        .select({
          id: productionJobPhotos.id,
          slot: productionJobPhotos.slot,
          objectKey: productionJobPhotos.objectKey,
          contentType: productionJobPhotos.contentType,
          sizeBytes: productionJobPhotos.sizeBytes,
          uploadedBy: productionJobPhotos.uploadedBy,
          uploadedAt: productionJobPhotos.uploadedAt,
          reviewId: productionJobPhotos.reviewId,
        })
        .from(productionJobPhotos)
        .where(
          and(
            eq(productionJobPhotos.jobId, jobId),
            isNull(productionJobPhotos.supersededAt)
          )
        )
        .orderBy(asc(productionJobPhotos.uploadedAt));

      type LivePhoto = (typeof live)[number];

      const bySlot = new Map<string, LivePhoto>(live.map((photo) => [photo.slot, photo]));

      const shotList = qcShotsForStage(job.stage);
      const listedSlots = new Set(shotList.map((shot) => shot.slot));

      const entries: Array<{
        slot: string;
        label: string;
        required: boolean;
        onShotList: boolean;
        photo: LivePhoto | null;
      }> = shotList.map((shot) => ({
        slot: shot.slot,
        label: shot.label,
        required: shot.required,
        onShotList: true,
        photo: bySlot.get(shot.slot) ?? null,
      }));

      // A live photo in a slot this stage does not ask for — a job whose stage
      // was edited after the upload, or a portal sending the other list's key.
      // Surfaced rather than dropped: `slot` is `text` with no enum under it,
      // so a photograph nobody can find is a real failure mode, and hiding it
      // here is how it stays invisible.
      for (const photo of live) {
        if (listedSlots.has(photo.slot)) continue;
        entries.push({
          slot: photo.slot,
          label: `Uploaded outside the ${job.stage} shot list`,
          required: false,
          onShotList: false,
          photo,
        });
      }

      const signedAt = Date.now();

      const shots = await Promise.all(
        entries.map(async (entry) => ({
          slot: entry.slot,
          label: entry.label,
          required: entry.required,
          onShotList: entry.onShotList,
          photo: entry.photo
            ? {
                id: entry.photo.id,
                contentType: entry.photo.contentType,
                sizeBytes: entry.photo.sizeBytes,
                uploadedBy: entry.photo.uploadedBy,
                uploadedAt: entry.photo.uploadedAt,
                /** The review that judged this shot, once one has. */
                reviewId: entry.photo.reviewId,
                url: await getPresignedDownloadUrl(
                  entry.photo.objectKey,
                  QC_PHOTO_URL_TTL_SECONDS
                ),
              }
            : null,
        }))
      );

      return c.json({
        jobId,
        stage: job.stage,
        status: job.status,
        shots,
        /** What the vendor still has to shoot — the reviewer's one action. */
        missingRequiredSlots: requiredQcSlots(job.stage).filter((slot) => !bySlot.has(slot)),
        expiresInSeconds: QC_PHOTO_URL_TTL_SECONDS,
        expiresAt: new Date(signedAt + QC_PHOTO_URL_TTL_SECONDS * 1000).toISOString(),
      });
    } catch (error) {
      return c.json(failed("list production job photos", error), 500);
    }
  }
);

export { adminProductionApp };
export default adminProductionApp;
