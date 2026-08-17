import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  vendors,
  vendorContacts,
  vendorCapabilities,
  vendorRates,
  vendorStatusEnum,
  vendorCapabilityKindEnum,
} from '../../src/database/schema/vendors'

const cols = (t: any) => Object.fromEntries(getTableConfig(t).columns.map((c) => [c.name, c]))

describe('vendor core schema', () => {
  it('vendors table has status enum and audit columns', () => {
    const c = cols(vendors)
    expect(getTableConfig(vendors).name).toBe('vendors')
    expect(c['name'].notNull).toBe(true)
    expect(c['status']).toBeDefined()
    expect(c['created_by']).toBeDefined()
    expect(c['created_at']).toBeDefined()
    expect(c['updated_at']).toBeDefined()
    expect(vendorStatusEnum.enumValues).toEqual(['active', 'inactive', 'suspended'])
  })

  it('vendor_contacts hangs off vendors and marks a primary', () => {
    const c = cols(vendorContacts)
    expect(getTableConfig(vendorContacts).name).toBe('vendor_contacts')
    expect(c['vendor_id'].notNull).toBe(true)
    expect(c['is_primary']).toBeDefined()
    expect(c['contact_role']).toBeDefined()
  })

  it('vendor_capabilities is one row per kind with size limits', () => {
    const c = cols(vendorCapabilities)
    expect(getTableConfig(vendorCapabilities).name).toBe('vendor_capabilities')
    expect(c['kind'].notNull).toBe(true)
    expect(c['max_width_inches']).toBeDefined()
    expect(c['max_height_inches']).toBeDefined()
    expect(c['finishes']).toBeDefined()
    expect(c['stated_turnaround_days']).toBeDefined()
    expect(vendorCapabilityKindEnum.enumValues).toEqual(['print', 'frame'])
  })

  it('vendor_rates carries effective dating and a decimal amount', () => {
    const c = cols(vendorRates)
    expect(getTableConfig(vendorRates).name).toBe('vendor_rates')
    expect(c['longest_edge_min_inches'].notNull).toBe(true)
    expect(c['longest_edge_max_inches'].notNull).toBe(true)
    expect(c['effective_from'].notNull).toBe(true)
    // effective_to nullable: an open-ended rate is the normal case
    expect(c['effective_to'].notNull).toBe(false)
    // money is decimal(10,2) INR, never paise, never whole rupees
    expect(c['amount'].getSQLType()).toBe('numeric(10, 2)')
  })
})
