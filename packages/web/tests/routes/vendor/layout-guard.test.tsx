/**
 * The `/vendor` layout guard.
 *
 * Everything in the vendor portal rests on this one function, so it is pinned
 * here before the screens exist.
 *
 * Three behaviours, and the third is the one that is easy to get wrong:
 *
 * 1. **No session redirects to login**, carrying `redirect=<href>` so the vendor
 *    lands back where they were pointed.
 * 2. **A vendor gets in.**
 * 3. **A logged-in non-vendor gets Access Denied, NOT a redirect.** Redirecting
 *    someone who is already logged in sends them to a login page they are
 *    already past, which bounces them straight back — a loop, not a refusal.
 *    An ADMIN is included in "non-vendor": an admin is not a vendor and this
 *    tree is not a staff surface.
 *
 * And the reverse direction, asserted rather than assumed: the admin guard does
 * not admit the vendor role either, and the two guards are separate code. They
 * have opposite membership, so a shared implementation would mean a change made
 * for one tree silently applying to the other.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Only `createFileRoute` is stubbed — it runs at module load and wants a real
 * route tree. `redirect` stays REAL (via `importActual`) so the assertions below
 * are made against the object TanStack actually throws, not against a fake.
 */
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@tanstack/react-router'
  )
  return {
    ...actual,
    createFileRoute: () => (config: unknown) => config,
    Outlet: () => null,
    Link: ({
      children,
      to,
    }: {
      children?: React.ReactNode
      to?: string
      params?: unknown
      search?: unknown
      className?: string
      activeProps?: unknown
    }) => <a href={to}>{children}</a>,
  }
})

import { isRedirect } from '@tanstack/react-router'
import {
  vendorLayoutBeforeLoad,
  VendorAccessDenied,
} from '~/routes/vendor'

afterEach(cleanup)

// ============================================================================
// Fixtures
// ============================================================================

function sessionFor(role: string | undefined) {
  return {
    user: {
      id: 'user-1',
      name: 'Print Shop',
      email: 'shop@example.com',
      role,
    },
  }
}

const location = { href: '/vendor/jobs/abc?page=2', pathname: '/vendor/jobs/abc' }

function runGuard(role: string | undefined | null) {
  return vendorLayoutBeforeLoad({
    context: { session: role === null ? null : sessionFor(role) },
    location,
  } as never)
}

// ============================================================================
// No session
// ============================================================================

describe('vendorLayoutBeforeLoad — no session', () => {
  it('redirects to the login page carrying the current href', () => {
    let thrown: unknown
    try {
      runGuard(null)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeDefined()
    // A real TanStack redirect: a `Response` carrying its options, which is
    // what `isRedirect` recognises and what the router acts on.
    expect(isRedirect(thrown)).toBe(true)
    const { options } = thrown as {
      options: { to?: string; search?: { redirect?: string } }
    }
    expect(options.to).toBe('/auth/login')
    expect(options.search?.redirect).toBe(location.href)
  })
})

// ============================================================================
// The vendor role
// ============================================================================

describe('vendorLayoutBeforeLoad — the vendor role', () => {
  it('lets a vendor through', () => {
    expect(runGuard('vendor')).toMatchObject({ isUnauthorized: false })
  })

  it('is case-insensitive about the role, like the admin guard', () => {
    expect(runGuard('VENDOR')).toMatchObject({ isUnauthorized: false })
  })

  it('passes the user through to the layout', () => {
    expect(runGuard('vendor')).toMatchObject({
      user: { id: 'user-1', email: 'shop@example.com' },
    })
  })
})

// ============================================================================
// Logged in, not a vendor — Access Denied, never a redirect
// ============================================================================

describe('vendorLayoutBeforeLoad — a logged-in non-vendor', () => {
  // `admin` and `super-admin` are in this list deliberately. Staff are not
  // vendors; /vendor is a supplier surface, not a second staff console.
  const outsiders = [
    'admin',
    'super-admin',
    'content-manager',
    'customer',
    'trade',
    undefined,
  ]

  for (const role of outsiders) {
    it(`denies ${role ?? 'a role-less user'} without redirecting`, () => {
      // Would-be redirect loop: this user is already logged in, so bouncing
      // them to /auth/login returns them here and round it goes.
      expect(() => runGuard(role)).not.toThrow()
      expect(runGuard(role)).toMatchObject({ isUnauthorized: true })
    })
  }
})

// ============================================================================
// The Access Denied screen
// ============================================================================

describe('VendorAccessDenied', () => {
  it('says access is denied and offers a way out', () => {
    render(<VendorAccessDenied />)
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByTestId('vendor-access-denied')).toBeInTheDocument()
  })
})

// ============================================================================
// The two guards are separate, and the admin one refuses vendors
// ============================================================================

describe('the admin tree and the vendor tree do not share a guard', () => {
  it('does not import the admin layout', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/routes/vendor.tsx'),
      'utf-8'
    )
    // Sharing would make a membership change for one tree apply to the other,
    // and their memberships are disjoint.
    expect(source).not.toMatch(/from\s+['"][^'"]*routes\/admin['"]/)
    expect(source).not.toMatch(/from\s+['"]\.\/admin['"]/)
  })

  it('refuses the vendor role on the admin side too', async () => {
    const { Route: AdminRoute } = (await import('~/routes/admin')) as {
      Route: {
        beforeLoad: (args: unknown) => Promise<{ isUnauthorized: boolean }>
      }
    }

    await expect(
      AdminRoute.beforeLoad({
        context: { session: sessionFor('vendor') },
        location: { href: '/admin', pathname: '/admin' },
      })
    ).resolves.toMatchObject({ isUnauthorized: true })
  })
})
