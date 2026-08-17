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
