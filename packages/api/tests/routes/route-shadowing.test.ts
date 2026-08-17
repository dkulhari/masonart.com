/**
 * Greedy `/:param` routes that swallow their siblings (#622, #624).
 *
 * `app.route("/api/admin", adminShipmentsApp)` mounted that router's
 * `GET /:id` at `GET /api/admin/:id`, which then matched every single-segment
 * admin path registered after it: `/api/admin/vendors`, `/api/admin/production`,
 * `/api/admin/returns` and `/api/admin/approvals` all answered
 * `400 Invalid shipment ID`. The vendor directory and the production queue were
 * dead in the running app, and no test noticed, because every suite mounts its
 * own router in isolation — the collision only exists in the composed app.
 *
 * So this suite asserts against the composed app's route table, and the rule is
 * order-aware on purpose: a `/:param` route is only a problem when it is
 * registered BEFORE a literal sibling at the same depth. Registering the
 * literals first is the normal, correct pattern — `/api/reviews/stats` and
 * `/api/reviews/media` both sit in front of `/api/reviews/:reviewId` and are
 * perfectly reachable. Flagging those would make this test noise, and noisy
 * tests get deleted.
 *
 * #624 step 5: check for other greedy top-level `:id` routes. The answer today
 * is none, so the real-app assertion is green from the start. That is what a
 * regression guard looks like; the detector's own teeth are proved separately,
 * against a synthetic app carrying the exact #622 shape.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import '../setup'

// ============================================================================
// Detector
// ============================================================================

interface RouteEntry {
  method: string
  path: string
}

interface Shadowed {
  method: string
  /** The greedy route, e.g. `/api/admin/:id`. */
  param: string
  /** The literal it swallows, e.g. `/api/admin/vendors`. */
  literal: string
}

/** The parent of a path, or null for a single-segment path. */
function parentOf(path: string): string | null {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? null : path.slice(0, cut)
}

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Literal routes matched by an earlier `/:param` sibling.
 *
 * `routes` must be in registration order — Hono's `app.routes` is, and the
 * order is the whole point: the first matching registration wins, so a param
 * route in front of a literal one hides it.
 */
export function findShadowedRoutes(routes: RouteEntry[]): Shadowed[] {
  const found: Shadowed[] = []

  routes.forEach((param, i) => {
    const segment = lastSegment(param.path)
    if (!segment.startsWith(':')) return
    const parent = parentOf(param.path)
    if (parent === null) return

    for (const literal of routes.slice(i + 1)) {
      if (literal.method !== param.method && param.method !== 'ALL') continue
      if (parentOf(literal.path) !== parent) continue

      const tail = lastSegment(literal.path)
      if (tail.startsWith(':') || tail === '' || tail === '*') continue

      found.push({ method: param.method, param: param.path, literal: literal.path })
    }
  })

  return found
}

// ============================================================================
// The detector's teeth
// ============================================================================

describe('findShadowedRoutes', () => {
  it('catches the #622 shape — a bare /:id mounted at a parent prefix', () => {
    const shipments = new Hono()
    shipments.get('/:id', (c) => c.text('shipment'))

    const vendors = new Hono()
    vendors.get('/', (c) => c.text('vendors'))

    const app = new Hono()
    app.route('/api/admin', shipments)
    app.route('/api/admin/vendors', vendors)

    const found = findShadowedRoutes(app.routes)

    expect(found).toContainEqual({
      method: 'GET',
      param: '/api/admin/:id',
      literal: '/api/admin/vendors',
    })
  })

  it('leaves literals-registered-first alone', () => {
    const reviews = new Hono()
    reviews.get('/stats', (c) => c.text('stats'))
    reviews.get('/:reviewId', (c) => c.text('review'))

    const app = new Hono()
    app.route('/api/reviews', reviews)

    expect(findShadowedRoutes(app.routes)).toEqual([])
  })

  it('does not confuse a different method for a collision', () => {
    const one = new Hono()
    one.get('/:id', (c) => c.text('one'))

    const two = new Hono()
    two.post('/', (c) => c.text('two'))

    const app = new Hono()
    app.route('/api/admin', one)
    app.route('/api/admin/vendors', two)

    expect(findShadowedRoutes(app.routes)).toEqual([])
  })
})

// ============================================================================
// The real app
// ============================================================================

describe('the composed app', () => {
  it('has no route hidden behind an earlier /:param sibling', async () => {
    const { app } = await import('../../src/index')

    const found = findShadowedRoutes(app.routes as RouteEntry[])

    expect(
      found,
      found.length === 0
        ? ''
        : `These paths are unreachable — an earlier /:param sibling matches first:\n` +
          found.map((f) => `  ${f.method} ${f.literal}  <-  ${f.param}`).join('\n')
    ).toEqual([])
  }, 30_000)
})
