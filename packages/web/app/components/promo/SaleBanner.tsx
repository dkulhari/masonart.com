/**
 * SaleBanner — the offer, and how often a visitor has to see it (#445).
 *
 * Mounted once in `routes/__root.tsx` so it survives navigation and resolves
 * one promotion for the whole visit. What it renders is `JoinGalleryModal`
 * (#444); what it owns is the decision of whether that modal is open.
 *
 * ## The cadence, and why it is not a preference
 *
 * Once per session, then a 7-day cooldown after a dismissal (design §2,
 * researched 2026-08-05). A discount popup that reappears on every page view is
 * the most common version of this feature and the reason visitors install
 * blockers; one that never reappears throws away the recovery that makes gated
 * discounts worth running at all.
 *
 * Two records, two lifetimes, and the split is the whole rule:
 *
 * - **Seen** lives in `sessionStorage`. "You have had your popup" should expire
 *   when the visit does, so a visitor who comes back next week gets the offer
 *   again even though they never said no.
 * - **Dismissed** lives in `localStorage` as the timestamp of the refusal. "No"
 *   should outlive the tab. The cooldown length is applied at read time rather
 *   than baked into a stored expiry, so changing `SALE_BANNER_COOLDOWN_MS`
 *   applies to dismissals already on disk instead of only to future ones.
 *
 * ## Why the keys carry the promotion id
 *
 * A single `chobii:sale-banner-dismissed` key would mean a visitor who closed
 * the winter sale never sees the spring one: the new campaign inherits the old
 * campaign's refusal, and every sale after the first quietly reaches nobody who
 * ever said no. Keying by promotion id makes a new sale a new question. It also
 * means the records are self-expiring in practice — a finished promotion's key
 * is simply never read again.
 *
 * ## Why the state is a module store rather than component state
 *
 * The banner and the rail (#446) are siblings mounted at the root. If each
 * derived "should I be showing?" from storage on its own, they would race: the
 * banner would mark the session seen and the rail, reading a beat later, would
 * conclude the banner had already been shown and appear alongside it. One store,
 * one decision, two readers. `useSaleOffer()` is the published handover — the
 * rail asks for `stage === 'rail'` and calls `reopen()`, and never touches a
 * storage key itself.
 *
 * The stage is decided once, when the promotion resolves, and then only moves on
 * an explicit `dismiss()` / `reopen()`. Recomputing it from storage on every
 * render would close the banner the instant it marked itself seen.
 *
 * ## SSR
 *
 * `localStorage` does not exist on the server, so the decision cannot be made
 * there — `getServerSnapshot` reports the idle state and the component renders
 * nothing. The storage reads live inside the post-mount resolver, never at
 * module scope and never in a render body, which is the trap this file is most
 * likely to be refactored back into. `mounted` holds the first client paint for
 * the same reason membership is read from the router context rather than
 * better-auth's `useSession()` (#443): a surface that paints before the answer
 * arrives flashes the offer at a member who already has the price.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import {
  JoinGalleryModal,
  type ActivePromotion,
} from '~/components/promo/JoinGalleryModal'
import { useGalleryMembership } from '~/hooks/useGalleryMembership'
import { getApiUrl } from '~/lib/utils'

// ============================================================================
// Constants
// ============================================================================

/** `sessionStorage` prefix. Suffixed with the promotion id — see the header. */
const SEEN_KEY_PREFIX = 'chobii:sale-banner-seen'

/** `localStorage` prefix. Suffixed with the promotion id — see the header. */
const DISMISSED_KEY_PREFIX = 'chobii:sale-banner-dismissed'

/** Roughly weekly, the researched cadence for a declined offer (design §2). */
export const SALE_BANNER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export function saleBannerSeenKey(promotionId: string): string {
  return `${SEEN_KEY_PREFIX}:${promotionId}`
}

export function saleBannerDismissedKey(promotionId: string): string {
  return `${DISMISSED_KEY_PREFIX}:${promotionId}`
}

// ============================================================================
// Types
// ============================================================================

/**
 * Where the offer currently lives.
 *
 * - `hidden` — nothing to show: no promotion, a member, or not mounted yet.
 * - `banner` — the modal is open.
 * - `rail` — suppressed as a modal but still reachable; the rail tab (#446)
 *   renders on exactly this value.
 */
export type SaleOfferStage = 'hidden' | 'banner' | 'rail'

export interface SaleOffer {
  /** The active promotion, or null. The rail labels itself from this. */
  promotion: ActivePromotion | null
  stage: SaleOfferStage
  /** Close the modal: records the refusal and hands the offer to the rail. */
  dismiss: () => void
  /** Reopen the modal from the rail. Does not clear the cooldown. */
  reopen: () => void
}

interface StoreState {
  promotion: ActivePromotion | null
  stage: SaleOfferStage
}

// ============================================================================
// Storage — every access guarded; a browser may simply refuse
// ============================================================================

/**
 * Storage that cannot throw and does not exist on the server.
 *
 * Safari private mode throws on access, and losing the frequency memory is a
 * far smaller failure than throwing inside the root layout. Absent storage
 * reads as "no record", which biases toward showing the offer — the right way
 * to be wrong for a sale, and the same bias a corrupt value gets below.
 */
function readStore(kind: 'local' | 'session', key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const store = kind === 'local' ? window.localStorage : window.sessionStorage
    return store.getItem(key)
  } catch {
    return null
  }
}

function writeStore(kind: 'local' | 'session', key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    const store = kind === 'local' ? window.localStorage : window.sessionStorage
    store.setItem(key, value)
  } catch {
    // Private mode / storage disabled. The in-memory stage below still hides
    // the banner for this page load, which is the best available outcome.
  }
}

function hasBeenSeenThisSession(promotionId: string): boolean {
  return readStore('session', saleBannerSeenKey(promotionId)) !== null
}

function markSeenThisSession(promotionId: string): void {
  writeStore('session', saleBannerSeenKey(promotionId), String(Date.now()))
}

/**
 * Is this promotion inside its cooldown?
 *
 * A missing, unparseable or future-dated timestamp all read as "not cooling".
 * Bias toward showing: a corrupt byte should not silently retire a campaign,
 * and a clock that moved backwards should not extend a refusal indefinitely.
 */
function isCoolingDown(promotionId: string): boolean {
  const raw = readStore('local', saleBannerDismissedKey(promotionId))
  if (raw === null) return false

  const dismissedAt = Number(raw)
  if (!Number.isFinite(dismissedAt)) return false

  const elapsed = Date.now() - dismissedAt
  return elapsed >= 0 && elapsed < SALE_BANNER_COOLDOWN_MS
}

function recordDismissal(promotionId: string): void {
  writeStore('local', saleBannerDismissedKey(promotionId), String(Date.now()))
}

// ============================================================================
// Store
// ============================================================================

/**
 * The pre-decision state, and the whole of what the server ever renders.
 * A stable reference: `useSyncExternalStore` compares snapshots by identity.
 */
const IDLE: StoreState = { promotion: null, stage: 'hidden' }

let state: StoreState = IDLE
let resolving: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: StoreState): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): StoreState {
  return state
}

function getServerSnapshot(): StoreState {
  return IDLE
}

/**
 * Fetch the promotion and take the frequency decision, exactly once per page
 * load. The `resolving` latch is what keeps the banner and the rail from
 * issuing a request each and reaching two different answers.
 */
function ensureResolved(): Promise<void> {
  if (resolving) return resolving

  resolving = (async () => {
    const promotion = await fetchActivePromotion()

    if (!promotion) {
      setState(IDLE)
      return
    }

    const suppressed =
      hasBeenSeenThisSession(promotion.promotionId) ||
      isCoolingDown(promotion.promotionId)

    // Marked at the moment it is shown, not when it is closed: "once per
    // session" has to hold for a visitor who navigates away with the modal
    // still open.
    if (!suppressed) markSeenThisSession(promotion.promotionId)

    setState({ promotion, stage: suppressed ? 'rail' : 'banner' })
  })()

  return resolving
}

async function fetchActivePromotion(): Promise<ActivePromotion | null> {
  try {
    // Absolute base: there is no Vite `/api` proxy here and the API is a
    // separate origin in dev, so a bare `/api/...` would hit the web server.
    // Credentials carry the countdown cookie (#432) — without it every page
    // load re-mints the visitor's window.
    const response = await fetch(`${getApiUrl()}/api/promotions/active`, {
      credentials: 'include',
    })
    if (!response.ok) return null
    return ((await response.json()) as ActivePromotion | null) ?? null
  } catch {
    // A sale is decoration. A failed lookup reads as "no sale running" rather
    // than taking the root layout down with it.
    return null
  }
}

function dismissOffer(): void {
  const { promotion } = state
  if (!promotion) return

  recordDismissal(promotion.promotionId)
  setState({ promotion, stage: 'rail' })
}

function reopenOffer(): void {
  const { promotion } = state
  if (!promotion) return

  // The cooldown stays on disk. Reopening is the visitor asking again, not the
  // site deciding their refusal expired.
  setState({ promotion, stage: 'banner' })
}

/**
 * Drop the resolved promotion and the in-flight latch.
 *
 * Exists for tests, which need to simulate a page load — a real one throws the
 * module away. Storage is deliberately left alone: that is the part a reload
 * does not clear, and the part the frequency rules are made of.
 */
export function resetSaleOfferStore(): void {
  state = IDLE
  resolving = null
  for (const listener of listeners) listener()
}

// ============================================================================
// Hook — the handover the rail (#446) reads
// ============================================================================

/**
 * The one place any surface asks where the offer stands.
 *
 * The rail renders on `stage === 'rail'` and calls `reopen()`. It must not read
 * a storage key or fetch the promotion itself; both would be a second answer to
 * a question that already has one.
 */
export function useSaleOffer(): SaleOffer {
  const { isMember } = useGalleryMembership()
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // A member already has the price. Not fetching is the point: no request,
    // no decision, no key written on their behalf.
    if (isMember) return
    void ensureResolved()
  }, [isMember])

  const dismiss = useCallback(() => {
    dismissOffer()
  }, [])

  const reopen = useCallback(() => {
    reopenOffer()
  }, [])

  return {
    promotion: snapshot.promotion,
    stage: !mounted || isMember ? 'hidden' : snapshot.stage,
    dismiss,
    reopen,
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * The banner is the modal plus the decision to open it — there is no second
 * piece of chrome here, which is why this renders `JoinGalleryModal` directly
 * rather than wrapping it in a shell of its own.
 */
export function SaleBanner() {
  const { promotion, stage, dismiss } = useSaleOffer()

  return (
    <JoinGalleryModal
      open={stage === 'banner'}
      /**
       * #444's `onClose` fires on dismissal and on a successful join alike.
       * Recording a cooldown for someone who just joined is inert — membership
       * hides every one of these surfaces — and it is the safer conflation: the
       * alternative is re-popping the modal at a visitor who already took the
       * offer.
       */
      onClose={dismiss}
      source="banner"
      // Handed in rather than left to the modal's own lookup: the store already
      // fetched it, and a second round trip would be latency in front of the
      // offer.
      promotion={promotion}
    />
  )
}

export default SaleBanner
