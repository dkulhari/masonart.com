/**
 * SaleStrip — the beige band above the announcement bar (#434).
 *
 * One line of promotional copy and a clock running down to it. Everything it
 * says arrives from the promotion row; nothing about a sale is written here.
 *
 * ## No promotion, no strip
 *
 * `GET /api/promotions/active` (#432) answers `null` whenever nothing is
 * running, and this component answers that with `null` of its own — no band, no
 * placeholder, no skeleton. The urgency in design §6 is manufactured on
 * purpose and switchable from the admin; the *price* and the *existence of the
 * sale* are not. A strip that outlives its promotion would be advertising a
 * discount the checkout will not honour.
 *
 * That is also why no depth is spelled out in this file. The headline is a
 * column, so an admin ending a sale ends the copy with it. A literal in the
 * markup would keep quoting a number long after the row that justified it was
 * switched off — which is exactly the failure the parity analysis rules out.
 *
 * ## The deadline is resolved before it gets here
 *
 * The payload carries a `deadline` and deliberately never carries `endsAt`
 * (design §6). The server mints this visitor's rolling window into a cookie and
 * clamps it against the real end, so the number shown can never exceed the time
 * actually left. This component formats that instant and ticks towards it. It
 * must never derive a window, apply jitter, or read a duration — a second
 * clock on the client is a second answer.
 *
 * Reaching zero mid-session is ordinary, not an error: the window can run out
 * while the sale is still live. The timer disappears, the headline stays, and
 * the next navigation picks up a freshly minted deadline. Nothing counts past
 * zero and nothing renders a negative.
 *
 * ## Placement
 *
 * NOT sticky. The header is `sticky top-0` and the collection toolbar sits at
 * `top-16` assuming the header alone owns that offset — a sticky strip would
 * shift the toolbar on every collection page. Same `bg-band` beige as the
 * announcement bar it sits above, so the two read as one chrome block.
 *
 * The lookup runs on mount rather than in the root loader, so the strip appears
 * a beat after first paint on a cold load. That is deliberate for now: it keeps
 * the promotion off every SSR response, including the great majority that have
 * no sale to show, and it matches how the other promotion surfaces resolve.
 */

import { useEffect, useMemo, useState } from 'react'

import { cn, getApiUrl } from '~/lib/utils'

// ============================================================================
// Types
// ============================================================================

/**
 * The allowlisted payload `GET /api/promotions/active` returns (#432), or
 * `null` when nothing is running.
 */
export interface ActivePromotion {
  promotionId: string
  headline: string
  /** Null for a fixed-amount promotion, which has no percentage to quote. */
  percentOff: number | null
  membersOnly: boolean
  /** ISO instant, already clamped server-side. There is no `endsAt`. */
  deadline: string
}

export interface SaleStripProps {
  /**
   * The active promotion, when the caller already has it. Omit to let the
   * strip look it up; pass `null` to say explicitly that none is running.
   */
  promotion?: ActivePromotion | null
  className?: string
}

// ============================================================================
// Formatting
// ============================================================================

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

/**
 * Split a remaining duration into what the strip prints and what a screen
 * reader hears.
 *
 * Returns `null` once there is nothing left to count — the single guard behind
 * "no negative clock". Callers render the headline alone on `null`.
 *
 * Hours accumulate rather than wrapping at 24. A `countdownMode: 'real'`
 * promotion can end days out, and wrapping would understate the time left,
 * which is the one direction a countdown must never round.
 */
export function formatRemaining(
  ms: number
): { display: string; label: string } | null {
  if (!Number.isFinite(ms) || ms <= 0) return null

  const totalSeconds = Math.floor(ms / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor(
    (totalSeconds - hours * SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  )
  const seconds = totalSeconds - hours * SECONDS_PER_HOUR - minutes * SECONDS_PER_MINUTE

  const pad = (value: number) => String(value).padStart(2, '0')

  return {
    display: `${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`,
    // Digits separated by colons are unreadable aloud, so the accessible name
    // carries the units the visual form leaves to the layout.
    label: `${hours} hours, ${minutes} minutes and ${seconds} seconds left`,
  }
}

// ============================================================================
// Component
// ============================================================================

export function SaleStrip({ promotion, className }: SaleStripProps) {
  const [fetched, setFetched] = useState<ActivePromotion | null>(null)

  // An explicit `promotion` prop wins, including an explicit `null`; only an
  // omitted prop falls through to the lookup.
  const active = promotion !== undefined ? promotion : fetched

  useEffect(() => {
    if (promotion !== undefined) return

    let cancelled = false

    void (async () => {
      try {
        // Absolute base: there is no Vite `/api` proxy in this repo and the API
        // is a separate origin in dev, so a bare `/api/...` would quietly hit
        // the web server. Credentials carry the countdown cookie — without it
        // every load re-mints this visitor's window.
        const response = await fetch(`${getApiUrl()}/api/promotions/active`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const body = (await response.json()) as ActivePromotion | null
        if (!cancelled) setFetched(body ?? null)
      } catch {
        // A sale strip is decoration. A failed lookup reads as "no sale
        // running" rather than taking the whole page's chrome down with it.
        if (!cancelled) setFetched(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [promotion])

  const deadlineMs = useMemo(() => {
    if (!active) return null
    const parsed = Date.parse(active.deadline)
    return Number.isNaN(parsed) ? null : parsed
  }, [active])

  /**
   * `now` is state rather than a per-tick countdown so the first painted frame
   * already shows a time — a `null` seeded here would flash a headline with no
   * clock beside it and then jump the layout a frame later.
   */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadlineMs === null) return

    // Re-read the clock: `now` was seeded at mount, which is before the lookup
    // resolved, so the first second would otherwise be stale by the round trip.
    setNow(Date.now())
    if (deadlineMs - Date.now() <= 0) return

    const timer = setInterval(() => {
      const current = Date.now()
      setNow(current)
      // Stop at the deadline. Past it there is nothing to count, and an
      // interval left running would keep re-rendering a strip with no timer.
      if (deadlineMs - current <= 0) clearInterval(timer)
    }, MS_PER_SECOND)

    return () => clearInterval(timer)
  }, [deadlineMs])

  if (!active) return null

  const remaining = deadlineMs === null ? null : formatRemaining(deadlineMs - now)

  return (
    <div
      className={cn(
        // NOT sticky — see the placement note above.
        'w-full border-b border-foreground/10 bg-band text-foreground',
        className
      )}
      data-testid="sale-strip"
    >
      <div className="container-wide flex h-9 items-center justify-center gap-3 text-xs">
        <p className="truncate font-medium tracking-wide">{active.headline}</p>

        {remaining && (
          /**
           * Not a live region. It changes every second, and a screen reader
           * interrupting itself once a second to read a clock nobody asked for
           * is worse than no clock at all.
           */
          <time
            dateTime={active.deadline}
            aria-label={remaining.label}
            data-testid="sale-countdown"
            className="shrink-0 font-medium tabular-nums"
          >
            {remaining.display}
          </time>
        )}
      </div>
    </div>
  )
}

export default SaleStrip
