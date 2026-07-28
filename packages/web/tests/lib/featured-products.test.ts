/**
 * Featured Products Response Shape Tests
 *
 * Regression tests for the empty-homepage bug: the API serves featured
 * products under an `items` key, but the home page loader read `.products`,
 * which is always undefined. The `|| []` fallback then produced an empty
 * array and the page rendered its "Coming Soon" empty state on every load —
 * silently, because the surrounding try/catch swallowed nothing at all.
 *
 * See ticket #351.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { productsApi, toFeaturedProducts } from '../../app/lib/api'

const FEATURED_ITEM = {
  id: 'p1',
  sku: 'ABS-001',
  title: 'Cosmic Harmony',
  slug: 'cosmic-harmony',
  basePrice: '1499.00',
  images: [],
  orientation: 'portrait',
}

describe('featured products response shape', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [FEATURED_ITEM] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('serves featured products under `items`, not `products`', async () => {
    const response = await productsApi.featured({ limit: 8 })

    expect(response.items).toHaveLength(1)
    expect((response as Record<string, unknown>).products).toBeUndefined()
  })

  it('maps the API envelope to a non-empty product list', async () => {
    const response = await productsApi.featured({ limit: 8 })

    expect(toFeaturedProducts(response)).toHaveLength(1)
    expect(toFeaturedProducts(response)[0].slug).toBe('cosmic-harmony')
  })

  it('falls back to an empty list when the envelope has no items', () => {
    expect(toFeaturedProducts({} as never)).toEqual([])
    expect(toFeaturedProducts({ items: undefined } as never)).toEqual([])
  })
})
