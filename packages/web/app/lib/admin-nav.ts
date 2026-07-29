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
  '/admin/categories',
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
