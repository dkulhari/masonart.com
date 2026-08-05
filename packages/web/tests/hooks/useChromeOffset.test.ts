/**
 * useChromeOffset — how tall the sticky chrome currently is (#421).
 *
 * The header is one row; the styles row reveals and collapses beneath it. Any
 * sticky element further down the page (CollectionToolbar, and the "Hide
 * filters" button it carries) has to sit BELOW whatever is currently shown, or
 * the reveal covers it. Publishing the measured height as a custom property is
 * what keeps the two in agreement without a second hardcoded number sitting
 * next to `h-16` waiting to drift — which is what #401 was.
 *
 * Measured, not assumed: the row is `hidden md:block`, so on a narrow viewport
 * its height is genuinely zero and the offset must fall back to the bar alone.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  useChromeOffset,
  CHROME_OFFSET_VAR,
  COMPACT_BAR_HEIGHT_PX,
} from '~/hooks/useChromeOffset'

/** An element whose measured height is whatever the test says it is. */
function rowOf(height: number) {
  const row = document.createElement('nav')
  row.getBoundingClientRect = () => ({ height }) as DOMRect
  return { current: row }
}

const publishedOffset = () =>
  document.documentElement.style.getPropertyValue(CHROME_OFFSET_VAR)

afterEach(() => {
  document.documentElement.style.removeProperty(CHROME_OFFSET_VAR)
})

describe('useChromeOffset', () => {
  it('publishes the compact bar alone while the rows are collapsed', () => {
    renderHook(() => useChromeOffset(rowOf(40), false))

    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX}px`)
  })

  it('adds the revealed row to the offset', () => {
    renderHook(() => useChromeOffset(rowOf(40), true))

    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX + 40}px`)
  })

  it('follows the rows as they reveal and collapse', () => {
    const ref = rowOf(41)
    const { rerender } = renderHook(
      ({ revealed }) => useChromeOffset(ref, revealed),
      { initialProps: { revealed: true } }
    )
    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX + 41}px`)

    rerender({ revealed: false })

    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX}px`)
  })

  it('ignores a row that is not displayed at this breakpoint', () => {
    // `hidden md:block` — on mobile the row measures zero and the toolbar must
    // stay where it was.
    renderHook(() => useChromeOffset(rowOf(0), true))

    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX}px`)
  })

  it('re-measures when the viewport changes', () => {
    // Crossing the md breakpoint changes the row from display:none to a real
    // row without any React state changing.
    const ref = rowOf(0)
    renderHook(() => useChromeOffset(ref, true))
    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX}px`)

    ref.current.getBoundingClientRect = () => ({ height: 40 }) as DOMRect
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(publishedOffset()).toBe(`${COMPACT_BAR_HEIGHT_PX + 40}px`)
  })

  it('clears the property when the header unmounts', () => {
    const { unmount } = renderHook(() => useChromeOffset(rowOf(40), true))

    unmount()

    expect(publishedOffset()).toBe('')
  })
})
