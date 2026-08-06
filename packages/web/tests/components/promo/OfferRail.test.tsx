/**
 * OfferRail — the recovery path for a dismissed offer (#446).
 *
 * The rail is the second reader of the store the banner (#445) writes, so this
 * suite is deliberately an integration one: the real `SaleBanner`, the real
 * `JoinGalleryModal` (#444) and the real `useGalleryMembership` (#443) are all
 * mounted, and only the router context and `fetch` are stubbed. Mocking the
 * membership hook here would mock away the exact seam the rail is most likely
 * to get wrong.
 *
 * What is actually under test:
 *
 * 1. **Nothing to recover, nothing on screen.** No promotion, a member, or the
 *    banner still open — three different reasons for the same empty right edge.
 *
 * 2. **The label is the promotion.** `Get {percentOff}% OFF` is read from the
 *    payload every time. A literal "40% OFF" in our markup is the parity
 *    target's number, and it would keep advertising a depth after the campaign
 *    changed it.
 *
 * 3. **It reopens the offer, tagged `rail`.** `joinSource` is how the funnel is
 *    measured; a rail join recorded as a banner join is a silently wrong number.
 *
 * 4. **It survives navigation.** The rail is the recovery path for the whole
 *    visit, not a per-page widget — a remount must not reset it or re-ask the
 *    API which promotion is running.
 *
 * 5. **It never offers a discount to someone who just took it.** The defect
 *    #445 found: the optimistic membership flip used to be per-hook-instance,
 *    so a join inside the modal left every other surface reading
 *    `isMember === false` until the router context revalidated on the next
 *    navigation. The rail would appear, offering the discount to a member. The
 *    fix lifts the flip to one shared signal; these tests are what hold it
 *    there.
 *
 * 6. **It is a button, and it is not on the phone.** Their layout runs a bottom
 *    dock that a right-edge rail collides with, so the rail starts at `lg`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import { getApiUrl } from '~/lib/utils'

// ============================================================================
// Router mock — the session IS the membership source (#443), so it is the only
// thing that has to be faked to make a viewer a member
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

import { OfferRail } from '~/components/promo/OfferRail'
import { SaleBanner, resetSaleOfferStore } from '~/components/promo/SaleBanner'
import type { ActivePromotion } from '~/components/promo/JoinGalleryModal'
import { resetGalleryMembershipSignal } from '~/hooks/useGalleryMembership'

// ============================================================================
// Fixtures
// ============================================================================

const API = getApiUrl()
const ACTIVE_URL = `${API}/api/promotions/active`
const JOIN_URL = `${API}/api/gallery/join`

/** Deliberately not 40% — the parity target's number must never be in our markup. */
const winterSale: ActivePromotion = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'WINTER SALE: DEALS STILL GOING 25% OFF',
  percentOff: 25,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

/** A second campaign, at a different depth. The label has to move with it. */
const springSale: ActivePromotion = {
  promotionId: '22222222-2222-4222-8222-222222222222',
  headline: 'SPRING REFRESH: 15% OFF EVERY PRINT',
  percentOff: 15,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

/** Fixed-amount sale: there is no percentage to quote. */
const fiverOff: ActivePromotion = {
  promotionId: '33333333-3333-4333-8333-333333333333',
  headline: 'FIVE HUNDRED OFF EVERY FRAME',
  percentOff: null,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

const guest: TestSession = null
const nonMember: TestSession = {
  user: { id: 'u-1', email: 'ada@example.com', galleryMember: false },
}
const member: TestSession = {
  user: { id: 'u-1', email: 'ada@example.com', galleryMember: true },
}

// ============================================================================
// fetch — one dispatcher, because this suite exercises two endpoints
// ============================================================================

const served = {
  promotion: null as ActivePromotion | null,
  joinOk: true,
}

const fetchMock = vi.fn()

function servePromotion(body: ActivePromotion | null) {
  served.promotion = body
}

function promotionLookups() {
  return fetchMock.mock.calls.filter(([url]) => String(url) === ACTIVE_URL)
}

function joinCalls() {
  return fetchMock.mock.calls
    .filter(([url]) => String(url) === JOIN_URL)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

beforeEach(() => {
  router.context = { session: guest }
  router.navigate.mockReset()

  served.promotion = winterSale
  served.joinOk = true

  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    if (String(url) === ACTIVE_URL) {
      return { ok: true, status: 200, json: async () => served.promotion }
    }
    if (String(url) === JOIN_URL) {
      return {
        ok: served.joinOk,
        status: served.joinOk ? 200 : 500,
        json: async () => ({ galleryMember: served.joinOk }),
      }
    }
    throw new Error(`unexpected fetch: ${String(url)}`)
  })
  vi.stubGlobal('fetch', fetchMock)

  window.localStorage.clear()
  window.sessionStorage.clear()
  resetSaleOfferStore()
  resetGalleryMembershipSignal()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// ============================================================================
// Harness
// ============================================================================

/**
 * Both surfaces, exactly as the root layout mounts them. The rail's whole
 * behaviour is a consequence of what the banner decided, so testing it alone
 * would mean asserting against a store nobody wrote to.
 */
async function mount() {
  const utils = render(
    <>
      <SaleBanner />
      <OfferRail />
    </>,
  )

  // Let the promotion lookup settle before anything is asserted.
  await act(async () => {})

  return utils
}

function rail() {
  return screen.queryByTestId('offer-rail')
}

function modalOpen() {
  return screen.queryByRole('dialog') !== null
}

function dismissBanner() {
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
}

async function submitJoin() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /join the gallery/i }))
  })
  // The POST, its `json()` and the state it settles are three separate ticks.
  await act(async () => {})
}

/** A full page load: React tree gone, module singletons gone, storage intact. */
function reloadPage() {
  cleanup()
  resetSaleOfferStore()
  resetGalleryMembershipSignal()
}

/**
 * SPA navigation, which is the case the rail actually has to survive: the root
 * layout stays mounted, so the module store is NOT thrown away.
 */
function navigate() {
  cleanup()
}

// ============================================================================
// Nothing to recover
// ============================================================================

describe('OfferRail — when there is nothing to recover', () => {
  it('renders nothing when no promotion is active', async () => {
    servePromotion(null)

    await mount()

    expect(rail()).toBeNull()
  })

  it('renders nothing for a member', async () => {
    // They already have the price. A tab offering it to them is an invitation
    // to join something they are already in.
    router.context = { session: member }

    await mount()

    expect(rail()).toBeNull()
  })

  it('renders nothing while the banner is still open', async () => {
    // One offer on screen at a time — the rail is what the offer becomes, not a
    // second copy of it.
    await mount()

    expect(modalOpen()).toBe(true)
    expect(rail()).toBeNull()
  })

  it('renders nothing on the server pass', async () => {
    // The frequency decision needs `localStorage`, which does not exist there,
    // and membership resolving a beat late would flash the tab at a member.
    expect(renderToStaticMarkup(<OfferRail />)).toBe('')
  })

  it('renders nothing when the promotion lookup fails', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('offline')
    })

    await mount()

    expect(rail()).toBeNull()
  })
})

// ============================================================================
// Appearing
// ============================================================================

describe('OfferRail — when the offer needs recovering', () => {
  it('appears once the banner is dismissed', async () => {
    await mount()
    expect(rail()).toBeNull()

    dismissBanner()

    expect(modalOpen()).toBe(false)
    expect(rail()).not.toBeNull()
  })

  it('appears on a load where the banner is in cooldown', async () => {
    await mount()
    dismissBanner()

    reloadPage()
    // Only the 7-day cooldown suppresses the banner now, not the session mark.
    window.sessionStorage.clear()
    await mount()

    expect(modalOpen()).toBe(false)
    expect(rail()).not.toBeNull()
  })

  it('appears on a load where the banner was already seen this session', async () => {
    await mount()
    expect(modalOpen()).toBe(true)

    reloadPage()
    await mount()

    expect(modalOpen()).toBe(false)
    expect(rail()).not.toBeNull()
  })
})

// ============================================================================
// The label
// ============================================================================

describe('OfferRail — the label', () => {
  it('reads the depth off the promotion', async () => {
    await mount()
    dismissBanner()

    expect(rail()).toHaveTextContent('Get 25% OFF')
  })

  it('moves with the promotion rather than staying at one number', async () => {
    await mount()
    dismissBanner()
    expect(rail()).toHaveTextContent('Get 25% OFF')

    reloadPage()
    servePromotion(springSale)
    await mount()
    dismissBanner()

    expect(rail()).toHaveTextContent('Get 15% OFF')
    expect(rail()).not.toHaveTextContent('25')
  })

  it('quotes no percentage for a fixed-amount promotion', async () => {
    // `Get null% OFF` is the failure this guards, and it ships silently.
    servePromotion(fiverOff)

    await mount()
    dismissBanner()

    expect(rail()).not.toBeNull()
    expect(rail()?.textContent ?? '').not.toContain('null')
    expect(rail()?.textContent ?? '').not.toContain('%')
  })

  it('carries no discount of its own', async () => {
    // The parity target runs 40%. In our markup it would mean the rail is
    // advertising a sale it did not read from the API.
    await mount()
    dismissBanner()

    expect(rail()?.textContent ?? '').not.toContain('40')
  })
})

// ============================================================================
// Reopening
// ============================================================================

describe('OfferRail — reopening the offer', () => {
  it('reopens the modal when clicked', async () => {
    await mount()
    dismissBanner()
    expect(modalOpen()).toBe(false)

    fireEvent.click(screen.getByTestId('offer-rail'))

    expect(modalOpen()).toBe(true)
    expect(screen.getByRole('dialog')).toHaveTextContent(winterSale.headline)
  })

  it('records the join as coming from the rail', async () => {
    // `joinSource` is how the funnel is measured. A rail join filed as a banner
    // join is a wrong number that nothing else will contradict.
    router.context = { session: nonMember }

    await mount()
    dismissBanner()
    fireEvent.click(screen.getByTestId('offer-rail'))

    await submitJoin()

    expect(joinCalls()).toEqual([{ source: 'rail' }])
  })

  it('goes back to the rail when the reopened modal is dismissed again', async () => {
    await mount()
    dismissBanner()

    fireEvent.click(screen.getByTestId('offer-rail'))
    expect(modalOpen()).toBe(true)

    dismissBanner()

    expect(modalOpen()).toBe(false)
    expect(rail()).not.toBeNull()
  })

  it('asks the API for no second promotion of its own', async () => {
    // The banner already resolved it. A second lookup is latency in front of
    // the offer and a second chance to disagree about what is running.
    await mount()
    dismissBanner()
    fireEvent.click(screen.getByTestId('offer-rail'))
    await act(async () => {})

    expect(promotionLookups()).toHaveLength(1)
  })
})

// ============================================================================
// Surviving the visit
// ============================================================================

describe('OfferRail — across navigation', () => {
  it('is still there after navigating within the session', async () => {
    await mount()
    dismissBanner()
    expect(rail()).not.toBeNull()

    navigate()
    await mount()

    expect(modalOpen()).toBe(false)
    expect(rail()).not.toBeNull()
  })

  it('does not re-ask which promotion is running on every page', async () => {
    await mount()
    dismissBanner()

    navigate()
    await mount()
    navigate()
    await mount()

    expect(promotionLookups()).toHaveLength(1)
  })
})

// ============================================================================
// The defect #445 found — one membership signal, not one per hook instance
// ============================================================================

describe('OfferRail — after a join', () => {
  it('does not offer the discount to someone who just joined from the banner', async () => {
    // The flicker: the modal's own hook instance flipped, the rail's did not,
    // and the rail appeared offering a discount to a fresh member until the
    // router context revalidated on the next navigation.
    router.context = { session: nonMember }

    await mount()
    expect(modalOpen()).toBe(true)

    await submitJoin()

    expect(modalOpen()).toBe(false)
    expect(rail()).toBeNull()
  })

  it('does not offer the discount again to someone who joined from the rail', async () => {
    router.context = { session: nonMember }

    await mount()
    dismissBanner()
    fireEvent.click(screen.getByTestId('offer-rail'))

    await submitJoin()

    expect(modalOpen()).toBe(false)
    expect(rail()).toBeNull()
  })

  it('keeps the rail when the join failed', async () => {
    // A failed join leaves the viewer exactly where they were: still a
    // non-member, still owed a way back to the offer.
    router.context = { session: nonMember }
    served.joinOk = false

    await mount()
    dismissBanner()
    fireEvent.click(screen.getByTestId('offer-rail'))

    await submitJoin()

    expect(modalOpen()).toBe(true)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    dismissBanner()
    expect(rail()).not.toBeNull()
  })

  it('stays hidden after navigating, before the session has caught up', async () => {
    // The router context still says `galleryMember: false` — it only
    // revalidates on the next load — so this is the case a per-instance flip
    // got wrong one beat later rather than immediately.
    router.context = { session: nonMember }

    await mount()
    await submitJoin()

    navigate()
    await mount()

    expect(rail()).toBeNull()
  })
})

// ============================================================================
// Accessibility and the phone
// ============================================================================

describe('OfferRail — accessibility and layout', () => {
  it('is a real button with a discernible name', async () => {
    await mount()
    dismissBanner()

    const tab = screen.getByRole('button', { name: /get 25% off/i })
    expect(tab.tagName).toBe('BUTTON')
    expect(tab).toHaveAttribute('type', 'button')
    expect(tab).toBe(rail())
  })

  it('is reachable from the keyboard', async () => {
    await mount()
    dismissBanner()

    const tab = screen.getByTestId('offer-rail')
    tab.focus()
    expect(tab).toHaveFocus()

    fireEvent.click(tab)
    expect(modalOpen()).toBe(true)
  })

  it('stays off the phone, where their layout runs a bottom dock', async () => {
    // jsdom cannot evaluate a media query, so the breakpoint is asserted on the
    // classes: hidden by default, shown from `lg` up. An unconditional display
    // class here would defeat the `hidden` and put the tab back on top of the
    // dock.
    await mount()
    dismissBanner()

    const classes = screen.getByTestId('offer-rail').className
    expect(classes).toMatch(/(^|\s)hidden(\s|$)/)
    expect(classes).toMatch(/(^|\s)lg:(flex|block|inline-flex|grid)(\s|$)/)
    expect(classes).not.toMatch(/(^|\s)(flex|block|inline-flex|grid)(\s|$)/)
  })

  it('sits under the modal it opens, not over it', async () => {
    // The dialog is `z-50`. A rail at the same layer would paint over the
    // backdrop and stay clickable behind an open offer.
    await mount()
    dismissBanner()

    expect(screen.getByTestId('offer-rail').className).not.toContain('z-50')
  })
})
