/**
 * Audit log contracts.
 *
 * Two rules these tests exist to hold.
 *
 * First, the action name is a closed set. The audit table is generic — `before`
 * and `after` are jsonb, so the database cannot reject a typo. The registry is
 * the only thing standing between "user.role_changed" and "user.rolechanged"
 * silently becoming two different actions nobody can filter on.
 *
 * Second, every filter arrives as a STRING. router.tsx overrides TanStack's
 * search serialisation, so `?limit=25&category=money,privilege` reaches the
 * route as text; a schema that expects a number or an array error-boundaries
 * the page to blank.
 */

import { describe, it, expect } from 'vitest'
import {
  AUDIT_ACTIONS,
  auditActionSchema,
  auditCategorySchema,
  auditOutcomeSchema,
  auditLogQuerySchema,
  auditLogEntrySchema,
  AUDIT_ACTION_CATEGORY,
} from '../../src/schemas/audit-log'

describe('audit action registry', () => {
  it('carries the money and privilege actions the launch gate depends on', () => {
    expect(AUDIT_ACTIONS).toContain('return.refund_processed')
    expect(AUDIT_ACTIONS).toContain('order.cancelled')
    expect(AUDIT_ACTIONS).toContain('order.status_changed')
    expect(AUDIT_ACTIONS).toContain('user.role_changed')
    expect(AUDIT_ACTIONS).toContain('gift_card.issued')
  })

  it('carries the middleware floor action, so an uninstrumented route still lands', () => {
    expect(AUDIT_ACTIONS).toContain('admin.request')
  })

  it('rejects an unregistered action', () => {
    expect(auditActionSchema.safeParse('user.rolechanged').success).toBe(false)
    expect(auditActionSchema.safeParse('user.role_changed').success).toBe(true)
  })

  it('maps every registered action to a category', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(auditCategorySchema.safeParse(AUDIT_ACTION_CATEGORY[action]).success).toBe(true)
    }
  })

  it('files the money movers under money and the role change under privilege', () => {
    expect(AUDIT_ACTION_CATEGORY['return.refund_processed']).toBe('money')
    expect(AUDIT_ACTION_CATEGORY['gift_card.issued']).toBe('money')
    expect(AUDIT_ACTION_CATEGORY['user.role_changed']).toBe('privilege')
  })
})

describe('audit category and outcome', () => {
  it('accepts the six categories and refuses anything else', () => {
    for (const c of ['money', 'privilege', 'catalogue', 'config', 'content', 'fulfilment']) {
      expect(auditCategorySchema.safeParse(c).success).toBe(true)
    }
    expect(auditCategorySchema.safeParse('everything').success).toBe(false)
  })

  /**
   * `fulfilment` (#673) is the production-pipeline tier: a job moving through
   * print, QC and despatch. It is spelled the British way, matching the
   * `audit_category` value the migration adds — a schema that spells it
   * `fulfillment` refuses every row the database accepts.
   */
  it('accepts fulfilment, and only the spelling the enum uses', () => {
    expect(auditCategorySchema.safeParse('fulfilment').success).toBe(true)
    expect(auditCategorySchema.safeParse('fulfillment').success).toBe(false)
  })

  it('filters on fulfilment through the same comma-joined query the router sends', () => {
    expect(auditLogQuerySchema.parse({ category: 'fulfilment,money' }).category).toEqual([
      'fulfilment',
      'money',
    ])
  })

  it('records a refusal as an outcome, not an absence', () => {
    expect(auditOutcomeSchema.safeParse('failure').success).toBe(true)
    expect(auditOutcomeSchema.safeParse('success').success).toBe(true)
  })
})

describe('auditLogQuerySchema', () => {
  it('coerces a string limit to a number', () => {
    const parsed = auditLogQuerySchema.parse({ limit: '25' })
    expect(parsed.limit).toBe(25)
  })

  it('splits a comma-joined category list into an array', () => {
    const parsed = auditLogQuerySchema.parse({ category: 'money,privilege' })
    expect(parsed.category).toEqual(['money', 'privilege'])
  })

  it('accepts a category array unchanged', () => {
    const parsed = auditLogQuerySchema.parse({ category: ['money'] })
    expect(parsed.category).toEqual(['money'])
  })

  it('defaults the limit and caps it, so a filterless page cannot dump the table', () => {
    expect(auditLogQuerySchema.parse({}).limit).toBe(50)
    expect(auditLogQuerySchema.safeParse({ limit: '5000' }).success).toBe(false)
  })

  it('coerces the date range', () => {
    const parsed = auditLogQuerySchema.parse({ from: '2026-08-01', to: '2026-08-17' })
    expect(parsed.from).toBeInstanceOf(Date)
    expect(parsed.to).toBeInstanceOf(Date)
  })

  it('refuses an unregistered action filter', () => {
    expect(auditLogQuerySchema.safeParse({ action: 'nope.happened' }).success).toBe(false)
  })

  it('parses an empty search the same way the route entry does', () => {
    const parsed = auditLogQuerySchema.parse({})
    expect(parsed.category).toBeUndefined()
    expect(parsed.cursor).toBeUndefined()
  })
})

describe('auditLogEntrySchema', () => {
  const entry = {
    id: '4f6c4a4e-1b3f-4b1a-9a2e-3a1f6f2c6a11',
    createdAt: '2026-08-17T07:00:00.000Z',
    actorUserId: 'user_1',
    actorEmail: 'admin@chobii.art',
    actorRole: 'admin',
    action: 'user.role_changed',
    category: 'privilege',
    outcome: 'success',
    summary: 'admin@chobii.art changed customer@example.com from customer to content-manager',
    entityType: 'user',
    entityId: 'user_2',
    before: { role: 'customer' },
    after: { role: 'content-manager' },
    metadata: { method: 'PUT', path: '/api/admin/customers/user_2/role', status: 200 },
    requestId: 'req_abc',
    ipAddress: '203.0.113.7',
    userAgent: 'Mozilla/5.0',
  }

  it('parses a full row and coerces the timestamp', () => {
    const parsed = auditLogEntrySchema.parse(entry)
    expect(parsed.createdAt).toBeInstanceOf(Date)
    expect(parsed.action).toBe('user.role_changed')
  })

  it('keeps the actor snapshot when the referenced user is gone', () => {
    const parsed = auditLogEntrySchema.parse({ ...entry, actorUserId: null })
    expect(parsed.actorUserId).toBeNull()
    expect(parsed.actorEmail).toBe('admin@chobii.art')
  })
})
