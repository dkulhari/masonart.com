/**
 * SSR Entry Point
 *
 * Server-side rendering entry point for TanStack Start.
 * Creates the start handler with the default stream handler.
 *
 * @see https://tanstack.com/router/latest/docs/framework/react/start/getting-started
 */

import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

/**
 * Create the SSR handler
 */
export default createStartHandler(defaultStreamHandler)
