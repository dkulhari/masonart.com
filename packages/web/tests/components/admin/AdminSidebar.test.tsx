/**
 * Admin chrome return-path tests (#362)
 *
 * Staff reported no obvious way back to the customer site once inside
 * /admin. The way out has to survive both a collapsed sidebar (icon only,
 * so the accessible name has to come from somewhere other than the label)
 * and mobile widths, where the sidebar is off-canvas entirely and
 * MobileAdminHeader is the only chrome on screen.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ state: { location: { pathname: '/admin/products' } } }),
}))

vi.mock('~/lib/auth-client', () => ({
  signOut: vi.fn(),
}))

import {
  AdminSidebar,
  MobileAdminHeader,
  NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
} from '~/components/admin/AdminSidebar'

const contentManager = {
  name: 'Cara Manager',
  email: 'test-content-manager@chobii.art',
  role: 'content-manager',
}

const admin = {
  name: 'Ada Admin',
  email: 'admin@chobii.art',
  role: 'admin',
}

describe('AdminSidebar return path', () => {
  it('offers a way back to the store when expanded', () => {
    render(<AdminSidebar user={admin} collapsed={false} />)

    const link = screen.getByRole('link', { name: /view store/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('keeps the way back reachable and named when collapsed', () => {
    render(<AdminSidebar user={admin} collapsed={true} />)

    // Label text is hidden at 72px wide, so the accessible name has to
    // survive on the element itself.
    const link = screen.getByRole('link', { name: /view store/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('offers the way back to content managers too', () => {
    render(<AdminSidebar user={contentManager} collapsed={false} />)

    expect(screen.getByRole('link', { name: /view store/i })).toHaveAttribute(
      'href',
      '/'
    )
  })
})

describe('AdminSidebar photo approvals entry (#605)', () => {
  it('links admins to the photo approvals queue', () => {
    render(<AdminSidebar user={admin} collapsed={false} />)

    expect(screen.getByRole('link', { name: /approvals/i })).toHaveAttribute(
      'href',
      '/admin/approvals'
    )
  })

  it('hides approvals from content managers', () => {
    // /api/admin/approvals is requireAdmin — a visible link would be a 403
    // waiting to happen.
    render(<AdminSidebar user={contentManager} collapsed={false} />)

    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })
})

/**
 * Nav-to-route drift (#603)
 *
 * Four nav items pointed at routes that were never generated — `AI
 * Generations` (the screen was renamed to ai-moderation), `Analytics`,
 * `Categories` (a concept the schema does not have) and `Settings`. Nothing
 * caught it because nothing compares the nav to the route tree, so the drift
 * only showed up as a 404 for whoever clicked first.
 *
 * The route tree is read as text rather than imported: importing
 * routeTree.gen.ts pulls in every route module (and their loaders) for what is
 * a question about a list of strings.
 */
const APP_DIR = resolve(__dirname, '../../../app')

function generatedRoutePaths(): Set<string> {
  const source = readFileSync(resolve(APP_DIR, 'routeTree.gen.ts'), 'utf8')
  // The `to` paths — what an href has to match — live in FileRoutesByTo.
  const block = source.match(/export interface FileRoutesByTo \{([\s\S]*?)\n\}/)
  if (!block) throw new Error('FileRoutesByTo not found in routeTree.gen.ts')
  return new Set(Array.from(block[1].matchAll(/^\s*'([^']+)':/gm), (m) => m[1]))
}

/** An href is only as resolvable as its path — drop search and hash. */
function pathOf(href: string): string {
  return href.split(/[?#]/)[0]
}

describe('admin nav points at routes that exist (#603)', () => {
  const routePaths = generatedRoutePaths()

  it.each([...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((i) => [i.label, i.href]))(
    'resolves %s -> %s',
    (_label, href) => {
      expect(routePaths.has(pathOf(href))).toBe(true)
    }
  )

  it('lists each admin screen once', () => {
    const hrefs = [...NAV_ITEMS, ...SECONDARY_NAV_ITEMS].map((i) => i.href)
    expect(hrefs).toHaveLength(new Set(hrefs).size)
  })

  it('sends every dashboard tile somewhere that exists', () => {
    // The stale links were in two places: removing them from the sidebar alone
    // left the dashboard quick-action tiles pointing at the same 404s.
    const dashboard = readFileSync(resolve(APP_DIR, 'routes/admin/index.tsx'), 'utf8')
    const hrefs = Array.from(
      dashboard.matchAll(/href=["'](\/[^"'{]*)["']/g),
      (m) => pathOf(m[1])
    )

    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.filter((href) => !routePaths.has(href))).toEqual([])
  })
})

describe('MobileAdminHeader', () => {
  it('titles the staff area for what a content manager can reach', () => {
    render(<MobileAdminHeader role="content-manager" />)

    expect(screen.getByText('Manage Content')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('titles the staff area "Manage Store" for admins', () => {
    render(<MobileAdminHeader role="super-admin" />)

    expect(screen.getByText('Manage Store')).toBeInTheDocument()
  })

  it('always offers the way back to the store', () => {
    render(<MobileAdminHeader role="content-manager" />)

    expect(screen.getByRole('link', { name: /view store/i })).toHaveAttribute(
      'href',
      '/'
    )
  })
})
