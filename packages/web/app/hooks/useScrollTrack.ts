/**
 * useScrollTrack — the mechanics behind a horizontally-scrolling card track.
 *
 * Ticket #629. `home/ProductRail` (the home page bands) and
 * `product/ProductCarousel` (the PDP's related rows) each carried an identical
 * copy of this: the same edge measurement, the same optimistic defaults, the
 * same 80%-of-a-viewport `scrollBy`, the same ArrowLeft/ArrowRight handling.
 * ProductRail's module comment said outright that the logic was "deliberately
 * the same shape as that file's so the two can be merged later if a third
 * caller appears" — this is that merge, brought forward because the
 * duplication scan found the copies before a third caller did.
 *
 * This hook owns the TRACK ONLY. It deliberately does not own the heading, the
 * arrow buttons, the card widths or the container classes — those are the two
 * components' actual differences (a 56px arrow pair over a display heading and
 * a View All pill on one; a small `text-xl` heading over five-up cards on the
 * other), and folding them in here is what would turn one shared primitive back
 * into a component with four boolean props.
 *
 * ## Why the initial state is optimistic
 *
 * A track that has never been laid out reports `scrollWidth === clientWidth ===
 * 0`, which is indistinguishable from "fits, nothing to scroll". So the mount
 * measurement SKIPS that case and keeps the initial state (at the start, more
 * to scroll) rather than disabling the forward arrow on a container that simply
 * has not painted yet — one frame in a real browser, forever in jsdom.
 *
 * The scroll handler has no such guard, and needs none: a real scroll event
 * only fires once the track has real geometry.
 *
 * ## Why `prefers-reduced-motion` is read at call time
 *
 * It gates the *programmatic* `scrollBy` from the arrows and the keyboard.
 * `motion-reduce:scroll-auto` on the track element covers the CSS
 * `scroll-behavior` side (wheel and native scrolling); this covers the JS side.
 * Reading it at call time also means a user who changes the setting mid-session
 * gets the new behaviour without a remount.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** Slack, in px, for a scroll position that still counts as "at rest" at an edge. */
export const EDGE_SLACK_PX = 1

/** Fraction of the visible track width one arrow press travels. */
const SCROLL_STEP_RATIO = 0.8

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface ScrollTrack<T extends HTMLElement> {
  /** Attach to the scrolling element itself (the `<ul>`, not its wrapper). */
  trackRef: React.RefObject<T | null>
  /** True while the track sits at its left edge — disables the prev arrow. */
  atStart: boolean
  /** True when there is nothing further right — disables the next arrow. */
  atEnd: boolean
  /** Re-read the track geometry. Wire to the element's `onScroll`. */
  updateEdges: () => void
  /** Scroll one step left (-1) or right (1). */
  scrollByDirection: (direction: -1 | 1) => void
  /** Wire to the element's `onKeyDown` to make it keyboard-scrollable. */
  handleTrackKeyDown: (event: React.KeyboardEvent<T>) => void
}

/**
 * @param measureKey Re-measure whenever this changes — pass the rendered items,
 *   so a track whose contents change re-reads its edges without the caller
 *   needing an effect of its own.
 */
export function useScrollTrack<T extends HTMLElement>(
  measureKey?: unknown
): ScrollTrack<T> {
  const trackRef = useRef<T | null>(null)
  // Optimistic: at the left edge with more to scroll, until a real measurement
  // says otherwise. See the module comment for why this matters.
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)

  const updateEdges = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    const scrollable = maxScroll > EDGE_SLACK_PX
    setAtStart(track.scrollLeft <= EDGE_SLACK_PX)
    setAtEnd(!scrollable || track.scrollLeft >= maxScroll - EDGE_SLACK_PX)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    // 0x0 is "not laid out yet", not "nothing to scroll".
    if (track.scrollWidth === 0 && track.clientWidth === 0) return
    updateEdges()
  }, [updateEdges, measureKey])

  useEffect(() => {
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
  }, [updateEdges])

  const scrollByDirection = useCallback((direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({
      left: direction * track.clientWidth * SCROLL_STEP_RATIO,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  const handleTrackKeyDown = useCallback(
    (event: React.KeyboardEvent<T>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollByDirection(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollByDirection(-1)
      }
    },
    [scrollByDirection]
  )

  return { trackRef, atStart, atEnd, updateEdges, scrollByDirection, handleTrackKeyDown }
}

export default useScrollTrack
