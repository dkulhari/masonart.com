/**
 * SSR Entry Point
 *
 * Server-side rendering entry point for TanStack Start.
 * Creates the start handler with the default stream handler.
 *
 * @see https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point
 */

import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

/**
 * Create the SSR handler
 */
export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
