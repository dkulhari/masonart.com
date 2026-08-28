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
    requireAuth: headerRequireAuth(),
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
 * The `requireAuth` stand-in every header-driven suite installs: read the
 * caller out of `X-Test-User`, 401 when it is absent.
 *
 * A fresh `vi.fn` per call, so one suite's call count cannot leak into
 * another's assertions.
 */
export function headerRequireAuth() {
  return vi.fn((c: Context, next: Next) => {
    const header = c.req.header('X-Test-User');
    if (!header) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', JSON.parse(header));
    return next();
  });
}

/**
 * `requireAuth` / `requireAdmin` for the admin suites that assert on responses
 * rather than on who is allowed through (#633).
 *
 * Seven gift-card suites carried a byte-identical copy of the `requireAuth`
 * half. The `requireAdmin` half is the part that actually varied: most let
 * every caller through because the suite is testing the handler rather than
 * the gate, while one flips a module-level flag mid-suite to check the 403
 * path. `isAllowed` covers both — omit it to let everyone through, or pass a
 * predicate read at request time.
 *
 * Install with an async factory, so nothing is referenced before `vi.mock`
 * hoists:
 *
 * ```ts
 * vi.mock('../../src/middleware/auth', async (importOriginal) => ({
 *   ...(await importOriginal<typeof import('../../src/middleware/auth')>()),
 *   ...(await import('../helpers/admin-route-harness')).headerAdminMocks(),
 * }));
 * ```
 *
 * Passing a predicate rather than a boolean is what makes the flag case work:
 * the factory runs before the suite's `let` bindings are initialised, so the
 * value has to be read when the request arrives, not when the mock is built.
 */
export function headerAdminMocks(isAllowed?: () => boolean) {
  return {
    requireAuth: headerRequireAuth(),
    requireAdmin: vi.fn((c: Context, next: Next) =>
      !isAllowed || isAllowed() ? next() : c.json({ error: 'Forbidden' }, 403),
    ),
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
