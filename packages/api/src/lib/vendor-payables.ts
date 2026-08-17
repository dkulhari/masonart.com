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
 */

export interface PayableJob {
  id: string
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

/** The amount owed on one job: the override if there is one, else the expectation. */
export function jobPayableAmount(job: PayableJob): string {
  return fromPaise(toPaise(job.amountActual ?? job.amountExpected))
}

export function sumPayable(jobs: PayableJob[]): string {
  const total = jobs
    .filter((j) => j.settlementId == null)
    .reduce((acc, j) => acc + toPaise(j.amountActual ?? j.amountExpected), 0)
  return fromPaise(total)
}
