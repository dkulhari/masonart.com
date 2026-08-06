/**
 * JoinGalleryModal — the offer, and the one field it asks for (#444).
 *
 * Three things are actually under test, and each is a way this modal has a
 * history of going wrong on other storefronts:
 *
 * 1. **No promotion, no modal, and no number of its own.** The headline and the
 *    depth arrive from `GET /api/promotions/active` (#432). A literal "40%"
 *    anywhere in the component would keep advertising a sale after it ended, so
 *    the fixtures here run at 25% and 15% and the assertions check that 40 never
 *    appears and that the depth follows the promotion it was given.
 *
 * 2. **One field.** Minimal-field capture converts best (design §2), so the
 *    field count is asserted directly rather than left to review. A name box or
 *    a marketing checkbox added later fails a test, not a taste argument.
 *
 * 3. **A failed join stays on screen.** The tempting shortcut is to close the
 *    modal optimistically and let the price disagree with itself a moment
 *    later. `join()` resolving false must surface in the dialog — and never
 *    through `window.alert`, which is unstyled, unblockable and untestable.
 *
 * The session is read from the router context, not better-auth's `useSession()`
 * — same reasoning as `useGalleryMembership` (#443): `useSession()` is pending
 * through SSR and would flash a guest at a signed-in visitor. So the mock here
 * is `useRouteContext`, matching the real source.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'

import { getApiUrl } from '~/lib/utils'

// ============================================================================
// Router mock — session comes from the root route context, navigation is spied
// ============================================================================

type TestSession = {
  user?: { id?: string; email?: string; galleryMember?: boolean | null } | null
} | null

const router = vi.hoisted(() => ({
  context: { session: null as TestSession },
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => router.context,
  useNavigate: () => router.navigate,
}))

function signedInAs(email: string) {
  router.context = { session: { user: { id: 'u-1', email } } }
}

function signedOut() {
  router.context = { session: null }
}

// ============================================================================
// Membership mock — join() is #443's, already covered by its own suite
// ============================================================================

const membership = vi.hoisted(() => ({
  isMember: false,
  isLoading: false,
  join: vi.fn(),
}))

vi.mock('~/hooks/useGalleryMembership', () => ({
  useGalleryMembership: () => membership,
}))

import {
  JoinGalleryModal,
  type ActivePromotion,
} from '~/components/promo/JoinGalleryModal'

// ============================================================================
// Fixtures
// ============================================================================

const API = getApiUrl()
const ACTIVE_URL = `${API}/api/promotions/active`

/** Deliberately not 40% — the number under test must come from here. */
const promotion: ActivePromotion = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'WINTER SALE: DEALS STILL GOING 25% OFF',
  percentOff: 25,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

const shallowerPromotion: ActivePromotion = {
  promotionId: '22222222-2222-4222-8222-222222222222',
  headline: 'SPRING REFRESH: 15% OFF EVERY PRINT',
  percentOff: 15,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

const fetchMock = vi.fn()

function serveActivePromotion(body: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
}

const alertSpy = vi.fn()
const confirmSpy = vi.fn()

beforeEach(() => {
  signedOut()
  router.navigate.mockReset()
  membership.isMember = false
  membership.isLoading = false
  membership.join.mockReset()
  membership.join.mockResolvedValue(true)
  fetchMock.mockReset()
  serveActivePromotion(promotion)
  alertSpy.mockReset()
  confirmSpy.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('alert', alertSpy)
  vi.stubGlobal('confirm', confirmSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ============================================================================
// Helpers
// ============================================================================

type RenderOptions = {
  source?: 'banner' | 'rail' | 'cart' | 'registration' | 'sale-page'
  open?: boolean
  promotion?: ActivePromotion | null
}

async function renderModal(options: RenderOptions = {}) {
  const onClose = vi.fn()
  const { source = 'banner', open = true, ...rest } = options

  const utils = render(
    <JoinGalleryModal
      open={open}
      onClose={onClose}
      source={source}
      {...rest}
    />,
  )

  // Let the promotion lookup settle before anything is asserted.
  await act(async () => {})

  return { onClose, ...utils }
}

function emailField() {
  return screen.getByLabelText(/email/i)
}

function submit() {
  return act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /join the gallery/i }))
  })
}

// ============================================================================
// No promotion, no modal
// ============================================================================

describe('JoinGalleryModal — when there is nothing to offer', () => {
  it('renders nothing when no promotion is active', async () => {
    // `/active` answers with a bare `null` when no sale is running.
    serveActivePromotion(null)

    const { container } = await renderModal()

    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing when the promotion lookup fails', async () => {
    // A sale is decoration; a failed lookup must not put an empty offer on
    // screen, and must not throw the surface that mounted it.
    fetchMock.mockRejectedValue(new Error('offline'))

    const { container } = await renderModal()

    expect(container.innerHTML).toBe('')
  })

  it('renders nothing and asks for nothing while closed', async () => {
    const { container } = await renderModal({ open: false })

    expect(container.innerHTML).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// The offer itself
// ============================================================================

describe('JoinGalleryModal — the offer', () => {
  it('shows the promotion headline rather than a hardcoded discount', async () => {
    const { container } = await renderModal()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('WINTER SALE: DEALS STILL GOING 25% OFF')
    expect(container.textContent).toContain('25%')
    // The parity target runs 40%. If that number is in the markup, the modal
    // is advertising a sale it did not read from the API.
    expect(container.textContent).not.toContain('40')
  })

  it('tracks the depth of whichever promotion is running', async () => {
    // Same component, a different sale: nothing about 25 may survive.
    const { container } = await renderModal({ promotion: shallowerPromotion })

    expect(container.textContent).toContain('15%')
    expect(container.textContent).not.toContain('25')
  })

  it('states the depth without a percentage when the sale is not a percentage', async () => {
    // `percentOff` is null for a fixed-amount promotion (#432). Rendering
    // "null% off" is the failure this guards.
    const { container } = await renderModal({
      promotion: {
        ...promotion,
        // A fixed-amount sale quotes rupees, so its headline carries no
        // percentage either — the whole payload has to be consistent or this
        // asserts against the fixture rather than the component.
        headline: 'CLEARANCE: RS 500 OFF EVERY PRINT',
        percentOff: null,
      },
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(container.textContent).not.toContain('null')
    expect(container.textContent).not.toMatch(/\d+%/)
  })

  it('asks the API origin for the promotion, carrying the countdown cookie', async () => {
    // There is no Vite `/api` proxy in this repo: a bare `/api/...` would hit
    // the web server. The deadline is minted per visitor, so credentials ride
    // along or every open re-mints the window.
    await renderModal()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(ACTIVE_URL)
    expect(init?.credentials).toBe('include')
  })

  it('uses a promotion the opening surface already has, without asking again', async () => {
    // The banner and the sale strip have the payload in hand; a second
    // round trip per open would be pure latency in front of the offer.
    await renderModal({ promotion })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent(promotion.headline)
  })
})

// ============================================================================
// One field
// ============================================================================

describe('JoinGalleryModal — one field', () => {
  it('asks for an email and nothing else', async () => {
    await renderModal()

    const dialog = screen.getByRole('dialog')
    const fields = dialog.querySelectorAll('input, select, textarea')

    expect(fields).toHaveLength(1)
    expect(fields[0]).toHaveAttribute('type', 'email')
    expect(emailField()).toBeInTheDocument()
  })

  it('carries no name, phone or marketing opt-in', async () => {
    // Minimal-field capture is the researched finding, not a layout choice.
    // Each of these converts worse; the assertion is here so adding one is a
    // conversation rather than a quiet commit.
    await renderModal()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByLabelText(/name/i)).toBeNull()
    expect(within(dialog).queryByLabelText(/phone/i)).toBeNull()
    expect(dialog.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(0)
  })

  it('will not join on an email it cannot deliver to', async () => {
    signedInAs('ada@example.com')
    await renderModal()

    fireEvent.change(emailField(), { target: { value: 'not-an-email' } })
    await submit()

    expect(membership.join).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ============================================================================
// Signed in — join in place
// ============================================================================

describe('JoinGalleryModal — a signed-in visitor', () => {
  it('joins in place for a signed-in visitor', async () => {
    signedInAs('ada@example.com')
    const { onClose } = await renderModal({ source: 'cart' })

    // Their address is already known — asking them to retype it is the extra
    // field this modal exists to avoid.
    expect(emailField()).toHaveValue('ada@example.com')

    await submit()

    expect(membership.join).toHaveBeenCalledWith('cart')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('passes through the surface that opened it', async () => {
    signedInAs('ada@example.com')
    await renderModal({ source: 'sale-page' })

    await submit()

    expect(membership.join).toHaveBeenCalledWith('sale-page')
  })
})

// ============================================================================
// Guest — carry the intent to registration
// ============================================================================

describe('JoinGalleryModal — a guest', () => {
  it('routes a guest to registration carrying the intent and the email', async () => {
    signedOut()
    const { onClose } = await renderModal({ source: 'rail' })

    fireEvent.change(emailField(), {
      target: { value: 'ada+prints@example.com' },
    })
    await submit()

    // `href` rather than `{ to, search }`: the intent must survive verbatim,
    // and the destination route validates its own search params.
    expect(router.navigate).toHaveBeenCalledWith({
      href: '/auth/register?join=gallery&email=ada%2Bprints%40example.com',
    })
    // The endpoint is authenticated — a guest has nothing to POST with.
    expect(membership.join).not.toHaveBeenCalled()
    // Navigation unmounts the tree; closing as well would read as a dismissal.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('starts a guest with an empty field', async () => {
    signedOut()
    await renderModal()

    expect(emailField()).toHaveValue('')
  })
})

// ============================================================================
// Failure surfaces, and never through the browser
// ============================================================================

describe('JoinGalleryModal — when the join fails', () => {
  it('reports a failed join instead of closing as if it worked', async () => {
    signedInAs('ada@example.com')
    membership.join.mockResolvedValue(false)

    const { onClose } = await renderModal()
    await submit()

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves the visitor able to try again', async () => {
    signedInAs('ada@example.com')
    membership.join.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const { onClose } = await renderModal()
    await submit()
    expect(onClose).not.toHaveBeenCalled()

    await submit()

    expect(membership.join).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it('never reaches for a browser alert or confirm', async () => {
    signedInAs('ada@example.com')
    membership.join.mockResolvedValue(false)

    await renderModal()
    await submit()

    expect(alertSpy).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Dismissal
// ============================================================================

describe('JoinGalleryModal — dismissal', () => {
  it('closes without joining when dismissed', async () => {
    signedInAs('ada@example.com')
    const { onClose } = await renderModal()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalled()
    expect(membership.join).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const { onClose } = await renderModal()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})
