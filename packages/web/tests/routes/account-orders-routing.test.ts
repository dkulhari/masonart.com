/**
 * Route-shape guard for the order pages — #493.
 *
 * TanStack's flat file routing makes `orders.tsx` the PARENT of
 * `orders.$id.tsx`, not its sibling. `orders.tsx` was written as a leaf (the
 * order history list) and rendered no `<Outlet />`, so every `/account/orders/
 * <id>` URL mounted the LIST and the detail component never ran. The same trap
 * caught `orders.$id.return.tsx` one level down, under `orders.$id.tsx`.
 *
 * The consequence was not cosmetic: the order detail page is the only mount
 * point of `ReviewModal`, so the entire customer review-writing flow had no
 * reachable entry point in the app.
 *
 * Source-level like the other route tests here — these modules call
 * `createFileRoute` at module scope and cannot be imported into jsdom without
 * a router. The generated tree is the honest record of the nesting the
 * generator actually produced, so that is what gets read.
 *
 * The first test is deliberately general: ANY route the generator hands
 * children to must render an `<Outlet />`, not just these two. That is the
 * class of bug, and it is silent every time.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const appDir = join(process.cwd(), 'app')
const routeTree = readFileSync(join(appDir, 'routeTree.gen.ts'), 'utf8')

/** `import { Route as XRouteImport } from './routes/a/b'` → XRoute → file */
function importedRouteFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const pattern =
    /import\s*\{\s*Route as (\w+)Import\s*\}\s*from\s*'\.\/(routes\/[^']+)'/g
  for (const match of routeTree.matchAll(pattern)) {
    files.set(match[1], match[2])
  }
  return files
}

/** `const XRoute = XRouteImport.update({ ... getParentRoute: () => YRoute })` */
function parentOfEachRoute(): Map<string, string> {
  const parents = new Map<string, string>()
  const pattern = /const (\w+) =\s*\1Import\.update\(\{([\s\S]*?)\}\s*as any\)/g
  for (const match of routeTree.matchAll(pattern)) {
    const parent = /getParentRoute:\s*\(\)\s*=>\s*(\w+)/.exec(match[2])
    if (parent) parents.set(match[1], parent[1])
  }
  return parents
}

const routeFiles = importedRouteFiles()
const parents = parentOfEachRoute()

function sourceOf(routeVar: string): string {
  const file = routeFiles.get(routeVar)
  if (!file) throw new Error(`no source file mapped for ${routeVar}`)
  // The generator imports extensionless; the files are .tsx.
  return readFileSync(join(appDir, `${file}.tsx`), 'utf8')
}

describe('generated route tree', () => {
  it('parses — the guards below are only worth anything if it did', () => {
    expect(routeFiles.size).toBeGreaterThan(20)
    expect(parents.size).toBeGreaterThan(20)
    expect(parents.get('AuthedAccountOrdersIdIndexRoute')).toBeDefined()
  })

  it('gives children only to routes that render an <Outlet />', () => {
    // rootRouteImport is imported under a different shape and is a layout by
    // construction; every other parent is a route module we can read.
    const parentVars = [...new Set(parents.values())].filter((v) =>
      routeFiles.has(v)
    )
    expect(parentVars.length).toBeGreaterThan(0)

    const swallowing = parentVars.filter((v) => !sourceOf(v).includes('<Outlet'))
    expect(
      swallowing,
      `these routes are parents in the generated tree but render no <Outlet />, ` +
        `so every child URL under them renders the parent instead: ` +
        swallowing.map((v) => routeFiles.get(v)).join(', ')
    ).toEqual([])
  })
})

describe('/account/orders/$id', () => {
  it('is not nested under the order history list', () => {
    // The list is a leaf page. If it is ever the parent of $id again, the
    // detail page stops rendering — which is exactly #493.
    expect(parents.get('AuthedAccountOrdersIdIndexRoute')).not.toBe(
      'AuthedAccountOrdersRoute'
    )
  })

  it('renders the order detail module, not the list module', () => {
    const detailFile = routeFiles.get('AuthedAccountOrdersIdIndexRoute')
    expect(detailFile).toBe('routes/_authed/account/orders.$id.index')

    const detail = sourceOf('AuthedAccountOrdersIdIndexRoute')
    expect(detail).toContain("createFileRoute('/_authed/account/orders/$id/')")
    // Detail content, and the thing #493 made unreachable.
    expect(detail).toContain('ReviewModal')
    expect(detail).toContain('Order Details')
    // ...and none of the list's content.
    expect(detail).not.toContain('OrderList')
    expect(detail).not.toContain('Order History')
  })

  it('keeps the return flow reachable one level further down', () => {
    expect(parents.get('AuthedAccountOrdersIdReturnRoute')).not.toBe(
      'AuthedAccountOrdersIdIndexRoute'
    )
    const returnFile = routeFiles.get('AuthedAccountOrdersIdReturnRoute')
    expect(returnFile).toBe('routes/_authed/account/orders.$id.return')
    expect(routeTree).toContain("'/account/orders/$id/return'")
  })
})

describe('/account/orders', () => {
  it('serves the history list from the index route', () => {
    const listPath = join(appDir, 'routes/_authed/account/orders.index.tsx')
    expect(existsSync(listPath)).toBe(true)

    const list = readFileSync(listPath, 'utf8')
    expect(list).toContain("createFileRoute('/_authed/account/orders/')")
    expect(list).toContain('OrderList')
    expect(list).toContain('Order History')
  })

  it('no longer has a leaf orders.tsx masquerading as a layout', () => {
    expect(
      existsSync(join(appDir, 'routes/_authed/account/orders.tsx'))
    ).toBe(false)
  })

  it('still resolves as a link target for every page that points at it', () => {
    // `to="/account/orders"` must keep type-checking and matching after the
    // index move — the generated `FileRoutesByTo` is what those links resolve
    // against.
    expect(routeTree).toContain("'/account/orders': typeof AuthedAccountOrdersIndexRoute")
  })
})
