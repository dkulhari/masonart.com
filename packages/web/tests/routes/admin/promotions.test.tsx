/**
 * /admin/promotions — the list and the editor (#433).
 *
 * The screens are thin over the #431 endpoints, so what is worth pinning is the
 * handful of places where being thin is not enough:
 *
 * 1. **`isActive` is the server's answer, not ours.** The API derives it from
 *    `isEnabled` plus the window in one place on purpose. A second derivation
 *    here would disagree with the storefront the moment the two clocks or the
 *    two rules drift, and the admin would be looking at a lie.
 * 2. **The search schema survives `router.tsx`.** That router keeps every param
 *    a string and stringifies with `String(value)`, so an array arrives
 *    comma-joined. A schema that expects a real array throws inside
 *    `validateSearch`, and the route error-boundaries to a blank page rather
 *    than failing loudly.
 * 3. **The form validates with the shared schema, not a copy.** A parallel rule
 *    set drifts, and the drift shows up as a 400 the admin cannot explain.
 * 4. **The countdown note is attached to the mode selector.** Whoever switches
 *    on `rolling` has to be told, right there, that it is a per-visitor timer
 *    that re-mints — not a deadline.
 * 5. **Loading an existing promotion carries its exclusions.** PATCH replaces
 *    both membership sets wholesale, so a form that forgets to load them
 *    deletes them on the next save.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PromotionsEmpty,
  PromotionsTable,
  promotionState,
  promotionsSearchSchema,
  type AdminPromotion,
} from '~/routes/admin/promotions/index'
import {
  PromotionForm,
  fromAdminPromotion,
  toIsoInstant,
  toLocalInput,
  toPromotionPayload,
  validatePromotion,
  EMPTY_PROMOTION,
} from '~/routes/admin/promotions/$id'

const listSrc = readFileSync(
  join(process.cwd(), 'app/routes/admin/promotions/index.tsx'),
  'utf8'
)

const editorSrc = readFileSync(
  join(process.cwd(), 'app/routes/admin/promotions/$id.tsx'),
  'utf8'
)

const sidebarSrc = readFileSync(
  join(process.cwd(), 'app/components/admin/AdminSidebar.tsx'),
  'utf8'
)

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like the #431 admin payload
// ---------------------------------------------------------------------------

const NOW = new Date('2026-08-06T12:00:00.000Z')

const PRODUCT_A = '11111111-1111-4111-8111-111111111111'
const PRODUCT_B = '22222222-2222-4222-8222-222222222222'
const PRODUCT_C = '33333333-3333-4333-8333-333333333333'

function promotion(overrides: Partial<AdminPromotion> = {}): AdminPromotion {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    name: 'Independence Sale',
    headline: 'Up to 40% off everything',
    discountType: 'percentage',
    discountValue: 40,
    scopeType: 'all',
    scopeFilter: null,
    membersOnly: true,
    startsAt: '2026-08-01T00:00:00.000Z',
    endsAt: '2026-08-20T00:00:00.000Z',
    isEnabled: true,
    isActive: true,
    priority: 10,
    perCustomerOrderLimit: null,
    countdownMode: 'rolling',
    rollingWindowMinutes: 720,
    rollingJitterMinutes: 90,
    productIds: [],
    excludedProductIds: [],
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

describe('the state badge', () => {
  it('calls a running sale live', () => {
    expect(promotionState(promotion(), NOW)).toBe('live')
  })

  it('calls a promotion whose window has not opened scheduled', () => {
    const scheduled = promotion({
      isActive: false,
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-09-10T00:00:00.000Z',
    })
    expect(promotionState(scheduled, NOW)).toBe('scheduled')
  })

  it('calls a promotion whose window has closed ended', () => {
    const ended = promotion({
      isActive: false,
      startsAt: '2026-06-01T00:00:00.000Z',
      endsAt: '2026-06-10T00:00:00.000Z',
    })
    expect(promotionState(ended, NOW)).toBe('ended')
  })

  it('calls a disabled promotion off, whatever its window says', () => {
    const off = promotion({ isEnabled: false, isActive: false })
    expect(promotionState(off, NOW)).toBe('off')
  })

  it('trusts the server isActive rather than re-deriving it', () => {
    /**
     * The window looks open, but the API said no. Whatever the API knows that
     * we do not — a clock difference, a rule this screen has not learnt — the
     * storefront is following the API, so the admin must see the API's answer.
     */
    const contradicted = promotion({
      isActive: false,
      startsAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-08-20T00:00:00.000Z',
    })
    expect(promotionState(contradicted, NOW)).not.toBe('live')
  })
})

// ---------------------------------------------------------------------------
// The router.tsx search-param trap
// ---------------------------------------------------------------------------

/** Exactly what app/router.tsx does on the way out. */
function stringifySearchObj(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  const str = params.toString()
  return str ? `?${str}` : ''
}

/** Exactly what app/router.tsx does on the way back in. */
function parseSearchString(searchStr: string): Record<string, unknown> {
  const trimmed = searchStr.startsWith('?') ? searchStr.slice(1) : searchStr
  const result: Record<string, unknown> = {}
  if (!trimmed) return result
  for (const [key, value] of new URLSearchParams(trimmed).entries()) {
    result[key] = value
  }
  return result
}

describe('the search schema', () => {
  it('survives a round trip through the app router', () => {
    // `String(['all','products'])` is 'all,products'. A schema that expects a
    // real array throws here, and the route renders a blank error boundary.
    const url = stringifySearchObj({ state: 'live', scope: ['all', 'products'] })
    const parsed = promotionsSearchSchema.parse(parseSearchString(url))

    expect(parsed.state).toBe('live')
    expect(parsed.scope).toEqual(['all', 'products'])
  })

  it('accepts a single scope as a one-element array', () => {
    expect(promotionsSearchSchema.parse({ scope: 'filter' }).scope).toEqual([
      'filter',
    ])
  })

  it('accepts an empty search', () => {
    expect(() => promotionsSearchSchema.parse({})).not.toThrow()
  })

  it('degrades a hand-typed nonsense value instead of blanking the page', () => {
    const parsed = promotionsSearchSchema.parse({ state: 'bogus', scope: 'nope' })
    expect(parsed.state).toBeUndefined()
    expect(parsed.scope).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe('the empty state', () => {
  it('says plainly that no sale is running', () => {
    render(<PromotionsEmpty onCreate={() => {}} />)
    expect(screen.getByText(/no sale is running/i)).toBeInTheDocument()
  })

  it('says that is what the storefront is showing too', () => {
    render(<PromotionsEmpty onCreate={() => {}} />)
    expect(screen.getByTestId('promotions-empty')).toHaveTextContent(
      /storefront/i
    )
  })
})

describe('the table', () => {
  const rows = [
    promotion({ id: 'live-one', name: 'Independence Sale' }),
    promotion({
      id: 'off-one',
      name: 'Diwali Preview',
      isEnabled: false,
      isActive: false,
      discountType: 'fixed',
      discountValue: 500,
      scopeType: 'products',
      productIds: [PRODUCT_A, PRODUCT_B],
    }),
  ]

  function renderTable(overrides: Record<string, unknown> = {}) {
    const props = {
      promotions: rows,
      now: NOW,
      busyId: null,
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      ...overrides,
    }
    render(<PromotionsTable {...(props as never)} />)
    return props
  }

  it('shows the name, the headline and the depth', () => {
    renderTable()
    expect(screen.getByText('Independence Sale')).toBeInTheDocument()
    expect(screen.getAllByText(/40% off everything/i).length).toBeGreaterThan(0)
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('labels each row with its derived state', () => {
    renderTable()
    const live = screen.getByTestId('promotion-row-live-one')
    const off = screen.getByTestId('promotion-row-off-one')
    expect(within(live).getByText(/live/i)).toBeInTheDocument()
    expect(within(off).getByText(/^off$/i)).toBeInTheDocument()
  })

  it('says how many products a product-scoped promotion covers', () => {
    renderTable()
    const off = screen.getByTestId('promotion-row-off-one')
    expect(off).toHaveTextContent(/2 products/i)
  })

  it('offers the opposite of the current enabled state', () => {
    const props = renderTable()
    fireEvent.click(screen.getByRole('button', { name: /turn off Independence Sale/i }))
    expect(props.onToggle).toHaveBeenCalledWith(rows[0], false)

    fireEvent.click(screen.getByRole('button', { name: /turn on Diwali Preview/i }))
    expect(props.onToggle).toHaveBeenCalledWith(rows[1], true)
  })

  it('confirms before deleting', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const props = renderTable()

    fireEvent.click(screen.getByRole('button', { name: /delete Independence Sale/i }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(props.onDelete).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /delete Independence Sale/i }))
    expect(props.onDelete).toHaveBeenCalledWith(rows[0])

    confirmSpy.mockRestore()
  })

  it('opens the editor', () => {
    const props = renderTable()
    fireEvent.click(screen.getByRole('button', { name: /edit Independence Sale/i }))
    expect(props.onEdit).toHaveBeenCalledWith(rows[0])
  })
})

describe('the list route', () => {
  it('reads the admin endpoint with the session cookie', () => {
    expect(listSrc).toContain('/api/admin/promotions')
    expect(listSrc).toContain("credentials: 'include'")
  })

  it('flips a sale with the dedicated enable/disable endpoints', () => {
    // #431 made these their own routes precisely so turning a live sale off in
    // a hurry does not require posting back a whole valid promotion body.
    expect(listSrc).toMatch(/\/enable/)
    expect(listSrc).toMatch(/\/disable/)
  })

  it('deletes with DELETE', () => {
    expect(listSrc).toMatch(/method:\s*'DELETE'/)
  })
})

describe('navigation', () => {
  it('is reachable from the admin sidebar', () => {
    expect(sidebarSrc).toContain("'/admin/promotions'")
  })
})

// ---------------------------------------------------------------------------
// Datetime plumbing
// ---------------------------------------------------------------------------

describe('the datetime fields', () => {
  it('round-trips an instant through the local input format', () => {
    const iso = '2026-08-20T18:30:00.000Z'
    expect(toIsoInstant(toLocalInput(iso))).toBe(iso)
  })

  it('renders an absent end date as an empty field, not "Invalid Date"', () => {
    expect(toLocalInput(null)).toBe('')
  })

  it('refuses to invent an instant from an empty field', () => {
    // `new Date('').toISOString()` throws; the schema has to see the emptiness.
    expect(toIsoInstant('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Loading an existing promotion
// ---------------------------------------------------------------------------

describe('loading a promotion into the form', () => {
  it('carries the pinned AND the excluded product sets', () => {
    /**
     * PATCH replaces both sets wholesale. A form that loads without them posts
     * two empty arrays and silently un-excludes every product the admin took
     * out of the sale.
     */
    const values = fromAdminPromotion(
      promotion({
        scopeType: 'products',
        productIds: [PRODUCT_A, PRODUCT_B],
        excludedProductIds: [PRODUCT_C],
      })
    )
    expect(values.productIds).toEqual([PRODUCT_A, PRODUCT_B])
    expect(values.excludedProductIds).toEqual([PRODUCT_C])
  })

  it('keeps the countdown configuration', () => {
    const values = fromAdminPromotion(
      promotion({
        countdownMode: 'real',
        rollingWindowMinutes: 360,
        rollingJitterMinutes: 15,
      })
    )
    expect(values.countdownMode).toBe('real')
    expect(values.rollingWindowMinutes).toBe(360)
    expect(values.rollingJitterMinutes).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// Validation, borrowed rather than reinvented
// ---------------------------------------------------------------------------

function draft(overrides: Partial<typeof EMPTY_PROMOTION> = {}) {
  return {
    ...EMPTY_PROMOTION,
    name: 'Independence Sale',
    headline: 'Up to 40% off everything',
    discountValue: 40,
    startsAt: toLocalInput('2026-08-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('validation', () => {
  it('accepts a well-formed sitewide promotion', () => {
    expect(validatePromotion(draft())).toEqual({})
  })

  it('refuses a percentage above 100', () => {
    const errors = validatePromotion(draft({ discountValue: 140 }))
    expect(errors.discountValue).toMatch(/cannot exceed 100/i)
  })

  it('allows a fixed discount above 100, because rupees are not percent', () => {
    expect(
      validatePromotion(draft({ discountType: 'fixed', discountValue: 500 }))
    ).toEqual({})
  })

  it('refuses an end that precedes the start', () => {
    const errors = validatePromotion(
      draft({
        startsAt: toLocalInput('2026-08-10T00:00:00.000Z'),
        endsAt: toLocalInput('2026-08-01T00:00:00.000Z'),
      })
    )
    expect(errors.endsAt).toMatch(/follow/i)
  })

  it('refuses a product-scoped promotion with no products', () => {
    const errors = validatePromotion(draft({ scopeType: 'products' }))
    expect(errors.productIds).toBeTruthy()
  })

  it('accepts a product-scoped promotion once products are picked', () => {
    expect(
      validatePromotion(
        draft({ scopeType: 'products', productIds: [PRODUCT_A] })
      )
    ).toEqual({})
  })

  it('refuses a filter-scoped promotion whose filter is empty', () => {
    const errors = validatePromotion(draft({ scopeType: 'filter' }))
    expect(errors.scopeFilter).toBeTruthy()
  })

  it('refuses a nameless promotion', () => {
    expect(validatePromotion(draft({ name: '' })).name).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

describe('the payload', () => {
  it('sends instants, not the local strings the inputs hold', () => {
    const payload = toPromotionPayload(draft()) as Record<string, unknown>
    expect(payload.startsAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('omits an end date rather than sending an empty string', () => {
    const payload = toPromotionPayload(draft({ endsAt: '' })) as Record<
      string,
      unknown
    >
    expect(payload.endsAt).toBeUndefined()
  })

  it('drops the pinned list when the scope is not products', () => {
    // Otherwise switching a promotion from products to sitewide leaves rows
    // behind that no longer mean anything.
    const payload = toPromotionPayload(
      draft({ scopeType: 'all', productIds: [PRODUCT_A] })
    ) as Record<string, unknown>
    expect(payload.productIds).toEqual([])
  })

  it('keeps exclusions whatever the scope, because sitewide is what they are for', () => {
    const payload = toPromotionPayload(
      draft({ scopeType: 'all', excludedProductIds: [PRODUCT_C] })
    ) as Record<string, unknown>
    expect(payload.excludedProductIds).toEqual([PRODUCT_C])
  })
})

// ---------------------------------------------------------------------------
// The editor, rendered
// ---------------------------------------------------------------------------

describe('the editor', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'saved-id', items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes every field the API accepts', () => {
    render(<PromotionForm onSaved={() => {}} />)

    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/headline/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/discount type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/discount value/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/members only/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/starts/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/ends/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/enabled/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/orders per customer/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/countdown/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/window/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/jitter/i)).toBeInTheDocument()
  })

  it('offers all three scopes', () => {
    render(<PromotionForm onSaved={() => {}} />)
    expect(screen.getByRole('radio', { name: /everything/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /matching a filter/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /hand-picked/i })).toBeInTheDocument()
  })

  it('shows the product picker only for the product scope', () => {
    render(<PromotionForm onSaved={() => {}} />)
    expect(screen.queryByTestId('picker-productIds')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /hand-picked/i }))
    expect(screen.getByTestId('picker-productIds')).toBeInTheDocument()
  })

  it('always offers the exclusion picker', () => {
    // Exclusions are what make a sitewide sale usable — the new arrivals and
    // the limited editions stay out of it.
    render(<PromotionForm onSaved={() => {}} />)
    expect(screen.getByTestId('picker-excludedProductIds')).toBeInTheDocument()
  })

  it('explains, next to the mode selector, what rolling actually does', () => {
    render(<PromotionForm onSaved={() => {}} />)

    const mode = screen.getByLabelText(/countdown/i)
    const describedBy = mode.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()

    const note = document.getElementById(describedBy as string)
    expect(note).not.toBeNull()

    const text = note?.textContent ?? ''
    // Per-visitor, re-minted, and NOT a real deadline. All three, or the note
    // has been softened into marketing copy.
    expect(text).toMatch(/visitor/i)
    expect(text).toMatch(/re-?mint|mints again|starts over|fresh/i)
    expect(text).toMatch(/not.*(a real )?deadline|does not end/i)
  })

  it('names the shared schema rather than restating its rules', () => {
    expect(editorSrc).toContain('createPromotionInputSchema')
    expect(editorSrc).toContain('@chobii/shared')
  })

  it('creates with POST when there is no id yet', async () => {
    render(<PromotionForm initial={draft()} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      const saving = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      )
      expect(saving).toBeTruthy()
      expect(String(saving?.[0])).toContain('/api/admin/promotions')
    })
  })

  it('updates with PATCH on the id when editing', async () => {
    render(
      <PromotionForm
        initial={draft()}
        promotionId="promo-7"
        onSaved={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      const saving = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH'
      )
      expect(saving).toBeTruthy()
      expect(String(saving?.[0])).toContain('/api/admin/promotions/promo-7')
    })
  })

  it('reports a rejected draft instead of posting it', async () => {
    render(
      <PromotionForm initial={draft({ discountValue: 140 })} onSaved={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/cannot exceed 100/i)
    })

    const posted = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
    )
    expect(posted).toBe(false)
  })

  it('names the offending ids when the API rejects them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({ error: 'Unknown product ids', unknown: [PRODUCT_C] }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          )
        }
        return new Response(JSON.stringify({ items: [] }), { status: 200 })
      })
    )

    render(<PromotionForm initial={draft()} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(PRODUCT_C)
    })
  })
})
