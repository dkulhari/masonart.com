/**
 * Mobile chrome visibility, driven by scroll POSITION (#597).
 *
 * Mesonart's two mobile bars trade places around a single point near the top
 * of the page: the top bar owns the top of the page, the tab bar owns the rest
 * of it. Neither reads scroll direction — measured on mesonart at mobile
 * width, the top bar sits at `translateY(-72px)` once you are past the
 * threshold and stays there no matter how far back up you scroll, and the tab
 * bar holds `translateY(0)` through travel in both directions.
 *
 * That is why there is no `lastY` and no jitter guard here: with direction
 * gone there is no sign to debounce, and a crawl across the threshold has to
 * register rather than be swallowed as wobble.
 *
 * Desktop is a different rule and a different hook — `useNavReveal` (#421)
 * reveals the nav rows on scroll-up, and those rows are `md:block` while the
 * header's transform is `md:translate-y-0`, so the two never both apply.
 */

import { useEffect, useState } from 'react'

export interface MobileNavScrollState {
  /** Top bar: visible only at the top of the page (y <= THRESHOLD). */
  isTopMenuVisible: boolean
  /** Bottom tab bar: the mirror of the top bar — visible once scrolled. */
  isBottomMenuVisible: boolean
}

/** Within this distance of the top, the page counts as "at the top". */
const THRESHOLD_PX = 60

export function useMobileNavScroll(): MobileNavScrollState {
  // One boolean rather than the state object: React bails out of a re-render
  // when the value is unchanged, and every scroll event re-sets this. A fresh
  // object would re-render the header on each one instead.
  const [isAtTop, setIsAtTop] = useState(true)

  useEffect(() => {
    // A route change can land mid-page; measure rather than assume zero.
    const sync = () => setIsAtTop(window.scrollY <= THRESHOLD_PX)

    sync()
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [])

  return { isTopMenuVisible: isAtTop, isBottomMenuVisible: !isAtTop }
}
