/**
 * Admin Inter-Vendor Transfer Oversight
 *
 * - GET  /api/admin/transfers            every leg, both ends named, filterable
 * - POST /api/admin/transfers/:id/lost   declare a parcel gone, and replace the work
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §5
 *
 * A separate router from `routes/admin/production-jobs.ts` (which owns the job
 * RECORD) and from `routes/vendor.ts` (which owns what vendor B is told). Hono
 * merges routers additively, so the split costs nothing and keeps the one route
 * in this tree that spends money reviewable on its own.
 *
 * ## Admin only, and that is the whole point
 *
 * `requireAdmin`, never `requireContentManager` and never anything reachable
 * from the vendor portal. Declaring a parcel lost costs money, and a vendor
 * declaring it is a vendor deciding who eats that cost. The vendor side of a
 * transfer is deliberately a different, narrower surface: `{ id, reference,
 * carrier, pieceCount, dispatchedAt, expectedBy, receivedAt }` and no more —
 * vendor B never learns the parcel came from vendor A. The admin sees both
 * ends, because if somebody has to chase a carrier it is us.
 *
 * ## The original job keeps its status AND its payable
 *
 * This is the decision the whole route exists to encode. When a transfer is
 * declared lost, the original job stays `dispatched`, and a NEW `draft` job is
 * created carrying the same stage and the same `production_job_items`, linked
 * by `production_jobs.replaces_job_id`.
 *
 * - We owe vendor A for work they genuinely did. The parcel is what vanished,
 *   not the printing.
 * - Moving the original to `qc_failed` would slander their QC record and
 *   pollute the defect history that future vendor scorecards read.
 * - Erasing the payable to make the pipeline look tidy is exactly the
 *   ledger-drift class this repo keeps guarding against. Payables are DERIVED
 *   — `SUM(COALESCE(amount_actual, amount_expected)) WHERE settlement_id IS
 *   NULL`, with no stored total anywhere — precisely so that no route can
 *   quietly rewrite one. This route therefore issues no UPDATE against
 *   `production_jobs` at all, and `tests/routes/admin/transfers.test.ts` asserts
 *   the payable total is identical either side of the call.
 * - `replaces_job_id` exists because without it two print jobs against one
 *   order item read as a duplicate-entry mistake.
 *
 * The replacement is created unassigned and unpriced. `draft` is where
 * assignment prices against the rate card live at that instant
 * (`routes/admin/production-jobs.ts` decision 2); copying A's amount forward
 * would charge a different vendor's work at A's rate.
 *
 * The original's `production_job_items` rows are LEFT ALONE. They are the
 * record of what its still-intact payable was for, and the table's unique
 * constraint is the composite `(job_id, order_item_id)` from 0019 — not a
 * live-claim index over `order_item_id` — so the replacement's rows insert
 * cleanly under a new `job_id` with nothing to release.
 *
 * ## No transfer status enum, here or anywhere
 *
 * State derives from `dispatched_at` / `received_at` / `lost_at` through
 * `transferState` below, mirroring `production_jobs`' own date-driven shape.
 * Given this repo's enum hazard — `ALTER TYPE … ADD VALUE` and its first use
 * cannot share a transaction, and `drizzle-kit migrate` makes the whole pending
 * batch one transaction (#580, #673) — a fourth transfer state next year has to
 * cost a nullable timestamp rather than a migration nobody can apply. The
 * `?state=` filter is three timestamp tests, never a status column.
 *
 * ## Concurrency
 *
 * The recipe is `routes/admin/vendor-payables.ts:242-317`: read `FOR UPDATE`,
 * repeat the predicate in the UPDATE's `WHERE`, and roll the whole transaction
 * back on a row-count mismatch. Two admins clicking "lost" at the same moment
 * must produce one set of replacements, not two — and a replacement set is a
 * second job we will end up paying somebody to make.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../database";
import { vendors } from "../../database/schema/vendors";
import {
  productionJobs,
  productionJobItems,
} from "../../database/schema/production-jobs";
import {
  productionTransfers,
  productionTransferJobs,
} from "../../database/schema/production-transfers";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { recordAudit } from "../../lib/audit";

// ============================================================================
// Derived state
// ============================================================================

/**
 * The four states a parcel can be in. Not an enum on the table, and not a
 * column — see the module note.
 */
export type TransferState = "pending" | "in_transit" | "received" | "lost";

export const TRANSFER_STATES = [
  "pending",
  "in_transit",
  "received",
  "lost",
] as const satisfies readonly TransferState[];

/**
 * The pure function the three timestamps are read through.
 *
 * Arrival wins over a lost stamp. The route makes that pair unreachable — a
 * received transfer can never be declared lost — but if a row ever holds both,
 * the parcel is on a shelf at vendor B and the record should say so rather
 * than reporting a loss somebody has already disproved.
 *
 * Exported from the router rather than from `lib/` on purpose: it is one
 * five-line read over three columns, and the vendor portal shows a vendor a
 * different, narrower shape anyway.
 */
export function transferState(row: {
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  lostAt: Date | null;
}): TransferState {
  if (row.receivedAt) return "received";
  if (row.lostAt) return "lost";
  if (row.dispatchedAt) return "in_transit";
  return "pending";
}

/** The same four states as a SQL predicate. One definition, two readers. */
function stateCondition(state: TransferState) {
  switch (state) {
    case "pending":
      return and(
        isNull(productionTransfers.dispatchedAt),
        isNull(productionTransfers.receivedAt),
        isNull(productionTransfers.lostAt)
      );
    case "in_transit":
      return and(
        isNotNull(productionTransfers.dispatchedAt),
        isNull(productionTransfers.receivedAt),
        isNull(productionTransfers.lostAt)
      );
    case "received":
      return and(
        isNotNull(productionTransfers.receivedAt),
        isNull(productionTransfers.lostAt)
      );
    case "lost":
      return and(
        isNotNull(productionTransfers.lostAt),
        isNull(productionTransfers.receivedAt)
      );
  }
}

// ============================================================================
// Constants and validation
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /** Clamped, not rejected: `?pageSize=100000` is answered with 100 rows. */
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  orderId: z.string().uuid().optional(),
  fromVendorId: z.string().uuid().optional(),
  toVendorId: z.string().uuid().optional(),
  state: z.enum(TRANSFER_STATES).optional(),
});

const declareLostSchema = z.object({
  /**
   * Free text, because "what the carrier finally said" has no vocabulary.
   * Capped at the audit table's own string limit: the note is copied into an
   * `admin_audit_log` row that lives for 400 days, and a value this side of
   * that cap is stored whole rather than truncated with an ellipsis.
   */
  lostNote: z.string().trim().max(2000).nullish(),
});

// ============================================================================
// Route handler
// ============================================================================

const adminTransfersApp = new Hono<{ Variables: AuthVariables }>();

// requireAdmin, NOT requireContentManager, and nothing here is reachable from
// the vendor tree. Declaring a parcel lost decides who eats a cost.
adminTransfersApp.use("*", requireAuth, requireAdmin);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
}

/**
 * A refusal with the status it should be answered with.
 *
 * Thrown from inside the transaction so the refusal and the rollback are one
 * act; the audit row for it is written OUTSIDE, in the catch — see the note at
 * the call site.
 */
class TransferRefused extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422
  ) {
    super(message);
    this.name = "TransferRefused";
  }
}

const fromVendor = alias(vendors, "from_vendor");
const toVendor = alias(vendors, "to_vendor");

// ============================================================================
// GET /api/admin/transfers
// ============================================================================

adminTransfersApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { page, pageSize, orderId, fromVendorId, toVendorId, state } =
    c.req.valid("query");
  const offset = (page - 1) * pageSize;

  try {
    const conditions = [];
    if (orderId) conditions.push(eq(productionTransfers.orderId, orderId));
    if (fromVendorId)
      conditions.push(eq(productionTransfers.fromVendorId, fromVendorId));
    if (toVendorId)
      conditions.push(eq(productionTransfers.toVendorId, toVendorId));
    if (state) conditions.push(stateCondition(state));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(productionTransfers)
      .where(where);
    const total = Number(totalRows[0]?.value ?? 0);

    // Both vendor names, aliased twice over one table. The admin is the only
    // reader who sees both ends of a leg.
    const rows = await db
      .select({
        id: productionTransfers.id,
        orderId: productionTransfers.orderId,
        fromVendorId: productionTransfers.fromVendorId,
        fromVendorName: fromVendor.name,
        toVendorId: productionTransfers.toVendorId,
        toVendorName: toVendor.name,
        carrier: productionTransfers.carrier,
        reference: productionTransfers.reference,
        pieceCount: productionTransfers.pieceCount,
        costAmount: productionTransfers.costAmount,
        dispatchedAt: productionTransfers.dispatchedAt,
        expectedBy: productionTransfers.expectedBy,
        receivedAt: productionTransfers.receivedAt,
        lostAt: productionTransfers.lostAt,
        lostNote: productionTransfers.lostNote,
        createdAt: productionTransfers.createdAt,
        updatedAt: productionTransfers.updatedAt,
      })
      .from(productionTransfers)
      .leftJoin(fromVendor, eq(productionTransfers.fromVendorId, fromVendor.id))
      .leftJoin(toVendor, eq(productionTransfers.toVendorId, toVendor.id))
      .where(where)
      .orderBy(desc(productionTransfers.createdAt))
      .limit(pageSize)
      .offset(offset);

    // One extra query for the whole page rather than one per row.
    const transferIds = rows.map((row) => row.id);
    const links =
      transferIds.length > 0
        ? await db
            .select({
              transferId: productionTransferJobs.transferId,
              jobId: productionTransferJobs.jobId,
            })
            .from(productionTransferJobs)
            .where(inArray(productionTransferJobs.transferId, transferIds))
        : [];

    const jobsByTransfer = new Map<string, string[]>();
    for (const link of links) {
      const list = jobsByTransfer.get(link.transferId);
      if (list) list.push(link.jobId);
      else jobsByTransfer.set(link.transferId, [link.jobId]);
    }

    return c.json({
      items: rows.map((row) => ({
        ...row,
        state: transferState(row),
        jobIds: jobsByTransfer.get(row.id) ?? [],
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return c.json(failed("list transfers", error), 500);
  }
});

// ============================================================================
// POST /api/admin/transfers/:id/lost
// ============================================================================

adminTransfersApp.post(
  "/:id/lost",
  zValidator("param", idParamSchema),
  zValidator("json", declareLostSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { lostNote } = c.req.valid("json");
    const user = c.get("user");

    try {
      const result = await db.transaction(async (tx) => {
        // FOR UPDATE: two admins declaring the same parcel lost must serialise
        // here rather than both read "not yet lost" and both create a set of
        // replacement jobs somebody will have to pay for.
        const [transfer] = await tx
          .select({
            id: productionTransfers.id,
            orderId: productionTransfers.orderId,
            fromVendorId: productionTransfers.fromVendorId,
            toVendorId: productionTransfers.toVendorId,
            reference: productionTransfers.reference,
            carrier: productionTransfers.carrier,
            pieceCount: productionTransfers.pieceCount,
            costAmount: productionTransfers.costAmount,
            dispatchedAt: productionTransfers.dispatchedAt,
            expectedBy: productionTransfers.expectedBy,
            receivedAt: productionTransfers.receivedAt,
            lostAt: productionTransfers.lostAt,
            lostNote: productionTransfers.lostNote,
          })
          .from(productionTransfers)
          .where(eq(productionTransfers.id, id))
          .limit(1)
          .for("update");

        if (!transfer) throw new TransferRefused("Transfer not found", 404);

        if (transfer.receivedAt) {
          // It arrived. Whatever is being disputed, it is not the parcel.
          throw new TransferRefused(
            `This transfer was received on ${transfer.receivedAt.toISOString()} and cannot be declared lost`,
            409
          );
        }

        if (transfer.lostAt) {
          throw new TransferRefused(
            `This transfer was already declared lost on ${transfer.lostAt.toISOString()}`,
            409
          );
        }

        const lostAt = new Date();

        // The predicate is repeated here rather than trusted from the read,
        // and the row count below turns a race into a rollback rather than a
        // second set of replacement jobs.
        const claimed = await tx
          .update(productionTransfers)
          .set({ lostAt, lostNote: lostNote ?? null })
          .where(
            and(
              eq(productionTransfers.id, id),
              isNull(productionTransfers.receivedAt),
              isNull(productionTransfers.lostAt)
            )
          )
          .returning({ id: productionTransfers.id });

        if (claimed.length !== 1) {
          throw new TransferRefused(
            "This transfer was received or declared lost by someone else; nothing was recorded",
            409
          );
        }

        const jobs = await tx
          .select({
            id: productionJobs.id,
            orderId: productionJobs.orderId,
            stage: productionJobs.stage,
            vendorId: productionJobs.vendorId,
            status: productionJobs.status,
          })
          .from(productionTransferJobs)
          .innerJoin(
            productionJobs,
            eq(productionTransferJobs.jobId, productionJobs.id)
          )
          .where(eq(productionTransferJobs.transferId, id))
          .for("update");

        // No CHECK constraint can say this — it reads other rows, and a
        // trigger doing that under READ COMMITTED is a race dressed as
        // enforcement. Refused rather than repaired: a replacement for work
        // that was never vendor A's would be routed against the wrong leg.
        const foreign = jobs.filter(
          (job) => job.vendorId !== transfer.fromVendorId
        );
        if (foreign.length > 0) {
          throw new TransferRefused(
            `These jobs are not the sending vendor's and cannot be replaced through this transfer: ${foreign
              .map((job) => job.id)
              .join(", ")}`,
            422
          );
        }

        const lostJobIds = jobs.map((job) => job.id);

        if (lostJobIds.length === 0) {
          // A parcel with nothing on it is still a parcel that vanished. The
          // stamp stands; there is simply no work to remake.
          await recordLost(
            c,
            tx,
            transfer,
            { lostAt, lostNote: lostNote ?? null },
            [],
            []
          );
          return {
            transfer: { ...transfer, lostAt, lostNote: lostNote ?? null },
            replacements: [],
          };
        }

        const items = await tx
          .select({
            jobId: productionJobItems.jobId,
            orderItemId: productionJobItems.orderItemId,
          })
          .from(productionJobItems)
          .where(inArray(productionJobItems.jobId, lostJobIds));

        // Unassigned, unpriced, and NOT carrying the original's due date: the
        // replacement is priced when it is assigned, against the rate card
        // live at that instant.
        const created = await tx
          .insert(productionJobs)
          .values(
            jobs.map((job) => ({
              orderId: job.orderId,
              stage: job.stage,
              status: "draft" as const,
              replacesJobId: job.id,
              createdBy: user.id,
            }))
          )
          .returning({
            id: productionJobs.id,
            replacesJobId: productionJobs.replacesJobId,
            stage: productionJobs.stage,
            status: productionJobs.status,
          });

        if (created.length !== jobs.length) {
          throw new Error(
            `Expected ${jobs.length} replacement job(s) but the insert returned ${created.length}; nothing was recorded`
          );
        }

        const replacementFor = new Map(
          created.map((row) => [row.replacesJobId, row])
        );

        // The same order items, under the new job id. The original's rows stay
        // exactly where they are — they are the record of what its intact
        // payable was for.
        const itemRows = items.map((item) => {
          const replacement = replacementFor.get(item.jobId);
          if (!replacement) {
            throw new Error(
              `No replacement job was created for ${item.jobId}; nothing was recorded`
            );
          }
          return { jobId: replacement.id, orderItemId: item.orderItemId };
        });

        if (itemRows.length > 0) {
          await tx.insert(productionJobItems).values(itemRows);
        }

        await recordLost(
          c,
          tx,
          transfer,
          { lostAt, lostNote: lostNote ?? null },
          lostJobIds,
          created.map((row) => row.id)
        );

        return {
          transfer: { ...transfer, lostAt, lostNote: lostNote ?? null },
          replacements: created.map((row) => ({
            id: row.id,
            replacesJobId: row.replacesJobId,
            stage: row.stage,
            status: row.status,
            orderItemIds: itemRows
              .filter((item) => item.jobId === row.id)
              .map((item) => item.orderItemId),
          })),
        };
      });

      return c.json({
        message: "Transfer declared lost",
        transfer: {
          ...result.transfer,
          state: transferState(result.transfer),
        },
        replacements: result.replacements,
      });
    } catch (error) {
      if (error instanceof TransferRefused) {
        // NO `tx` — and the transaction is already rolled back by the time we
        // get here. A refusal row records that a transaction was rolled back;
        // writing it inside that transaction rolls the row back too and erases
        // the evidence it exists to preserve. See `lib/audit.ts`.
        await recordAudit(c, {
          action: "production_transfer.declared_lost",
          entityType: "production_transfer",
          entityId: id,
          outcome: "failure",
          summary: `Refused to declare transfer lost: ${error.message}`,
          metadata: { status: error.status },
        });

        return c.json({ error: error.message }, error.status);
      }

      // Anything else — including an audit write that aborted the transaction
      // and was rethrown at us — is a 500 over a transaction Postgres has
      // already rolled back. Never a 200.
      return c.json(failed("declare transfer lost", error), 500);
    }
  }
);

/**
 * The success row, sharing the caller's transaction.
 *
 * It asserts something the transaction has to make true — "this transfer is
 * lost and these replacement jobs exist" — so a row of it beside a transfer
 * that rolled back would be a lie. `recordAudit` rethrows when it is handed a
 * `tx`, and that throw is deliberately not caught here: a failed insert has
 * already aborted the transaction, so returning normally would let drizzle
 * issue a COMMIT that Postgres executes as a ROLLBACK, and answer 200 over a
 * write that never landed.
 */
async function recordLost(
  c: Parameters<typeof recordAudit>[0],
  tx: Parameters<typeof recordAudit>[2],
  transfer: {
    id: string;
    orderId: string;
    fromVendorId: string;
    toVendorId: string;
    reference: string | null;
  },
  after: { lostAt: Date; lostNote: string | null },
  lostJobIds: string[],
  replacementJobIds: string[]
): Promise<void> {
  await recordAudit(
    c,
    {
      action: "production_transfer.declared_lost",
      entityType: "production_transfer",
      entityId: transfer.id,
      summary:
        `Transfer ${transfer.reference ?? transfer.id} declared lost; ` +
        `${replacementJobIds.length} replacement job(s) created`,
      before: { lostAt: null, lostNote: null },
      after,
      // Both job id sets: what was lost, and what now stands in for it. A
      // reader chasing "why are there two jobs for this order item" has to be
      // able to answer it from the trail alone.
      metadata: {
        orderId: transfer.orderId,
        fromVendorId: transfer.fromVendorId,
        toVendorId: transfer.toVendorId,
        lostJobIds,
        replacementJobIds,
      },
    },
    tx
  );
}

export { adminTransfersApp };
export default adminTransfersApp;
