/**
 * Audit trail writer.
 *
 * `recordAudit` is the precise half of the trail: a handler calls it with the
 * entity and the delta it actually changed. The coarse half is
 * `middleware/audit.ts`, which records every mutating admin/vendor request that
 * no handler claimed, so a route added next month cannot escape by being
 * forgotten.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.3
 */

import type { Context } from "hono";
import {
  AUDIT_ACTION_CATEGORY,
  type AuditAction,
  type AuditOutcome,
} from "@chobii/shared";
import { db } from "../database";
import { adminAuditLog } from "../database/schema/audit-log";
import { getClientIp } from "../middleware/rate-limit";
import { logger } from "./logger";
import { alertCritical } from "./alerts";

/** What replaces a secret. Kept as a value so tests and readers agree. */
export const AUDIT_REDACTED = "[redacted]";

/**
 * Long enough for a rejection reason or an address, short enough that a base64
 * image pasted into a note cannot bloat a table that lives for 400 days.
 */
export const AUDIT_MAX_STRING_LENGTH = 2_000;

/**
 * Keyed on the key NAME, not on a path, because the point is to survive a
 * caller passing a request body wholesale. `card` covers cardNumber; `secret`
 * covers apiSecret and clientSecret; `signature` covers razorpay_signature.
 */
const SECRET_KEY_PATTERN =
  /pass(word|phrase)|token|secret|otp|signature|cvv|card|cookie|authorization|credential|private[-_]?key/i;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/**
 * Strip secrets and cap sizes before anything reaches the audit table.
 *
 * Secrets are REPLACED rather than deleted: deleting the key would hide that a
 * caller sent a secret at all, which is itself worth seeing in a review.
 *
 * Cycles resolve to `[Circular]` rather than throwing — an audit write must
 * never be the thing that fails a request (see `recordAudit`).
 */
export function redactAuditPayload(value: unknown, seen = new WeakSet<object>()): unknown {
  // `undefined` is preserved rather than coerced to null: the caller decides
  // whether an absent value means "SQL NULL" or "leave the column alone", and
  // diffRecords maps it explicitly where the distinction matters.
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string") {
    return value.length > AUDIT_MAX_STRING_LENGTH
      ? `${value.slice(0, AUDIT_MAX_STRING_LENGTH)}… [truncated]`
      : value;
  }

  if (typeof value !== "object") return value;

  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactAuditPayload(item, seen));
  }

  if (!isPlainObject(value)) {
    // Class instances (drizzle rows are plain, but a Buffer or Map is not) have
    // no reliable jsonb representation. Name the type instead of guessing.
    return `[${value.constructor?.name ?? "object"}]`;
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_PATTERN.test(key)
      ? AUDIT_REDACTED
      : redactAuditPayload(item, seen);
  }
  return out;
}

type Recordish = Record<string, unknown> | null | undefined;

/**
 * Reduce a before/after pair to the keys that actually moved, redacted.
 *
 * Storing whole rows would make every price edit carry the product's entire
 * record — forever, in a table nobody may prune outside the retention job — and
 * would bury the one field that changed. A create (no `before`) returns
 * `before: null` and the full redacted `after`, because on a create everything
 * is new.
 *
 * An added key reads as `before: { key: null }` rather than being omitted: the
 * viewer needs to render "was: nothing" rather than nothing at all.
 */
export function diffRecords(
  before: Recordish,
  after: Recordish,
  keys?: readonly string[]
): { before: Record<string, unknown> | null; after: Record<string, unknown> | null } {
  if (!before) {
    return {
      before: null,
      after: after ? (redactAuditPayload(after) as Record<string, unknown>) : null,
    };
  }

  if (!after) {
    return {
      before: redactAuditPayload(before) as Record<string, unknown>,
      after: null,
    };
  }

  const candidates =
    keys ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  const beforeDelta: Record<string, unknown> = {};
  const afterDelta: Record<string, unknown> = {};

  for (const key of candidates) {
    const from = before[key];
    const to = after[key];

    // Structural comparison: two equal-looking image arrays are not a change,
    // and drizzle hands back fresh objects on every read.
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;

    beforeDelta[key] = from === undefined ? null : from;
    afterDelta[key] = to === undefined ? null : to;
  }

  return {
    before: redactAuditPayload(beforeDelta) as Record<string, unknown>,
    after: redactAuditPayload(afterDelta) as Record<string, unknown>,
  };
}

// ============================================================================
// Writing a row
// ============================================================================

/**
 * What a handler describes. The category is deliberately absent: it is derived
 * from the action, so two callers cannot file the same action two ways.
 */
export interface AuditEntryInput {
  action: AuditAction;
  entityType?: string | null;
  entityId?: string | null;
  /** One human line for the viewer's list column. */
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  /** Merged over the automatically captured route metadata. */
  metadata?: Record<string, unknown>;
  /** Defaults to success. A refusal is evidence — record it, don't drop it. */
  outcome?: AuditOutcome;
}

/**
 * The subset of a Hono context this module reads: `user`, `requestId` and
 * `vendorId`, plus the request's method, path and headers.
 *
 * Declared structurally rather than as `Pick<Context, …>` for two reasons: a
 * caller inside a queue or a script can hand over a stub instead of faking a
 * whole request, and — the reason it is written this way — `Context` is generic
 * over its Variables map, so a `Pick` of the default instantiation refuses every
 * route that declares its own variables. Reading one more key must not change
 * that: `get` stays `(key: string) => unknown`, and each key is narrowed at the
 * point it is read.
 */
interface AuditContext {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  req: {
    method: string;
    path: string;
    header(name: string): string | undefined;
  };
}

/** The insert surface shared by `db` and a drizzle transaction handle. */
type AuditWriter = { insert: typeof db.insert };

/**
 * Record one audited action.
 *
 * ## Never throws
 *
 * A refund that already moved money must not be rolled back because an INSERT
 * into the audit table deadlocked. Failures are logged with the request id and
 * escalated through `alertCritical` — a silently-dropped audit row is worse than
 * a loud one, because the gap is invisible at exactly the moment it matters.
 *
 * ## Claims the request
 *
 * Sets `audited` on the context, BEFORE the insert. `middleware/audit.ts` reads
 * that flag and skips its own coarse `admin.request` row, so one action produces
 * one row. Claiming first is deliberate: if the insert then fails, the price is
 * a *missing* row rather than a *misleading* floor row attributing the action to
 * nothing in particular. Nobody may read an absent row as "it did not happen".
 *
 * ## The caller supplies the change; the context supplies the facts
 *
 * The category is derived from the action, and the ip, user agent, request id,
 * method, path and `vendorId` are read off the context here. None of them is a
 * parameter, because a caller cannot get a context fact wrong if a caller never
 * supplies it — per-call-site capture means the first route added next year
 * forgets. `vendorId` is merged AFTER `entry.metadata` for the same reason: a
 * handler that spreads a request body cannot make the row claim it was written
 * for a shop it was not. An admin request has no `vendorId` and gets no key —
 * "has a vendorId" must keep meaning "was written for a vendor".
 *
 * ## Atomicity is opt-in — and getting it backwards destroys evidence
 *
 * **Share the transaction when the audit row would be a LIE if the business
 * write rolled back.** A row saying "job moved to qc_passed" beside a job still
 * sitting in `qc_submitted` is worse than no row. So a state move, an
 * assignment, an amount override, a transfer despatch — anything whose row only
 * makes sense if the write committed — passes the same `tx` the write uses.
 *
 * **NEVER share the transaction for a refusal.** This is the trap, and the
 * instinct is the wrong way round. A refusal row (`outcome: 'failure'`, e.g.
 * `production_job.transition_refused`) records that a transaction was *rolled
 * back*; writing it inside that transaction rolls the row back too and erases
 * the very evidence it exists to preserve. Refusals — and any row written after
 * the business write already committed — omit `tx` and are written
 * independently.
 *
 * Rule of thumb: `tx` when the row asserts something the transaction must make
 * true; no `tx` when the row asserts something about the transaction itself.
 */
export async function recordAudit(
  c: AuditContext,
  entry: AuditEntryInput,
  tx?: AuditWriter
): Promise<void> {
  // Set before the write: if the insert fails we still do not want the
  // middleware writing a misleading `admin.request` row in its place.
  c.set("audited", true);

  const user = c.get("user") as
    | { id?: string; email?: string; role?: string }
    | null
    | undefined;
  const requestId = (c.get("requestId") as string | undefined) ?? null;
  // Set by `requireVendor` on every /api/vendor/* request. Read here rather
  // than passed by each call site — see the doc comment above.
  const vendorId = (c.get("vendorId") as string | undefined) ?? null;

  try {
    const writer = tx ?? db;

    await writer.insert(adminAuditLog).values({
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      actorRole: user?.role ?? null,
      action: entry.action,
      category: AUDIT_ACTION_CATEGORY[entry.action],
      outcome: entry.outcome ?? "success",
      summary: entry.summary ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: (redactAuditPayload(entry.before ?? null) ?? null) as never,
      after: (redactAuditPayload(entry.after ?? null) ?? null) as never,
      metadata: redactAuditPayload({
        method: c.req.method,
        path: c.req.path,
        ...(entry.metadata ?? {}),
        // Last, so a caller cannot overwrite which vendor this was written for.
        // Absent entirely on an admin request: an admin acts for nobody, and a
        // null here would make the field stop answering its one question.
        ...(vendorId ? { vendorId } : {}),
      }) as never,
      requestId,
      ipAddress: getClientIp(c as unknown as Context),
      userAgent: c.req.header("user-agent") ?? null,
    });
  } catch (error) {
    // Loud, but not fatal. The business action already happened.
    logger.error(
      {
        err: error,
        requestId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorUserId: user?.id ?? null,
        vendorId,
      },
      "audit write failed"
    );

    alertCritical(
      "Audit write failed",
      `Could not record ${entry.action} on ${entry.entityType ?? "unknown"} ${
        entry.entityId ?? ""
      }. The action itself succeeded; the trail did not.`,
      { action: entry.action, requestId: requestId ?? "unknown" }
    );
  }
}
