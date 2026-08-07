/**
 * The free-shipping threshold, delivered to the storefront once.
 *
 * WHY THIS FILE EXISTS
 *
 * The threshold stopped being a build-time constant in #569 — it lives in
 * `shipping_config` and an admin can change it. That makes the *copy* the
 * dangerous half. "₹999" was written as literal text on ten customer-facing
 * surfaces, and an admin raising the charged threshold while those surfaces
 * kept promising ₹999 would manufacture exactly the false-advertising gap
 * commit 70bfa9dd closed: the site promised ₹999 on six surfaces while
 * checkout charged unless ₹2,000.
 *
 * So every surface reads the live value, and reads it from ONE delivery.
 *
 * ## Delivered once, in the root route
 *
 * `__root.tsx` fetches the threshold in `beforeLoad` and puts it in the router
 * context, the same way it already delivers the session. That is one request
 * per document, resolved before the first paint, on the server. It is
 * deliberately NOT better-auth's `useSession()` — that hook is `isPending`
 * through SSR, so anything gated on it flashes the wrong number first.
 *
 * ## Why a React context and not `useRouteContext` at each surface
 *
 * `useRouteContext({ from: '__root__' })` is the repo's idiom for reading root
 * context (Header.tsx, MobileTabBar.tsx, useGalleryMembership.ts) and it is
 * where this value comes from — but it hard-requires a RouterProvider, so any
 * component that reads it can only be tested by standing up a router or by
 * mocking the whole `@tanstack/react-router` module. Ten surfaces is too many
 * to pay that on, and a surface that is awkward to test is a surface whose
 * number quietly rots.
 *
 * The root route therefore reads its own context once and publishes it here.
 * Consumers get a plain hook with a safe default: the bundled
 * `FREE_SHIPPING_THRESHOLD`, which is also what the API falls back to when the
 * table is empty or unreachable. A surface rendered outside the provider
 * prints the same number the server would charge by, rather than throwing or
 * printing zero.
 */

import { createContext, useContext } from 'react'
import type * as React from 'react'
import {
  FREE_SHIPPING_THRESHOLD,
  freeShippingThresholdLabel,
} from '@chobii/shared'

/**
 * Default is the shared constant, not `null`/`0`: an unprovided tree must
 * still print the figure the server charges by. `0` would advertise free
 * shipping on everything.
 */
const FreeShippingThresholdContext = createContext<number>(
  FREE_SHIPPING_THRESHOLD
)

export function FreeShippingThresholdProvider({
  value,
  children,
}: {
  /** Rupees. `undefined` (a failed delivery) falls back to the constant. */
  value: number | undefined | null
  children: React.ReactNode
}) {
  return (
    <FreeShippingThresholdContext.Provider
      value={
        typeof value === 'number' && Number.isFinite(value)
          ? value
          : FREE_SHIPPING_THRESHOLD
      }
    >
      {children}
    </FreeShippingThresholdContext.Provider>
  )
}

/** The threshold in force, in whole rupees. Never paise — see #569. */
export function useFreeShippingThreshold(): number {
  return useContext(FreeShippingThresholdContext)
}

/**
 * The threshold as the copy prints it, e.g. `₹1,499`. Every customer-facing
 * mention of the number goes through this, so one page cannot show two
 * formattings of the same figure.
 */
export function useFreeShippingThresholdLabel(): string {
  return freeShippingThresholdLabel(useFreeShippingThreshold())
}
