import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import {
  productionJobs,
  productionJobItems,
  productionJobReviews,
  vendorSettlements,
  productionJobStageEnum,
  productionJobStatusEnum,
  productionJobVerdictEnum,
} from '../../src/database/schema/production-jobs'

const cols = (t: any) => Object.fromEntries(getTableConfig(t).columns.map((c) => [c.name, c]))

describe('production job schema', () => {
  it('production_jobs carries stage, status, vendor and both amounts', () => {
    const c = cols(productionJobs)
    expect(getTableConfig(productionJobs).name).toBe('production_jobs')
    expect(c['order_id'].notNull).toBe(true)
    expect(c['stage'].notNull).toBe(true)
    expect(c['status'].notNull).toBe(true)
    expect(c['amount_expected'].getSQLType()).toBe('numeric(10, 2)')
    expect(c['amount_actual'].getSQLType()).toBe('numeric(10, 2)')
    // the override is nullable; the computed expectation is what is always set
    expect(c['amount_actual'].notNull).toBe(false)
    // settlementId nullable — null IS the definition of unsettled
    expect(c['settlement_id'].notNull).toBe(false)
    expect(productionJobStageEnum.enumValues).toEqual(['print', 'frame'])
    expect(productionJobStatusEnum.enumValues).toEqual([
      'draft',
      'assigned',
      'sent',
      'received',
      'qc_passed',
      'qc_failed',
      'cancelled',
    ])
  })

  it('production_job_items joins to order_items, not to orders', () => {
    const c = cols(productionJobItems)
    expect(getTableConfig(productionJobItems).name).toBe('production_job_items')
    expect(c['job_id'].notNull).toBe(true)
    expect(c['order_item_id'].notNull).toBe(true)
  })

  it('production_job_reviews is append-only with an open defect vocabulary', () => {
    const c = cols(productionJobReviews)
    expect(getTableConfig(productionJobReviews).name).toBe('production_job_reviews')
    expect(c['job_id'].notNull).toBe(true)
    expect(c['verdict'].notNull).toBe(true)
    expect(c['defects']).toBeDefined()
    // append-only: no updated_at, because a review is never edited
    expect(c['updated_at']).toBeUndefined()
    expect(productionJobVerdictEnum.enumValues).toEqual(['pass', 'fail'])
  })

  it('vendor_settlements records an out-of-band payment', () => {
    const c = cols(vendorSettlements)
    expect(getTableConfig(vendorSettlements).name).toBe('vendor_settlements')
    expect(c['vendor_id'].notNull).toBe(true)
    expect(c['amount'].getSQLType()).toBe('numeric(10, 2)')
    expect(c['reference']).toBeDefined()
    expect(c['paid_at']).toBeDefined()
  })
})
