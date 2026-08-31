/**
 * QC photograph retention.
 *
 * The sibling of `queues/audit-retention.ts`, and deliberately the same 400
 * days. The QC verdict lives in the audit log (`production_job.qc_approved` /
 * `.qc_rejected`); the photographs are its evidence. If the two windows drift,
 * one expires first and the survivor is worthless — a verdict whose evidence
 * has expired is worse than neither, and evidence with no verdict is
 * unattributable. So the default here is not "400, roughly like audit"; it is
 * the audit number, asserted equal in the test suite.
 *
 * ## Objects FIRST, rows SECOND
 *
 * This is the whole reason the module exists rather than a cascade.
 *
 * `production_job_photos.job_id` is `ON DELETE CASCADE`, which is correct for
 * the rows: a photograph of a job is not a financial record and means nothing
 * without the job. But a cascade cannot reach into object storage, and the row
 * is the ONLY handle on the R2 object — the key lives in `object_key` and
 * nowhere else. Delete the row first and the object is unreachable garbage
 * that no later sweep can ever enumerate back to a job.
 *
 * Hence the order below, and hence the failure behaviour: if `deleteByPrefix`
 * throws, the rows for that job are LEFT IN PLACE. A job that keeps its rows is
 * swept again tomorrow; a job that lost them is orphaned forever. Only one of
 * those two failure modes is recoverable, so the code always fails into it.
 *
 * ## Whole jobs, not individual rows
 *
 * The sweep works at job granularity because the prefix does: R2 is deleted
 * per `production-qc/<jobId>/`. A job is therefore only eligible once its LAST
 * photograph has aged out (`HAVING max(uploaded_at) < cutoff`). Sweeping a job
 * with one expired shot and one recent reshoot would delete the live evidence
 * sitting beside the expired attempt, which is exactly the case
 * `superseded_at` exists to preserve.
 *
 * ## No transaction
 *
 * Unlike the audit purge, this does not run in one. The R2 calls are network
 * round trips over an unbounded object list, and holding a Postgres
 * transaction open across them would pin a pooled connection for the duration.
 * Per-job atomicity is enough: the only interleaving that matters is objects
 * before rows, and that is sequenced in code.
 *
 * Note also what is absent: no `SET LOCAL chobii.audit_purge`. That opt-in is
 * the audit log's immutability trigger talking, and `production_job_photos`
 * has no such trigger. Copying it here would be cargo cult.
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §7
 */

import { sql } from 'drizzle-orm'

import { db } from '../database'
import { logger } from '../lib/logger'
import { StoragePaths, deleteByPrefix } from '../lib/storage'

/**
 * A financial year plus the disputes behind it — the same window as
 * `AUDIT_RETENTION_DEFAULT_DAYS`, and equal to it on purpose.
 */
export const QC_PHOTO_RETENTION_DEFAULT_DAYS = 400

/** Daily. The window is 400 days; the exact hour it runs is immaterial. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * How long photographs are kept.
 *
 * A nonsensical `QC_PHOTO_RETENTION_DAYS` falls back to the default rather
 * than being honoured. "0" would mean retain nothing, and every QC photograph
 * in the bucket is then one typo'd deploy away — with the rows that named them
 * gone too, so there would be nothing left to even audit the loss with.
 */
export function qcPhotoRetentionDays(): number {
  const configured = Number(process.env.QC_PHOTO_RETENTION_DAYS)

  if (!Number.isFinite(configured) || configured < 1) {
    return QC_PHOTO_RETENTION_DEFAULT_DAYS
  }

  return Math.floor(configured)
}

/** postgres-js returns an array; other drivers wrap it. Tolerate both. */
function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const wrapped = (result as { rows?: unknown })?.rows
  return Array.isArray(wrapped) ? (wrapped as Record<string, unknown>[]) : []
}

/**
 * Delete QC photographs older than the retention window, objects first.
 *
 * Returns the number of ROWS removed — which is also, by construction, the
 * number of rows whose objects are already gone. Never throws: this runs on a
 * timer with nobody watching, and an unhandled rejection would take down the
 * process that also serves the API.
 */
export async function purgeExpiredQcPhotos(): Promise<number> {
  const days = qcPhotoRetentionDays()
  let removed = 0

  try {
    // Whole jobs only. `max(uploaded_at)` and not `min`: one recent reshoot
    // keeps the entire job, because the delete below is by prefix and cannot
    // spare the live shot sitting beside the expired one.
    const expired = await db.execute(
      sql`SELECT job_id
          FROM production_job_photos
          GROUP BY job_id
          HAVING max(uploaded_at) < now() - (${days}::text || ' days')::interval`
    )

    const jobIds = rowsOf(expired)
      .map((row) => String(row.job_id ?? ''))
      .filter((jobId) => jobId.length > 0)

    for (const jobId of jobIds) {
      try {
        // Re-checked BEFORE anything is destroyed, and the job is the unit.
        // The list above and the sweep below are separate statements, so a
        // photograph can arrive in between — and `deleteByPrefix` cannot spare
        // it. A job with anything inside the window is therefore not expired at
        // all; it is left whole and the next pass decides again.
        const fresh = await db.execute(
          sql`SELECT 1
              FROM production_job_photos
              WHERE job_id = ${jobId}::uuid
                AND uploaded_at >= now() - (${days}::text || ' days')::interval
              LIMIT 1`
        )

        if (rowsOf(fresh).length > 0) continue

        // Objects FIRST. If this throws we fall into the catch below and the
        // rows survive, which is the recoverable half of the failure: the row
        // is the only handle on the object, so a row without its object is
        // unrecoverable in the other direction.
        await deleteByPrefix(StoragePaths.productionQcJobPrefix(jobId))

        // Rows SECOND, and ALL of them. The delete above was by prefix, so
        // every row of this job now points at nothing; re-filtering by age here
        // kept exactly the row whose photograph had just been destroyed — a
        // live row with no image, and `shot-list-complete` passing on evidence
        // that no longer exists. The re-check above is what makes deleting the
        // lot the safe reading rather than the destructive one.
        const deleted = await db.execute(
          sql`DELETE FROM production_job_photos
              WHERE job_id = ${jobId}::uuid
              RETURNING id`
        )

        removed += rowsOf(deleted).length
      } catch (error) {
        // One unreachable prefix must not stall the sweep for every other job.
        // This one keeps its rows and is retried on the next pass; a repeat
        // deleteByPrefix over an already-empty prefix is a no-op.
        logger.error(
          { err: error, jobId, retentionDays: days },
          'QC photo retention sweep failed for one job — its rows were left in place so the objects stay reachable'
        )
      }
    }

    if (removed > 0) {
      logger.info(
        { removed, jobs: jobIds.length, retentionDays: days },
        'QC photo retention sweep complete'
      )
    }

    return removed
  } catch (error) {
    logger.error(
      { err: error, retentionDays: days },
      'QC photo retention sweep failed — photographs older than the window are still present'
    )
    return removed
  }
}

export interface QcPhotoRetentionWorker {
  stop: () => void
}

/**
 * Run the sweep now, then daily.
 *
 * Running once at startup means a deploy after any outage catches up without
 * waiting a day, and the sweep is idempotent — a second pass finds no expired
 * jobs, and a prefix already emptied deletes nothing.
 */
export function startQcPhotoRetentionWorker(): QcPhotoRetentionWorker {
  void purgeExpiredQcPhotos()

  const timer = setInterval(() => {
    void purgeExpiredQcPhotos()
  }, SWEEP_INTERVAL_MS)

  // Do not hold the process open for a sweep that can wait for the next boot.
  timer.unref?.()

  return { stop: () => clearInterval(timer) }
}
