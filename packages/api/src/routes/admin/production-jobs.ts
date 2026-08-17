/**
 * Admin Production Job Routes
 *
 * - GET   /api/admin/production                 paginated queue; stage/status/vendor filters
 * - POST  /api/admin/production                 create a job + its items in ONE transaction
 * - GET   /api/admin/production/:jobId          job + items + reviews + payable
 * - PATCH /api/admin/production/:jobId          amountActual override, dates, status
 * - POST  /api/admin/production/:jobId/assign   price against the live rate card and assign
 * - POST  /api/admin/production/:jobId/reviews  append a QC review
 *
 * File shape follows `routes/admin/vendors.ts` — `new Hono<{ Variables:
 * AuthVariables }>()`, zod schemas at the top, one `use('*')` gate, a bounded
 * list. `requireAdmin`, not `requireContentManager`, for the same reason: these
 * rows carry what we pay a supplier.
 *
 * **This module defines the job RECORD. production-pipeline defines the
 * WORKFLOW.** `production_job_status` is a vocabulary, not a state machine
 * (schema/production-jobs.ts says so), so PATCH accepts any status without a
 * transition guard, and there are no routing rules, reprint loops or lead-time
 * calculation here. Those are the next sub-project. A missing guard is the
 * design, not an omission.
 *
 * Four decisions worth the ink:
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
 * 4. **Reviews are INSERT-only.** There is no PATCH or DELETE on a review, by
 *    construction rather than by convention: fail -> rework -> pass has to
 *    leave three rows, because that sequence IS the QC history. The table has
 *    no `updated_at` for the same reason.
 *
 * Money arithmetic is `lib/vendor-payables`' throughout — `sumPayable` adds the
 * matched rates in integer paise and `jobPayableAmount` answers
 * `COALESCE(actual, expected)`. A second money implementation in a router is
 * how a ledger starts disagreeing with itself.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "../../database";
import {
  productionJobs,
  productionJobItems,
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

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

const assignJobSchema = z.object({ vendorId: z.string().uuid() });

const updateJobSchema = z
  .object({
    /** The negotiated price. Print shops negotiate; hiding that invites workarounds. */
    amountActual: decimalString.nullable().optional(),
    status: z.enum(productionJobStatusEnum.enumValues).optional(),
    dueAt: z.coerce.date().nullable().optional(),
    sentAt: z.coerce.date().nullable().optional(),
    receivedAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

const createReviewSchema = z.object({
  verdict: z.enum(productionJobVerdictEnum.enumValues),
  defects: z.array(z.string().min(1).max(120)).max(50).nullish(),
  notes: z.string().max(2000).nullish(),
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

interface PricedItem {
  orderItemId: string;
  longestEdge: number | null;
  size: string | null;
  rate: RateRow | null;
}

/**
 * The rate in force for each item at ONE instant. Returns the priced items
 * alongside the misses; the caller refuses the whole assignment if there is
 * even one miss.
 */
function priceItems(
  items: Array<{
    orderItemId: string;
    widthInches: number | null;
    heightInches: number | null;
  }>,
  rates: RateRow[],
  kind: "print" | "frame",
  at: Date
): PricedItem[] {
  return items.map((item) => {
    if (item.widthInches == null || item.heightInches == null) {
      // No dimensions is a miss, not a zero: the variant is gone and we cannot
      // say what size was made.
      return { orderItemId: item.orderItemId, longestEdge: null, size: null, rate: null };
    }

    const longestEdge = longestEdgeInches({
      widthInches: item.widthInches,
      heightInches: item.heightInches,
    });

    return {
      orderItemId: item.orderItemId,
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
    const { vendorId } = c.req.valid("json");

    try {
      const [job] = await db
        .select()
        .from(productionJobs)
        .where(eq(productionJobs.id, jobId))
        .limit(1);

      if (!job) return c.json({ error: "Production job not found" }, 404);

      const [vendor] = await db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1);

      if (!vendor) return c.json({ error: "Vendor not found" }, 404);

      const items = await db
        .select({
          orderItemId: productionJobItems.orderItemId,
          widthInches: productVariants.widthInches,
          heightInches: productVariants.heightInches,
        })
        .from(productionJobItems)
        .leftJoin(orderItems, eq(productionJobItems.orderItemId, orderItems.id))
        .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
        .where(eq(productionJobItems.jobId, jobId));

      if (items.length === 0) {
        return c.json(
          {
            error: "Cannot assign a job with no items",
            unpriced: [],
          },
          422
        );
      }

      const rateRows = await db
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
        return c.json(
          {
            error: `${vendor.name} has no rate covering ${unpriced.length} item(s) on this job`,
            unpriced,
          },
          422
        );
      }

      // Summed in integer paise by the payables module rather than by a float
      // add here — the amounts are decimals precisely so they stay exact.
      const amountExpected = sumPayable(
        priced.map((p) => ({
          id: p.orderItemId,
          amountExpected: p.rate?.amount ?? null,
          amountActual: null,
          settlementId: null,
        }))
      );

      const [updated] = await db
        .update(productionJobs)
        .set({
          vendorId,
          amountExpected,
          assignedAt: at,
          status: "assigned",
          updatedAt: at,
        })
        .where(eq(productionJobs.id, jobId))
        .returning();

      if (!updated) return c.json({ error: "Production job not found" }, 404);

      return c.json({
        message: "Production job assigned",
        job: updated,
        amountExpected,
        pricedAt: at.toISOString(),
      });
    } catch (error) {
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
      // No transition guard on `status`. See the header: the state machine is
      // production-pipeline's, and inventing half of one here would have to be
      // unpicked when the real one lands.
      const [job] = await db
        .update(productionJobs)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(productionJobs.id, jobId))
        .returning();

      if (!job) return c.json({ error: "Production job not found" }, 404);

      return c.json({
        message: "Production job updated",
        job,
        payableAmount: jobPayableAmount(job as unknown as PayableJob),
      });
    } catch (error) {
      return c.json(failed("update production job", error), 500);
    }
  }
);

// ============================================================================
// POST /api/admin/production/:jobId/reviews
// ============================================================================

/**
 * APPEND ONLY. There is deliberately no PATCH or DELETE beside this route:
 * fail -> rework -> pass must leave three rows, because that sequence is the
 * QC history and overwriting the verdict destroys it.
 */
adminProductionApp.post(
  "/:jobId/reviews",
  zValidator("param", jobParamSchema),
  zValidator("json", createReviewSchema),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const { verdict, defects, notes } = c.req.valid("json");
    const user = c.get("user");

    try {
      const [job] = await db
        .select({ id: productionJobs.id })
        .from(productionJobs)
        .where(eq(productionJobs.id, jobId))
        .limit(1);

      if (!job) return c.json({ error: "Production job not found" }, 404);

      const [review] = await db
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

      return c.json({ message: "Review recorded", review }, 201);
    } catch (error) {
      return c.json(failed("record review", error), 500);
    }
  }
);

export { adminProductionApp };
export default adminProductionApp;
