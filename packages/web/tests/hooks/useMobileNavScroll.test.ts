import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMobileNavScroll } from '~/hooks/useMobileNavScroll'

/**
 * The rule is scroll POSITION, not scroll direction (#597). Mesonart's mobile
 * top bar hides once you leave the top and stays hidden until you come back;
 * the tab bar is the mirror of it. Neither reacts to which way you are going,
 * so every case below scrolls up as well as down to pin that down.
 */
describe('useMobileNavScroll', () => {
  let scrollY = 0

  beforeEach(() => {
    scrollY = 0
    Object.defineProperty(window, 'scrollY', {
      get: () => scrollY,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const scrollTo = (y: number) => {
    act(() => {
      scrollY = y
      window.dispatchEvent(new Event('scroll'))
    })
  }

  it('shows the top bar and hides the tab bar at the top of the page', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    expect(result.current.isTopMenuVisible).toBe(true)
    expect(result.current.isBottomMenuVisible).toBe(false)
  })

  it('hides the top bar and shows the tab bar once past the threshold', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    scrollTo(200)

    expect(result.current.isTopMenuVisible).toBe(false)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })

  it('keeps the top bar hidden when scrolling back up mid-page', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    scrollTo(300)
    scrollTo(250)

    expect(result.current.isTopMenuVisible).toBe(false)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })

  it('restores the top bar and hides the tab bar on returning near the top', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    scrollTo(300)
    scrollTo(20)

    expect(result.current.isTopMenuVisible).toBe(true)
    expect(result.current.isBottomMenuVisible).toBe(false)
  })

  it('treats the threshold itself as the top of the page', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    scrollTo(60)
    expect(result.current.isTopMenuVisible).toBe(true)
    expect(result.current.isBottomMenuVisible).toBe(false)

    scrollTo(61)
    expect(result.current.isTopMenuVisible).toBe(false)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })

  it('ignores small deltas that used to be swallowed as jitter', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    // A 2px crawl across the threshold: under the old JITTER_PX guard this
    // never registered, so the bars stayed stuck on the wrong side of it.
    scrollTo(59)
    scrollTo(61)

    expect(result.current.isTopMenuVisible).toBe(false)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })

  it('measures the real scroll position on mount rather than assuming zero', () => {
    // A route change can land mid-page — the bars must mount in the scrolled
    // state, not flash the top-of-page one first.
    scrollY = 400

    const { result } = renderHook(() => useMobileNavScroll())

    expect(result.current.isTopMenuVisible).toBe(false)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })
})
