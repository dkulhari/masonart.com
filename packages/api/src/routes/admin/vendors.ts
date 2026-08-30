/**
 * Admin Vendor Directory Routes
 *
 * - GET    /api/admin/vendors                        paginated, filterable list
 * - POST   /api/admin/vendors                        create
 * - GET    /api/admin/vendors/:id                    vendor + contacts + capabilities + live rates
 * - PATCH  /api/admin/vendors/:id                    update
 * - GET|POST     /api/admin/vendors/:id/contacts
 * - PATCH|DELETE /api/admin/vendors/:id/contacts/:contactId
 * - GET|POST     /api/admin/vendors/:id/capabilities
 * - PATCH|DELETE /api/admin/vendors/:id/capabilities/:capId
 *
 * File shape follows `routes/admin/shipping-config.ts` — `new Hono<{ Variables:
 * AuthVariables }>()`, zod schemas at the top, one `use('*')` gate. Four
 * departures from the surrounding admin routers, all deliberate:
 *
 * 1. **`requireAdmin`, not `requireContentManager`.** Every other catalogue
 *    router in this directory lets a content-manager in. This one must not: the
 *    list carries `amountOwed`, which is what we owe a supplier, and the detail
 *    view carries the rate card we buy at. That is finance data wearing a
 *    catalogue shape. `tests/routes/admin/vendors.test.ts` asserts a
 *    content-manager gets 403 on every route in this file.
 *
 * 2. **The list is paginated from day one.** `routes/admin/collections.ts` and
 *    `routes/admin/frames.ts` return every row with no LIMIT. That is a known
 *    defect, not a house style, and it is not repeated here: `pageSize`
 *    defaults to 20 and is capped at 100, so a request with no query string at
 *    all is still bounded.
 *
 * 3. **`amountOwed` is summed by `lib/vendor-payables.sumPayable`, in JS, not
 *    by a SQL SUM.** A second implementation of the payables derivation is
 *    exactly how a ledger starts disagreeing with itself, and the rounding
 *    rules (paise integers, `COALESCE(actual, expected)`, unsettled only) live
 *    in that module. Only rows with `settlement_id IS NULL` are fetched, so the
 *    set stays bounded by the settlement cycle rather than by all history.
 *    `openJobCount` is a plain COUNT in SQL — a count cannot drift the way a
 *    money total can.
 *
 * 4. **The capability filter runs as its own query, and its result is fed back
 *    in as an id list** rather than as a join or a correlated subquery. A
 *    vendor with two matching capabilities would otherwise appear twice in the
 *    page and corrupt both `total` and the page boundaries. The directory is a
 *    table of tens of rows, so the id list is small; if it ever is not, this is
 *    the line to change.
 *
 * Rates are read here but never written here — `POST/PATCH` on rate bands is
 * ticket #613, because writing one has to run the overlap check in
 * `lib/vendor-rates.findOverlappingBand` first.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  notInArray,
  or,
} from "drizzle-orm";

import { db } from "../../database";
import {
  vendors,
  vendorContacts,
  vendorCapabilities,
  vendorRates,
  vendorStatusEnum,
  vendorCapabilityKindEnum,
} from "../../database/schema/vendors";
import {
  productionJobs,
  type ProductionJobStatus,
} from "../../database/schema/production-jobs";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import {
  sumPayable,
  payableJobsCondition,
  type PayableJob,
} from "../../lib/vendor-payables";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * A job stops being "open" once it has passed QC or been cancelled. Everything
 * else — draft, assigned, sent, received, qc_failed — is still work the admin
 * is carrying. `production_job_status` is a vocabulary, not a state machine
 * (see schema/production-jobs.ts), so this list is a reading of it, not a
 * transition rule.
 */
const CLOSED_JOB_STATUSES: ProductionJobStatus[] = ["qc_passed", "cancelled"];

// ============================================================================
// Validation
// ============================================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  /**
   * Clamped, not merely defaulted: `?pageSize=100000` is answered with 100
   * rows rather than with a 400 or with a table scan.
   */
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_PAGE_SIZE)
    .transform((n) => Math.min(n, MAX_PAGE_SIZE)),
  status: z.enum(vendorStatusEnum.enumValues).optional(),
  kind: z.enum(vendorCapabilityKindEnum.enumValues).optional(),
  /**
   * The assignment question: "who can make something this big?" It is answered
   * against the capability's larger axis, because a 36" print fits a 24x40
   * press turned sideways.
   */
  minLongestEdge: z.coerce.number().int().positive().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const contactParamSchema = idParamSchema.extend({
  contactId: z.string().uuid(),
});
const capabilityParamSchema = idParamSchema.extend({
  capId: z.string().uuid(),
});

const createVendorSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  status: z.enum(vendorStatusEnum.enumValues).optional(),
  addressLine1: z.string().max(300).nullish(),
  addressLine2: z.string().max(300).nullish(),
  city: z.string().max(120).nullish(),
  state: z.string().max(120).nullish(),
  postalCode: z.string().max(20).nullish(),
  country: z.string().max(2).nullish(),
  notes: z.string().max(2000).nullish(),
});

const updateVendorSchema = createVendorSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

const createContactSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  phone: z.string().max(30).nullish(),
  email: z.string().email().max(200).nullish(),
  contactRole: z.string().max(100).nullish(),
  isPrimary: z.boolean().optional(),
});

const updateContactSchema = createContactSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

const createCapabilitySchema = z.object({
  kind: z.enum(vendorCapabilityKindEnum.enumValues),
  maxWidthInches: z.coerce.number().int().positive().nullish(),
  maxHeightInches: z.coerce.number().int().positive().nullish(),
  finishes: z.array(z.string().min(1).max(60)).max(30).nullish(),
  statedTurnaroundDays: z.coerce.number().int().positive().nullish(),
  notes: z.string().max(2000).nullish(),
});

const updateCapabilitySchema = createCapabilitySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

// ============================================================================
// Route Handler
// ============================================================================

const adminVendorsApp = new Hono<{ Variables: AuthVariables }>();

// requireAdmin, NOT requireContentManager — see departure 1 in the header.
adminVendorsApp.use("*", requireAuth, requireAdmin);

function failed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return { error: `Failed to ${action}: ${message}` } as const;
}

/** True when the vendor row exists. Guards every nested write with a 404. */
async function vendorExists(vendorId: string): Promise<boolean> {
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1);

  return rows.length > 0;
}

// ============================================================================
// GET /api/admin/vendors
// ============================================================================

adminVendorsApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { page, pageSize, status, kind, minLongestEdge } = c.req.valid("query");
  const offset = (page - 1) * pageSize;

  try {
    // --- capability prefilter (departure 4) --------------------------------
    let capableVendorIds: string[] | null = null;

    if (kind || minLongestEdge !== undefined) {
      const capabilityConditions = [];
      if (kind) capabilityConditions.push(eq(vendorCapabilities.kind, kind));
      if (minLongestEdge !== undefined) {
        capabilityConditions.push(
          or(
            gte(vendorCapabilities.maxWidthInches, minLongestEdge),
            gte(vendorCapabilities.maxHeightInches, minLongestEdge)
          )
        );
      }

      const matches = await db
        .select({ vendorId: vendorCapabilities.vendorId })
        .from(vendorCapabilities)
        .where(and(...capabilityConditions));

      capableVendorIds = [...new Set(matches.map((m) => m.vendorId))];

      // No candidate at all: answer without touching the vendors table, and
      // without an `IN ()` that Postgres would reject.
      if (capableVendorIds.length === 0) {
        return c.json({ items: [], total: 0, page, pageSize, totalPages: 0 });
      }
    }

    const conditions = [];
    if (status) conditions.push(eq(vendors.status, status));
    if (capableVendorIds) conditions.push(inArray(vendors.id, capableVendorIds));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await db
      .select({ value: count() })
      .from(vendors)
      .where(where);
    const total = Number(totalRows[0]?.value ?? 0);

    const rows = await db
      .select({
        id: vendors.id,
        name: vendors.name,
        status: vendors.status,
        city: vendors.city,
        state: vendors.state,
        country: vendors.country,
        createdAt: vendors.createdAt,
        updatedAt: vendors.updatedAt,
      })
      .from(vendors)
      .where(where)
      .orderBy(asc(vendors.name))
      .limit(pageSize)
      .offset(offset);

    if (rows.length === 0) {
      return c.json({
        items: [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    }

    const pageIds = rows.map((r) => r.id);

    const capabilityRows = await db
      .select({
        vendorId: vendorCapabilities.vendorId,
        kind: vendorCapabilities.kind,
        maxWidthInches: vendorCapabilities.maxWidthInches,
        maxHeightInches: vendorCapabilities.maxHeightInches,
      })
      .from(vendorCapabilities)
      .where(inArray(vendorCapabilities.vendorId, pageIds));

    const openJobRows = await db
      .select({ vendorId: productionJobs.vendorId, value: count() })
      .from(productionJobs)
      .where(
        and(
          inArray(productionJobs.vendorId, pageIds),
          notInArray(productionJobs.status, CLOSED_JOB_STATUSES)
        )
      )
      .groupBy(productionJobs.vendorId);

    // The predicate lib/vendor-payables documents, IMPORTED rather than
    // restated — this query used to claim it was "the same predicate" while
    // spelling out only half of it, so a cancelled job kept inflating
    // `amountOwed` on the vendor list (#695). The sum itself is that module's
    // too, never a SUM() written here.
    const unsettledJobRows = await db
      .select({
        id: productionJobs.id,
        vendorId: productionJobs.vendorId,
        status: productionJobs.status,
        amountExpected: productionJobs.amountExpected,
        amountActual: productionJobs.amountActual,
        settlementId: productionJobs.settlementId,
      })
      .from(productionJobs)
      .where(
        and(inArray(productionJobs.vendorId, pageIds), payableJobsCondition())
      );

    const capabilitiesByVendor = new Map<
      string,
      Array<{
        kind: string;
        maxWidthInches: number | null;
        maxHeightInches: number | null;
      }>
    >();
    for (const cap of capabilityRows) {
      const list = capabilitiesByVendor.get(cap.vendorId) ?? [];
      list.push({
        kind: cap.kind,
        maxWidthInches: cap.maxWidthInches,
        maxHeightInches: cap.maxHeightInches,
      });
      capabilitiesByVendor.set(cap.vendorId, list);
    }

    const openJobCounts = new Map<string, number>();
    for (const row of openJobRows) {
      if (row.vendorId) openJobCounts.set(row.vendorId, Number(row.value));
    }

    const jobsByVendor = new Map<string, PayableJob[]>();
    for (const job of unsettledJobRows) {
      if (!job.vendorId) continue;
      const list = jobsByVendor.get(job.vendorId) ?? [];
      list.push({
        id: job.id,
        status: job.status,
        amountExpected: job.amountExpected,
        amountActual: job.amountActual,
        settlementId: job.settlementId,
      });
      jobsByVendor.set(job.vendorId, list);
    }

    const items = rows.map((row) => ({
      ...row,
      capabilities: capabilitiesByVendor.get(row.id) ?? [],
      openJobCount: openJobCounts.get(row.id) ?? 0,
      /** decimal(10,2) INR as a string, exactly as the payables module formats it. */
      amountOwed: sumPayable(jobsByVendor.get(row.id) ?? []),
    }));

    return c.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    return c.json(failed("list vendors", error), 500);
  }
});

// ============================================================================
// POST /api/admin/vendors
// ============================================================================

adminVendorsApp.post("/", zValidator("json", createVendorSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  try {
    const [vendor] = await db
      .insert(vendors)
      .values({ ...body, createdBy: user.id })
      .returning();

    return c.json({ message: "Vendor created", vendor }, 201);
  } catch (error) {
    return c.json(failed("create vendor", error), 500);
  }
});

// ============================================================================
// GET /api/admin/vendors/:id
// ============================================================================

adminVendorsApp.get("/:id", zValidator("param", idParamSchema), async (c) => {
  const { id } = c.req.valid("param");

  try {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    if (!vendor) return c.json({ error: "Vendor not found" }, 404);

    const contacts = await db
      .select()
      .from(vendorContacts)
      .where(eq(vendorContacts.vendorId, id))
      .orderBy(asc(vendorContacts.name));

    const capabilities = await db
      .select()
      .from(vendorCapabilities)
      .where(eq(vendorCapabilities.vendorId, id))
      .orderBy(asc(vendorCapabilities.kind));

    // The bands in force now, plus anything scheduled — an expired band is
    // history and belongs to #613's rate view, not to the vendor page.
    const now = new Date();
    const rates = await db
      .select()
      .from(vendorRates)
      .where(
        and(
          eq(vendorRates.vendorId, id),
          or(isNull(vendorRates.effectiveTo), gt(vendorRates.effectiveTo, now))
        )
      )
      .orderBy(asc(vendorRates.longestEdgeMinInches));

    return c.json({ vendor, contacts, capabilities, rates });
  } catch (error) {
    return c.json(failed("read vendor", error), 500);
  }
});

// ============================================================================
// PATCH /api/admin/vendors/:id
// ============================================================================

adminVendorsApp.patch(
  "/:id",
  zValidator("param", idParamSchema),
  zValidator("json", updateVendorSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const [vendor] = await db
        .update(vendors)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(vendors.id, id))
        .returning();

      if (!vendor) return c.json({ error: "Vendor not found" }, 404);

      return c.json({ message: "Vendor updated", vendor });
    } catch (error) {
      return c.json(failed("update vendor", error), 500);
    }
  }
);

// ============================================================================
// Contacts
// ============================================================================

adminVendorsApp.get(
  "/:id/contacts",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const contacts = await db
        .select()
        .from(vendorContacts)
        .where(eq(vendorContacts.vendorId, id))
        .orderBy(asc(vendorContacts.name));

      return c.json({ contacts });
    } catch (error) {
      return c.json(failed("list contacts", error), 500);
    }
  }
);

adminVendorsApp.post(
  "/:id/contacts",
  zValidator("param", idParamSchema),
  zValidator("json", createContactSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      // Checked rather than left to the foreign key: a 404 tells the admin the
      // vendor is gone; a raw FK violation tells them nothing.
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const [contact] = await db
        .insert(vendorContacts)
        .values({ ...body, vendorId: id })
        .returning();

      return c.json({ message: "Contact created", contact }, 201);
    } catch (error) {
      return c.json(failed("create contact", error), 500);
    }
  }
);

adminVendorsApp.patch(
  "/:id/contacts/:contactId",
  zValidator("param", contactParamSchema),
  zValidator("json", updateContactSchema),
  async (c) => {
    const { id, contactId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      // Both ids in the WHERE: a contact id from another vendor must 404, not
      // be updated because the path happened to name this vendor.
      const [contact] = await db
        .update(vendorContacts)
        .set({ ...body, updatedAt: new Date() })
        .where(
          and(eq(vendorContacts.id, contactId), eq(vendorContacts.vendorId, id))
        )
        .returning();

      if (!contact) return c.json({ error: "Contact not found" }, 404);

      return c.json({ message: "Contact updated", contact });
    } catch (error) {
      return c.json(failed("update contact", error), 500);
    }
  }
);

adminVendorsApp.delete(
  "/:id/contacts/:contactId",
  zValidator("param", contactParamSchema),
  async (c) => {
    const { id, contactId } = c.req.valid("param");

    try {
      const [contact] = await db
        .delete(vendorContacts)
        .where(
          and(eq(vendorContacts.id, contactId), eq(vendorContacts.vendorId, id))
        )
        .returning();

      if (!contact) return c.json({ error: "Contact not found" }, 404);

      return c.json({ message: "Contact deleted" });
    } catch (error) {
      return c.json(failed("delete contact", error), 500);
    }
  }
);

// ============================================================================
// Capabilities
// ============================================================================

adminVendorsApp.get(
  "/:id/capabilities",
  zValidator("param", idParamSchema),
  async (c) => {
    const { id } = c.req.valid("param");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const capabilities = await db
        .select()
        .from(vendorCapabilities)
        .where(eq(vendorCapabilities.vendorId, id))
        .orderBy(asc(vendorCapabilities.kind));

      return c.json({ capabilities });
    } catch (error) {
      return c.json(failed("list capabilities", error), 500);
    }
  }
);

adminVendorsApp.post(
  "/:id/capabilities",
  zValidator("param", idParamSchema),
  zValidator("json", createCapabilitySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      if (!(await vendorExists(id)))
        return c.json({ error: "Vendor not found" }, 404);

      const [capability] = await db
        .insert(vendorCapabilities)
        .values({ ...body, vendorId: id })
        .returning();

      return c.json({ message: "Capability created", capability }, 201);
    } catch (error) {
      return c.json(failed("create capability", error), 500);
    }
  }
);

adminVendorsApp.patch(
  "/:id/capabilities/:capId",
  zValidator("param", capabilityParamSchema),
  zValidator("json", updateCapabilitySchema),
  async (c) => {
    const { id, capId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const [capability] = await db
        .update(vendorCapabilities)
        .set({ ...body, updatedAt: new Date() })
        .where(
          and(
            eq(vendorCapabilities.id, capId),
            eq(vendorCapabilities.vendorId, id)
          )
        )
        .returning();

      if (!capability) return c.json({ error: "Capability not found" }, 404);

      return c.json({ message: "Capability updated", capability });
    } catch (error) {
      return c.json(failed("update capability", error), 500);
    }
  }
);

adminVendorsApp.delete(
  "/:id/capabilities/:capId",
  zValidator("param", capabilityParamSchema),
  async (c) => {
    const { id, capId } = c.req.valid("param");

    try {
      const [capability] = await db
        .delete(vendorCapabilities)
        .where(
          and(
            eq(vendorCapabilities.id, capId),
            eq(vendorCapabilities.vendorId, id)
          )
        )
        .returning();

      if (!capability) return c.json({ error: "Capability not found" }, 404);

      return c.json({ message: "Capability deleted" });
    } catch (error) {
      return c.json(failed("delete capability", error), 500);
    }
  }
);

export { adminVendorsApp };
export default adminVendorsApp;
