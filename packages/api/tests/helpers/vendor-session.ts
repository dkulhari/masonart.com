/**
 * The vendor portal caller both portal suites authenticate as, and the app they
 * mount it on.
 *
 * `vendorSessionFor` returns the better-auth session shape that
 * `auth.api.getSession` is mocked to resolve to, so the REAL `requireAuth` and
 * `requireVendor` run against it. The `id` defaults to the caller the suites'
 * queued `vendor_users` scope row belongs to; pass a different one to test a
 * caller who is not attached to the vendor.
 *
 * @see packages/api/tests/routes/vendor/jobs.test.ts
 * @see packages/api/tests/routes/vendor/artwork.test.ts
 * @see packages/api/src/lib/vendor-scope.ts
 */

import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

export function vendorSessionFor(role: string, id = 'vendor-user-1') {
  const now = new Date()
  return {
    user: {
      id,
      name: 'Portal User',
      email: 'portal@example.com',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: 'active',
    },
    session: {
      id: 'sess-1',
      token: 'tok-1',
      userId: id,
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}

/**
 * The portal router at its real path, with `HTTPException` passed through so a
 * 403 from `requireVendor` stays a 403 instead of becoming an unhandled 500.
 *
 * `vendorApp` is passed in rather than imported here: the suites mock
 * `src/database` and `src/auth`, and importing the router from a helper would
 * pull it in outside the mocked graph.
 */
export function buildVendorApp(vendorApp: Parameters<Hono['route']>[1]): Hono {
  const app = new Hono()
  app.route('/api/vendor', vendorApp)
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    return c.json({ error: err.message }, 500)
  })
  return app
}
