/**
 * The read side of review-surfaces-parity (#482).
 *
 * Three things are covered here, and they are all about the same gap: until
 * now reviews could only be read one product at a time, and no read returned
 * the customer photos and videos attached to them.
 *
 *   GET /api/reviews        site-wide list — the /reviews page and the home strip
 *   GET /api/reviews/media  flat media feed — the PDP media wall
 *   media[] embedded on the two pre-existing reads
 *
 * The database is mocked rather than seeded on purpose: reviews.order_item_id
 * is NOT NULL behind an FK, so a real review needs a whole order chain. The
 * mock records the drizzle query fragments each handler builds, which is how
 * the two invisibility rules below are asserted rather than assumed:
 *
 *   - only `approved` reviews are ever public
 *   - only `ready` media is ever public; `processing` and `failed` are not
 *
 * A handler that silently dropped either filter would still return a
 * plausible-looking payload from a mocked db, so those tests read the WHERE
 * clause itself.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import '../setup'

const { selectMock, getCachedMock, setCachedMock, deletePatternMock } = vi.hoisted(
  () => ({
    selectMock: vi.fn(),
    getCachedMock: vi.fn(),
    setCachedMock: vi.fn(),
    deletePatternMock: vi.fn(),
  })
)

vi.mock('../../src/database', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}))

vi.mock('../../src/lib/redis', () => ({
  getCached: getCachedMock,
  setCached: setCachedMock,
  deleteCachedPattern: deletePatternMock,
  CacheKeys: { PRODUCT: 'products:' },
}))

vi.mock('../../src/middleware/auth', () => ({
  optionalAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  requireAuth: async (_c: unknown, next: () => Promise<void>) => next(),
  canAccess: () => true,
}))

import { reviewsApp, productReviewsApp } from '../../src/routes/reviews'

const app = new Hono()
app.route('/api/products/:productId/reviews', productReviewsApp)
app.route('/api/reviews', reviewsApp)

// ============================================================================
// Fixtures
// ============================================================================

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'
const REVIEW_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const REVIEW_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const productColumns = {
  id: PRODUCT_ID,
  title: 'Kyoto Rain',
  slug: 'kyoto-rain',
  images: [
    { id: 'i2', url: 'https://cdn/detail.webp', type: 'detail', sortOrder: 1 },
    { id: 'i1', url: 'https://cdn/main.webp', type: 'main', sortOrder: 0 },
  ],
}

function reviewRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    rating: 5,
    title: 'Beautiful print',
    content: 'The colours are exactly as shown.',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    author: { id: 'u1', name: 'Asha' },
    product: productColumns,
    productId: PRODUCT_ID,
    ...overrides,
  }
}

function mediaRow(reviewId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `m-${reviewId}`,
    reviewId,
    mediaType: 'image',
    url: 'https://cdn/photo.webp',
    thumbnailUrl: 'https://cdn/photo-thumb.webp',
    posterUrl: null,
    durationSeconds: null,
    width: 1200,
    height: 1200,
    sortOrder: 0,
    ...overrides,
  }
}

// ============================================================================
// Mocked db.select — records the fragments each handler builds
// ============================================================================

const dialect = new PgDialect()

interface RecordedSelect {
  fields: unknown
  ops: Array<{ method: string; args: unknown[] }>
}

let selects: RecordedSelect[] = []

/** Render a recorded drizzle fragment down to `{ sql, params }`. */
function render(fragment: unknown): { sql: string; params: unknown[] } {
  const { sql, params } = dialect.sqlToQuery(fragment as SQL)
  return { sql, params: params as unknown[] }
}

/** The arguments a recorded select passed to `method`, or undefined. */
function argsFor(select: RecordedSelect, method: string): unknown[] | undefined {
  return select.ops.find((op) => op.method === method)?.args
}

/** Queue one result array per `db.select()` call, in call order. */
function queueSelects(...results: unknown[][]) {
  let call = 0
  selectMock.mockImplementation((fields: unknown) => {
    const rows = results[call++] ?? []
    const record: RecordedSelect = { fields, ops: [] }
    selects.push(record)

    const chain: Record<string, unknown> = {}
    for (const method of [
      'from',
      'where',
      'groupBy',
      'orderBy',
      'limit',
      'offset',
      'leftJoin',
      'innerJoin',
    ]) {
      chain[method] = (...args: unknown[]) => {
        record.ops.push({ method, args })
        return chain
      }
    }
    chain.then = (resolve: (v: unknown) => void) => resolve(rows)
    return chain
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  selects = []
  getCachedMock.mockResolvedValue(null)
  setCachedMock.mockResolvedValue(undefined)
  deletePatternMock.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ============================================================================
// GET /api/reviews — the site-wide list
// ============================================================================

describe('GET /api/reviews', () => {
  it('returns approved reviews with their product and their media', async () => {
    queueSelects(
      [{ count: 2 }],
      [reviewRow(REVIEW_A), reviewRow(REVIEW_B)],
      [mediaRow(REVIEW_A), mediaRow(REVIEW_B, { mediaType: 'video' })]
    )

    const res = await app.request('/api/reviews')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(2)
    expect(body.items[0].product).toEqual({
      id: PRODUCT_ID,
      title: 'Kyoto Rain',
      slug: 'kyoto-rain',
      // the `main` image, not images[0] — the array is deliberately out of order
      imageUrl: 'https://cdn/main.webp',
    })
    expect(body.items[0].media).toHaveLength(1)
    expect(body.items[0].media[0].url).toBe('https://cdn/photo.webp')
    expect(body.items[1].media[0].mediaType).toBe('video')
  })

  it('asks the database only for approved reviews', async () => {
    // pending and rejected reviews are moderation state, not content
    queueSelects([{ count: 0 }], [])

    await app.request('/api/reviews')

    const listWhere = argsFor(selects[1]!, 'where')?.[0]
    expect(render(listWhere).params).toContain('approved')
  })

  it('honours page and pageSize and reports the approved total', async () => {
    queueSelects([{ count: 42 }], [reviewRow(REVIEW_A)], [])

    const res = await app.request('/api/reviews?page=2&pageSize=5')
    const body = await res.json()

    expect(argsFor(selects[1]!, 'limit')).toEqual([5])
    expect(argsFor(selects[1]!, 'offset')).toEqual([5])
    expect(body.total).toBe(42)
    expect(body.page).toBe(2)
    expect(body.pageSize).toBe(5)
    expect(body.totalPages).toBe(9)
    expect(body.hasNextPage).toBe(true)
    expect(body.hasPreviousPage).toBe(true)
  })

  it('orders newest first', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [])

    await app.request('/api/reviews')

    const order = render(argsFor(selects[1]!, 'orderBy')?.[0]).sql
    expect(order).toContain('created_at')
    expect(order.toLowerCase()).toContain('desc')
  })

  it('never returns media that is still processing or failed', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [mediaRow(REVIEW_A)])

    await app.request('/api/reviews')

    const mediaWhere = render(argsFor(selects[2]!, 'where')?.[0])
    expect(mediaWhere.params).toContain('ready')
    expect(mediaWhere.params).not.toContain('processing')
    expect(mediaWhere.params).not.toContain('failed')
  })

  it('fetches media for the whole page in one query, not one per review', async () => {
    const rows = [REVIEW_A, REVIEW_B, 'cccccccc-cccc-cccc-cccc-cccccccccccc'].map(
      (id) => reviewRow(id)
    )
    queueSelects([{ count: 3 }], rows, [])

    await app.request('/api/reviews')

    // count + list + one media lookup. Anything more is an N+1.
    expect(selectMock).toHaveBeenCalledTimes(3)
    const mediaWhere = render(argsFor(selects[2]!, 'where')?.[0])
    expect(mediaWhere.params).toEqual(expect.arrayContaining(rows.map((r) => r.id)))
  })

  it('skips the media query entirely when the page is empty', async () => {
    queueSelects([{ count: 0 }], [])

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items).toEqual([])
    expect(selectMock).toHaveBeenCalledTimes(2)
  })

  it('caches the payload under a versioned site-wide key', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [])

    await app.request('/api/reviews')

    const key = setCachedMock.mock.calls[0]?.[0] as string
    expect(key).toContain('all:v1:')
  })

  it('reports 500 rather than an empty list when the query fails', async () => {
    selectMock.mockImplementation(() => {
      throw new Error('connection refused')
    })

    const res = await app.request('/api/reviews')

    expect(res.status).toBe(500)
  })
})

// ============================================================================
// GET /api/reviews/media — the flat media feed
// ============================================================================

describe('GET /api/reviews/media', () => {
  it('is matched as a literal segment, not as a review id', async () => {
    // /:reviewId would reject "media" as a malformed uuid with a 400
    queueSelects([])

    const res = await app.request('/api/reviews/media')

    expect(res.status).toBe(200)
  })

  it('returns ready media carrying its reviewId, rating and productId', async () => {
    queueSelects([
      { ...mediaRow(REVIEW_A), productId: PRODUCT_ID, rating: 5 },
      {
        ...mediaRow(REVIEW_B, { mediaType: 'video', posterUrl: 'https://cdn/p.jpg' }),
        productId: PRODUCT_ID,
        rating: 4,
      },
    ])

    const body = await (await app.request('/api/reviews/media')).json()

    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({
      reviewId: REVIEW_A,
      productId: PRODUCT_ID,
      rating: 5,
      mediaType: 'image',
    })
    expect(body.items[1].posterUrl).toBe('https://cdn/p.jpg')
  })

  it('restricts the feed to ready media on approved reviews', async () => {
    queueSelects([])

    await app.request('/api/reviews/media')

    const where = render(argsFor(selects[0]!, 'where')?.[0])
    expect(where.params).toContain('ready')
    expect(where.params).toContain('approved')
  })

  it('filters by productId when one is given', async () => {
    queueSelects([])

    const res = await app.request(`/api/reviews/media?productId=${PRODUCT_ID}`)

    expect(res.status).toBe(200)
    expect(render(argsFor(selects[0]!, 'where')?.[0]).params).toContain(PRODUCT_ID)
  })

  it('rejects a malformed productId with 400', async () => {
    queueSelects([])

    const res = await app.request('/api/reviews/media?productId=not-a-uuid')

    expect(res.status).toBe(400)
  })

  it('caches the feed per product', async () => {
    queueSelects([])

    await app.request(`/api/reviews/media?productId=${PRODUCT_ID}`)

    const key = setCachedMock.mock.calls[0]?.[0] as string
    expect(key).toContain('media:v1:')
    expect(key).toContain(PRODUCT_ID)
  })

  it('reports 500 rather than an empty wall when the query fails', async () => {
    selectMock.mockImplementation(() => {
      throw new Error('connection refused')
    })

    const res = await app.request('/api/reviews/media')

    expect(res.status).toBe(500)
  })
})

// ============================================================================
// Media on the pre-existing reads
// ============================================================================

describe('GET /api/products/:productId/reviews', () => {
  it('embeds media on each item', async () => {
    queueSelects(
      [{ id: PRODUCT_ID }],
      [{ count: 1 }],
      [reviewRow(REVIEW_A)],
      [mediaRow(REVIEW_A)]
    )

    const res = await app.request(`/api/products/${PRODUCT_ID}/reviews`)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items[0].media).toHaveLength(1)
    expect(body.items[0].media[0].thumbnailUrl).toBe('https://cdn/photo-thumb.webp')
  })

  it('caches under a bumped key so warm nodes cannot serve media-less payloads', async () => {
    queueSelects([{ id: PRODUCT_ID }], [{ count: 1 }], [reviewRow(REVIEW_A)], [])

    await app.request(`/api/products/${PRODUCT_ID}/reviews`)

    const key = setCachedMock.mock.calls[0]?.[0] as string
    expect(key).toContain('product:v2:')
  })

  it('still restricts media to ready', async () => {
    queueSelects(
      [{ id: PRODUCT_ID }],
      [{ count: 1 }],
      [reviewRow(REVIEW_A)],
      [mediaRow(REVIEW_A)]
    )

    await app.request(`/api/products/${PRODUCT_ID}/reviews`)

    expect(render(argsFor(selects[3]!, 'where')?.[0]).params).toContain('ready')
  })
})

describe('GET /api/reviews/:reviewId', () => {
  it('includes media on the single review read', async () => {
    queueSelects(
      [{ ...reviewRow(REVIEW_A), status: 'approved', userId: 'u1' }],
      [mediaRow(REVIEW_A)]
    )

    const res = await app.request(`/api/reviews/${REVIEW_A}`)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.review.media).toHaveLength(1)
    expect(body.review.media[0].reviewId).toBe(REVIEW_A)
  })

  it('does not fetch media for a review the caller may not see', async () => {
    queueSelects([{ ...reviewRow(REVIEW_A), status: 'pending', userId: 'u1' }])

    const res = await app.request(`/api/reviews/${REVIEW_A}`)

    expect(res.status).toBe(404)
    expect(selectMock).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// Route registration order — the trap this file must keep shut
// ============================================================================

describe('review route registration order', () => {
  it('still resolves /api/reviews/stats as the catalogue aggregate', async () => {
    queueSelects([{ averageRating: '4.8', reviewCount: 312 }])

    const res = await app.request('/api/reviews/stats')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ averageRating: 4.8, reviewCount: 312 })
  })
})
