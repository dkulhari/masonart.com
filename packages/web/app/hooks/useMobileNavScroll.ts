import { useEffect, useRef, useState } from 'react'

export interface MobileNavScrollState {
  /**
   * Top menu visible state in mobile view:
   * Visible at top of page (y <= THRESHOLD) or when scrolling DOWN.
   * Hidden when scrolling UP (y > THRESHOLD).
   */
  isTopMenuVisible: boolean
  /**
   * Bottom tab bar visible state in mobile view:
   * Visible at top of page (y <= THRESHOLD) or when scrolling UP.
   * Hidden when scrolling DOWN (y > THRESHOLD).
   */
  isBottomMenuVisible: boolean
}

const THRESHOLD_PX = 60
const JITTER_PX = 6

export function useMobileNavScroll(): MobileNavScrollState {
  const [scrollState, setScrollState] = useState<MobileNavScrollState>({
    isTopMenuVisible: true,
    isBottomMenuVisible: true,
  })
  const lastY = useRef(0)

  useEffect(() => {
    lastY.current = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY.current

      if (y <= THRESHOLD_PX) {
        lastY.current = y
        setScrollState({
          isTopMenuVisible: true,
          isBottomMenuVisible: true,
        })
        return
      }

      if (Math.abs(delta) < JITTER_PX) return

      lastY.current = y
      // Page moves UP when scrollY increases (delta > 0).
      // Both top and bottom menus show when page moves UP (delta > 0),
      // and hide when page moves DOWN (delta < 0).
      const isPageMovingUp = delta > 0

      setScrollState({
        isTopMenuVisible: isPageMovingUp,
        isBottomMenuVisible: isPageMovingUp,
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return scrollState
}
