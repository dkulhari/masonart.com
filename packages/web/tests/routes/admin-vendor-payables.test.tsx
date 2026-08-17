/**
 * /admin/vendors/$id — the payables tab and settlement recording (#619).
 *
 * This is the admin screen where a mistake costs money, so the suite is
 * weighted towards the two failures that cost the most:
 *
 * ## A fabricated total (#602, #606)
 *
 * When the payables request fails there must be NO total on screen. Not a
 * zero, not a dash standing in for one. `₹0.00` beside a vendor's name reads
 * as "we owe this vendor nothing", which is a claim about money that nothing
 * in the system actually made. The error-path test therefore asserts both
 * halves: the error is shown, AND no digit survives anywhere in the rendered
 * output.
 *
 * ## A settlement recorded against a remembered number
 *
 * Recording a settlement stamps `settlementId` on the selected rows and is not
 * undoable from this screen. The affordance is the two-step inline pattern
 * from `ReviewMediaStrip` — never a native dialog, which blocks the browser
 * automation harness outright and is why nine admin files have no E2E cover on
 * their destructive paths. The second step restates the exact job count and
 * the exact amount, so the confirming click lands on the real number.
 *
 * Money is INR rupees with two decimals throughout, in both directions on the
 * wire. There is no paise conversion on this screen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Only the router is stubbed. `./index` (imported for `formatRupees`) is a
 * route module, so `createFileRoute` runs at import time and throws without
 * this — the same trade `vendors-list.test.tsx` makes.
 */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => () => {},
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    params?: Record<string, string>
    search?: unknown
    className?: string
  }) => (
    <a href={props.to} className={props.className}>
      {children}
    </a>
  ),
}))

import {
  VendorPayablesSection,
  type AdminPayableJob,
  type VendorPayablesPayload,
} from '~/routes/admin/vendors/$id.payables'

const SOURCE = readFileSync(
  join(process.cwd(), 'app/routes/admin/vendors/$id.payables.tsx'),
  'utf8'
)

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like GET /api/admin/vendors/:id/payables
// ---------------------------------------------------------------------------

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'
const JOB_A = '22222222-2222-4222-8222-222222222222'
const JOB_B = '33333333-3333-4333-8333-333333333333'

function job(overrides: Partial<AdminPayableJob> = {}): AdminPayableJob {
  return {
    id: JOB_A,
    orderId: '44444444-4444-4444-8444-444444444444',
    stage: 'print',
    status: 'received',
    dueAt: null,
    sentAt: '2026-08-01T10:00:00.000Z',
    receivedAt: '2026-08-04T10:00:00.000Z',
    amountExpected: '4500.00',
    amountActual: null,
    settlementId: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    amount: '4500.00',
    ...overrides,
  }
}

/** Priced at the expectation: no override was ever recorded. */
const expectedOnly = job()

/** Re-priced on receipt. `amountActual` is what we owe; 9,000 is not. */
const overridden = job({
  id: JOB_B,
  stage: 'frame',
  amountExpected: '9000.00',
  amountActual: '8000.00',
  amount: '8000.00',
})

const BOTH: VendorPayablesPayload = {
  vendorId: VENDOR_ID,
  jobs: [expectedOnly, overridden],
  jobCount: 2,
  total: '12500.00',
}

/** What is left after the 8,000 job is settled. */
const AFTER_SETTLEMENT: VendorPayablesPayload = {
  vendorId: VENDOR_ID,
  jobs: [expectedOnly],
  jobCount: 1,
  total: '4500.00',
}

// ---------------------------------------------------------------------------
// fetch harness
// ---------------------------------------------------------------------------

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const created = (body: unknown) => ({ ok: true, status: 201, json: async () => body })
const failed = (status: number, error: string) => ({
  ok: false,
  status,
  json: async () => ({ error }),
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderTab = () => render(<VendorPayablesSection vendorId={VENDOR_ID} />)

const postCalls = () =>
  fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
  )

// ===========================================================================
// 1. The list and the running total
// ===========================================================================

describe('unsettled jobs and the running total', () => {
  it('renders each job at its payable amount — the override where there is one', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    const table = await screen.findByTestId('vendor-payables-table')
    expect(table).toBeInTheDocument()

    const rowA = screen.getByTestId(`vendor-payable-row-${JOB_A}`)
    expect(rowA.textContent).toContain('₹4,500.00')

    const rowB = screen.getByTestId(`vendor-payable-row-${JOB_B}`)
    // The override, not the expectation. Paying 9,000 for a job re-priced at
    // 8,000 is exactly the mistake this screen exists to avoid.
    expect(rowB.textContent).toContain('₹8,000.00')
    expect(rowB.textContent).not.toContain('9,000')
  })

  it('shows the outstanding total the API derived', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    const total = await screen.findByTestId('vendor-payables-total')
    expect(total.textContent).toContain('₹12,500.00')
  })

  it('reads the payables endpoint for this vendor', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()
    await screen.findByTestId('vendor-payables-table')

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/api/admin/vendors/${VENDOR_ID}/payables`
    )
  })

  it('renders an empty state, not an empty table, when nothing is outstanding', async () => {
    fetchMock.mockResolvedValue(
      ok({ vendorId: VENDOR_ID, jobs: [], jobCount: 0, total: '0.00' })
    )
    renderTab()

    expect(await screen.findByTestId('vendor-payables-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-payables-table')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// 2. The failed request — no fabricated total (#602, #606)
// ===========================================================================

describe('a failed payables request', () => {
  it('renders an error state with a retry', async () => {
    fetchMock.mockResolvedValue(failed(500, 'Payables could not be read'))
    renderTab()

    const state = await screen.findByTestId('vendor-payables-error')
    expect(state.textContent).toMatch(/payables could not be read/i)
    expect(screen.getByTestId('vendor-payables-retry')).toBeInTheDocument()
  })

  it('shows NO total — a fabricated zero here reads as "we owe nothing"', async () => {
    fetchMock.mockResolvedValue(failed(500, 'Payables could not be read'))
    const { container } = renderTab()

    await screen.findByTestId('vendor-payables-error')

    expect(screen.queryByTestId('vendor-payables-total')).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('₹')
    // The literal assertion the ticket asks for, and then the general one:
    // no zero, and no other invented digit either.
    expect(container.textContent).not.toContain('0')
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('offers no settlement form against a total nobody read', async () => {
    fetchMock.mockResolvedValue(failed(500, 'Payables could not be read'))
    renderTab()
    await screen.findByTestId('vendor-payables-error')

    expect(screen.queryByTestId('vendor-settlement-amount')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vendor-settlement-submit')).not.toBeInTheDocument()
  })

  it('retries the read rather than leaving the admin stuck', async () => {
    fetchMock.mockResolvedValueOnce(failed(500, 'Payables could not be read'))
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.click(await screen.findByTestId('vendor-payables-retry'))

    const total = await screen.findByTestId('vendor-payables-total')
    expect(total.textContent).toContain('₹12,500.00')
    expect(screen.queryByTestId('vendor-payables-error')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// 3. Selection drives the settlement amount
// ===========================================================================

describe('selection', () => {
  it('defaults the amount to the whole outstanding total', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    const amount = (await screen.findByTestId(
      'vendor-settlement-amount'
    )) as HTMLInputElement
    expect(amount.value).toBe('12500.00')
  })

  it('re-derives the amount from the subset when a job is deselected', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    await screen.findByTestId('vendor-payables-table')
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_B}`))

    const amount = screen.getByTestId('vendor-settlement-amount') as HTMLInputElement
    expect(amount.value).toBe('4500.00')
    expect(screen.getByTestId('vendor-payables-selected-total').textContent).toContain(
      '₹4,500.00'
    )
  })

  it('leaves the outstanding total alone — deselecting is not paying', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    await screen.findByTestId('vendor-payables-table')
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_B}`))

    expect(screen.getByTestId('vendor-payables-total').textContent).toContain(
      '₹12,500.00'
    )
  })

  it('will not offer to record a settlement against no jobs at all', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    await screen.findByTestId('vendor-payables-table')
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_A}`))
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_B}`))

    expect(screen.getByTestId('vendor-settlement-submit')).toBeDisabled()
  })
})

// ===========================================================================
// 4. An edited amount surfaces the difference
// ===========================================================================

describe('an amount edited away from the derived total', () => {
  it('stays editable — a vendor may be paid a rounded figure', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    const amount = (await screen.findByTestId(
      'vendor-settlement-amount'
    )) as HTMLInputElement
    fireEvent.change(amount, { target: { value: '12000.00' } })

    expect(amount.value).toBe('12000.00')
  })

  it('shows the difference rather than accepting it silently', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.change(await screen.findByTestId('vendor-settlement-amount'), {
      target: { value: '12000.00' },
    })

    const diff = screen.getByTestId('vendor-settlement-difference')
    expect(diff.textContent).toContain('₹500.00')
    expect(diff.textContent).toMatch(/less/i)
    expect(diff.textContent).toContain('₹12,500.00')
  })

  it('names an overpayment as one', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.change(await screen.findByTestId('vendor-settlement-amount'), {
      target: { value: '13000.00' },
    })

    const diff = screen.getByTestId('vendor-settlement-difference')
    expect(diff.textContent).toContain('₹500.00')
    expect(diff.textContent).toMatch(/more/i)
  })

  it('says nothing when the amount and the derived total agree', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    await screen.findByTestId('vendor-settlement-amount')
    expect(
      screen.queryByTestId('vendor-settlement-difference')
    ).not.toBeInTheDocument()
  })

  it('stops re-deriving once the admin has typed a figure of their own', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.change(await screen.findByTestId('vendor-settlement-amount'), {
      target: { value: '12000.00' },
    })
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_B}`))

    const amount = screen.getByTestId('vendor-settlement-amount') as HTMLInputElement
    expect(amount.value).toBe('12000.00')
    // …and the disagreement is now against the NEW derived total.
    expect(screen.getByTestId('vendor-settlement-difference').textContent).toContain(
      '₹4,500.00'
    )
  })
})

// ===========================================================================
// 5. The two-step inline confirm
// ===========================================================================

describe('recording a settlement', () => {
  it('uses no native dialog anywhere in the file', () => {
    // `window.confirm` blocks the automation harness outright, so a path
    // guarded by one can never be covered end to end.
    expect(SOURCE).not.toMatch(/(?<![A-Za-z.$_])confirm\s*\(/)
    expect(SOURCE).not.toMatch(/(?<![A-Za-z.$_])alert\s*\(/)
    expect(SOURCE).not.toContain('window.confirm')
    expect(SOURCE).not.toContain('window.alert')
  })

  it('asks first, inline, and posts nothing on the first click', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.click(await screen.findByTestId('vendor-settlement-submit'))

    expect(screen.getByTestId('vendor-settlement-confirm-panel')).toBeInTheDocument()
    expect(postCalls()).toHaveLength(0)
  })

  it('restates the exact job count and the exact amount in the second step', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.click(await screen.findByTestId('vendor-settlement-submit'))

    const panel = screen.getByTestId('vendor-settlement-confirm-panel')
    expect(panel.textContent).toContain('₹12,500.00')
    expect(panel.textContent).toMatch(/2 jobs/i)
  })

  it('restates the edited amount AND the derived total when they disagree', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.change(await screen.findByTestId('vendor-settlement-amount'), {
      target: { value: '12000.00' },
    })
    fireEvent.click(screen.getByTestId('vendor-settlement-submit'))

    const panel = screen.getByTestId('vendor-settlement-confirm-panel')
    expect(panel.textContent).toContain('₹12,000.00')
    expect(panel.textContent).toContain('₹12,500.00')
  })

  it('backs out cleanly, having written nothing', async () => {
    fetchMock.mockResolvedValue(ok(BOTH))
    renderTab()

    fireEvent.click(await screen.findByTestId('vendor-settlement-submit'))
    fireEvent.click(screen.getByTestId('vendor-settlement-cancel'))

    expect(
      screen.queryByTestId('vendor-settlement-confirm-panel')
    ).not.toBeInTheDocument()
    expect(postCalls()).toHaveLength(0)
  })

  it('posts rupees and the selected job ids on the confirming click', async () => {
    fetchMock.mockResolvedValueOnce(ok(BOTH))
    fetchMock.mockResolvedValueOnce(created({ message: 'Settlement recorded' }))
    fetchMock.mockResolvedValue(ok(AFTER_SETTLEMENT))
    renderTab()

    await screen.findByTestId('vendor-payables-table')
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_A}`))
    fireEvent.click(screen.getByTestId('vendor-settlement-submit'))
    fireEvent.click(screen.getByTestId('vendor-settlement-confirm'))

    await waitFor(() => expect(postCalls()).toHaveLength(1))

    const [url, init] = postCalls()[0]
    expect(String(url)).toContain(`/api/admin/vendors/${VENDOR_ID}/settlements`)

    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.jobIds).toEqual([JOB_B])
    // Decimal rupees, exactly as the API speaks them. No 100x anywhere.
    expect(body.amount).toBe('8000.00')
  })

  it('surfaces a 422 refusal instead of pretending the payment landed', async () => {
    fetchMock.mockResolvedValueOnce(ok(BOTH))
    fetchMock.mockResolvedValue(
      failed(422, 'These jobs are already settled: 3333')
    )
    renderTab()

    fireEvent.click(await screen.findByTestId('vendor-settlement-submit'))
    fireEvent.click(screen.getByTestId('vendor-settlement-confirm'))

    const error = await screen.findByTestId('vendor-settlement-error')
    expect(error.textContent).toMatch(/already settled/i)
    expect(screen.queryByTestId('vendor-settlement-success')).not.toBeInTheDocument()
  })
})

// ===========================================================================
// 6. After the settlement lands
// ===========================================================================

describe('after a settlement is recorded', () => {
  const settle = async () => {
    fetchMock.mockResolvedValueOnce(ok(BOTH))
    fetchMock.mockResolvedValueOnce(created({ message: 'Settlement recorded' }))
    fetchMock.mockResolvedValue(ok(AFTER_SETTLEMENT))
    renderTab()

    await screen.findByTestId('vendor-payables-table')
    fireEvent.click(screen.getByTestId(`vendor-payable-select-${JOB_A}`))
    fireEvent.click(screen.getByTestId('vendor-settlement-submit'))
    fireEvent.click(screen.getByTestId('vendor-settlement-confirm'))
  }

  it('drops the settled job from the list', async () => {
    await settle()

    await waitFor(() =>
      expect(
        screen.queryByTestId(`vendor-payable-row-${JOB_B}`)
      ).not.toBeInTheDocument()
    )
    expect(screen.getByTestId(`vendor-payable-row-${JOB_A}`)).toBeInTheDocument()
  })

  it('drops the outstanding total by exactly the settled amount', async () => {
    await settle()

    await waitFor(() =>
      expect(screen.getByTestId('vendor-payables-total').textContent).toContain(
        '₹4,500.00'
      )
    )
    expect(screen.getByTestId('vendor-payables-total').textContent).not.toContain(
      '12,500'
    )
  })

  it('says so, and closes the confirm', async () => {
    await settle()

    expect(await screen.findByTestId('vendor-settlement-success')).toBeInTheDocument()
    expect(
      screen.queryByTestId('vendor-settlement-confirm-panel')
    ).not.toBeInTheDocument()
  })
})

// ===========================================================================
// Wiring — the tab has to be reachable from the vendor screen
// ===========================================================================

describe('vendor detail wiring', () => {
  const detail = readFileSync(
    join(process.cwd(), 'app/routes/admin/vendors/$id.tsx'),
    'utf8'
  )

  it('mounts the payables tab on /admin/vendors/$id', () => {
    expect(detail).toContain('VendorPayablesSection')
    expect(detail).toContain('$id.payables')
  })
})
