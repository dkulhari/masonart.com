/**
 * Vendor Portal Layout — chobii.art
 *
 * The parent route for every `/vendor/*` screen. Four screens hang off it and
 * there is no fifth: my jobs, one job, my rates, my payments. A print shop will
 * not learn more than that, and every additional screen is another surface that
 * has to be right about isolation.
 *
 * ## The guard is a MIRROR of the admin one, not a reuse of it
 *
 * `routes/admin.tsx`'s `beforeLoad` has the shape this one copies: no session
 * throws a `redirect` to the login page carrying the current href; a session
 * that is logged in but not entitled returns `isUnauthorized: true` and the
 * component renders Access Denied.
 *
 * What is deliberately NOT done is importing that guard. The two trees have
 * OPPOSITE membership — `admin` and `super-admin` are the admin tree's whole
 * point and are refused here, `vendor` is refused there — so a shared
 * implementation would mean a membership change made for one tree silently
 * applying to the other. `tests/routes/vendor/layout-guard.test.tsx` asserts
 * both directions, and asserts this file does not import the admin route.
 *
 * ## Access Denied, not a redirect, for a logged-in outsider
 *
 * A redirect to `/auth/login` for someone who already has a session sends them
 * to a page they are past; the login flow returns them here and it goes round
 * again. The refusal has to be terminal, and it has to be visible.
 *
 * An ADMIN gets Access Denied too. An admin is not a vendor, `/vendor` is not a
 * staff console, and the vendor role gets no staff entry point in return
 * (`staffAreaLabel('vendor') === null`, pinned by
 * `tests/lib/admin-nav-vendor-role.test.ts`).
 */

import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { Package, Receipt, ShieldAlert, Wallet } from 'lucide-react'
import { cn } from '~/lib/utils'
import { VENDOR_JOBS_SEARCH } from '~/lib/vendor-nav'

// ============================================================================
// Types
// ============================================================================

export interface VendorPortalUser {
  id: string
  name: string
  email: string
  image?: string | null
  role?: string
}

export interface VendorGuardArgs {
  context: { session?: { user?: VendorPortalUser } | null }
  location: { href: string; pathname: string }
}

export interface VendorGuardResult {
  user: VendorPortalUser
  isUnauthorized: boolean
}

// ============================================================================
// The guard
// ============================================================================

/**
 * Exported so it can be tested as a function. `beforeLoad` reached through a
 * router would need a whole route tree stood up to assert one boolean.
 */
export function vendorLayoutBeforeLoad({
  context,
  location,
}: VendorGuardArgs): VendorGuardResult {
  if (!context.session?.user) {
    // No session at all — the login page is the right place, and it needs to
    // know where to put them afterwards.
    throw redirect({
      to: '/auth/login',
      search: {
        redirect: location.href,
      },
    })
  }

  const user = context.session.user
  const role = user.role?.toLowerCase()

  // ONE role, listed once. Not `!isAdmin`, not a deny-list: a deny-list admits
  // every role added after it was written, and `user_role` is an enum that has
  // grown twice already.
  const isVendorRole = role === 'vendor'

  if (!isVendorRole) {
    // Authenticated but not entitled. Terminal, and rendered — see the header
    // comment on why this is not a redirect.
    return { user, isUnauthorized: true }
  }

  return { user, isUnauthorized: false }
}

// ============================================================================
// Route definition
// ============================================================================

export const Route = createFileRoute('/vendor')({
  beforeLoad: vendorLayoutBeforeLoad,
  head: () => ({
    meta: [
      { title: 'Vendor Portal | chobii.art' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: VendorLayout,
})

// ============================================================================
// Layout
// ============================================================================

/** Three destinations. `/vendor/jobs/$id` is reached from the queue, not the nav. */
const VENDOR_NAV = [
  { to: '/vendor' as const, label: 'My jobs', icon: Package },
  { to: '/vendor/rates' as const, label: 'Rates', icon: Receipt },
  { to: '/vendor/payments' as const, label: 'Payments', icon: Wallet },
]

function VendorLayout() {
  const context = Route.useRouteContext()
  const { isUnauthorized } = context
  const user = context.user as VendorPortalUser | undefined

  if (isUnauthorized) {
    return <VendorAccessDenied />
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              chobii.art — vendor portal
            </p>
            {/* The signed-in account, not a customer. The only person named
                anywhere in this tree is the vendor themselves. */}
            <p data-testid="vendor-portal-account" className="text-lg font-medium">
              {user?.name ?? 'Vendor'}
            </p>
          </div>

          <nav aria-label="Vendor portal" className="flex flex-wrap gap-1">
            {VENDOR_NAV.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  search={item.to === '/vendor' ? VENDOR_JOBS_SEARCH : undefined}
                  activeOptions={{ exact: item.to === '/vendor' }}
                  activeProps={{ 'data-active': 'true' }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
                    'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    'data-[active=true]:bg-brand-50 data-[active=true]:text-brand-700'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

// ============================================================================
// Access Denied
// ============================================================================

/**
 * The terminal refusal for a logged-in non-vendor. Exported for the guard test
 * so the copy is asserted rather than assumed.
 *
 * It says nothing about what a vendor account is or how to get one: this page
 * is reached by staff and customers who wandered in, and "ask us to link you to
 * a vendor" is an invitation, not an error message.
 */
export function VendorAccessDenied() {
  return (
    <div
      data-testid="vendor-access-denied"
      className="flex min-h-screen items-center justify-center bg-background"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="h-8 w-8 text-red-600" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          This area is for our print and framing partners. Your account is not
          linked to a vendor.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-600"
          >
            Go to Homepage
          </a>
          <a
            href="/account"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            My Account
          </a>
        </div>
      </div>
    </div>
  )
}

export default VendorLayout
