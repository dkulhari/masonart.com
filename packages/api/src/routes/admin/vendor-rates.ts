/**
 * Admin Vendor Rate Card Routes
 *
 * - GET   /api/admin/vendors/:id/rates                  the card as of an instant
 * - POST  /api/admin/vendors/:id/rates                  add or re-price a band
 * - PATCH /api/admin/vendors/:id/rates/:rateId          correct a band
 * - POST  /api/admin/vendors/:id/rates/:rateId/close    end a band
 *
 * A SEPARATE Hono app from `routes/admin/vendors.ts`, mounted on the same
 * `/api/admin/vendors` prefix — Hono merges routes additively across
 * `app.route()` calls, so the two files compose into one API surface while
 * staying independently editable. The split is not cosmetic: vendors.ts is
 * ordinary CRUD, and everything below has rules.
 *
 * Four of them, and none of the arithmetic behind them lives here:
 *
 * 1. **Overlap is 422, and the response names the row.** The payload is
 *    well-formed; it is the existing card that disagrees with it. The
 *    conflicting row comes back in `conflict` — its id, its size range, its
 *    amount, its window — because a bare 400 sends the admin hunting through a
 *    card for whichever band they collided with. The check itself is
 *    `lib/vendor-rates.findOverlappingBand`, tested as a pure function so this
 *    route never restates the band or window comparison.
 *
 * 2. **A scheduled future rate is never clobbered.** `wallet-config.ts` ends
 *    every open row for its key on write; `shipping-config.ts` deliberately
 *    departed from that because it silently deleted values an admin had
 *    scheduled. This follows shipping-config: only the row actually in force at
 *    the new rate's start is closed, later rows survive, and they come back in
 *    `warnings` — together with an `effectiveTo` on the new row that stops it
 *    where the surviving one begins, so the card never has two answers for one
 *    instant.
 *
 * 3. **A re-price of the SAME band supersedes; anything else is a conflict.**
 *    Posting `0-24 print` again with a later `effectiveFrom` is how a price
 *    change is recorded, so it closes the incumbent. Posting `12-36` over a
 *    `0-24` is not a re-price — it would leave part of the old band silently
 *    repriced and part not — so it is refused with the conflict. Superseding is
 *    therefore keyed on an exact (kind, finish, min, max) match, never on mere
 *    intersection.
 *
 * 4. **Closing sets `effectiveTo`. Nothing here deletes a rate.** A production
 *    job records the amount that was live when it was assigned; delete the row
 *    that produced it and the amount becomes unexplainable. There is
 *    deliberately no DELETE route in this file.
 *
 * Role gating matches vendors.ts: `requireAdmin`, not `requireContentManager`.
 * A rate card is what we buy at — finance data wearing a catalogue shape.
 *
 * Money is `decimal(10,2)` INR. The payload carries rupees as a string or a
 * number and is normalised to a two-decimal string here; it is never paise.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";

import { db } from "../../database";
import { diffRecords, recordAudit } from "../../lib/audit";
import {
  vendors,
  vendorRates,
  vendorCapabilityKindEnum,
} from "../../database/schema/vendors";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  findOverlappingBand,
  longestEdgeInches,
  selectRateInForce,
  type RateRow,
} from "../../lib/vendor-rates";

// ============================================================================
// Constants
// ============================================================================

/** decimal(10,2) tops out here. Caught in validation rather than as a 500. */
const MAX_RATE_AMOUNT = 99_999_999.99;

// ============================================================================
// Validation
// ============================================================================

/**
 * Rupees. A string ("450", "450.50") or a number (450), normalised to the
 * two-decimal string drizzle wants for `decimal(10,2)`.
 *
 * Three decimals is rejected rather than rounded: `450.555` is either a paise
 * figure that wandered in or a typo, and quietly turning it into `450.56`
 * makes a vendor's card disagree with what the admin typed. 0 is allowed — a
 * band a vendor does not charge for is a real arrangement.
 */
const rupeeAmountSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "amount must be rupees, e.g. 450 or 450.50"),
    z.number(),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)))
  .refine((n) => Number.isFinite(n), "amount must be a number")
  .refine((n) => n >= 0, "amount must not be negative")
  .refine((n) => n <= MAX_RATE_AMOUNT, "amount is too large")
  .refine(
    (n) => Math.round(n * 100) / 100 === n,
    "amount must have at most two decimal places (rupees, not paise)"
  )
  .transform((n) => n.toFixed(2));

const idParamSchema = z.object({ id: z.string().uuid() });
const rateParamSchema = idParamSchema.extend({ rateId: z.string().uuid() });

/** `?includeExpired=true`. `z.coerce.boolean()` would read "false" as true. */
const boolQuery = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const listQuerySchema = z
  .object({
    /** Omit for now. This is what the assignment screen passes. */
    at: z.coerce.date().optional(),
    /** History as well as the live card — a closed rate explains an old job. */
    includeExpired: boolQuery,
    kind: z.enum(vendorCapabilityKindEnum.enumValues).optional(),
    finish: z.string().trim().max(60).optional(),
    longestEdge: z.coerce.number().nonnegative().optional(),
    widthInches: z.coerce.number().positive().optional(),
    heightInches: z.coerce.number().positive().optional(),
  })
  .refine(
    (q) =>
      q.kind !== undefined ||
      (q.longestEdge === undefined &&
        (q.widthInches === undefined || q.heightInches === undefined)),
    {
      message: "kind is required when resolving a rate for a size",
      path: ["kind"],
    }
  );

const rateBodyShape = {
  kind: z.enum(vendorCapabilityKindEnum.enumValues),
  /** null means "any finish" — the band applies whatever the paper is. */
  finish: z.string().trim().min(1).max(60).nullish(),
  longestEdgeMinInches: z.coerce.number().int().min(0),
  longestEdgeMaxInches: z.coerce.number().int().positive(),
  amount: rupeeAmountSchema,
  /** Omit for "now". A future date schedules the change. */
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullish(),
};

const createRateSchema = z
  .object(rateBodyShape)
  .refine((v) => v.longestEdgeMinInches < v.longestEdgeMaxInches, {
    message:
      "longestEdgeMinInches must be below longestEdgeMaxInches (bands are inclusive-min, exclusive-max)",
    path: ["longestEdgeMaxInches"],
  })
  .refine(
    (v) =>
      !v.effectiveTo ||
      v.effectiveTo.getTime() > (v.effectiveFrom ?? new Date()).getTime(),
    { message: "effectiveTo must be after effectiveFrom", path: ["effectiveTo"] }
  );

const updateRateSchema = z
  .object(rateBodyShape)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

const closeRateSchema = z
  .object({ effectiveTo: z.coerce.date().optional() })
  .optional()
  .default({});

// ============================================================================
// Route Handler
// ============================================================================

const adminVendorRatesApp = new Hono<{ Variables: AuthVariables }>();

// requireAdmin, NOT requireContentManager — a rate card is finance data.
adminVendorRatesApp.use("*", requireAuth, requireAdmin);

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

/** Every band the vendor has ever had, newest window last. */
async function allRatesFor(vendorId: string) {
  return db
    .select()
    .from(vendorRates)
    .where(eq(vendorRates.vendorId, vendorId))
    .orderBy(
      asc(vendorRates.kind),
      asc(vendorRates.longestEdgeMinInches),
      asc(vendorRates.effectiveFrom)
    );
}

/**
 * A database row as the pure helpers want it. `amount` stays a string and the
 * timestamps stay Dates — the helpers are written against exactly that shape.
 */
function toRateRow(row: {
  id: string;
  vendorId: string;
  kind: "print" | "frame";
  finish: string | null;
  longestEdgeMinInches: number;
  longestEdgeMaxInches: number;
  amount: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}): RateRow {
  return {
    id: row.id,
    vendorId: row.vendorId,
    kind: row.kind,
    finish: row.finish,
    longestEdgeMinInches: row.longestEdgeMinInches,
    longestEdgeMaxInches: row.longestEdgeMaxInches,
    amount: row.amount,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

/** The 422 body. The point of the ticket: say WHICH band, not just "overlap". */
function conflictResponse(candidate: RateRow, conflict: RateRow) {
  return {
    error:
      `This ${candidate.kind} band ${candidate.longestEdgeMinInches}-${candidate.longestEdgeMaxInches} in ` +
      `overlaps an existing ${conflict.kind} band ${conflict.longestEdgeMinInches}-${conflict.longestEdgeMaxInches} in ` +
      `(rate ${conflict.id}) effective from ${conflict.effectiveFrom.toISOString()}` +
      `${conflict.effectiveTo ? ` until ${conflict.effectiveTo.toISOString()}` : ""}. ` +
      "A band may repeat at a later date — that is how a price change is recorded — but not while another is in force.",
    conflict: {
      id: conflict.id,
      kind: conflict.kind,
      finish: conflict.finish,
      longestEdgeMinInches: conflict.longestEdgeMinInches,
      longestEdgeMaxInches: conflict.longestEdgeMaxInches,
      amount: conflict.amount,
      effectiveFrom: conflict.effectiveFrom,
      effectiveTo: conflict.effectiveTo,
    },
  } as const;
}

/** Same (kind, finish, min, max): a re-price of this band, not a new one. */
function isSameBand(a: RateRow, b: RateRow): boolean {
  return (
    a.kind === b.kind &&
    (a.finish ?? null) === (b.finish ?? null) &&
    a.longestEdgeMinInches === b.longestEdgeMinInches &&
    a.longestEdgeMaxInches === b.longestEdgeMaxInches
  );
}

// ============================================================================
// GET /api/admin/vendors/:id/rates
// ============================================================================

adminVendorRatesApp.get(
  "/:id/rates",
  zValidator("param", idParamSchema),
  zValidator("query", listQuerySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    const at = query.at ?? new Date();

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      // The window predicate is the same shape routes/admin/vendors.ts uses
      // for the detail view, and the same one shipping-config resolves with:
      // started at or before `at`, not yet ended at `at`.
      const where = query.includeExpired
        ? eq(vendorRates.vendorId, id)
        : and(
            eq(vendorRates.vendorId, id),
            lte(vendorRates.effectiveFrom, at),
            or(isNull(vendorRates.effectiveTo), gt(vendorRates.effectiveTo, at))
          );

      const rates = await db
        .select()
        .from(vendorRates)
        .where(where)
        .orderBy(
          asc(vendorRates.kind),
          asc(vendorRates.longestEdgeMinInches),
          asc(vendorRates.effectiveFrom)
        );

      // "What would this item cost at this instant?" — one row or null. Null
      // is a real answer (this vendor has not priced that size) and the
      // assignment screen must show it rather than defaulting to zero.
      const edge =
        query.longestEdge ??
        (query.widthInches !== undefined && query.heightInches !== undefined
          ? longestEdgeInches({
              widthInches: query.widthInches,
              heightInches: query.heightInches,
            })
          : undefined);

      const resolved =
        edge !== undefined && query.kind
          ? selectRateInForce(rates.map(toRateRow), {
              longestEdge: edge,
              kind: query.kind,
              finish: query.finish ?? null,
              at,
            })
          : null;

      return c.json({
        at: at.toISOString(),
        includeExpired: query.includeExpired,
        rates,
        resolved,
      });
    } catch (error) {
      return c.json(failed("list vendor rates", error), 500);
    }
  }
);

/**
 * The band fields a `vendor_rate.updated` delta reports on. `updatedAt` is
 * excluded deliberately: it moves on every write and would make a no-op patch
 * look like a repricing.
 */
const AUDITED_RATE_KEYS = [
  "kind",
  "finish",
  "longestEdgeMinInches",
  "longestEdgeMaxInches",
  "amount",
  "effectiveFrom",
  "effectiveTo",
] as const;

// ============================================================================
// POST /api/admin/vendors/:id/rates
// ============================================================================

adminVendorRatesApp.post(
  "/:id/rates",
  zValidator("param", idParamSchema),
  zValidator("json", createRateSchema),
  async (c) => {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const startsAt = body.effectiveFrom ?? new Date();

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const existing = (await allRatesFor(id)).map(toRateRow);

      const candidate: RateRow = {
        // Never collides with a real uuid, so findOverlappingBand's id
        // comparison cannot accidentally excuse a genuine conflict.
        id: "candidate",
        vendorId: id,
        kind: body.kind,
        finish: body.finish ?? null,
        longestEdgeMinInches: body.longestEdgeMinInches,
        longestEdgeMaxInches: body.longestEdgeMaxInches,
        amount: body.amount,
        effectiveFrom: startsAt,
        effectiveTo: body.effectiveTo ?? null,
      };

      const sameBand = existing.filter((r) => isSameBand(r, candidate));

      // The incumbent for THIS band at THIS instant, found with the same
      // function the assignment screen resolves prices with.
      const incumbent = selectRateInForce(sameBand, {
        longestEdge: candidate.longestEdgeMinInches,
        kind: candidate.kind,
        finish: candidate.finish,
        at: startsAt,
      });

      // Rows for this band that start later. They are NOT deleted — an admin
      // who scheduled a rise meant it — but they cap the new row, and the
      // response says so.
      const pending = sameBand
        .filter((r) => r.effectiveFrom.getTime() > startsAt.getTime())
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());

      const nextStart = pending[0]?.effectiveFrom ?? null;
      if (
        nextStart &&
        (!candidate.effectiveTo || candidate.effectiveTo > nextStart)
      ) {
        candidate.effectiveTo = nextStart;
      }

      // Check against the card as it WILL be: the incumbent closed at the new
      // rate's start. Modelled, not excluded, so the arithmetic that decides
      // whether that closure actually removes the collision stays in the
      // helper rather than being asserted here.
      const projected = existing.map((r) =>
        incumbent && r.id === incumbent.id ? { ...r, effectiveTo: startsAt } : r
      );

      const conflict = findOverlappingBand(projected, candidate);
      if (conflict) return c.json(conflictResponse(candidate, conflict), 422);

      if (incumbent) {
        await db
          .update(vendorRates)
          .set({ effectiveTo: startsAt, updatedAt: new Date() })
          .where(
            and(eq(vendorRates.id, incumbent.id), eq(vendorRates.vendorId, id))
          );
      }

      const [rate] = await db
        .insert(vendorRates)
        .values({
          vendorId: id,
          kind: candidate.kind,
          finish: candidate.finish,
          longestEdgeMinInches: candidate.longestEdgeMinInches,
          longestEdgeMaxInches: candidate.longestEdgeMaxInches,
          amount: candidate.amount,
          effectiveFrom: startsAt,
          effectiveTo: candidate.effectiveTo,
          createdBy: user.id,
        })
        .returning();

      const warnings = pending.map(
        (row) =>
          `A rate of ₹${row.amount} for this band is already scheduled from ${row.effectiveFrom.toISOString()}. ` +
          "It has been left in place, so this new rate expires then."
      );

      /**
       * Filed as `vendor_rate.updated` rather than a `.created` of its own: the
       * audited thing is the CARD, and a new band for an already-priced band is
       * a price change — the incumbent was closed in the same breath. The
       * supersession is the delta, because a row showing only the new amount
       * cannot answer "by how much did we just agree to pay more".
       */
      await recordAudit(c, {
        action: "vendor_rate.updated",
        entityType: "vendor_rate",
        entityId: rate!.id,
        summary: incumbent
          ? `Repriced the ${candidate.kind} band ${candidate.longestEdgeMinInches}–${candidate.longestEdgeMaxInches}" ` +
            `from ₹${incumbent.amount} to ₹${candidate.amount}`
          : `Priced the ${candidate.kind} band ${candidate.longestEdgeMinInches}–${candidate.longestEdgeMaxInches}" at ₹${candidate.amount}`,
        before: incumbent
          ? {
              rateId: incumbent.id,
              amount: incumbent.amount,
              effectiveFrom: incumbent.effectiveFrom,
              effectiveTo: incumbent.effectiveTo,
            }
          : null,
        after: {
          amount: candidate.amount,
          kind: candidate.kind,
          finish: candidate.finish,
          longestEdgeMinInches: candidate.longestEdgeMinInches,
          longestEdgeMaxInches: candidate.longestEdgeMaxInches,
          effectiveFrom: startsAt,
          effectiveTo: candidate.effectiveTo,
        },
        metadata: {
          // NOT `vendorId`: `recordAudit` reserves that key for the shop a
          // VENDOR request was written for, and an admin acts for nobody.
          ratedVendorId: id,
          supersededRateId: incumbent?.id ?? null,
        },
      });

      return c.json(
        {
          message: "Rate created",
          rate,
          /** The row this one replaced, closed rather than deleted. */
          superseded: incumbent
            ? { id: incumbent.id, amount: incumbent.amount, effectiveTo: startsAt }
            : null,
          warnings,
        },
        201
      );
    } catch (error) {
      return c.json(failed("create vendor rate", error), 500);
    }
  }
);

// ============================================================================
// PATCH /api/admin/vendors/:id/rates/:rateId
// ============================================================================

adminVendorRatesApp.patch(
  "/:id/rates/:rateId",
  zValidator("param", rateParamSchema),
  zValidator("json", updateRateSchema),
  async (c) => {
    const { id, rateId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const existing = (await allRatesFor(id)).map(toRateRow);
      const target = existing.find((r) => r.id === rateId);
      if (!target) return c.json({ error: "Rate not found" }, 404);

      const candidate: RateRow = {
        ...target,
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.finish !== undefined ? { finish: body.finish ?? null } : {}),
        ...(body.longestEdgeMinInches !== undefined
          ? { longestEdgeMinInches: body.longestEdgeMinInches }
          : {}),
        ...(body.longestEdgeMaxInches !== undefined
          ? { longestEdgeMaxInches: body.longestEdgeMaxInches }
          : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.effectiveFrom !== undefined
          ? { effectiveFrom: body.effectiveFrom }
          : {}),
        ...(body.effectiveTo !== undefined
          ? { effectiveTo: body.effectiveTo ?? null }
          : {}),
      };

      // Checked on the MERGED row: a patch that moves only one edge can still
      // invert the band.
      if (candidate.longestEdgeMinInches >= candidate.longestEdgeMaxInches) {
        return c.json(
          {
            error:
              "longestEdgeMinInches must be below longestEdgeMaxInches (bands are inclusive-min, exclusive-max)",
          },
          400
        );
      }

      if (
        candidate.effectiveTo &&
        candidate.effectiveTo.getTime() <= candidate.effectiveFrom.getTime()
      ) {
        return c.json({ error: "effectiveTo must be after effectiveFrom" }, 400);
      }

      // findOverlappingBand skips the row with the same id, so an edit is not
      // reported as colliding with itself.
      const conflict = findOverlappingBand(existing, candidate);
      if (conflict) return c.json(conflictResponse(candidate, conflict), 422);

      const [rate] = await db
        .update(vendorRates)
        .set({
          kind: candidate.kind,
          finish: candidate.finish,
          longestEdgeMinInches: candidate.longestEdgeMinInches,
          longestEdgeMaxInches: candidate.longestEdgeMaxInches,
          amount: candidate.amount,
          effectiveFrom: candidate.effectiveFrom,
          effectiveTo: candidate.effectiveTo,
          updatedAt: new Date(),
        })
        .where(and(eq(vendorRates.id, rateId), eq(vendorRates.vendorId, id)))
        .returning();

      if (!rate) return c.json({ error: "Rate not found" }, 404);

      // `target` is the band as it stood, read above for the overlap check;
      // reusing it costs nothing and gives the delta a real before.
      const delta = diffRecords(
        target as unknown as Record<string, unknown>,
        candidate as unknown as Record<string, unknown>,
        AUDITED_RATE_KEYS
      );

      await recordAudit(c, {
        action: "vendor_rate.updated",
        entityType: "vendor_rate",
        entityId: rate.id,
        summary: `Edited the ${candidate.kind} rate band (${Object.keys(delta.after ?? {}).join(", ") || "no change"})`,
        before: delta.before,
        after: delta.after,
        metadata: {
          // NOT `vendorId`: `recordAudit` reserves that key for the shop a
          // VENDOR request was written for, and an admin acts for nobody.
          ratedVendorId: id,
        },
      });

      return c.json({ message: "Rate updated", rate });
    } catch (error) {
      return c.json(failed("update vendor rate", error), 500);
    }
  }
);

// ============================================================================
// POST /api/admin/vendors/:id/rates/:rateId/close
//
// There is no DELETE counterpart, and that is the point: a production job
// records the amount that was live when it was assigned.
// ============================================================================

adminVendorRatesApp.post(
  "/:id/rates/:rateId/close",
  zValidator("param", rateParamSchema),
  zValidator("json", closeRateSchema),
  async (c) => {
    const { id, rateId } = c.req.valid("param");
    const body = c.req.valid("json");
    const endsAt = body?.effectiveTo ?? new Date();

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const existing = (await allRatesFor(id)).map(toRateRow);
      const target = existing.find((r) => r.id === rateId);
      if (!target) return c.json({ error: "Rate not found" }, 404);

      // A negative-length window would make the row unresolvable and would
      // read, later, as data corruption rather than as an edit.
      if (endsAt.getTime() < target.effectiveFrom.getTime()) {
        return c.json(
          {
            error: `Cannot close a rate before it starts: this band is effective from ${target.effectiveFrom.toISOString()}.`,
            rate: {
              id: target.id,
              effectiveFrom: target.effectiveFrom,
              effectiveTo: target.effectiveTo,
            },
          },
          422
        );
      }

      const [rate] = await db
        .update(vendorRates)
        .set({ effectiveTo: endsAt, updatedAt: new Date() })
        .where(and(eq(vendorRates.id, rateId), eq(vendorRates.vendorId, id)))
        .returning();

      if (!rate) return c.json({ error: "Rate not found" }, 404);

      // Closing is the only way a band ever ends — there is no DELETE — so this
      // is the row that explains why a job assigned tomorrow prices differently
      // from one assigned today.
      await recordAudit(c, {
        action: "vendor_rate.updated",
        entityType: "vendor_rate",
        entityId: rate.id,
        summary:
          `Closed the ${target.kind} band ${target.longestEdgeMinInches}–${target.longestEdgeMaxInches}" ` +
          `(₹${target.amount}) with effect from ${endsAt.toISOString()}`,
        before: { effectiveTo: target.effectiveTo },
        after: { effectiveTo: endsAt },
        metadata: {
          // NOT `vendorId`: `recordAudit` reserves that key for the shop a
          // VENDOR request was written for, and an admin acts for nobody.
          ratedVendorId: id,
        },
      });

      return c.json({ message: "Rate closed", rate });
    } catch (error) {
      return c.json(failed("close vendor rate", error), 500);
    }
  }
);

export { adminVendorRatesApp };
export default adminVendorRatesApp;
