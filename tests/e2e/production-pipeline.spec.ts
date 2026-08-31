/**
 * The production pipeline, end to end, across two vendors.
 *
 * Phase 7 of `production-pipeline`, and the only place the whole feature is
 * driven as one thing: an order whose work is split across two suppliers, one
 * of whom consolidates, from `draft` to a parcel handed to a courier.
 *
 * ## What this file is for
 *
 * Every phase below it has unit and integration coverage. What none of them can
 * say is whether the *chain* holds — whether the status the vendor portal writes
 * is the one the admin QC screen reads, whether the transfer vendor A creates is
 * the one vendor B is offered, and whether the readiness predicate that gates a
 * courier label agrees with the eight screens that claim to explain it.
 *
 * ## Why it is serial, and why it is one file
 *
 * `test.describe.configure({ mode: 'serial' })`: every step is the previous
 * step's postcondition. A parallel run would assert QC on a job nobody has
 * submitted.
 *
 * The refusals live here too rather than in a file of their own — #622's
 * precedent from `vendor-management`. Each one is reachable at exactly one
 * moment in the chain (an incomplete shot list only exists *before* the upload;
 * the despatch guard only bites while the goods have not moved), and a separate
 * file would have to rebuild the whole chain to reach it. Reaching a refusal by
 * re-driving nine steps is how a refusal test comes to assert a fixture rather
 * than a rule.
 *
 * ## Hazards this file was written around — documented, not hypothetical
 *
 * - **Port.** `:5173` on this machine is a DIFFERENT APP, and a suite pointed at
 *   it passes vacuously. The first test proves the base URL is this app before
 *   anything below it is believed. Run against a private pair — see the header
 *   of `docs/DEV_ENVIRONMENT.md` and `E2E_API_URL` below.
 * - **Never in parallel with another admin suite.** This one drives
 *   `/admin/production` and `/admin/orders`; so does `admin-vendor-lifecycle`.
 * - **No `window.confirm` anywhere on these paths.** Every destructive-looking
 *   move is a two-step inline confirm (`InlineConfirm`, `vendor/index.tsx:214`).
 *   If a step below hangs on a click, a native dialog has crept in — that is the
 *   defect this assertion shape exists to catch, and the reason nine admin
 *   destructive paths had no E2E coverage before.
 * - **Static test titles.** No interpolation: a templated title makes a
 *   `--grep` unusable and a report unreadable across runs.
 *
 * ## The two vendors
 *
 * `auth.setup.ts` mints four storage states and none of them is a vendor's:
 * there is no vendor in any seed. `admin-vendor-lifecycle.spec.ts` invites
 * exactly one, mid-run. Consolidation needs two, each linked to a different
 * vendor row, so this file invites both and writes its own pair of states.
 * Nothing is cleaned up afterwards, deliberately and in line with that file:
 * a failed run's rows are the evidence you need to read.
 *
 * ## The one step that cannot be exercised, and is not pretended otherwise
 *
 * `GET /api/vendor/jobs/:id/label` answers **503 `LABEL_NOT_AVAILABLE` in every
 * environment**, because `order_shipments.label_object_token` is a declared seam
 * owned by `order-dispatch-tracking` and does not exist yet.
 *
 * It is worse than the ticket assumed, and the difference matters. The column is
 * named in `getVendorJobLabelKey`'s SELECT list (`lib/vendor-scope.ts:617`), so
 * Postgres raises `42703` during *parse analysis* — before a single WHERE
 * predicate is evaluated. The documented `404 "Label not found"` that
 * distinguishes a non-consolidator from a consolidator is therefore
 * **unreachable today for anybody**: both get the same 503. A test asserting a
 * 404 there would be asserting a fixture it had built itself.
 *
 * So this file asserts the two things that are true:
 *
 * 1. readiness flips `true` on its own terms — every job passed, the goods at
 *    the consolidator, the transfer received — which is the half of the seam
 *    this feature owns and can prove; and
 * 2. the label route answers its documented 503, in the API and on the vendor's
 *    screen, rather than a schema disclosure or a silent 404.
 *
 * The signing step itself is marked `test.fixme` below with the exact
 * precondition, so it is switched on with the seam rather than rediscovered.
 * The 404 discrimination is asserted where it can be, against a db that has the
 * column: `packages/api/tests/routes/vendor/isolation.test.ts`. And
 * `packages/api/tests/lib/vendor-label-seam.test.ts` goes red the day the column
 * lands, which is what connects the two.
 *
 * ## The shape of the order, and the one thing the seed cannot give
 *
 * A print shop prints the sheet, couriers it to a framer, and the framer — who
 * has the bulky, glazed, fragile finished piece — ships to the customer. That is
 * §5's own motivating case and its rule 2 (`frame_vendor`: "you never courier a
 * framed piece TO a poster shop"), and it is what this file drives.
 *
 * The one liberty taken, stated rather than buried: **no seeded order line
 * carries a `frame_id`** — `select … having count(frame_id) > 0` returns zero
 * rows — so `requiredStagesFor` asks that item for a `print` job only, and the
 * frame job below is an admin-created job beside it rather than a coverage
 * requirement. Every other clause of the readiness predicate is exercised for
 * real; the `item_uncovered` clause specifically is not, and is covered by
 * `packages/api/tests/lib/production-readiness.test.ts` over every status
 * assignment on two- and three-job orders. Fabricating a framed line would mean
 * an INSERT straight into `order_items`, which is a test asserting its own
 * fixture.
 *
 * The alternative — §5 rule 3, two print vendors on a two-item order — was
 * built first and abandoned on evidence: the seed holds 116 orders and 120
 * items, so **four** orders have two lines and each run consumes one
 * irreversibly (`dispatched` is terminal). A suite that can run twice is a
 * suite that fails on the third run for a reason that looks like a bug.
 * Single-line orders are abundant, so this file is repeatable.
 */

import {
  test,
  expect,
  request as playwrightRequest,
  type Page,
  type APIRequestContext,
  type Browser,
} from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json')

/**
 * Written by this file, not by `auth.setup.ts` — see the header. Two of them,
 * because one vendor cannot consolidate an order away from itself.
 */
const VENDOR_A_AUTH = path.join(__dirname, '..', '.auth', 'production-vendor-a.json')
const VENDOR_B_AUTH = path.join(__dirname, '..', '.auth', 'production-vendor-b.json')

/**
 * The API's own origin. The browser reaches it same-origin through Vite's
 * `/api` proxy; the harness talks to it directly, so a proxy that is not running
 * fails as a connection error rather than as an application bug.
 */
const API_URL = process.env.E2E_API_URL || 'http://localhost:3000'

/** Unique per run. Nothing below is cleaned up — see the header. */
const RUN = Date.now().toString(36)

const VENDOR_PASSWORD = 'TestPassword123!'

/** Rate cards. Distinct so a payable that follows the wrong vendor is visible. */
const RATE_A = '410.00'
const RATE_B = '365.00'

/**
 * `₹1,234.00` — the `en-IN` grouping the screens actually print.
 *
 * A payable is the rate card's band figure times the line's QUANTITY (§11's
 * fix: pricing used to read a line of three as one). This file does not get to
 * choose which seeded order it finds, so the expected figure is computed from
 * that order rather than written down.
 */
function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * The smallest thing MinIO will accept as a photograph: a 1×1 PNG.
 *
 * Real bytes, really PUT to real object storage through a real presigned URL —
 * `photos/complete` HEADs the object before it will record the row
 * (`PHOTO_OBJECT_MISSING`, `routes/vendor.ts:993`), so a fabricated key or a
 * skipped upload is refused. That HEAD is the reason this is a byte array and
 * not a string.
 */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

interface CreatedVendor {
  id: string
  name: string
  login: string
}

// Shared across the serial run.
const vendorA: CreatedVendor = {
  id: '',
  name: `E2E Print Shop ${RUN}`,
  login: `e2e-prod-print-${RUN}@example.com`,
}
const vendorB: CreatedVendor = {
  id: '',
  name: `E2E Framer ${RUN}`,
  login: `e2e-prod-frame-${RUN}@example.com`,
}

let orderId = ''
let jobAId = ''
let jobBId = ''
let transferId = ''
/** What each job is worth, once quantity is in. Set at assignment. */
let payableADisplay = ''
let payableBDisplay = ''

// ============================================================================
// Helpers
// ============================================================================

/** A request that must succeed; the failure message carries the body. */
async function apiJson<T>(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch',
  route: string,
  data?: unknown
): Promise<T> {
  const response = await request[method](`${API_URL}${route}`, {
    ...(data === undefined ? {} : { data }),
    headers: { 'Content-Type': 'application/json' },
  })

  const body = await response.text()
  expect(
    response.ok(),
    `${method.toUpperCase()} ${route} -> ${response.status()} ${body.slice(0, 500)}`
  ).toBe(true)

  return JSON.parse(body) as T
}

/**
 * A request that must be REFUSED, with the status and code named.
 *
 * The status alone is not the assertion. Every refusal in this router carries a
 * `code`, and asserting only "not 2xx" would pass on a 500, on a 401 from an
 * expired session, and on a 404 for a job this test failed to create — three
 * things that are not the rule under test. Returns the parsed body so a caller
 * can go on to assert the fields that make the refusal actionable.
 */
async function expectRefusal(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch',
  route: string,
  expected: { status: number; code?: string },
  data?: unknown
): Promise<Record<string, unknown>> {
  const response = await request[method](`${API_URL}${route}`, {
    ...(data === undefined ? {} : { data }),
    headers: { 'Content-Type': 'application/json' },
  })

  const raw = await response.text()
  expect(
    response.status(),
    `${method.toUpperCase()} ${route} -> ${response.status()} ${raw.slice(0, 500)}`
  ).toBe(expected.status)

  const body = JSON.parse(raw) as Record<string, unknown>
  if (expected.code !== undefined) expect(body.code).toBe(expected.code)
  // Never an empty refusal: a body with no sentence is a dead end on a screen.
  expect(typeof body.error).toBe('string')
  expect((body.error as string).length).toBeGreaterThan(0)

  return body
}

/** Vendor row + capability + rate + contact + login, all through real routes. */
async function provisionVendor(
  request: APIRequestContext,
  vendor: CreatedVendor,
  kind: 'print' | 'frame',
  rate: string
): Promise<void> {
  const created = await apiJson<{ vendor: { id: string } }>(
    request,
    'post',
    '/api/admin/vendors',
    { name: vendor.name, status: 'active' }
  )
  vendor.id = created.vendor.id

  await apiJson(request, 'post', `/api/admin/vendors/${vendor.id}/capabilities`, {
    kind,
    maxWidthInches: 999,
    maxHeightInches: 999,
    statedTurnaroundDays: 3,
  })

  // The band has to cover whatever the seeded order's biggest edge turns out to
  // be, because this file does not get to choose the order.
  await apiJson(request, 'post', `/api/admin/vendors/${vendor.id}/rates`, {
    kind,
    longestEdgeMinInches: 0,
    longestEdgeMaxInches: 999,
    amount: rate,
  })

  await apiJson(request, 'post', `/api/admin/vendors/${vendor.id}/contacts`, {
    name: vendor.name,
    role: 'Production lead',
    email: vendor.login,
  })

  // The invite endpoint is the only path to a vendor login — there is no vendor
  // sign-up form to drive.
  const invited = await apiJson<{ created: boolean; user: { role: string } }>(
    request,
    'post',
    `/api/admin/vendors/${vendor.id}/invite`,
    { email: vendor.login, name: vendor.name }
  )
  expect(invited.created).toBe(true)
  expect(invited.user.role).toBe('vendor')

  // The mailed set-password link has no mailbox here, so the credential is set
  // directly and the sign-in below is a real one.
  execFileSync(
    'bun',
    [
      'run',
      path.join(PROJECT_ROOT, 'packages/api/src/database/set-test-user-password.ts'),
      vendor.login,
      VENDOR_PASSWORD,
    ],
    { cwd: PROJECT_ROOT, stdio: 'inherit' }
  )
}

/** A real form sign-in, saved so the rest of the run can reuse the session. */
async function signInVendor(
  browser: Browser,
  login: string,
  statePath: string
): Promise<void> {
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto('/auth/login', { waitUntil: 'networkidle' })
    await page.locator('input#email, input[name="email"]').fill(login)
    await page.locator('input#password, input[name="password"]').fill(VENDOR_PASSWORD)
    await page.locator('button[type="submit"]:has-text("Sign In")').click()
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'), {
      timeout: 25000,
    })
    await context.storageState({ path: statePath })
  } finally {
    await context.close()
  }
}

/** An API context carrying a vendor's own cookies. */
async function vendorApi(statePath: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: API_URL, storageState: statePath })
}

/**
 * An order this run may take over, with every line priceable.
 *
 * Found, not created: there is no admin route that creates an order, and driving
 * a whole guest checkout to reach the production queue would make this file a
 * checkout test that happens to end in a job. Same approach, and the same
 * failure-message shape, as `admin-vendor-lifecycle.spec.ts:188`.
 *
 * Three conditions, each of which cost a run to learn:
 *
 * 1. **Every line carries variant dimensions.** A job cannot be priced from a
 *    rate card without a longest edge, and an unpriceable job is refused at
 *    assignment (422 `unpriced`). One unsized line among several is enough.
 * 2. **No live production job already.** Earlier suites leave their jobs behind
 *    — `admin-vendor-lifecycle` creates two per run and cleans up nothing — and
 *    an order carrying another vendor's `assigned` job proposes *that* vendor as
 *    consolidator and blocks readiness forever. This is what the feature's own
 *    new `orderId` filter is for, so the filter is exercised by using it.
 * 3. **Paged, not "the first fifty".** A single page found none and reported it
 *    as a missing seed, which is the wrong diagnosis to hand the next person.
 */
async function findFreeSizedOrder(
  request: APIRequestContext
): Promise<{ orderId: string; itemIds: string[]; quantity: number }> {
  let page = 1
  let totalPages = 1

  while (page <= totalPages) {
    const list = await apiJson<{ items: Array<{ id: string }>; totalPages: number }>(
      request,
      'get',
      `/api/admin/orders?page=${page}&pageSize=100`
    )
    totalPages = list.totalPages

    for (const summary of list.items) {
      const detail = await apiJson<{
        id: string
        items: Array<{
          id: string
          quantity: number
          variant?: { widthInches?: number | null; heightInches?: number | null } | null
        }>
      }>(request, 'get', `/api/admin/orders/${summary.id}`)

      if (detail.items.length === 0) continue
      const sized = detail.items.every(
        (item) =>
          item.variant?.widthInches != null && item.variant?.heightInches != null
      )
      if (!sized) continue

      const existing = await apiJson<{ items: Array<{ status: string }> }>(
        request,
        'get',
        `/api/admin/production?orderId=${detail.id}&pageSize=100`
      )
      if (existing.items.some((job) => job.status !== 'cancelled')) continue

      return {
        orderId: detail.id,
        itemIds: detail.items.map((item) => item.id),
        quantity: detail.items.reduce((sum, item) => sum + item.quantity, 0),
      }
    }

    page += 1
  }

  throw new Error(
    'No seeded order has every line sized AND no live production job left on it — ' +
      'run `bun run seed` in packages/api before this spec.'
  )
}

/**
 * Upload every photograph the shot list is still missing, and prove it emptied.
 *
 * Presign → PUT the bytes → complete, which is the real three-step path the
 * portal's uploader takes. The slots come from the API's own
 * `missingRequiredSlots` rather than from a list written here, so a shot list
 * that grows a slot is covered by this file the day it does.
 */
async function uploadShotList(api: APIRequestContext, jobId: string): Promise<string[]> {
  const before = await apiJson<{ missingRequiredSlots: string[] }>(
    api,
    'get',
    `/api/vendor/jobs/${jobId}/photos`
  )

  // A guard that has nothing to guard is not a guard. If the shot list is
  // already complete, the submission below would pass for the wrong reason.
  expect(before.missingRequiredSlots.length).toBeGreaterThan(0)

  for (const slot of before.missingRequiredSlots) {
    const presigned = await apiJson<{ uploadUrl: string; key: string }>(
      api,
      'post',
      `/api/vendor/jobs/${jobId}/photos/presign`,
      { slot, contentType: 'image/png', sizeBytes: PNG_1PX.byteLength }
    )

    const put = await api.put(presigned.uploadUrl, {
      headers: { 'Content-Type': 'image/png' },
      data: PNG_1PX,
    })
    expect(
      put.ok(),
      `PUT ${slot} -> ${put.status()} ${(await put.text()).slice(0, 300)}`
    ).toBe(true)

    await apiJson(api, 'post', `/api/vendor/jobs/${jobId}/photos/complete`, {
      slot,
      key: presigned.key,
      contentType: 'image/png',
      sizeBytes: PNG_1PX.byteLength,
    })
  }

  const after = await apiJson<{ missingRequiredSlots: string[] }>(
    api,
    'get',
    `/api/vendor/jobs/${jobId}/photos`
  )
  expect(after.missingRequiredSlots).toEqual([])

  return before.missingRequiredSlots
}

/** The current status of a job, read back through the admin route. */
async function jobStatus(request: APIRequestContext, jobId: string): Promise<string> {
  const { job } = await apiJson<{ job: { status: string } }>(
    request,
    'get',
    `/api/admin/production/${jobId}`
  )
  return job.status
}

/** Drive a vendor's job move through the portal's two-step inline confirm. */
async function markThroughPortal(page: Page, jobId: string, to: string): Promise<void> {
  await page.goto(`/vendor/jobs/${jobId}`, { waitUntil: 'networkidle' })
  await expect(page.getByTestId('vendor-job-detail')).toBeVisible()

  const action = page.getByTestId(`vendor-job-mark-${to}`)
  await expect(action).toBeVisible()
  await expect(action).toBeEnabled()
  await action.click()

  // If a native confirm() ever replaces this, the click above resolves and the
  // assertion below times out — which is the signal, not a flake.
  const confirmButton = page.getByTestId(`vendor-job-mark-${to}-confirm`)
  await expect(confirmButton).toBeVisible()
  await confirmButton.click()

  await expect(page.getByTestId('vendor-job-action-error')).toHaveCount(0)
}

// ============================================================================
// The chain
// ============================================================================

test.describe('production pipeline: two-vendor consolidation', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: ADMIN_AUTH })

  test('the base URL is this app, signed in as an admin', async ({ page }) => {
    // :5173 is a DIFFERENT APP on this machine. Everything below is a lie if
    // this is not the production queue of this application.
    await page.goto('/admin/production', { waitUntil: 'networkidle' })

    await expect(page).toHaveTitle(/chobii\.art/)
    await expect(page.getByTestId('admin-production-error')).toHaveCount(0)
    const table = page.getByTestId('admin-production-table')
    const empty = page.getByTestId('admin-production-empty')
    expect(
      (await table.count()) + (await empty.count()),
      'neither the production queue nor its empty state rendered — this is not ' +
        'this app, or the admin session is not an admin'
    ).toBeGreaterThan(0)
  })

  test('admin onboards a print shop and a framer and invites each a login', async ({
    page,
    browser,
  }) => {
    await provisionVendor(page.request, vendorA, 'print', RATE_A)
    await provisionVendor(page.request, vendorB, 'frame', RATE_B)
    expect(vendorA.id).not.toBe(vendorB.id)

    await signInVendor(browser, vendorA.login, VENDOR_A_AUTH)
    await signInVendor(browser, vendorB.login, VENDOR_B_AUTH)
  })

  test('admin creates a print job and a frame job and splits them across the vendors', async ({
    page,
  }) => {
    const found = await findFreeSizedOrder(page.request)
    orderId = found.orderId

    // The print shop makes the sheet; the framer makes the piece. Both jobs
    // carry every line on the order, so the print stage every line requires is
    // covered and nothing is left `item_uncovered`.
    const createdA = await apiJson<{ job: { id: string } }>(
      page.request,
      'post',
      '/api/admin/production',
      { orderId, stage: 'print', orderItemIds: found.itemIds }
    )
    jobAId = createdA.job.id

    const createdB = await apiJson<{ job: { id: string } }>(
      page.request,
      'post',
      '/api/admin/production',
      { orderId, stage: 'frame', orderItemIds: found.itemIds }
    )
    jobBId = createdB.job.id
    expect(jobAId).not.toBe(jobBId)

    // A payable is the rate card's band figure times the line's QUANTITY. That
    // last clause is §11's fix: pricing used to read a line of three as one,
    // latent only because nothing created jobs yet. Computed from the order
    // rather than written down, so it holds whichever order this run finds.
    payableADisplay = rupees(Number(RATE_A) * found.quantity)
    payableBDisplay = rupees(Number(RATE_B) * found.quantity)

    // Job A is assigned through the screen — the step that prices it from the
    // rate card, and the one an admin actually performs.
    await page.goto(`/admin/production/${jobAId}`, { waitUntil: 'networkidle' })
    const candidate = page.getByTestId(`admin-production-candidate-${vendorA.id}`)
    await expect(candidate).toBeVisible()
    // The preview is the rate card's figure, not a number typed anywhere.
    await expect(candidate).toContainText(payableADisplay)
    // The framer has no PRINT rate, so it is not a candidate for a print job.
    await expect(
      page.getByTestId(`admin-production-candidate-${vendorB.id}`)
    ).toHaveCount(0)

    await page.getByTestId(`admin-production-assign-${vendorA.id}`).click()
    await expect(page.getByTestId('admin-production-assign-error')).toHaveCount(0)

    const assignedB = await apiJson<{ amountExpected: string }>(
      page.request,
      'post',
      `/api/admin/production/${jobBId}/assign`,
      { vendorId: vendorB.id }
    )
    // The payable follows the vendor who holds the job and the card that priced
    // it, not the vendor assigned first.
    expect(assignedB.amountExpected).toBe(
      (Number(RATE_B) * found.quantity).toFixed(2)
    )

    expect(await jobStatus(page.request, jobAId)).toBe('assigned')
    expect(await jobStatus(page.request, jobBId)).toBe('assigned')
  })

  test('split work refuses a system default and demands a confirmed consolidator', async ({
    page,
  }) => {
    // Work split across two vendors: the system PROPOSES and must not decide.
    // `decided_by = NULL` means "there was nothing to choose", and here there
    // plainly was.
    const refused = await expectRefusal(
      page.request,
      'post',
      `/api/admin/orders/${orderId}/consolidator`,
      { status: 422, code: 'CONFIRMATION_REQUIRED' },
      {}
    )
    const proposal = refused.proposal as {
      vendorId: string
      basis: string
      needsConfirmation: boolean
    }
    expect(proposal.needsConfirmation).toBe(true)
    // §5 rule 2, and the reason it is a rule: a finished framed piece is bulky,
    // fragile and glazed, so it stays where it was framed.
    expect(proposal.basis).toBe('frame_vendor')
    expect(proposal.vendorId).toBe(vendorB.id)

    // The admin confirms the proposal. A confirmed proposal and a system default
    // are different rows, and this is the one with a human on it.
    const confirmed = await apiJson<{
      changed: boolean
      consolidation: { vendorId: string; decidedBy: string | null }
    }>(page.request, 'post', `/api/admin/orders/${orderId}/consolidator`, {
      vendorId: vendorB.id,
    })
    expect(confirmed.changed).toBe(true)
    expect(confirmed.consolidation.vendorId).toBe(vendorB.id)
    // Not a system default: a human is on the record for this choice.
    expect(confirmed.consolidation.decidedBy).not.toBeNull()

    // And the screen agrees with the route that fed it.
    await page.goto(`/admin/orders/${orderId}`, { waitUntil: 'networkidle' })
    const consolidator = page.getByTestId('admin-order-consolidator')
    await expect(consolidator).toBeVisible()
    await expect(page.getByTestId('admin-order-consolidator-current')).toContainText(
      vendorB.name
    )
  })

  test('vendor A sees only its own job and marks it received', async ({ browser }) => {
    const context = await browser.newContext({ storageState: VENDOR_A_AUTH })
    const page = await context.newPage()

    try {
      await page.goto('/vendor', { waitUntil: 'networkidle' })
      await expect(page.getByTestId('vendor-access-denied')).toHaveCount(0)

      // Isolation, at the only boundary that matters: the other vendor's job is
      // not merely filtered out of a table, its id is nowhere on the page.
      await expect(page.getByTestId(`vendor-job-row-${jobAId}`)).toBeVisible()
      await expect(page.getByTestId(`vendor-job-row-${jobBId}`)).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText(jobBId.slice(0, 8))

      await page.goto(`/vendor/jobs/${jobAId}`, { waitUntil: 'networkidle' })
      // The vendor is shown the same figure the admin priced, quantity and all.
      await expect(page.getByTestId('vendor-job-amount')).toHaveText(payableADisplay)

      await markThroughPortal(page, jobAId, 'received')
      await expect
        .poll(async () => {
          const { job } = await apiJson<{ job: { status: string } }>(
            page.request,
            'get',
            `/api/vendor/jobs/${jobAId}`
          )
          return job.status
        })
        .toBe('received')
    } finally {
      await context.close()
    }
  })

  test('REFUSAL: a vendor cannot submit for approval with an incomplete shot list', async ({
    browser,
  }) => {
    // Reachable at exactly this moment: the job is `received` and no photograph
    // has been taken. After the next test it is unreachable forever.
    const api = await vendorApi(VENDOR_A_AUTH)
    const context = await browser.newContext({ storageState: VENDOR_A_AUTH })
    const page = await context.newPage()

    try {
      const body = await expectRefusal(
        api,
        'patch',
        `/api/vendor/jobs/${jobAId}`,
        { status: 422, code: 'SHOT_LIST_INCOMPLETE' },
        { status: 'qc_submitted' }
      )
      expect(body.guard).toBe('shot-list-complete')
      // Actionable, not merely refused: the vendor is told which shots.
      expect(Array.isArray(body.missingSlots)).toBe(true)
      expect((body.missingSlots as string[]).length).toBeGreaterThan(0)

      // The refusal is not a surprise on the screen either. The portal reads the
      // same guard off the photographs it already has, and renders the button
      // disabled with the reason beside it rather than letting it be pressed.
      await page.goto(`/vendor/jobs/${jobAId}`, { waitUntil: 'networkidle' })
      const submit = page.getByTestId('vendor-job-mark-qc_submitted')
      await expect(submit).toBeVisible()
      await expect(submit).toBeDisabled()
      // Shown but not pressable, and never silently absent — a disabled control
      // with no sentence beside it is a screen telling someone to guess.
      await expect(page.getByTestId('vendor-job-guard-qc_submitted')).toContainText(
        'Every required photo has to be uploaded first'
      )

      // The job did not move.
      expect(
        (
          await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobAId}`
          )
        ).job.status
      ).toBe('received')
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  test('REFUSAL: a vendor cannot award itself a QC pass', async ({ browser }) => {
    const api = await vendorApi(VENDOR_A_AUTH)
    const context = await browser.newContext({ storageState: VENDOR_A_AUTH })
    const page = await context.newPage()

    try {
      // `qc_passed` is not in the vendor PATCH's vocabulary at all — the enum is
      // derived from the matrix, and the matrix names `admin` on that edge. A
      // verdict with no review row is a verdict with no evidence.
      const response = await api.patch(`${API_URL}/api/vendor/jobs/${jobAId}`, {
        headers: { 'Content-Type': 'application/json' },
        data: { status: 'qc_passed' },
      })
      expect(response.status()).toBe(400)

      // The same subtraction on the screen: the portal offers the matrix's
      // vendor edges and nothing else, so there is no control to press.
      await page.goto(`/vendor/jobs/${jobAId}`, { waitUntil: 'networkidle' })
      await expect(page.getByTestId('vendor-job-actions')).toBeVisible()
      await expect(page.getByTestId('vendor-job-mark-qc_passed')).toHaveCount(0)
      await expect(page.getByTestId('vendor-job-mark-qc_failed')).toHaveCount(0)
      // And the retired status has no control either — #675's whole point.
      await expect(page.getByTestId('vendor-job-mark-sent')).toHaveCount(0)

      expect(
        (
          await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobAId}`
          )
        ).job.status
      ).toBe('received')
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  test('vendor A uploads the shot list and submits the job for approval', async ({
    browser,
  }) => {
    const api = await vendorApi(VENDOR_A_AUTH)
    const context = await browser.newContext({ storageState: VENDOR_A_AUTH })
    const page = await context.newPage()

    try {
      const uploaded = await uploadShotList(api, jobAId)
      expect(uploaded.length).toBeGreaterThan(0)

      // Now the same button the previous test found disabled is live, and the
      // guard the API evaluates and the guard the screen renders agree.
      await markThroughPortal(page, jobAId, 'qc_submitted')

      await expect
        .poll(async () => {
          const { job } = await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobAId}`
          )
          return job.status
        })
        .toBe('qc_submitted')
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  test('admin passes QC on vendor A job and the verdict moves it', async ({ page }) => {
    await page.goto(`/admin/production/${jobAId}`, { waitUntil: 'networkidle' })

    await expect(page.getByTestId('admin-production-reviews-empty')).toBeVisible()
    // The photographs the verdict is judged on are on the screen that records it.
    await expect(page.getByTestId('admin-production-photos')).toBeVisible()

    await page.getByTestId('admin-production-review-verdict').selectOption('pass')
    await page.getByTestId('admin-production-review-notes').fill('Colour and trim both good.')
    await page.getByTestId('admin-production-review-submit').click()

    await expect(page.getByTestId('admin-production-review-error')).toHaveCount(0)
    const reviews = page.getByTestId('admin-production-reviews')
    await expect(reviews).toBeVisible()
    await expect(reviews).toContainText('Colour and trim both good.')

    // The verdict MOVED the job — #684/#689 replaced the free-status select, so
    // this is the assertion that the two are now one act. `dispatched` is
    // reachable only from `qc_passed`, so its appearance is the proof.
    await expect(page.getByTestId('admin-production-transition-to-dispatched')).toBeVisible()
    await expect.poll(() => jobStatus(page.request, jobAId)).toBe('qc_passed')
  })

  test('REFUSAL: a non-consolidator gets no carrier label', async ({ browser }) => {
    // Vendor A is `qc_passed` and is NOT the consolidator, which is the one
    // moment `LABEL_ACCESS_STATUSES` even lets the question be asked.
    //
    // The documented answer is 404 with the presigner never called. It is not
    // the answer today and cannot be: `order_shipments.label_object_token` does
    // not exist, and it is named in the SELECT list, so Postgres raises 42703
    // during parse analysis — before a WHERE predicate is evaluated. A
    // non-consolidator and the consolidator get the identical 503. Asserting a
    // 404 here would assert a fixture this file had built for itself.
    //
    // What IS assertable, and is: the refusal is our fixed sentence with its
    // documented code, naming no column, table or driver — from the one route
    // that exists to carry a customer's name and address.
    const api = await vendorApi(VENDOR_A_AUTH)
    const context = await browser.newContext({ storageState: VENDOR_A_AUTH })
    const page = await context.newPage()

    try {
      const body = await expectRefusal(api, 'get', `/api/vendor/jobs/${jobAId}/label`, {
        status: 503,
        code: 'LABEL_NOT_AVAILABLE',
      })
      const message = body.error as string
      expect(message).not.toMatch(/label_object_token|order_shipments|column|42703|relation/i)

      // And on the screen, in our words rather than the response's.
      await page.goto(`/vendor/jobs/${jobAId}`, { waitUntil: 'networkidle' })
      await expect(page.getByTestId('vendor-job-label-card')).toBeVisible()
      await page.getByTestId('vendor-job-label').click()
      await expect(page.getByTestId('vendor-job-label-unavailable')).toBeVisible()
      await expect(page.getByTestId('vendor-job-label-error')).toHaveCount(0)
      // R2: never inline, and never a signed URL in the DOM.
      await expect(page.locator('iframe, embed, object')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText('X-Amz-Signature')
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  test('vendor A despatches the parcel to the consolidator', async ({ browser }) => {
    const api = await vendorApi(VENDOR_A_AUTH)

    try {
      const dispatched = await apiJson<{
        transfer: { id: string; reference: string | null; receivedAt: string | null }
        jobIds: string[]
      }>(api, 'post', '/api/vendor/transfers', {
        jobIds: [jobAId],
        carrier: 'Blue Dart',
        reference: `E2E-DOCKET-${RUN}`,
        pieceCount: 1,
      })

      transferId = dispatched.transfer.id
      expect(dispatched.jobIds).toEqual([jobAId])
      expect(dispatched.transfer.receivedAt).toBeNull()

      // Creating the parcel is what satisfies the despatch guard, in the same
      // transaction: the job leaves A's hands as the transfer is written.
      await expect
        .poll(async () => {
          const { job } = await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobAId}`
          )
          return job.status
        })
        .toBe('dispatched')

      // A never learns where it went. The consolidator is derived server-side
      // and the vendor shape carries no vendor ids and no order id.
      const outbound = await apiJson<{ items: Array<Record<string, unknown>> }>(
        api,
        'get',
        '/api/vendor/transfers?direction=outbound'
      )
      const mine = outbound.items.find((item) => item.id === transferId)
      expect(mine).toBeDefined()
      expect(Object.keys(mine as object).sort()).toEqual(
        [
          'carrier',
          'direction',
          'dispatchedAt',
          'expectedBy',
          'id',
          'pieceCount',
          'receivedAt',
          'reference',
        ].sort()
      )
    } finally {
      await api.dispose()
    }
  })

  test('vendor B confirms the parcel arrived, blind to who sent it', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: VENDOR_B_AUTH })
    const page = await context.newPage()

    try {
      await page.goto('/vendor', { waitUntil: 'networkidle' })

      const row = page.getByTestId(`vendor-transfer-row-${transferId}`)
      await expect(row).toBeVisible()
      await expect(page.getByTestId(`vendor-transfer-direction-${transferId}`)).toHaveText(
        'Coming to you'
      )
      // B is told a docket and a piece count, and nothing about A.
      await expect(row).toContainText(`E2E-DOCKET-${RUN}`)
      await expect(page.locator('body')).not.toContainText(vendorA.name)
      await expect(page.locator('body')).not.toContainText(vendorA.id)

      // Two-step inline confirm again — never a native dialog.
      await page.getByTestId(`vendor-transfer-received-${transferId}`).click()
      const confirmButton = page.getByTestId(`vendor-transfer-received-${transferId}-confirm`)
      await expect(confirmButton).toBeVisible()
      await confirmButton.click()

      await expect(page.getByTestId(`vendor-transfer-error-${transferId}`)).toHaveCount(0)
      await expect(row).toContainText('Arrived')
    } finally {
      await context.close()
    }
  })

  test('vendor B works its own job through to a QC pass', async ({ page, browser }) => {
    const api = await vendorApi(VENDOR_B_AUTH)
    const context = await browser.newContext({ storageState: VENDOR_B_AUTH })
    const vendorPage = await context.newPage()

    try {
      await vendorPage.goto(`/vendor/jobs/${jobBId}`, { waitUntil: 'networkidle' })
      // The framer's own card, not the print shop's — distinct rates, so a
      // payable that followed the wrong vendor would be visible here.
      await expect(vendorPage.getByTestId('vendor-job-amount')).toHaveText(payableBDisplay)

      await markThroughPortal(vendorPage, jobBId, 'received')
      // A frame job's shot list is seven required shots, not the print job's
      // three. `uploadShotList` reads them off the API rather than listing them,
      // so this covers the frame vocabulary without repeating it.
      const frameShots = await uploadShotList(api, jobBId)
      expect(frameShots.length).toBeGreaterThan(3)
      await markThroughPortal(vendorPage, jobBId, 'qc_submitted')

      await expect
        .poll(async () => {
          const { job } = await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobBId}`
          )
          return job.status
        })
        .toBe('qc_submitted')

      // Admin passes it, on the admin's own session.
      await page.goto(`/admin/production/${jobBId}`, { waitUntil: 'networkidle' })
      await page.getByTestId('admin-production-review-verdict').selectOption('pass')
      await page.getByTestId('admin-production-review-notes').fill('Frame and glazing clean.')
      await page.getByTestId('admin-production-review-submit').click()

      // A POSITIVE signal, and the reason this is not `expect(review-error)
      // .toHaveCount(0)` on its own: that assertion is equally true before the
      // request has left the browser, so it raced the write and read a status
      // that had not moved yet. The review appearing is the write landing.
      await expect(page.getByTestId('admin-production-reviews')).toContainText(
        'Frame and glazing clean.'
      )
      await expect(page.getByTestId('admin-production-review-error')).toHaveCount(0)

      await expect.poll(() => jobStatus(page.request, jobBId)).toBe('qc_passed')
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  test('readiness flips true once every job has passed and the goods are at the consolidator', async ({
    page,
  }) => {
    const readiness = await apiJson<{
      ready: boolean
      consolidatorVendorId: string | null
      blockers: Array<{ code: string }>
      blockerCodes: string[]
    }>(page.request, 'get', `/api/admin/orders/${orderId}/production-readiness`)

    expect(
      readiness.blockerCodes,
      'readiness is still blocked — the chain above did not actually complete'
    ).toEqual([])
    expect(readiness.ready).toBe(true)
    expect(readiness.consolidatorVendorId).toBe(vendorB.id)

    // The screen and the gate are one implementation; this is the assertion
    // that they cannot disagree.
    await page.goto(`/admin/orders/${orderId}`, { waitUntil: 'networkidle' })
    await expect(page.getByTestId('admin-order-readiness-ready')).toBeVisible()
    await expect(page.getByTestId('admin-order-readiness-blockers')).toHaveCount(0)
    // The parcel is on the order panel, both ends visible to an admin.
    await expect(page.getByTestId('admin-order-transfers')).toContainText(`E2E-DOCKET-${RUN}`)
  })

  test('REFUSAL: the frame job cannot claim handover before the goods can leave', async ({
    browser,
  }) => {
    // `open-transfer-or-order-label`. The framer holds a `qc_passed` frame job,
    // has despatched no parcel of its own, and the order carries no label yet —
    // so nothing has moved these goods anywhere and nothing can. `dispatched` is
    // terminal, so claiming it now would leave the order permanently
    // unlabelable, which is why this refuses rather than warns.
    //
    // Note this is refused even though readiness above is `true`. The two ask
    // different questions: readiness asks whether a label may be BOUGHT, this
    // asks whether the goods have gone. Buying the label is what closes the gap,
    // and the next test does exactly that.
    const api = await vendorApi(VENDOR_B_AUTH)
    const context = await browser.newContext({ storageState: VENDOR_B_AUTH })
    const page = await context.newPage()

    try {
      const body = await expectRefusal(
        api,
        'patch',
        `/api/vendor/jobs/${jobBId}`,
        { status: 409, code: 'GUARD_UNSATISFIED' },
        { status: 'dispatched' }
      )
      expect(body.guard).toBe('open-transfer-or-order-label')
      expect(body.from).toBe('qc_passed')
      expect(body.to).toBe('dispatched')

      // The screen leaves the move live on purpose — a browser can observe
      // neither an open transfer nor a label on the order, and greying out a
      // legal move on unreadable evidence would strand a vendor holding a
      // finished piece. So the button is offered and the API decides.
      await page.goto(`/vendor/jobs/${jobBId}`, { waitUntil: 'networkidle' })
      const handover = page.getByTestId('vendor-job-mark-dispatched')
      await expect(handover).toBeVisible()
      await expect(handover).toBeEnabled()

      expect(
        (
          await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobBId}`
          )
        ).job.status
      ).toBe('qc_passed')
    } finally {
      await context.close()
      await api.dispose()
    }
  })

  /**
   * SWITCH THIS ON WITH THE SEAM.
   *
   * Precondition, and the only one: `order_shipments.label_object_token` exists
   * and a labelled `order_shipments` row hangs off the order. That column
   * belongs to `order-dispatch-tracking`; inventing it here would put this
   * feature's name on another sub-project's table.
   *
   * When it lands, `packages/api/tests/lib/vendor-label-seam.test.ts` goes red
   * and names what to delete. At that point remove the `fixme` below and give
   * this test the two lines the seam makes possible: the consolidator signs a
   * label and gets a `fulfilment/labels/<token>.pdf` URL with a 300s TTL, and
   * vendor A — a non-consolidator on the same order — gets `404 "Label not
   * found"` with the presigner never called. Both are asserted against a db
   * that HAS the column today, in
   * `packages/api/tests/routes/vendor/isolation.test.ts`; what is missing is
   * only the end-to-end leg.
   *
   * It is a `fixme` rather than a deletion because a step quietly dropped from a
   * chain is a chain that claims a complete round trip it never made.
   */
  test.fixme(
    'the consolidator signs the carrier label and a non-consolidator cannot',
    async () => {
      // Intentionally empty until the seam lands. See the block above.
    }
  )

  test('vendor B confirms handover once the order carries a label', async ({
    page,
    browser,
  }) => {
    // Manual dispatch is still today's reality — the Shiprocket client remains
    // out of scope here (§12) and is `order-dispatch-tracking`'s pass 2.
    //
    // What HAS changed underneath this call: the route below no longer writes
    // `orders.shipping_details`. It upserts the live `order_shipments` row
    // (#707), and `ORDER_HAS_LABEL` now reads that table with a
    // `voided_at IS NULL` predicate (#711). So this is still a genuine write
    // through a genuine route satisfying a genuine guard — the guard just asks
    // a different table, and a voided label would no longer satisfy it.
    //
    // Nothing is stubbed: the guard that refused in the previous test is
    // satisfied by real data crossing two features' code.
    await apiJson(page.request, 'patch', `/api/admin/orders/${orderId}/shipping`, {
      carrier: 'Blue Dart',
      awbNumber: `E2E-AWB-${RUN}`,
    })

    const context = await browser.newContext({ storageState: VENDOR_B_AUTH })
    const vendorPage = await context.newPage()
    const api = await vendorApi(VENDOR_B_AUTH)

    try {
      await markThroughPortal(vendorPage, jobBId, 'dispatched')

      await expect
        .poll(async () => {
          const { job } = await apiJson<{ job: { status: string } }>(
            api,
            'get',
            `/api/vendor/jobs/${jobBId}`
          )
          return job.status
        })
        .toBe('dispatched')

      // Terminal, and the portal says so rather than showing a dead button.
      await vendorPage.reload({ waitUntil: 'networkidle' })
      await expect(vendorPage.getByTestId('vendor-job-actions-none')).toBeVisible()

      // And the structural consequence: with the consolidator's own job now
      // `dispatched` and riding no inbound transfer, the order can never read
      // ready again. That is what stops a second label being bought.
      const after = await apiJson<{ ready: boolean; blockerCodes: string[] }>(
        page.request,
        'get',
        `/api/admin/orders/${orderId}/production-readiness`
      )
      expect(after.ready).toBe(false)
      expect(after.blockerCodes).toContain('goods_not_at_consolidator')
    } finally {
      await context.close()
      await api.dispose()
    }
  })
})
