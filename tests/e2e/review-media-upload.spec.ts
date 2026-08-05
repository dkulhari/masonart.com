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
 * review grid keeps its media cards) and `afterAll` puts it back, moderated to
 * whatever status it had. Net effect on the database across a run: nothing.
 *
 * The one rule that makes that safe: teardown deletes the id it captured off
 * the create response and NOTHING ELSE. An order item's `review` is resolved
 * by (productId, userId), and this customer owns two order items for the same
 * poster — so "delete whatever is on the item now" hands back a different
 * seeded review than the one setup cleared. That mistake cost the seed a
 * review and three media rows once; it is why `createdReviewId` exists.
 *
 * ## It was fixme'd until #493
 *
 * `/account/orders/$id` never rendered — `orders.tsx` was a leaf page that
 * file-based routing had made the PARENT of `orders.$id.tsx`, and it had no
 * `<Outlet />`, so every child URL rendered the order LIST instead. That route
 * is the only mount point of ReviewModal, so this flow had no reachable entry
 * point in the app. Nothing was ever weakened to accommodate that; the spec is
 * the acceptance test for #493, and the routing guard below is the assertion
 * that keeps it honest.
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

/**
 * Serial, and not for ordering — for the hooks.
 *
 * The config is `fullyParallel`, so with more than one test in this file
 * Playwright hands them to different workers, and `beforeAll`/`afterAll` run
 * once PER WORKER. Two workers means two setups clearing the same seeded
 * review and two teardowns re-creating it, which leaves the customer holding
 * two reviews for one product. The next run's setup then frees only the one
 * the order API reports and the "Write Review" button never appears — the seed
 * quietly rots, one duplicate per run.
 *
 * Serial pins every test here to one worker, so the setup/teardown pair that
 * borrows a seeded review runs exactly once.
 */
test.describe.configure({ mode: 'serial' })

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

    /**
     * Nothing free. Clear one — but only one that clearing actually frees.
     *
     * The seed writes a review per delivered ORDER ITEM while the order API
     * resolves an item's review by (productId, userId), so a poster this
     * customer bought twice carries TWO reviews behind a single reported id.
     * Deleting that id just promotes its twin: the item still shows "Edit
     * Review" and there is no form to open. A review reported against exactly
     * one candidate is the one with no twin behind it.
     *
     * Among those, still prefer no photos, so the review grid the
     * read-surfaces spec looks at keeps its media cards — and so teardown,
     * which can restore a review's text but not its uploads, has nothing to
     * lose.
     */
    const timesReported = new Map<string, number>()
    for (const candidate of candidates) {
      const id = candidate.reviewId!
      timesReported.set(id, (timesReported.get(id) ?? 0) + 1)
    }
    const borrowable = candidates.filter(
      (candidate) => timesReported.get(candidate.reviewId!) === 1
    )
    expect(
      borrowable.length,
      'every delivered item shares its product with another, so no review can ' +
        'be borrowed without a duplicate taking its place'
    ).toBeGreaterThan(0)

    let fallback: (typeof candidates)[number] | null = null

    for (const candidate of borrowable) {
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

  /**
   * The #493 guard. The upload test below would also fail if the route
   * regressed, but it would fail on a missing "Write Review" button and read
   * like a review bug. This one names the actual failure: the LIST rendered
   * where the DETAIL should have.
   *
   * The `?page=1` check is the sharpest tell there is — that param is the list
   * route's own `validateSearch` defaulting, so its presence on a detail URL
   * means the list route is what matched.
   */
  test('renders the order detail page, not the order history list', async ({
    page,
  }) => {
    // Detail and list carry different titles — this alone separates them.
    await expect(page).toHaveTitle('Order Details | chobii.art')

    // The list route's search defaulting must not have run on this URL.
    expect(page.url()).not.toContain('page=1')
    expect(page.url()).toContain(`/account/orders/${target!.orderId}`)

    // Detail content is present — the detail h1 is `Order <orderNumber>`...
    await expect(
      page.getByRole('heading', { level: 1, name: /^Order \S+$/ })
    ).toBeVisible()
    // ...and the list's own h1 is not.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Order History' })
    ).toHaveCount(0)

    // The mount point #493 made unreachable.
    await expect(
      page.getByRole('button', { name: 'Write Review' }).first()
    ).toBeVisible()
  })

  test('carries the photo through and says it publishes after approval', async ({
    page,
  }) => {
    // The default 30s covers a page load and a form fill, not those plus a
    // presign, a PUT at object storage and the complete call — this test was
    // timing out mid-upload on a loaded machine while the flow itself was
    // working. Nothing below is relaxed; only the clock.
    test.slow()

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
