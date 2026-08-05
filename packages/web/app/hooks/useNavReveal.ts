/**
 * Scroll-direction reveal for the header's nav rows (#421).
 *
 * Mesonart's header collapses to a compact bar on the way down and brings the
 * nav rows back the moment you scroll UP, wherever you happen to be on the
 * page. Direction, not position — a position-only rule ("show below 100px")
 * strands the nav until the user drags all the way back to the top.
 *
 * Two guards keep it from flickering:
 *
 *  - inside `NAV_REVEAL_THRESHOLD_PX` of the top the rows are always shown,
 *    so a few pixels of scroll off a fresh page load doesn't snatch them away
 *    before the header has even left the viewport;
 *  - deltas under `NAV_REVEAL_JITTER_PX` are ignored. Trackpads and iOS
 *    rubber-banding emit tiny opposite-direction deltas, and a naive sign
 *    check toggles the header on every one of them.
 */

import { useEffect, useRef, useState } from 'react'

/** Within this distance of the top, the rows stay put. */
export const NAV_REVEAL_THRESHOLD_PX = 96

/** Smaller than this is wobble, not intent. */
export const NAV_REVEAL_JITTER_PX = 6

export function useNavReveal(): boolean {
  const [isRevealed, setIsRevealed] = useState(true)
  const lastY = useRef(0)

  useEffect(() => {
    // A route change can land mid-page; measure rather than assume zero.
    lastY.current = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY.current

      if (y <= NAV_REVEAL_THRESHOLD_PX) {
        lastY.current = y
        setIsRevealed(true)
        return
      }

      // Hold `lastY` through wobble so a slow drag still accumulates into a
      // real delta instead of being swallowed pixel by pixel.
      if (Math.abs(delta) < NAV_REVEAL_JITTER_PX) return

      lastY.current = y
      setIsRevealed(delta < 0)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return isRevealed
}
