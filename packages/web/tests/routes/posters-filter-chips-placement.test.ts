/**
 * Where the desktop active-filter chips sit (#454).
 *
 * They rendered in the products column — a `lg:block` div *after* the
 * `</aside>` — so they read as belonging to the grid rather than to the
 * filters that produced them.
 *
 * The rail was the first instinct, and is where mesonart puts theirs. It is
 * the wrong place for us: the `<aside>` is `lg:hidden` once filters are
 * hidden (#419), so chips nested in it vanish with it and leave a shopper
 * with an active filter, a reduced product count and no way to see or clear
 * what is filtering. The toolbar already spans both columns, is sticky, and
 * survives the rail collapsing — one render site, no state to keep in sync.
 *
 * Source assertions rather than a render: the placement is what is being
 * protected, and the route is a TanStack file route whose loader/search
 * plumbing a jsdom render would have to stub before it could measure a class
 * name. Same idiom, and the same reason, as posters-toolbar-placement.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const routeSrc = readFileSync(
  join(process.cwd(), 'app/routes/posters/index.tsx'),
  'utf8'
)

/** The `<CollectionToolbar ... />` element, opening tag through its close. */
const toolbarElement = () => {
  const start = routeSrc.indexOf('<CollectionToolbar')
  expect(start).toBeGreaterThan(-1)
  const end = routeSrc.indexOf('/>', start)
  expect(end).toBeGreaterThan(start)
  return routeSrc.slice(start, end)
}

describe('the chips ride in the toolbar', () => {
  it('hands them to CollectionToolbar rather than the products column', () => {
    expect(toolbarElement()).toContain('chips={')
  })

  it('renders the desktop copy inside the toolbar element itself', () => {
    // Not "somewhere above the grid" — inside the slot, so it cannot drift
    // back out into the column the way the old div did.
    expect(toolbarElement()).toContain('<ActiveFilterTags')
  })

  it('leaves no second desktop chip row behind in the products column', () => {
    // The old site: `<div className="mb-6 hidden lg:block">` after the aside.
    // Two rows would double every chip and only one would be in the bar.
    expect(routeSrc).not.toContain('mb-6 hidden lg:block')
  })

  it('still renders exactly two copies — the sheet one and the toolbar one', () => {
    expect(routeSrc.split('<ActiveFilterTags')).toHaveLength(3)
  })

  it('keeps the mobile copy in its own lg:hidden block', () => {
    // The button that used to head this row is the floating pill now, so the
    // row is the chips alone — and renders only when there are chips to show.
    expect(routeSrc).toContain('mb-6 lg:hidden')
    expect(routeSrc).toContain('<FilterSortButton')
  })
})

describe('the toolbar height the rail is pinned against', () => {
  /**
   * The rail's `top` is `calc(var(--chrome-offset) + 5rem)` and the 5rem is
   * the toolbar: a 56px pill inside `py-3`, hardcoded by #419. A chips row
   * that wraps makes the bar taller and silently puts the rail behind it —
   * the same class of bug as the 37px header overlap in #401.
   *
   * So the chips get one line that scrolls sideways, and the constant stays
   * true. The alternative was publishing a measured height into a custom
   * property; a THIRD hardcoded number was never one of the options.
   */
  it('keeps the rail offset at the toolbar height it was', () => {
    expect(routeSrc).toContain('top-[calc(var(--chrome-offset)+5rem)]')
  })

  it('renders the chips in a row, not a wrap, wherever they are handed over', () => {
    expect(toolbarElement()).toContain('variant="row"')
  })
})
