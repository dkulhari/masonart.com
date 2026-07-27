/**
 * Destructive-DB guard (#332)
 *
 * Suites under tests/database/ DROP and recreate tables. Run against the
 * shared dev database they destroy real schema/data (the #332 incident:
 * a full-suite run wiped ai_generations and recreated products with stale
 * columns). This guard makes that impossible:
 *
 * - A database is DISPOSABLE iff its name ends in `_test`.
 * - Destructive suites take their URL from getDestructiveDbUrl() and skip
 *   (loudly) when it returns null. They never touch DATABASE_URL directly.
 *
 * To actually run destructive suites, create the throwaway DB once and set
 * TEST_DATABASE_URL, e.g.:
 *   psql: CREATE DATABASE poster_app_test OWNER poster_app;
 *   TEST_DATABASE_URL=postgresql://poster_app:pw@localhost:5433/poster_app_test
 */

/** True iff the URL's database name ends in `_test` (safe to destroy). */
export function isDisposableDbUrl(url: string): boolean {
  try {
    const dbName = new URL(url).pathname.replace(/^\//, "");
    return dbName.endsWith("_test");
  } catch {
    return false;
  }
}

/**
 * The URL destructive suites may connect to, or null when none is safe.
 *
 * TEST_DATABASE_URL wins when disposable. A non-disposable TEST_DATABASE_URL
 * is refused outright (no silent fallback to DATABASE_URL — a misconfigured
 * override must fail safe, not destroy the dev DB). Otherwise DATABASE_URL
 * is used only if it is itself disposable.
 */
export function getDestructiveDbUrl(): string | null {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl) {
    return isDisposableDbUrl(testUrl) ? testUrl : null;
  }
  const url = process.env.DATABASE_URL;
  if (url && isDisposableDbUrl(url)) {
    return url;
  }
  return null;
}

/** Human-readable reason used by suites when they skip. */
export function destructiveDbSkipReason(): string {
  return (
    "⏭️  Skipping destructive DB suite: no disposable database configured. " +
    "These tests DROP tables — they only run when TEST_DATABASE_URL (or " +
    "DATABASE_URL) points at a database whose name ends in `_test`. " +
    "See tests/helpers/destructive-db.ts (#332)."
  );
}
