/**
 * /admin/customers — the gallery-member filter and the consented export (#442).
 *
 * Two things are pinned here, and they fail in opposite ways.
 *
 * 1. **The search-param coercion.** `app/router.tsx` overrides TanStack's
 *    serialization: every param comes back a string, and `stringifySearch`
 *    writes `String(value)`. A schema that mishandles that does not throw
 *    something legible — `validateSearch` throws, the route hits its error
 *    boundary, and the admin gets a blank page. So the parse is exercised
 *    directly, including the string `'false'`, which is truthy in JavaScript
 *    and is exactly what a `z.coerce.boolean()` would get wrong.
 *
 * 2. **The export is the server's decision.** The page may narrow the file by
 *    passing its filters, and it may not widen it: consent is enforced in the
 *    handler, not here. What this checks is that the page never invents its
 *    own gate and never asks the list endpoint for the download.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseCustomerSearch } from '~/routes/admin/customers'

const src = readFileSync(
  join(process.cwd(), 'app/routes/admin/customers.tsx'),
  'utf8'
)

describe('gallery filter search params', () => {
  it("reads the string 'true' as the boolean true", () => {
    expect(parseCustomerSearch({ galleryMember: 'true' }).galleryMember).toBe(
      true
    )
  })

  it("reads the string 'false' as the boolean false, not true", () => {
    // The whole reason this schema is hand-written. `z.coerce.boolean()`
    // returns true for every non-empty string, so "Not members" would list
    // members and nothing would look broken until someone counted.
    expect(parseCustomerSearch({ galleryMember: 'false' }).galleryMember).toBe(
      false
    )
  })

  it('leaves the filter off when the param is absent', () => {
    expect(parseCustomerSearch({}).galleryMember).toBeUndefined()
  })

  it('round-trips a real boolean, which is what navigate() passes in', () => {
    // updateSearch hands the schema `{ galleryMember: false }` before the
    // router ever stringifies it, so both shapes have to land the same way.
    expect(parseCustomerSearch({ galleryMember: false }).galleryMember).toBe(
      false
    )
    expect(parseCustomerSearch({ galleryMember: true }).galleryMember).toBe(
      true
    )
  })

  it('ignores a junk value instead of blanking the route', () => {
    // A throw here is not a validation error the user ever sees — it is an
    // error boundary and an empty screen.
    expect(() => parseCustomerSearch({ galleryMember: 'maybe' })).not.toThrow()
    expect(
      parseCustomerSearch({ galleryMember: 'maybe' }).galleryMember
    ).toBeUndefined()
  })

  it('still parses the rest of the params alongside it', () => {
    const parsed = parseCustomerSearch({
      galleryMember: 'true',
      page: '3',
      role: 'admin,trade',
      status: 'active',
    })

    expect(parsed).toMatchObject({
      galleryMember: true,
      page: 3,
      role: ['admin', 'trade'],
      status: 'active',
    })
  })
})

describe('the export button', () => {
  it('downloads from the export endpoint, not the list one', () => {
    expect(src).toContain('/api/admin/customers/export')
  })

  it('sends credentials, or the download is a 401', () => {
    expect(src).toMatch(
      /customers\/export[\s\S]{0,200}credentials: 'include'/
    )
  })

  it('passes the current filters so the file matches the screen', () => {
    expect(src).toMatch(
      /customers\/export\?\$\{buildCustomerQuery\(params\)\}/
    )
  })

  it('does not decide for itself who consented', () => {
    // Any client-side consent test would drift from the handler's rule. The
    // page filters nothing; it renders what the server sent.
    expect(src).not.toMatch(/filter\([^)]*marketingConsentAt/)
  })
})

describe('the gallery column', () => {
  it('distinguishes a member from a member with no consent stamp', () => {
    // The unconsented member is invisible in the export by design, so the
    // list is the only place anyone finds out the row exists.
    expect(src).toContain('No consent')
    expect(src).toMatch(/marketingConsentAt/)
  })

  it('shows where the join came from', () => {
    // #446 made joinSource accurate per surface; showing it is what makes a
    // rail join distinguishable from a banner one without opening the CSV.
    expect(src).toContain('joinSource')
  })
})
