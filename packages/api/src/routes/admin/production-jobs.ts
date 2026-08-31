/**
 * Admin Production Job Routes
 *
 * - GET   /api/admin/production                 paginated queue; stage/status/vendor/order filters
 * - POST  /api/admin/production                 create a job + its items in ONE transaction
 * - GET   /api/admin/production/:jobId          job + items + reviews + payable
 * - PATCH /api/admin/production/:jobId          amountActual override, dates, status
 * - POST  /api/admin/production/:jobId/assign   price against the live rate card and assign
 * - POST  /api/admin/production/:jobId/reviews  the QC verdict, and the move it IS
 * - GET   /api/admin/production/:jobId/photos   the shot list, signed for review
 *
 * A second router in the same file answers the two ORDER-scoped questions, and
 * is mounted on `/api/admin/orders`:
 *
 * - POST  /api/admin/orders/:orderId/consolidator          who assembles and ships it
 * - GET   /api/admin/orders/:orderId/consolidator          who assembles it, and who said so
 * - GET   /api/admin/orders/:orderId/production-readiness  why it cannot ship yet
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
 * Nine decisions worth the ink:
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
 *    module; nothing here re-implements them. A job carrying an
 *    `amount_actual` — a price negotiated with the vendor that HOLDS it —
 *    cannot be reassigned without the caller saying what the new price is:
 *    `jobPayableAmount` is `COALESCE(actual, expected)`, so a negotiated number
 *    left in place is the old vendor's discount charged against the new
 *    vendor's work.
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
 * 8. **`assertTransition` is half the answer; the guard is the other half.**
 *    Every edge the matrix marks with a `guard` has that circumstance evaluated
 *    before the write — or, where the guard belongs to another route, the edge
 *    is refused here and that route is named. PATCH used to take all three of
 *    its guarded edges blind. `qc_passed -> dispatched` on goods that had not
 *    moved is the unrecoverable one: `dispatched` is terminal, so
 *    `evaluateLabelReadiness` reports `goods_not_at_consolidator` forever and
 *    the order can never be labelled again.
 *
 * 9. **The consolidator nobody had to choose is written at first assignment.**
 *    Design §5 rule 1 — one vendor holding every job on the order is the
 *    overwhelming majority and needs no admin action.
 *    `lib/production-readiness.proposeConsolidator` decides it; the assign route
 *    only writes it, with `decided_by = NULL`, and only once every live job on
 *    the order is assigned to that one vendor.
 *
 * Money arithmetic is `lib/vendor-payables`' throughout — `sumRupees` adds the
 * matched rates in integer paise and `jobPayableAmount` answers
 * `COALESCE(actual, expected)`, except on a cancelled job where only an amount
 * an admin actually stated counts (#695). A second money implementation in a
 * router is how a ledger starts disagreeing with itself.
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
import {
  orders,
  orderItems,
  type OrderShippingDetails,
} from "../../database/schema/orders";
import {
  orderConsolidation,
  productionTransfers,
  productionTransferJobs,
} from "../../database/schema/production-transfers";
import { productVariants } from "../../database/schema/products";
import { users } from "../../database/schema/users";
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
  sumRupees,
  jobPayableAmount,
  type PayableJob,
} from "../../lib/vendor-payables";
import {
  assertTransition,
  guardFor,
  ProductionTransitionError,
  type ProductionJobStatus,
  type TransitionGuard,
} from "../../lib/production-transitions";
import {
  loadOrderProductionSnapshot,
  proposeConsolidator,
  consolidatorOverrideAllowed,
  getOrderLabelReadiness,
  type ConsolidatorBasis,
} from "../../lib/production-readiness";
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
  /**
   * One order's jobs. `production_jobs_order_id_idx` already covers it.
   *
   * `OrderProductionPanel.tsx` pages the whole queue and matches client-side
   * under a page bound because this did not exist, and withholds its coverage
   * verdict whenever that bound is hit — "these items are on no job" read off a
   * truncated scan is a guess. This narrows that scan to one query.
   */
  orderId: z.string().uuid().optional(),
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
  /**
   * The price negotiated with the vendor this request is assigning TO.
   *
   * Carried explicitly or not at all. A job that already has an `amount_actual`
   * and a request that says nothing about it is refused rather than
   * silently re-pointed — see the handler. `null` drops the old negotiation, so
   * the job is payable at the new vendor's own rate card.
   */
  amountActual: decimalString.nullable().optional(),
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

/** The handle `db.transaction` hands its callback — it reads AND writes. */
type ProductionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  const { page, pageSize, stage, status, vendorId, orderId } = c.req.valid("query");
  const offset = (page - 1) * pageSize;

  try {
    const conditions = [];
    if (stage) conditions.push(eq(productionJobs.stage, stage));
    if (status) conditions.push(eq(productionJobs.status, status));
    if (vendorId) conditions.push(eq(productionJobs.vendorId, vendorId));
    if (orderId) conditions.push(eq(productionJobs.orderId, orderId));
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

      // `production_job.created` is registered at
      // `packages/shared/src/schemas/audit-log.ts:136` and, until now, was never
      // emitted by anything: the job appeared in the trail for the first time
      // when somebody assigned it. The rule is "an action is declared in the
      // same phase as its emitter, or not at all", and #671 adds a build guard
      // that fails on any declared-but-dead action.
      //
      // Inside the transaction, like every other row that describes a write:
      // a row announcing a job whose insert rolled back would be a lie.
      await recordAudit(
        c,
        {
          action: "production_job.created",
          entityType: "production_job",
          entityId: job.id,
          summary:
            `Production job created for order ${orderId}: ${stage} stage, ` +
            `${items.length} item(s)`,
          ...diffRecords(null, job),
          metadata: {
            orderId,
            stage,
            status: "draft",
            orderItemIds,
            dueAt: dueAt ? dueAt.toISOString() : null,
          },
        },
        tx
      );

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
// The guard on an edge — the half `assertTransition` deliberately leaves open
// ============================================================================

/**
 * `assertTransition` answers *may this actor take this edge*. It does not answer
 * the CIRCUMSTANCE the edge names, and `lib/production-transitions.ts` says so
 * in as many words: the `guard` "*names* the circumstance a route still has to
 * check". Until this existed nothing in `src/` called `guardFor` at all, so
 * PATCH took every one of its guarded edges without evaluating anything:
 *
 * - `qc_passed -> dispatched` on a job at a vendor holding no transfer. This one
 *   is unrecoverable — `dispatched` is terminal with zero out-edges,
 *   `evaluateLabelReadiness` then reports `goods_not_at_consolidator` forever,
 *   cancelling is illegal and a fresh job does not remove the old one from the
 *   order. The order can never be labelled again.
 * - `draft -> assigned` and `qc_failed -> assigned`, which answered 200 with a
 *   NULL vendor, a NULL amount and a NULL `assigned_at` — the unbillable job the
 *   assign route's 422 exists to prevent.
 *
 * Two kinds of guard, and they get different answers.
 */

/**
 * A guard this route cannot evaluate, and the route that owns it.
 *
 * Not squeamishness. PATCH takes no `vendorId`, so `priced-from-rate-card` has
 * no rate card to price against and no 422 to raise for an uncovered size, and
 * the verdict guards need the review row only `POST /:jobId/reviews` writes.
 * The secondary effect is worth as much as the primary one: reaching `assigned`
 * through PATCH emitted `production_job.transitioned` (category **fulfilment**)
 * while the assign route emits `production_job.assigned` (**money**), so an
 * auditor filtering `money` for "who committed us to this vendor" saw nothing.
 */
const GUARD_OWNER: Record<
  Exclude<TransitionGuard, "open-transfer-or-order-label">,
  string
> = {
  "priced-from-rate-card": "POST /api/admin/production/:jobId/assign",
  "review-verdict-pass": "POST /api/admin/production/:jobId/reviews",
  "review-verdict-fail": "POST /api/admin/production/:jobId/reviews",
  "shot-list-complete": "the vendor portal's QC submission",
};

/** An AWB, a tracking number or a shipment id — any one of them is a label. */
function orderShippingLabel(details: OrderShippingDetails | null): string | null {
  return details
    ? (details.awbNumber ?? details.trackingNumber ?? details.shipmentId ?? null)
    : null;
}

/**
 * `open-transfer-or-order-label` — the two ways a piece may legitimately leave.
 *
 * Either it is on a parcel to the next vendor that has not been declared lost,
 * or the order already carries a shipping label, which is the consolidator
 * handing the goods to the courier — the case `evaluateLabelReadiness` reads as
 * "dispatched and on no inter-vendor transfer".
 *
 * Evaluated here rather than refused, because nothing else in the codebase takes
 * this edge: refusing it would leave a pipeline with no way to despatch at all,
 * which is the failure `lib/production-transitions.ts` calls "an edge nothing in
 * the codebase can take".
 */
async function despatchEvidence(
  tx: ProductionTx,
  job: { id: string; orderId: string }
): Promise<{ satisfied: boolean; detail: Record<string, unknown> }> {
  const [transfer] = await tx
    .select({
      id: productionTransfers.id,
      toVendorId: productionTransfers.toVendorId,
      dispatchedAt: productionTransfers.dispatchedAt,
      receivedAt: productionTransfers.receivedAt,
    })
    .from(productionTransferJobs)
    .innerJoin(
      productionTransfers,
      eq(productionTransfers.id, productionTransferJobs.transferId)
    )
    .where(
      and(
        eq(productionTransferJobs.jobId, job.id),
        // A LOST parcel is not an open one. The original job keeps its status
        // and its payable, and a REPLACEMENT job carries the work — see
        // `routes/admin/transfers.ts`.
        isNull(productionTransfers.lostAt)
      )
    )
    .limit(1);

  if (transfer) {
    return {
      satisfied: true,
      detail: { basis: "open_transfer", transferId: transfer.id },
    };
  }

  const [order] = await tx
    .select({ shippingDetails: orders.shippingDetails })
    .from(orders)
    .where(eq(orders.id, job.orderId))
    .limit(1);

  const label = orderShippingLabel(order?.shippingDetails ?? null);

  return label
    ? { satisfied: true, detail: { basis: "order_label", orderLabel: label } }
    : { satisfied: false, detail: { transferId: null, orderLabel: null } };
}

/**
 * Evaluate the guard the matrix names on this edge, or refuse the edge.
 *
 * Called only when the job actually MOVES: a self-edge is not a transition, and
 * `assigned -> assigned` through PATCH changes neither vendor nor amount, so
 * there is no circumstance for a guard to be about.
 */
async function assertGuardSatisfied(
  tx: ProductionTx,
  job: { id: string; orderId: string },
  from: ProductionJobStatus,
  to: ProductionJobStatus
): Promise<void> {
  const guard = guardFor(from, to);
  if (!guard) return;

  if (guard === "open-transfer-or-order-label") {
    const evidence = await despatchEvidence(tx, job);
    if (evidence.satisfied) return;

    throw new JobWriteRefused(409, {
      error:
        "This job is on no open transfer and its order carries no shipping label, " +
        "so nothing has moved the goods anywhere. 'dispatched' is terminal: " +
        "marking it now would leave this order permanently unlabelable.",
      code: "GUARD_UNSATISFIED",
      guard,
      from,
      to,
      allowed: [],
      ...evidence.detail,
    });
  }

  throw new JobWriteRefused(409, {
    error:
      `Moving a job from '${from}' to '${to}' has to satisfy the '${guard}' guard, ` +
      `which this route cannot evaluate. Use ${GUARD_OWNER[guard]} instead.`,
    code: "GUARD_NOT_EVALUABLE_HERE",
    guard,
    route: GUARD_OWNER[guard],
    from,
    to,
    allowed: [],
  });
}

// ============================================================================
// The consolidator nobody had to choose
// ============================================================================

/**
 * Design §5 rule 1: "One vendor holds every job on the order → that vendor,
 * written automatically at first assignment. The overwhelming majority; no admin
 * action."
 *
 * Nothing wrote it. `POST /:orderId/consolidator` was the only writer, so the
 * majority path needed an explicit admin call, and until somebody made it
 * `no_consolidator` blocked the order out of fulfilment.
 *
 * **The rules are not re-derived here.** `proposeConsolidator` decides which
 * vendor and whether the choice needs confirming. This function decides only
 * whether there is anything to write, and writes it.
 *
 * One precondition sits on top of the proposal, and it is the one the reviewer
 * asked about: `proposeConsolidator` filters to jobs with a truthy `vendorId`,
 * so ONE assigned job beside an unassigned `draft` reads as `sole_vendor`. That
 * is a proposal, not a fact — the draft may yet go to another shop, and
 * `decided_by = NULL` claims there was nothing to decide. So the system default
 * is written only once every LIVE job on the order is assigned. An order split
 * across vendors still comes back `needsConfirmation` and still waits for an
 * admin, exactly as `POST /:orderId/consolidator` documents.
 */
async function writeSystemDefaultConsolidator(
  c: ProductionContext,
  tx: ProductionTx,
  job: { id: string; orderId: string },
  vendor: { id: string; name: string }
): Promise<{ vendorId: string; basis: ConsolidatorBasis } | null> {
  // The serialiser, and the same row `POST /:orderId/consolidator` locks: two
  // admins assigning two jobs of one order queue here rather than both reading
  // "undecided" and both inserting, where the loser would meet a primary-key
  // violation instead of an assignment.
  const [order] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, job.orderId))
    .limit(1)
    .for("update");

  if (!order) return null;

  // The seam's own loader, inside this transaction — the same rows the label
  // gate will later read, so the two cannot be looking at different orders.
  const snapshot = await loadOrderProductionSnapshot(job.orderId, tx);

  // Somebody has already decided. Re-deciding is `POST /:orderId/consolidator`'s
  // act, never a side effect of an assignment.
  if (snapshot.consolidatorVendorId !== null) return null;

  const live = snapshot.jobs.filter((row) => row.status !== "cancelled");
  if (live.length === 0 || live.some((row) => row.vendorId === null)) return null;

  const proposal = proposeConsolidator(snapshot.jobs);

  // `needsConfirmation` is the system saying it may propose but not write. The
  // vendor check is belt and braces: with one holder it IS the vendor this
  // request just assigned, and if it somehow is not, this is not the sole-vendor
  // case and there is nothing automatic to write.
  if (proposal.needsConfirmation || proposal.vendorId !== vendor.id) return null;

  const decidedAt = new Date();

  const written = await tx
    .insert(orderConsolidation)
    .values({ orderId: job.orderId, vendorId: vendor.id, decidedBy: null, decidedAt })
    .returning();

  const [row] = written;

  if (written.length !== 1 || !row) {
    throw new JobWriteRefused(409, {
      error: `Expected to write 1 consolidation row but matched ${written.length}; nothing was recorded`,
      code: "CONCURRENT_MODIFICATION",
      from: "assigned",
      to: "assigned",
      allowed: [],
      orderId: job.orderId,
    });
  }

  await recordAudit(
    c,
    {
      action: "order.consolidator_set",
      entityType: "order",
      entityId: job.orderId,
      summary: `Consolidator defaulted to ${vendor.name}: one vendor holds every job on the order`,
      ...diffRecords(null, row, ["vendorId", "decidedBy"]),
      metadata: {
        // Which of the two it was, spelled out rather than inferred from a null:
        // a reader of the trail must not have to know that `decided_by IS NULL`
        // means the system.
        decision: "system_default",
        basis: proposal.basis,
        // NOT `vendorId`: `recordAudit` reserves that key for the shop a VENDOR
        // request was written for, and an admin acts for nobody.
        consolidatorVendorId: vendor.id,
        previousConsolidatorVendorId: null,
        proposedVendorId: proposal.vendorId,
        proposalBasis: proposal.basis,
        needsConfirmation: proposal.needsConfirmation,
        // The assignment this row is a consequence of.
        viaJobId: job.id,
      },
    },
    // Shares the transaction: a row saying this order routes through this
    // vendor, beside an order that routes through nobody, is worse than no row.
    tx
  );

  return { vendorId: vendor.id, basis: proposal.basis };
}

// ============================================================================
// POST /api/admin/production/:jobId/assign
// ============================================================================

adminProductionApp.post(
  "/:jobId/assign",
  zValidator("param", jobParamSchema),
  zValidator("json", assignJobSchema),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const { vendorId, expectedVendorId, amountActual } = c.req.valid("json");

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

        // Design §10.6: "reassignment with `amount_actual` set is refused."
        //
        // `amount_actual` is a price NEGOTIATED with the vendor that holds the
        // job. `amount_expected` is about to be recomputed from the new vendor's
        // card and `jobPayableAmount` is COALESCE(actual, expected), so leaving
        // a negotiated number in place pays the new vendor the old one's
        // discount — 350 against 900 of work — and nothing surfaces it.
        //
        // Refused rather than cleared: dropping it silently is the same class of
        // mistake in the other direction, and only a human knows what was agreed
        // with the vendor being assigned to. `null` is how that human says
        // "nothing was; pay the rate card".
        if (job.amountActual !== null && amountActual === undefined) {
          throw new JobWriteRefused(409, {
            error:
              `This job carries a negotiated amount of ${job.amountActual}, agreed with ` +
              `the vendor that holds it. Re-pricing it would pay ${vendor.name} that ` +
              `number instead of their own rate. Send amountActual with the price agreed ` +
              `with ${vendor.name}, or null to drop it and pay the rate card.`,
            code: "NEGOTIATED_AMOUNT_PRESENT",
            from,
            to: "assigned",
            allowed: [],
            amountActual: job.amountActual,
            currentVendorId: job.vendorId,
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
        //
        // `sumRupees`, not `sumPayable`: these are rate-card matches, not job
        // rows. Borrowing the payable summer meant building fake jobs with a
        // null settlement to satisfy its filter, which made the payable rules
        // look like arithmetic incidentals rather than rules (#695).
        const amountExpected = sumRupees(
          priced.flatMap((p) =>
            Array.from({ length: p.units }, () => p.rate?.amount ?? null)
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
            // Explicitly, or not at all. `undefined` never reaches here on a job
            // that already carries one — the refusal above got there first.
            ...(amountActual !== undefined ? { amountActual } : {}),
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
              // The column the diff used to omit, which is how a negotiated
              // price could follow a job to another vendor unremarked.
              "amountActual",
              "assignedAt",
            ]),
            metadata: {
              from,
              to: "assigned",
              // NOT `vendorId`: `recordAudit` reserves that key for the shop a
              // VENDOR request was written for, and an admin acts for nobody.
              assignedVendorId: vendorId,
              previousVendorId: job.vendorId,
              previousAmountActual: job.amountActual,
              amountActual: amountActual === undefined ? job.amountActual : amountActual,
              pricedAt: at.toISOString(),
            },
          },
          // Shares the transaction: a row saying a vendor now owes us this work,
          // beside a job that was never assigned, is worse than no row.
          tx
        );

        // Design §5 rule 1, and the majority path: one vendor now holds every
        // job on this order, so the consolidator is not a judgement anybody has
        // to make. Written with `decided_by = NULL` inside this transaction —
        // a row routing an order through a vendor it was never assigned to is
        // exactly the lie the shared transaction exists to prevent.
        const consolidator = await writeSystemDefaultConsolidator(c, tx, updated, vendor);

        return { job: updated, amountExpected, at, consolidator };
      });

      return c.json({
        message: "Production job assigned",
        job: result.job,
        amountExpected: result.amountExpected,
        pricedAt: result.at.toISOString(),
        /** Non-null only when this assignment settled it — see §5 rule 1. */
        consolidator: result.consolidator,
      });
    } catch (error) {
      const refused = await refusedResponse(c, jobId, error);
      if (refused) return refused;
      return c.json(failed("assign production job", error), 500);
    }
  }
);

/**
 * The clock each admin-settable status stamps on `production_jobs`.
 *
 * The admin twin of `VENDOR_STATUS_STAMP` in `lib/vendor-scope.ts`, and it
 * exists for the same reason: a move that records THAT it happened without WHEN
 * leaves an SLA argument with nothing but an `updated_at` that a dozen later
 * writes have overwritten.
 *
 * Only statuses that OWN a column appear. `qc_passed` and `qc_failed` are dated
 * by the review row and `cancelled` by the audit log; inventing a column for
 * them here would be a second history that could disagree with the first.
 * `sent_at` is absent because `sent` is retired and the date the material went
 * out is evidence this route must not be able to overwrite.
 *
 * Partial rather than total, and a `Record<string, ...>` lookup rather than a
 * `switch`: an admin edge into a status with no clock is legitimate, so the
 * missing entry is the answer rather than a gap. The suite walks every admin
 * edge in the matrix and fails if a target that owns a clock is missing here.
 */
export const ADMIN_STATUS_STAMP: Partial<
  Record<ProductionJobStatus, 'assignedAt' | 'receivedAt' | 'qcSubmittedAt' | 'dispatchedAt'>
> = {
  assigned: "assignedAt",
  received: "receivedAt",
  qc_submitted: "qcSubmittedAt",
  dispatched: "dispatchedAt",
};

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

        // ...and then the guard the matrix NAMES on that edge, which
        // `assertTransition` deliberately does not answer. Only on a real move:
        // a self-edge changes nothing a guard could be about.
        if (to !== from) await assertGuardSatisfied(tx, before, from, to);

        // One reading of the clock for the whole write: the move and the record
        // of when it happened are the same event, and two `new Date()`s make
        // them disagree by however long the object literal took.
        const movedAt = new Date();
        const stamp = to !== from ? ADMIN_STATUS_STAMP[to] : undefined;

        const written = await tx
          .update(productionJobs)
          .set({
            ...body,
            // `lib/vendor-scope.ts` enforces total clock coverage on every
            // vendor edge precisely so a move cannot record THAT it happened
            // without WHEN. This path had no equivalent: an admin taking
            // `qc_passed -> dispatched` left `dispatched_at` NULL on a job that
            // had demonstrably been dispatched, and `updated_at` is overwritten
            // by everything so it is not evidence of anything in particular.
            ...(stamp ? { [stamp]: movedAt } : {}),
            updatedAt: movedAt,
          })
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
 *
 * **A photo stamp is a claim, not an overwrite.** `production_job_photos.
 * review_id` is set only where it is still NULL, so the shots an approving
 * review saw go on pointing at that review after a later one overturns it. The
 * full set each verdict judged is on that verdict's own audit row.
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

        // The shots this verdict actually saw. LIVE photos only: a superseded
        // shot was judged by an earlier review and belongs to that one.
        const judged = await tx
          .select({
            id: productionJobPhotos.id,
            slot: productionJobPhotos.slot,
          })
          .from(productionJobPhotos)
          .where(
            and(
              eq(productionJobPhotos.jobId, jobId),
              isNull(productionJobPhotos.supersededAt)
            )
          );

        const judgedSlots = judged.map((photo) => photo.slot);

        // The stamp CLAIMS an unclaimed shot. It never re-stamps one.
        //
        // `review_id` is a single column and this route deliberately supports
        // the `qc_passed -> qc_failed` overturn — a supervisor re-inspecting the
        // SAME live photographs. Without `review_id IS NULL` that second opinion
        // re-stamped every one of them, so no photograph pointed at the
        // approving review any more and §7's whole purpose — a dispute saying
        // WHICH shots were approved — was destroyed by the act of disagreeing.
        // First claim wins; every later verdict's full judged set is on its own
        // audit row below, which is where a second opinion is legible without
        // overwriting the first.
        const stamped = await tx
          .update(productionJobPhotos)
          .set({ reviewId: review.id })
          .where(
            and(
              eq(productionJobPhotos.jobId, jobId),
              isNull(productionJobPhotos.supersededAt),
              isNull(productionJobPhotos.reviewId)
            )
          )
          .returning({ id: productionJobPhotos.id, slot: productionJobPhotos.slot });

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
              // The subset this verdict is the FIRST to judge. The rest already
              // point at an earlier review and go on pointing at it.
              stampedPhotoIds: stamped.map((photo) => photo.id),
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

// ============================================================================
// The order-scoped half of the production API
// ============================================================================

/**
 * `POST /api/admin/orders/:orderId/consolidator`
 * `GET  /api/admin/orders/:orderId/consolidator`
 * `GET  /api/admin/orders/:orderId/production-readiness`
 *
 * A second router in the same module, mounted on `/api/admin/orders`. Both
 * questions are asked about an ORDER rather than about a job — which vendor
 * assembles it, and whether it can be labelled — so a job id in the path would
 * be a lie. The module stays one file because both answers are computed from
 * the production rows this file already owns.
 *
 * **The rules are not here.** `lib/production-readiness.ts` holds every one of
 * them: `proposeConsolidator` decides which vendor, `consolidatorOverrideAllowed`
 * decides whether the decision may still change, and `getOrderLabelReadiness`
 * decides whether the goods are assembled. This router reads rows, asks those
 * functions, writes the answer and audits it. A second copy of any of those
 * rules living in a route is how a gate and a screen start disagreeing about
 * the same order.
 *
 * ## The system proposes, an admin confirms
 *
 * `decided_by IS NULL` means the SYSTEM chose, and it is written only for the
 * one case where there is nothing to choose: a single vendor already holds every
 * job on the order. The other two cases — a frame job, or rolled posters split
 * across two print shops — come back as a 422 carrying the proposal, because the
 * real criterion (who is nearest the customer, which leg is cheapest) is not
 * modelled. An arbitrary choice an admin confirmed is visible and auditable; the
 * same choice written silently is not, and `decided_by` is where that difference
 * is kept.
 *
 * ## Concurrency
 *
 * `routes/admin/vendor-payables.ts:242-317`, the same shape as the writers
 * above: the ORDER row is read `FOR UPDATE` first — two admins choosing a
 * consolidator serialise on it — the existing decision is read under the same
 * lock, the predicate is repeated in the UPDATE's `WHERE`, and a row-count
 * mismatch rolls the transaction back rather than answering 200 over a write
 * that matched nothing. `order_consolidation.order_id` is the PRIMARY KEY, so
 * the database is what ultimately leaves one row; the lock is what keeps the
 * loser from seeing a constraint violation instead of an answer.
 *
 * ## Auth
 *
 * Gated per PATH rather than with `use('*')`. This router shares its mount with
 * `routes/admin/orders.ts`, and a `*` middleware here would also match every
 * route in that file — running the session lookup twice for the whole admin
 * orders tree. The gate is still this router's own: authorisation that depends
 * on another file being mounted first is authorisation nobody can see.
 */

const orderParamSchema = z.object({ orderId: z.string().uuid() });

/**
 * `vendorId` absent means "write the system default", which succeeds only when
 * there is nothing to decide. Naming a vendor is the admin CONFIRMING, and that
 * is the only way a row gets a `decided_by`.
 */
const setConsolidatorSchema = z.object({
  vendorId: z.string().uuid().optional(),
});

const adminOrderProductionApp = new Hono<{ Variables: AuthVariables }>();

// Per path, not `*` — see the note above. requireAdmin, like the job router:
// the consolidator decides which supplier handles the goods.
adminOrderProductionApp.use("/:orderId/consolidator", requireAuth, requireAdmin);
adminOrderProductionApp.use("/:orderId/production-readiness", requireAuth, requireAdmin);

/** Thrown out of the transaction so the read that found nothing still rolls back. */
class OrderNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNotFound";
  }
}

/**
 * The refusal response, and the audit row that has to outlive the rollback.
 *
 * Mirrors `refusedResponse` above and differs where it must: the action is
 * `order.consolidator_set` with `outcome: 'failure'`, because what was refused
 * was setting a consolidator. A 404 writes no row of its own — the audit
 * middleware's floor row is the right level of detail for "no such entity".
 */
async function refusedConsolidator(
  c: ProductionContext,
  orderId: string,
  error: unknown
): Promise<Response | null> {
  if (error instanceof OrderNotFound) return c.json({ error: error.message }, 404);
  if (!(error instanceof JobWriteRefused)) return null;

  // NO `tx`. The row records that a transaction was ROLLED BACK; writing it
  // inside that transaction rolls the evidence back with it. See `lib/audit.ts`.
  await recordAudit(c, {
    action: "order.consolidator_set",
    entityType: "order",
    entityId: orderId,
    summary: `Refused to set the consolidator: ${error.message}`,
    outcome: "failure",
    metadata: error.body,
  });

  return c.json(error.body, error.httpStatus);
}

// ============================================================================
// POST /api/admin/orders/:orderId/consolidator
// ============================================================================

adminOrderProductionApp.post(
  "/:orderId/consolidator",
  zValidator("param", orderParamSchema),
  zValidator("json", setConsolidatorSchema),
  async (c) => {
    const { orderId } = c.req.valid("param");
    const { vendorId: chosenVendorId } = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await db.transaction(async (tx) => {
        // The serialiser. Two admins choosing a consolidator for one order
        // queue here rather than both reading "undecided" and both inserting,
        // where the loser would meet a primary-key violation instead of an
        // answer.
        const [order] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1)
          .for("update");

        if (!order) throw new OrderNotFound("Order not found");

        // Under the same lock, and read for `decidedBy` as much as for the
        // vendor: confirming a system default is a real change even when the
        // vendor does not move.
        const [existing] = await tx
          .select({
            vendorId: orderConsolidation.vendorId,
            decidedBy: orderConsolidation.decidedBy,
            decidedAt: orderConsolidation.decidedAt,
          })
          .from(orderConsolidation)
          .where(eq(orderConsolidation.orderId, orderId))
          .limit(1)
          .for("update");

        // The seam's own loader, inside this transaction. It reads more than the
        // proposal strictly needs, and that is the point: the vendor proposed
        // here is proposed from exactly the rows the label gate will later read,
        // so the two cannot be looking at different orders.
        const snapshot = await loadOrderProductionSnapshot(orderId, tx);
        const proposal = proposeConsolidator(snapshot.jobs);

        if (chosenVendorId === undefined && proposal.vendorId === null) {
          throw new JobWriteRefused(422, {
            error:
              "No job on this order is assigned to a vendor yet, so there is nothing to " +
              "consolidate. Assign a job first, or name the vendor explicitly.",
            code: "NOTHING_TO_PROPOSE",
            proposal,
          });
        }

        if (chosenVendorId === undefined && proposal.needsConfirmation) {
          // The system may propose this one; it may not write it. A proposal
          // written with `decided_by = NULL` would claim there was nothing to
          // decide, which is the one thing this case is not.
          throw new JobWriteRefused(422, {
            error:
              "This order's jobs are split across vendors, so the consolidator is a " +
              "judgement an admin has to confirm. Repost naming the vendorId.",
            code: "CONFIRMATION_REQUIRED",
            proposal,
          });
        }

        const vendorId = chosenVendorId ?? (proposal.vendorId as string);
        /** NULL is the record of "the system chose"; an id is an admin standing behind it. */
        const decidedBy = chosenVendorId === undefined ? null : user.id;
        const decision = decidedBy === null ? "system_default" : "admin_confirmed";
        const basis =
          chosenVendorId === undefined
            ? proposal.basis
            : chosenVendorId === proposal.vendorId
              ? "confirmed_proposal"
              : "admin_override";

        const [vendor] = await tx
          .select({ id: vendors.id, name: vendors.name })
          .from(vendors)
          .where(eq(vendors.id, vendorId))
          .limit(1);

        if (!vendor) throw new OrderNotFound("Vendor not found");

        // Nothing moved and nobody changed their mind. One row per ACT, so
        // there is no write and no audit row: re-confirming what already stands
        // is not an act.
        //
        // An empty body is the SYSTEM proposing, and it may confirm what it
        // would have chosen anyway — it may NOT un-decide what a person decided.
        // Requiring `decided_by` to match in that case let a bare repost on an
        // admin-confirmed sole-vendor order fall past this check, past the
        // override guard (the vendor has not changed), and rewrite the row with
        // `decided_by = NULL`, which the trail documents as "there was nothing
        // to choose". Naming the vendor explicitly is still an act, and still
        // upgrades a system default.
        const standsAlready =
          existing &&
          existing.vendorId === vendorId &&
          (chosenVendorId === undefined || (existing.decidedBy ?? null) === decidedBy);

        if (standsAlready) {
          return {
            changed: false as const,
            consolidation: { orderId, ...existing },
            vendor,
            basis,
            // The row's own provenance, not the request's: an empty body
            // reaching here must not report a standing admin decision as the
            // system's.
            decision:
              (existing.decidedBy ?? null) === null
                ? ("system_default" as const)
                : ("admin_confirmed" as const),
            proposal,
          };
        }

        // Only a re-ROUTING is refused. Confirming the vendor the goods are
        // already travelling to changes no destination; it only stops the record
        // saying the system picked it.
        //
        // A FIRST decision is never an override either. An order with goods in
        // transit and no row at all is a repair, and refusing it would leave the
        // order permanently unlabelable — `no_consolidator` is a blocker, and
        // nothing else in the system can clear it.
        if (
          existing &&
          existing.vendorId !== vendorId &&
          !consolidatorOverrideAllowed(snapshot.transfers)
        ) {
          throw new JobWriteRefused(409, {
            error:
              "A transfer on this order has already dispatched, so the goods are moving " +
              "to the current consolidator. Re-routing them is a call to the carrier, " +
              "not a database write.",
            code: "TRANSFER_DISPATCHED",
            currentVendorId: existing.vendorId,
            requestedVendorId: vendorId,
          });
        }

        const decidedAt = new Date();

        // The predicate is repeated rather than trusted from the read, and the
        // row count below turns a lost race into a rollback rather than a 200
        // over a write that matched nothing.
        const written = existing
          ? await tx
              .update(orderConsolidation)
              .set({ vendorId, decidedBy, decidedAt })
              .where(
                and(
                  eq(orderConsolidation.orderId, orderId),
                  eq(orderConsolidation.vendorId, existing.vendorId)
                )
              )
              .returning()
          : await tx
              .insert(orderConsolidation)
              .values({ orderId, vendorId, decidedBy, decidedAt })
              .returning();

        const [row] = written;

        if (written.length !== 1 || !row) {
          throw new JobWriteRefused(409, {
            error: `Expected to write 1 consolidation row but matched ${written.length}; nothing was recorded`,
            code: "CONCURRENT_MODIFICATION",
            currentVendorId: existing?.vendorId ?? null,
            requestedVendorId: vendorId,
          });
        }

        await recordAudit(
          c,
          {
            action: "order.consolidator_set",
            entityType: "order",
            entityId: orderId,
            summary:
              decidedBy === null
                ? `Consolidator defaulted to ${vendor.name}: one vendor holds every job on the order`
                : `Consolidator set to ${vendor.name} by an admin (${basis.replace("_", " ")})`,
            ...diffRecords(existing ?? null, row, ["vendorId", "decidedBy"]),
            metadata: {
              // Which of the two it was, spelled out rather than inferred from a
              // null: a reader of the trail must not have to know that
              // `decided_by IS NULL` means the system.
              decision,
              basis,
              // NOT `vendorId`: `recordAudit` reserves that key for the shop a
              // VENDOR request was written for, and an admin acts for nobody.
              consolidatorVendorId: vendorId,
              previousConsolidatorVendorId: existing?.vendorId ?? null,
              proposedVendorId: proposal.vendorId,
              proposalBasis: proposal.basis,
              needsConfirmation: proposal.needsConfirmation,
            },
          },
          // Shares the transaction: a row saying this order routes through this
          // vendor, beside an order that routes through nobody, is worse than
          // no row.
          tx
        );

        return {
          changed: true as const,
          consolidation: row,
          vendor,
          basis,
          decision,
          proposal,
        };
      });

      return c.json({
        message: result.changed ? "Consolidator set" : "Consolidator unchanged",
        changed: result.changed,
        consolidation: result.consolidation,
        vendor: result.vendor,
        basis: result.basis,
        /** `decided_by IS NULL` — the system chose, because there was nothing to choose. */
        systemDefault: result.decision === "system_default",
        proposal: result.proposal,
      });
    } catch (error) {
      const refused = await refusedConsolidator(c, orderId, error);
      if (refused) return refused;
      return c.json(failed("set the order consolidator", error), 500);
    }
  }
);

// ============================================================================
// GET /api/admin/orders/:orderId/consolidator
// ============================================================================

/**
 * The standing decision — the ROW, not a verdict about it.
 *
 * `production-readiness` reports `consolidatorVendorId` and nothing else, so
 * until this route existed `decided_by` was invisible outside the database and
 * the admin panel read the provenance off the newest `order.consolidator_set`
 * audit row instead. Two things are wrong with that source, and only one of
 * them is tidiness:
 *
 * - `queues/audit-retention.ts` sweeps the trail at 400 days. This row does not
 *   expire. After a sweep the screen would print "unknown" over a fact the
 *   database still holds.
 * - the audit log is a filtered, paginated, admin-and-super-admin-only read. A
 *   display should not depend on one.
 *
 * **Absence is meaningful.** `consolidation: null` means nobody has decided,
 * which is NOT a system default — collapsing the two would invent exactly the
 * claim `decided_by` exists to make checkable. The caller renders the
 * difference; this route does not derive a boolean over it.
 *
 * `decidedByEmail` is the `decided_by` foreign key resolved, the same way the
 * POST resolves `vendor_id` to a name — not an extra fact. It is nullable for
 * two different reasons that read alike here and are told apart by `decidedBy`:
 * the system decided, or the account was since deleted (`ON DELETE set null`,
 * which nulls `decided_by` with it — see the schema note). The durable answer
 * to "who" remains the audit log, which snapshots the email at write time.
 *
 * **Not a history endpoint.** One order, one current row. The audit log is the
 * history and stays the history.
 */
adminOrderProductionApp.get(
  "/:orderId/consolidator",
  zValidator("param", orderParamSchema),
  async (c) => {
    const { orderId } = c.req.valid("param");

    try {
      const [consolidation] = await db
        .select({
          orderId: orderConsolidation.orderId,
          vendorId: orderConsolidation.vendorId,
          /** NULL is the record of "the system chose". See the schema note. */
          decidedBy: orderConsolidation.decidedBy,
          decidedByEmail: users.email,
          decidedAt: orderConsolidation.decidedAt,
        })
        .from(orderConsolidation)
        .leftJoin(users, eq(users.id, orderConsolidation.decidedBy))
        .where(eq(orderConsolidation.orderId, orderId))
        .limit(1);

      // No row is an ANSWER — "nobody has decided" — so it is 200 with an
      // explicit null rather than a 404, which would say the order is missing.
      return c.json({ orderId, consolidation: consolidation ?? null });
    } catch (error) {
      return c.json(failed("read the order consolidator", error), 500);
    }
  }
);

// ============================================================================
// GET /api/admin/orders/:orderId/production-readiness
// ============================================================================

/**
 * Why this order cannot be labelled yet — the LIST, not a boolean.
 *
 * `getOrderLabelReadiness` is the same call `isOrderReadyToLabel` is
 * `blockers.length === 0` over, so the gate that refuses to buy a courier label
 * and the screen that explains the refusal cannot disagree. Nothing is
 * re-derived here; the handler is the call, the codes and the envelope.
 *
 * `blockerCodes` is redundant with `blockers`, deliberately: the screen renders
 * messages, and everything else — a test, a log line, a dashboard — wants to
 * ask "is it THIS blocker" without pattern-matching English.
 *
 * A missing order answers 200 with the `order_not_found` blocker rather than a
 * 404. The question this route answers is "is this order ready", and "no such
 * order" is one of the answers — the one the readiness module added precisely
 * because a missing order otherwise reads as the gift-card ready path.
 */
adminOrderProductionApp.get(
  "/:orderId/production-readiness",
  zValidator("param", orderParamSchema),
  async (c) => {
    const { orderId } = c.req.valid("param");

    try {
      const readiness = await getOrderLabelReadiness(orderId);

      return c.json({
        orderId,
        ready: readiness.ready,
        consolidatorVendorId: readiness.consolidatorVendorId,
        blockers: readiness.blockers,
        blockerCodes: readiness.blockers.map((blocker) => blocker.code),
      });
    } catch (error) {
      return c.json(failed("read order production readiness", error), 500);
    }
  }
);

export { adminProductionApp, adminOrderProductionApp };
export default adminProductionApp;
