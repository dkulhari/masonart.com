import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'

const mockLookup = vi.fn()
vi.mock('../../src/database', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: () => mockLookup() }) }),
        where: () => ({ limit: () => mockLookup() }),
      }),
    }),
  },
}))

import { requireVendor } from '../../src/middleware/vendor'
import { readJson } from '../helpers/json'

function appWithUser(user: any) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('user', user)
    await next()
  })
  app.get('/x', requireVendor, (c) => c.json({ vendorId: c.get('vendorId') }))
  return app
}

describe('requireVendor', () => {
  beforeEach(() => mockLookup.mockReset())

  it('403s a vendor-role user with no vendor_users row — never an unscoped query', async () => {
    mockLookup.mockResolvedValue([])
    const res = await appWithUser({ id: 'u1', role: 'vendor' }).request('/x')
    expect(res.status).toBe(403)
  })

  it('403s when the vendor is suspended — suspending a vendor suspends its logins', async () => {
    mockLookup.mockResolvedValue([{ vendorId: 'v1', status: 'suspended' }])
    const res = await appWithUser({ id: 'u1', role: 'vendor' }).request('/x')
    expect(res.status).toBe(403)
  })

  it('401s an unauthenticated caller', async () => {
    mockLookup.mockResolvedValue([{ vendorId: 'v1', status: 'active' }])
    const res = await appWithUser(null).request('/x')
    expect(res.status).toBe(401)
  })

  it('resolves vendorId into context for an active linked vendor', async () => {
    mockLookup.mockResolvedValue([{ vendorId: 'v1', status: 'active' }])
    const res = await appWithUser({ id: 'u1', role: 'vendor' }).request('/x')
    expect(res.status).toBe(200)
    expect(await readJson(res)).toEqual({ vendorId: 'v1' })
  })
})
