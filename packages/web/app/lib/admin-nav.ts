/**
 * Admin navigation role rules
 *
 * Shared between the admin layout guard (routes/admin.tsx) and the sidebar
 * (components/admin/AdminSidebar.tsx) so route access and visible navigation
 * can never drift apart.
 */

/**
 * Admin sections a content-manager may access. Everything else in /admin
 * is reserved for admin/super-admin.
 */
export const CONTENT_MANAGER_ALLOWED_PREFIXES = [
  '/admin/products',
  '/admin/collections',
  // `/admin/categories` was listed here until #603. There is no such route, no
  // such API and no categories table — product taxonomy is collections — so the
  // prefix only ever granted access to a 404.
  /**
   * `/api/admin/frames` is gated with `requireContentManager`, same as
   * collections. Leaving the path out here would let the endpoint serve a role
   * the layout guard turns away at the door — the screen would 403 for someone
   * the API is happy to answer.
   */
  '/admin/frames',
] as const

/**
 * Whether a path within /admin is allowed for the content-manager role
 */
export function isContentManagerPathAllowed(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/admin'
  return CONTENT_MANAGER_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/')
  )
}

/**
 * Default search params for /admin/products.
 *
 * The route declares these as zod defaults in validateSearch, but links from
 * outside the route have to spell them out so the URL we push already
 * satisfies the schema.
 */
export const ADMIN_PRODUCTS_SEARCH = {
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
} as const

/**
 * Rows per page for the vendor directory.
 *
 * Matches `DEFAULT_PAGE_SIZE` in `routes/admin/vendors.ts` on the API side, and
 * lives here rather than in the route module so `ADMIN_VENDORS_SEARCH` below and
 * the route's own zod default cannot drift apart.
 */
export const VENDOR_PAGE_SIZE = 20

/**
 * Default search params for /admin/vendors.
 *
 * Same contract as ADMIN_PRODUCTS_SEARCH: the route declares these as zod
 * defaults in validateSearch, but a link from outside the route has to spell
 * them out so the URL we push already satisfies the schema.
 *
 * Deliberately NOT added to CONTENT_MANAGER_ALLOWED_PREFIXES — the vendor
 * screens carry `amountOwed` and the rate card we buy at, and the API gates them
 * with `requireAdmin`. `tests/lib/admin-nav-vendor-role.test.ts` asserts the
 * refusal from the other side.
 */
export const ADMIN_VENDORS_SEARCH = {
  page: 1,
  pageSize: VENDOR_PAGE_SIZE,
} as const

/**
 * Rows per page for the production queue.
 *
 * Matches `DEFAULT_PAGE_SIZE` in `routes/admin/production-jobs.ts` on the API
 * side, for the same reason `VENDOR_PAGE_SIZE` does: the constant below and the
 * route's own zod default read from one place and cannot drift apart.
 */
export const PRODUCTION_PAGE_SIZE = 20

/**
 * Default search params for /admin/production.
 *
 * Same contract as ADMIN_VENDORS_SEARCH. Also deliberately NOT added to
 * CONTENT_MANAGER_ALLOWED_PREFIXES — a production job carries what we pay a
 * supplier, and `routes/admin/production-jobs.ts` gates the API with
 * `requireAdmin`. `tests/lib/admin-nav-vendor-role.test.ts` asserts the refusal
 * from the other side.
 */
export const ADMIN_PRODUCTION_SEARCH = {
  page: 1,
  pageSize: PRODUCTION_PAGE_SIZE,
} as const

/**
 * Rows per page for the dispatch queue.
 *
 * Matches `DEFAULT_PAGE_SIZE` in `routes/admin/shipments.ts` on the API side,
 * for the same reason `PRODUCTION_PAGE_SIZE` does: the constant below and the
 * route's own zod default read from one place and cannot drift apart.
 */
export const DISPATCH_PAGE_SIZE = 20

/**
 * Default search params for /admin/dispatch.
 *
 * Same contract as ADMIN_PRODUCTION_SEARCH. Also deliberately NOT added to
 * CONTENT_MANAGER_ALLOWED_PREFIXES — pressing Ship on that screen buys a
 * carrier label, which is money leaving the business, and
 * `routes/admin/shipments.ts` gates both the queue and the purchase with
 * `requireAdmin`. `tests/routes/admin/dispatch-queue.test.tsx` asserts the
 * refusal from this side.
 */
export const ADMIN_DISPATCH_SEARCH = {
  page: 1,
  pageSize: DISPATCH_PAGE_SIZE,
} as const

/**
 * Same contract as ADMIN_PRODUCTS_SEARCH, for `/admin/orders`.
 *
 * Added in #626, where the typecheck was pointing at a real defect: the order
 * detail screen's Back button called `navigate({ to: '/admin/orders' })` with
 * no search at all. The orders route declares these params as required, so the
 * pushed URL failed its own `validateSearch` — and a throw in `validateSearch`
 * error-boundaries the route to a blank page instead of a message.
 */
export const ADMIN_ORDERS_SEARCH = {
  page: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc',
} as const

/**
 * Label for the staff area entry point, by role. null = not staff, show nothing.
 *
 * Content managers only get the catalog sections, so calling their entry
 * "Admin" reads as somewhere they aren't allowed — which is why it went
 * unnoticed (#362).
 */
export function staffAreaLabel(role: string | undefined): string | null {
  switch (role?.toLowerCase()) {
    case 'content-manager':
      return 'Manage Content'
    case 'admin':
    case 'super-admin':
      return 'Manage Store'
    default:
      return null
  }
}

/**
 * Where the staff area entry point should land, by role. null = not staff.
 */
export function staffAreaHref(role: string | undefined): string | null {
  switch (role?.toLowerCase()) {
    // Content managers have no dashboard — /admin only bounces them here
    // (see the beforeLoad redirect in routes/admin.tsx).
    case 'content-manager':
      return '/admin/products'
    case 'admin':
    case 'super-admin':
      return '/admin'
    default:
      return null
  }
}

/**
 * Whether a nav item with the given href should be visible for the role
 */
export function isAdminNavItemVisible(
  role: string | undefined,
  href: string
): boolean {
  const r = role?.toLowerCase()
  if (r === 'admin' || r === 'super-admin') return true
  if (r === 'content-manager') return isContentManagerPathAllowed(href)
  return false
}
