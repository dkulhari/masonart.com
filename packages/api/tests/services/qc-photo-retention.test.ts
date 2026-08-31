/**
 * QC photograph retention.
 *
 * The sibling of tests/services/audit-retention.test.ts, and it exists for the
 * same window: 400 days, so that the audit row (`production_job.qc_approved` /
 * `.qc_rejected`) and the photograph it refers to never outlive each other in
 * opposite directions. A verdict whose evidence has expired is worse than
 * neither; evidence with no verdict is unattributable.
 *
 * What this suite is really about is ORDER. `production_job_photos.job_id` is
 * `ON DELETE CASCADE`, and the row is the ONLY handle on the R2 object — the
 * key lives in `object_key` and nowhere else. Delete the row first and the
 * object becomes unreachable garbage that no later sweep can ever find. So
 * every failure mode below is checked for the same property: rows are never
 * removed unless their objects went first.
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Every call either half of the sweep made, in the order it made them. */
const trace = vi.hoisted(() => [] as string[])

const render = (fragment: unknown) =>
  JSON.stringify((fragment as { queryChunks?: unknown[] })?.queryChunks ?? fragment)

const execute = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve([] as unknown[]))
)

vi.mock('../../src/database', () => ({
  db: {
    execute: (...args: unknown[]) => {
      trace.push(`db:${render(args[0])}`)
      return execute(...args)
    },
  },
}))

const deleteByPrefix = vi.hoisted(() => vi.fn((..._args: unknown[]) => Promise.resolve(0)))

// importOriginal, not a bare stub: the prefix the sweep deletes under is built
// by the real `StoragePaths`, and a test that reimplements it would pass while
// the two drifted apart.
vi.mock('../../src/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/storage')>()
  return {
    ...actual,
    deleteByPrefix: (...args: unknown[]) => {
      trace.push(`r2:${String(args[0])}`)
      return deleteByPrefix(...args)
    },
  }
})

const logInfo = vi.hoisted(() => vi.fn())
const logError = vi.hoisted(() => vi.fn())
vi.mock('../../src/lib/logger', () => ({
  logger: { info: logInfo, error: logError, warn: vi.fn(), debug: vi.fn(), child: vi.fn() },
  createChildLogger: vi.fn(),
  REDACTED_LOG_PATHS: [],
}))

const {
  purgeExpiredQcPhotos,
  qcPhotoRetentionDays,
  startQcPhotoRetentionWorker,
  QC_PHOTO_RETENTION_DEFAULT_DAYS,
} = await import('../../src/queues/qc-photo-retention')

const { AUDIT_RETENTION_DEFAULT_DAYS } = await import('../../src/queues/audit-retention')

/** Every statement the sweep ran, rendered to comparable text. */
const statements = () => trace.filter((entry) => entry.startsWith('db:'))

/** Where the R2 delete for `jobId` sits in the whole call sequence. */
const objectDeleteAt = (jobId: string) =>
  trace.findIndex((entry) => entry.startsWith('r2:') && entry.includes(jobId))

/** Where the row DELETE naming `jobId` sits in the whole call sequence. */
const rowDeleteAt = (jobId: string) =>
  trace.findIndex(
    (entry) => entry.startsWith('db:') && /delete/i.test(entry) && entry.includes(jobId)
  )

const JOB_A = '11111111-1111-4111-8111-111111111111'
const JOB_B = '22222222-2222-4222-8222-222222222222'

/** The sweep's shape: one SELECT of expired jobs, then a DELETE per job. */
const expiredJobs = (...jobIds: string[]) => {
  execute.mockReset()
  execute.mockResolvedValueOnce(jobIds.map((job_id) => ({ job_id })))
  for (const _ of jobIds) execute.mockResolvedValueOnce([{ id: 'row' }])
  execute.mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
  trace.length = 0
  execute.mockReset()
  execute.mockResolvedValue([])
  deleteByPrefix.mockReset()
  deleteByPrefix.mockResolvedValue(0)
  delete process.env.QC_PHOTO_RETENTION_DAYS
})

describe('qcPhotoRetentionDays', () => {
  it('defaults to 400 days', () => {
    expect(qcPhotoRetentionDays()).toBe(QC_PHOTO_RETENTION_DEFAULT_DAYS)
    expect(QC_PHOTO_RETENTION_DEFAULT_DAYS).toBe(400)
  })

  it('matches the audit window exactly', () => {
    // Not a coincidence to be tidied away later. The QC verdict is an audit
    // row and the photograph is its evidence; if these two numbers drift, one
    // of them expires first and the survivor is worthless.
    expect(QC_PHOTO_RETENTION_DEFAULT_DAYS).toBe(AUDIT_RETENTION_DEFAULT_DAYS)
  })

  it('honours QC_PHOTO_RETENTION_DAYS', () => {
    process.env.QC_PHOTO_RETENTION_DAYS = '90'
    expect(qcPhotoRetentionDays()).toBe(90)
  })

  it('ignores a nonsensical value rather than deleting everything', () => {
    // "0" would mean retain nothing, and every QC photograph in the bucket is
    // then one typo'd deploy away — with the rows cascaded off behind them.
    for (const value of ['0', '-5', 'forever', '']) {
      process.env.QC_PHOTO_RETENTION_DAYS = value
      expect(qcPhotoRetentionDays()).toBe(QC_PHOTO_RETENTION_DEFAULT_DAYS)
    }
  })
})

describe('purgeExpiredQcPhotos', () => {
  it('deletes the R2 objects BEFORE the rows that point at them', async () => {
    expiredJobs(JOB_A)

    await purgeExpiredQcPhotos()

    expect(objectDeleteAt(JOB_A)).toBeGreaterThanOrEqual(0)
    expect(rowDeleteAt(JOB_A)).toBeGreaterThanOrEqual(0)
    expect(objectDeleteAt(JOB_A)).toBeLessThan(rowDeleteAt(JOB_A))
  })

  it("deletes under the job's own prefix, and nothing wider", async () => {
    expiredJobs(JOB_A)

    await purgeExpiredQcPhotos()

    expect(deleteByPrefix).toHaveBeenCalledWith(`production-qc/${JOB_A}/`)
  })

  it('selects the jobs to sweep by age, not by count', async () => {
    await purgeExpiredQcPhotos()

    const select = statements()[0]
    expect(select).toMatch(/uploaded_at/i)
    expect(select).toMatch(/days/i)
    expect(select).not.toMatch(/limit/i)
  })

  it('only sweeps a job once its LAST photograph has aged out', async () => {
    // The prefix delete is per JOB, so a job with one expired shot and one
    // recent reshoot must not be swept — that would destroy the live evidence
    // sitting beside the expired attempt.
    expect(statements().length).toBe(0)

    await purgeExpiredQcPhotos()

    expect(statements()[0]).toMatch(/max\(/i)
    expect(statements()[0]).toMatch(/group by/i)
  })

  it('touches R2 at all only when something has expired', async () => {
    execute.mockResolvedValue([])

    await purgeExpiredQcPhotos()

    expect(deleteByPrefix).not.toHaveBeenCalled()
  })

  it('reports how many rows it removed', async () => {
    execute.mockReset()
    execute.mockResolvedValueOnce([{ job_id: JOB_A }])
    execute.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])

    const removed = await purgeExpiredQcPhotos()

    expect(removed).toBe(2)
    expect(logInfo).toHaveBeenCalled()
  })

  it('leaves the rows alone when the object delete fails', async () => {
    // The whole point of the ticket. A sweep that dropped the rows here would
    // leave the objects in the bucket with nothing left pointing at them, and
    // no later sweep could ever find them again.
    expiredJobs(JOB_A)
    deleteByPrefix.mockRejectedValueOnce(new Error('R2 unreachable'))

    await purgeExpiredQcPhotos()

    expect(rowDeleteAt(JOB_A)).toBe(-1)
    expect(logError).toHaveBeenCalled()
  })

  it('does not count rows it never deleted', async () => {
    expiredJobs(JOB_A)
    deleteByPrefix.mockRejectedValueOnce(new Error('R2 unreachable'))

    await expect(purgeExpiredQcPhotos()).resolves.toBe(0)
  })

  it('carries on to the next job when one job fails', async () => {
    // One unreachable prefix must not stall the sweep forever: the job that
    // failed keeps its rows and is retried tomorrow.
    expiredJobs(JOB_A, JOB_B)
    deleteByPrefix.mockRejectedValueOnce(new Error('R2 unreachable'))

    await purgeExpiredQcPhotos()

    expect(rowDeleteAt(JOB_A)).toBe(-1)
    expect(rowDeleteAt(JOB_B)).toBeGreaterThanOrEqual(0)
    expect(objectDeleteAt(JOB_B)).toBeLessThan(rowDeleteAt(JOB_B))
  })

  it('logs and returns rather than throwing when the database fails', async () => {
    // It runs on a timer with nobody watching; an unhandled rejection there
    // takes down the process that also serves the API.
    execute.mockRejectedValueOnce(new Error('connection reset'))

    await expect(purgeExpiredQcPhotos()).resolves.toBe(0)
    expect(logError).toHaveBeenCalled()
  })

  it('never deletes rows when the job list could not be read', async () => {
    execute.mockRejectedValueOnce(new Error('connection reset'))

    await purgeExpiredQcPhotos()

    expect(deleteByPrefix).not.toHaveBeenCalled()
    expect(statements().filter((s) => /delete/i.test(s))).toHaveLength(0)
  })

  it('scopes the row delete to the job it just emptied', async () => {
    expiredJobs(JOB_A, JOB_B)

    await purgeExpiredQcPhotos()

    const deletes = statements().filter((s) => /delete/i.test(s))
    expect(deletes).toHaveLength(2)
    for (const statement of deletes) expect(statement).toMatch(/job_id/i)
  })
})

describe('startQcPhotoRetentionWorker', () => {
  it('sweeps once at startup, so a deploy after an outage catches up', async () => {
    const worker = startQcPhotoRetentionWorker()

    await vi.waitFor(() => expect(statements().length).toBeGreaterThan(0))

    worker.stop()
  })

  it('returns a stop that clears the timer', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    startQcPhotoRetentionWorker().stop()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
