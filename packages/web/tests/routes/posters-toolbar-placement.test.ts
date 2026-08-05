/**
 * Where the collection toolbar sits (#419).
 *
 * Ours put the whole toolbar — Hide filters, count, sort — inside the products
 * column, so the toggle rendered to the RIGHT of the rail it collapses.
 *
 * Measured on mesonart at 1440px on 2026-08-05 (`.facet-topbar`, headless
 * Chromium, computed boxes):
 *
 *   .page-width.facet-topbar    x=0    w=1440  h=56   <- spans BOTH columns
 *     .facet-wrapper > button   x=48   w=176   h=56   <- "Hide filters"
 *     "3906 products"           x=262
 *     sort control              x=1130 w=262
 *   "Style" (first facet head)  x=48   y=903          <- directly below it
 *   first product card          x=408                 <- grid starts right of the rail
 *
 * So their toggle is not nested inside the rail: it heads a full-width row that
 * the count and sort share, and its left edge is the rail's left edge. Clicking
 * it leaves the button exactly where it is (x=48 before and after) while the
 * facet groups vanish and the grid reflows to x=48.
 *
 * Nesting the button inside our <aside> would have matched the picture and
 * broken the behaviour — the aside is `lg:hidden` when filters are hidden, so
 * the only way back would have gone with it.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const routeSrc = readFileSync(
  join(process.cwd(), 'app/routes/posters/index.tsx'),
  'utf8'
)

const TOOLBAR = '<CollectionToolbar'
const COLUMNS = '<div className="flex gap-8">'

describe('the toolbar spans both columns', () => {
  it('renders above the rail/grid row rather than inside the grid column', () => {
    const toolbar = routeSrc.indexOf(TOOLBAR)
    const columns = routeSrc.indexOf(COLUMNS)

    expect(toolbar).toBeGreaterThan(-1)
    expect(columns).toBeGreaterThan(-1)
    expect(toolbar).toBeLessThan(columns)
  })

  it('renders the toolbar exactly once', () => {
    // A copy left behind in the products column would double the count and the
    // sort control, and only one of them would drive the route's state.
    expect(routeSrc.split(TOOLBAR)).toHaveLength(2)
  })

  it('keeps the rail as the row the toggle sits above', () => {
    // The aside still owns the id the toggle points aria-controls at, and it
    // still collapses on lg — the toggle just no longer travels with it.
    expect(routeSrc).toContain('id={FILTER_SIDEBAR_ID}')
    expect(routeSrc).toMatch(/filtersHidden \? 'lg:hidden' : 'lg:block'/)
  })
})

describe('the sticky rail clears the sticky toolbar', () => {
  /**
   * The toolbar is `sticky top-[var(--chrome-offset)]` and 80px tall — `py-3`
   * twice over the 56px pill. Spanning both columns it now passes over the
   * rail, so a rail pinned any higher than that slides under a translucent
   * bar. The old `+1rem` was breathing room from when the two never met.
   */
  it('offsets the rail by the toolbar height, not by 1rem', () => {
    expect(routeSrc).toContain('top-[calc(var(--chrome-offset)+5rem)]')
    expect(routeSrc).not.toContain('top-[calc(var(--chrome-offset)+1rem)]')
  })
})

describe('mobile is untouched', () => {
  it('still offers the drawer button in the lg:hidden block', () => {
    expect(routeSrc).toContain('<MobileFilterButton')
    expect(routeSrc).toContain('mb-6 flex flex-col gap-4 lg:hidden')
  })
})
