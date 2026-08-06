/**
 * The running promotion, and the one clock that counts towards it.
 *
 * Two surfaces beyond the strip need to know whether a sale exists: the red
 * Sale link in nav row 2, which must be ABSENT rather than disabled when none
 * is, and the /sale page, which prints the headline and the countdown. Both go
 * through here so neither invents a second answer.
 *
 * ## Nothing about a sale is written in this file
 *
 * No depth, no headline, no duration. `GET /api/promotions/active` (#432)
 * answers `null` when nothing is running and an allowlisted payload when
 * something is; `null` is what every caller renders nothing from. A literal
 * here would keep advertising a promotion after the row justifying it was
 * switched off.
 *
 * ## The deadline arrives already resolved
 *
 * The payload carries a `deadline` and deliberately never carries an end date.
 * The server mints this visitor's rolling window into a cookie and clamps it
 * against the real end, so what is shown can never exceed the time actually
 * left. `useCountdown` formats that instant with SaleStrip's own
 * `formatRemaining` — the same function the strip renders through, so the band
 * at the top of the page and the clock in the middle of it cannot print
 * different digits for the same second.
 *
 * Reaching zero mid-session is ordinary, not an error: the window can run out
 * while the sale is still live. The hook answers `null`, callers drop the
 * clock and keep the headline, and the next navigation picks up a freshly
 * minted deadline.
 *
 * ## Why SaleStrip still has a lookup of its own
 *
 * It predates this hook (#434) and is deliberately left alone here — the two
 * requests resolve the same cookie to the same deadline, so they agree, and
 * folding the strip into this hook is a change to a component with its own
 * suite rather than something to smuggle into a page ticket.
 */

import { useEffect, useMemo, useState } from 'react'

import {
  formatRemaining,
  type ActivePromotion,
} from '~/components/layout/SaleStrip'
import { getApiUrl } from '~/lib/utils'

const TICK_MS = 1000

/**
 * The in-flight lookup, shared.
 *
 * The header and a page mounting in the same frame ask the same question; one
 * request answers both. Only the *pending* promise is held — no result cache,
 * because a stale "no sale running" outliving an admin enabling one is exactly
 * the staleness this feature cannot afford.
 */
let inFlight: Promise<ActivePromotion | null> | null = null

function lookup(): Promise<ActivePromotion | null> {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      /**
       * Absolute base: there is no Vite `/api` proxy in this repo and the API
       * is a separate origin in dev, so a bare `/api/...` would quietly hit
       * the web server. Credentials carry the countdown cookie — without it
       * every load re-mints this visitor's window.
       */
      const response = await fetch(`${getApiUrl()}/api/promotions/active`, {
        credentials: 'include',
      })
      if (!response.ok) return null
      return ((await response.json()) as ActivePromotion | null) ?? null
    } catch {
      // A promotion is decoration on every surface that reads it. A failed
      // lookup reads as "no sale running" rather than taking a page down.
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export interface UseActivePromotionResult {
  /** `undefined` while unknown, `null` once known to be absent. */
  promotion: ActivePromotion | null | undefined
  /** False until the lookup has answered, so callers can hold their fire. */
  isResolved: boolean
}

/**
 * @param override When passed — including as an explicit `null` — it wins and
 * no request is made. Callers that already hold the payload, and tests, use
 * this; omitting it runs the lookup.
 */
export function useActivePromotion(
  override?: ActivePromotion | null
): UseActivePromotionResult {
  const [fetched, setFetched] = useState<ActivePromotion | null | undefined>(
    undefined
  )

  const hasOverride = override !== undefined

  useEffect(() => {
    if (hasOverride) return

    let cancelled = false
    void lookup().then((body) => {
      if (!cancelled) setFetched(body)
    })

    return () => {
      cancelled = true
    }
  }, [hasOverride])

  if (hasOverride) return { promotion: override, isResolved: true }
  return { promotion: fetched, isResolved: fetched !== undefined }
}

/**
 * The remaining time, ticking, formatted the way the strip formats it.
 *
 * `null` once there is nothing left to count — the single guard behind "no
 * negative clock". Callers render the headline alone on `null`.
 */
export function useCountdown(
  deadline: string | null | undefined
): ReturnType<typeof formatRemaining> {
  const deadlineMs = useMemo(() => {
    if (!deadline) return null
    const parsed = Date.parse(deadline)
    return Number.isNaN(parsed) ? null : parsed
  }, [deadline])

  /**
   * `now` is state rather than a per-tick counter so the first painted frame
   * already shows a time — seeding `null` here would flash a headline with no
   * clock beside it and then jump the layout a frame later.
   */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadlineMs === null) return

    // Re-read the clock: `now` was seeded at mount, which is before the
    // lookup resolved, so the first second would be stale by the round trip.
    setNow(Date.now())
    if (deadlineMs - Date.now() <= 0) return

    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      // Stop at the deadline. Past it there is nothing to count, and an
      // interval left running keeps re-rendering a page with no timer.
      if (deadlineMs - current <= 0) clearInterval(timer)
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [deadlineMs])

  if (deadlineMs === null) return null
  return formatRemaining(deadlineMs - now)
}

export type { ActivePromotion }
