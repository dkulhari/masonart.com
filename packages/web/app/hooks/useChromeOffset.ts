/**
 * How tall the sticky chrome currently is, published for anything below it
 * (#421).
 *
 * The header is one row and stays one row; the styles row reveals and
 * collapses beneath it. Everything further down that sticks — CollectionToolbar
 * and the "Hide filters" button it carries — has to sit below whatever is
 * currently shown, or a reveal simply covers it.
 *
 * The height is MEASURED rather than hardcoded. A second magic number next to
 * `HEADER_HEIGHT_CLASS` is exactly the drift that put the toolbar 37px behind
 * the header in #401, and the row is `hidden md:block`, so on a narrow
 * viewport its real height is zero and the offset has to fall back to the bar
 * alone on its own.
 *
 * Consumers read `top-[var(--chrome-offset)]`; the fallback lives in
 * styles/globals.css so server-rendered HTML has the collapsed value before
 * this hook ever runs.
 */

import { useEffect, type RefObject } from 'react'

export const CHROME_OFFSET_VAR = '--chrome-offset'

/** The compact bar — `HEADER_HEIGHT_CLASS`, h-16, 4rem. */
export const COMPACT_BAR_HEIGHT_PX = 64

export function useChromeOffset(
  revealRef: RefObject<HTMLElement | null>,
  isRevealed: boolean
): void {
  useEffect(() => {
    const publish = () => {
      // Collapsed the row still has a box (it is `invisible`, not removed), so
      // the reveal flag decides whether it counts, not the measurement.
      const revealed = isRevealed
        ? (revealRef.current?.getBoundingClientRect().height ?? 0)
        : 0

      document.documentElement.style.setProperty(
        CHROME_OFFSET_VAR,
        `${COMPACT_BAR_HEIGHT_PX + Math.round(revealed)}px`
      )
    }

    publish()

    // Crossing the md breakpoint turns the row from display:none into a real
    // row without any React state changing.
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [revealRef, isRevealed])

  // Hand the fallback back on unmount rather than leaving a stale pixel value
  // pinned to the document.
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(CHROME_OFFSET_VAR)
    },
    []
  )
}
