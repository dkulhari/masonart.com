/**
 * Promotion seeding for E2E specs (#438).
 *
 * Every promotion these helpers create goes in through the real admin write
 * path — `POST /api/admin/promotions` and friends — rather than through SQL.
 * A promotion written straight into the table would skip the validation, the
 * product/exclusion join rows and the `invalidateActivePromotions()` call that
 * makes an enable visible without a 60s wait, so a spec seeded that way can
 * pass against a write path that is broken.
 *
 * Auth reuses the admin storage state that `auth.setup.ts` writes to
 * `tests/.auth/admin.json`, so a spec can run in the plain `chromium` project
 * (no admin `storageState` on the browser context) and still seed. It does
 * mean `tests/.auth/admin.json` must exist: run the `setup` project once, or
 * drop `--no-deps`.
 *
 * The admin API lives on the API origin (default `http://localhost:3000`),
 * which is NOT Playwright's `baseURL` (the web app, `http://localhost:3001`).
 * Override with `E2E_API_URL` if yours differs.
 */

import {
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Written by `tests/e2e/auth.setup.ts`. */
export const ADMIN_STORAGE_STATE = path.join(
  __dirname,
  '..',
  '..',
  '.auth',
  'admin.json'
)

/**
 * The API origin, not the web origin.
 *
 * `||` rather than `??` on purpose: the repo ships `VITE_API_URL=` (empty) so
 * the production bundle makes same-origin calls, and an empty string here
 * would produce request URLs with no host at all.
 */
export const API_URL =
  process.env.E2E_API_URL || process.env.VITE_API_URL || 'http://localhost:3000'

// ============================================================================
// Types
// ============================================================================

export type DiscountType = 'percentage' | 'fixed'
export type ScopeType = 'all' | 'filter' | 'products'
export type CountdownMode = 'real' | 'rolling'

export interface PromotionScopeFilter {
  styles?: string[]
  subjects?: string[]
  rooms?: string[]
  isFeatured?: boolean
}

/**
 * What a spec chooses about a promotion. Everything is optional — the defaults
 * describe a plain, running, everyone-gets-it 25% sale.
 */
export interface PromotionSeed {
  name?: string
  headline?: string
  discountType?: DiscountType
  /** Percent for `percentage`, paise for `fixed`. */
  discountValue?: number
  scopeType?: ScopeType
  scopeFilter?: PromotionScopeFilter
  /** Pinned products, for `scopeType: 'products'`. */
  productIds?: string[]
  /** Excluded product ids. An exclusion beats every scope. */
  excludedProductIds?: string[]
  /** Defaults to false so seeded prices are unlocked for a guest viewer. */
  membersOnly?: boolean
  startsAt?: string | Date
  endsAt?: string | Date
  isEnabled?: boolean
  priority?: number
  perCustomerOrderLimit?: number
  /** Defaults to `real`, so `deadline` equals `endsAt` exactly. */
  countdownMode?: CountdownMode
  rollingWindowMinutes?: number
  rollingJitterMinutes?: number
}

/** A promotion as the admin routes serialize it. */
export interface AdminPromotion {
  id: string
  name: string
  headline: string
  discountType: DiscountType
  discountValue: number
  scopeType: ScopeType
  scopeFilter: PromotionScopeFilter | null
  membersOnly: boolean
  startsAt: string
  endsAt: string | null
  isEnabled: boolean
  isActive: boolean
  priority: number
  perCustomerOrderLimit: number | null
  countdownMode: CountdownMode
  rollingWindowMinutes: number
  rollingJitterMinutes: number
  createdAt: string
  updatedAt: string
  productIds: string[]
  excludedProductIds: string[]
}

/**
 * The storefront's view of the running promotion — `GET /api/promotions/active`.
 * Note `deadline`, the already-resolved countdown target; `endsAt` deliberately
 * never crosses this wire.
 */
export interface ActivePromotion {
  promotionId: string
  headline: string
  percentOff: number | null
  membersOnly: boolean
  deadline: string
}

// ============================================================================
// Internals
// ============================================================================

const iso = (value: string | Date): string =>
  (value instanceof Date ? value : new Date(value)).toISOString()

/** An admin-authenticated request context against the API origin. */
async function withAdminApi<T>(
  fn: (api: APIRequestContext) => Promise<T>
): Promise<T> {
  const api = await playwrightRequest.newContext({
    baseURL: API_URL,
    storageState: ADMIN_STORAGE_STATE,
  })
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

/** Fail loudly and legibly — a 401 here means the admin state went stale. */
async function expectOk(
  response: import('@playwright/test').APIResponse,
  what: string
): Promise<void> {
  if (response.ok()) return
  const body = await response.text()
  const hint =
    response.status() === 401 || response.status() === 403
      ? ` — the admin storage state at ${ADMIN_STORAGE_STATE} is missing or expired; run the Playwright \`setup\` project.`
      : ''
  throw new Error(
    `${what} failed: ${response.status()} ${response.statusText()} ${body}${hint}`
  )
}

/**
 * The full body a PATCH needs.
 *
 * `updatePromotionInputSchema` is the create schema, so PATCH is a replace and
 * not a partial merge: any field left out reverts to its default and any
 * omitted `productIds`/`excludedProductIds` wipes the join rows. Rebuilding the
 * whole body from the current row is what keeps a one-field edit from quietly
 * un-excluding a product.
 */
function toUpdateBody(
  current: AdminPromotion,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    name: current.name,
    headline: current.headline,
    discountType: current.discountType,
    discountValue: current.discountValue,
    scopeType: current.scopeType,
    ...(current.scopeFilter ? { scopeFilter: current.scopeFilter } : {}),
    productIds: current.productIds,
    excludedProductIds: current.excludedProductIds,
    membersOnly: current.membersOnly,
    startsAt: current.startsAt,
    ...(current.endsAt ? { endsAt: current.endsAt } : {}),
    isEnabled: current.isEnabled,
    priority: current.priority,
    ...(current.perCustomerOrderLimit !== null
      ? { perCustomerOrderLimit: current.perCustomerOrderLimit }
      : {}),
    countdownMode: current.countdownMode,
    rollingWindowMinutes: current.rollingWindowMinutes,
    rollingJitterMinutes: current.rollingJitterMinutes,
    ...overrides,
  }
}

// ============================================================================
// Public surface
// ============================================================================

/**
 * Create a promotion through the admin API and return it as serialized.
 *
 * Defaults: a 25%-off, everyone-eligible, whole-catalogue sale that started a
 * minute ago, runs for six hours, is already enabled, and uses the truthful
 * countdown so `deadline === endsAt`.
 */
export async function createPromotion(
  seed: PromotionSeed = {}
): Promise<AdminPromotion> {
  const now = Date.now()
  const body: Record<string, unknown> = {
    name: seed.name ?? `e2e-${now}-${Math.random().toString(36).slice(2, 8)}`,
    headline: seed.headline ?? 'E2E flash sale',
    discountType: seed.discountType ?? 'percentage',
    discountValue: seed.discountValue ?? 25,
    scopeType: seed.scopeType ?? 'all',
    membersOnly: seed.membersOnly ?? false,
    startsAt: iso(seed.startsAt ?? new Date(now - 60_000)),
    endsAt: iso(seed.endsAt ?? new Date(now + 6 * 60 * 60 * 1000)),
    isEnabled: seed.isEnabled ?? true,
    countdownMode: seed.countdownMode ?? 'real',
  }

  if (seed.scopeFilter) body.scopeFilter = seed.scopeFilter
  if (seed.productIds) body.productIds = seed.productIds
  if (seed.excludedProductIds) body.excludedProductIds = seed.excludedProductIds
  if (seed.priority !== undefined) body.priority = seed.priority
  if (seed.perCustomerOrderLimit !== undefined) {
    body.perCustomerOrderLimit = seed.perCustomerOrderLimit
  }
  if (seed.rollingWindowMinutes !== undefined) {
    body.rollingWindowMinutes = seed.rollingWindowMinutes
  }
  if (seed.rollingJitterMinutes !== undefined) {
    body.rollingJitterMinutes = seed.rollingJitterMinutes
  }

  return withAdminApi(async (api) => {
    const response = await api.post('/api/admin/promotions', { data: body })
    await expectOk(response, 'createPromotion')
    return (await response.json()) as AdminPromotion
  })
}

/** Every promotion the admin list returns, newest-highest-priority first. */
export async function listPromotions(): Promise<AdminPromotion[]> {
  return withAdminApi(async (api) => {
    const response = await api.get('/api/admin/promotions')
    await expectOk(response, 'listPromotions')
    return (await response.json()) as AdminPromotion[]
  })
}

/** One promotion by id, or null when it is gone. */
export async function getPromotion(id: string): Promise<AdminPromotion | null> {
  const all = await listPromotions()
  return all.find((promotion) => promotion.id === id) ?? null
}

/**
 * Push a promotion's window into the past so it stops being active.
 *
 * This is the *fast* expiry — the admin write invalidates the active-promotion
 * cache, so it takes effect on the next request. Use it when a spec needs a
 * post-sale world quickly. It is NOT the way to prove that expiry needs no
 * manual step: for that, let a short `endsAt` lapse on its own.
 */
export async function expirePromotion(
  target: string | AdminPromotion
): Promise<AdminPromotion> {
  const id = typeof target === 'string' ? target : target.id
  const current = typeof target === 'string' ? await getPromotion(id) : target
  if (!current) throw new Error(`expirePromotion: no promotion ${id}`)

  const endsAt = new Date(Date.now() - 1_000)
  // `endsAt > startsAt` is enforced server-side, so a promotion that was
  // seeded to start "now" needs its start dragged back too.
  const startsAt =
    new Date(current.startsAt) < endsAt
      ? new Date(current.startsAt)
      : new Date(endsAt.getTime() - 60_000)

  return withAdminApi(async (api) => {
    const response = await api.patch(`/api/admin/promotions/${id}`, {
      data: toUpdateBody(current, {
        startsAt: iso(startsAt),
        endsAt: iso(endsAt),
      }),
    })
    await expectOk(response, 'expirePromotion')
    return (await response.json()) as AdminPromotion
  })
}

/** Flip `isEnabled` through the dedicated enable/disable routes. */
export async function setPromotionEnabled(
  id: string,
  enabled: boolean
): Promise<AdminPromotion> {
  return withAdminApi(async (api) => {
    const response = await api.post(
      `/api/admin/promotions/${id}/${enabled ? 'enable' : 'disable'}`
    )
    await expectOk(response, `setPromotionEnabled(${enabled})`)
    return (await response.json()) as AdminPromotion
  })
}

/** Delete one promotion. A 404 is treated as already-gone, not an error. */
export async function deletePromotion(id: string): Promise<void> {
  await withAdminApi(async (api) => {
    const response = await api.delete(`/api/admin/promotions/${id}`)
    if (response.status() === 404) return
    await expectOk(response, 'deletePromotion')
  })
}

/**
 * Clear the promotion table.
 *
 * The "no promotion" leg of the lifecycle needs a guaranteed-empty world, and
 * promotions are global server state rather than per-test fixtures. This is a
 * shared dev database: run sale specs one at a time.
 */
export async function deleteAllPromotions(): Promise<void> {
  const all = await listPromotions()
  for (const promotion of all) {
    await deletePromotion(promotion.id)
  }
}

/**
 * Drop the Redis product-response cache.
 *
 * Enabling, editing or expiring a promotion calls `invalidateActivePromotions()`
 * and nothing else — the cached product *responses* are left alone, and they
 * carry the resolved `sale` block. `product-list:` entries live 300s and
 * `product:<slug>` entries 600s, so a grid or a PDP fetched before a promotion
 * changed keeps serving the old prices well past the change.
 *
 * For a spec that walks a promotion through its whole life that is fatal: the
 * same PDP is read in the "no sale" leg and again in the "on sale" leg, inside
 * one TTL. Purging here is fixture hygiene, the cache equivalent of truncating
 * a table between tests — it is NOT a step the storefront needs, and the specs
 * never use it to make a promotion take effect.
 *
 * Redis being absent is not an error: the app degrades to no caching and so
 * does this.
 */
/**
 * Just the slice of `ioredis` this needs. Typed structurally because the
 * package resolves from packages/api rather than from the repo root, so a
 * `typeof import('ioredis')` here would not resolve.
 */
interface RedisClient {
  connect(): Promise<void>
  keys(pattern: string): Promise<string[]>
  del(...keys: string[]): Promise<number>
  disconnect(): void
}

type RedisConstructor = new (
  url: string,
  options: Record<string, unknown>
) => RedisClient

export async function purgeProductCache(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380'

  // `ioredis` is a dependency of packages/api, not of the repo root where the
  // Playwright process runs, so resolve it the way that package would.
  const requireFromApi = createRequire(
    path.join(__dirname, '..', '..', '..', 'packages', 'api', 'package.json')
  )
  const imported = requireFromApi('ioredis')
  const Redis = (imported.default ?? imported) as RedisConstructor

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  })

  try {
    await client.connect()
    for (const pattern of ['product-list:*', 'product:*']) {
      const keys = await client.keys(pattern)
      if (keys.length > 0) await client.del(...keys)
    }
  } catch {
    // No Redis, no cache to purge.
  } finally {
    client.disconnect()
  }
}

/** What the storefront sees. `null` when nothing is running. */
export async function getActivePromotion(): Promise<ActivePromotion | null> {
  const api = await playwrightRequest.newContext({ baseURL: API_URL })
  try {
    const response = await api.get('/api/promotions/active')
    await expectOk(response, 'getActivePromotion')
    return (await response.json()) as ActivePromotion | null
  } finally {
    await api.dispose()
  }
}

/**
 * Wait until `GET /api/promotions/active` agrees there is nothing running.
 *
 * `getActivePromotions()` memoises the active rows for 60s, so a promotion that
 * lapses on its own — no admin write to invalidate the cache — stays visible
 * for up to that long. Polling here is just waiting out that TTL; it performs
 * no admin action, which is the point when the assertion is that expiry needs
 * no manual step.
 */
export async function waitForNoActivePromotion(
  timeoutMs = 120_000,
  pollMs = 2_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if ((await getActivePromotion()) === null) return
    if (Date.now() > deadline) {
      throw new Error(
        `Promotion still active after ${timeoutMs}ms — expected it to lapse on its own.`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
