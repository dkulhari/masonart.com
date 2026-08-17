/**
 * Admin Vendor Payables and Settlements
 *
 * - GET  /api/admin/vendors/:id/payables      unsettled jobs + what we owe
 * - GET  /api/admin/vendors/:id/settlements   what we have already paid
 * - POST /api/admin/vendors/:id/settlements   record one payment
 *
 * Mounted on the same prefix as `routes/admin/vendors.ts` (Hono merges routers
 * additively), and gated the same way: `requireAdmin`, never
 * `requireContentManager`. This is what we owe a supplier, which is finance
 * data wearing a catalogue shape.
 *
 * Three rules this file exists to hold:
 *
 * 1. **Payables are DERIVED, never stored.** There is no balance column, so
 *    there is no parallel ledger to drift. The total here is
 *    `lib/vendor-payables.sumPayable` over the rows with `settlement_id IS
 *    NULL` — the same module `routes/admin/vendors.ts` uses for `amountOwed`,
 *    and the arithmetic twin of `lib/vendor-scope.getVendorPayableTotal`,
 *    which is what the VENDOR sees. `tests/routes/admin/vendor-payables.test.ts`
 *    asserts the two agree over one set of rows (carried over from #611):
 *    admin and vendor opening the same month must not see two numbers.
 *
 * 2. **A settlement is one transaction or it is a way to overpay.** Every job
 *    is verified — it exists, it belongs to THIS vendor, and its
 *    `settlement_id` is still NULL — before anything is written, and the whole
 *    thing runs on `tx`. Any violation is a 422 with nothing written. The
 *    verification read takes `FOR UPDATE` so two admins clicking at once
 *    serialise instead of both reading "unsettled" and both paying.
 *
 * 3. **Executing the payment stays outside the system, permanently.** No
 *    payout API, no bank integration, not later. The money moves by NEFT or
 *    UPI in someone's banking app; this records the reference and the date so
 *    the two can be reconciled. `reference` is free text for exactly that
 *    reason.
 *
 * The double-settle guard is the important one. A refused duplicate is a
 * visible error; an accepted one is a second payment against work already paid
 * for, with nothing anywhere to say so.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../database";
import { vendors } from "../../database/schema/vendors";
import {
  productionJobs,
  vendorSettlements,
} from "../../database/schema/production-jobs";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  sumPayable,
  jobPayableAmount,
  type PayableJob,
} from "../../lib/vendor-payables";

// ============================================================================
// Validation
// ============================================================================

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Money in, as a decimal(10,2) string. Numbers are accepted and normalised
 * because JSON clients send them, but the value is carried as a string from
 * here on: the column is decimal precisely so nothing rounds.
 */
const amountSchema = z
  .union([z.string().trim(), z.number()])
  .transform((v) => (typeof v === "number" ? v.toFixed(2) : v))
  .refine(
    (v) => /^\d+(\.\d{1,2})?$/.test(v),
    "amount must be a decimal with at most two places"
  )
  .refine((v) => Number(v) > 0, "amount must be greater than zero");

const createSettlementSchema = z.object({
  amount: amountSchema,
  reference: z.string().trim().max(200).nullish(),
  /** Defaults to now — the payment usually happened moments ago. */
  paidAt: z.coerce.date().optional(),
  note: z.string().max(2000).nullish(),
  jobIds: z
    .array(z.string().uuid())
    .min(1, "at least one job id is required")
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "duplicate job ids"),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminVendorPayablesApp = new Hono<{ Variables: AuthVariables }>();

adminVendorPayablesApp.use("*", requireAuth, requireAdmin);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
}

async function vendorExists(vendorId: string): Promise<boolean> {
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);

  return rows.length > 0;
}

/**
 * A refusal the admin can act on, raised from inside the transaction so the
 * rollback and the 422 are the same decision. Thrown rather than returned
 * because a `return` from inside the callback would commit.
 */
class SettlementRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementRejected";
  }
}

/** Trims a long id list for an error message the admin can actually read. */
function summarise(ids: string[]): string {
  return ids.length > 5 ? `${ids.slice(0, 5).join(", ")} (+${ids.length - 5} more)` : ids.join(", ");
}

// ============================================================================
// GET /api/admin/vendors/:id/payables
// ============================================================================

adminVendorPayablesApp.get(
  "/:id/payables",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      // `settlement_id IS NULL` is in the WHERE, not a filter applied after
      // the fact: unsettled is bounded by the settlement cycle, all-history is
      // not.
      const rows = await db
        .select({
          id: productionJobs.id,
          orderId: productionJobs.orderId,
          stage: productionJobs.stage,
          status: productionJobs.status,
          dueAt: productionJobs.dueAt,
          sentAt: productionJobs.sentAt,
          receivedAt: productionJobs.receivedAt,
          amountExpected: productionJobs.amountExpected,
          amountActual: productionJobs.amountActual,
          settlementId: productionJobs.settlementId,
          createdAt: productionJobs.createdAt,
        })
        .from(productionJobs)
        .where(
          and(
            eq(productionJobs.vendorId, id),
            isNull(productionJobs.settlementId)
          )
        )
        .orderBy(asc(productionJobs.createdAt));

      const jobs = rows.map((job) => ({
        ...job,
        /** What this one job is worth: the override if there is one. */
        amount: jobPayableAmount(job as PayableJob),
      }));

      return c.json({
        vendorId: id,
        jobs,
        jobCount: jobs.length,
        total: sumPayable(rows as PayableJob[]),
      });
    } catch (error) {
      return c.json(failed("read payables", error), 500);
    }
  }
);

// ============================================================================
// GET /api/admin/vendors/:id/settlements
// ============================================================================

adminVendorPayablesApp.get(
  "/:id/settlements",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const settlements = await db
        .select()
        .from(vendorSettlements)
        .where(eq(vendorSettlements.vendorId, id))
        .orderBy(desc(vendorSettlements.paidAt));

      return c.json({ vendorId: id, settlements });
    } catch (error) {
      return c.json(failed("list settlements", error), 500);
    }
  }
);

// ============================================================================
// POST /api/admin/vendors/:id/settlements
// ============================================================================

adminVendorPayablesApp.post(
  "/:id/settlements",
  zValidator("param", idParamSchema),
  zValidator("json", createSettlementSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { amount, reference, paidAt, note, jobIds } = c.req.valid("json");
    const user = c.get("user");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const result = await db.transaction(async (tx) => {
        // FOR UPDATE: two admins settling the same job at the same time must
        // serialise here rather than both read "unsettled".
        const jobs = await tx
          .select({
            id: productionJobs.id,
            vendorId: productionJobs.vendorId,
            settlementId: productionJobs.settlementId,
            amountExpected: productionJobs.amountExpected,
            amountActual: productionJobs.amountActual,
          })
          .from(productionJobs)
          .where(inArray(productionJobs.id, jobIds))
          .for("update");

        const found = new Set(jobs.map((j) => j.id));
        const missing = jobIds.filter((jobId) => !found.has(jobId));
        if (missing.length > 0) {
          throw new SettlementRejected(
            `Unknown production job ids: ${summarise(missing)}`
          );
        }

        const foreign = jobs.filter((j) => j.vendorId !== id);
        if (foreign.length > 0) {
          throw new SettlementRejected(
            `These jobs belong to a different vendor: ${summarise(
              foreign.map((j) => j.id)
            )}`
          );
        }

        const alreadySettled = jobs.filter((j) => j.settlementId != null);
        if (alreadySettled.length > 0) {
          // Loud on purpose. Paying twice for one job is invisible otherwise.
          throw new SettlementRejected(
            `These jobs are already settled: ${summarise(
              alreadySettled.map((j) => j.id)
            )}`
          );
        }

        const [settlement] = await tx
          .insert(vendorSettlements)
          .values({
            vendorId: id,
            amount,
            reference: reference ?? null,
            note: note ?? null,
            ...(paidAt ? { paidAt } : {}),
            createdBy: user.id,
          })
          .returning();

        if (!settlement) {
          throw new Error("Settlement insert returned no row");
        }

        // The predicate is repeated in the UPDATE rather than trusted from the
        // read: belt and braces against anything that slipped in between, and
        // the row count below turns that into a rollback rather than a
        // half-stamped batch.
        const stamped = await tx
          .update(productionJobs)
          .set({ settlementId: settlement.id, updatedAt: new Date() })
          .where(
            and(
              inArray(productionJobs.id, jobIds),
              eq(productionJobs.vendorId, id),
              isNull(productionJobs.settlementId)
            )
          )
          .returning({ id: productionJobs.id });

        if (stamped.length !== jobIds.length) {
          throw new SettlementRejected(
            `Expected to settle ${jobIds.length} job(s) but matched ${stamped.length}; nothing was recorded`
          );
        }

        return { settlement, jobsSettled: stamped.length };
      });

      return c.json(
        {
          message: "Settlement recorded",
          settlement: result.settlement,
          jobsSettled: result.jobsSettled,
        },
        201
      );
    } catch (error) {
      if (error instanceof SettlementRejected) {
        return c.json({ error: error.message }, 422);
      }
      return c.json(failed("record settlement", error), 500);
    }
  }
);

export { adminVendorPayablesApp };
export default adminVendorPayablesApp;
