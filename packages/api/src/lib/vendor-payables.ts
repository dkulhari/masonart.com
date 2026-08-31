/**
 * Payables Derivation
 *
 * owed = SUM(COALESCE(amountActual, amountExpected)) over jobs with no
 * settlement. DERIVED, never stored — there is no balance column, so there is
 * no parallel ledger to drift out of sync with the jobs.
 *
 * Sums in integer paise and formats back to a decimal(10,2) string. The values
 * are stored as decimal precisely so they are exact; adding them as JS floats
 * would give that away at the last step for no reason (0.1 + 0.1 + 0.1).
 *
 * ## Two rules, deliberately separate
 *
 * 1. **The amount rule** — what one job is worth. `jobPayableAmount`.
 * 2. **The outstanding rule** — whether we still owe it. `isJobPayable`, which
 *    is the amount rule plus `settlement_id IS NULL`.
 *
 * They are separate because the admin production queue prints an amount against
 * SETTLED rows, where the second question has already been answered.
 *
 * ## The cancellation rule (#695)
 *
 * > On a cancelled job, `amount_expected` is not a payable. Only an
 * > `amount_actual` an admin explicitly stated is.
 *
 * `amount_expected` is what the rate card said the work WOULD cost.
 * `amount_actual` is what a human said we owe. Reading the first as the second
 * strands a phantom: an amount the vendor sees in their own portal, forever,
 * that nobody agreed to and no screen can clear.
 *
 * Note what the rule is NOT: `status <> 'cancelled'`. Design §10.6 says a
 * cancelled job at `'0.00'` "contributes zero and still renders as a line",
 * which means a cancelled job at `'250.00'` contributes 250 — a kill fee for
 * work the vendor really did. Dropping every cancelled row would delete those
 * silently, which is the same bug pointing the other way. It also mirrors
 * `routes/admin/transfers.ts`: a lost parcel leaves the original job's payable
 * intact, because we owe for the work, not for the parcel.
 *
 * ## One owner
 *
 * The predicate lives here in BOTH forms — `isJobPayable` for rows already in
 * memory and `payableJobsCondition()` for the WHERE — because four call sites
 * each re-typing `isNull(settlementId)` is precisely how three of them ended up
 * without the status half. Anything summing vendor money uses this module or it
 * is a second ledger.
 */

import { and, isNotNull, isNull, ne, or, type SQL } from 'drizzle-orm'

import { productionJobs } from '../database/schema/production-jobs'

export interface PayableJob {
  id: string
  /**
   * Required, not optional. An optional field would let a new call site forget
   * it and silently get the old, wrong answer — which is how this bug reached
   * four queries.
   */
  status: string
  amountExpected: string | null
  amountActual: string | null
  settlementId: string | null
}

function toPaise(value: string | null): number {
  if (!value) return 0
  const n = Math.round(Number(value) * 100)
  return Number.isFinite(n) ? n : 0
}

function fromPaise(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Adds decimal(10,2) rupee strings exactly, in integer paise.
 *
 * Split out from `sumPayable` because pricing a job at assignment needs the
 * arithmetic and none of the payable rules — it was building throwaway
 * `PayableJob` shapes to borrow the adder, which made the rules look optional.
 */
export function sumRupees(values: Array<string | null | undefined>): string {
  return fromPaise(values.reduce<number>((acc, v) => acc + toPaise(v ?? null), 0))
}

/**
 * The amount owed on one job: the override if there is one, else the
 * expectation — except on a cancelled job, where the expectation is not an
 * amount anybody agreed to and only the override counts.
 */
export function jobPayableAmount(job: PayableJob): string {
  if (job.status === 'cancelled') return fromPaise(toPaise(job.amountActual))
  return fromPaise(toPaise(job.amountActual ?? job.amountExpected))
}

/** Whether this job is still money we owe: unsettled, and worth something we agreed to. */
export function isJobPayable(job: PayableJob): boolean {
  if (job.settlementId != null) return false
  return job.status !== 'cancelled' || job.amountActual != null
}

/**
 * The SQL twin of `isJobPayable`, for the WHERE.
 *
 * Vendor scoping stays at the call site — this is the payable predicate, not a
 * whole query. `'cancelled'` is an existing enum value used from application
 * code and parameterised by drizzle; the no-enum-literal-in-migrations rule is
 * about migration SQL and does not reach here.
 */
export function payableJobsCondition(): SQL {
  return and(
    isNull(productionJobs.settlementId),
    or(ne(productionJobs.status, 'cancelled'), isNotNull(productionJobs.amountActual))
  ) as SQL
}

export function sumPayable(jobs: PayableJob[]): string {
  return sumRupees(jobs.filter(isJobPayable).map(jobPayableAmount))
}
