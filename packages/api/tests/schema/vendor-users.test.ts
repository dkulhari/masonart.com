import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { userRoleEnum } from '../../src/database/schema/users'
import { vendorUsers } from '../../src/database/schema/vendor-users'

describe('vendor role and linkage', () => {
  it('adds vendor to the user_role enum without disturbing existing values', () => {
    // Appended, not inserted: drizzle-kit emits ALTER TYPE ... ADD VALUE and
    // the existing five keep their ordinals.
    expect(userRoleEnum.enumValues).toEqual([
      'customer',
      'trade',
      'content-manager',
      'admin',
      'super-admin',
      'vendor',
    ])
  })

  it('vendor_users binds one user to exactly one vendor', () => {
    const config = getTableConfig(vendorUsers)
    expect(config.name).toBe('vendor_users')
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]))
    expect(cols['vendor_id'].notNull).toBe(true)
    expect(cols['user_id'].notNull).toBe(true)
    // UNIQUE on user_id is what makes requireVendor a lookup, not a choice
    const uniqueOnUser = config.uniqueConstraints.some((u) =>
      u.columns.some((c) => c.name === 'user_id')
    )
    expect(uniqueOnUser).toBe(true)
  })
})
