/**
 * The four vendor screens: search schemas, the three list states, and the
 * two-step confirm.
 *
 * ## The search schemas first, because they are the blank-page hazard
 *
 * `router.tsx` replaces TanStack's search serialisation with a pair that keeps
 * every incoming value a STRING and `String(value)` on the way out. A
 * `validateSearch` schema written against real numbers therefore throws on the
 * first navigation, and a throw there does not surface as a validation message
 * — the route error-boundaries into a blank page. So every non-string param is
 * coerced and every field `.catch()`es to a usable default.
 *
 * ## Then the three states
 *
 * Skeleton, empty AND error, mutually exclusive, error winning. The missing
 * state on 9 of 13 admin lists is the error one, which is exactly how #602 and
 * #606 happened: a failed request rendered a confident `0`. Every error block
 * here is asserted to be DIGIT-FREE, and the payments screen — the one where a
 * wrong zero means "we owe you nothing" — is asserted twice.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => () => {},
  Link: ({
    children,
    to,
  }: {
    children?: React.ReactNode
    to?: string
    params?: unknown
    search?: unknown
    className?: string
  }) => <a href={to}>{children}</a>,
}))

import {
  vendorJobsSearchSchema,
  VendorJobsListBody,
  DueCell,
  type VendorJobListItem,
} from '~/routes/vendor/index'
import {
  VendorJobDetailBody,
  InlineConfirm,
  type VendorJobDetailResponse,
} from '~/routes/vendor/jobs/$id'
import { VendorRatesBody, bandLabel, isCurrentBand, type VendorRate } from '~/routes/vendor/rates'
import {
  vendorPaymentsSearchSchema,
  VendorPaymentsBody,
  OutstandingAmount,
} from '~/routes/vendor/payments'
import { formatVendorAmount, VENDOR_JOBS_PAGE_SIZE } from '~/lib/vendor-nav'

afterEach(cleanup)

/** What `router.tsx` actually hands `validateSearch`: strings, always. */
const asUrlWouldDeliver = (search: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(search)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  )

// ============================================================================
// Search schemas
// ============================================================================

describe('vendorJobsSearchSchema', () => {
  it('coerces the string page and pageSize the URL delivers', () => {
    expect(
      vendorJobsSearchSchema.parse(asUrlWouldDeliver({ page: 3, pageSize: 50 }))
    ).toMatchObject({ page: 3, pageSize: 50 })
  })

  it('defaults an empty search rather than throwing', () => {
    expect(vendorJobsSearchSchema.parse({})).toMatchObject({
      page: 1,
      pageSize: VENDOR_JOBS_PAGE_SIZE,
    })
  })

  it('degrades garbage to the default view instead of a blank page', () => {
    // A hand-typed or stale URL must not error-boundary the route.
    expect(() =>
      vendorJobsSearchSchema.parse(
        asUrlWouldDeliver({ page: 'banana', pageSize: '-4', status: 'nonsense' })
      )
    ).not.toThrow()

    const parsed = vendorJobsSearchSchema.parse(
      asUrlWouldDeliver({ page: 'banana', pageSize: '-4', status: 'nonsense' })
    )
    expect(parsed).toMatchObject({ page: 1, pageSize: VENDOR_JOBS_PAGE_SIZE })
    expect(parsed.status).toBeUndefined()
  })

  it('clamps an absurd pageSize rather than rejecting it', () => {
    expect(vendorJobsSearchSchema.parse(asUrlWouldDeliver({ pageSize: 100000 }))).toMatchObject({
      pageSize: 100,
    })
  })

  it('keeps a real status filter', () => {
    expect(vendorJobsSearchSchema.parse(asUrlWouldDeliver({ status: 'qc_failed' }))).toMatchObject({
      status: 'qc_failed',
    })
  })
})

describe('vendorPaymentsSearchSchema', () => {
  it('coerces and defaults exactly like the jobs one', () => {
    expect(vendorPaymentsSearchSchema.parse(asUrlWouldDeliver({ page: 2 }))).toMatchObject({
      page: 2,
      pageSize: 20,
    })
    expect(() => vendorPaymentsSearchSchema.parse(asUrlWouldDeliver({ page: 'x' }))).not.toThrow()
    expect(vendorPaymentsSearchSchema.parse(asUrlWouldDeliver({ page: 'x' }))).toMatchObject({
      page: 1,
    })
  })
})

// ============================================================================
// Fixtures
// ============================================================================

const job: VendorJobListItem = {
  id: '11111111-1111-4111-8111-111111111111',
  stage: 'print',
  status: 'assigned',
  dueAt: '2026-09-01T00:00:00.000Z',
  sentAt: null,
  receivedAt: null,
  amountExpected: '850.00',
  amountActual: null,
  createdAt: '2026-08-10T00:00:00.000Z',
}

const detail: VendorJobDetailResponse = {
  job: {
    id: job.id,
    stage: 'print',
    status: 'assigned',
    dueAt: job.dueAt,
    sentAt: null,
    receivedAt: null,
    amountExpected: '850.00',
    amountActual: null,
  },
  items: [{ id: '22222222-2222-4222-8222-222222222222' }],
  reviews: [],
}

const rate: VendorRate = {
  id: '44444444-4444-4444-8444-444444444444',
  vendorId: '55555555-5555-4555-8555-555555555555',
  kind: 'print',
  longestEdgeMinInches: 12,
  longestEdgeMaxInches: 24,
  finish: 'matte',
  amount: '450.00',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
}

/** No digit anywhere in the error block — the whole point of #602/#606. */
function expectDigitFree(html: string) {
  const text = html.replace(/<[^>]*>/g, ' ')
  expect(text).not.toMatch(/\d/)
}

// ============================================================================
// Three states, four screens
// ============================================================================

describe('my jobs — the three states', () => {
  it('shows a skeleton while loading', () => {
    render(<VendorJobsListBody jobs={[]} isLoading error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-jobs-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-jobs-empty')).not.toBeInTheDocument()
  })

  it('shows an empty state when the queue really is empty', () => {
    render(<VendorJobsListBody jobs={[]} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-jobs-empty')).toBeInTheDocument()
  })

  it('shows the error INSTEAD of an empty state, with no numbers in it', () => {
    render(
      <VendorJobsListBody
        jobs={[]}
        isLoading={false}
        error="Failed to load your jobs"
        onRetry={() => {}}
      />
    )
    const block = screen.getByTestId('vendor-jobs-error')
    expect(block).toBeInTheDocument()
    // An empty state after a failed request is a lie about the data.
    expect(screen.queryByTestId('vendor-jobs-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vendor-jobs-table')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })

  it('error wins even when rows are still in hand', () => {
    render(
      <VendorJobsListBody jobs={[job]} isLoading error="Network error" onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-jobs-error')).toBeInTheDocument()
    expect(screen.queryByTestId('vendor-jobs-skeleton')).not.toBeInTheDocument()
  })

  it('retry is wired', () => {
    const onRetry = vi.fn()
    render(<VendorJobsListBody jobs={[]} isLoading={false} error="boom" onRetry={onRetry} />)
    fireEvent.click(screen.getByTestId('vendor-jobs-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('never prints a fallback zero for an unreadable amount', () => {
    render(
      <VendorJobsListBody
        jobs={[{ ...job, amountExpected: null, amountActual: null }]}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })
})

describe('the job detail — the three states and the two writes', () => {
  it('shows a skeleton, then the job', () => {
    const { rerender } = render(
      <VendorJobDetailBody data={null} isLoading error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-job-skeleton')).toBeInTheDocument()

    rerender(<VendorJobDetailBody data={detail} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-job-detail')).toBeInTheDocument()
  })

  it('shows a digit-free error instead of the job', () => {
    render(
      <VendorJobDetailBody
        data={null}
        isLoading={false}
        error="Job not found"
        onRetry={() => {}}
      />
    )
    const block = screen.getByTestId('vendor-job-error')
    expect(screen.queryByTestId('vendor-job-detail')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })

  it('asks before marking a job received, and only then calls through', () => {
    const onStatus = vi.fn()
    render(
      <VendorJobDetailBody
        data={detail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        onStatus={onStatus}
      />
    )

    fireEvent.click(screen.getByTestId('vendor-job-mark-received'))
    expect(onStatus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('vendor-job-mark-received-confirm'))
    expect(onStatus).toHaveBeenCalledWith('received')
  })

  it('offers only the two statuses a vendor may set', () => {
    render(
      <VendorJobDetailBody data={detail} isLoading={false} error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-job-mark-received')).toBeInTheDocument()
    expect(screen.getByTestId('vendor-job-mark-sent')).toBeInTheDocument()
    // Passing QC is our verdict to record, not theirs to claim.
    expect(screen.queryByText(/pass(ed)? qc/i)).not.toBeInTheDocument()
  })

  it('cancel disarms the confirm without acting', () => {
    const onStatus = vi.fn()
    render(
      <VendorJobDetailBody
        data={detail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        onStatus={onStatus}
      />
    )
    fireEvent.click(screen.getByTestId('vendor-job-mark-sent'))
    fireEvent.click(screen.getByTestId('vendor-job-mark-sent-cancel'))
    expect(onStatus).not.toHaveBeenCalled()
    expect(screen.getByTestId('vendor-job-mark-sent')).toBeInTheDocument()
  })
})

describe('my rates — read-only, three states', () => {
  it('has a skeleton, an empty and a digit-free error', () => {
    const { rerender } = render(
      <VendorRatesBody rates={[]} isLoading error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-rates-skeleton')).toBeInTheDocument()

    rerender(<VendorRatesBody rates={[]} isLoading={false} error={null} onRetry={() => {}} />)
    expect(screen.getByTestId('vendor-rates-empty')).toBeInTheDocument()

    rerender(
      <VendorRatesBody rates={[]} isLoading={false} error="Failed" onRetry={() => {}} />
    )
    const block = screen.getByTestId('vendor-rates-error')
    expect(screen.queryByTestId('vendor-rates-empty')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })

  it('renders a band and offers no way to change it', () => {
    const { container } = render(
      <VendorRatesBody rates={[rate]} isLoading={false} error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId(`vendor-rate-row-${rate.id}`)).toBeInTheDocument()
    expect(screen.getByText('₹450.00')).toBeInTheDocument()
    // Read-only means no form controls at all on this screen.
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('describes bands in words', () => {
    expect(bandLabel(rate)).toBe('12–24″')
    expect(bandLabel({ ...rate, longestEdgeMinInches: null })).toBe('Up to 24″')
    expect(bandLabel({ ...rate, longestEdgeMaxInches: null })).toBe('Over 12″')
    expect(
      bandLabel({ ...rate, longestEdgeMinInches: null, longestEdgeMaxInches: null })
    ).toBe('Any size')
  })

  it('knows which band is in force', () => {
    const now = new Date('2026-06-01T00:00:00.000Z')
    expect(isCurrentBand(rate, now)).toBe(true)
    expect(isCurrentBand({ ...rate, effectiveTo: '2026-03-01T00:00:00.000Z' }, now)).toBe(false)
    expect(isCurrentBand({ ...rate, effectiveFrom: '2026-09-01T00:00:00.000Z' }, now)).toBe(false)
  })
})

describe('my payments — an error is never a zero', () => {
  it('states the outstanding amount only on a successful read', () => {
    const { rerender, container } = render(
      <OutstandingAmount payableTotal={null} isLoading error={null} />
    )
    expect(screen.getByTestId('vendor-payments-outstanding-loading')).toBeInTheDocument()
    expectDigitFree(container.innerHTML)

    rerender(<OutstandingAmount payableTotal={null} isLoading={false} error="Failed" />)
    const failed = screen.getByTestId('vendor-payments-outstanding-unknown')
    // The one thing this must never say is ₹0.00.
    expect(failed.textContent).not.toContain('0')
    expectDigitFree(failed.innerHTML)

    rerender(<OutstandingAmount payableTotal="7300.00" isLoading={false} error={null} />)
    expect(screen.getByTestId('vendor-payments-outstanding')).toHaveTextContent('₹7,300.00')
  })

  it('shows a genuine zero when the read genuinely says zero', () => {
    // The rule is "no INVENTED zero". A real settled-up balance is information.
    render(<OutstandingAmount payableTotal="0" isLoading={false} error={null} />)
    expect(screen.getByTestId('vendor-payments-outstanding')).toHaveTextContent('₹0.00')
  })

  it('has all three list states, error digit-free', () => {
    const { rerender } = render(
      <VendorPaymentsBody settlements={[]} isLoading error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-payments-skeleton')).toBeInTheDocument()

    rerender(
      <VendorPaymentsBody settlements={[]} isLoading={false} error={null} onRetry={() => {}} />
    )
    expect(screen.getByTestId('vendor-payments-empty')).toBeInTheDocument()

    rerender(
      <VendorPaymentsBody settlements={[]} isLoading={false} error="Failed" onRetry={() => {}} />
    )
    const block = screen.getByTestId('vendor-payments-error')
    expect(screen.queryByTestId('vendor-payments-empty')).not.toBeInTheDocument()
    expectDigitFree(block.innerHTML)
  })
})

// ============================================================================
// Formatting and due dates
// ============================================================================

describe('formatting never invents a number', () => {
  it('returns null rather than zero for an unparseable amount', () => {
    expect(formatVendorAmount(null)).toBeNull()
    expect(formatVendorAmount('')).toBeNull()
    expect(formatVendorAmount('not-a-number')).toBeNull()
    expect(formatVendorAmount('0')).toBe('₹0.00')
  })

  it('says how late a job is, not just when it was due', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-03T10:00:00.000Z'))
    render(<DueCell dueAt="2026-09-01T00:00:00.000Z" />)
    expect(screen.getByText(/2 days late/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('says so when there is no due date', () => {
    render(<DueCell dueAt={null} />)
    expect(screen.getByText('No due date')).toBeInTheDocument()
  })
})

// ============================================================================
// Exactly four screens, and no native dialogs
// ============================================================================

describe('the shape of the portal', () => {
  const files = [
    'app/routes/vendor.tsx',
    'app/routes/vendor/index.tsx',
    'app/routes/vendor/jobs/$id.tsx',
    'app/routes/vendor/rates.tsx',
    'app/routes/vendor/payments.tsx',
  ]

  /**
   * Comments are stripped first. Every one of these files EXPLAINS why it does
   * not use a native dialog, and an assertion that trips over its own rationale
   * teaches the next person to delete the rationale.
   */
  const codeOf = (file: string) =>
    readFileSync(join(process.cwd(), file), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('uses no native confirm or alert anywhere', () => {
    for (const file of files) {
      const source = codeOf(file)
      // A native dialog blocks the automation harness, so a path guarded by one
      // can never be covered end to end. InlineConfirm exists for this.
      expect(source).not.toMatch(/(?<![\w.])(window\.)?confirm\s*\(/)
      expect(source).not.toMatch(/(?<![\w.])(window\.)?alert\s*\(/)
    }
  })

  it('is exactly four screens under one layout — no fifth', () => {
    // Four deliberately. A print shop will not learn more than that, and every
    // added screen is another thing that has to be right about isolation.
    const routeFiles: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(dir, entry.name), `${prefix}${entry.name}/`)
        } else if (entry.name.endsWith('.tsx')) {
          routeFiles.push(`${prefix}${entry.name}`)
        }
      }
    }
    walk(join(process.cwd(), 'app/routes/vendor'), '')

    expect(routeFiles.sort()).toEqual(['index.tsx', 'jobs/$id.tsx', 'payments.tsx', 'rates.tsx'])
  })

  it('the inline confirm is a two-step, not a dialog', () => {
    const onConfirm = vi.fn()
    render(
      <InlineConfirm
        testId="probe"
        label="Do it"
        question="Sure?"
        onConfirm={onConfirm}
      />
    )
    expect(screen.queryByTestId('probe-confirm')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('probe'))
    expect(screen.getByText('Sure?')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('probe-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
