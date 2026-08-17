/**
 * /admin/audit-log — the trail, read by a human.
 *
 * Two hazards are pinned here, both learned the hard way elsewhere in this tree.
 *
 * ## The search schema
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every value a STRING on the way in. A `validateSearch` schema written against
 * real numbers throws on the first navigation, and a throw inside
 * `validateSearch` does not surface as a validation message — the route
 * error-boundaries and the admin gets a blank page. So the schema coerces, and
 * every nonsense URL degrades to the default view instead of throwing.
 *
 * Note this is NOT the API's `auditLogQuerySchema`, which rejects a limit of
 * 5000 with a 400. That is right for an API and wrong for a URL bar: a stale
 * bookmark should show the first page, not an error page.
 *
 * ## The three list states
 *
 * Skeleton, empty AND error. The missing one is almost always the error state,
 * which is how #602 and #606 happened: a failed request rendered a confident 0.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => () => {},
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    search?: unknown
    className?: string
  }) => <a href={props.to}>{children}</a>,
}))

import {
  auditLogSearchSchema,
  AuditLogBody,
  type AuditLogRow,
} from '~/routes/admin/audit-log/index'

afterEach(cleanup)

const row = (overrides: Partial<AuditLogRow> = {}): AuditLogRow => ({
  id: '4f6c4a4e-1b3f-4b1a-9a2e-3a1f6f2c6a11',
  createdAt: '2026-08-17T07:00:00.000Z',
  actorUserId: 'admin-1',
  actorEmail: 'admin@chobii.art',
  actorRole: 'admin',
  action: 'return.refund_processed',
  category: 'money',
  outcome: 'success',
  summary: 'Refunded 1240 on return r1',
  entityType: 'return',
  entityId: 'r1',
  before: { status: 'approved' },
  after: { status: 'refunded' },
  metadata: { method: 'POST', path: '/api/admin/returns/r1/process-refund' },
  requestId: 'req_1',
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  ...overrides,
})

describe('auditLogSearchSchema', () => {
  it('coerces the string limit the URL delivers', () => {
    expect(auditLogSearchSchema.parse({ limit: '25' }).limit).toBe(25)
  })

  it('splits a comma-joined category list', () => {
    expect(auditLogSearchSchema.parse({ category: 'money,privilege' }).category).toEqual([
      'money',
      'privilege',
    ])
  })

  it('applies the documented defaults when the URL carries nothing', () => {
    const parsed = auditLogSearchSchema.parse({})

    expect(parsed.limit).toBe(50)
    expect(parsed.category).toBeUndefined()
    expect(parsed.q).toBeUndefined()
  })

  it.each([
    { limit: 'lots' },
    { limit: '-4' },
    { limit: '999999' },
    { category: 'everything' },
    { outcome: 'maybe' },
    { from: 'yesterday' },
  ])('never throws on a nonsense URL: %o', (search) => {
    expect(() => auditLogSearchSchema.parse(search)).not.toThrow()
  })

  it('drops an unknown category rather than sending it to the API', () => {
    // The API rejects an unregistered value with a 400, which as a blank list
    // would look like "nothing ever happened" — the worst possible lie here.
    expect(auditLogSearchSchema.parse({ category: 'money,everything' }).category).toEqual([
      'money',
    ])
  })
})

describe('AuditLogBody', () => {
  it('renders a row with actor, action and entity', () => {
    render(<AuditLogBody entries={[row()]} isLoading={false} error={null} />)

    expect(screen.getByText('admin@chobii.art')).toBeInTheDocument()
    expect(screen.getByText(/refund_processed/)).toBeInTheDocument()
    // The entity cell, specifically — the summary also mentions the return, so
    // an unanchored match finds two nodes and proves nothing about either.
    expect(screen.getByText('return r1')).toBeInTheDocument()
  })

  it('shows a skeleton while loading, and no fabricated emptiness', () => {
    render(<AuditLogBody entries={[]} isLoading error={null} />)

    expect(screen.getByTestId('audit-log-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/no audit entries/i)).not.toBeInTheDocument()
  })

  it('shows the empty state only when the load actually succeeded', () => {
    render(<AuditLogBody entries={[]} isLoading={false} error={null} />)

    expect(screen.getByText(/no audit entries/i)).toBeInTheDocument()
  })

  it('shows an error instead of an empty table when the request failed', () => {
    render(<AuditLogBody entries={[]} isLoading={false} error="Could not load the audit log." />)

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the audit log.')
    // A failed request that renders "no entries" reads as "nothing happened",
    // which for an audit log is the most dangerous possible wrong answer.
    expect(screen.queryByText(/no audit entries/i)).not.toBeInTheDocument()
  })

  it('marks a failed action so a refusal is visible in the list', () => {
    render(
      <AuditLogBody
        entries={[row({ outcome: 'failure', summary: 'Refused: cannot change your own role' })]}
        isLoading={false}
        error={null}
      />
    )

    // Twice over: the badge in the action cell and the handler's own summary.
    // The badge is the one that matters — a refusal must be visible without
    // reading the summary column.
    expect(screen.getAllByText(/refused/i).length).toBeGreaterThanOrEqual(2)
  })

  it('opens a detail panel showing both sides of the change', () => {
    render(<AuditLogBody entries={[row()]} isLoading={false} error={null} />)

    fireEvent.click(screen.getByRole('button', { name: /view details/i }))

    const panel = screen.getByTestId('audit-log-detail')
    expect(panel).toHaveTextContent('approved')
    expect(panel).toHaveTextContent('refunded')
    // The request id is the join key back to the API logs, so it has to be
    // readable rather than merely stored.
    expect(panel).toHaveTextContent('req_1')
  })

  it('shows the client IP in the detail, which is half of any intrusion question', () => {
    render(<AuditLogBody entries={[row()]} isLoading={false} error={null} />)

    fireEvent.click(screen.getByRole('button', { name: /view details/i }))

    expect(screen.getByTestId('audit-log-detail')).toHaveTextContent('203.0.113.7')
  })

  it('still names the actor when the account has since been deleted', () => {
    render(
      <AuditLogBody
        entries={[row({ actorUserId: null, actorEmail: 'gone@chobii.art' })]}
        isLoading={false}
        error={null}
      />
    )

    expect(screen.getByText('gone@chobii.art')).toBeInTheDocument()
  })
})
