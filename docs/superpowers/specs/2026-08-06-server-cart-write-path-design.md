# The server cart write path

**Date:** 2026-08-06
**Status:** design approved, pending implementation plan
**Closes:** ticket `the-web-app-never-writes-to-the-server-cart` (`plan/tracker-data/todo/feature-cart-checkout/ticket-0511-*.yaml`, critical) — identify it by title, not number; numbers collided on 2026-08-06 under concurrent sessions.
**Features:** `cart-checkout`

---

## 1. Problem

The storefront keeps its cart in a Zustand store persisted to `localStorage`. A complete server cart also exists. **Nothing connects them**, and order creation reads only the server one.

| Evidence | State |
|---|---|
| `packages/web/app/stores/cart.ts:199` | `persist(...)` — every cart write the customer makes lands in `localStorage` and nowhere else |
| `packages/web/app/hooks/useCart.ts:185,267,342,402,462` | `useAddToCart`, `useUpdateCartItem`, `useRemoveFromCart`, `useClearCart`, `useMergeCart` — zero call sites outside their own definitions and `tests/hooks/useCart.test.tsx` |
| `packages/web/app/lib/api.ts:919-1010` | `cartApi.addItem/updateItem/removeItem/clear/merge` — only caller is `hooks/useCart.ts` |
| `packages/web/app/routes/cart/index.tsx:235` | `useServerCart` — the single live read of the server cart, added during the sale work, used only to compute promotion savings |
| `packages/api/src/routes/orders.ts:403-415` | `POST /api/orders` builds the order from `carts`/`cartItems` by `userId`, ignoring any client line items |

So the basket order creation reads is always empty. It does not silently produce a zero-item order — `orders.ts:418` returns 404 `"No active cart found"`, `orders.ts:424` returns 400 `"Cart is empty"`. **Authenticated checkout fails outright at order creation.**

Two further consequences of the same gap:

- The cart page's sale savings (`cart/index.tsx:235-244`) are computed over a server cart that has no lines, so promotion savings never display.
- `tests/e2e/payment.spec.ts:161` fulfils `POST /api/orders` from a `page.route` stub, and the API route suites mock `db`. Nothing in the test estate exercises the real path, which is why this survived.

The bug predates the sale-promotions work. That work only made it visible, by putting server-resolved pricing on `GET /api/cart`.

---

## 2. Why the server cart wins

The server cart is what order creation, price re-resolution (`orders.ts:443-450`), the gallery-member gate and guest-session merging all already assume. It is also the only side that can be trusted with money: prices come out of the database, never off the request.

The `localStorage` cart is the side that has no authority over anything. It becomes a cache.

**Existing baskets do not need migrating.** The product has not been released. On first load the store is overwritten by `GET /api/cart`; stale `localStorage` items simply lose. No migration code, no partial-migration states.

---

## 3. Decisions taken

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Failure semantics | Server wins — optimistic local write, rollback on rejection | The two carts can then never disagree about what checkout will read. Silent divergence is the class of bug being fixed; a design that permits it fails on its own terms |
| 2 | Store's role | Projection of the server cart; `item.id === cartItems.id` | Removes the identity-mapping problem entirely. The server payload already carries every field the local `CartItem` displays (`cart.ts:337-395`) |
| 3 | Legacy `localStorage` baskets | Dropped | Unreleased product, no real baskets to protect |
| 4 | Guest merge | Server-side, automatic | The guest session id lives in an httpOnly cookie and `GET /api/cart` never returns it (`cart.ts:465-486`), so `POST /api/cart/merge` is uncallable from a browser as written |
| 5 | Write transport | Store-level, through `useCartActions` | The TanStack mutation hooks implement optimistic rollback against the query cache. Two optimistic layers over one resource is a defect generator |
| 6 | Mutation responses | Left alone; refetch `GET /api/cart` after each write | Responses carry `{ message, item }` only (`cart.ts:681`, `:801`) — no relations, no sale pricing. Optimistic local write already hides the extra round trip |

---

## 4. Architecture

### 4.1 Write path

```
useCartActions().addItem(input)
  1. snapshot = store.items
  2. optimistic local mutation            (instant UI)
  3. await cartApi.addItem(input)         (credentials: "include")
  4. cart = await queryClient.fetchQuery({ queryKey: cartKeys.detail(),
                                           queryFn: cartApi.get })
  5. store.replaceFromServer(cart)

  on rejection at 3 or 4:
     store.items = snapshot
     store.syncError = message
```

Step 4 is one `GET`, not two: `fetchQuery` both returns the cart and writes it into the query cache, so `useServerCart` on the cart page sees the new savings without a separate `invalidateQueries` round trip.

It is also safe against staleness: every mutation handler calls `updateCartTotals`, which ends in `invalidateCartCache` (`cart.ts:314`), dropping both the member and guest cache keys (`cart.ts:198-207`).

Same shape for `updateQuantity`, `removeItem`, `clearCart`.

### 4.2 Store

`useCartStore` keeps state and nothing else:

- `items: CartItem[]`, where `id` is the server `cartItems.id`
- `replaceFromServer(serverCart)` — maps server lines to `CartItem`: title/slug/thumbnail from `product`, `sizeLabel`/dimensions from `variant`, `frameName`/`frameType` from `frame`, numeric prices parsed from the server's decimal strings
- the optimistic local mutators used by `useCartActions`
- `syncError: string | null`
- `isDrawerOpen` and its actions, unchanged
- `persist` retained, first paint only; `useCartHydration` unchanged (`Header.tsx:81`, `cart/index.tsx:205`)

Deleted as dead: `updateFrame`, `getItemTotal`, `findExistingItem`.

### 4.3 `useCartActions`

Already the import used by `CartDrawer.tsx:60`, `cart/index.tsx:225` and `PaymentButton.tsx:138`. It becomes a real hook holding `useQueryClient()`, returning async `addItem` / `updateQuantity` / `removeItem` / `clearCart` with the signatures those call sites already pass.

`ProductDetail.tsx:163` and `ChooseOptions.tsx:285` move from `useCartStore(s => s.addItem)` to `useCartActions().addItem`.

### 4.4 Errors

The repo has no toast library — `ReviewToast` is bespoke. `syncError` is rendered by `CartDrawer`, which is already open at the moment of failure because adding forces it open (`stores/cart.ts:236-237`), and by the cart page.

Add-to-cart becomes network-dependent. Out-of-stock surfaces at add time (`cart.ts:557`) rather than silently at checkout. That is the intended consequence of decision 1, not a side effect.

### 4.5 Checkout

`PaymentButton.tsx:138` calls `clearCart()` after a successful payment. That becomes a **local-only** reset plus query invalidation: `orders.ts:542-560` has already deleted the purchased lines server-side, so `DELETE /api/cart` would be a redundant round trip that could also remove lines added after the order was placed.

### 4.6 Guest merge

New middleware in `packages/api/src/routes/cart.ts`, registered immediately after `optionalAuth` (`cart.ts:407`):

```
cartApp.use("*", optionalAuth)
cartApp.use("*", mergeGuestCartOnAuth)   // user && GUEST_CART_COOKIE
                                         //   -> mergeGuestCartInto(user.id, sessionId)
                                         //   -> invalidate both carts' caches
                                         //   -> deleteCookie(GUEST_CART_COOKIE)
```

The merge body is extracted verbatim from the existing `POST /api/cart/merge` handler (`cart.ts:932-1020`) into `mergeGuestCartInto(userId, sessionId)`. Quantity-summing on matching `(productId, variantId, frameId, isSavedForLater)` and the cart-total recalculation are unchanged.

Deleted: `POST /api/cart/merge`, `mergeCartSchema`, `cartApi.merge`, `useMergeCart`.

The middleware runs on cart routes only. A user who logs in and goes straight to checkout is still covered, because the checkout page reads the cart. Running the same middleware on `orders` would make it airtight; deliberately deferred (§7).

---

## 5. Deletions

`hooks/useCart.ts` loses `useAddToCart`, `useUpdateCartItem`, `useRemoveFromCart`, `useClearCart`, `useIsCartSyncing`, `useMergeCart`, and the mutation-context type. `useServerCart` stays as the only server read — the cart page's savings display keeps working, now against a cart that has lines in it.

`tests/hooks/useCart.test.tsx` loses the corresponding suites.

This deviates from ticket step 3, which assumed the mutation hooks would become the call sites. Decision 5 records why.

---

## 6. Testing

| Level | Test | Notes |
|---|---|---|
| Store unit | `replaceFromServer` maps a server payload to `CartItem[]` — ids, parsed prices, frame and variant fields | Pure |
| Store unit | Optimistic write then rejected `cartApi` call restores the snapshot and sets `syncError` | `cartApi` mocked |
| API integration | `mergeGuestCartOnAuth`: guest cart + authenticated request folds lines into the user cart, sums quantities on a matching line, clears the cookie | **Real database** |
| API integration | Add a line through the cart route, then `POST /api/orders`, assert the order contains it | **Real database.** Ticket step 1. The existing route suites mock `db`, which is precisely why the bug survived |
| E2E | Add to cart, reload, item persists — with no stub on the cart routes | `tests/e2e/payment.spec.ts:161` stubs `POST /api/orders` wholesale and stays as is, but can no longer be the only coverage of this path |

**Database hazard.** `packages/api/tests/setup.ts:15` defaults `DATABASE_URL` to port 5433, which is a different application. chobii is on **5440**. A suite whose `beforeAll` fails there is reported as *skipped*, not failed, which reads as green. Both integration tests above must be confirmed against 5440 with a real assertion count.

---

## 7. Out of scope

- Running `mergeGuestCartOnAuth` on the `orders` routes. Three lines, deferred to keep this change reviewable.
- Guest checkout. `ordersApp.use("*", requireAuth)` (`orders.ts:388`); the cart is guest-capable, checkout is not, and that stays true here.
- Changing the four mutation handlers to return the full priced cart (decision 6).
- Coupon codes, saved-for-later UI, and any cart display change beyond `syncError`.
