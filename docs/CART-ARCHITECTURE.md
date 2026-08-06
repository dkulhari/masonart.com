# Cart architecture

**Status:** current as of 2026-08-07 (#511)
**Owns:** `packages/api/src/routes/cart.ts`, `packages/web/app/stores/cart.ts`, `packages/web/app/hooks/useCartActions.ts`, `packages/web/app/lib/cart-projection.ts`, `packages/web/app/components/cart/CartSync.tsx`, `packages/web/app/hooks/useCartAuthTransition.ts`

---

## 1. The rule

**The server cart is the cart.** The `carts` / `cartItems` rows are what `POST /api/orders` reads, what promotions price against, and what the customer is charged for. Everything on the client is a view of them.

The Zustand store is a *projection*: `item.id` **is** the server's `cartItems.id`. It is not an independent cart that syncs — it holds the server's rows, and any write that the server refuses is undone locally.

This is worth stating plainly because the codebase spent months in the opposite arrangement, and the failure was silent. See §11.

---

## 2. Shape

```
  PDP / quickview / drawer / cart page
                │
                ▼
        useCartActions            ← the only write path
         │            │
         │            └──► cartApi ──► POST/PATCH/DELETE /api/cart[/items]
         │                                        │
         ▼                                        ▼
   useCartStore  ◄── replaceFromServer ──  GET /api/cart
         ▲                                        ▲
         │                                        │
     CartSync ───────────────────────────────────┘
   (root-mounted, reads useServerCart)

   POST /api/orders ──► reads carts/cartItems directly. Never the client's numbers.
```

| Module | Responsibility |
|---|---|
| `lib/cart-projection.ts` | Pure mapping: `GET /api/cart` payload → `CartItem[]`. No React, no network. |
| `stores/cart.ts` | State only. Local mutators, `restore`, `replaceFromServer`, `syncError`, drawer open/closed. Knows nothing about the wire. |
| `hooks/useCartActions.ts` | Every write. Optimism, rollback, sequencing, pending-line bookkeeping. |
| `components/cart/CartSync.tsx` | Loads the server cart on arrival and after any refetch. Renders nothing. |
| `hooks/useCartAuthTransition.ts` | Drops cart state when the viewer changes. |
| `routes/cart.ts` (API) | The cart itself, its pricing, its cache, and the guest→user merge. |

---

## 3. The write path

Every action in `useCartActions` follows the same shape:

```
sequence = beginWrite()          // module-level monotonic counter
snapshot = store.items
apply the optimistic local mutation
   │
   ├─ success ─► applyIfCurrent(sequence)
   │                 if (!isCurrent) return          // superseded, drop it
   │                 cart = await fetchCart()
   │                 if (!isCurrent) return          // superseded while fetching
   │                 queryClient.setQueryData(cartKeys.detail(), cart)
   │                 store.replaceFromServer(cart)
   │
   └─ failure ─► recoverFromServer(sequence, snapshot, message)
                     re-read the server, project it, then set syncError
```

Three things here are load-bearing and each exists because of a specific bug:

**The sequence guard.** `beginWrite` / `isCurrent` are *module-level*, not per-hook-instance — every mounted consumer writes the same store, so the counter must be shared. Without it, two overlapping writes could settle in the wrong order: a slower earlier write re-projecting its stale payload over a newer one, or a rejected earlier write rolling back a line a later write legitimately added.

**Both writes sit behind the same check.** `applyIfCurrent` performs `setQueryData` *and* `replaceFromServer` after its second `isCurrent`, with no `await` between them. Guarding only the store leaves the query cache — which drives the cart page's savings figures and has a 60s `staleTime` — holding a superseded payload.

**Failure re-reads; it does not replay.** `recoverFromServer` fetches the server's current cart rather than restoring the snapshot. A snapshot captured at the start of a write already contains other in-flight writes' optimistic mutations, so replaying it can resurrect a line the server never had — or strand one it does have. If the recovery fetch itself fails, the snapshot *is* restored, but `syncError` says so ("please reload"), because a guess must be labelled as one.

Order matters at the end: `replaceFromServer` clears `syncError` unconditionally, so the message is set *after* it.

### Pending lines

An optimistic add mints a `pending`-prefixed id and registers a promise in `pendingAdds`, resolved with the real row id when the POST answers. A line still carrying a pending id has no server row to address, so:

- `removeItem(pendingId)` awaits the add, then issues the DELETE for the resolved id.
- `updateQuantity(pendingId, n)` does the same before its PATCH.

Without this, removing a just-added line looks like it worked and then the item reappears when the add lands — and gets ordered.

---

## 4. Reads

`useServerCart` (`hooks/useCart.ts`) is the **only** server read. `CartSync` subscribes to it, is mounted once at the root for all non-admin routes, and pushes each payload into the store.

`replaceFromServer` is idempotent: `itemsAreEqual` compares mapped items field by field — including `customizations` and `aiDetails` **by value, not reference** — and preserves the existing array identity when nothing changed. That matters because TanStack Query's default `structuralSharing` reallocates parent objects, so reference comparison silently fails for exactly the items this catalogue is built on (AI-generated posters, framed pieces). Without the value comparison, every cart write triggers a redundant re-render storm.

---

## 5. Money: who decides what

**The client never sends a price and the server never trusts one.**

| Figure | Where it is decided |
|---|---|
| Variant price | `productVariants.price`, read server-side per request |
| Frame markup | `frameAddition` in `packages/shared/src/constants/frames.ts` — one implementation, used by the PDP, the quickview, and both API write paths |
| Stored `lineTotal` | `(unitPrice + framePrice) × quantity`, base prices, written at add time |
| Sale price | Re-resolved on every read by `priceCartLine`; never stored |
| Order totals | Re-resolved again at `POST /api/orders` from the database |

**The frame formula:**

```
Math.round(unitPrice × max(0, priceModifier − 1)) + priceAddition
```

Frames carry their markup in `priceModifier` (1.33–1.40 in the seed); `priceAddition` is a flat add-on that currently defaults to `"0.00"`. Reading only the flat column quotes every frame at zero — which is precisely what the cart route did until #511, undercharging every framed order by the entire markup. It is rounded to the rupee *in the helper*, not at display time, so the number the CTA quotes is the number that reaches the cart and the order.

The sale never applies to the frame: `priceCartLine` discounts the artwork and leaves the frame at full price.

**Stored line totals stay base.** A cart left sitting across the end of a promotion reverts to base by itself, because the discount was never written down. The same property means a cart cannot carry a discount that no longer exists.

**Re-adding an existing line prices off the row's own stored `unitPrice`**, not the variant's current price — matching the PATCH path. A line honours the price it was added at, and the row stays reproducible from its own components.

---

## 6. Guest carts and the merge

A guest cart is identified by the **httpOnly** `cart_session` cookie. The browser cannot read it. That single fact drives the design:

`mergeGuestCartOnAuth` is middleware on `cartApp`, registered immediately after `optionalAuth`. On any cart request carrying both an authenticated user and the cookie, it folds the guest cart into the user's, invalidates both carts' caches, and deletes the cookie so it cannot run twice. A merge failure is logged and swallowed — one unmergeable guest cart must not break every cart read for that customer.

There is deliberately **no** `POST /api/cart/merge`. It existed for a long time and required a `guestSessionId` in the request body that no browser could ever obtain. It had zero call sites and could not have worked if it had any.

Matching is on `(productId, variantId, frameId, isSavedForLater)`; a match sums quantities rather than creating a second line.

---

## 7. Caching

`GET /api/cart` caches for 5 minutes under `cartCacheKey(cartId, isMember)` — **viewer-keyed**, because a gallery member and a guest see different prices for the same cart. Both variants are dropped together by `invalidateCartCache`; dropping one leaves the other serving pre-mutation state for the rest of the TTL.

Every mutating cart route ends in `updateCartTotals`, which invalidates. `POST /api/orders` empties the cart inside its transaction and calls the same exported `invalidateCartCache` afterwards — without it, the post-payment refetch is served the pre-order payload and the customer's just-purchased items reappear in the drawer.

---

## 8. Auth transitions

`useCartAuthTransition` must be called on **every** path that establishes or ends a session — email sign-in, social, OTP, registration, sign-out:

- `onSignedIn` invalidates `cartKeys.all`, which makes `CartSync` refetch, which is what actually runs the merge middleware.
- `onSignedOut` clears the local store and *removes* the queries.

Both halves are necessary. Without the first, a guest who signs in at checkout never triggers the merge and gets "No active cart found" — the original bug, reached by a different route. Without the second, one account's cart is visible to the next person signing in on the same browser.

Password reset and forgot-password are correctly **not** wired: they establish no session.

---

## 9. Invariants

Break any of these and the cart starts lying:

1. Anything the customer adds reaches `cartItems` before `POST /api/orders` reads it.
2. `item.id` in the store is the server's row id — never a client-minted id, except transiently as a `pending` placeholder.
3. No price ever travels client → server. Not in the cart, not at checkout.
4. One frame formula. Three surfaces quote it; two write paths store it.
5. A rejected write leaves the client showing what the server holds — by re-reading, not by replaying.
6. Cache invalidation drops both viewer variants, together.
7. `syncError` is set after any projection, never before.

---

## 10. Tests

| Level | File | What it protects |
|---|---|---|
| Unit | `tests/lib/cart-projection.test.ts` | The mapping, including `createdAt` → `addedAt` |
| Unit | `tests/stores/cart-projection-store.test.ts`, `cart-replaceFromServer-idempotent.test.tsx` | Projection, rollback, identity preservation |
| Unit | `tests/hooks/useCartActions.test.tsx` | Optimism, rollback, sequencing, pending lines |
| Unit | `tests/hooks/auth-cart-transition.test.tsx` | Every session entry point |
| API | `tests/routes/cart-frame-pricing.test.ts` | Frame markup reaches the row and the order |
| API | `tests/routes/cart-guest-merge.test.ts` | Merge arithmetic and middleware wiring |
| API | `tests/routes/order-cart-cache.test.ts` | The order busts the cart cache |
| **E2E** | `tests/e2e/cart-server-persistence.spec.ts` | **Real API, real database, no stubs** |

The E2E spec is the one that matters most and the only one that would have caught the original bug. Every API route suite mocks `db`, and `tests/e2e/payment.spec.ts` stubs `POST /api/orders` outright — which is exactly how a cart that was never written to the server survived to production-ready. **Do not let that spec become the only place a cart write is asserted, and do not add stubs to it.**

---

## 11. How this broke before

Worth keeping, because the failure mode was invisible rather than loud.

The storefront kept its cart in a Zustand store persisted to `localStorage` and **never wrote to the server cart at all**. A complete server cart existed, with five TanStack mutation hooks carrying full optimistic-rollback logic — and **zero call sites**. `POST /api/orders` built the order from the database cart, which was always empty, so authenticated checkout failed with "No active cart found", and the cart page's sale savings were always zero because they were computed over a cart with no lines.

It survived because every API route suite mocks `db`, every store test exercised Zustand alone, and the payment E2E stubbed order creation. Nothing in the estate ever exercised the real path. One of the hooks' types even declared an `addedAt` field for a column that has never existed (`created_at`) — a detail that could only survive in code that never ran.

Making the server cart authoritative then *activated* a dormant pricing bug that had been unbillable while no order could be created: the cart route read a frame's flat `priceAddition` (seeded `"0.00"`) and ignored `priceModifier`, so every framed order would have charged the unframed price.

---

## 12. Known gaps

- **#565** — sign-out error handling diverges between `account/index.tsx` and `AdminSidebar.tsx`.
- **#566** — the PDP drops `priceAddition` when mapping frame options, so a frame with a non-zero flat add-on would be quoted low there while the quickview and server charge it correctly. Not live (no admin write path for frames yet); **must close before frames become editable**.
- **#567** — assorted cleanup: `ServerCartPayload` is narrower than the real response (which is why `routes/cart/index.tsx` still needs a `PricedCart` cast), dead exports left in `hooks/useCart.ts`, doc comments that now assert the opposite of reality, a missing E2E for the savings row, a guest cookie deleted even when the merge fails, unserialised concurrent merges, and the dead `packages/web/src/` tree whose 50 green tests cover nothing that ships.
