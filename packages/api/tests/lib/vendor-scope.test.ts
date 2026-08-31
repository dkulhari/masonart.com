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
    // Artwork resolves to a storage KEY, never a URL, but it is a read of
    // job-linked data like any other and refuses without a vendorId like any
    // other.
    'getVendorJobArtwork',
    // The carrier label — the ONE object on this boundary that carries customer
    // data, so an unscoped call to it is the worst one available. Added by
    // #678, which shipped it without enrolling it here and left this suite red.
    'getVendorJobLabelKey',
    // The transition. Enrolled here for the same reason as the reads: an
    // unscoped write is worse than an unscoped read, not exempt from the rule.
    'updateVendorJob',
    // QC photographs (#685) — one read and three writes. The upload authoriser
    // is here because a wrong answer from it is what gets a signed URL minted
    // for somebody else's job, and a signature that is generated and then
    // withheld has still been generated.
    'listVendorJobPhotos',
    'assertVendorMayUploadQcPhoto',
    'recordVendorQcPhoto',
    'retractVendorQcPhoto',
    // Inter-vendor transfers (#686) — two reads and two writes. Both writes are
    // one END of a leg: a transfer is created only by `from_vendor_id` and
    // received only by `to_vendor_id`, and the vendorId argument is which end
    // the caller is. An unscoped call here would hand a vendor somebody else's
    // parcel, which is the boundary the whole feature turns on.
    'listVendorTransfers',
    'getVendorTransfer',
    'createVendorTransfer',
    'markVendorTransferReceived',
    // What could go on a parcel, grouped per order. It groups BY `order_id`, so
    // an unscoped call would group another vendor's work into buckets and hand
    // back stable handles on it — the leak this whole boundary is drawn against.
    'listVendorTransferCandidates',
  ] as const

  /**
   * The exceptions: exported functions that touch no vendor data at all.
   *
   * Written down because the check below is now a "everything is accounted
   * for" test rather than a name-pattern one. `objectKeyForScope` is pure — a
   * string and a scope name in, a string or null out — and takes no vendorId
   * because there is no row for one to scope.
   */
  const pureHelpers = ['objectKeyForScope'] as const

  /**
   * Exported ERROR TYPES. `typeof` a class is `'function'`, so they land in the
   * account below and have to be named — which is the right outcome: an error
   * this module exports is part of its contract, and a route that catches it
   * behaves differently because of it.
   *
   * Empty since #704. This module used to export `LabelSeamNotReady`, thrown by
   * `getVendorJobLabelKey` when `order_shipments.label_object_token` did not
   * exist, so `routes/vendor.ts` could answer a fixed 503 instead of echoing
   * the driver. The column landed in #703 and both the class and the catch went
   * with it — every failure that read produces is now real and travels.
   *
   * The array stays rather than being deleted: the next error type this module
   * exports has a documented place to be declared, and the account below reads
   * the same whether it is empty or not.
   */
  const errorTypes = [] as const

  /** Every function this module actually exports, read off the module. */
  const exportedFunctions = (): string[] =>
    Object.keys(scope).filter((k) => typeof (scope as any)[k] === 'function')

  /**
   * The names no vocabulary above accounts for.
   *
   * Factored out so the account and its not-vacuous guard share ONE
   * implementation. They used to be two: the guard declared its own three-name
   * array and filtered that, so it never touched `scope` at all and passed with
   * `lib/vendor-scope.ts` deleted — a vacuity guard that was itself vacuous.
   */
  const unaccounted = (names: readonly string[]): string[] =>
    names.filter(
      (k) =>
        !scopedFns.includes(k as never) &&
        !pureHelpers.includes(k as never) &&
        !errorTypes.includes(k as never)
    )

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

  it('exposes no function that reads or writes vendor data without scoping', () => {
    // EVERY exported function is either enrolled above — and therefore proved
    // to refuse a falsy vendorId — or named as a pure helper. It used to test a
    // NAME PATTERN, `/^(list|get|find|query)/`, which is a filter and not an
    // account: `updateVendorJob` never matched it, and neither would
    // `recordVendorQcPhoto`, so the writes this module exposes were exactly the
    // ones it could not see. An unlisted function was not judged unscoped; it
    // was not examined.
    expect(unaccounted(exportedFunctions())).toEqual([])
  })

  it('the account is not vacuous — a helper that forgot to scope would show up', () => {
    // Same guard the isolation suite carries on every allow-list it owns, and
    // it is bound to the REAL export list rather than to a literal beside it.
    // It used to filter a three-name array declared on the line above, which
    // meant it passed with `lib/vendor-scope.ts` deleted: the guard against a
    // vacuous account was itself the vacuous test.
    const exported = exportedFunctions()
    expect(exported, 'the module exported nothing — the account is empty').toContain(
      'listVendorJobs'
    )
    expect(exported).toContain('objectKeyForScope')

    // The real list, plus one name nobody enrolled. Exactly one finding: the
    // planted one — which is both halves at once, that the filter SEES an
    // unenrolled export and that everything really exported is accounted for.
    expect(unaccounted([...exported, 'listVendorInvoicesSomeday'])).toEqual([
      'listVendorInvoicesSomeday',
    ])
  })
})
