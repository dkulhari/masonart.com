/**
 * PaymentButton's payment target, pinned at compile time.
 *
 * The button used to require `orderData`. Supporting gift card purchases made
 * it optional, because a gift card order already exists by the time the button
 * renders — and TypeScript then enforced neither. A caller passing both, or
 * neither, compiled fine and hit `throw new Error('Could not determine which
 * order to pay for')` after the customer had already clicked Pay (#576).
 *
 * These are type assertions, not behaviour: each `@ts-expect-error` FAILS the
 * run if the line it guards stops being an error. Run with
 * `bun run test:types` (`vitest typecheck`).
 */

import { describe, test, expectTypeOf } from 'vitest'
import type { ComponentProps } from 'react'

import { PaymentButton } from '~/components/checkout/PaymentButton'
import type { OrderInput } from '~/lib/api'

type Props = ComponentProps<typeof PaymentButton>

const orderData = {} as OrderInput

const common = {
  totalAmount: 1000,
  onSuccess: (_orderId: string, _orderNumber: string) => {},
  onError: (_error: string) => {},
}

describe('PaymentButton payment target', () => {
  test('takes cart order input, as checkout passes', () => {
    const fromCart: Props = { ...common, orderData }

    expectTypeOf(fromCart).toExtend<Props>()
  })

  test('takes an order that already exists, as /gift-cards passes', () => {
    const alreadyCreated: Props = { ...common, existingOrderId: 'order-1' }

    expectTypeOf(alreadyCreated).toExtend<Props>()
  })

  test('lets gift card codes ride along with either arm', () => {
    const withCodes: Props = {
      ...common,
      orderData,
      giftCardCodes: ['ABCDEFGH12345678'],
    }
    const codesOnExisting: Props = {
      ...common,
      existingOrderId: 'order-1',
      giftCardCodes: ['ABCDEFGH12345678'],
    }

    expectTypeOf(withCodes).toExtend<Props>()
    expectTypeOf(codesOnExisting).toExtend<Props>()
  })

  test('rejects neither — there would be nothing to pay for', () => {
    // @ts-expect-error - one of orderData or existingOrderId is required
    const nothingToPay: Props = { ...common }

    void nothingToPay
  })

  test('rejects both — the component would silently drop one', () => {
    // @ts-expect-error - orderData and existingOrderId are mutually exclusive
    const bothTargets: Props = { ...common, orderData, existingOrderId: 'o-1' }

    void bothTargets
  })

  test('rejects an explicit undefined, which is still nothing to pay for', () => {
    // @ts-expect-error - undefined satisfies neither arm
    const undefinedTarget: Props = { ...common, orderData: undefined }

    void undefinedTarget
  })
})

