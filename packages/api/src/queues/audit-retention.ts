/**
 * Audit log retention.
 *
 * India's DPDP Act applies to this table: rows carry customer emails and staff
 * identity for every admin action, so "keep forever" is not a policy, it is an
 * omission. 400 days is a financial year plus the disputes that trail it.
 *
 * This is the ONLY code path allowed to delete an audit row, and it earns that
 * by opting in explicitly: `SET LOCAL chobii.audit_purge = 'on'` inside its own
 * transaction, which is the one condition the immutability trigger accepts.
 * `SET LOCAL` rather than `SET` matters — the opt-in dies with the transaction
 * rather than lingering on a pooled connection where an unrelated statement
 * could inherit it.
 *
 * Design: docs/plans/2026-08-17-logging-and-auditing.md §3.8
 */

import { sql } from "drizzle-orm";

import { db } from "../database";
import { logger } from "../lib/logger";

/** A financial year, plus the disputes that arrive after it closes. */
export const AUDIT_RETENTION_DEFAULT_DAYS = 400;

/** Daily. The window is 400 days; the exact hour it runs is immaterial. */
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * How long rows are kept.
 *
 * A nonsensical `AUDIT_RETENTION_DAYS` falls back to the default rather than
 * being honoured. "0" would mean delete everything, and the whole table is then
 * one typo'd deploy away — with nothing to restore it from, because the point of
 * an append-only log is that no other copy exists.
 */
export function auditRetentionDays(): number {
  const configured = Number(process.env.AUDIT_RETENTION_DAYS);

  if (!Number.isFinite(configured) || configured < 1) {
    return AUDIT_RETENTION_DEFAULT_DAYS;
  }

  return Math.floor(configured);
}

/**
 * Delete audit rows older than the retention window.
 *
 * Returns the number removed. Never throws: this runs on a timer with nobody
 * watching, and an unhandled rejection would take down the process that also
 * serves the API.
 */
export async function purgeExpiredAuditRows(): Promise<number> {
  const days = auditRetentionDays();

  try {
    const removed = await db.transaction(async (tx) => {
      // Before the DELETE, not after: the trigger reads this setting for every
      // row, so a DELETE issued first is simply refused.
      await tx.execute(sql`SET LOCAL chobii.audit_purge = 'on'`);

      const deleted = await tx.execute(
        sql`DELETE FROM admin_audit_log
            WHERE created_at < now() - (${days}::text || ' days')::interval
            RETURNING id`
      );

      return Array.isArray(deleted) ? deleted.length : 0;
    });

    if (removed > 0) {
      logger.info({ removed, retentionDays: days }, "Audit log retention purge complete");
    }

    return removed;
  } catch (error) {
    logger.error(
      { err: error, retentionDays: days },
      "Audit log retention purge failed — rows older than the window are still present"
    );
    return 0;
  }
}

export interface AuditRetentionWorker {
  stop: () => void;
}

/**
 * Run the purge now, then daily.
 *
 * Running once at startup means a deploy after any outage catches up without
 * waiting a day, and the purge is idempotent — a second pass finds nothing.
 */
export function startAuditRetentionWorker(): AuditRetentionWorker {
  void purgeExpiredAuditRows();

  const timer = setInterval(() => {
    void purgeExpiredAuditRows();
  }, PURGE_INTERVAL_MS);

  // Do not hold the process open for a sweep that can wait for the next boot.
  timer.unref?.();

  return { stop: () => clearInterval(timer) };
}
