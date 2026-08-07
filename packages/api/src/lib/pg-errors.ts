/**
 * Recognising Postgres constraint failures well enough to answer them properly.
 *
 * Extracted from `routes/admin/collections.ts`, where the unwrapping below was
 * worked out against the live database, because `routes/admin/frames.ts` needs
 * exactly the same behaviour and a second copy is how the two end up
 * disagreeing about which errors are a 409 and which are a 500.
 */

/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/**
 * Is this a unique-constraint failure?
 *
 * Translated by callers into a 409 naming the offending value rather than
 * allowed to surface as a 500 — the admin needs to know which slug is taken,
 * and "internal server error" tells them to file a bug instead of picking
 * another name.
 *
 * Drizzle WRAPS the driver error. Checking `error.code` alone matches nothing:
 * the thrown object carries `{ query, params, cause, stack }` and the postgres
 * code sits on `error.cause.code`. Verified against the live database — an
 * insert colliding on `collections_slug_unique` produces `code: undefined` at
 * the top level and `cause.code: '23505'` beneath.
 *
 * Both are checked, because the unwrapped shape is what a direct driver call
 * would throw and there is no reason to be brittle about which layer raised it.
 */
export const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const top = (error as { code?: string }).code;
  const cause = (error as { cause?: { code?: string } }).cause?.code;
  return top === UNIQUE_VIOLATION || cause === UNIQUE_VIOLATION;
};
