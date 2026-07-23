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
