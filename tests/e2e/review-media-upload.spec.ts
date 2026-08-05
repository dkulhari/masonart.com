/**
 * Review submission carrying a photo — #485.
 *
 * A signed-in customer opens the review form on a delivered order item, writes
 * a review, attaches a PNG and submits. The claim under test is the whole
 * chain: create the review, presign, PUT the bytes at object storage, record
 * the object against the review, and tell the customer what happens next.
 *
 * ## What this spec deliberately does not assert
 *
 * That the review becomes publicly visible. It is created `pending` by design
 * and a spec that waited for it on /reviews would only pass if moderation had
 * been bypassed — baking a hole in the queue into the suite. What is asserted
 * instead is the confirmation copy and, through the API as the review's owner,
 * that the row is `pending` and carries exactly the photo that was attached.
 *
 * Video upload is out of scope on purpose: the transcode is asynchronous and
 * any assertion about it degenerates into a sleep. The queue's unit tests own
 * that.
 *
 * ## Why there is setup and teardown
 *
 * The API allows one review per (product, customer), and the seed has already
 * reviewed every delivered item this customer owns — so there is no "Write
 * Review" button to press until one is freed. `beforeAll` frees the least
 * load-bearing one it can find (preferring a review with no photos, so the PDP
 * media wall is untouched) and `afterAll` puts it back, moderated to whatever
 * status it had. Net effect on the database across a run: nothing.
 *
 * The one rule that makes that safe: teardown deletes the id it captured off
 * the create response and NOTHING ELSE. An order item's `review` is resolved
 * by (productId, userId), and this customer owns two order items for the same
 * poster — so "delete whatever is on the item now" hands back a different
 * seeded review than the one setup cleared. That mistake cost the seed a
 * review and three media rows once; it is why `createdReviewId` exists.
 *
 * ## Why it is currently fixme'd
 *
 * #493. `/account/orders/$id` never renders — `orders.tsx` is a leaf page that
 * file-based routing has made the PARENT of `orders.$id.tsx`, and it has no
 * `<Outlet />`, so every child URL renders the order LIST instead. That route
 * is the only mount point of ReviewModal, so the flow below has no reachable
 * entry point in the app. Nothing here is weakened to accommodate that: the
 * spec is the acceptance test for #493, and removing the `fixme` is what
 * closes it.
 */

import { test, expect, request as apiRequest } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CUSTOMER_AUTH = path.join(__dirname, '..', '.auth', 'customer.json')
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json')

/**
 * The API is a separate origin from the web app — there is no Vite proxy for
 * `/api`, which is why every client helper in the app builds absolute URLs too.
 */
const API_URL = process.env.E2E_API_URL || 'http://localhost:3000'

test.use({ storageState: CUSTOMER_AUTH })

/** A 1x1 red PNG. Images are recorded straight through; nothing decodes it. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const PHOTO_NAME = 'review-photo.png'

interface Target {
  orderId: string
  itemId: string
}

interface RemovedReview {
  rating: number
  title: string | null
  content: string
  status: string
}

let target: Target | null = null
/** The seeded review that had to be cleared to make room, if there was one. */
let removed: RemovedReview | null = null
/**
 * The id this run created, captured off the POST response.
 *
 * Teardown deletes THIS id and nothing else. It must never re-derive "the
 * review on that order item" instead: the order detail API resolves an item's
 * review by (productId, userId), and this customer owns two order items for
 * the same poster — so a re-read hands back a DIFFERENT seeded review than the
 * one setup cleared, and deleting that is how the seed loses rows it never
 * agreed to lend.
 */
let createdReviewId: string | null = null

// ============================================================================
// Setup — find (or free up) a delivered order item with no review on it
// ============================================================================

test.beforeAll(async () => {
  const customer = await apiRequest.newContext({
    baseURL: API_URL,
    storageState: CUSTOMER_AUTH,
  })

  try {
    const ordersResponse = await customer.get('/api/orders')
    expect(
      ordersResponse.ok(),
      'the signed-in customer must be able to list their orders'
    ).toBeTruthy()

    const { items: orders } = await ordersResponse.json()
    const delivered = (orders as Array<{ id: string; status: string }>).filter(
      (order) => order.status === 'delivered'
    )
    expect(
      delivered.length,
      'the seed must give the test customer a delivered order to review'
    ).toBeGreaterThan(0)

    /** Every delivered item, in order, with whatever review sits on it. */
    const candidates: Array<{
      orderId: string
      itemId: string
      reviewId: string | null
    }> = []

    for (const order of delivered) {
      const detailResponse = await customer.get(`/api/orders/${order.id}`)
      if (!detailResponse.ok()) continue
      const detail = await detailResponse.json()
      const orderDetail = detail.order ?? detail

      for (const item of orderDetail.items ?? []) {
        candidates.push({
          orderId: order.id,
          itemId: item.id,
          reviewId: item.review?.id ?? null,
        })
      }
    }

    const free = candidates.find((candidate) => candidate.reviewId === null)
    if (free) {
      target = { orderId: free.orderId, itemId: free.itemId }
      return
    }

    // Nothing free. Clear one — preferring a review with no photos on it, so
    // the media wall the read-surfaces spec looks at keeps its tiles.
    let fallback: (typeof candidates)[number] | null = null

    for (const candidate of candidates) {
      const reviewResponse = await customer.get(
        `/api/reviews/${candidate.reviewId}`
      )
      if (!reviewResponse.ok()) continue
      const { review } = await reviewResponse.json()

      const details: RemovedReview = {
        rating: review.rating,
        title: review.title ?? null,
        content: review.content,
        status: review.status,
      }

      if ((review.media ?? []).length === 0) {
        removed = details
        fallback = candidate
        break
      }
      if (!fallback) {
        removed = details
        fallback = candidate
      }
    }

    expect(
      fallback,
      'no delivered order item could be found or freed for the review form'
    ).not.toBeNull()

    const deleted = await customer.delete(`/api/reviews/${fallback!.reviewId}`)
    expect(deleted.ok(), 'clearing the seeded review must succeed').toBeTruthy()

    target = { orderId: fallback!.orderId, itemId: fallback!.itemId }
  } finally {
    await customer.dispose()
  }
})

// ============================================================================
// Teardown — remove what the spec wrote, restore what it displaced
// ============================================================================

test.afterAll(async () => {
  if (!target) return

  const customer = await apiRequest.newContext({
    baseURL: API_URL,
    storageState: CUSTOMER_AUTH,
  })

  try {
    // Only the id this run created, never "whatever is on the item now".
    // Deleting it cascades to its media rows.
    if (createdReviewId) {
      await customer.delete(`/api/reviews/${createdReviewId}`)
      createdReviewId = null
    }

    if (!removed) return

    const recreated = await customer.post(
      `/api/orders/${target.orderId}/items/${target.itemId}/review`,
      {
        data: {
          rating: removed.rating,
          ...(removed.title ? { title: removed.title } : {}),
          content: removed.content,
        },
      }
    )
    if (!recreated.ok()) return

    const { review } = await recreated.json()
    if (removed.status !== 'approved') return

    // A customer cannot approve their own review, and leaving the seed one
    // approved review short would quietly narrow the >= 10 gate every other
    // review surface depends on.
    const admin = await apiRequest.newContext({
      baseURL: API_URL,
      storageState: ADMIN_AUTH,
    })
    try {
      await admin.patch(`/api/admin/reviews/${review.id}`, {
        data: { status: 'approved' },
      })
    } finally {
      await admin.dispose()
    }
  } finally {
    await customer.dispose()
  }
})

// ============================================================================
// The flow
// ============================================================================

test.describe('submitting a review with a photo', () => {
  /**
   * Blocked by #493 — the order detail route never renders, so there is no
   * "Write Review" button to press. `fixme` rather than a softened assertion:
   * the flow below is what the feature claims to ship, and a spec that passed
   * against a page that cannot be reached would be worse than no spec at all.
   */
  test.fixme(
    true,
    '#493 — /account/orders/$id renders the order list, so the review form is unreachable'
  )

  test.beforeEach(async ({ page }) => {
    expect(target, 'setup must have found a reviewable order item').not.toBeNull()

    // Capture the created id the moment the API hands it back, rather than
    // reading it off the order item afterwards — see `createdReviewId`. This
    // also means a run that dies mid-test still has an id for teardown.
    page.on('response', async (response) => {
      if (
        response.request().method() !== 'POST' ||
        !/\/items\/[^/]+\/review$/.test(new URL(response.url()).pathname) ||
        !response.ok()
      ) {
        return
      }
      const body = await response.json().catch(() => null)
      if (typeof body?.review?.id === 'string') createdReviewId = body.review.id
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/account/orders/${target!.orderId}`, {
      waitUntil: 'networkidle',
    })
  })

  test('carries the photo through and says it publishes after approval', async ({
    page,
  }) => {
    // Port 5173 in this environment serves a different application. Identity
    // first, before anything green means anything.
    await expect(page).toHaveTitle(/chobii\.art/)

    const writeReview = page.getByRole('button', { name: 'Write Review' })
    await expect(writeReview.first()).toBeVisible()
    await writeReview.first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Write a Review')

    await dialog.getByRole('button', { name: 'Rate 5 stars' }).click()
    await dialog.locator('#review-title').fill('Arrived flat and framed square')
    await dialog
      .locator('#review-content')
      .fill(
        'Colours match the listing and the frame corners are tight. Photo attached from the wall it ended up on.'
      )

    await dialog.getByTestId('review-media-input').setInputFiles({
      name: PHOTO_NAME,
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    })

    // Staged locally before submit — the upload is addressed to a review that
    // does not exist yet.
    await expect(
      dialog.getByRole('button', { name: `Remove ${PHOTO_NAME}` })
    ).toBeVisible()

    await dialog.getByRole('button', { name: 'Submit Review' }).click()

    /**
     * The confirmation is read in one shot rather than with three separate
     * `toContainText` assertions: the modal closes itself 1.5s after success,
     * so a second poll can legitimately arrive after the panel has gone. This
     * takes the whole panel's text at the instant it appears.
     */
    const confirmation = await page
      .waitForFunction(
        () => {
          const panel = document.querySelector('[role="dialog"]')
          const text = panel?.textContent ?? ''
          return text.includes('Thank you for your review!') ? text : null
        },
        undefined,
        { timeout: 30_000 }
      )
      .then((handle) => handle.jsonValue() as Promise<string>)

    expect(confirmation).toContain('will be visible after approval')
    // The photo's own promise, which is the half a customer attaching media
    // actually needs to hear.
    expect(confirmation).toContain('publish with your review once')

    // And the row itself, read as its owner: pending, with the photo on it.
    // Public visibility is NOT asserted — it is not supposed to be public.
    expect(createdReviewId, 'the submit must have created a review').toBeTruthy()

    const customer = await apiRequest.newContext({
      baseURL: API_URL,
      storageState: CUSTOMER_AUTH,
    })
    try {
      const reviewResponse = await customer.get(`/api/reviews/${createdReviewId}`)
      expect(reviewResponse.ok()).toBeTruthy()
      const { review } = await reviewResponse.json()

      expect(review.status).toBe('pending')
      expect(review.rating).toBe(5)
      expect(review.media).toHaveLength(1)
      expect(review.media[0].mediaType).toBe('image')
      expect(review.media[0].url).toMatch(/^https?:\/\//)
    } finally {
      await customer.dispose()
    }
  })
})
