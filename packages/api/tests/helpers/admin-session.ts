/**
 * The admin caller the vendor, rate-card and production-job suites authenticate
 * as.
 *
 * Returned in the better-auth session shape `auth.api.getSession` is mocked to
 * resolve to, so the REAL `requireAuth` / `requireAdmin` run against it — pass
 * a non-admin `role` to prove they reject it.
 *
 * @see packages/api/tests/routes/admin/vendors.test.ts
 * @see packages/api/tests/routes/admin/vendor-rates.test.ts
 * @see packages/api/tests/routes/admin/production-jobs.test.ts
 */

export function adminSessionFor(role: string) {
  const now = new Date()
  return {
    user: {
      id: 'admin-user-1',
      name: 'Admin User',
      email: 'admin@example.com',
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
      userId: 'admin-user-1',
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}
