/**
 * /admin/dispatch/$shipmentId — one shipment, as bought.
 *
 * Four things are pinned here, and each is a way the screen could look right
 * and be wrong.
 *
 * ## One courier, or none, and neither is an error
 *
 * The live account offers exactly one courier (#725), so the courier panel is
 * one row. A row with no courier — a claim the purchase has not completed — is
 * an ordinary state with its own sentence, rendered as a status and never as
 * an alert. Both are rendered and checked, which is the ticket's "done when".
 *
 * ## Nothing signed, nothing embedded
 *
 * The fixture is polluted on purpose: `trackingUrl` carries an `https://`
 * URL with a signature in it. The whole screen is checked for `https://`,
 * `X-Amz-Signature`, `blob:` and for any `iframe`, `embed` or `object`, in
 * every state and before AND after the label click. A label is a customer's
 * name, address and phone, and an inline viewer would put it in this page's
 * markup.
 *
 * ## The label is a BUTTON that fetches on the click
 *
 * Through OUR API with the session cookie, never a courier URL; the bytes go
 * to a local object URL that is handed to the OS through a detached anchor and
 * never parked in state or an `href`. Nothing is fetched on render.
 *
 * ## Void needs a reason, and the hint is not part of the name
 *
 * The submit is disabled until the reason clears the API's floor, the whole
 * form disables while the request is in flight, and each refusal is rendered
 * by what the admin should do next. The hint sits OUTSIDE the `<label>` and is
 * wired by `aria-describedby` (#723), so `getByLabelText('Reason')` resolves on
 * the word alone.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

const SHIPMENT_ID = 'b3d9f1a4-5c6e-47a8-9b12-0d7e4f8a2c31'
const ORDER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'
const AWB = '141123221084922'
const API = 'http://localhost:3000'

vi.mock('@tanstack/react-router', () => ({
  // `Route` IS the config object under this mock, so `Route.component` is the
  // page and `Route.useParams` has to come from here.
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ shipmentId: SHIPMENT_ID }),
  }),
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
    'aria-label'?: string
  }) => (
    <a href={props.to} aria-label={props['aria-label']} className={props.className}>
      {children}
    </a>
  ),
}))

import {
  Route,
  ShipmentDetailBody,
  CourierPanel,
  LabelPanel,
  VoidLabelForm,
  hasLiveLabel,
  courierOf,
  voidRefusalMessage,
  type AdminShipmentDetail,
} from '~/routes/admin/dispatch/$shipmentId'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================================================
// Fixtures — polluted on purpose
// ============================================================================

/** A signed courier URL that must never reach the DOM, in any state. */
const SIGNED_TRACKING = `https://track.example.com/${AWB}?X-Amz-Signature=deadbeefcafe`

const bought: AdminShipmentDetail = {
  id: SHIPMENT_ID,
  orderId: ORDER_ID,
  shippingOptionId: null,
  trackingNumber: AWB,
  carrier: 'Shiprocket',
  courierName: 'Blue Dart Air',
  awbNumber: AWB,
  trackingUrl: SIGNED_TRACKING,
  status: 'label_created',
  shippedAt: null,
  estimatedDeliveryAt: '2026-09-06T00:00:00.000Z',
  deliveredAt: null,
  notes: null,
  createdAt: '2026-09-03T10:00:00.000Z',
  updatedAt: '2026-09-03T10:05:00.000Z',
  order: {
    id: ORDER_ID,
    orderNumber: 'CA-2026-000123',
    status: 'processing',
    userId: 'u1',
    shippingAddress: {
      fullName: 'Priya Sharma',
      phone: '+919876543210',
      addressLine1: '12 Lake View Road',
      addressLine2: 'Flat 4B',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700029',
      country: 'IN',
    },
    customer: { id: 'u1', name: 'Priya Sharma', email: 'priya@example.com' },
  },
  shippingOption: null,
}

/** A claim the purchase has not completed: no courier, no AWB, no label. */
const unbought: AdminShipmentDetail = {
  ...bought,
  trackingNumber: null,
  courierName: null,
  awbNumber: null,
  trackingUrl: null,
  status: 'pending',
  estimatedDeliveryAt: null,
}

/** The same row after `POST /:id/void`. */
const voided: AdminShipmentDetail = { ...bought, status: 'cancelled' }

function expectEmbedsNothing(container: HTMLElement) {
  expect(container.querySelectorAll('iframe, embed, object').length).toBe(0)
  expect(container.innerHTML).not.toContain('https://')
  expect(container.innerHTML).not.toContain('X-Amz-Signature')
  expect(container.innerHTML).not.toContain('blob:')
  expect(container.innerHTML).not.toContain('track.example.com')
}

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
})

const noop = () => {}
const asyncNoop = async () => {}

// ============================================================================
// The pure halves
// ============================================================================

describe('hasLiveLabel', () => {
  it('is true for a bought row that has not been voided', () => {
    expect(hasLiveLabel(bought)).toBe(true)
  })

  it('is false once the row is cancelled — a voided label is not served', () => {
    expect(hasLiveLabel(voided)).toBe(false)
  })

  it('is false for a claim with no AWB, whatever its status says', () => {
    expect(hasLiveLabel(unbought)).toBe(false)
    expect(hasLiveLabel({ ...bought, awbNumber: null })).toBe(false)
  })
})

describe('courierOf', () => {
  it('is the courier and its AWB for a bought row', () => {
    expect(courierOf(bought)).toEqual({ name: 'Blue Dart Air', awb: AWB })
  })

  it('is null — none, not an empty one — when neither a name nor an AWB exists', () => {
    expect(courierOf(unbought)).toBeNull()
  })

  it('still names the courier when only one of the two handles is present', () => {
    expect(courierOf({ ...bought, awbNumber: null })).toEqual({ name: 'Blue Dart Air', awb: null })
    expect(courierOf({ ...bought, courierName: null })).toEqual({ name: null, awb: AWB })
  })
})

describe('voidRefusalMessage', () => {
  it("carries the courier's own reason when the courier refused", () => {
    const message = voidRefusalMessage(422, {
      code: 'SHIPROCKET_CANCEL_REFUSED',
      error: `Shiprocket would not cancel AWB ${AWB}: already picked up.`,
    })
    expect(message).toContain('already picked up')
    expect(message).toMatch(/still live/i)
  })

  it('tells the admin NOT to retry blind when the courier did not answer', () => {
    const message = voidRefusalMessage(409, {
      code: 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN',
      error: 'Shiprocket did not answer the cancellation. Check the dashboard.',
    })
    expect(message).toMatch(/not been marked void/i)
    expect(message).toMatch(/dashboard/i)
  })

  it('says the row moved, and to reload, when there is nothing to void', () => {
    expect(voidRefusalMessage(409, { code: 'NOTHING_TO_VOID', error: 'x' })).toMatch(/reload/i)
  })

  it('names the reason when the body was refused', () => {
    expect(voidRefusalMessage(400, { code: 'SHIPMENT_BODY_INVALID', error: 'x' })).toMatch(/reason/i)
  })

  it('falls back to the API sentence, then to the status, and never to nothing', () => {
    expect(voidRefusalMessage(422, { code: 'SHIPROCKET_NOT_CONFIGURED', error: 'Set SHIPROCKET_EMAIL' })).toBe(
      'Set SHIPROCKET_EMAIL'
    )
    expect(voidRefusalMessage(500, {})).toMatch(/500/)
  })
})

// ============================================================================
// The three states, mutually exclusive
// ============================================================================

describe('ShipmentDetailBody has three states and shows exactly one', () => {
  it('error: an alert with a retry, and nothing about the shipment', () => {
    const onRetry = vi.fn()
    const { container } = render(
      <ShipmentDetailBody data={null} isLoading={false} error="Failed to fetch shipment" onRetry={onRetry} onVoided={asyncNoop} notice={null} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch shipment')
    fireEvent.click(screen.getByTestId('shipment-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('shipment-skeleton')).toBeNull()
    expect(screen.queryByTestId('shipment-courier')).toBeNull()
    expectEmbedsNothing(container)
  })

  it('loading: a skeleton, no alert, no panels', () => {
    const { container } = render(
      <ShipmentDetailBody data={null} isLoading error={null} onRetry={noop} onVoided={asyncNoop} notice={null} />
    )
    expect(screen.getByTestId('shipment-skeleton')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('shipment-courier')).toBeNull()
    expectEmbedsNothing(container)
  })

  it('an error while loading is the error, not both', () => {
    render(
      <ShipmentDetailBody data={bought} isLoading error="boom" onRetry={noop} onVoided={asyncNoop} notice={null} />
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('shipment-skeleton')).toBeNull()
    expect(screen.queryByTestId('shipment-courier')).toBeNull()
  })

  it('loaded: the panels, no skeleton, no alert', () => {
    render(
      <ShipmentDetailBody data={bought} isLoading={false} error={null} onRetry={noop} onVoided={asyncNoop} notice={null} />
    )
    expect(screen.getByTestId('shipment-courier')).toBeInTheDocument()
    expect(screen.queryByTestId('shipment-skeleton')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ============================================================================
// One courier, and none
// ============================================================================

describe('with one courier', () => {
  it('shows the courier, its AWB and where the parcel is going, and embeds nothing', () => {
    const { container } = render(
      <ShipmentDetailBody data={bought} isLoading={false} error={null} onRetry={noop} onVoided={asyncNoop} notice={null} />
    )

    const courier = screen.getByTestId('shipment-courier')
    expect(within(courier).getByText('Blue Dart Air')).toBeInTheDocument()
    expect(within(courier).getByText(AWB)).toBeInTheDocument()
    // One row: the table is built to grow, and today it has one.
    expect(within(courier).getAllByTestId('shipment-courier-row')).toHaveLength(1)
    expect(screen.queryByTestId('shipment-courier-none')).toBeNull()

    expect(screen.getByText('CA-2026-000123')).toBeInTheDocument()
    expect(screen.getByText(/12 Lake View Road/)).toBeInTheDocument()
    expect(screen.getByText(/700029/)).toBeInTheDocument()

    // The label control is a BUTTON and the void form is offered.
    expect(screen.getByTestId('shipment-label-download').tagName).toBe('BUTTON')
    expect(screen.getByTestId('shipment-void-form')).toBeInTheDocument()

    expectEmbedsNothing(container)
    // The tracking URL is not rendered as a link, or at all.
    expect(container.querySelectorAll('a[href*="track"]').length).toBe(0)
  })
})

describe('with no courier', () => {
  it('says so as an ordinary status, offers no label and no void, and embeds nothing', () => {
    const { container } = render(
      <ShipmentDetailBody data={unbought} isLoading={false} error={null} onRetry={noop} onVoided={asyncNoop} notice={null} />
    )

    const none = screen.getByTestId('shipment-courier-none')
    expect(none).toHaveAttribute('role', 'status')
    expect(none).toHaveTextContent(/no courier/i)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('shipment-courier-row')).toBeNull()

    expect(screen.queryByTestId('shipment-label-download')).toBeNull()
    expect(screen.queryByTestId('shipment-void-form')).toBeNull()
    expect(screen.getByTestId('shipment-label-none')).toHaveAttribute('role', 'status')

    expectEmbedsNothing(container)
  })

  it('CourierPanel on its own: one row for one courier, the status sentence for none', () => {
    const { unmount } = render(<CourierPanel shipment={bought} />)
    expect(screen.getAllByTestId('shipment-courier-row')).toHaveLength(1)
    unmount()

    render(<CourierPanel shipment={unbought} />)
    expect(screen.getByTestId('shipment-courier-none')).toBeInTheDocument()
    expect(screen.queryByTestId('shipment-courier-row')).toBeNull()
  })
})

describe('after a void', () => {
  it('shows the label as voided with no download and no second void', () => {
    const { container } = render(
      <ShipmentDetailBody data={voided} isLoading={false} error={null} onRetry={noop} onVoided={asyncNoop} notice={null} />
    )
    expect(screen.getByTestId('shipment-label-voided')).toHaveAttribute('role', 'status')
    expect(screen.queryByTestId('shipment-label-download')).toBeNull()
    expect(screen.queryByTestId('shipment-void-form')).toBeNull()
    expectEmbedsNothing(container)
  })

  it('renders the notice the void came back with', () => {
    render(
      <ShipmentDetailBody
        data={voided}
        isLoading={false}
        error={null}
        onRetry={noop}
        onVoided={asyncNoop}
        notice="Label voided. The courier had already cancelled it on their side."
      />
    )
    expect(screen.getByTestId('shipment-notice')).toHaveTextContent(/already cancelled/i)
  })
})

// ============================================================================
// The label: a button, fetched on the click, handed to the OS
// ============================================================================

describe('the label download', () => {
  const fetchMock = vi.fn()
  let clicked: Array<{ href: string; download: string }>

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shipment-label')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    clicked = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download })
    })
  })

  it('fetches nothing while the panel is merely on screen', () => {
    render(<LabelPanel shipment={bought} onVoided={asyncNoop} />)
    expect(screen.getByTestId('shipment-label-download')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the bytes through OUR API with the session, and hands the file to the OS', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => new Blob(['%PDF-1.4']),
    })

    const { container } = render(<LabelPanel shipment={bought} onVoided={asyncNoop} />)
    fireEvent.click(screen.getByTestId('shipment-label-download'))

    await waitFor(() => expect(clicked).toHaveLength(1))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API}/api/admin/shipments/${SHIPMENT_ID}/label`)
    expect(init.credentials).toBe('include')

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked[0]).toEqual({ href: 'blob:shipment-label', download: `label-${AWB}.pdf` })

    // The anchor was detached and nothing about the file was parked anywhere.
    expect(document.body.querySelectorAll('a[href^="blob:"]').length).toBe(0)
    expectEmbedsNothing(container)
    expect(screen.queryByTestId('shipment-label-error')).toBeNull()
  })

  it('a 404 means the label moved: says so, offers no link, embeds nothing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'no live label' }) })

    const { container } = render(<LabelPanel shipment={bought} onVoided={asyncNoop} />)
    fireEvent.click(screen.getByTestId('shipment-label-download'))

    await waitFor(() => expect(screen.getByTestId('shipment-label-error')).toBeInTheDocument())
    expect(screen.getByTestId('shipment-label-error')).toHaveTextContent(/no live label/i)
    expect(clicked).toHaveLength(0)
    expect(container.querySelectorAll('a[href]').length).toBe(0)
    expectEmbedsNothing(container)
  })

  it('a dropped connection is our sentence, and a fresh press tries again', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'))

    render(<LabelPanel shipment={bought} onVoided={asyncNoop} />)
    fireEvent.click(screen.getByTestId('shipment-label-download'))

    await waitFor(() => expect(screen.getByTestId('shipment-label-error')).toBeInTheDocument())
    expect(screen.getByTestId('shipment-label-error')).toHaveTextContent(/did not download/i)
    expect(screen.getByTestId('shipment-label-download')).not.toBeDisabled()
  })
})

// ============================================================================
// Void: a reason, a disabled form in flight, a refusal rendered by its remedy
// ============================================================================

describe('the void form', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  const REASON = 'Customer changed the delivery address after the label was bought'

  it('the hint sits outside the label and is wired by aria-describedby', () => {
    render(<VoidLabelForm shipmentId={SHIPMENT_ID} onVoided={asyncNoop} />)

    // Resolves on the one word — a hint inside the label would make this
    // query fail, because the label's text would be the whole paragraph.
    const reason = screen.getByLabelText('Reason')
    expect(reason.tagName).toBe('TEXTAREA')

    const hintId = reason.getAttribute('aria-describedby')
    expect(hintId).toBeTruthy()
    const hint = document.getElementById(hintId as string)
    expect(hint).not.toBeNull()
    expect(hint?.closest('label')).toBeNull()
    expect(hint).toHaveTextContent(/3 to 500/)
    expect(reason.closest('label')).toBeNull()
  })

  it('will not submit without a reason that clears the floor', () => {
    render(<VoidLabelForm shipmentId={SHIPMENT_ID} onVoided={asyncNoop} />)
    const submit = screen.getByTestId('shipment-void-submit')
    const reason = screen.getByLabelText('Reason')

    expect(submit).toBeDisabled()
    fireEvent.change(reason, { target: { value: 'ab' } })
    expect(submit).toBeDisabled()
    fireEvent.change(reason, { target: { value: '   ' } })
    expect(submit).toBeDisabled()
    fireEvent.change(reason, { target: { value: 'abc' } })
    expect(submit).not.toBeDisabled()

    fireEvent.submit(screen.getByTestId('shipment-void-form'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('posts the trimmed reason with the session, disables while in flight, and reports back', async () => {
    let settle!: (value: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (settle = resolve)))
    const onVoided = vi.fn(async () => {})

    render(<VoidLabelForm shipmentId={SHIPMENT_ID} onVoided={onVoided} />)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: `  ${REASON}  ` } })
    fireEvent.click(screen.getByTestId('shipment-void-submit'))

    await waitFor(() => expect(screen.getByTestId('shipment-void-submit')).toBeDisabled())
    expect(screen.getByLabelText('Reason')).toBeDisabled()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API}/api/admin/shipments/${SHIPMENT_ID}/void`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body as string)).toEqual({ reason: REASON })

    const result = { message: 'Label voided', shipment: voided, alreadyCancelledAtCourier: false }
    settle(jsonResponse(200, result))

    await waitFor(() => expect(onVoided).toHaveBeenCalledWith(result))
    expect(screen.queryByTestId('shipment-void-error')).toBeNull()
    expect(screen.getByLabelText('Reason')).not.toBeDisabled()
  })

  it("422: the courier said no, with its reason, and the label is still live", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, {
        code: 'SHIPROCKET_CANCEL_REFUSED',
        error: `Shiprocket would not cancel AWB ${AWB}: already picked up.`,
      })
    )
    const onVoided = vi.fn()

    render(<VoidLabelForm shipmentId={SHIPMENT_ID} onVoided={onVoided} />)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } })
    fireEvent.click(screen.getByTestId('shipment-void-submit'))

    await waitFor(() => expect(screen.getByTestId('shipment-void-error')).toBeInTheDocument())
    const error = screen.getByTestId('shipment-void-error')
    expect(error).toHaveAttribute('role', 'alert')
    expect(error).toHaveTextContent('already picked up')
    expect(onVoided).not.toHaveBeenCalled()
    // The reason is kept so the admin can adjust it rather than retype it.
    expect(screen.getByLabelText('Reason')).toHaveValue(REASON)
  })

  it('409 unknown outcome: not voided, and do not retry blind', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        code: 'SHIPROCKET_WRITE_OUTCOME_UNKNOWN',
        error: 'Shiprocket did not answer the cancellation. Check the dashboard.',
      })
    )

    render(<VoidLabelForm shipmentId={SHIPMENT_ID} onVoided={asyncNoop} />)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } })
    fireEvent.click(screen.getByTestId('shipment-void-submit'))

    await waitFor(() => expect(screen.getByTestId('shipment-void-error')).toBeInTheDocument())
    expect(screen.getByTestId('shipment-void-error')).toHaveTextContent(/not been marked void/i)
  })

  it('409 nothing to void: the row moved, reload', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { code: 'NOTHING_TO_VOID', error: 'no live label', shipmentId: SHIPMENT_ID })
    )

    render(<VoidLabelForm shipmentId={SHIPMENT_ID} onVoided={asyncNoop} />)
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: REASON } })
    fireEvent.click(screen.getByTestId('shipment-void-submit'))

    await waitFor(() => expect(screen.getByTestId('shipment-void-error')).toBeInTheDocument())
    expect(screen.getByTestId('shipment-void-error')).toHaveTextContent(/reload/i)
  })
})

// ============================================================================
// The page, end to end against a mocked API
// ============================================================================

describe('the page', () => {
  const Page = Route.component as () => React.ReactElement
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('reads the shipment through GET /api/admin/shipments/:id and renders one courier', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, bought))

    const { container } = render(<Page />)
    expect(screen.getByTestId('shipment-skeleton')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByTestId('shipment-courier')).toBeInTheDocument())

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${API}/api/admin/shipments/${SHIPMENT_ID}`)
    expect(init.credentials).toBe('include')

    expect(screen.getByText('Blue Dart Air')).toBeInTheDocument()
    expect(screen.getByTestId('shipment-label-download').tagName).toBe('BUTTON')
    expect(screen.queryByTestId('shipment-skeleton')).toBeNull()
    expectEmbedsNothing(container)
  })

  it('renders none, as a status, when the row has no courier', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, unbought))

    const { container } = render(<Page />)
    await waitFor(() => expect(screen.getByTestId('shipment-courier-none')).toBeInTheDocument())

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('shipment-label-download')).toBeNull()
    expectEmbedsNothing(container)
  })

  it('a failed read is the error state, with nothing about the shipment beside it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { error: 'Shipment not found', code: 'SHIPMENT_NOT_FOUND' }))

    const { container } = render(<Page />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    expect(screen.getByRole('alert')).toHaveTextContent('Shipment not found')
    expect(screen.queryByTestId('shipment-courier')).toBeNull()
    expect(screen.queryByTestId('shipment-skeleton')).toBeNull()
    expectEmbedsNothing(container)
  })

  it('a void re-reads the row and shows it voided, with the courier-side note', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, bought))
      .mockResolvedValueOnce(
        jsonResponse(200, { message: 'Label voided', shipment: voided, alreadyCancelledAtCourier: true })
      )
      .mockResolvedValueOnce(jsonResponse(200, voided))

    const { container } = render(<Page />)
    await waitFor(() => expect(screen.getByTestId('shipment-void-form')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wrong parcel size booked' } })
    fireEvent.click(screen.getByTestId('shipment-void-submit'))

    await waitFor(() => expect(screen.getByTestId('shipment-label-voided')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((fetchMock.mock.calls[2] as [string])[0]).toBe(`${API}/api/admin/shipments/${SHIPMENT_ID}`)
    expect(screen.getByTestId('shipment-notice')).toHaveTextContent(/already cancelled/i)
    expect(screen.queryByTestId('shipment-void-form')).toBeNull()
    expectEmbedsNothing(container)
  })
})
