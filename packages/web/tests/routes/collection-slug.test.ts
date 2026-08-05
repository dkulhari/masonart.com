/**
 * /collections/$slug — search parsing and the head.
 *
 * Source- and unit-level. The route calls TanStack hooks and a loader, so
 * rendering it whole needs a router and a server; what is actually worth
 * pinning is the two things most likely to break silently:
 *
 * 1. **Search coercion.** router.tsx overrides TanStack's search
 *    serialisation, so everything arrives as a string and comma-joined arrays
 *    arrive joined. A schema that assumes typed values error-boundaries the
 *    route to a blank page — the trap posters/index.tsx already documents.
 * 2. **The head reading the collection**, not a hardcoded title. A collection
 *    page whose <title> says "Shop Posters" is invisible for the term it
 *    should rank on.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCollectionSearch } from '~/routes/collections/$slug'

const src = readFileSync(
  join(process.cwd(), 'app/routes/collections/$slug.tsx'),
  'utf8'
)

describe('search coercion', () => {
  it('coerces page to a number', () => {
    // Arrives as a string. Left as one, `page + 1` concatenates.
    expect(parseCollectionSearch({ page: '2' }).page).toBe(2)
  })

  it('splits comma-joined facet arrays', () => {
    const parsed = parseCollectionSearch({ styles: 'pop-art,graffiti-art' })
    expect(parsed.styles).toEqual(['pop-art', 'graffiti-art'])
  })

  it('leaves an absent facet absent rather than an empty array', () => {
    // An empty array would be sent as `styles=` and read by the API as a
    // filter matching nothing.
    expect(parseCollectionSearch({}).styles).toBeUndefined()
  })

  it('coerces the price bounds', () => {
    const parsed = parseCollectionSearch({ priceMin: '1000', priceMax: '5000' })
    expect(parsed.priceMin).toBe(1000)
    expect(parsed.priceMax).toBe(5000)
  })

  it('reads the boolean flags from strings', () => {
    expect(parseCollectionSearch({ isAiGenerated: 'true' }).isAiGenerated).toBe(true)
    expect(parseCollectionSearch({ isFeatured: true }).isFeatured).toBe(true)
  })

  it('drops empty strings rather than filtering on nothing', () => {
    expect(parseCollectionSearch({ styles: '' }).styles).toBeUndefined()
  })

  it('survives junk without throwing', () => {
    // validateSearch throwing is what blank-pages the route.
    expect(() => parseCollectionSearch({ page: 'banana' })).not.toThrow()
  })
})

describe('the route', () => {
  it('loads from the collections endpoint, not the product list', () => {
    expect(src).toContain('collectionsApi.detail')
  })

  it('renders the shared shell components rather than its own copies', () => {
    // #470 extracted these so the two collection pages cannot drift.
    expect(src).toContain('ActiveFilterTags')
    expect(src).toContain('MobileFiltersSheet')
    expect(src).toContain('CollectionToolbar')
    expect(src).toContain('ProductFilters')
    expect(src).toContain('ProductGrid')
  })

  it('marks itself current in the Discover rail', () => {
    expect(src).toMatch(/activeSlug/)
  })

  it('takes its heading and copy from the collection row', () => {
    expect(src).toContain('collection.title')
    expect(src).toContain('collection.description')
  })

  it('prefers the collection SEO fields in the head', () => {
    expect(src).toContain('seoTitle')
    expect(src).toContain('seoDescription')
  })

  it('renders a not-found page for an unknown slug instead of an empty grid', () => {
    expect(src).toMatch(/notFound|not found|404/i)
  })
})
