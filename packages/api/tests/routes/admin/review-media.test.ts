/**
 * Review media in the admin moderation queue (#483).
 *
 * There is deliberately no second queue for media: an admin moderates a photo
 * or a video by moderating the review that carries it. That only works if the
 * moderation payload actually shows them what they are approving, which is
 * what the two read assertions below are about.
 *
 *   GET    /api/admin/reviews                            media[] on every item
 *   GET    /api/admin/reviews/:reviewId                  media[] on the detail
 *   DELETE /api/admin/reviews/:reviewId/media/:mediaId   strip one bad file
 *
 * The behavioural difference from the public reads is the point of this file:
 * admins see media at EVERY processingStatus, `processing` and `failed`
 * included, with the processingError attached. A stuck transcode has to be
 * visible in the queue rather than silently absent from it.
 *
 * The database, R2 and redis are mocked. Real rows are not an option here —
 * reviews.order_item_id is NOT NULL behind an FK, so one review needs a whole
 * order chain — and a mocked db would happily return a plausible payload from
 * a handler that had quietly re-added the public `ready` filter. So the tests
 * that matter read the WHERE clause the handler built, not just its output.
 *
 * Better Auth's getSession is mocked so each test picks the caller's role, but
 * requireAuth/requireAdmin themselves are the real middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import '../../setup'

const {
  selectMock,
  deleteMock,
  updateMock,
  deleteCachedMock,
  deletePatternMock,
  deleteFileMock,
  getSessionMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  deleteMock: vi.fn(),
  updateMock: vi.fn(),
  deleteCachedMock: vi.fn(),
  deletePatternMock: vi.fn(),
  deleteFileMock: vi.fn(),
  getSessionMock: vi.fn(),
}))

vi.mock('../../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}))

vi.mock('../../../src/lib/redis', () => ({
  deleteCached: deleteCachedMock,
  deleteCachedPattern: deletePatternMock,
  CacheKeys: { PRODUCT: 'products:' },
}))

vi.mock('../../../src/lib/storage', () => ({
  deleteFile: deleteFileMock,
}))

vi.mock('../../../src/auth', () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => getSessionMock(...args) },
  },
}))

import { adminReviewsApp } from '../../../src/routes/admin/reviews'
import { reviewMedia } from '../../../src/database/schema/review-media'
import { reviews } from '../../../src/database/schema/reviews'
import { readJson } from '../../helpers/json'

const app = new Hono()
app.route('/api/admin/reviews', adminReviewsApp)
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse()
  return c.json({ error: err.message }, 500)
})

// ============================================================================
// Fixtures
// ============================================================================

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111'
const REVIEW_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const REVIEW_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MEDIA_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const CDN = 'https://cdn.chobii.art'

/** Signed-in caller with the given role, in Better Auth's session shape. */
function sessionFor(role: string) {
  const now = new Date()
  return {
    user: {
      id: 'admin-user',
      name: 'Moderator',
      email: 'mod@chobii.art',
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role,
      status: 'active',
    },
    session: {
      id: 'admin-session',
      token: 'admin-token',
      userId: 'admin-user',
      expiresAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    },
  }
}

function reviewRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    productId: PRODUCT_ID,
    userId: 'u1',
    rating: 5,
    title: 'Beautiful print',
    content: 'The colours are exactly as shown.',
    status: 'pending',
    moderatorId: null,
    moderatorNotes: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    author: { id: 'u1', name: 'Asha', email: 'asha@example.com' },
    ...overrides,
  }
}

function mediaRow(reviewId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `m-${reviewId}`,
    reviewId,
    mediaType: 'image',
    url: `${CDN}/reviews/${reviewId}/media/photo.webp`,
    thumbnailUrl: `${CDN}/reviews/${reviewId}/media/photo-thumb.webp`,
    posterUrl: null,
    durationSeconds: null,
    width: 1200,
    height: 1200,
    sizeBytes: 240_000,
    sortOrder: 0,
    processingStatus: 'ready',
    processingError: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  }
}

const productRow = { id: PRODUCT_ID, title: 'Kyoto Rain', slug: 'kyoto-rain' }

// ============================================================================
// Mocked drizzle — records the fragments each handler builds
// ============================================================================

const dialect = new PgDialect()

interface RecordedCall {
  fields: unknown
  ops: Array<{ method: string; args: unknown[] }>
}

let selects: RecordedCall[] = []
let deletes: RecordedCall[] = []

/** Render a recorded drizzle fragment down to `{ sql, params }`. */
function render(fragment: unknown): { sql: string; params: unknown[] } {
  const { sql, params } = dialect.sqlToQuery(fragment as SQL)
  return { sql, params: params as unknown[] }
}

/** The arguments a recorded call passed to `method`, or undefined. */
function argsFor(call: RecordedCall, method: string): unknown[] | undefined {
  return call.ops.find((op) => op.method === method)?.args
}

const CHAIN_METHODS = [
  'from',
  'where',
  'groupBy',
  'orderBy',
  'limit',
  'offset',
  'leftJoin',
  'innerJoin',
  'returning',
  'set',
]

function buildChain(record: RecordedCall, rows: unknown[]) {
  const chain: Record<string, unknown> = {}
  for (const method of CHAIN_METHODS) {
    chain[method] = (...args: unknown[]) => {
      record.ops.push({ method, args })
      return chain
    }
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows)
  return chain
}

/** Queue one result array per `db.select()` call, in call order. */
function queueSelects(...results: unknown[][]) {
  let call = 0
  selectMock.mockImplementation((fields: unknown) => {
    const rows = results[call++] ?? []
    const record: RecordedCall = { fields, ops: [] }
    selects.push(record)
    return buildChain(record, rows)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  selects = []
  deletes = []
  getSessionMock.mockResolvedValue(sessionFor('admin'))
  deleteCachedMock.mockResolvedValue(undefined)
  deletePatternMock.mockResolvedValue(undefined)
  deleteFileMock.mockResolvedValue(undefined)
  deleteMock.mockImplementation((table: unknown) => {
    const record: RecordedCall = { fields: table, ops: [] }
    deletes.push(record)
    return buildChain(record, [])
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ============================================================================
// GET /api/admin/reviews — the moderation list
// ============================================================================

describe('GET /api/admin/reviews', () => {
  it('embeds media on every item in the queue', async () => {
    queueSelects(
      [{ count: 2 }],
      [reviewRow(REVIEW_A), reviewRow(REVIEW_B)],
      [productRow],
      [mediaRow(REVIEW_A), mediaRow(REVIEW_B, { mediaType: 'video' })]
    )

    const res = await app.request('/api/admin/reviews')
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.items).toHaveLength(2)
    expect(body.items[0].media).toHaveLength(1)
    expect(body.items[0].media[0].url).toContain('photo.webp')
    expect(body.items[1].media[0].mediaType).toBe('video')
  })

  it('shows media at every processing status, not only ready', async () => {
    queueSelects(
      [{ count: 1 }],
      [reviewRow(REVIEW_A)],
      [productRow],
      [
        mediaRow(REVIEW_A, { id: 'm-ok' }),
        mediaRow(REVIEW_A, {
          id: 'm-busy',
          sortOrder: 1,
          processingStatus: 'processing',
        }),
        mediaRow(REVIEW_A, {
          id: 'm-bad',
          sortOrder: 2,
          processingStatus: 'failed',
          processingError: 'ffmpeg exited 1',
        }),
      ]
    )

    const body = await readJson(await app.request('/api/admin/reviews'))
    const media = body.items[0].media

    expect(media).toHaveLength(3)
    expect(media.map((m: { processingStatus: string }) => m.processingStatus)).toEqual([
      'ready',
      'processing',
      'failed',
    ])
    expect(media[2].processingError).toBe('ffmpeg exited 1')
  })

  it('does not filter the media query by processingStatus', async () => {
    // The public reads pin this to `ready`. Copying that filter here is the
    // regression this test exists to catch: a stuck transcode would vanish
    // from the only screen that could notice it.
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [productRow], [])

    await app.request('/api/admin/reviews')

    const mediaWhere = render(argsFor(selects[3]!, 'where')?.[0])
    expect(mediaWhere.params).toContain(REVIEW_A)
    expect(mediaWhere.params).not.toContain('ready')
    expect(mediaWhere.sql).not.toContain('processing_status')
  })

  it('gives a review with no media an empty array, not undefined', async () => {
    queueSelects([{ count: 1 }], [reviewRow(REVIEW_A)], [productRow], [])

    const body = await readJson(await app.request('/api/admin/reviews'))

    expect(body.items[0].media).toEqual([])
  })

  it('fetches media for the whole page in one query, not one per review', async () => {
    const rows = [REVIEW_A, REVIEW_B, 'cccccccc-cccc-cccc-cccc-cccccccccccc'].map(
      (id) => reviewRow(id)
    )
    queueSelects([{ count: 3 }], rows, [productRow], [])

    await app.request('/api/admin/reviews')

    // count + list + products + one media lookup. Anything more is an N+1.
    expect(selectMock).toHaveBeenCalledTimes(4)
    const mediaWhere = render(argsFor(selects[3]!, 'where')?.[0])
    expect(mediaWhere.params).toEqual(expect.arrayContaining(rows.map((r) => r.id)))
  })

  it('skips the media query entirely when the queue is empty', async () => {
    queueSelects([{ count: 0 }], [])

    const body = await readJson(await app.request('/api/admin/reviews'))

    expect(body.items).toEqual([])
    expect(selectMock).toHaveBeenCalledTimes(2)
  })
})

// ============================================================================
// GET /api/admin/reviews/:reviewId — the moderation detail
// ============================================================================

describe('GET /api/admin/reviews/:reviewId', () => {
  it('embeds media on the detail payload, failures included', async () => {
    queueSelects(
      [reviewRow(REVIEW_A)],
      [productRow],
      [
        mediaRow(REVIEW_A, {
          mediaType: 'video',
          posterUrl: `${CDN}/reviews/${REVIEW_A}/media/poster.jpg`,
          durationSeconds: 12,
          processingStatus: 'failed',
          processingError: 'transcode timed out',
        }),
      ]
    )

    const res = await app.request(`/api/admin/reviews/${REVIEW_A}`)
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.media).toHaveLength(1)
    expect(body.media[0]).toMatchObject({
      mediaType: 'video',
      durationSeconds: 12,
      processingStatus: 'failed',
      processingError: 'transcode timed out',
    })
  })

  it('returns an empty media array for a review with no attachments', async () => {
    queueSelects([reviewRow(REVIEW_A)], [productRow], [])

    const body = await readJson(await app.request(`/api/admin/reviews/${REVIEW_A}`))

    expect(body.media).toEqual([])
  })
})

// ============================================================================
// DELETE /api/admin/reviews/:reviewId/media/:mediaId
// ============================================================================

describe('DELETE /api/admin/reviews/:reviewId/media/:mediaId', () => {
  /**
   * The lookup joins reviews for the parent productId, so the row the handler
   * sees carries it alongside the media columns.
   */
  function queueOneMedia(overrides: Record<string, unknown> = {}) {
    queueSelects([
      {
        ...mediaRow(REVIEW_A, { id: MEDIA_ID }),
        productId: PRODUCT_ID,
        ...overrides,
      },
    ])
  }

  it('deletes the media row and reports the id back', async () => {
    queueOneMedia()

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )
    const body = await readJson(res)

    expect(res.status).toBe(200)
    expect(body.mediaId).toBe(MEDIA_ID)
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(deleteMock.mock.calls[0]![0]).toBe(reviewMedia)
  })

  it('removes the R2 objects behind the rendition, thumbnail and poster', async () => {
    queueOneMedia({
      mediaType: 'video',
      url: `${CDN}/reviews/${REVIEW_A}/media/clip.mp4`,
      thumbnailUrl: `${CDN}/reviews/${REVIEW_A}/media/clip-thumb.webp`,
      posterUrl: `${CDN}/reviews/${REVIEW_A}/media/clip-poster.jpg`,
    })

    await app.request(`/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`, {
      method: 'DELETE',
    })

    const keys = deleteFileMock.mock.calls.map((call) => call[0])
    expect(keys).toEqual(
      expect.arrayContaining([
        `reviews/${REVIEW_A}/media/clip.mp4`,
        `reviews/${REVIEW_A}/media/clip-thumb.webp`,
        `reviews/${REVIEW_A}/media/clip-poster.jpg`,
      ])
    )
  })

  it('never asks R2 to delete a key outside the reviews prefix', async () => {
    // url is stored, not derived, so a bad row must not become a bad delete
    queueOneMedia({
      url: `${CDN}/products/hero.webp`,
      thumbnailUrl: null,
      posterUrl: null,
    })

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(200)
    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(deleteMock).toHaveBeenCalledTimes(1)
  })

  it('still deletes the row when the R2 object is already gone', async () => {
    queueOneMedia()
    deleteFileMock.mockRejectedValue(new Error('NoSuchKey'))

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(200)
    expect(deleteMock).toHaveBeenCalledTimes(1)
  })

  it('leaves the parent review untouched', async () => {
    queueOneMedia()

    await app.request(`/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`, {
      method: 'DELETE',
    })

    expect(updateMock).not.toHaveBeenCalled()
    expect(deleteMock.mock.calls.map((call) => call[0])).not.toContain(reviews)
  })

  it('invalidates the cached review surfaces', async () => {
    queueOneMedia()

    await app.request(`/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`, {
      method: 'DELETE',
    })

    const patterns = deletePatternMock.mock.calls.map((call) => call[0] as string)
    expect(patterns.some((p) => p.includes(PRODUCT_ID))).toBe(true)
    expect(patterns.some((p) => p.includes('media:'))).toBe(true)
  })

  it('returns 404 for an unknown mediaId and touches nothing', async () => {
    queueSelects([])

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(404)
    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('scopes the lookup to the review in the path', async () => {
    queueOneMedia()

    await app.request(`/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`, {
      method: 'DELETE',
    })

    const where = render(argsFor(selects[0]!, 'where')?.[0])
    expect(where.params).toContain(MEDIA_ID)
    expect(where.params).toContain(REVIEW_A)
  })

  it('rejects a malformed mediaId with 400', async () => {
    queueSelects([])

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/not-a-uuid`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(400)
    expect(selectMock).not.toHaveBeenCalled()
  })

  it('rejects a non-admin caller with 403', async () => {
    getSessionMock.mockResolvedValue(sessionFor('customer'))
    queueOneMedia()

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(403)
    expect(deleteMock).not.toHaveBeenCalled()
    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated caller with 401', async () => {
    getSessionMock.mockResolvedValue(null)
    queueOneMedia()

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(401)
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('reports 500 rather than a false success when the delete fails', async () => {
    queueOneMedia()
    deleteMock.mockImplementation(() => {
      throw new Error('connection refused')
    })

    const res = await app.request(
      `/api/admin/reviews/${REVIEW_A}/media/${MEDIA_ID}`,
      { method: 'DELETE' }
    )

    expect(res.status).toBe(500)
  })
})
