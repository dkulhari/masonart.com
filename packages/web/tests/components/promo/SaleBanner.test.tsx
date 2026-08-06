/**
 * SaleBanner — how often a visitor has to see the offer (#445).
 *
 * The component itself is thin: it hands `JoinGalleryModal` (#444) an `open`
 * flag. Everything worth testing is the decision behind that flag, and every
 * rule below is a way discount popups go wrong in the field:
 *
 * 1. **Nothing to offer, nothing on screen.** No active promotion and no modal;
 *    a member and no modal either. A member already has the price, so showing
 *    them a join prompt is asking for something they have already given.
 *
 * 2. **Once per session, then a 7-day cooldown after a dismissal.** Researched
 *    cadence (design §2), not a guess. A popup that reappears on every page
 *    view is the single most common version of this feature and the reason
 *    visitors install blockers.
 *
 * 3. **The storage key carries the promotion id.** Without it, a visitor who
 *    dismissed the winter sale never sees the spring one — the new campaign
 *    silently inherits the old campaign's refusal. This is the rule most likely
 *    to be dropped in a refactor, so it is asserted behaviourally (a different
 *    promotion gets a fresh chance) and not just on the key string.
 *
 * 4. **Dismissal hands over rather than deletes.** The offer moves to the rail
 *    (#446) — the documented sticky-teaser pattern, and the recovery path for a
 *    dismissed offer. The rail reads the same store this banner writes, so the
 *    two can never disagree about whether the offer is live, dismissed or
 *    cooling. The probe below stands in for the rail.
 *
 * 5. **Nothing renders on the server pass.** `localStorage` does not exist
 *    during SSR, so the frequency decision cannot be made there; and membership
 *    resolving a beat late would flash the banner at a member. Both are the same
 *    fix — render nothing until the client has mounted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import { getApiUrl } from '~/lib/utils'

// ============================================================================
// Router mock — JoinGalleryModal reads the session from the root route context
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

// ============================================================================
// Membership mock — #443 has its own suite; here it is just an answer
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
  SaleBanner,
  useSaleOffer,
  resetSaleOfferStore,
  saleBannerDismissedKey,
  saleBannerSeenKey,
  SALE_BANNER_COOLDOWN_MS,
} from '~/components/promo/SaleBanner'
import type { ActivePromotion } from '~/components/promo/JoinGalleryModal'

// ============================================================================
// Fixtures
// ============================================================================

const API = getApiUrl()
const ACTIVE_URL = `${API}/api/promotions/active`

/** Deliberately not 40% — the parity target's number must never be in our markup. */
const winterSale: ActivePromotion = {
  promotionId: '11111111-1111-4111-8111-111111111111',
  headline: 'WINTER SALE: DEALS STILL GOING 25% OFF',
  percentOff: 25,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

/** A second campaign. Its whole job is to not inherit the first one's refusal. */
const springSale: ActivePromotion = {
  promotionId: '22222222-2222-4222-8222-222222222222',
  headline: 'SPRING REFRESH: 15% OFF EVERY PRINT',
  percentOff: 15,
  membersOnly: true,
  deadline: '2026-08-07T12:00:00.000Z',
}

const fetchMock = vi.fn()

function serveActivePromotion(body: ActivePromotion | null) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
}

const alertSpy = vi.fn()
const confirmSpy = vi.fn()

// ============================================================================
// Clock — the cooldown is a duration, so the tests have to be able to wait it out
// ============================================================================

const T0 = Date.UTC(2026, 7, 6, 12, 0, 0)
const DAY_MS = 24 * 60 * 60 * 1000
const realNow = Date.now
let clock = T0

function advanceDays(days: number) {
  clock += days * DAY_MS
}

beforeEach(() => {
  clock = T0
  Date.now = () => clock

  router.context = { session: null }
  router.navigate.mockReset()

  membership.isMember = false
  membership.isLoading = false
  membership.join.mockReset()
  membership.join.mockResolvedValue(true)

  fetchMock.mockReset()
  serveActivePromotion(winterSale)

  alertSpy.mockReset()
  confirmSpy.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('alert', alertSpy)
  vi.stubGlobal('confirm', confirmSpy)

  window.localStorage.clear()
  window.sessionStorage.clear()
  resetSaleOfferStore()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Date.now = realNow
})

// ============================================================================
// Harness
// ============================================================================

/**
 * Stands in for the rail (#446): a second consumer of the same store, so the
 * handover is asserted through the published API rather than through internals.
 */
function OfferProbe() {
  const { stage, promotion, reopen } = useSaleOffer()

  return (
    <div>
      <span data-testid="offer-stage" data-promotion={promotion?.promotionId ?? ''}>
        {stage}
      </span>
      <button type="button" onClick={reopen}>
        reopen from rail
      </button>
    </div>
  )
}

async function mount() {
  const utils = render(
    <>
      <SaleBanner />
      <OfferProbe />
    </>,
  )

  // Let the promotion lookup settle before anything is asserted.
  await act(async () => {})

  return utils
}

function stage() {
  return screen.getByTestId('offer-stage').textContent
}

function offerOnScreen() {
  return screen.queryByRole('dialog') !== null
}

function dismissOffer() {
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
}

/**
 * A full page load: React tree gone, module singleton gone, storage intact.
 * This — not SPA navigation — is what the frequency rules have to survive.
 */
function reloadPage() {
  cleanup()
  resetSaleOfferStore()
}

/** Browser closed and reopened: `sessionStorage` goes, `localStorage` stays. */
function newBrowserSession() {
  reloadPage()
  window.sessionStorage.clear()
}

/**
 * Swap `window.localStorage` for the duration of one test.
 *
 * `defineProperty` rather than a spy: jsdom exposes storage through a prototype
 * accessor over a Proxy, so `vi.spyOn(window.localStorage, 'getItem')` is not
 * reliably installable. Restoring has to handle both shapes — an own property
 * to put back, or a shadow to delete so the prototype accessor shows through
 * again for the next test.
 */
async function withLocalStorage(stub: unknown, run: () => void | Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(window, 'localStorage')

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: stub,
  })

  try {
    await run()
  } finally {
    if (original) {
      Object.defineProperty(window, 'localStorage', original)
    } else {
      delete (window as unknown as Record<string, unknown>).localStorage
    }
  }
}

// ============================================================================
// Nothing to offer
// ============================================================================

describe('SaleBanner — when there is nothing to offer', () => {
  it('renders nothing when no promotion is active', async () => {
    serveActivePromotion(null)

    await mount()

    expect(offerOnScreen()).toBe(false)
    expect(stage()).toBe('hidden')
  })

  it('renders nothing for a member, and does not even look for a promotion', async () => {
    // They already have the price. Asking them to join is asking for something
    // they have given, and the request behind it is pure waste.
    membership.isMember = true

    await mount()

    expect(offerOnScreen()).toBe(false)
    expect(stage()).toBe('hidden')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders nothing when the promotion lookup fails', async () => {
    // A sale is decoration. A failed lookup reads as "no sale running" rather
    // than taking the root layout down with it.
    fetchMock.mockRejectedValue(new Error('offline'))

    await mount()

    expect(offerOnScreen()).toBe(false)
    expect(stage()).toBe('hidden')
  })
})

// ============================================================================
// Once per session
// ============================================================================

describe('SaleBanner — once per session', () => {
  it('shows the offer to a non-member on the first page of a session', async () => {
    await mount()

    expect(offerOnScreen()).toBe(true)
    expect(stage()).toBe('banner')
    expect(screen.getByRole('dialog')).toHaveTextContent(winterSale.headline)
  })

  it('does not show it again on the next page load in the same session', async () => {
    await mount()
    expect(offerOnScreen()).toBe(true)

    reloadPage()
    await mount()

    // Not dismissed, so no cooldown was written — this is the session rule
    // alone, and it is the one that keeps the modal from following the visitor
    // page to page.
    expect(window.localStorage.getItem(saleBannerDismissedKey(winterSale.promotionId))).toBeNull()
    expect(offerOnScreen()).toBe(false)
  })

  it('marks the session under a key that carries the promotion id', async () => {
    await mount()

    expect(window.sessionStorage.getItem(saleBannerSeenKey(winterSale.promotionId))).not.toBeNull()
    expect(saleBannerSeenKey(winterSale.promotionId)).toContain(winterSale.promotionId)
  })

  it('offers again in a new session when the visitor never dismissed it', async () => {
    await mount()
    expect(offerOnScreen()).toBe(true)

    newBrowserSession()
    await mount()

    expect(offerOnScreen()).toBe(true)
  })

  it('serves two surfaces from one lookup', async () => {
    // The banner and the rail both read this store. Two requests for one answer
    // would be latency in front of the offer, and two chances to disagree.
    await mount()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// Seven-day cooldown
// ============================================================================

describe('SaleBanner — the cooldown after a dismissal', () => {
  it('stays hidden in a new session for seven days after a dismissal', async () => {
    await mount()
    dismissOffer()

    newBrowserSession()
    advanceDays(6)
    await mount()

    expect(offerOnScreen()).toBe(false)
  })

  it('offers again once the seven days are up', async () => {
    await mount()
    dismissOffer()

    newBrowserSession()
    advanceDays(8)
    await mount()

    expect(offerOnScreen()).toBe(true)
  })

  it('records the dismissal under a key that carries the promotion id', async () => {
    await mount()
    dismissOffer()

    const key = saleBannerDismissedKey(winterSale.promotionId)
    expect(key).toContain(winterSale.promotionId)
    expect(window.localStorage.getItem(key)).not.toBeNull()
  })

  it('cools for seven days rather than some other number of days', async () => {
    // The constant is the contract: the stored timestamp plus the cooldown is
    // when the offer comes back, and a test that only checks "hidden later"
    // would pass for a cooldown of a century.
    expect(SALE_BANNER_COOLDOWN_MS).toBe(7 * DAY_MS)

    await mount()
    dismissOffer()

    const stored = Number(
      window.localStorage.getItem(saleBannerDismissedKey(winterSale.promotionId)),
    )
    expect(stored).toBe(T0)
  })
})

// ============================================================================
// A new sale gets a fresh chance
// ============================================================================

describe('SaleBanner — a new promotion is not the old one', () => {
  it('offers a different sale even though the last one was dismissed', async () => {
    await mount()
    dismissOffer()
    expect(offerOnScreen()).toBe(false)

    // Same visitor, same day, same browser — a different campaign. Inheriting
    // the refusal would silently kill every sale after the first.
    reloadPage()
    serveActivePromotion(springSale)
    await mount()

    expect(offerOnScreen()).toBe(true)
    expect(screen.getByRole('dialog')).toHaveTextContent(springSale.headline)
  })

  it('offers a different sale even within the session that saw the last one', async () => {
    await mount()
    expect(offerOnScreen()).toBe(true)

    reloadPage()
    serveActivePromotion(springSale)
    await mount()

    expect(offerOnScreen()).toBe(true)
  })

  it('leaves the dismissed sale dismissed', async () => {
    await mount()
    dismissOffer()

    reloadPage()
    serveActivePromotion(springSale)
    await mount()
    dismissOffer()

    // Two campaigns, two records. One shared key would have made the second
    // dismissal overwrite the first.
    expect(
      window.localStorage.getItem(saleBannerDismissedKey(winterSale.promotionId)),
    ).not.toBeNull()
    expect(
      window.localStorage.getItem(saleBannerDismissedKey(springSale.promotionId)),
    ).not.toBeNull()
  })
})

// ============================================================================
// Handover to the rail (#446)
// ============================================================================

describe('SaleBanner — handing the offer to the rail', () => {
  it('moves the offer to the rail on dismissal instead of deleting it', async () => {
    await mount()
    expect(stage()).toBe('banner')

    dismissOffer()

    expect(offerOnScreen()).toBe(false)
    expect(stage()).toBe('rail')
  })

  it('keeps the promotion readable so the rail can label itself', async () => {
    // The rail's label is `Get {percentOff}% OFF` from this payload. If
    // dismissal dropped the promotion, the rail would have to fetch its own.
    await mount()
    dismissOffer()

    expect(screen.getByTestId('offer-stage')).toHaveAttribute(
      'data-promotion',
      winterSale.promotionId,
    )
  })

  it('starts at the rail when the banner is in cooldown', async () => {
    await mount()
    dismissOffer()

    newBrowserSession()
    advanceDays(1)
    await mount()

    expect(offerOnScreen()).toBe(false)
    expect(stage()).toBe('rail')
  })

  it('starts at the rail when the banner has already been seen this session', async () => {
    await mount()

    reloadPage()
    await mount()

    expect(stage()).toBe('rail')
  })

  it('reopens the banner from the rail, and re-dismisses back to it', async () => {
    await mount()
    dismissOffer()
    expect(stage()).toBe('rail')

    fireEvent.click(screen.getByRole('button', { name: /reopen from rail/i }))

    expect(offerOnScreen()).toBe(true)
    expect(stage()).toBe('banner')

    dismissOffer()
    expect(stage()).toBe('rail')
  })

  it('offers no rail when there is no promotion, and none to a member', async () => {
    serveActivePromotion(null)
    await mount()
    expect(stage()).toBe('hidden')

    reloadPage()
    serveActivePromotion(winterSale)
    membership.isMember = true
    await mount()
    expect(stage()).toBe('hidden')
  })
})

// ============================================================================
// The server pass
// ============================================================================

describe('SaleBanner — server rendering', () => {
  it('renders nothing on the server pass', async () => {
    // `localStorage` does not exist there, so the frequency decision cannot be
    // made; and a member whose session resolves a beat later would be shown the
    // banner in the meantime. Same fix for both.
    expect(renderToStaticMarkup(<SaleBanner />)).toBe('')
  })

  it('reads no storage during the server pass', async () => {
    // The trap this guards: a frequency check at module scope or in the render
    // body. Both look harmless in jsdom and both break the server render.
    const reads: string[] = []
    const writes: string[] = []
    const recorder = {
      getItem: (key: string) => {
        reads.push(key)
        return null
      },
      setItem: (key: string) => void writes.push(key),
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }

    await withLocalStorage(recorder, () => {
      expect(renderToStaticMarkup(<SaleBanner />)).toBe('')
    })

    expect(reads).toEqual([])
    expect(writes).toEqual([])
  })

  it('survives a browser that refuses storage', async () => {
    // Safari private mode throws on access. Losing the frequency memory is a
    // far smaller failure than throwing inside the root layout.
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
      clear: () => {},
      key: () => null,
      length: 0,
    }

    await withLocalStorage(throwing, async () => {
      await mount()
      expect(offerOnScreen()).toBe(true)
    })
  })
})

// ============================================================================
// Hygiene
// ============================================================================

describe('SaleBanner — hygiene', () => {
  it('asks the API origin for the promotion, carrying the countdown cookie', async () => {
    // There is no Vite `/api` proxy in this repo: a bare `/api/...` would hit
    // the web server. The deadline is minted per visitor, so credentials ride
    // along or every page load re-mints the window.
    await mount()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(ACTIVE_URL)
    expect(init?.credentials).toBe('include')
  })

  it('carries no discount of its own', async () => {
    const { container } = await mount()

    expect(container.textContent).toContain('25%')
    // The parity target runs 40%. In our markup it would mean the banner is
    // advertising a sale it did not read from the API.
    expect(container.textContent).not.toContain('40')
  })

  it('never reaches for a browser alert or confirm', async () => {
    await mount()
    dismissOffer()

    expect(alertSpy).not.toHaveBeenCalled()
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
