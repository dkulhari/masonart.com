/**
 * Gift card seeding for E2E specs (#563).
 *
 * Cards are created through the real admin write path,
 * `POST /api/admin/gift-cards`, rather than through SQL. A row written
 * straight into the table would skip the opening ledger entry and the code
 * hashing, so a spec seeded that way could pass against an issue path that is
 * broken.
 *
 * That endpoint is also the only place in the system that hands back a
 * plaintext code — everywhere else only a hash is stored. It is what makes a
 * redemption spec possible at all without reading a real inbox.
 *
 * Auth reuses the admin storage state written by `auth.setup.ts`, matching
 * `helpers/promotions.ts`. The admin API lives on the API origin, not
 * Playwright's `baseURL`.
 */

import {
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test'

import { ADMIN_STORAGE_STATE, API_URL } from './promotions'

export interface SeededGiftCard {
  id: string
  /** The plaintext code. Returned once, by this endpoint only. */
  code: string
  amountPaise: number
}

async function adminContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: API_URL,
    storageState: ADMIN_STORAGE_STATE,
  })
}

/** Issues a card and returns its code. */
export async function seedGiftCard(
  amountPaise: number,
  reason = 'E2E fixture',
): Promise<SeededGiftCard> {
  const context = await adminContext()

  try {
    const response = await context.post('/api/admin/gift-cards', {
      data: { amountPaise, reason },
    })

    if (!response.ok()) {
      throw new Error(
        `Could not seed a gift card: ${response.status()} ${await response.text()}`,
      )
    }

    const body = (await response.json()) as {
      code: string
      giftCard: { id: string }
    }

    return { id: body.giftCard.id, code: body.code, amountPaise }
  } finally {
    await context.dispose()
  }
}

/**
 * Makes sure at least one delivery option exists.
 *
 * Checkout will not leave the delivery step without one, and a fresh dev
 * database has none — the seed does not create any. A spec that walks to the
 * payment step therefore fails on "No shipping options available", which says
 * nothing about the thing under test. Created through the admin write path
 * for the same reason cards are, and left in place: it is reference data, not
 * a fixture that a later run should trip over.
 */
export async function ensureShippingOption(): Promise<void> {
  const context = await adminContext()

  try {
    const existing = await context.get('/api/admin/shipping/options')
    if (existing.ok()) {
      const body = (await existing.json()) as {
        shippingOptions?: Array<{ isActive: boolean }>
      }
      if (body.shippingOptions?.some((option) => option.isActive)) return
    }

    const response = await context.post('/api/admin/shipping/options', {
      data: {
        name: 'Standard Delivery',
        carrier: 'E2E Carrier',
        description: 'Seeded so checkout can reach the payment step',
        baseCost: 0,
        estimatedDaysMin: 3,
        estimatedDaysMax: 7,
        isActive: true,
      },
    })

    if (!response.ok()) {
      throw new Error(
        `Could not seed a shipping option: ${response.status()} ${await response.text()}`,
      )
    }
  } finally {
    await context.dispose()
  }
}

/** Disables a card, so a spec can prove a dead code is refused. */
export async function disableGiftCard(id: string): Promise<void> {
  const context = await adminContext()

  try {
    const response = await context.post(`/api/admin/gift-cards/${id}/disable`)
    if (!response.ok()) {
      throw new Error(`Could not disable gift card ${id}: ${response.status()}`)
    }
  } finally {
    await context.dispose()
  }
}

/** What the card is worth now, straight from the admin detail endpoint. */
export async function giftCardBalancePaise(id: string): Promise<number> {
  const context = await adminContext()

  try {
    const response = await context.get(`/api/admin/gift-cards/${id}`)
    if (!response.ok()) {
      throw new Error(`Could not read gift card ${id}: ${response.status()}`)
    }

    const body = (await response.json()) as {
      giftCard: { balancePaise: number }
    }
    return body.giftCard.balancePaise
  } finally {
    await context.dispose()
  }
}
