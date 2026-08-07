/**
 * TanStack Router Configuration
 *
 * Configures the router with:
 * - Route tree from file-based routing
 * - Scroll restoration
 * - Default error handling
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/start/getting-started
 */

import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { FREE_SHIPPING_THRESHOLD } from '@chobii/shared'
import { routeTree } from './routeTree.gen'

/**
 * Custom search param parser that keeps all values as strings.
 * The default TanStack Router parser (via qss) converts 'true'/'false' to
 * booleans and numeric strings to numbers, which breaks 307 redirect
 * serialization for boolean URL params (see ticket #149).
 */
function parseSearchString(searchStr: string): Record<string, unknown> {
  if (searchStr.startsWith('?')) searchStr = searchStr.substring(1)
  const result: Record<string, unknown> = {}
  if (!searchStr) return result
  const params = new URLSearchParams(searchStr)
  for (const [key, value] of params.entries()) {
    result[key] = value
  }
  return result
}

function stringifySearchObj(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value))
    }
  }
  const str = params.toString()
  return str ? `?${str}` : ''
}

/**
 * Router context interface
 * This must match the context expected by createRootRouteWithContext
 */
interface RouterContext {
  session: {
    user: {
      id: string
      name: string
      email: string
      emailVerified: boolean
      createdAt: Date
      updatedAt: Date
      image?: string | null
    }
    session: {
      id: string
      expiresAt: Date
      token: string
      createdAt: Date
      updatedAt: Date
      userId: string
    }
  } | null
  /**
   * The free-shipping threshold in force, in whole rupees (#570). Delivered
   * once here so every copy surface prints the same number the server charges
   * by; the root route's `beforeLoad` replaces this seed with the live value.
   */
  freeShippingThreshold: number
}

/**
 * Create and configure the router instance
 */
export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    parseSearch: parseSearchString,
    stringifySearch: stringifySearchObj,
    // Provide initial context - both fields are populated by the root route's
    // beforeLoad. The threshold seeds to the bundled constant rather than 0:
    // it is what the API itself falls back to, so the seed and the charge agree.
    context: {
      session: null,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    } satisfies RouterContext,
  })

  return router
}

// New TanStack Start API requires getRouter export
export function getRouter() {
  return createRouter()
}

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
