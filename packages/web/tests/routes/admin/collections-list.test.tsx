/**
 * /admin/collections — the list.
 *
 * Source-level, like Header.structure.test.tsx: the route calls TanStack hooks
 * and fetches, so what is worth pinning is the contract rather than the
 * rendering. Three things matter here and each has a specific failure:
 *
 * 1. **Reordering posts the whole list.** Per-row PATCH would make position
 *    arithmetic the client's problem, and the endpoint (#468) only accepts the
 *    full ordered array anyway.
 * 2. **Counts are shown.** A rule that matches nothing is the failure worth
 *    catching in the admin, not on the storefront.
 * 3. **Delete confirms.** A collection is cheap to rebuild but its manual
 *    membership is not — the cascade takes the curation with it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(
  join(process.cwd(), 'app/routes/admin/collections/index.tsx'),
  'utf8'
)

const sidebar = readFileSync(
  join(process.cwd(), 'app/components/admin/AdminSidebar.tsx'),
  'utf8'
)

describe('the list', () => {
  it('reads from the admin endpoint, not the public one', () => {
    // The public list hides inactive collections; an admin who deactivated
    // one still has to find it again.
    expect(src).toContain('/api/admin/collections')
  })

  it('sends credentials, or every request is a 401', () => {
    expect(src).toContain("credentials: 'include'")
  })

  it('shows what each collection currently resolves to', () => {
    expect(src).toMatch(/count/)
  })

  it('distinguishes the two membership kinds', () => {
    expect(src).toMatch(/manual/)
    expect(src).toMatch(/rule/)
  })

  it('surfaces inactive and in-discover state', () => {
    expect(src).toMatch(/isActive/)
    expect(src).toMatch(/showInDiscover/)
  })
})

describe('reordering the rail', () => {
  it('posts the whole ordered list to the transactional endpoint', () => {
    // #468 rewrites every row in one transaction precisely so the rail is
    // never observable half-reordered. A per-row call would defeat that.
    expect(src).toContain('discover-order')
    expect(src).toContain('collectionIds')
  })

  it('uses PUT, matching the replace semantics', () => {
    expect(src).toMatch(/method:\s*'PUT'/)
  })
})

describe('destructive actions', () => {
  it('confirms before deleting', () => {
    // DELETE cascades collection_products — the curation goes with it.
    expect(src).toMatch(/confirm/i)
  })
})

describe('the empty state', () => {
  it('points at creating one rather than rendering a headless table', () => {
    expect(src).toMatch(/No collections|Create your first|new/i)
  })
})

describe('navigation', () => {
  it('is reachable from the admin sidebar', () => {
    // The entry already existed and pointed at a route that did not — this
    // ticket is what makes the link land somewhere.
    expect(sidebar).toContain("'/admin/collections'")
  })
})
