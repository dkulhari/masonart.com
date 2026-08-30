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
 * The second half of the file pins the signature rules — the artwork link, the
 * QC photograph and the carrier label alike: a signed URL is requested AT CLICK
 * TIME, used immediately, and never parked in the DOM. Nothing is fetched at
 * render, and the label is handed to the operating system as bytes rather than
 * rendered into this portal's own markup (§6, R2).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
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
  VendorJobsListBody,
  VendorTransferStrip,
  type VendorJobListItem,
  type VendorTransfer,
} from '~/routes/vendor/index'
import {
  VendorJobDetailBody,
  VendorLabelHandoverCard,
  VendorQcShotList,
  type VendorJobDetailResponse,
  type VendorQcPhotoSet,
} from '~/routes/vendor/jobs/$id'
import { QC_SHOT_LIST, qcShotsForStage } from '@chobii/shared'
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
// The QC shot list — the vendor's own photographs, and R2's signature
// ============================================================================

/**
 * The one-line mechanical replacement for the rule that died with in-house
 * dispatch (§6 of the production-pipeline design).
 *
 * The old absolute — "no customer data crosses this boundary at all" — was
 * assertable only while we shipped everything ourselves. Its replacement (R2)
 * says customer data reaches a vendor ONLY as opaque rendered bytes behind a
 * short-lived signature, handed to the operating system and never rendered into
 * the portal's own DOM. Two assertions carry that here:
 *
 * - **No `iframe`, `embed` or `object` in the container.** Rendering the
 *   carrier's label PDF inline would put a customer's address into the vendor
 *   portal's markup, which is exactly what R2 forbids. The rule is enforced on
 *   the whole screen rather than on the label card, so it cannot be reopened by
 *   a later panel.
 * - **No `X-Amz-Signature` in `innerHTML`.** A signed URL in the DOM is a
 *   capability sitting in a screenshot, a bug report and a session replay. The
 *   vendor's QC photographs are their own work and showing them is the point of
 *   the screen — so they are fetched as bytes and rendered from a local `blob:`
 *   URL. The signature stays in a variable.
 */
const signed =
  'https://r2.example.com/production-qc/j/frame_front/u.jpg?X-Amz-Signature=deadbeefcafe'

/** The job's own stage, so the panel and the job cannot drift apart here. */
const stage = pollutedDetail.job.stage
const firstSlot = QC_SHOT_LIST[stage][0].slot

/**
 * A shot list carrying a signed URL and the pollution, as a leak would.
 *
 * At module scope rather than inside the block below because the label card's
 * suite reuses it: "the whole job screen embeds nothing" is only worth
 * asserting on a screen that has actually rendered media.
 */
const pollutedPhotos: VendorQcPhotoSet = {
  jobId: pollutedDetail.job.id,
  stage,
  status: 'received',
  shots: (qcShotsForStage(stage) ?? []).map((shot, index) => ({
    slot: shot.slot,
    label: shot.label,
    required: shot.required,
    onShotList: true,
    photo:
      index === 0
        ? ({
            id: '77777777-7777-4777-8777-777777777777',
            contentType: 'image/jpeg',
            sizeBytes: 1_048_576,
            uploadedAt: '2026-08-14T09:00:00.000Z',
            reviewId: null,
            url: signed,
            ...POLLUTION,
          } as VendorQcPhotoSet['shots'][number]['photo'])
        : null,
  })),
  missingRequiredSlots: [],
  expiresInSeconds: 300,
  expiresAt: '2026-08-14T09:05:00.000Z',
  ...POLLUTION,
} as VendorQcPhotoSet

describe('the vendor portal embeds nothing and parks no signature', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vendor-qc-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the photograph without putting its signature in the markup', async () => {
    const { container } = render(
      <VendorQcShotList
        stage={stage}
        qc={{ data: pollutedPhotos, isLoading: false, error: null, onRetry: () => {} }}
        canUpload
      />
    )

    await waitFor(() =>
      expect(screen.getByTestId(`vendor-qc-photo-${firstSlot}`)).toHaveAttribute(
        'src',
        'blob:vendor-qc-preview'
      )
    )

    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.innerHTML).not.toContain('r2.example.com')
    expectNoCustomerData(container.innerHTML)
  })

  it('embeds nothing: no iframe, no embed, no object, anywhere on the job screen', async () => {
    const { container } = render(
      <VendorJobDetailBody
        data={pollutedDetail}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        qc={{ data: pollutedPhotos, isLoading: false, error: null, onRetry: () => {} }}
      />
    )

    // Non-vacuous: the screen has actually rendered a photograph, so "no
    // embeds" is a statement about a page with media on it rather than about an
    // empty div.
    await waitFor(() =>
      expect(screen.getByTestId(`vendor-qc-photo-${firstSlot}`)).toBeInTheDocument()
    )
    expect(screen.getByTestId('vendor-job-detail')).toBeInTheDocument()
    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expectNoCustomerData(container.innerHTML)
  })

  it('the assertion has teeth on both halves', () => {
    // A guard on the guard, matching the one above: an embed and a signature
    // must each be detectable, or the two tests above pass by doing nothing.
    const probe = document.createElement('div')
    probe.innerHTML = `<iframe src="x"></iframe><a href="?X-Amz-Signature=z">y</a>`
    expect(probe.querySelectorAll('iframe, embed, object').length).toBe(1)
    expect(probe.innerHTML).toContain('X-Amz-Signature')
  })
})

// ============================================================================
// Parcels — the other end of the leg is not a thing a vendor learns
// ============================================================================

/**
 * `GET /api/vendor/transfers` tells a vendor seven fields and a direction.
 *
 * What is missing is the design (§5): no `fromVendorId`/`toVendorId`, no vendor
 * NAME, no `orderId`, no `costAmount`, no `lostAt`. Vendor B must not learn the
 * parcel came from vendor A — surfacing another vendor's row would break the
 * isolation suite's first property — so the fixture below carries every one of
 * those as well as the customer pollution, and the strip is asserted to render
 * a legible row containing none of it.
 */
describe('the parcel strip tells a vendor nothing about the other end', () => {
  /** Everything a vendor must never learn about the vendor at the other end. */
  const OTHER_END = {
    fromVendorId: 'dddddddd-4444-4444-8444-dddddddddddd',
    toVendorId: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
    fromVendorName: 'Sunrise Print Works',
    toVendorName: 'Bandra Framing Co',
    costAmount: '1450.75',
    lostNote: 'Courier says it fell off the van',
  }

  const pollutedTransfer: VendorTransfer = {
    id: '88888888-8888-4888-8888-888888888888',
    reference: 'BLR-DKT-99120',
    carrier: 'Delhivery',
    pieceCount: 3,
    dispatchedAt: '2026-08-20T06:00:00.000Z',
    expectedBy: '2026-08-23T06:00:00.000Z',
    receivedAt: null,
    direction: 'inbound',
    ...POLLUTION,
    ...OTHER_END,
  } as VendorTransfer

  it('renders the docket and neither vendor, neither cost, nor any customer field', () => {
    const { container } = render(
      <VendorTransferStrip
        transfers={{
          data: [pollutedTransfer],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onReceived: () => {},
        }}
      />
    )

    // Non-vacuous: the parcel IS on screen, with its docket and its count.
    const row = screen.getByTestId(`vendor-transfer-row-${pollutedTransfer.id}`)
    expect(row).toHaveTextContent('BLR-DKT-99120')
    expect(row).toHaveTextContent('Delhivery')

    expectNoCustomerData(container.innerHTML)
    for (const leak of Object.values(OTHER_END)) {
      expect(container.innerHTML).not.toContain(leak)
    }
  })

  it('the direction badge says which way, never who', () => {
    render(
      <VendorTransferStrip
        transfers={{
          data: [pollutedTransfer],
          isLoading: false,
          error: null,
          onRetry: () => {},
        }}
      />
    )
    const badge =
      screen.getByTestId(`vendor-transfer-direction-${pollutedTransfer.id}`).textContent ?? ''
    expect(badge).toMatch(/you/i)
    expect(badge).not.toMatch(/sunrise|bandra|vendor/i)
  })
})

// ============================================================================
// The carrier label — the ONE document that carries a customer
// ============================================================================

/**
 * R2, mechanically.
 *
 * The label PDF contains the customer's name, address and phone, because the
 * courier prints it. It is allowed to reach a vendor for exactly one reason: it
 * arrives as opaque rendered BYTES behind a short-lived signature and is handed
 * to the operating system. Never composed by our API, never rendered into this
 * portal's own DOM.
 *
 * Three things therefore have to hold, and each is a separate way the hole
 * reopens: the control is a BUTTON rather than a viewer; the signature never
 * lands in an attribute, not even as a fallback link when the byte fetch fails;
 * and nothing is fetched at all until the click, because the API signs AND
 * writes a `production_job.label_issued` audit row on every success.
 */
describe('the carrier label is handed to the OS, never rendered', () => {
  const signedLabel =
    'https://r2.example.com/fulfilment/labels/9f3c.pdf?X-Amz-Signature=deadbeefcafe'

  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    // The default is the PHOTO fetch: the whole-screen case below renders a
    // shot, and without this it would eat a response queued for the label.
    fetchMock.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['x']) })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vendor-label')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** A job at the one status the matrix gates on the label. */
  const atHandover: VendorJobDetailResponse = {
    ...pollutedDetail,
    job: { ...pollutedDetail.job, status: 'qc_passed' },
  }

  it('the control is a BUTTON and the card embeds nothing', () => {
    const { container } = render(
      <VendorLabelHandoverCard jobId={pollutedDetail.job.id} />
    )

    const control = screen.getByTestId('vendor-job-label')
    expect(control.tagName).toBe('BUTTON')
    // An <iframe src={signedUrl}> would put the customer's address into this
    // portal's own markup, which is precisely what R2 forbids.
    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.querySelectorAll('a[href]').length).toBe(0)
  })

  it('fetches NOTHING while the handover card is merely on screen', () => {
    render(
      <VendorJobDetailBody
        data={atHandover}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    )
    // The card IS there — this does not pass by rendering nothing.
    expect(screen.getByTestId('vendor-job-label-card')).toBeInTheDocument()
    // A render that signed would spend a five-minute capability nobody asked
    // for AND write an audit row claiming a disclosure that never happened.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('parks no part of the signed URL in the DOM, before or after the click', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobId: pollutedDetail.job.id,
          url: signedLabel,
          expiresInSeconds: 300,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          ...POLLUTION,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, blob: async () => new Blob(['%PDF-1.4']) })

    const { container } = render(
      <VendorLabelHandoverCard jobId={pollutedDetail.job.id} />
    )
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))

    // The bytes were fetched from the signature; the DOM got an object URL.
    expect(fetchMock.mock.calls[1][0]).toBe(signedLabel)
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.innerHTML).not.toContain('r2.example.com')
    expect(container.innerHTML).not.toContain('fulfilment/labels')
    expect(document.body.querySelectorAll('a[href*="X-Amz-Signature"]').length).toBe(0)
    expectNoCustomerData(container.innerHTML)
  })

  it('does not fall back to a link when the bytes cannot be fetched', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          jobId: pollutedDetail.job.id,
          url: signedLabel,
          expiresInSeconds: 300,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 403 })

    const { container } = render(
      <VendorLabelHandoverCard jobId={pollutedDetail.job.id} />
    )
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() =>
      expect(screen.getByTestId('vendor-job-label-error')).toBeInTheDocument()
    )
    // "Here is the link instead" is the one tempting way to put the signature
    // back into the markup, and it is not offered.
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expect(container.querySelectorAll('a[href]').length).toBe(0)
  })

  it('the 503 seam says the label is not here yet, and no more', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'column "label_object_token" of relation "order_shipments" does not exist',
        code: 'LABEL_NOT_AVAILABLE',
      }),
    })

    const { container } = render(
      <VendorLabelHandoverCard jobId={pollutedDetail.job.id} />
    )
    fireEvent.click(screen.getByTestId('vendor-job-label'))

    await waitFor(() =>
      expect(screen.getByTestId('vendor-job-label-unavailable')).toBeInTheDocument()
    )
    // The copy is ours, so the body cannot narrate our schema to a supplier
    // through this card however the API's message changes.
    for (const leak of ['label_object_token', 'order_shipments', 'relation', 'column']) {
      expect(container.innerHTML).not.toContain(leak)
    }
    expectNoCustomerData(container.innerHTML)
  })

  it('embeds nothing on the WHOLE job screen once the handover card is on it', async () => {
    const { container } = render(
      <VendorJobDetailBody
        data={atHandover}
        isLoading={false}
        error={null}
        onRetry={() => {}}
        qc={{ data: pollutedPhotos, isLoading: false, error: null, onRetry: () => {} }}
        inboundInTransit={[
          {
            id: '88888888-8888-4888-8888-888888888888',
            reference: 'BLR-DKT-99120',
            carrier: 'Delhivery',
            pieceCount: 3,
            dispatchedAt: '2026-08-20T06:00:00.000Z',
            expectedBy: '2026-08-23T06:00:00.000Z',
            receivedAt: null,
            direction: 'inbound',
            ...POLLUTION,
          } as VendorTransfer,
        ]}
      />
    )

    // Non-vacuous on both counts: a photograph has rendered AND the label card
    // is present, so "no embeds" is a statement about the fully-populated
    // screen rather than about an empty div.
    await waitFor(() =>
      expect(screen.getByTestId(`vendor-qc-photo-${firstSlot}`)).toBeInTheDocument()
    )
    expect(screen.getByTestId('vendor-job-label-card')).toBeInTheDocument()
    expect(screen.getByTestId('vendor-job-awaiting-inbound')).toBeInTheDocument()

    expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
    expect(container.innerHTML).not.toContain('X-Amz-Signature')
    expectNoCustomerData(container.innerHTML)
  })
})

// ============================================================================
// No embed element exists in this tree AT ALL — rendered or not
// ============================================================================

/**
 * The source-level half of R2, and — precisely — what it does and does not
 * prove.
 *
 * Every assertion above is a statement about a screen a test chose to render.
 * That is not enough here, and this suite found out the hard way: an
 * `<iframe>` planted behind a prop nobody passes — a "label preview" panel, say
 * — passes ALL of them, because no test renders the branch it lives in. So the
 * source of all five files is scanned too, reachable branches and not.
 *
 * ## What this scan actually catches
 *
 * A **textual** reintroduction, in these five files, of an embed element or a
 * raw-HTML sink: `<iframe src={…}>`, `<object data={…}>`, `<embed>`,
 * `dangerouslySetInnerHTML`, and `createElement('iframe', …)`. That is the
 * naive reintroduction, and it is the one that actually happens — somebody adds
 * a viewer because a vendor asked to see the label before printing it.
 *
 * ## What it does NOT catch, stated plainly so nobody mistakes it for a proof
 *
 * It is a regex over five files, not a type system and not a taint analysis.
 * A component indirected through a variable (`const V = 'iframe'; <V …/>`), a
 * tag name assembled from pieces, or an inline viewer written in
 * `app/components/` and merely IMPORTED here all leave every case below green.
 * It follows no imports and understands no dataflow.
 *
 * That is why it is the LAST line rather than the only one. The rule is held
 * primarily by the rendered-DOM assertions above (which check the real markup
 * of a fully-populated screen, whatever produced it) and by the design of
 * `handLabelToOs`, which never puts the signature anywhere a viewer could read
 * it. This scan exists to make the obvious regression loud. Widening it into
 * something that could be called a proof means a real AST pass over the whole
 * `app/` tree, and that is a different piece of work from this one.
 *
 * Comments are stripped first, for the same reason as the native-dialog scan in
 * `vendor-screens.test.tsx`: every one of these files explains why it embeds
 * nothing, and an assertion that trips over its own rationale teaches the next
 * person to delete the rationale.
 */
describe('the vendor tree contains no embed element in any branch', () => {
  const files = [
    'app/routes/vendor.tsx',
    'app/routes/vendor/index.tsx',
    'app/routes/vendor/jobs/$id.tsx',
    'app/routes/vendor/rates.tsx',
    'app/routes/vendor/payments.tsx',
  ]

  /**
   * Three shapes, because JSX is not the only way to write an iframe.
   *
   * - The literal element, which is what a hand-written viewer looks like.
   * - `dangerouslySetInnerHTML`, which is a viewer with the markup in a string
   *   — and the string can be concatenated, so no pattern over the HTML itself
   *   would find it. The prop is the thing to forbid.
   * - `createElement('iframe', …)`, the same element one indirection away, as
   *   any compiled or hand-written non-JSX branch would spell it. The three tag
   *   names are repeated rather than matching every `createElement` with a
   *   string in it, because `handLabelToOs` legitimately builds an anchor with
   *   `document.createElement('a')` — and an exemption for that call would be a
   *   hole shaped exactly like the thing being forbidden, while naming the tags
   *   catches the DOM spelling of the hazard as well as React's.
   */
  const EMBEDS =
    /<\s*(iframe|embed|object)\b|dangerouslySetInnerHTML|createElement\s*\(\s*['"](iframe|embed|object)\b/i

  const codeOf = (file: string) =>
    readFileSync(join(process.cwd(), file), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it.each(files)('%s embeds nothing, in any branch', (file) => {
    // Rendering the carrier's label PDF inline would put a customer's name,
    // address and phone into the vendor portal's own markup. The label is
    // fetched as bytes and handed to the operating system instead.
    expect(codeOf(file)).not.toMatch(EMBEDS)
  })

  it('the scan has teeth', () => {
    // A guard on the guard: if the pattern ever stopped matching, every case
    // above would pass by doing nothing.
    expect('<iframe src="x" />').toMatch(EMBEDS)
    expect('<object data="x" />').toMatch(EMBEDS)
    expect('<embed src="x" />').toMatch(EMBEDS)
    expect('<div dangerouslySetInnerHTML={{ __html: pdf }} />').toMatch(EMBEDS)
    // Split across a concatenation on purpose: the markup is unrecognisable,
    // the prop is not, which is why the prop is what the pattern names.
    expect('el.props = { __html: `<ifra` + `me src="x">` }').not.toMatch(EMBEDS)
    expect("React.createElement('iframe', { src: url })").toMatch(EMBEDS)
    // The DOM spelling of the same hazard, which a `React.`-anchored pattern
    // would have missed.
    expect("document.createElement('iframe')").toMatch(EMBEDS)
    expect('React.createElement(Fragment, null)').not.toMatch(EMBEDS)
    // The anchor `handLabelToOs` builds to hand the file to the OS. If this
    // ever matched, the only way to green the suite would be to stop handing
    // the label to the operating system — which is the mechanism R2 relies on.
    expect("const anchor = document.createElement('a')").not.toMatch(EMBEDS)
    expect('<img src="x" /><button>Get the carrier label</button>').not.toMatch(EMBEDS)
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
