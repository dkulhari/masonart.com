/**
 * Product card geometry and motion tokens.
 *
 * Single source of truth so the card, its skeleton and the grid cannot drift.
 * The skeleton importing MEDIA_RATIO is what fixes the home-page layout shift
 * that ticket #360 recorded — previously the skeleton hardcoded aspect-[2/3]
 * while the card rendered aspect-[3/4].
 *
 * Motion values measured from mesonart.com; see
 * docs/research/mesonart-grid/README.md and the spec's Appendix A.
 */

/**
 * The square invariant, in Tailwind form.
 *
 * Applied to the ONE in-flow image in each card, which therefore defines the
 * media box height. Every hover slide is absolutely positioned and cannot
 * contribute height. Rows then align purely via CSS Grid stretch.
 */
export const MEDIA_RATIO = 'aspect-square'

/**
 * Responsive sizes hint, matching the grid's 2 / md:3 / xl:4 columns.
 *
 * Mesonart omits `sizes` entirely, which we measured causing a 6.7x over-fetch —
 * the browser assumes 100vw and downloads the 1080w variant into a 160.75px
 * card at 375px. Always set this.
 */
export const SIZES_ATTR =
  '(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw'

/** --animation-primary: .5s cubic-bezier(.3, 1, .3, 1) */
export const EASE_PRIMARY = 'ease-[cubic-bezier(.3,1,.3,1)]'

/** --animation-fast: .3s cubic-bezier(.7, 0, .3, 1) */
export const EASE_FAST = 'ease-[cubic-bezier(.7,0,.3,1)]'

/**
 * Map a cursor position to a hover slide index.
 *
 * The media box is divided into (n - 1) equal zones mapping to slides 1..n-1.
 * Slide 0 is reserved for the not-hovered state and is unreachable while
 * hovering, so moving onto a card always reveals a *different* image.
 *
 * Generalises mesonart's implementation, which hardcodes `mediaCount === 2|3|4`
 * and silently does nothing for 5 or more media.
 *
 * Measured thresholds on a 4-media card, entering fresh at each fraction:
 *   0.02 / 0.10 / 0.20 -> 1
 *   0.35 / 0.50 / 0.65 -> 2
 *   0.80 / 0.98        -> 3
 */
export function zoneFor(clientX: number, el: HTMLElement, n: number): number {
  if (n < 2) return 0
  const { left, width } = el.getBoundingClientRect()
  if (width <= 0) return 1
  const zones = n - 1
  const raw = Math.ceil(((clientX - left) / width) * zones)
  return Math.min(zones, Math.max(1, raw || 1))
}
