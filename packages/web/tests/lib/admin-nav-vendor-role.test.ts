import { describe, it, expect } from 'vitest'
import {
  staffAreaLabel,
  staffAreaHref,
  isContentManagerPathAllowed,
} from '~/lib/admin-nav'

/**
 * Adding `vendor` to the role enum grants nothing. These two guards are
 * expected to be correct as written — the design says confirm by test rather
 * than assume, because everything in the vendor portal rests on them.
 */
describe('vendor role against the existing staff guards', () => {
  it('renders no staff entry point for a vendor', () => {
    expect(staffAreaLabel('vendor')).toBeNull()
    expect(staffAreaHref('vendor')).toBeNull()
  })

  it('does not treat vendor admin paths as content-manager territory', () => {
    // Payables and vendor cost are admin data. content-manager must not reach them.
    expect(isContentManagerPathAllowed('/admin/vendors')).toBe(false)
    expect(isContentManagerPathAllowed('/admin/vendors/abc')).toBe(false)
    expect(isContentManagerPathAllowed('/admin/production')).toBe(false)
  })
})
