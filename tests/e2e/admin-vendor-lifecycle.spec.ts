/**
 * E2E: the vendor lifecycle, end to end, plus the two refusals
 *
 * One loop, in order, across three sessions:
 *
 *   admin  creates a vendor, gives it a print capability and a rate band
 *   admin  records a contact and invites that contact a login
 *   admin  creates a production job and assigns it — the expected amount is
 *          the rate-card figure, not a number anyone typed
 *   vendor signs in, sees THEIR job and not the other vendor's, and starts it
 *   admin  finds no verdict to record, because a verdict IS a transition
 *   admin  records the settlement, and the payable drops to zero
 *
 * and then the two paths a regression would make silently permissive:
 *
 *   a vendor session at /admin          -> Access Denied
 *   a content-manager at /admin/vendors -> Access Denied
 *
 * ## Why parts of the setup go through the API
 *
 * Two steps have no screen, by design, and are driven through the admin API
 * with the admin session's own cookies rather than faked:
 *
 * - **The invite.** `routes/admin/vendor-invite.ts` is the only way a vendor
 *   login exists — vendors cannot self-register — and there is no invite form
 *   yet. The POST here is the real endpoint, so the account, the role
 *   promotion and the `vendor_users` link are all really written.
 * - **Job creation.** `POST /api/admin/production` needs an order and its
 *   items; `OrderProductionPanel` reports coverage but does not create. The
 *   ASSIGNMENT — the part with a screen and the part that prices the job — is
 *   driven through the UI.
 *
 * The invited account is minted with a password nobody knows and a mailed
 * reset link (see the endpoint's header). With no mailbox to read, the harness
 * sets the credential itself via `set-test-user-password.ts`, the same way
 * `auth.setup.ts` reaches for `update-user-role.ts`.
 *
 * ## What #684/#689/#691 changed under this file, and what it asserts now
 *
 * This spec was written on 17 Aug against a production screen that carried a
 * free `<select name=status>` and a vendor portal whose first move was `sent`.
 * The `production-pipeline` feature replaced both, and for two whole phases
 * this file drove three controls that no longer exist — `vendor-job-mark-sent`,
 * and `admin-production-status` as a select — so it was failing on selectors
 * rather than on behaviour. #694 owns the repair. It is a REPAIR and not a
 * rewrite: the subject of this file is vendor onboarding, rate cards, isolation
 * and the money, and every one of those still holds. Only the mechanics of
 * moving a job moved.
 *
 * Three substitutions, each of them an assertion about the change:
 *
 * - `sent` is RETIRED (#675) — zero in-edges, zero out-edges. The vendor's
 *   first move is `received`, so that is what the portal is driven through.
 * - The status `<select>` is gone. A job's status is a `StatusPill`
 *   (`admin-production-status-<status>`) and the moves are buttons off the
 *   transition matrix (`admin-production-transition-to-<status>`). This file
 *   asserts the select is ABSENT, which is the direct check that #684 landed.
 * - **A verdict IS a transition.** `qc_passed` is not settable by any PATCH any
 *   more; it exists only as the consequence of `POST /:jobId/reviews`, and only
 *   from `qc_submitted`. So the old `selectOption('qc_passed')` is not merely a
 *   dead selector, it is a move the system no longer has. What this file
 *   asserts instead is the rule that replaced it — on a job the vendor has not
 *   submitted there is NO verdict to record, and the screen says so. The full
 *   QC round trip, shot list and all, is `production-pipeline.spec.ts`'s;
 *   duplicating it here would double a serial admin suite's runtime to
 *   re-prove somebody else's subject.
 *
 * ## Repo hazards honoured here
 *
 * - **Port.** `:5173` on this machine is a DIFFERENT app; pointed there this
 *   file passes vacuously. The first test asserts the base URL really is this
 *   app before any of the rest is believed.
 * - Serial: every step depends on the one before it. Run this file alone —
 *   admin suites interfere with each other.
 * - Two-step inline confirms, never `confirm()`. If the settlement below
 *   cannot be driven, a native dialog has crept into the payables screen.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..', '..')
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json')
const CONTENT_MANAGER_AUTH = path.join(
  __dirname,
  '..',
  '.auth',
  'content-manager.json'
)
/**
 * Written by the sign-in below, not by `auth.setup.ts`: the vendor account is
 * invited during this run and does not exist before it.
 */
const VENDOR_AUTH = path.join(__dirname, '..', '.auth', 'vendor-e2e.json')

/**
 * The API's own origin. The browser reaches it same-origin through Vite's
 * `/api` proxy; the harness talks to it directly, because a proxy that is not
 * running would otherwise look like an application failure.
 */
const API_URL = process.env.E2E_API_URL || 'http://localhost:3000'

/** Unique per run: every artefact below is created fresh and never cleaned up. */
const RUN = Date.now().toString(36)

const VENDOR_PASSWORD = 'TestPassword123!'

/** The rate each vendor is given. Vendor A's is what must appear downstream. */
const RATE_A = '450.00'
const RATE_B = '375.00'

/**
 * What job A is actually worth, and what every money assertion below compares
 * against. Set once the order is known, because a payable is the rate card's
 * band figure times the LINE'S QUANTITY — a line of three is priced as three
 * (the `production-pipeline` fix; it used to be priced as one). Hard-coding
 * `₹450.00` here only ever worked while the found order happened to have
 * single-unit lines.
 */
let rateAAmount = ''
let rateADisplay = ''

/** `₹1,234.00` — the `en-IN` grouping these screens print. */
function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

interface CreatedVendor {
  id: string
  name: string
}

// Shared across the serial run.
const vendorA: CreatedVendor = { id: '', name: `E2E Print Partner A ${RUN}` }
const vendorB: CreatedVendor = { id: '', name: `E2E Print Partner B ${RUN}` }
const vendorLogin = `e2e-vendor-${RUN}@example.com`
let jobAId = ''
let jobBId = ''

// ============================================================================
// Helpers
// ============================================================================

async function apiJson<T>(
  request: APIRequestContext,
  method: 'get' | 'post',
  path: string,
  data?: unknown
): Promise<T> {
  const response = await request[method](`${API_URL}${path}`, {
    ...(data === undefined ? {} : { data }),
    headers: { 'Content-Type': 'application/json' },
  })

  const body = await response.text()
  expect(
    response.ok(),
    `${method.toUpperCase()} ${path} -> ${response.status()} ${body.slice(0, 400)}`
  ).toBe(true)

  return JSON.parse(body) as T
}

/** Create a vendor through the form and return the id the app routed us to. */
async function createVendorViaUi(page: Page, name: string): Promise<string> {
  await page.goto('/admin/vendors/new', { waitUntil: 'networkidle' })

  await expect(page.getByTestId('vendor-form')).toBeVisible()
  await page.getByTestId('vendor-field-name').fill(name)
  await page.getByTestId('vendor-field-status').selectOption('active')
  await page.getByTestId('vendor-form-submit').click()

  // The form routes to the detail page, which is where capabilities and rates
  // live. A failure here shows the form's own error rather than a bare timeout.
  await expect(page.getByTestId('vendor-form-error')).toHaveCount(0)
  await page.waitForURL(
    /\/admin\/vendors\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
  )

  const id = page.url().match(/\/admin\/vendors\/([0-9a-f-]{36})/)?.[1]
  expect(id, `no vendor id in ${page.url()}`).toBeTruthy()
  return id as string
}

/** A print capability wide enough for any seeded poster, added through the form. */
async function addPrintCapability(page: Page): Promise<void> {
  await expect(page.getByTestId('vendor-capabilities-empty')).toBeVisible()

  await page.getByTestId('vendor-capability-kind').selectOption('print')
  await page.getByLabel('Max width in inches').fill('999')
  await page.getByLabel('Max height in inches').fill('999')
  await page.getByLabel('Stated turnaround in days').fill('3')
  await page.getByTestId('vendor-capability-add').click()

  await expect(page.getByTestId('vendor-capabilities-list')).toContainText(
    'Up to 999×999″'
  )
}

/** One open-ended print band covering every size, added through the form. */
async function addPrintRate(page: Page, amount: string): Promise<void> {
  await expect(page.getByTestId('vendor-rates-empty')).toBeVisible()

  await page.getByTestId('vendor-rate-kind').selectOption('print')
  await page.getByTestId('vendor-rate-amount').fill(amount)
  await page.getByTestId('vendor-rate-min').fill('0')
  await page.getByTestId('vendor-rate-max').fill('999')
  await page.getByTestId('vendor-rate-add').click()

  const table = page.getByTestId('vendor-rates-table')
  await expect(table).toBeVisible()
  await expect(table).toContainText(`₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`)
  await expect(table).toContainText('print 0–999″')
}

interface AdminOrderItem {
  id: string
  quantity: number
  variant: { widthInches: number | null; heightInches: number | null } | null
}

/**
 * An order with at least two items whose variants still have dimensions —
 * two, so one job can go to each vendor and the isolation assertion has
 * something to be isolated from. Without dimensions the job cannot be sized
 * and no vendor can be matched to it.
 */
async function findOrderWithTwoSizedItems(
  request: APIRequestContext
): Promise<{ orderId: string; itemIds: [string, string]; quantityA: number }> {
  // PAGED, not "the first fifty". A two-line order is a small minority of the
  // seed and they are not at the front of it, so a single page stopped finding
  // one as the order table grew and reported that as a missing seed — the wrong
  // diagnosis to hand the next person.
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
      const detail = await apiJson<{ id: string; items: AdminOrderItem[] }>(
        request,
        'get',
        `/api/admin/orders/${summary.id}`
      )

      const sized = detail.items.filter(
        (item) =>
          item.variant?.widthInches != null && item.variant?.heightInches != null
      )

      if (sized.length >= 2) {
        return {
          orderId: detail.id,
          itemIds: [sized[0]!.id, sized[1]!.id],
          quantityA: sized[0]!.quantity,
        }
      }
    }

    page += 1
  }

  throw new Error(
    'No seeded order has two items with variant dimensions — run the order seed before this spec.'
  )
}

// ============================================================================
// The lifecycle
// ============================================================================

test.describe('vendor lifecycle', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: ADMIN_AUTH })

  test('the base URL is this app, signed in as an admin', async ({ page }) => {
    // :5173 is a different app on this machine. Pointed there, everything
    // below passes without touching a single vendor screen, so this runs
    // first and the rest of the file is only meaningful if it passed.
    await page.goto('/admin/vendors', { waitUntil: 'networkidle' })

    await expect(page.getByText('Access Denied')).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Vendors', exact: true })
    ).toBeVisible()
    await expect(page).toHaveTitle(/Vendors \| Admin \| chobii\.art/)

    // The heading renders over a failed read too — the directory's own error
    // state kept this assertion green while `/api/admin/vendors` was answering
    // 400. So the read itself has to be asserted: one of the table or the
    // empty state, and never the banner.
    await expect(page.getByTestId('admin-vendors-error')).toHaveCount(0)
    await expect(
      page
        .getByTestId('admin-vendors-table')
        .or(page.getByTestId('admin-vendors-empty'))
    ).toBeVisible()
  })

  test('admin creates two vendors, each with a capability and a rate', async ({
    page,
  }) => {
    vendorA.id = await createVendorViaUi(page, vendorA.name)
    await addPrintCapability(page)
    await addPrintRate(page, RATE_A)

    vendorB.id = await createVendorViaUi(page, vendorB.name)
    await addPrintCapability(page)
    await addPrintRate(page, RATE_B)

    expect(vendorA.id).not.toBe(vendorB.id)

    // Both are in the directory the admin actually browses. The list is
    // ordered by name and paginated, and every run of this file leaves two
    // more vendors behind, so ask for a page big enough to still hold them.
    await page.goto('/admin/vendors?page=1&pageSize=100', {
      waitUntil: 'networkidle',
    })
    await expect(page.getByTestId(`admin-vendor-row-${vendorA.id}`)).toContainText(
      vendorA.name
    )
    await expect(page.getByTestId(`admin-vendor-row-${vendorB.id}`)).toContainText(
      vendorB.name
    )
  })

  test('admin records a contact and invites them a login', async ({ page }) => {
    await page.goto(`/admin/vendors/${vendorA.id}`, { waitUntil: 'networkidle' })

    await page.getByTestId('vendor-contact-name').fill('Ramesh Iyer')
    await page.getByPlaceholder('Role').fill('Production lead')
    await page.getByPlaceholder('Email').fill(vendorLogin)
    await page.getByTestId('vendor-contact-add').click()

    const contacts = page.getByTestId('vendor-contacts-list')
    await expect(contacts).toContainText('Ramesh Iyer')
    await expect(contacts).toContainText(vendorLogin)

    // The invite endpoint is the only path to a vendor login — there is no
    // sign-up form to drive, so the real endpoint is called with the admin's
    // own session.
    const invited = await apiJson<{
      created: boolean
      user: { email: string; role: string }
    }>(page.request, 'post', `/api/admin/vendors/${vendorA.id}/invite`, {
      email: vendorLogin,
      name: 'Ramesh Iyer',
    })

    expect(invited.created).toBe(true)
    expect(invited.user.email).toBe(vendorLogin)
    expect(invited.user.role).toBe('vendor')

    // The mailed set-password link has no mailbox here; the credential is set
    // directly so the vendor session below is a real sign-in.
    execFileSync(
      'bun',
      [
        'run',
        path.join(
          PROJECT_ROOT,
          'packages/api/src/database/set-test-user-password.ts'
        ),
        vendorLogin,
        VENDOR_PASSWORD,
      ],
      { cwd: PROJECT_ROOT, stdio: 'inherit' }
    )
  })

  test('admin assigns a job and the expected amount is the rate-card figure', async ({
    page,
  }) => {
    const { orderId, itemIds, quantityA } = await findOrderWithTwoSizedItems(
      page.request
    )

    // A payable is the band figure times the line's quantity.
    rateAAmount = (Number(RATE_A) * quantityA).toFixed(2)
    rateADisplay = rupees(Number(rateAAmount))

    const createdA = await apiJson<{ job: { id: string } }>(
      page.request,
      'post',
      '/api/admin/production',
      { orderId, stage: 'print', orderItemIds: [itemIds[0]] }
    )
    jobAId = createdA.job.id

    const createdB = await apiJson<{ job: { id: string } }>(
      page.request,
      'post',
      '/api/admin/production',
      { orderId, stage: 'print', orderItemIds: [itemIds[1]] }
    )
    jobBId = createdB.job.id
    expect(jobAId).not.toBe(jobBId)

    // Job A is assigned through the screen — this is the step that prices it.
    await page.goto(`/admin/production/${jobAId}`, { waitUntil: 'networkidle' })

    const candidate = page.getByTestId(`admin-production-candidate-${vendorA.id}`)
    await expect(candidate).toBeVisible()
    // The preview is the rate card's figure, not a number typed anywhere.
    await expect(candidate).toContainText(rateADisplay)

    await page.getByTestId(`admin-production-assign-${vendorA.id}`).click()

    await expect(page.getByTestId('admin-production-assign-error')).toHaveCount(0)
    const summary = page.locator('dl').filter({ hasText: 'Payable' }).first()
    await expect(summary).toContainText(vendorA.name)
    await expect(summary).toContainText(rateADisplay)

    // #684: the free status `<select>` is gone. The status is a pill carrying
    // its own value, and asserting the select's ABSENCE is what stops this file
    // silently going green again against a screen that grew one back.
    await expect(page.getByTestId('admin-production-status')).toHaveCount(0)
    await expect(page.getByTestId('admin-production-status-assigned')).toBeVisible()

    // Job B goes to the other vendor, so the vendor portal below has something
    // it must NOT show.
    await apiJson(page.request, 'post', `/api/admin/production/${jobBId}/assign`, {
      vendorId: vendorB.id,
    })
  })

  test('vendor signs in, sees only their own job, and starts work on it', async ({
    browser,
  }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto('/auth/login', { waitUntil: 'networkidle' })
      await page.locator('input#email, input[name="email"]').fill(vendorLogin)
      await page
        .locator('input#password, input[name="password"]')
        .fill(VENDOR_PASSWORD)
      await page
        .locator('button[type="submit"]:has-text("Sign In")')
        .click()
      await page.waitForURL((url) => !url.pathname.includes('/auth/login'), {
        timeout: 25000,
      })

      // Kept for the refusal test below, so the vendor signs in once.
      await context.storageState({ path: VENDOR_AUTH })

      await page.goto('/vendor', { waitUntil: 'networkidle' })

      // A vendor role that reached the portal at all is half the assertion.
      await expect(page.getByTestId('vendor-access-denied')).toHaveCount(0)
      await expect(page.getByTestId('vendor-portal-account')).toContainText(
        'Ramesh Iyer'
      )

      // Exactly one job, and it is theirs.
      const rows = page.getByTestId('vendor-jobs-table').locator('tbody tr')
      await expect(rows).toHaveCount(1)
      await expect(page.getByTestId(`vendor-job-row-${jobAId}`)).toBeVisible()
      await expect(page.getByTestId(`vendor-job-row-${jobBId}`)).toHaveCount(0)
      // The other vendor's job is not merely hidden by a filter — its id is
      // nowhere on the page.
      await expect(page.locator('body')).not.toContainText(jobBId.slice(0, 8))

      await page.getByTestId(`vendor-job-row-${jobAId}`).getByRole('link').click()
      await page.waitForURL(new RegExp(`/vendor/jobs/${jobAId}`))

      await expect(page.getByTestId('vendor-job-detail')).toBeVisible()
      await expect(page.getByTestId('vendor-job-amount')).toHaveText(rateADisplay)

      // #675 retired `sent`: it has zero edges in both directions, so there is
      // no control for it and there must not be one.
      await expect(page.getByTestId('vendor-job-mark-sent')).toHaveCount(0)

      // The vendor's first move is `received` — "I have everything I need to
      // start". Inline two-step confirm. A native confirm() here would block
      // the harness outright — see this file's header.
      await page.getByTestId('vendor-job-mark-received').click()
      await expect(
        page.getByTestId('vendor-job-mark-received-confirm')
      ).toBeVisible()
      await page.getByTestId('vendor-job-mark-received-confirm').click()

      await expect(page.getByTestId('vendor-job-action-error')).toHaveCount(0)

      // The clock the status starts, printed rather than dashed out. It renders
      // only once `receivedAt` exists, so its presence IS the move landing.
      await expect(
        page.getByTestId('vendor-job-in-production-since')
      ).toBeVisible()
      await expect(
        page.getByTestId('vendor-job-in-production-since')
      ).not.toContainText('—')
    } finally {
      await context.close()
    }
  })

  test('a verdict is a transition, so a job nobody submitted has none to record', async ({
    page,
  }) => {
    // What this test used to do — `selectOption('qc_passed')` on a free status
    // dropdown — is not a move the system has any more, and it was never a
    // sound one: it recorded a verdict as a status change with no review row
    // behind it. #684/#689 made the verdict and the move ONE act, written in
    // one transaction by `POST /:jobId/reviews`, and only from `qc_submitted`.
    // So this asserts the rule that replaced it, on the job the vendor has just
    // started. The full QC round trip is `production-pipeline.spec.ts`'s.
    await page.goto(`/admin/production/${jobAId}`, { waitUntil: 'networkidle' })

    // The vendor's move landed on our side too — one status, two screens.
    await expect(page.getByTestId('admin-production-status-received')).toBeVisible()
    await expect(page.getByTestId('admin-production-status')).toHaveCount(0)
    await expect(page.getByTestId('admin-production-reviews-empty')).toBeVisible()

    // No verdict edge leaves `received`, so the form is not merely disabled —
    // it is not offered, and the screen says why rather than vanishing.
    await expect(page.getByTestId('admin-production-review-unavailable')).toBeVisible()
    await expect(page.getByTestId('admin-production-review-form')).toHaveCount(0)
    await expect(page.getByTestId('admin-production-review-submit')).toHaveCount(0)

    // And the transition panel offers exactly the matrix's admin edges out of
    // `received`, which is `cancelled` and nothing else. `qc_submitted` is the
    // vendor's; the two verdicts are reachable only through a review; `sent` is
    // retired. A button for any of them would be a screen promising a 409.
    const transitions = page.getByTestId('admin-production-transitions')
    await expect(transitions).toBeVisible()
    await expect(page.getByTestId('admin-production-transition-to-cancelled')).toBeVisible()
    await expect(page.getByTestId('admin-production-transition-to-qc_passed')).toHaveCount(0)
    await expect(page.getByTestId('admin-production-transition-to-qc_failed')).toHaveCount(0)
    await expect(page.getByTestId('admin-production-transition-to-qc_submitted')).toHaveCount(0)
    await expect(page.getByTestId('admin-production-transition-to-sent')).toHaveCount(0)
  })

  test('admin records the settlement and the payable drops to zero', async ({
    page,
  }) => {
    await page.goto(`/admin/vendors/${vendorA.id}`, { waitUntil: 'networkidle' })
    await page.getByTestId('vendor-tab-payables').click()

    await expect(page.getByTestId('vendor-payables-total')).toHaveText(
      rateADisplay
    )
    await expect(page.getByTestId(`vendor-payable-row-${jobAId}`)).toBeVisible()
    // The other vendor's job is on the other vendor's ledger.
    await expect(page.getByTestId(`vendor-payable-row-${jobBId}`)).toHaveCount(0)
    await expect(page.getByTestId('vendor-settlement-amount')).toHaveValue(
      rateAAmount
    )

    await page.getByTestId('vendor-settlement-reference').fill(`NEFT-${RUN}`)

    // Two-step, inline. Reaching the confirm panel at all is the proof that no
    // native dialog guards this path.
    await page.getByTestId('vendor-settlement-submit').click()
    const confirmPanel = page.getByTestId('vendor-settlement-confirm-panel')
    await expect(confirmPanel).toBeVisible()
    await expect(confirmPanel).toContainText(`Record ${rateADisplay} against 1 job?`)
    await page.getByTestId('vendor-settlement-confirm').click()

    await expect(page.getByTestId('vendor-settlement-error')).toHaveCount(0)
    await expect(page.getByTestId('vendor-settlement-success')).toContainText(
      `Recorded ${rateADisplay} against 1 job.`
    )
    await expect(page.getByTestId('vendor-payables-empty')).toBeVisible()
    await expect(page.getByTestId('vendor-payables-total')).toHaveText('₹0.00')

    // And the directory agrees — the owed column is derived from the same
    // rows, so a settled vendor owes nothing there too.
    await page.goto('/admin/vendors?page=1&pageSize=100', {
      waitUntil: 'networkidle',
    })
    await expect(page.getByTestId(`admin-vendor-row-${vendorA.id}`)).toContainText(
      '₹0.00'
    )
  })

  // --------------------------------------------------------------------------
  // The first refusal. In this block because the session it needs is the one
  // the run just created — there is no seeded vendor login.
  // --------------------------------------------------------------------------

  test('a vendor session at /admin gets Access Denied', async ({ browser }) => {
    const context = await browser.newContext({ storageState: VENDOR_AUTH })
    const page = await context.newPage()

    try {
      await page.goto('/admin', { waitUntil: 'networkidle' })

      await expect(
        page.getByRole('heading', { name: 'Access Denied' })
      ).toBeVisible()
      await expect(page.getByText("You don't have permission to access the admin panel.")).toBeVisible()
      // Not merely unstyled — no admin navigation is rendered at all.
      await expect(page.getByRole('link', { name: 'Vendors' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

// ============================================================================
// The second refusal — a seeded session, so it stands on its own
// ============================================================================

test.describe('content manager cannot see what we pay vendors', () => {
  test.use({ storageState: CONTENT_MANAGER_AUTH })

  test('a content-manager session at /admin/vendors gets Access Denied', async ({
    page,
  }) => {
    // The same session can reach the catalogue, so this is a section refusal
    // and not a broken login.
    await page.goto('/admin/products', { waitUntil: 'networkidle' })
    await expect(page.getByText('Access Denied')).toHaveCount(0)

    await page.goto('/admin/vendors', { waitUntil: 'networkidle' })

    await expect(
      page.getByRole('heading', { name: 'Access Denied' })
    ).toBeVisible()
    await expect(page.getByTestId('admin-vendors-table')).toHaveCount(0)
    await expect(page.getByTestId('admin-vendors-empty')).toHaveCount(0)
  })
})
