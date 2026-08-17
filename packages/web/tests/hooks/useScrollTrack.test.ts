/**
 * useScrollTrack — the shared horizontal-scroll track mechanics (#629).
 *
 * ProductRail (home bands) and ProductCarousel (PDP related rows) both carried
 * their own copy of this: the same edge measurement, the same optimistic
 * defaults, the same 80%-of-a-viewport `scrollBy`, the same arrow-key handling.
 * ProductRail's own module comment said the two were "deliberately the same
 * shape ... so the two can be merged later if a third caller appears". This is
 * that merge, done one caller early because the duplication scan found it.
 *
 * The behaviours worth pinning are the ones the copies agreed on and a naive
 * rewrite would get wrong:
 *
 *   - a track that has never been laid out reports scrollWidth === clientWidth
 *     === 0, which is NOT "nothing to scroll" — the mount measurement has to
 *     skip it and keep the optimistic state, or a real browser disables the
 *     forward arrow for one frame and jsdom disables it forever;
 *   - a scroll EVENT has no such guard, because a real scroll only fires once
 *     the track has real geometry;
 *   - prefers-reduced-motion is read at call time, not at mount, because it
 *     gates the programmatic scroll rather than the CSS one.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScrollTrack } from '~/hooks/useScrollTrack'

/**
 * Give a track real geometry.
 *
 * jsdom never lays anything out, so every scroll dimension is 0 and has to be
 * defined on the element by hand.
 */
function measure(
  el: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft }: {
    scrollWidth: number
    clientWidth: number
    scrollLeft: number
  }
) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  Object.defineProperty(el, 'scrollLeft', { value: scrollLeft, writable: true, configurable: true })
}

/** A track element attached to the document, with `scrollBy` recorded. */
function trackElement() {
  const el = document.createElement('ul')
  const scrollBy = vi.fn()
  el.scrollBy = scrollBy as unknown as HTMLElement['scrollBy']
  document.body.appendChild(el)
  return { el, scrollBy }
}

/** Pretend the user has asked for reduced motion (or not). */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('useScrollTrack', () => {
  it('starts optimistic: at the start of the track, with more to scroll', () => {
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    expect(result.current.atStart).toBe(true)
    expect(result.current.atEnd).toBe(false)
  })

  it('keeps the optimistic state for a track that has never been laid out', () => {
    const { el } = trackElement()
    const { result, rerender } = renderHook(
      ({ items }) => useScrollTrack<HTMLUListElement>(items),
      { initialProps: { items: ['a'] } }
    )

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
    })
    // A measured track with real geometry would report both edges here. This
    // one is 0x0 — "unknown", not "fits" — so the forward arrow stays live.
    rerender({ items: ['a', 'b'] })

    expect(result.current.atStart).toBe(true)
    expect(result.current.atEnd).toBe(false)
  })

  it('re-measures when the rendered items change', () => {
    const { el } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 800 })
    const { result, rerender } = renderHook(
      ({ items }) => useScrollTrack<HTMLUListElement>(items),
      { initialProps: { items: ['a'] } }
    )

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
    })
    rerender({ items: ['a', 'b'] })

    expect(result.current.atEnd).toBe(true)
  })

  it('reports both edges for a track that fits its container', () => {
    const { el } = trackElement()
    measure(el, { scrollWidth: 400, clientWidth: 400, scrollLeft: 0 })
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
      result.current.updateEdges()
    })

    expect(result.current.atStart).toBe(true)
    expect(result.current.atEnd).toBe(true)
  })

  it('reports mid-track: neither edge', () => {
    const { el } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 300 })
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
      result.current.updateEdges()
    })

    expect(result.current.atStart).toBe(false)
    expect(result.current.atEnd).toBe(false)
  })

  it('reports the far end once the track is scrolled all the way right', () => {
    const { el } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 800 })
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
      result.current.updateEdges()
    })

    expect(result.current.atStart).toBe(false)
    expect(result.current.atEnd).toBe(true)
  })

  it('scrolls by 80% of the visible width, forwards and backwards', () => {
    const { el, scrollBy } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 })
    stubReducedMotion(false)
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
      result.current.scrollByDirection(1)
    })
    expect(scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'smooth' })

    act(() => {
      result.current.scrollByDirection(-1)
    })
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -320, behavior: 'smooth' })
  })

  it('jumps without animation when the user prefers reduced motion', () => {
    const { el, scrollBy } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 })
    stubReducedMotion(true)
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
      result.current.scrollByDirection(1)
    })

    expect(scrollBy).toHaveBeenCalledWith({ left: 320, behavior: 'auto' })
  })

  it('scrolls the track with the arrow keys and swallows the key', () => {
    const { el, scrollBy } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 })
    stubReducedMotion(false)
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
    })

    const preventDefault = vi.fn()
    act(() => {
      result.current.handleTrackKeyDown({
        key: 'ArrowRight',
        preventDefault,
      } as unknown as React.KeyboardEvent<HTMLUListElement>)
    })

    expect(preventDefault).toHaveBeenCalled()
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 320, behavior: 'smooth' })

    act(() => {
      result.current.handleTrackKeyDown({
        key: 'ArrowLeft',
        preventDefault,
      } as unknown as React.KeyboardEvent<HTMLUListElement>)
    })

    expect(scrollBy).toHaveBeenLastCalledWith({ left: -320, behavior: 'smooth' })
  })

  it('ignores keys that are not the horizontal arrows', () => {
    const { el, scrollBy } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 0 })
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
    })

    const preventDefault = vi.fn()
    act(() => {
      result.current.handleTrackKeyDown({
        key: 'ArrowDown',
        preventDefault,
      } as unknown as React.KeyboardEvent<HTMLUListElement>)
    })

    expect(preventDefault).not.toHaveBeenCalled()
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('re-measures on a window resize', () => {
    const { el } = trackElement()
    measure(el, { scrollWidth: 1200, clientWidth: 400, scrollLeft: 800 })
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    act(() => {
      result.current.trackRef.current = el as HTMLUListElement
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.atEnd).toBe(true)
  })

  it('does not throw when the track is not mounted', () => {
    const { result } = renderHook(() => useScrollTrack<HTMLUListElement>())

    expect(() => {
      act(() => {
        result.current.updateEdges()
        result.current.scrollByDirection(1)
      })
    }).not.toThrow()
  })
})
