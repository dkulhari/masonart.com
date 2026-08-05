/**
 * useNavReveal — scroll-direction reveal for the header's nav rows (#421).
 *
 * The behaviour under test is direction, not position: scrolling down hides
 * the rows and scrolling up brings them back WITHOUT having to return to the
 * top of the page. A position-only rule (`revealed = scrollY < 100`) reads as
 * broken the moment someone scrolls up from the middle of a long grid.
 *
 * jsdom does not scroll, so `window.scrollY` is stubbed and the event is
 * dispatched by hand — the hook listens for `scroll` on `window` and reads
 * `scrollY`, which is exactly what those two lines simulate.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  useNavReveal,
  NAV_REVEAL_THRESHOLD_PX,
  NAV_REVEAL_JITTER_PX,
} from '~/hooks/useNavReveal'

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', {
      value: y,
      configurable: true,
      writable: true,
    })
    window.dispatchEvent(new Event('scroll'))
  })
}

afterEach(() => {
  scrollTo(0)
})

describe('useNavReveal', () => {
  it('starts revealed', () => {
    const { result } = renderHook(() => useNavReveal())

    expect(result.current).toBe(true)
  })

  it('collapses once the page scrolls down past the header', () => {
    const { result } = renderHook(() => useNavReveal())

    scrollTo(NAV_REVEAL_THRESHOLD_PX + 400)

    expect(result.current).toBe(false)
  })

  it('reveals again on scroll up, without returning to the top', () => {
    // The whole point of the ticket: the rows come back mid-page.
    const { result } = renderHook(() => useNavReveal())

    scrollTo(1200)
    expect(result.current).toBe(false)

    scrollTo(1100)
    expect(result.current).toBe(true)
  })

  it('stays revealed while still inside the threshold', () => {
    // Scrolling down a few pixels off the top must not snatch the nav away
    // before the header has even left the viewport.
    const { result } = renderHook(() => useNavReveal())

    scrollTo(Math.max(NAV_REVEAL_THRESHOLD_PX - 1, 0))

    expect(result.current).toBe(true)
  })

  it('re-reveals whenever the page is back at the top', () => {
    const { result } = renderHook(() => useNavReveal())

    scrollTo(1200)
    expect(result.current).toBe(false)

    // Jumped rather than scrolled — an anchor link or a route change.
    scrollTo(0)

    expect(result.current).toBe(true)
  })

  it('ignores sub-pixel jitter and momentum wobble', () => {
    // Trackpad and iOS rubber-banding emit tiny opposite-direction deltas; a
    // naive sign check makes the header flicker on every one of them.
    const { result } = renderHook(() => useNavReveal())

    scrollTo(1200)
    expect(result.current).toBe(false)

    scrollTo(1200 - (NAV_REVEAL_JITTER_PX - 1))

    expect(result.current).toBe(false)
  })

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderHook(() => useNavReveal())

    unmount()
    scrollTo(1200)

    // Still the value it held at unmount — no setState on a dead component.
    expect(result.current).toBe(true)
  })
})
