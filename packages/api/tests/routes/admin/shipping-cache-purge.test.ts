/**
 * Cache invalidation on admin shipping writes.
 *
 * `deleteCached` issues a Redis `DEL`, which treats `*` as a literal character
 * rather than a glob. `deleteCached("shipping:options:*")` therefore matches
 * nothing: the key actually written is `shipping:options:active`
 * (`routes/shipping.ts:59`), so admin shipping writes left the storefront
 * serving stale options until the TTL lapsed.
 *
 * It failed silently in both directions — a `DEL` that matches no key still
 * resolves successfully, and a test asserting "deleteCached was called" passes
 * against the broken code. So the assertions here are about which helper
 * receives the glob, plus a source scan that catches the whole bug class
 * rather than the three instances we happened to find.
 *
 * Same defect shipped in `admin/products.ts` (#527) and `admin/promotions.ts`
 * (#525). Third occurrence is the reason for the repo-wide guard below.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ADMIN_ROUTES_DIR = join(__dirname, '../../../src/routes/admin')

function sourceOf(file: string): string {
  return readFileSync(join(ADMIN_ROUTES_DIR, file), 'utf8')
}

/**
 * Every `deleteCached(...)` / `deleteCachedPattern(...)` call in a file, as
 * `[helperName, argumentText]`. Deliberately a regex over source rather than a
 * spy: the point is to catch a call site nobody thought to write a test for.
 */
function cacheDeleteCalls(source: string): Array<[string, string]> {
  const calls: Array<[string, string]> = []
  const pattern = /\b(deleteCachedPattern|deleteCached)\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    calls.push([match[1]!, match[2]!])
  }
  return calls
}

describe('admin shipping cache invalidation', () => {
  const source = sourceOf('shipping.ts')

  it('purges the options list with the glob-aware helper', () => {
    const globCalls = cacheDeleteCalls(source).filter(([, arg]) =>
      arg.includes('options:*')
    )

    expect(globCalls.length).toBeGreaterThan(0)
    for (const [helper] of globCalls) {
      expect(helper).toBe('deleteCachedPattern')
    }
  })

  it('still deletes the single-option key exactly, not by pattern', () => {
    // `shipping:option:<id>` is a real, complete key. Sending it through a
    // SCAN would be wasteful and would match `option:<id>` prefixes of any
    // future key that happens to extend it.
    const exactCalls = cacheDeleteCalls(source).filter(
      ([, arg]) => arg.includes('option:${optionId}')
    )

    expect(exactCalls.length).toBeGreaterThan(0)
    for (const [helper] of exactCalls) {
      expect(helper).toBe('deleteCached')
    }
  })

  it('purges the list on create, update and delete', () => {
    const globCalls = cacheDeleteCalls(source).filter(([, arg]) =>
      arg.includes('options:*')
    )
    expect(globCalls).toHaveLength(3)
  })
})

describe('no admin route sends a glob to an exact-key delete', () => {
  // The guard that generalises #525, #527 and this fix. A wildcard handed to
  // `deleteCached` is always a no-op, and always a silent one.
  const files = readdirSync(ADMIN_ROUTES_DIR).filter((f) => f.endsWith('.ts'))

  it.each(files)('%s', (file) => {
    const offenders = cacheDeleteCalls(sourceOf(file))
      .filter(([helper, arg]) => helper === 'deleteCached' && arg.includes('*'))
      .map(([, arg]) => arg)

    expect(offenders).toEqual([])
  })
})
