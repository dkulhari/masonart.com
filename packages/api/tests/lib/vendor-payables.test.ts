import { describe, it, expect } from 'vitest'
import { sumPayable, type PayableJob } from '../../src/lib/vendor-payables'

const job = (o: Partial<PayableJob>): PayableJob => ({
  id: o.id ?? 'j',
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
