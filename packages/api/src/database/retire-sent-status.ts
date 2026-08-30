/**
 * Retire `production_jobs.status = 'sent'` on rows that already carry it.
 *
 * Run with: bun run db:retire-sent-status [--dry-run]
 *
 * Design: docs/superpowers/specs/2026-08-30-production-pipeline-design.md §9,
 * and decision 9 in §3.
 *
 * ## Why this is a script and not a migration
 *
 * `drizzle-kit migrate` replays the whole pending batch in ONE transaction, and
 * 0023 added `qc_submitted`, `dispatched` and `fulfilment` with
 * `ALTER TYPE … ADD VALUE`. Postgres refuses any use of a value added in the
 * current transaction — `unsafe use of new value` — and splitting the ADD VALUE
 * from its first use across two migration FILES does not help, because on a
 * fresh database both files are in the same batch. That is #580; `0018:1-12` is
 * the write-up and `tests/database/migration-enum-literals.test.ts` is the
 * standing guard.
 *
 * `'sent'` is an old value and would technically survive that batch, but the
 * batch is the wrong home on its own terms too: this is a data rewrite that
 * runs once, after the type has settled, against whatever rows a given
 * environment happens to hold. That is an operation, not a schema change. So it
 * runs after the batch commits — which is exactly what §9 asks for.
 *
 * ## What "retirement" means here
 *
 * `sent` STAYS in the Postgres type. Dropping an enum value means recreating
 * the type and rewriting every dependent column, which is disproportionate to
 * deleting a word. What retires is its reachability: the transition matrix
 * gives it zero in-edges and zero out-edges (#676), so nothing can produce one
 * again. This script clears out the rows that predate that.
 *
 * ## Why `assigned` and not `received`
 *
 * `sent` meant "we posted the material to the vendor". The re-meant `received`
 * means "the vendor has everything needed to start" — a VENDOR-ATTESTED fact,
 * and a precondition that both the admin QC queue and the label gate read.
 * Promoting a `sent` row to `received` would fabricate an attestation that
 * never happened and could let a job through QC that no vendor ever confirmed
 * receiving.
 *
 * `assigned` records only what we actually know: assigned, not yet started. And
 * `assigned → received` is a legal vendor edge in the new matrix, so a retired
 * row resumes normally the moment the vendor confirms — which is the same
 * button they would have pressed anyway.
 *
 * Nothing is lost by the demotion. `production_jobs.sent_at` still holds the
 * date the material went out, and this script does not touch it — the row can
 * still say when we posted the work, which is the only fact `sent` carried that
 * `assigned` does not.
 */

import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from './schema'
import { productionJobs, type ProductionJobStatus } from './schema/production-jobs'

/** The one rewrite this script performs, named so tests and prose agree. */
export const SENT_RETIREMENT = {
  from: 'sent',
  to: 'assigned',
} as const satisfies { from: ProductionJobStatus; to: ProductionJobStatus }

/**
 * What the retirement runs against.
 *
 * Narrowed to the two builders this script uses so a caller can hand it
 * something other than the application pool — specifically a drizzle
 * transaction, which is how the behavioural test exercises the real UPDATE
 * against a real database and then rolls the whole thing back.
 */
export type RetirementDb = Pick<PostgresJsDatabase<typeof schema>, 'select' | 'update'>

export interface RetirementOptions {
  /** Report the count without writing anything. */
  dryRun?: boolean
  /** Where to run. Defaults to the application connection, imported lazily. */
  db?: RetirementDb
}

export interface RetirementResult {
  /** Rows found holding the retired status. */
  found: number
  /** Rows actually rewritten — zero under --dry-run. */
  updated: number
}

/**
 * Move every row still holding the retired status onto its replacement.
 *
 * One statement, no transaction wrapper: a single UPDATE is already atomic, and
 * the rewrite is idempotent — everything not `sent` is already where it belongs
 * and the UPDATE never produces a `sent` — so a completed run leaves none
 * behind, a second run matches nothing, and a half-finished run is simply
 * resumable.
 *
 * `./index` is imported HERE and not at module scope. That module builds a
 * twenty-connection pool and throws on a missing `DATABASE_URL` while it is
 * being evaluated, so a static import made merely *importing* this file — which
 * the tests do — require a database and leak a pool. Deferring it is the same
 * shape services/ai-moderation.ts uses.
 */
export async function retireSentStatus({
  dryRun = false,
  db,
}: RetirementOptions = {}): Promise<RetirementResult> {
  const database: RetirementDb = db ?? (await import('./index')).db

  const stale = await database
    .select({ id: productionJobs.id })
    .from(productionJobs)
    .where(eq(productionJobs.status, SENT_RETIREMENT.from))

  if (stale.length === 0 || dryRun) {
    return { found: stale.length, updated: 0 }
  }

  const updated = await database
    .update(productionJobs)
    .set({ status: SENT_RETIREMENT.to })
    .where(eq(productionJobs.status, SENT_RETIREMENT.from))
    .returning({ id: productionJobs.id })

  return { found: stale.length, updated: updated.length }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const { found, updated } = await retireSentStatus({ dryRun })

  if (found === 0) {
    console.log(`No production_jobs hold '${SENT_RETIREMENT.from}'. Nothing to retire.`)
    return
  }

  console.log(
    `${dryRun ? '[dry run] ' : ''}${found} job(s) at '${SENT_RETIREMENT.from}' → ` +
      `'${SENT_RETIREMENT.to}'${dryRun ? ' (nothing written)' : `, ${updated} rewritten`}. ` +
      `sent_at is untouched, so the dispatch date survives.`
  )
}

// Run if executed directly. Guarded so importing this module — which a test
// does — never opens a connection or rewrites a live database.
if (import.meta.main) {
  // Deferred for the same reason as the one inside retireSentStatus: the pool
  // is a cost of RUNNING the script, never of importing it.
  const shutdown = async (code: number): Promise<never> => {
    const { closeDatabase } = await import('./index')
    await closeDatabase()
    process.exit(code)
  }

  main()
    .then(() => shutdown(0))
    .catch(async (error) => {
      console.error(error)
      await shutdown(1)
    })
}
