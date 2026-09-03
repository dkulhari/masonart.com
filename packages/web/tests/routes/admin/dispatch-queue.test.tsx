/**
 * /admin/dispatch — the ready-to-label queue, with blockers on the row.
 *
 * Built from the same parts as the production queue and pinned against the
 * same two hazards, plus the one this screen adds: it spends money.
 *
 * ## The search schema, first
 *
 * `router.tsx` keeps every search value a STRING, so a `validateSearch` schema
 * written against real numbers throws on the first navigation and the route
 * error-boundaries to a blank page. Coercion and `.catch()` are asserted before
 * anything is rendered.
 *
 * ## Then the three list states
 *
 * Skeleton, empty AND error, mutually exclusive. #602 and #606 are both open
 * bugs about a failed request rendering a confident `0`, so the error assertion
 * checks both halves: the failure is shown, and no fabricated number beside it.
 *
 * ## Then the screen, rendered against a mocked fetch
 *
 * The ticket's done-when is "verified by rendering, not only by unit test": a
 * blocked row shows every blocker and offers no Ship button, a ready row offers
 * one, a double click on Buy label buys once, and a `SHIPROCKET_NOT_CONFIGURED`
 * refusal reads as a setup step rather than an outage.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Only the router is stubbed, not the component under test — the same trade
 * production-queue.test.tsx makes. `createFileRoute` runs at module load and
 * `Link` reads router context, so without this the import alone throws. The
 * route object it returns carries a `useSearch` so the page component can be
 * rendered whole, which is what the done-when asks for.
 */
const routerMock = vi.hoisted(() => ({
  search: { page: 1, pageSize: 20 } as Record<string, unknown>,
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => routerMock.search,
  }),
  useNavigate: () => routerMock.navigate,
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
  }) => {
    const href = Object.entries(props.params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      props.to ?? ''
    )
    return (
      <a href={href} aria-label={props['aria-label']} className={props.className}>
        {children}
      </a>
    )
  },
}))

import {
  dispatchSearchSchema,
  DispatchQueueBody,
  DispatchReceipts,
  AdminDispatchQueuePage,
  describeShipRefusal,
  buyLabel,
  type DispatchQueueItem,
  type DispatchQueuePage,
} from '~/routes/admin/dispatch/index'
import {
  ADMIN_DISPATCH_SEARCH,
  isContentManagerPathAllowed,
  isAdminNavItemVisible,
} from '~/lib/admin-nav'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  routerMock.navigate.mockReset()
})

// ============================================================================
// Search schema — the blank-page hazard
// ============================================================================

/**
 * What `router.tsx` actually hands `validateSearch`: `URLSearchParams` entries,
 * so every value is a string no matter what was navigated with.
 */
const asUrlWouldDeliver = (search: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(search)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)])
  )

const CURSOR = '2026-02-01T00:00:00.000Z|11111111-1111-4111-8111-111111111111'

describe('dispatchSearchSchema', () => {
  it('coerces the string page and pageSize the URL delivers', () => {
    const parsed = dispatchSearchSchema.parse({ page: '4', pageSize: '50' })

    expect(parsed.page).toBe(4)
    expect(parsed.pageSize).toBe(50)
  })

  it('applies the documented defaults when the URL carries nothing', () => {
    const parsed = dispatchSearchSchema.parse({})

    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
    expect(parsed.scanAfter).toBeUndefined()
  })

  it('clamps pageSize to the API cap rather than asking for the table', () => {
    expect(dispatchSearchSchema.parse({ pageSize: '100000' }).pageSize).toBe(100)
  })

  it('keeps a well-formed scan cursor as the API spelled it', () => {
    expect(dispatchSearchSchema.parse({ scanAfter: CURSOR }).scanAfter).toBe(CURSOR)
  })

  /**
   * The API answers a malformed cursor with a 400, which this screen would then
   * have to render as a failure the admin cannot act on. Dropping it shows the
   * first window instead, which is a queue.
   */
  it.each(['garbage', '2026-13-45T09:00:00.000Z|11111111-1111-4111-8111-111111111111', 'a|b', ''])(
    'drops an unreadable scan cursor instead of asking the API for it: %s',
    (scanAfter) => {
      expect(dispatchSearchSchema.parse({ scanAfter }).scanAfter).toBeUndefined()
    }
  )

  it.each([{ page: 'abc' }, { page: '-3' }, { page: '0' }, { pageSize: 'lots' }, { scanAfter: 'x' }])(
    'never throws on a nonsense URL: %o',
    (search) => {
      expect(() => dispatchSearchSchema.parse(search)).not.toThrow()
    }
  )

  it('recovers a usable page number from a nonsense one', () => {
    expect(dispatchSearchSchema.parse({ page: 'abc' }).page).toBe(1)
    expect(dispatchSearchSchema.parse({ page: '-3' }).page).toBe(1)
  })

  it('survives the round trip through router.tsx stringify and parse', () => {
    const once = dispatchSearchSchema.parse({ page: '2', pageSize: '20', scanAfter: CURSOR })
    const twice = dispatchSearchSchema.parse(asUrlWouldDeliver(once))

    expect(twice).toEqual(once)
  })

  it('accepts ADMIN_DISPATCH_SEARCH, so an external link lands on a valid URL', () => {
    const parsed = dispatchSearchSchema.parse(asUrlWouldDeliver({ ...ADMIN_DISPATCH_SEARCH }))

    expect(parsed.page).toBe(ADMIN_DISPATCH_SEARCH.page)
    expect(parsed.pageSize).toBe(ADMIN_DISPATCH_SEARCH.pageSize)
  })
})

// ============================================================================
// Fixtures — the GET /api/admin/shipments/ready payload, verbatim
// ============================================================================

const READY_ORDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const BLOCKED_ORDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OPENED_ORDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const JOB_ID = '12345678-1234-4123-8123-123456789abc'
const SHIPMENT_ID = '99999999-9999-4999-8999-999999999999'

const READY_ROW: DispatchQueueItem = {
  orderId: READY_ORDER_ID,
  orderNumber: 'ORD-1001',
  orderStatus: 'processing',
  placedAt: '2026-02-01T09:00:00.000Z',
  itemCount: 2,
  ready: true,
  consolidatorVendorId: '11111111-1111-4111-8111-111111111111',
  blockers: [],
  openShipment: null,
}

const BLOCKED_ROW: DispatchQueueItem = {
  orderId: BLOCKED_ORDER_ID,
  orderNumber: 'ORD-1002',
  orderStatus: 'confirmed',
  placedAt: '2026-02-02T09:00:00.000Z',
  itemCount: 1,
  ready: false,
  consolidatorVendorId: null,
  blockers: [
    {
      code: 'job_not_qc_passed',
      message: 'The print job has not passed QC yet (it is awaiting our QC).',
      jobId: JOB_ID,
    },
    {
      code: 'no_consolidator',
      message: 'Nobody has decided which vendor assembles and ships this order.',
    },
  ],
  openShipment: null,
}

const OPENED_ROW: DispatchQueueItem = {
  ...READY_ROW,
  orderId: OPENED_ORDER_ID,
  orderNumber: 'ORD-1003',
  openShipment: { id: SHIPMENT_ID, status: 'pending' },
}

const pageOf = (items: DispatchQueueItem[], overrides: Partial<DispatchQueuePage> = {}): DispatchQueuePage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: items.length === 0 ? 0 : 1,
  hasNextPage: false,
  hasPreviousPage: false,
  readyCount: items.filter((i) => i.ready).length,
  scanLimit: 200,
  scanTruncated: false,
  nextScanCursor: null,
  ...overrides,
})

const noop = () => {}

const bodyProps = {
  isLoading: false,
  error: null,
  onRetry: noop,
  onBuy: async () => ({ bought: false as const, status: 500, code: null, message: 'unused', blockers: [], shipmentId: null }),
}

// ============================================================================
// The three list states
// ============================================================================

describe('DispatchQueueBody', () => {
  it('renders a skeleton while the first page is in flight', () => {
    render(<DispatchQueueBody {...bodyProps} items={[]} isLoading />)

    expect(screen.getByTestId('admin-dispatch-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-empty')).not.toBeInTheDocument()
  })

  it('renders an empty state, not an empty list, when nothing is queued', () => {
    render(<DispatchQueueBody {...bodyProps} items={[]} />)

    expect(screen.getByTestId('admin-dispatch-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-skeleton')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-list')).not.toBeInTheDocument()
  })

  it('renders an error state with a retry when the request failed', () => {
    const onRetry = vi.fn()
    render(<DispatchQueueBody {...bodyProps} items={[]} error="Failed to build the ready-to-label queue" onRetry={onRetry} />)

    const state = screen.getByTestId('admin-dispatch-error')
    expect(state.textContent).toMatch(/failed to build the ready-to-label queue/i)
    fireEvent.click(screen.getByTestId('admin-dispatch-retry'))
    expect(onRetry).toHaveBeenCalled()
  })

  /** #602 and #606, as a guard: no confident number over a failed request. */
  it('fabricates no number when the request failed', () => {
    const { container } = render(
      <DispatchQueueBody {...bodyProps} items={[READY_ROW]} error="Failed to build the ready-to-label queue" />
    )

    expect(screen.queryByTestId('admin-dispatch-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-empty')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('error wins over loading, so a failed reload never shows a skeleton', () => {
    render(<DispatchQueueBody {...bodyProps} items={[]} isLoading error="boom" />)

    expect(screen.getByTestId('admin-dispatch-error')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-dispatch-skeleton')).not.toBeInTheDocument()
  })
})

// ============================================================================
// Rows — the blockers are on the row, and Ship is only where it can work
// ============================================================================

describe('DispatchQueueBody rows', () => {
  it('offers Ship on a ready row', () => {
    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW, BLOCKED_ROW]} />)

    const row = screen.getByTestId(`admin-dispatch-row-${READY_ORDER_ID}`)
    expect(within(row).getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`)).toBeEnabled()
    expect(row.textContent).toMatch(/ready/i)
    expect(row.textContent).toMatch(/ORD-1001/)
  })

  /** The done-when, verbatim: every blocker inline, and no Ship button. */
  it('shows every blocker on a blocked row and offers no Ship button', () => {
    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW, BLOCKED_ROW]} />)

    const row = screen.getByTestId(`admin-dispatch-row-${BLOCKED_ORDER_ID}`)
    expect(within(row).queryByTestId(`admin-dispatch-ship-${BLOCKED_ORDER_ID}`)).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /ship/i })).not.toBeInTheDocument()

    const blockers = within(row).getByTestId(`admin-dispatch-blockers-${BLOCKED_ORDER_ID}`)
    expect(blockers.textContent).toMatch(/has not passed QC yet/)
    expect(blockers.textContent).toMatch(/Nobody has decided which vendor/)
    expect(within(blockers).getAllByRole('listitem')).toHaveLength(2)
  })

  /**
   * "Making an admin click into an order to discover it is waiting on QC is the
   * friction this screen exists to remove" — so a blocker that names a job
   * links to that job, and the admin goes straight to the thing to fix.
   */
  it('links a blocker that names a job to that job', () => {
    render(<DispatchQueueBody {...bodyProps} items={[BLOCKED_ROW]} />)

    const blockers = screen.getByTestId(`admin-dispatch-blockers-${BLOCKED_ORDER_ID}`)
    const link = within(blockers).getByRole('link', { name: /job/i })
    expect(link).toHaveAttribute('href', `/admin/production/${JOB_ID}`)
  })

  it('links every row to its order', () => {
    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW]} />)

    const row = screen.getByTestId(`admin-dispatch-row-${READY_ORDER_ID}`)
    expect(within(row).getByRole('link', { name: /ORD-1001/ })).toHaveAttribute(
      'href',
      `/admin/orders/${READY_ORDER_ID}`
    )
  })

  /**
   * The queue reports a shipment somebody already opened rather than hiding
   * the order (see `openShipmentsOf` in the API). The row says so and points at
   * the shipment screen, which #735 owns.
   */
  it('points at an already-opened shipment on the row', () => {
    render(<DispatchQueueBody {...bodyProps} items={[OPENED_ROW]} />)

    const row = screen.getByTestId(`admin-dispatch-row-${OPENED_ORDER_ID}`)
    const link = within(row).getByTestId(`admin-dispatch-open-shipment-${OPENED_ORDER_ID}`)
    expect(link).toHaveAttribute('href', `/admin/dispatch/${SHIPMENT_ID}`)
    expect(row.textContent).toMatch(/shipment/i)
  })

  it('confirms inline before buying, and touches no native dialog', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const alertSpy = vi.spyOn(window, 'alert')
    const onBuy = vi.fn()

    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW]} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(onBuy).not.toHaveBeenCalled()
    expect(screen.getByTestId(`admin-dispatch-parcel-${READY_ORDER_ID}`)).toBeInTheDocument()
    expect(screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`)).toBeInTheDocument()

    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })

  it('will not send a parcel with a blank or non-integer dimension', () => {
    const onBuy = vi.fn()
    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW]} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))

    fillParcel(READY_ORDER_ID, { weightGrams: '1.5', lengthCm: '30', widthCm: '20', heightCm: '10' })
    fireEvent.click(screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`))

    expect(onBuy).not.toHaveBeenCalled()
    expect(screen.getByTestId(`admin-dispatch-parcel-${READY_ORDER_ID}`).textContent).toMatch(/whole number/i)
  })

  it('backs out of the parcel step without buying anything', () => {
    const onBuy = vi.fn()
    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW]} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))
    fireEvent.click(screen.getByTestId(`admin-dispatch-cancel-${READY_ORDER_ID}`))

    expect(onBuy).not.toHaveBeenCalled()
    expect(screen.queryByTestId(`admin-dispatch-parcel-${READY_ORDER_ID}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`)).toBeInTheDocument()
  })
})

function fillParcel(
  orderId: string,
  parcel: { weightGrams: string; lengthCm: string; widthCm: string; heightCm: string }
) {
  for (const [field, value] of Object.entries(parcel)) {
    fireEvent.change(screen.getByTestId(`admin-dispatch-parcel-${field}-${orderId}`), {
      target: { value },
    })
  }
}

const GOOD_PARCEL = { weightGrams: '1200', lengthCm: '60', widthCm: '10', heightCm: '10' }

// ============================================================================
// Buying a label — once, and only after the server has answered
// ============================================================================

/** A promise the test resolves by hand, so the in-flight state can be seen. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('the Buy label button', () => {
  it('disables on click, buys once on a double click, and waits for the server', async () => {
    const answer = deferred<Awaited<ReturnType<typeof bodyProps.onBuy>>>()
    const onBuy = vi.fn(() => answer.promise)

    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW]} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))
    fillParcel(READY_ORDER_ID, GOOD_PARCEL)

    const buy = screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`)
    fireEvent.click(buy)
    fireEvent.click(buy)

    expect(onBuy).toHaveBeenCalledTimes(1)
    expect(onBuy).toHaveBeenCalledWith(READY_ORDER_ID, {
      weightGrams: 1200,
      lengthCm: 60,
      widthCm: 10,
      heightCm: 10,
    })
    expect(buy).toBeDisabled()
    // No optimistic UI: nothing says "bought" until the server has said so.
    expect(screen.queryByTestId(`admin-dispatch-bought-${READY_ORDER_ID}`)).not.toBeInTheDocument()

    answer.resolve({
      bought: true,
      shipmentId: SHIPMENT_ID,
      awbNumber: 'AWB123',
      courierName: 'Delhivery',
      resumed: false,
      pickupScheduled: true,
    })

    // The row says it is done and offers nothing further; the receipt itself
    // is the page's, because the next reload drops this row from the queue.
    await screen.findByTestId(`admin-dispatch-row-bought-${READY_ORDER_ID}`)
    expect(screen.queryByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`)).not.toBeInTheDocument()
  })

  it('shows a refusal in place and lets the admin try again', async () => {
    const onBuy = vi.fn(async () => ({
      bought: false as const,
      status: 409,
      code: 'ORDER_NOT_READY',
      message: 'Order ORD-1001 is not ready to label.',
      blockers: [{ code: 'goods_not_at_consolidator', message: 'The framed piece has not reached the consolidator.' }],
      shipmentId: null,
    }))

    render(<DispatchQueueBody {...bodyProps} items={[READY_ROW]} onBuy={onBuy} />)
    fireEvent.click(screen.getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))
    fillParcel(READY_ORDER_ID, GOOD_PARCEL)
    fireEvent.click(screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`))

    const refusal = await screen.findByTestId(`admin-dispatch-refusal-${READY_ORDER_ID}`)
    expect(refusal.textContent).toMatch(/not reached the consolidator/)
    expect(screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`)).toBeEnabled()
  })
})

// ============================================================================
// The receipt — what was bought, kept on screen after the row has gone
// ============================================================================

describe('DispatchReceipts', () => {
  const receipt = {
    orderId: READY_ORDER_ID,
    orderNumber: 'ORD-1001',
    outcome: {
      bought: true as const,
      shipmentId: SHIPMENT_ID,
      awbNumber: 'AWB123',
      courierName: 'Delhivery',
      resumed: false,
      pickupScheduled: false,
    },
  }

  it('renders nothing before anything has been bought', () => {
    const { container } = render(<DispatchReceipts receipts={[]} onDismiss={noop} />)

    expect(container.textContent).toBe('')
  })

  it('names the order, the AWB, the courier and the shipment', () => {
    render(<DispatchReceipts receipts={[receipt]} onDismiss={noop} />)

    const bought = screen.getByTestId(`admin-dispatch-bought-${READY_ORDER_ID}`)
    expect(bought.textContent).toMatch(/ORD-1001/)
    expect(bought.textContent).toMatch(/AWB123/)
    expect(bought.textContent).toMatch(/Delhivery/)
    expect(within(bought).getByRole('link', { name: /shipment/i })).toHaveAttribute(
      'href',
      `/admin/dispatch/${SHIPMENT_ID}`
    )
  })

  /** A pickup the courier did not schedule is a fact the admin has to act on. */
  it('says when the pickup was not scheduled', () => {
    render(<DispatchReceipts receipts={[receipt]} onDismiss={noop} />)

    expect(screen.getByTestId(`admin-dispatch-bought-${READY_ORDER_ID}`).textContent).toMatch(
      /pickup.*not/i
    )
  })

  it('says when an unfinished purchase was resumed rather than repeated', () => {
    render(
      <DispatchReceipts
        receipts={[{ ...receipt, outcome: { ...receipt.outcome, resumed: true } }]}
        onDismiss={noop}
      />
    )

    expect(screen.getByTestId(`admin-dispatch-bought-${READY_ORDER_ID}`).textContent).toMatch(
      /resumed/i
    )
  })

  it('can be dismissed, so the panel is not a permanent fixture', () => {
    const onDismiss = vi.fn()
    render(<DispatchReceipts receipts={[receipt]} onDismiss={onDismiss} />)

    fireEvent.click(screen.getByTestId(`admin-dispatch-bought-dismiss-${READY_ORDER_ID}`))

    expect(onDismiss).toHaveBeenCalledWith(READY_ORDER_ID)
  })
})

// ============================================================================
// The refusal vocabulary — our words, not the courier's
// ============================================================================

describe('describeShipRefusal', () => {
  const refusal = (code: string | null, message = 'from the API', status = 409) => ({
    bought: false as const,
    status,
    code,
    message,
    blockers: [],
    shipmentId: null,
  })

  /**
   * The ticket: "A SHIPROCKET_NOT_CONFIGURED response gets our words, naming
   * the setup step. That is a state an admin can fix, and it should not read
   * like an outage."
   */
  it('reads SHIPROCKET_NOT_CONFIGURED as a setup step, not an outage', () => {
    const described = describeShipRefusal(
      refusal('SHIPROCKET_NOT_CONFIGURED', 'Shiprocket is not configured: SHIPROCKET_EMAIL is not set.', 422)
    )

    expect(described.kind).toBe('setup')
    expect(described.headline).toMatch(/not (been )?set up|not configured/i)
    expect(described.headline).not.toMatch(/outage|down|unavailable|try again later/i)
    expect(`${described.headline} ${described.detail ?? ''}`).toMatch(/SHIPROCKET_EMAIL/)
    expect(`${described.headline} ${described.detail ?? ''}`).toMatch(/SHIPROCKET_PASSWORD/)
    expect(`${described.headline} ${described.detail ?? ''}`).toMatch(/nothing was charged/i)
  })

  it('keeps the API sentence for a refusal it has no better words for', () => {
    const described = describeShipRefusal(refusal('ORDER_NOT_SHIPPABLE', "Cannot ship order ORD-1 while it is 'cancelled'.", 400))

    expect(described.headline).toMatch(/Cannot ship order ORD-1/)
  })

  it('names the in-flight purchase and points at its shipment', () => {
    const described = describeShipRefusal({
      ...refusal('LABEL_PURCHASE_IN_PROGRESS', 'A label purchase for this order is already in progress.'),
      shipmentId: SHIPMENT_ID,
    })

    expect(described.kind).toBe('conflict')
    expect(described.shipmentId).toBe(SHIPMENT_ID)
  })

  it('never renders the word undefined', () => {
    const described = describeShipRefusal(refusal(null, ''))

    expect(`${described.headline} ${described.detail ?? ''}`).not.toMatch(/undefined/)
    expect(described.headline.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// buyLabel — the wire shape, never a throw
// ============================================================================

describe('buyLabel', () => {
  it('posts the parcel to the order’s ship endpoint with the session cookie', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        shipment: { id: SHIPMENT_ID, awbNumber: 'AWB1', courierName: 'Delhivery' },
        pickup: { scheduled: true },
        resumed: false,
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const outcome = await buyLabel(READY_ORDER_ID, { weightGrams: 1200, lengthCm: 60, widthCm: 10, heightCm: 10 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(new RegExp(`/api/admin/orders/${READY_ORDER_ID}/ship$`))
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(String(init.body))).toEqual({
      parcel: { weightGrams: 1200, lengthCm: 60, widthCm: 10, heightCm: 10 },
    })
    expect(outcome).toMatchObject({ bought: true, shipmentId: SHIPMENT_ID, awbNumber: 'AWB1', courierName: 'Delhivery' })
  })

  it('turns a refusal body into an outcome carrying its code and blockers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Order is not ready',
          code: 'ORDER_NOT_READY',
          blockers: [{ code: 'no_jobs', message: 'No job exists for this order.' }],
        }),
      }))
    )

    const outcome = await buyLabel(READY_ORDER_ID, { weightGrams: 1, lengthCm: 1, widthCm: 1, heightCm: 1 })

    expect(outcome).toMatchObject({
      bought: false,
      status: 409,
      code: 'ORDER_NOT_READY',
      message: 'Order is not ready',
    })
    expect(outcome.bought === false && outcome.blockers).toHaveLength(1)
  })

  it('turns a thrown request into a refusal rather than an unhandled rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network down')
      })
    )

    const outcome = await buyLabel(READY_ORDER_ID, { weightGrams: 1, lengthCm: 1, widthCm: 1, heightCm: 1 })

    expect(outcome.bought).toBe(false)
    expect(outcome.bought === false && outcome.message).toMatch(/network down/i)
  })
})

// ============================================================================
// The screen, rendered against a mocked fetch — the done-when
// ============================================================================

interface PlannedResponse {
  ok: boolean
  status: number
  body: unknown
}

function mockDispatchFetch(plan: {
  queue: PlannedResponse | (() => PlannedResponse)
  ship?: PlannedResponse | (() => Promise<PlannedResponse>)
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let planned: PlannedResponse
    if (url.includes('/api/admin/shipments/ready')) {
      planned = typeof plan.queue === 'function' ? plan.queue() : plan.queue
    } else if (/\/api\/admin\/orders\/[^/]+\/ship$/.test(url) && init?.method === 'POST') {
      if (!plan.ship) throw new Error(`unplanned POST ${url}`)
      planned = typeof plan.ship === 'function' ? await plan.ship() : plan.ship
    } else {
      throw new Error(`unplanned request ${init?.method ?? 'GET'} ${url}`)
    }
    return { ok: planned.ok, status: planned.status, json: async () => planned.body } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AdminDispatchQueuePage', () => {
  it('asks the ready queue for the page the URL names, with the session cookie', async () => {
    routerMock.search = { page: 2, pageSize: 50, scanAfter: CURSOR }
    const fetchMock = mockDispatchFetch({ queue: { ok: true, status: 200, body: pageOf([]) } })

    render(<AdminDispatchQueuePage />)
    await screen.findByTestId('admin-dispatch-empty')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const query = new URL(url).searchParams
    expect(url).toMatch(/\/api\/admin\/shipments\/ready\?/)
    expect(query.get('page')).toBe('2')
    expect(query.get('pageSize')).toBe('50')
    expect(query.get('scanAfter')).toBe(CURSOR)
    expect(init.credentials).toBe('include')
    routerMock.search = { page: 1, pageSize: 20 }
  })

  it('renders a ready row with Ship and a blocked row with its blockers and no Ship', async () => {
    mockDispatchFetch({ queue: { ok: true, status: 200, body: pageOf([READY_ROW, BLOCKED_ROW]) } })

    render(<AdminDispatchQueuePage />)

    const ready = await screen.findByTestId(`admin-dispatch-row-${READY_ORDER_ID}`)
    expect(within(ready).getByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`)).toBeEnabled()

    const blocked = screen.getByTestId(`admin-dispatch-row-${BLOCKED_ORDER_ID}`)
    expect(within(blocked).queryByRole('button', { name: /ship/i })).not.toBeInTheDocument()
    expect(blocked.textContent).toMatch(/has not passed QC yet/)
    expect(blocked.textContent).toMatch(/Nobody has decided which vendor/)

    // The header counts only once the page has loaded, and counts the work.
    expect(screen.getByTestId('admin-dispatch-summary').textContent).toMatch(/2 order/)
    expect(screen.getByTestId('admin-dispatch-summary').textContent).toMatch(/1 ready/)
  })

  it('renders the failure and no number when the queue did not load', async () => {
    mockDispatchFetch({ queue: { ok: false, status: 500, body: { error: 'Failed to build the ready-to-label queue' } } })

    render(<AdminDispatchQueuePage />)

    const error = await screen.findByTestId('admin-dispatch-error')
    expect(error.textContent).toMatch(/failed to build the ready-to-label queue/i)
    expect(screen.getByTestId('admin-dispatch-summary').textContent).not.toMatch(/\d/)
    expect(screen.queryByTestId('admin-dispatch-pagination')).not.toBeInTheDocument()
  })

  it('buys once on a double click, then re-reads the queue', async () => {
    let queueReads = 0
    const shipAnswer = deferred<PlannedResponse>()
    const fetchMock = mockDispatchFetch({
      queue: () => {
        queueReads += 1
        return { ok: true, status: 200, body: pageOf(queueReads === 1 ? [READY_ROW] : []) }
      },
      ship: () => shipAnswer.promise,
    })

    render(<AdminDispatchQueuePage />)
    fireEvent.click(await screen.findByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))
    fillParcel(READY_ORDER_ID, GOOD_PARCEL)

    const buy = screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`)
    fireEvent.click(buy)
    fireEvent.click(buy)

    const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(posts()).toHaveLength(1)
    expect(buy).toBeDisabled()

    shipAnswer.resolve({
      ok: true,
      status: 201,
      body: {
        shipment: { id: SHIPMENT_ID, awbNumber: 'AWB123', courierName: 'Delhivery' },
        pickup: { scheduled: true },
        resumed: false,
      },
    })

    const bought = await screen.findByTestId(`admin-dispatch-bought-${READY_ORDER_ID}`)
    expect(bought.textContent).toMatch(/AWB123/)
    await waitFor(() => expect(queueReads).toBe(2))
    expect(posts()).toHaveLength(1)
  })

  /** The setup-step case, rendered end to end. */
  it('renders SHIPROCKET_NOT_CONFIGURED as a setup step in our own words', async () => {
    mockDispatchFetch({
      queue: { ok: true, status: 200, body: pageOf([READY_ROW]) },
      ship: {
        ok: false,
        status: 422,
        body: {
          error:
            'Shiprocket is not configured: SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD are not set. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in the API environment.',
          code: 'SHIPROCKET_NOT_CONFIGURED',
        },
      },
    })

    render(<AdminDispatchQueuePage />)
    fireEvent.click(await screen.findByTestId(`admin-dispatch-ship-${READY_ORDER_ID}`))
    fillParcel(READY_ORDER_ID, GOOD_PARCEL)
    fireEvent.click(screen.getByTestId(`admin-dispatch-buy-${READY_ORDER_ID}`))

    const refusal = await screen.findByTestId(`admin-dispatch-refusal-${READY_ORDER_ID}`)
    expect(refusal.textContent).toMatch(/not (been )?set up|not configured/i)
    expect(refusal.textContent).toMatch(/SHIPROCKET_EMAIL/)
    expect(refusal.textContent).not.toMatch(/outage/i)
    expect(refusal.textContent).not.toMatch(/undefined/)
    expect(screen.queryByTestId(`admin-dispatch-bought-${READY_ORDER_ID}`)).not.toBeInTheDocument()
  })

  it('offers the next scan window when the backlog is deeper than one scan', async () => {
    mockDispatchFetch({
      queue: { ok: true, status: 200, body: pageOf([READY_ROW], { scanTruncated: true, nextScanCursor: CURSOR }) },
    })

    render(<AdminDispatchQueuePage />)
    await screen.findByTestId(`admin-dispatch-row-${READY_ORDER_ID}`)

    fireEvent.click(screen.getByTestId('admin-dispatch-next-window'))

    expect(routerMock.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ scanAfter: CURSOR, page: 1 }) })
    )
  })
})

// ============================================================================
// Navigation registration — the pair that must not drift (#603)
// ============================================================================

describe('navigation registration', () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8')

  const sidebar = read('app/components/admin/AdminSidebar.tsx')
  const adminNav = read('app/lib/admin-nav.ts')

  it('links /admin/dispatch from the sidebar', () => {
    expect(sidebar).toContain("href: '/admin/dispatch'")
  })

  it('files it in the primary list, not under Catalog', () => {
    const secondary = sidebar.slice(sidebar.indexOf('SECONDARY_NAV_ITEMS'))
    expect(secondary).not.toContain("href: '/admin/dispatch'")
  })

  it('publishes the default search params the way /admin/production does', () => {
    expect(adminNav).toContain('ADMIN_DISPATCH_SEARCH')
  })

  /**
   * This screen spends money and the API gates the queue and the purchase with
   * `requireAdmin`. A content manager must neither see the entry nor pass the
   * layout guard.
   */
  it('keeps dispatch out of content-manager territory', () => {
    const allowed = adminNav.slice(
      adminNav.indexOf('CONTENT_MANAGER_ALLOWED_PREFIXES'),
      adminNav.indexOf('isContentManagerPathAllowed')
    )
    expect(allowed).not.toContain('/admin/dispatch')
    expect(isContentManagerPathAllowed('/admin/dispatch')).toBe(false)
    expect(isAdminNavItemVisible('content-manager', '/admin/dispatch')).toBe(false)
    expect(isAdminNavItemVisible('admin', '/admin/dispatch')).toBe(true)
  })
})
