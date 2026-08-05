/**
 * The Loox card shape (#495).
 *
 * Mesonart's reviews grid renders one card per review that fuses the photo and
 * the text, and every card carries three things our payload did not:
 *
 *   verified   a badge — derived, never stored. reviews.order_item_id is NOT
 *              NULL behind an FK, so every row in the table is a purchase.
 *   itemType   the variant actually bought — "40''H x 30''W / Stretch+Gold
 *              Frame" — read off the order item's snapshot.
 *   product    a chip with title, slug, sku and one thumbnail.
 *
 * All three land on the three whole-review reads:
 *
 *   GET /api/reviews
 *   GET /api/products/:productId/reviews
 *   GET /api/reviews/:reviewId
 *
 * The flat media feed is deliberately not covered — it returns tiles, not
 * cards.
 *
 * Harness note: the database is mocked, same as tests/routes/review-feed.ts,
 * because reviews.order_item_id is NOT NULL behind an FK and a real review
 * needs a whole order chain to seed. The mock records the drizzle fragments
 * each handler builds, which is how the N+1 guard below reads the JOIN itself
 * rather than trusting a call count alone.
 *
 * @see packages/api/src/routes/reviews.ts
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
const REVIEW_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

/** What the joined `products` row looks like coming out of the database. */
const productColumns = {
  id: PRODUCT_ID,
  title: 'Kyoto Rain',
  slug: 'kyoto-rain',
  sku: 'POST-KYOTO-RAIN',
  images: [
    { id: 'i2', url: 'https://cdn/detail.webp', type: 'detail', sortOrder: 1 },
    { id: 'i1', url: 'https://cdn/main.webp', type: 'main', sortOrder: 0 },
  ],
}

/** The chip every read is expected to hand back for that row. */
const productChip = {
  id: PRODUCT_ID,
  title: 'Kyoto Rain',
  slug: 'kyoto-rain',
  sku: 'POST-KYOTO-RAIN',
  // the `main` image, not images[0] — the array is deliberately out of order
  imageUrl: 'https://cdn/main.webp',
}

/** The order item snapshot the review's purchase was written against. */
const framedSnapshot = {
  title: 'Kyoto Rain',
  sku: 'POST-KYOTO-RAIN-40x30',
  sizeLabel: "40''H x 30''W",
  widthInches: 30,
  heightInches: 40,
  frameName: 'Stretch+Gold Frame',
  frameType: 'stretch',
  imageUrl: 'https://cdn/snapshot.webp',
}

/** Frameless is a real purchase, not a missing value. */
const framelessSnapshot = {
  title: 'Kyoto Rain',
  sku: 'POST-KYOTO-RAIN-24x18',
  sizeLabel: "24''H x 18''W",
  widthInches: 18,
  heightInches: 24,
  imageUrl: 'https://cdn/snapshot.webp',
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
    itemSnapshot: framedSnapshot,
    ...overrides,
  }
}

function singleReviewRow(overrides: Record<string, unknown> = {}) {
  return reviewRow(REVIEW_A, {
    userId: 'u1',
    status: 'approved',
    ...overrides,
  })
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

/** Every join a recorded select made, rendered down to SQL. */
function joinSql(select: RecordedSelect): string[] {
  return select.ops
    .filter((op) => op.method === 'leftJoin' || op.method === 'innerJoin')
    .map((op) => render(op.args[1]).sql)
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
// GET /api/reviews — the site-wide grid
// ============================================================================

describe('GET /api/reviews card shape', () => {
  it('marks every review as a verified purchase', async () => {
    // Derived from the schema, not read off the row: the fixture has no
    // `verified` key, and reviews.order_item_id is NOT NULL, so there is no
    // such thing as an unverified review here.
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [])

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items[0].verified).toBe(true)
  })

  it('carries the exact variant purchased as itemType', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [])

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items[0].itemType).toEqual({
      sizeLabel: "40''H x 30''W",
      frameName: 'Stretch+Gold Frame',
      frameType: 'stretch',
    })
  })

  it('keeps the size and leaves the frame null on a frameless purchase', async () => {
    queueSelects(
      [{ count: 1 }],
      [reviewRow(REVIEW_A, { itemSnapshot: framelessSnapshot })],
      []
    )

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items[0].itemType).toEqual({
      sizeLabel: "24''H x 18''W",
      frameName: null,
      frameType: null,
    })
  })

  it('returns itemType null rather than a half-built object with no snapshot', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A, { itemSnapshot: null })], [])

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items[0].itemType).toBeNull()
  })

  it('carries a product chip with sku and one thumbnail', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [])

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items[0].product).toEqual(productChip)
    // the whole image array is not the caller's business
    expect(body.items[0].product.images).toBeUndefined()
  })

  it('joins the order item rather than querying one per review', async () => {
    const rows = [REVIEW_A, REVIEW_B, REVIEW_C].map((id) => reviewRow(id))
    queueSelects([{ count: 3 }], rows, [])

    await app.request('/api/reviews')

    // count + list + one media lookup, whatever the page size. A per-review
    // order item read would make it six.
    expect(selectMock).toHaveBeenCalledTimes(3)
    expect(joinSql(selects[1]!).join(' ')).toContain('order_item_id')
  })

  it('still embeds media, and still only ready media', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [mediaRow(REVIEW_A)])

    const body = await (await app.request('/api/reviews')).json()

    expect(body.items[0].media).toHaveLength(1)
    const mediaWhere = render(argsFor(selects[2]!, 'where')?.[0])
    expect(mediaWhere.params).toContain('ready')
    expect(mediaWhere.params).not.toContain('processing')
  })

  it('caches under a bumped key so warm nodes cannot serve chipless cards', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [])

    await app.request('/api/reviews')

    const key = setCachedMock.mock.calls[0]?.[0] as string
    expect(key).toContain('all:v2:')
    expect(key).not.toContain('all:v1:')
  })
})

// ============================================================================
// GET /api/products/:productId/reviews — the PDP grid
// ============================================================================

describe('GET /api/products/:productId/reviews card shape', () => {
  /** product lookup, count, list, media. */
  function queueProductRead(rows: unknown[], media: unknown[] = []) {
    queueSelects([productColumns], [{ count: rows.length }], rows, media)
  }

  it('carries verified, itemType and the product chip on each item', async () => {
    queueProductRead([reviewRow(REVIEW_A)])

    const res = await app.request(`/api/products/${PRODUCT_ID}/reviews`)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.items[0].verified).toBe(true)
    expect(body.items[0].itemType).toEqual({
      sizeLabel: "40''H x 30''W",
      frameName: 'Stretch+Gold Frame',
      frameType: 'stretch',
    })
    expect(body.items[0].product).toEqual(productChip)
  })

  it('still 404s when the product does not exist', async () => {
    queueSelects([])

    const res = await app.request(`/api/products/${PRODUCT_ID}/reviews`)

    expect(res.status).toBe(404)
  })

  it('joins the order item rather than querying one per review', async () => {
    queueProductRead([REVIEW_A, REVIEW_B, REVIEW_C].map((id) => reviewRow(id)))

    await app.request(`/api/products/${PRODUCT_ID}/reviews`)

    // product + count + list + media. Three more would be an N+1.
    expect(selectMock).toHaveBeenCalledTimes(4)
    expect(joinSql(selects[2]!).join(' ')).toContain('order_item_id')
  })

  it('still embeds ready media', async () => {
    queueProductRead([reviewRow(REVIEW_A)], [mediaRow(REVIEW_A)])

    const body = await (
      await app.request(`/api/products/${PRODUCT_ID}/reviews`)
    ).json()

    expect(body.items[0].media[0].thumbnailUrl).toBe('https://cdn/photo-thumb.webp')
    expect(render(argsFor(selects[3]!, 'where')?.[0]).params).toContain('ready')
  })

  it('caches under a bumped key so warm nodes cannot serve chipless cards', async () => {
    queueProductRead([reviewRow(REVIEW_A)])

    await app.request(`/api/products/${PRODUCT_ID}/reviews`)

    const key = setCachedMock.mock.calls[0]?.[0] as string
    expect(key).toContain('product:v3:')
    expect(key).not.toContain('product:v2:')
  })
})

// ============================================================================
// GET /api/reviews/:reviewId — one card on its own
// ============================================================================

describe('GET /api/reviews/:reviewId card shape', () => {
  it('carries verified, itemType and the product chip', async () => {
    queueSelects([singleReviewRow()], [])

    const res = await app.request(`/api/reviews/${REVIEW_A}`)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.review.verified).toBe(true)
    expect(body.review.itemType).toEqual({
      sizeLabel: "40''H x 30''W",
      frameName: 'Stretch+Gold Frame',
      frameType: 'stretch',
    })
    expect(body.review.product).toEqual(productChip)
  })

  it('reads the whole card in one query', async () => {
    queueSelects([singleReviewRow()], [])

    await app.request(`/api/reviews/${REVIEW_A}`)

    // the review (joined) + its media. Nothing per-field.
    expect(selectMock).toHaveBeenCalledTimes(2)
    expect(joinSql(selects[0]!).join(' ')).toContain('order_item_id')
  })

  it('still embeds ready media', async () => {
    queueSelects([singleReviewRow()], [mediaRow(REVIEW_A)])

    const body = await (await app.request(`/api/reviews/${REVIEW_A}`)).json()

    expect(body.review.media).toHaveLength(1)
    expect(render(argsFor(selects[1]!, 'where')?.[0]).params).toContain('ready')
  })

  it('still hides a pending review from everyone but its author', async () => {
    // the widened select must not widen visibility with it
    queueSelects([singleReviewRow({ status: 'pending' })])

    const res = await app.request(`/api/reviews/${REVIEW_A}`)

    expect(res.status).toBe(404)
  })
})
