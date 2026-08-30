import { describe, it, expect } from 'vitest'
import {
  isJobPayable,
  jobPayableAmount,
  sumPayable,
  sumRupees,
  type PayableJob,
} from '../../src/lib/vendor-payables'

const job = (o: Partial<PayableJob>): PayableJob => ({
  id: o.id ?? 'j',
  status: o.status ?? 'received',
  // `?? '100.00'` would resurrect an explicitly-null amountExpected, so the
  // "neither amount" case could never be constructed. Default only when absent.
  amountExpected: o.amountExpected === undefined ? '100.00' : o.amountExpected,
  amountActual: o.amountActual ?? null,
  settlementId: o.settlementId ?? null,
})

describe('sumPayable', () => {
  it('prefers the actual amount over the expected one', () => {
    expect(sumPayable([job({ amountExpected: '100.00', amountActual: '90.00' })])).toBe('90.00')
  })

  it('falls back to expected when there is no override', () => {
    expect(sumPayable([job({ amountExpected: '100.00', amountActual: null })])).toBe('100.00')
  })

  it('counts only unsettled jobs', () => {
    expect(
      sumPayable([job({ id: 'a' }), job({ id: 'b', settlementId: 's1' })])
    ).toBe('100.00')
  })

  it('stays exact on values a float would round — money is decimal(10,2), not a double', () => {
    const jobs = Array.from({ length: 3 }, (_, i) => job({ id: String(i), amountExpected: '0.10' }))
    expect(sumPayable(jobs)).toBe('0.30')
  })

  it('treats a job with neither amount as zero rather than NaN', () => {
    expect(sumPayable([job({ amountExpected: null, amountActual: null })])).toBe('0.00')
  })

  it('is 0.00 for no jobs', () => {
    expect(sumPayable([])).toBe('0.00')
  })
})

// ============================================================================
// #695 — the cancellation rule
// ============================================================================

/**
 * The rule under test, stated once:
 *
 * > On a CANCELLED job, `amount_expected` is not a payable. Only an
 * > `amount_actual` an admin explicitly stated is.
 *
 * `amount_expected` is what the rate card said the work WOULD cost;
 * `amount_actual` is what a human said we owe. Reading the first as the second
 * is the phantom — an amount the vendor sees in their own portal, forever, that
 * nobody ever agreed to and no screen can clear.
 *
 * Note what this is NOT: `status <> 'cancelled'`. Design §10.6 says a cancelled
 * job at `'0.00'` "contributes zero and still renders as a line", which means a
 * cancelled job at `'250.00'` contributes 250 — the kill fee for work the vendor
 * actually did. Excluding every cancelled row would delete those silently.
 */
describe('isJobPayable — the cancellation rule (#695)', () => {
  it('drops a cancelled job carrying only a rate-card expectation: the phantom', () => {
    const phantom = job({ status: 'cancelled', amountExpected: '500.00', amountActual: null })
    expect(isJobPayable(phantom)).toBe(false)
    expect(sumPayable([phantom])).toBe('0.00')
  })

  it('KEEPS a cancelled job with a kill fee an admin stated', () => {
    // Cancelled from a later status: the vendor did the work, and someone
    // agreed what we owe for it. Preserved, per §5 and the transfers precedent.
    const killFee = job({ status: 'cancelled', amountExpected: '900.00', amountActual: '250.00' })
    expect(isJobPayable(killFee)).toBe(true)
    expect(sumPayable([killFee])).toBe('250.00')
  })

  it('keeps a cancelled job explicitly zeroed, so it renders as a line (§10.6)', () => {
    // '0.00' is a STATEMENT — "we owe you nothing for this" — and a vendor can
    // see it and understand it. An absent row and an unexplained row are the
    // same support call; a zero next to the word "cancelled" is neither.
    const zeroed = job({ status: 'cancelled', amountExpected: '700.00', amountActual: '0.00' })
    expect(isJobPayable(zeroed)).toBe(true)
    expect(sumPayable([zeroed])).toBe('0.00')
  })

  it('leaves every non-cancelled status alone, including the terminal one', () => {
    // `dispatched` is terminal and its payable survives a lost transfer:
    // routes/admin/transfers.ts owes the vendor for work they did, whatever
    // happened to the parcel afterwards.
    for (const status of ['draft', 'assigned', 'received', 'qc_submitted', 'qc_failed', 'qc_passed', 'dispatched']) {
      expect(isJobPayable(job({ status }))).toBe(true)
    }
  })

  it('a cancelled job is never payable once settled either', () => {
    expect(
      isJobPayable(job({ status: 'cancelled', amountActual: '250.00', settlementId: 's1' }))
    ).toBe(false)
  })

  it('sums a mixed ledger to the agreed amounts only', () => {
    expect(
      sumPayable([
        job({ id: 'live', amountExpected: '400.00' }),
        job({ id: 'phantom', status: 'cancelled', amountExpected: '500.00' }),
        job({ id: 'killfee', status: 'cancelled', amountExpected: '900.00', amountActual: '250.00' }),
        job({ id: 'zeroed', status: 'cancelled', amountExpected: '700.00', amountActual: '0.00' }),
        job({ id: 'settled', amountExpected: '4000.00', settlementId: 's1' }),
      ])
    ).toBe('650.00')
  })
})

describe('jobPayableAmount — the amount rule alone', () => {
  it('is 0.00 for a cancelled job with nothing stated, not the expectation', () => {
    expect(
      jobPayableAmount(job({ status: 'cancelled', amountExpected: '500.00', amountActual: null }))
    ).toBe('0.00')
  })

  it('is the stated amount for a cancelled job that has one', () => {
    expect(
      jobPayableAmount(job({ status: 'cancelled', amountExpected: '900.00', amountActual: '250.00' }))
    ).toBe('250.00')
  })

  it('still answers for a SETTLED job — settlement is a different question', () => {
    // This one is worth what it is worth; whether it is still outstanding is
    // `isJobPayable`'s question, not this function's. The admin production
    // queue prints this against settled rows.
    expect(jobPayableAmount(job({ amountExpected: '100.00', settlementId: 's1' }))).toBe('100.00')
  })
})

describe('sumRupees', () => {
  it('adds decimal strings in paise, ignoring nulls', () => {
    expect(sumRupees(['0.10', '0.10', '0.10', null])).toBe('0.30')
  })

  it('is 0.00 for nothing', () => {
    expect(sumRupees([])).toBe('0.00')
  })
})
