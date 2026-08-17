import { describe, it, expect } from 'vitest'
import * as scope from '../../src/lib/vendor-scope'

/**
 * The load-bearing test in this feature. Not "does the happy path filter" —
 * that is easy to get right once. This asserts that an UNSCOPED call is not
 * expressible: every exported query refuses without a vendorId rather than
 * quietly returning everything.
 */
describe('vendor-scope module contract', () => {
  // Every read the module exports. Adding a function here is not a formality:
  // it enrols that function in the refusal assertions below, so the list can
  // only ever grow with functions that provably reject a falsy vendorId.
  const scopedFns = [
    'listVendorJobs',
    'getVendorJob',
    'listVendorRates',
    'listVendorSettlements',
    'getVendorPayableTotal',
    'getVendorJobItems',
    'getVendorJobReviews',
    // The one mutation. Enrolled here for the same reason as the reads: an
    // unscoped write is worse than an unscoped read, not exempt from the rule.
    'updateVendorJob',
  ] as const

  it('exports every vendor-facing query', () => {
    for (const fn of scopedFns) {
      expect(typeof (scope as any)[fn], `${fn} missing`).toBe('function')
    }
  })

  it.each(scopedFns)('%s refuses to run without a vendorId', async (fn) => {
    // Empty string, undefined and null are all "no vendor" — none may be
    // treated as "all vendors".
    await expect((scope as any)[fn]('')).rejects.toThrow(/vendorId/i)
    await expect((scope as any)[fn](undefined)).rejects.toThrow(/vendorId/i)
    await expect((scope as any)[fn](null)).rejects.toThrow(/vendorId/i)
  })

  it('exposes no function that reads vendor data without scoping', () => {
    // Anything exported that queries must take vendorId first. A future
    // convenience helper that forgets is what this catches.
    const exported = Object.keys(scope).filter((k) => typeof (scope as any)[k] === 'function')
    const unscoped = exported.filter(
      (k) => !scopedFns.includes(k as any) && /^(list|get|find|query)/.test(k)
    )
    expect(unscoped).toEqual([])
  })
})
