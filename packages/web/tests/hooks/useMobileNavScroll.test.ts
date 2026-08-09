import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMobileNavScroll } from '~/hooks/useMobileNavScroll'

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

  it('keeps both top and bottom menus visible at top of page', () => {
    const { result } = renderHook(() => useMobileNavScroll())
    expect(result.current.isTopMenuVisible).toBe(true)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })

  it('shows both top and bottom menus when page moves up (scrolling down past threshold)', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    act(() => {
      scrollY = 200
      window.dispatchEvent(new Event('scroll'))
    })

    expect(result.current.isTopMenuVisible).toBe(true)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })

  it('hides both top and bottom menus when page moves down (scrolling up past threshold)', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    // Move page up first
    act(() => {
      scrollY = 300
      window.dispatchEvent(new Event('scroll'))
    })

    // Now move page down
    act(() => {
      scrollY = 250
      window.dispatchEvent(new Event('scroll'))
    })

    expect(result.current.isTopMenuVisible).toBe(false)
    expect(result.current.isBottomMenuVisible).toBe(false)
  })

  it('resets both menus to visible when returning near top of page', () => {
    const { result } = renderHook(() => useMobileNavScroll())

    act(() => {
      scrollY = 300
      window.dispatchEvent(new Event('scroll'))
    })

    act(() => {
      scrollY = 20
      window.dispatchEvent(new Event('scroll'))
    })

    expect(result.current.isTopMenuVisible).toBe(true)
    expect(result.current.isBottomMenuVisible).toBe(true)
  })
})
