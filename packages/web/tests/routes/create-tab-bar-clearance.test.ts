import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOBILE_TAB_BAR_OFFSET_CLASS } from '~/components/layout/MobileTabBar'

const createRoute = readFileSync(
  join(__dirname, '../../app/routes/create/index.tsx'),
  'utf-8',
)

describe('/create action bar clears the mobile tab bar', () => {
  it('exports an offset that carries the same height and safe-area term as the padding', () => {
    expect(MOBILE_TAB_BAR_OFFSET_CLASS).toBe(
      'bottom-[calc(3.875rem+env(safe-area-inset-bottom))]',
    )
  })

  it('applies the shared offset to the fixed action bar instead of bottom-0', () => {
    expect(createRoute).toContain('MOBILE_TAB_BAR_OFFSET_CLASS')
    expect(createRoute).not.toMatch(/fixed inset-x-0 bottom-0 z-40/)
  })

  it('does not scope the offset to a breakpoint', () => {
    // The bar is md:hidden and the tab bar is lg:hidden, so the tab bar is
    // always present when this bar renders. An lg:-prefixed offset would
    // never fire.
    expect(createRoute).not.toMatch(/(sm|md|lg|xl):bottom-\[calc\(3\.875rem/)
  })
})
