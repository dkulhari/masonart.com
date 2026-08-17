/**
 * The exported search defaults have to satisfy the routes they point at (#626).
 *
 * `/admin/orders` and `/admin/products` declare required search params. A
 * `navigate({ to })` without them pushes a URL that fails the target route's
 * own `validateSearch`, and a throw inside `validateSearch` does not surface as
 * a validation message — the route error-boundaries and the admin gets a blank
 * page. That is what the six TS2345 errors in this cluster were describing, and
 * why the fix is a shared constant rather than an inline object at each call
 * site: an inline object drifts from the schema silently.
 *
 * Same guarantee `vendors-list.test.tsx` already makes for ADMIN_VENDORS_SEARCH.
 */

import { describe, it, expect } from 'vitest'

import { ADMIN_ORDERS_SEARCH, ADMIN_PRODUCTS_SEARCH } from '~/lib/admin-nav'
import { searchParamsSchema as ordersSearchSchema } from '~/routes/admin/orders/index'
import { searchParamsSchema as productsSearchSchema } from '~/routes/admin/products/index'

describe('admin search defaults', () => {
  it('lands /admin/orders on a URL its own schema accepts', () => {
    expect(() => ordersSearchSchema.parse(ADMIN_ORDERS_SEARCH)).not.toThrow()
  })

  it('lands /admin/products on a URL its own schema accepts', () => {
    expect(() => productsSearchSchema.parse(ADMIN_PRODUCTS_SEARCH)).not.toThrow()
  })

  /*
   * router.tsx keeps every search value a string on the way in and stringifies
   * with String(value) on the way out, so the defaults have to survive that
   * round trip too — a number that comes back as "1" must still parse.
   */
  it('survives the router.tsx string round trip', () => {
    const stringified = Object.fromEntries(
      Object.entries(ADMIN_ORDERS_SEARCH).map(([key, value]) => [key, String(value)])
    )

    expect(() => ordersSearchSchema.parse(stringified)).not.toThrow()
    expect(ordersSearchSchema.parse(stringified).page).toBe(1)
  })
})
