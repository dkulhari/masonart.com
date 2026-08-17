/**
 * Scaffolding shared by the admin route suites that mock `db` with plain
 * `vi.fn()`s rather than the recording builder in `./query-recorder`.
 *
 * These suites care about the handler's *responses* — status codes, cache
 * busting, transactional ordering — not about the SQL, so the database is a
 * chainable thenable that resolves to whatever rows the test hands it, and the
 * auth middleware is replaced with a header-driven stand-in.
 *
 * The auth mock is installed with an async factory so nothing is referenced
 * before `vi.mock` hoists:
 *
 * ```ts
 * vi.mock('../../../src/middleware/auth', async () =>
 *   (await import('../../helpers/admin-route-harness')).headerAuthMocks()
 * );
 * ```
 *
 * @see packages/api/tests/routes/admin/collection-membership.test.ts
 * @see packages/api/tests/routes/admin/frames.test.ts
 */

import { vi } from 'vitest';
import type { Context, Hono, Next } from 'hono';

/** Chain methods a drizzle query can walk before it is awaited. */
const CHAIN_METHODS = [
  'from',
  'where',
  'set',
  'values',
  'orderBy',
  'limit',
  'returning',
];

/**
 * A chainable thenable that resolves to `rows` however the handler walks it.
 *
 * Returned as a loose `Record` on purpose: several suites overwrite one link
 * (`chain.values = ...`) to record what a transaction body wrote.
 */
export function chainReturning(rows: unknown[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const key of CHAIN_METHODS) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return chain;
}

/**
 * `requireAuth` / `requireContentManager` driven by an `X-Test-User` header,
 * so a suite can switch roles per request instead of per module.
 *
 * The role list mirrors the real middleware: content managers, admins and
 * super-admins get through, everyone else gets a 403.
 */
export function headerAuthMocks() {
  return {
    requireAuth: vi.fn((c: Context, next: Next) => {
      const header = c.req.header('X-Test-User');
      if (!header) return c.json({ error: 'Unauthorized' }, 401);
      c.set('user', JSON.parse(header));
      return next();
    }),
    requireContentManager: vi.fn((c: Context, next: Next) => {
      const user = c.get('user') as { role?: string } | undefined;
      const allowed = ['content-manager', 'admin', 'super-admin'];
      if (!user || !allowed.includes(user.role ?? '')) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      return next();
    }),
  };
}

/**
 * A request function bound to one caller — `asStaff('/api/admin/frames')`.
 *
 * `user` is the JSON body `headerAuthMocks` parses back out of `X-Test-User`.
 */
export function requestAs(app: Hono, user: string) {
  return (path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Test-User': user,
        ...(init.headers ?? {}),
      },
    });
}
