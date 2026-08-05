/**
 * The wishlist route.
 *
 * Source-level, like home-tokens.test.ts and posters-header.test.ts and for
 * the same reason: the route module calls `createFileRoute` at module scope
 * and cannot be imported into jsdom without a router. The rendering behaviour
 * is covered where it lives, in WishlistContents.test.tsx.
 *
 * What matters here is placement: the page must stay OUT of `_authed`. Saving
 * needs no account (#477), so a guard would bounce a guest to login and hide
 * the list they just built.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const routePath = join(process.cwd(), 'app/routes/wishlist.tsx')
const src = readFileSync(routePath, 'utf8')

describe('the wishlist route', () => {
  it('sits at /wishlist, not under the authenticated layout', () => {
    expect(src).toContain("createFileRoute('/wishlist')")
    expect(
      existsSync(join(process.cwd(), 'app/routes/_authed/account/wishlist.tsx'))
    ).toBe(false)
  })

  it('has no auth guard of its own either', () => {
    // `_authed` is not the only way to lock a page out; a beforeLoad redirect
    // would do the same damage.
    expect(src).not.toContain('beforeLoad')
    expect(src).not.toContain('/auth/login')
  })

  it('delegates its contents to the tested component', () => {
    expect(src).toContain("from '~/components/wishlist/WishlistContents'")
  })

  it('is noindex — the content is per-visitor', () => {
    expect(src).toMatch(/name: 'robots', content: 'noindex'/)
  })

  it('is registered in the generated route tree', () => {
    const tree = readFileSync(join(process.cwd(), 'app/routeTree.gen.ts'), 'utf8')
    expect(tree).toContain("'/wishlist'")
  })
})
