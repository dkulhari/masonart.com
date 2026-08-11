/**
 * Live-database suites (#580)
 *
 * Several gift card suites open a real Postgres connection and create their
 * own rows. That is deliberate and is defended in each file: the properties
 * under test are a `SELECT ... FOR UPDATE` row lock, a unique constraint
 * settling a race, and transactional rollback. A mocked `db` can only assert
 * that the words were written, not that the lock holds — removing `FOR UPDATE`
 * was confirmed to fail the concurrency test, so the coverage is real. None of
 * them should ever become mocks.
 *
 * Two things about how they ran were not deliberate:
 *
 *   1. They skipped **silently** without a reachable database. CI without one
 *      reported green while testing nothing, which is the same disease as the
 *      rate limit assertion that never fired (#575).
 *   2. They took `DATABASE_URL` directly, so they ran against the shared dev
 *      database. They create and delete only their own rows and drop nothing,
 *      so they sit outside the `getDestructiveDbUrl` guard — but that guard
 *      exists because of a real incident (#332), and "outside the guard" is a
 *      judgement, not a guarantee.
 *
 * So: prefer a disposable database when one is configured, and when no
 * database is reachable at all, FAIL rather than skip.
 *
 * To point them at a throwaway database:
 *
 *   createdb poster_app_test           # or: CREATE DATABASE poster_app_test;
 *   TEST_DATABASE_URL=postgresql://poster_app:pw@localhost:5440/poster_app_test \
 *     bunx drizzle-kit migrate         # DATABASE_URL is what drizzle-kit reads
 *   TEST_DATABASE_URL=... bunx vitest run
 *
 * To say out loud that you are running without one — and are therefore not
 * checking any of this — set `ALLOW_MISSING_DB=true`.
 */

import { isDisposableDbUrl } from "./destructive-db";

/**
 * The database these suites may connect to.
 *
 * `TEST_DATABASE_URL` wins when set, so a disposable database is used the
 * moment one is configured, without every suite having to know about it.
 * Unlike `getDestructiveDbUrl`, a non-disposable value here is NOT refused:
 * these suites drop nothing, and the shared dev database remains a supported —
 * if second-best — place to run them.
 */
export function liveDbUrl(): string | null {
  return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || null;
}

/** True when the suites are running against a throwaway `*_test` database. */
export function liveDbIsDisposable(): boolean {
  const url = liveDbUrl();
  return url ? isDisposableDbUrl(url) : false;
}

/** Whether an unreachable database is allowed to pass silently. */
export function liveDbOptional(): boolean {
  return process.env.ALLOW_MISSING_DB === "true";
}

/** What to print when there is nothing to connect to. */
export function liveDbMissingMessage(): string {
  const url = liveDbUrl();

  return url
    ? `Could not reach ${redactDbUrl(url)}. These tests assert a row lock, a unique constraint and transactional rollback — properties a mock cannot have — so they fail rather than pass without a database. Start Postgres, or set ALLOW_MISSING_DB=true to skip them out loud. See tests/helpers/live-db.ts (#580).`
    : "No TEST_DATABASE_URL or DATABASE_URL is set, so there is no database to assert row locks against. Set one, or set ALLOW_MISSING_DB=true to skip these out loud. See tests/helpers/live-db.ts (#580).";
}

/** Credentials never belong in a test report. */
export function redactDbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = "";
    parsed.username = parsed.username ? "***" : "";
    return parsed.toString();
  } catch {
    return "the configured database";
  }
}

/**
 * The assertion each live-database suite makes once, up front.
 *
 * Called from a real `it(...)` so the failure is a failing test with an
 * explanation, not a warning in scrollback that everyone stops seeing.
 */
export function assertLiveDbReachable(reachable: boolean): void {
  if (liveDbOptional()) return;
  if (reachable) return;

  throw new Error(liveDbMissingMessage());
}
