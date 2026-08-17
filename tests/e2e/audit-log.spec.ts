/**
 * E2E: an admin action reaches the audit log, and the viewer can find it
 *
 * The unit tests prove each half — the handler calls `recordAudit`, the route
 * returns rows, the table renders them. This proves the wire between them: a
 * real admin session, a real refused privilege change, and the entry visible on
 * a real page a minute later.
 *
 * ## Why a REFUSED role change is the action under test
 *
 * It writes an audit row and changes nothing else. Every alternative — issuing a
 * card, archiving a product, refunding — leaves state behind in the shared dev
 * database that some other suite then trips over. A refusal is the one audited
 * event that is free to repeat, and it is also the event most worth proving is
 * recorded: "somebody tried and was told no" is invisible everywhere else.
 *
 * ## Repo hazards honoured here
 *
 * - **Vacuous passes.** `:5173` on this machine is a DIFFERENT app, and a spec
 *   pointed at it finds no matching elements and therefore fails nothing. The
 *   first test asserts the base URL really is this app, and every later
 *   assertion checks a non-zero count before asserting anything about content.
 * - **Serial**, and run this file alone: admin suites share one database and
 *   interfere.
 * - The API is reached through the SAME origin the browser uses, so a proxy
 *   pointed at the wrong API surfaces as a failure here rather than as a
 *   mystery later.
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ADMIN_AUTH = path.join(__dirname, '..', '.auth', 'admin.json')

test.describe('audit log', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: ADMIN_AUTH })

  let actorId = ''

  test('the base URL is really this app', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'networkidle' })

    // Not a formality: pointed at the wrong port this whole file passes
    // without asserting anything.
    await expect(page.locator('body')).toContainText(/dashboard|admin/i)
  })

  test('a refused privilege change is recorded', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'networkidle' })

    // Same origin as the page, so the request goes through whatever the browser
    // would use — a misconfigured proxy fails here rather than silently later.
    const session = await page.evaluate(async () => {
      const response = await fetch('/api/auth/get-session', { credentials: 'include' })
      return response.ok ? ((await response.json()) as { user?: { id?: string } }) : null
    })

    actorId = session?.user?.id ?? ''
    expect(actorId, 'the admin storage state did not produce a session').toBeTruthy()

    // An admin may not change their own role. The refusal is the audited event.
    const refusal = await page.evaluate(async (id: string) => {
      const response = await fetch(`/api/admin/customers/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: 'customer' }),
      })
      return { status: response.status, requestId: response.headers.get('x-request-id') }
    }, actorId)

    expect(refusal.status).toBe(403)
    // The correlation id is exposed through CORS so a support report can quote
    // it; if this is null the header or the expose list has regressed.
    expect(refusal.requestId).toBeTruthy()
  })

  test('the viewer shows the entry, and the privilege filter narrows to it', async ({
    page,
  }) => {
    await page.goto('/admin/audit-log', { waitUntil: 'networkidle' })

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15000 })

    const total = await rows.count()
    expect(total, 'the audit log rendered no rows at all').toBeGreaterThan(0)

    // The refusal from the previous test, by its action and its badge.
    const refusedRow = page.locator('tbody tr', { hasText: 'user.role_changed' }).first()
    await expect(refusedRow).toBeVisible()
    await expect(refusedRow).toContainText(/refused/i)

    // Filtering must actually filter: a filter that silently returns everything
    // is worse than none, because it reads as a clean history.
    await page.goto('/admin/audit-log?category=privilege', { waitUntil: 'networkidle' })
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 })

    const categories = await page.locator('tbody tr').allInnerTexts()
    expect(categories.length).toBeGreaterThan(0)
    for (const text of categories) {
      expect(text).toContain('privilege')
    }
  })

  test('the detail panel shows the request id and the client IP', async ({ page }) => {
    await page.goto('/admin/audit-log?category=privilege', { waitUntil: 'networkidle' })
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /view details/i }).first().click()

    const detail = page.getByTestId('audit-log-detail')
    await expect(detail).toBeVisible()
    // Both halves of an investigation: which request, and from where.
    await expect(detail).toContainText(/Request/i)
    await expect(detail).toContainText(/IP/i)
  })

  // Titles are static on purpose: Playwright re-resolves a test by its title in
  // the worker process, so a title built from Date.now() fails with "Test not
  // found in the worker process" rather than anything about the assertion.
  test('a content manager cannot read the audit log', async ({ browser }) => {
    const contentManagerAuth = path.join(__dirname, '..', '.auth', 'content-manager.json')
    const context = await browser.newContext({ storageState: contentManagerAuth })
    const page = await context.newPage()

    // Through the API rather than the screen: the enforcement that matters is
    // server-side, and the nav link is deliberately not hidden.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/admin/audit-log', { credentials: 'include' })
      return response.status
    })

    expect(status).toBe(403)

    await context.close()
  })
})
