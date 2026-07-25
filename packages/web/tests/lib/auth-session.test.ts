/**
 * authApi.getSession Endpoint Tests
 *
 * Regression tests for the login-bounce bug: getSession() must call Better
 * Auth's real endpoint /api/auth/get-session. The old /api/auth/session URL
 * 404s, which made getSession() return null and bounced authenticated users
 * on /account/orders and /account/ai-creations back to the login page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authApi } from '../../app/lib/api'

describe('authApi.getSession', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: 'u1' }, session: { id: 's1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("calls Better Auth's get-session endpoint (not /api/auth/session)", async () => {
    await authApi.getSession()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const url = vi.mocked(global.fetch).mock.calls[0][0] as string
    expect(url).toMatch(/\/api\/auth\/get-session$/)
  })

  it('returns the parsed session payload on 200', async () => {
    const session = await authApi.getSession()
    expect(session?.user?.id).toBe('u1')
  })

  it('returns null on a non-OK response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response('nope', { status: 404 }) as unknown as Response
    )
    const session = await authApi.getSession()
    expect(session).toBeNull()
  })
})
