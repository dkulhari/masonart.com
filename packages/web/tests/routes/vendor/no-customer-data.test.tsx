/**
 * The vendor portal renders NO customer data. Ever.
 *
 * This is the client-side half of the guarantee `tests/routes/vendor/isolation`
 * makes on the API side (#617, which found two real leaks: a scoped read that
 * returned an order-item handle, and an artwork presigner that would sign
 * user-partitioned storage keys — the user id rode inside the signed URL, where
 * no assertion about JSON keys could see it). Both are fixed.
 *
 * The API must not send customer data. This suite says the client would not
 * display it if a future endpoint regressed and started to. Every fixture below
 * is DELIBERATELY POLLUTED with `customerName`, `shippingAddress`, `phone` and
 * friends, and each screen is asserted to put none of it in the DOM — not as
 * text, not in an attribute, not in a link.
 *
 * Do not weaken this by narrowing the pollution set or by asserting on visible
 * text alone: the whole innerHTML is checked, because a leak into a `title`, an
 * `href` or a `data-` attribute is still a leak.
 *
 * The second half of the file pins the artwork rule: a signed URL is requested
 * AT CLICK TIME and used immediately. Nothing is fetched at render.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

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
  VendorJobsListBody,
  type VendorJobListItem,
} from '~/routes/vendor/index'
import {
  VendorJobDetailBody,
  type VendorJobDetailResponse,
} from '~/routes/vendor/jobs/$id'
import { VendorRatesBody, type VendorRate } from '~/routes/vendor/rates'
import {
  VendorPaymentsBody,
  OutstandingAmount,
  type VendorSettlement,
} from '~/routes/vendor/payments'

afterEach(cleanup)

// ============================================================================
// The pollution
// ============================================================================

/**
 * Everything a vendor must never see, in the shapes it would arrive in if a
 * scoped read were widened or a `select()` replaced by a whole row.
 */
const POLLUTION = {
  customerName: 'Nandini Rao',
  customerEmail: 'nandini.rao@example.com',
  shippingAddress: '221B Turner Road, Bandra West, Mumbai 400050',
  phone: '+919876543210',
  orderId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  orderNumber: 'CHB-2026-000123',
  orderItemId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  userId: 'cccccccc-3333-4333-8333-cccccccccccc',
  retailPrice: '4999.00',
  buyerNote: 'Please gift wrap for Anaya',
}

const POLLUTED_VALUES = Object.values(POLLUTION)

/** Whole-markup check: text, attributes, hrefs, everything. */
function expectNoCustomerData(html: string) {
  for (const value of POLLUTED_VALUES) {
    expect(html).not.toContain(value)
  }
}

// ============================================================================
// Fixtures — every one carries the pollution
// ============================================================================

const pollutedJob: VendorJobListItem & typeof POLLUTION = {
  id: '11111111-1111-4111-8111-111111111111',
  stage: 'print',
  status: 'assigned',
  dueAt: '2026-09-01T00:00:00.000Z',
  sentAt: null,
  receivedAt: null,
  amountExpected: '850.00',
  amountActual: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  ...POLLUTION,
}

const pollutedDetail: VendorJobDetailResponse = {
  job: {
    id: '11111111-1111-4111-8111-111111111111',
    stage: 'frame',
    status: 'received',
    dueAt: '2026-09-01T00:00:00.000Z',
    sentAt: null,
    receivedAt: '2026-08-12T00:00:00.000Z',
    amountExpected: '1250.00',
    amountActual: '1250.00',
    ...POLLUTION,
  } as VendorJobDetailResponse['job'],
  items: [
    { id: '22222222-2222-4222-8222-222222222222', ...POLLUTION },
  ] as VendorJobDetailResponse['items'],
  reviews: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      verdict: 'fail',
      defects: ['banding'],
      notes: 'Reprint the top third.',
      createdAt: '2026-08-13T00:00:00.000Z',
      ...POLLUTION,
    },
  ] as VendorJobDetailResponse['reviews'],
}

const pollutedRate: VendorRate & typeof POLLUTION = {
  id: '44444444-4444-4444-8444-444444444444',
  vendorId: '55555555-5555-4555-8555-555555555555',
  kind: 'print',
  longestEdgeMinInches: 12,
  longestEdgeMaxInches: 24,
  finish: 'matte',
  amount: '450.00',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  ...POLLUTION,
}

const pollutedSettlement: VendorSettlement & typeof POLLUTION = {
  id: '66666666-6666-4666-8666-666666666666',
  vendorId: '55555555-5555-4555-8555-555555555555',
  amount: '12500.00',
  reference: 'NEFT-77812',
  note: 'August run',
  paidAt: '2026-08-01T00:00:00.000Z',
  createdAt: '2026-08-01T00:00:00.000Z',
  ...POLLUTION,
}

// ============================================================================
// Every screen, against polluted data
// ============================================================================

describe('no customer data reaches the DOM', () => {
  it('the assertion has teeth', () => {
    // A guard on the guard: if `expectNoCustomerData` ever stopped checking,
    // every test below would pass by doing nothing.
    expect(() =>
      expectNoCustomerData(`<td title="${POLLUTION.shippingAddress}">x</td>`)
    ).toThrow()
    expect(() => expectNoCustomerData('<td>850.00</td>')).not.toThrow()
  })

  it('my jobs renders the job and none of the customer fields', () => {
    const { container } = render(
      <VendorJobsListBody jobs={[pollutedJob]} isLoading={false} error={null} onRetry={() => {}} />
    )

    // The row IS rendered — this is not passing by rendering nothing.
    expect(screen.getByTestId(`vendor-job-row-${pollutedJob.id}`)).toBeInTheDocument()
    expectNoCustomerData(container.innerHTML)
  })

  it('the job detail renders items and QC and none of the customer fields', () => {
    const { container } = render(
      <VendorJobDetailBody data={pollutedDetail} isLoading={false} error={null} onRetry={() => {}} />
    )

    expect(screen.getByTestId('vendor-job-detail')).toBeInTheDocument()
    expect(
      screen.getByTestId(`vendor-job-item-${pollutedDetail.items[0].id}`)
    ).toBeInTheDocument()
    expectNoCustomerData(container.innerHTML)
  })

  it('my rates renders the band and none of the customer fields', () => {
    const { container } = render(
      <VendorRatesBody rates={[pollutedRate]} isLoading={false} error={null} onRetry={() => {}} />
    )

    expect(screen.getByTestId(`vendor-rate-row-${pollutedRate.id}`)).toBeInTheDocument()
    expectNoCustomerData(container.innerHTML)
  })

  it('my payments renders the settlement and none of the customer fields', () => {
    const { container } = render(
      <VendorPaymentsBody
        settlements={[pollutedSettlement]}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )

    expect(
      screen.getByTestId(`vendor-settlement-row-${pollutedSettlement.id}`)
    ).toBeInTheDocument()
    expectNoCustomerData(container.innerHTML)
  })

  it('the outstanding tile leaks nothing either', () => {
    const { container } = render(
      <OutstandingAmount payableTotal="7300.00" isLoading={false} error={null} />
    )
    expect(screen.getByTestId('vendor-payments-outstanding')).toBeInTheDocument()
    expectNoCustomerData(container.innerHTML)
  })
})

// ============================================================================
// The artwork URL is requested at click time, never at page load
// ============================================================================

describe('artwork download', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches NO signed URL while the job is merely on screen', () => {
    render(
      <VendorJobDetailBody data={pollutedDetail} isLoading={false} error={null} onRetry={() => {}} />
    )

    // A URL fetched at page load expires while the page sits open, and the fix
    // that suggests itself — a longer expiry — is the incident signing exists
    // to prevent. So: nothing at all.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the signed URL on click and uses it immediately', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        itemId: pollutedDetail.items[0].id,
        url: 'https://cdn.example.com/products/originals/abc.png?X-Amz-Signature=deadbeef',
        expiresInSeconds: 300,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      }),
    })

    render(
      <VendorJobDetailBody data={pollutedDetail} isLoading={false} error={null} onRetry={() => {}} />
    )

    fireEvent.click(
      screen.getByTestId(`vendor-artwork-download-${pollutedDetail.items[0].id}`)
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/vendor/jobs/${pollutedDetail.job.id}/artwork/${pollutedDetail.items[0].id}`
    )
    // The session cookie is the only thing requireVendor reads.
    expect(init.credentials).toBe('include')

    // Used in the same tick it was obtained, and not parked in the DOM.
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
    expect(document.body.querySelectorAll('a[href*="X-Amz-Signature"]').length).toBe(0)
  })

  it('does not render a signed URL into any href before the click', () => {
    const { container } = render(
      <VendorJobDetailBody data={pollutedDetail} isLoading={false} error={null} onRetry={() => {}} />
    )

    // The download control is a button, not a link with a URL already in it.
    const control = screen.getByTestId(
      `vendor-artwork-download-${pollutedDetail.items[0].id}`
    )
    expect(control.tagName).toBe('BUTTON')
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.innerHTML).not.toContain('artwork/')
  })
})
