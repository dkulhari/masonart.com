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
