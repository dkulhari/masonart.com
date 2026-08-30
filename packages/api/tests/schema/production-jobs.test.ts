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
      'qc_submitted',
      'qc_passed',
      'qc_failed',
      'dispatched',
      'cancelled',
    ])
  })

  /**
   * The two values production-pipeline adds (#673), and the one it retires.
   *
   * `qc_submitted` is the only state meaning the ball is in OUR court: work
   * finished, shot list uploaded, blocked on us. It is the entire content of
   * the admin QC queue and the precondition the label gate reads.
   *
   * `dispatched` is one value, not two, because parcel-to-next-vendor and
   * parcel-to-courier are the same fact about the job: this vendor's custody
   * ended.
   *
   * `sent` is retired in CODE ONLY and must stay in the Postgres type. Dropping
   * an enum value means recreating the type and rewriting every dependent
   * column, and rows still carry it until #675's backfill script runs — so the
   * DSL has to keep reading them. The retirement is enforced by the transition
   * matrix giving it zero in-edges and zero out-edges (#676), not here.
   */
  it('adds the two workflow statuses in workflow order and keeps retired `sent` readable', () => {
    const values = productionJobStatusEnum.enumValues
    expect(values).toContain('qc_submitted')
    expect(values).toContain('dispatched')

    // Position is not decoration: the DSL order must match the order Postgres
    // holds, or drizzle-kit sees drift and offers to recreate the type.
    expect(values.indexOf('qc_submitted')).toBe(values.indexOf('qc_passed') - 1)
    expect(values.indexOf('dispatched')).toBe(values.indexOf('cancelled') - 1)

    expect(values).toContain('sent')
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
