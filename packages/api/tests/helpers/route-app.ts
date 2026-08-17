/**
 * One router under test, mounted at its real path.
 *
 * The `onError` matters: without it Hono turns an `HTTPException` thrown by
 * `requireAdmin` or `requireVendor` into an unhandled 500, so every auth test
 * would pass its status assertion for the wrong reason.
 *
 * The router is passed in rather than imported here — the suites mock
 * `src/database` and `src/auth`, and importing it from a helper would pull it
 * in outside the mocked graph.
 */

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

export function buildRouteApp(basePath: string, routeApp: Parameters<Hono['route']>[1]): Hono {
  const app = new Hono()
  app.route(basePath, routeApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}
