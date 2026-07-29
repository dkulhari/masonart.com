/**
 * Staff area navigation entry point tests (#362)
 *
 * The customer header and the admin chrome both need the same answer to
 * "where does this user's staff area start, and what do we call it?".
 * Content managers have no dashboard — /admin only bounces them to the
 * products list — so their entry has to point straight there.
 */

import { describe, it, expect } from 'vitest'
import { staffAreaLabel, staffAreaHref } from '../../app/lib/admin-nav'

describe('staff area entry point', () => {
  it('labels the entry "Manage Content" for content managers', () => {
    expect(staffAreaLabel('content-manager')).toBe('Manage Content')
  })

  it('sends content managers straight to the products list', () => {
    expect(staffAreaHref('content-manager')).toBe('/admin/products')
  })

  it('labels the entry "Manage Store" for admins and super-admins', () => {
    expect(staffAreaLabel('admin')).toBe('Manage Store')
    expect(staffAreaLabel('super-admin')).toBe('Manage Store')
    expect(staffAreaHref('admin')).toBe('/admin')
    expect(staffAreaHref('super-admin')).toBe('/admin')
  })

  it('shows nothing for customers, trade users and signed-out visitors', () => {
    expect(staffAreaLabel('customer')).toBeNull()
    expect(staffAreaLabel('trade')).toBeNull()
    expect(staffAreaLabel(undefined)).toBeNull()
    expect(staffAreaHref('customer')).toBeNull()
    expect(staffAreaHref(undefined)).toBeNull()
  })

  it('matches roles case-insensitively, like the admin route guard', () => {
    expect(staffAreaLabel('Content-Manager')).toBe('Manage Content')
    expect(staffAreaHref('SUPER-ADMIN')).toBe('/admin')
  })
})
