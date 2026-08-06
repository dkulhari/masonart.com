# Server Cart Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server cart the cart, so `POST /api/orders` builds an order from what the customer actually added.

**Architecture:** The Zustand store becomes a projection of `GET /api/cart` — `item.id` *is* `cartItems.id`. A new `useCartActions` hook owns every write: optimistic local mutation, then `cartApi.*`, then refetch and re-project; a rejection restores the pre-write snapshot and sets `syncError`. Guest-to-user cart merging moves into middleware on the API's cart routes, because the guest session id lives in an httpOnly cookie the browser cannot read.

**Tech Stack:** TanStack Start + TanStack Query v5, Zustand v5 (`persist`), Hono + Drizzle, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-06-server-cart-write-path-design.md`
**Ticket:** `plan/tracker-data/todo/feature-cart-checkout/ticket-0511-the-web-app-never-writes-to-th.yaml` — identify by title, not number.

## Global Constraints

- Two web trees exist. **`packages/web/app/` is live** (`~` alias). `packages/web/src/` is dead — nothing in `app/` imports it. Never add to `src/`, never "fix" its tests.
- `packages/web/tests/stores/cart.test.ts` tests the dead `src/` store. Leave it alone. Model new store tests on `packages/web/tests/stores/cart-drawer.test.ts`, which tests the live store.
- Node 25 exposes an inert global `localStorage` that shadows jsdom's, and `persist` captures storage at module init. Every test touching the live store must install the stub in `vi.hoisted`, above the import — copy the block from `cart-drawer.test.ts:12-30`.
- Never run `prettier` in this repo. It has no config; defaults rewrite whole files away from the single-quote/no-semi style.
- Web tests run from `packages/web`; API tests from `packages/api`; Playwright from the repo root.
- Commit style: conventional commits, `Implements #511` in the body, and the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- The API's `db` is mocked in every `tests/routes/` suite. That is the convention; follow it. **Deviation from spec §6:** the spec called for two new API integration tests against a real database on port 5440. There is no non-destructive real-database harness in this repo — `tests/database/` suites DROP tables and are gated behind a disposable `_test` URL (`packages/api/tests/helpers/destructive-db.ts`). Building one is its own piece of work. The real-database proof therefore comes from Task 7's Playwright spec, which talks to the real API and the real database and stubs nothing. If you want the API-level integration tests as well, that is a follow-up ticket, not a silent omission.
- Shared 8-core box, many concurrent agents. Run single test files, not whole suites, unless verifying at the end.

---

## File Structure

**Create:**
- `packages/web/app/lib/cart-projection.ts` — pure server-payload → `CartItem[]` mapping. No React, no network.
- `packages/web/app/hooks/useCartActions.ts` — the single cart write path.
- `packages/web/app/components/cart/CartSync.tsx` — mounts the server cart into the store on load.
- `packages/web/tests/lib/cart-projection.test.ts`
- `packages/web/tests/hooks/useCartActions.test.tsx`
- `packages/web/tests/stores/cart-projection-store.test.ts`
- `packages/api/tests/routes/cart-guest-merge.test.ts`
- `tests/e2e/cart-server-persistence.spec.ts`

**Modify:**
- `packages/web/app/stores/cart.ts` — state only: local mutators, `restore`, `replaceFromServer`, `syncError`. Loses `useCartActions`, `updateFrame`, `getItemTotal`, `findExistingItem`.
- `packages/web/app/hooks/useCart.ts` — keeps `useServerCart`, `cartKeys`, and the payload types. Loses all five mutation hooks and `useIsCartSyncing`.
- `packages/web/app/lib/api.ts` — loses `cartApi.merge`.
- `packages/web/app/components/product/ProductDetail.tsx:163`, `packages/web/app/components/product/ChooseOptions.tsx:285` — switch to `useCartActions`.
- `packages/web/app/components/cart/CartDrawer.tsx`, `packages/web/app/routes/cart/index.tsx` — import from the new hook, render `syncError`.
- `packages/web/app/components/checkout/PaymentButton.tsx:138,204` — local-only reset.
- `packages/web/app/routes/__root.tsx` — mount `<CartSync />`.
- `packages/api/src/routes/cart.ts` — extract `mergeGuestCartInto`, add `mergeGuestCartOnAuth`, delete `POST /merge`.
- `packages/web/tests/hooks/useCart.test.tsx` — drop the deleted hooks' suites.

---

### Task 1: Server payload → CartItem projection

The pure mapping, alone and testable. Everything later depends on it.

Two details the existing code gets wrong and this must get right: the server column is **`createdAt`**, not `addedAt` (`packages/api/src/database/schema/cart.ts:153`) — the `ServerCartItem` interface in `hooks/useCart.ts:63` says `addedAt`, which is proof those hooks never ran. And `unitPrice`/`framePrice` arrive as decimal **strings**, while `CartItem` holds numbers.

**Files:**
- Create: `packages/web/app/lib/cart-projection.ts`
- Test: `packages/web/tests/lib/cart-projection.test.ts`

**Interfaces:**
- Consumes: `CartItem` (type-only import from `~/stores/cart`; type-only so there is no runtime cycle when the store imports this module).
- Produces:
  - `interface ServerCartLine` — one line of `GET /api/cart`
  - `interface ServerCartPayload { id: string; itemCount: number; subtotal: string; items: ServerCartLine[]; savedForLater: ServerCartLine[]; savingTotal: string }`
  - `function toCartItems(cart: ServerCartPayload): CartItem[]`

- [ ] **Step 1: Write the failing test**

`packages/web/tests/lib/cart-projection.test.ts`:

```ts
/**
 * The projection from `GET /api/cart` to the store's `CartItem`.
 *
 * The store's items ARE the server's rows: `item.id` is `cartItems.id`, so
 * update and remove can address a line without any client-side mapping.
 */

import { describe, it, expect } from 'vitest'
import { toCartItems, type ServerCartPayload } from '~/lib/cart-projection'

const payload: ServerCartPayload = {
  id: 'cart-1',
  itemCount: 2,
  subtotal: '5000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: 'frame-1',
      quantity: 2,
      unitPrice: '2000.00',
      framePrice: '500.00',
      lineTotal: '5000.00',
      customizations: { matWidth: 2 },
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T06:00:00.000Z',
      product: {
        id: 'prod-1',
        title: 'Blue Hour',
        slug: 'blue-hour',
        images: [{ url: '/img/blue.jpg', thumbnailUrl: '/img/blue-thumb.jpg' }],
      },
      variant: {
        id: 'var-1',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
      frame: { id: 'frame-1', name: 'Oak', type: 'wood' },
    },
  ],
}

describe('toCartItems', () => {
  it('uses the server row id as the item id', () => {
    expect(toCartItems(payload)[0].id).toBe(
      '11111111-1111-1111-1111-111111111111'
    )
  })

  it('parses decimal strings into numbers', () => {
    const [item] = toCartItems(payload)
    expect(item.unitPrice).toBe(2000)
    expect(item.framePrice).toBe(500)
  })

  it('reads the timestamp from createdAt, which is the column that exists', () => {
    expect(toCartItems(payload)[0].addedAt).toBe('2026-08-06T06:00:00.000Z')
  })

  it('denormalises product, variant and frame for offline display', () => {
    const [item] = toCartItems(payload)
    expect(item.productTitle).toBe('Blue Hour')
    expect(item.productSlug).toBe('blue-hour')
    expect(item.thumbnailUrl).toBe('/img/blue-thumb.jpg')
    expect(item.sizeLabel).toBe('24x36 inches')
    expect(item.widthInches).toBe(24)
    expect(item.frameName).toBe('Oak')
    expect(item.frameType).toBe('wood')
  })

  it('falls back to the full-size image when there is no thumbnail', () => {
    const noThumb: ServerCartPayload = {
      ...payload,
      items: [
        {
          ...payload.items[0],
          product: {
            ...payload.items[0].product!,
            images: [{ url: '/img/blue.jpg' }],
          },
        },
      ],
    }
    expect(toCartItems(noThumb)[0].thumbnailUrl).toBe('/img/blue.jpg')
  })

  it('survives a line whose relations did not load', () => {
    const bare: ServerCartPayload = {
      ...payload,
      items: [
        {
          ...payload.items[0],
          product: undefined,
          variant: undefined,
          frame: undefined,
        },
      ],
    }
    const [item] = toCartItems(bare)
    expect(item.productTitle).toBe('')
    expect(item.frameName).toBeUndefined()
    expect(item.widthInches).toBe(0)
  })

  it('ignores saved-for-later lines, which the cart does not show', () => {
    const withSaved: ServerCartPayload = {
      ...payload,
      savedForLater: [{ ...payload.items[0], id: 'saved-1' }],
    }
    expect(toCartItems(withSaved)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && npx vitest run tests/lib/cart-projection.test.ts
```

Expected: FAIL — `Failed to resolve import "~/lib/cart-projection"`.

- [ ] **Step 3: Write the implementation**

`packages/web/app/lib/cart-projection.ts`:

```ts
/**
 * `GET /api/cart` → the store's items.
 *
 * The server cart is the cart (#511). Its rows are what checkout reads, so the
 * store holds those rows verbatim — `item.id` is `cartItems.id` — and every
 * update or removal addresses a line by the id the server gave it.
 *
 * The mapping is here rather than in the store so it can be tested as the pure
 * function it is, and so the store keeps no knowledge of the wire format.
 */

import type { CartItem } from '~/stores/cart'

interface ServerImage {
  url: string
  thumbnailUrl?: string
}

export interface ServerCartLine {
  id: string
  productId: string
  variantId: string
  frameId: string | null
  quantity: number
  /** Decimal string, e.g. "2000.00". */
  unitPrice: string
  framePrice: string
  lineTotal: string
  customizations: CartItem['customizations'] | null
  isAiGenerated: boolean
  aiDetails: CartItem['aiDetails'] | null
  isSavedForLater: boolean
  /** The column is `created_at`; there is no `added_at`. */
  createdAt: string
  product?: {
    id: string
    title: string
    slug: string
    images: ServerImage[]
  }
  variant?: {
    id: string
    sizeLabel: string
    widthInches: number
    heightInches: number
    price: string
  }
  frame?: {
    id: string
    name: string
    type: string
  }
}

export interface ServerCartPayload {
  id: string
  itemCount: number
  subtotal: string
  items: ServerCartLine[]
  savedForLater: ServerCartLine[]
  savingTotal: string
}

/** Decimal string to number; anything unparseable is zero, never NaN. */
function toNumber(value: string | null | undefined): number {
  const parsed = parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

function toCartItem(line: ServerCartLine): CartItem {
  const image = line.product?.images?.[0]

  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId,
    frameId: line.frameId,
    quantity: line.quantity,
    productTitle: line.product?.title ?? '',
    productSlug: line.product?.slug ?? '',
    thumbnailUrl: image?.thumbnailUrl ?? image?.url ?? '',
    sizeLabel: line.variant?.sizeLabel ?? '',
    widthInches: line.variant?.widthInches ?? 0,
    heightInches: line.variant?.heightInches ?? 0,
    frameName: line.frame?.name,
    frameType: line.frame?.type,
    unitPrice: toNumber(line.unitPrice),
    framePrice: toNumber(line.framePrice),
    customizations: line.customizations ?? undefined,
    isAiGenerated: line.isAiGenerated,
    aiDetails: line.aiDetails ?? undefined,
    addedAt: line.createdAt,
  }
}

/**
 * The active lines only. `savedForLater` is a different list with a different
 * meaning — order creation filters it out (`routes/orders.ts:407`) and so does
 * the cart.
 */
export function toCartItems(cart: ServerCartPayload): CartItem[] {
  return cart.items.map(toCartItem)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/web && npx vitest run tests/lib/cart-projection.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/lib/cart-projection.ts packages/web/tests/lib/cart-projection.test.ts
git commit --only packages/web/app/lib/cart-projection.ts packages/web/tests/lib/cart-projection.test.ts -m "feat(web): project the server cart onto the store's item shape

The store is about to hold the server's rows rather than its own (#511), so
the mapping gets its own module and its own tests: ids pass through, decimal
strings become numbers, and the timestamp comes from createdAt — the column
that exists. ServerCartItem in hooks/useCart.ts says addedAt, which is one
more sign those hooks have never run.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: One cart, one write path

Three parts, three commits, one task. They are one task because the seam between them is not reviewable in isolation: the store's old actions, the new hook, and the call sites only make sense together.

**Order matters, and it is not the order you would guess.** Part A *adds* the new store API while leaving the old actions in place; part B adds the hook; part C switches the call sites and deletes the old actions in the same commit. Every commit builds. This branch is shared with other agents — a commit that does not compile is their problem too, not just a note in a plan.

#### Task 2, part A — the store keeps state, and only state

The store stops minting ids and stops being the last word. It gains a way to be replaced by the server, a way to be rolled back, and somewhere to put an error. What it does not do yet is lose anything — the old actions stay until part C has somewhere else for the call sites to go.

**Files:**
- Modify: `packages/web/app/stores/cart.ts`
- Test: `packages/web/tests/stores/cart-projection-store.test.ts`

**Interfaces:**
- Consumes: `toCartItems`, `ServerCartPayload` from Task 1.
- Produces, on `CartStore`:
  - `syncError: string | null`
  - `addItemLocal(input: AddToCartInput): string` — returns the temporary id it minted
  - `updateQuantityLocal(id: string, quantity: number): void`
  - `removeItemLocal(id: string): void`
  - `clearLocal(): void`
  - `restore(items: CartItem[]): void`
  - `replaceFromServer(cart: ServerCartPayload): void`
  - `setSyncError(message: string | null): void`
- Removed here: `getItemTotal`, `findExistingItem`, `updateFrame` — all three have zero call sites, so removing them breaks nothing.
- **Kept here, deleted in part C:** `addItem`, `updateQuantity`, `removeItem`, `clearCart` and the store's `useCartActions` export. They become one-line delegates to the `*Local` actions so the five existing call sites keep compiling until part C moves them.

The `Local` suffix is load-bearing. `useCartActions` exposes `addItem`; the store exposes `addItemLocal`. A call site that reaches past the hook into the store is then obviously wrong at a glance.

- [ ] **Step 1: Write the failing test**

`packages/web/tests/stores/cart-projection-store.test.ts`:

```ts
/**
 * The live storefront store (`~/stores/cart`) as a projection of the server
 * cart (#511).
 *
 * Not to be confused with tests/stores/cart.test.ts, which covers the dead
 * `@/stores/cart` under packages/web/src.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Node 25 exposes its own `localStorage` global with no usable methods, and it
// shadows jsdom's. zustand's persist captures the storage object once, at
// module init, so the replacement has to be installed before the store is
// imported — hence vi.hoisted rather than beforeEach.
vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

import { useCartStore, type CartItem } from '~/stores/cart'
import type { ServerCartPayload } from '~/lib/cart-projection'

const serverCart: ServerCartPayload = {
  id: 'cart-1',
  itemCount: 1,
  subtotal: '2000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      unitPrice: '2000.00',
      framePrice: '0.00',
      lineTotal: '2000.00',
      customizations: null,
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T06:00:00.000Z',
      product: { id: 'prod-1', title: 'Blue Hour', slug: 'blue-hour', images: [] },
      variant: {
        id: 'var-1',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
    },
  ],
}

const localItem: CartItem = {
  id: 'pending-1',
  productId: 'prod-9',
  variantId: 'var-9',
  frameId: null,
  quantity: 1,
  productTitle: 'Old',
  productSlug: 'old',
  thumbnailUrl: '',
  sizeLabel: 'A4',
  widthInches: 8,
  heightInches: 12,
  unitPrice: 100,
  framePrice: 0,
  isAiGenerated: false,
  addedAt: '2026-08-01T00:00:00.000Z',
}

describe('cart store as a server projection', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
  })

  it('replaceFromServer discards whatever was local', () => {
    useCartStore.setState({ items: [localItem] })
    useCartStore.getState().replaceFromServer(serverCart)

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('addItemLocal returns the temporary id it minted', () => {
    const id = useCartStore.getState().addItemLocal({
      productId: 'prod-1',
      variantId: 'var-1',
      productTitle: 'Blue Hour',
      productSlug: 'blue-hour',
      thumbnailUrl: '',
      sizeLabel: '24x36 inches',
      widthInches: 24,
      heightInches: 36,
      unitPrice: 2000,
    })

    expect(id).toMatch(/^pending/)
    expect(useCartStore.getState().items[0].id).toBe(id)
  })

  it('addItemLocal opens the drawer', () => {
    useCartStore.getState().addItemLocal({
      productId: 'prod-1',
      variantId: 'var-1',
      productTitle: 'Blue Hour',
      productSlug: 'blue-hour',
      thumbnailUrl: '',
      sizeLabel: '24x36 inches',
      widthInches: 24,
      heightInches: 36,
      unitPrice: 2000,
    })

    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('restore puts back an exact snapshot', () => {
    useCartStore.getState().replaceFromServer(serverCart)
    useCartStore.getState().restore([localItem])

    expect(useCartStore.getState().items).toEqual([localItem])
  })

  it('setSyncError carries a message and clears with null', () => {
    useCartStore.getState().setSyncError('Out of stock')
    expect(useCartStore.getState().syncError).toBe('Out of stock')

    useCartStore.getState().setSyncError(null)
    expect(useCartStore.getState().syncError).toBeNull()
  })

  it('clearLocal empties the items and nothing else', () => {
    useCartStore.setState({ items: [localItem], isDrawerOpen: true })
    useCartStore.getState().clearLocal()

    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().isDrawerOpen).toBe(true)
  })

  it('updateQuantityLocal at zero removes the line', () => {
    useCartStore.setState({ items: [localItem] })
    useCartStore.getState().updateQuantityLocal('pending-1', 0)

    expect(useCartStore.getState().items).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && npx vitest run tests/stores/cart-projection-store.test.ts
```

Expected: FAIL — `replaceFromServer is not a function`.

- [ ] **Step 3: Rewrite the store's action surface**

In `packages/web/app/stores/cart.ts`:

Add the import:

```ts
import { toCartItems, type ServerCartPayload } from "~/lib/cart-projection";
```

Replace the `CartStore` interface's action and computed blocks with:

```ts
interface CartStore {
  // State
  items: CartItem[];
  /** Whether the slide-out cart drawer is showing. Never persisted. */
  isDrawerOpen: boolean;
  /**
   * Why the last write did not reach the server, or null.
   *
   * The server cart is the one checkout reads, so a rejected write is rolled
   * back locally rather than kept — and the customer has to be told, or the
   * item they added silently is not there (#511).
   */
  syncError: string | null;

  // Drawer
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  /**
   * Local mutators. `useCartActions` owns these — it applies one optimistically,
   * calls the API, and either re-projects the server's answer or restores the
   * snapshot. A component calling them directly writes to a cart that checkout
   * will never see, which is the bug this whole change exists to close.
   */
  addItemLocal: (input: AddToCartInput) => string;
  updateQuantityLocal: (id: string, quantity: number) => void;
  removeItemLocal: (id: string) => void;
  clearLocal: () => void;
  restore: (items: CartItem[]) => void;
  replaceFromServer: (cart: ServerCartPayload) => void;
  setSyncError: (message: string | null) => void;

  /**
   * Legacy local-only actions, kept so the existing call sites compile until
   * part C moves them onto `useCartActions`. Deleted there, in the same commit.
   */
  addItem: (input: AddToCartInput) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;

  // Computed values (as functions for Zustand v5 compatibility)
  getItemCount: () => number;
  getSubtotal: () => number;
}
```

Replace the action implementations (the block from `addItem:` through `findExistingItem`) with:

```ts
      syncError: null,

      // Drawer visibility. It lives here rather than in a parent component so
      // any surface — header button, PDP, quickview — can open the cart
      // without prop-drilling through __root.
      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),
      toggleDrawer: () =>
        set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

      addItemLocal: (input: AddToCartInput) => {
        // A placeholder id, replaced by the server's row id as soon as the
        // write lands. Prefixed so it is obvious in a snapshot that this line
        // has not been acknowledged yet.
        const pendingId = generateId("pending");

        set((state) => {
          const existing = state.items.find(
            (item) =>
              item.productId === input.productId &&
              item.variantId === input.variantId &&
              item.frameId === (input.frameId ?? null)
          );

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.id === existing.id
                  ? { ...item, quantity: item.quantity + (input.quantity ?? 1) }
                  : item
              ),
              // Adding always slides the cart open, the way mesonart's does.
              isDrawerOpen: true,
              syncError: null,
            };
          }

          const newItem: CartItem = {
            id: pendingId,
            productId: input.productId,
            variantId: input.variantId,
            frameId: input.frameId ?? null,
            quantity: input.quantity ?? 1,
            productTitle: input.productTitle,
            productSlug: input.productSlug,
            thumbnailUrl: input.thumbnailUrl,
            sizeLabel: input.sizeLabel,
            widthInches: input.widthInches,
            heightInches: input.heightInches,
            frameName: input.frameName,
            frameType: input.frameType,
            unitPrice: input.unitPrice,
            framePrice: input.framePrice ?? 0,
            customizations: input.customizations,
            isAiGenerated: input.isAiGenerated ?? false,
            aiDetails: input.aiDetails,
            addedAt: new Date().toISOString(),
          };

          return {
            items: [...state.items, newItem],
            isDrawerOpen: true,
            syncError: null,
          };
        });

        return pendingId;
      },

      updateQuantityLocal: (id: string, quantity: number) =>
        set((state) => {
          if (quantity <= 0) {
            return { items: state.items.filter((item) => item.id !== id) };
          }

          return {
            items: state.items.map((item) =>
              item.id === id ? { ...item, quantity } : item
            ),
          };
        }),

      removeItemLocal: (id: string) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      clearLocal: () => set({ items: [] }),

      restore: (items: CartItem[]) => set({ items }),

      /**
       * The server's cart, wholesale. Local ids, quantities and prices all
       * lose — the rows here are the rows order creation will read.
       */
      replaceFromServer: (cart: ServerCartPayload) =>
        set({ items: toCartItems(cart) }),

      setSyncError: (message: string | null) => set({ syncError: message }),
```

Keep `getItemCount` and `getSubtotal` exactly as they are. Delete `getItemTotal`, `findExistingItem` and `updateFrame` — no call sites.

Add the four legacy delegates beneath the new actions, so the existing call sites keep compiling until part C:

```ts
      // Deleted in part C, once every call site is on useCartActions. Until
      // then these keep the five existing importers building — this branch is
      // shared, and a commit that does not compile is everyone's problem.
      addItem: (input: AddToCartInput) => void get().addItemLocal(input),
      updateQuantity: (id: string, quantity: number) =>
        get().updateQuantityLocal(id, quantity),
      removeItem: (id: string) => get().removeItemLocal(id),
      clearCart: () => get().clearLocal(),
```

Leave the `useCartActions` export (lines 413-425) in place, minus its `updateFrame` entry. Part C deletes it.

Add a selector hook beside the others:

```ts
const selectSyncError = (state: CartStore) => state.syncError;

/**
 * Hook to read why the last cart write failed, or null.
 */
export const useCartSyncError = () => useCartStore(selectSyncError);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/web && npx vitest run tests/stores/cart-projection-store.test.ts tests/stores/cart-drawer.test.ts
```

Expected: the new file PASSES; `cart-drawer.test.ts` still passes (it only touches drawer state).

Then confirm the tree still builds, because the legacy delegates exist precisely so that it does:

```bash
cd packages/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no *new* errors against the pre-existing baseline. Nothing about `useCartActions` or a missing store action.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/stores/cart.ts packages/web/tests/stores/cart-projection-store.test.ts
git commit --only packages/web/app/stores/cart.ts packages/web/tests/stores/cart-projection-store.test.ts -m "refactor(web): the cart store keeps state, not authority

Local mutators gain a Local suffix, because they are now half of an operation
rather than the whole of one: useCartActions applies one, calls the API, and
either re-projects the server's cart or restores the snapshot. replaceFromServer
and restore are the two ends of that; syncError is where a rejection goes.

updateFrame, getItemTotal and findExistingItem had no call sites and are gone.
The four old actions stay one more commit, as delegates, so the call sites
still compile — this branch is shared, and a tree that does not build is
everyone's problem.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

#### Task 2, part B — `useCartActions`, the only way to write the cart

**Files:**
- Create: `packages/web/app/hooks/useCartActions.ts`
- Test: `packages/web/tests/hooks/useCartActions.test.tsx`

**Interfaces:**
- Consumes: the `*Local` store actions from part A; `cartApi` from `~/lib/api`; `cartKeys` from `~/hooks/useCart`; `ServerCartPayload` from Task 1.
- Produces: `useCartActions(): CartActions` where

```ts
interface CartActions {
  addItem: (input: AddToCartInput) => Promise<void>
  updateQuantity: (id: string, quantity: number) => Promise<void>
  removeItem: (id: string) => Promise<void>
  clearCart: () => Promise<void>
  /** Local wipe with no DELETE — for after an order has already consumed the cart. */
  resetLocalCart: () => void
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
}
```

Rules the tests pin:
- `updateQuantity(id, n)` with `n <= 0` removes the line instead of sending `PATCH quantity: 0`, which the server would reject.
- A rejected write restores the exact pre-write items and sets `syncError`.
- A successful write re-projects from `GET /api/cart` — fetched through `queryClient.fetchQuery` on `cartKeys.detail()`, so the cart page's `useServerCart` sees the same payload without a second round trip.
- An optimistic line still carrying a `pending-` id is never sent to `PATCH`/`DELETE`; those calls address server ids only.

- [ ] **Step 1: Write the failing test**

`packages/web/tests/hooks/useCartActions.test.tsx`:

```tsx
/**
 * The cart's single write path (#511).
 *
 * Before this hook existed, every cart write landed in localStorage and
 * nowhere else, while POST /api/orders built the order from the database cart —
 * so checkout failed with "No active cart found". These tests exist to keep
 * that from coming back: every action must reach cartApi, and a rejection must
 * leave the local cart exactly as it was.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

vi.mock('~/lib/api', () => ({
  cartApi: {
    get: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}))

import { cartApi } from '~/lib/api'
import { useCartStore } from '~/stores/cart'
import { useCartActions } from '~/hooks/useCartActions'

const SERVER_ID = '11111111-1111-1111-1111-111111111111'

const serverCart = {
  id: 'cart-1',
  itemCount: 1,
  subtotal: '2000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: SERVER_ID,
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      unitPrice: '2000.00',
      framePrice: '0.00',
      lineTotal: '2000.00',
      customizations: null,
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T06:00:00.000Z',
      product: { id: 'prod-1', title: 'Blue Hour', slug: 'blue-hour', images: [] },
      variant: {
        id: 'var-1',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
    },
  ],
}

const addInput = {
  productId: 'prod-1',
  variantId: 'var-1',
  frameId: null,
  quantity: 1,
  productTitle: 'Blue Hour',
  productSlug: 'blue-hour',
  thumbnailUrl: '',
  sizeLabel: '24x36 inches',
  widthInches: 24,
  heightInches: 36,
  unitPrice: 2000,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
  vi.mocked(cartApi.get).mockResolvedValue(serverCart)
})

describe('useCartActions.addItem', () => {
  it('sends the line to the server', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.addItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.addItem(addInput))

    expect(cartApi.addItem).toHaveBeenCalledWith({
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      customizations: undefined,
      isAiGenerated: false,
      aiDetails: undefined,
    })
  })

  it('replaces the optimistic line with the server row', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.addItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.addItem(addInput))

    await waitFor(() =>
      expect(useCartStore.getState().items[0].id).toBe(SERVER_ID)
    )
  })

  it('rolls back and reports when the server refuses', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.addItem).mockRejectedValue(
      new Error('Product variant is out of stock')
    )

    await act(() => result.current.addItem(addInput))

    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().syncError).toBe(
      'Product variant is out of stock'
    )
  })
})

describe('useCartActions.updateQuantity', () => {
  beforeEach(() => {
    useCartStore.getState().replaceFromServer(serverCart)
  })

  it('patches the server row', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.updateItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.updateQuantity(SERVER_ID, 3))

    expect(cartApi.updateItem).toHaveBeenCalledWith(SERVER_ID, { quantity: 3 })
  })

  it('removes rather than patching a quantity of zero', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.updateQuantity(SERVER_ID, 0))

    expect(cartApi.updateItem).not.toHaveBeenCalled()
    expect(cartApi.removeItem).toHaveBeenCalledWith(SERVER_ID)
  })

  it('restores the previous quantity when the patch fails', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.updateItem).mockRejectedValue(new Error('nope'))

    await act(() => result.current.updateQuantity(SERVER_ID, 3))

    expect(useCartStore.getState().items[0].quantity).toBe(1)
    expect(useCartStore.getState().syncError).toBe('nope')
  })
})

describe('useCartActions.removeItem', () => {
  beforeEach(() => {
    useCartStore.getState().replaceFromServer(serverCart)
  })

  it('deletes the server row', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.removeItem).mockResolvedValue({ message: 'ok' })

    await act(() => result.current.removeItem(SERVER_ID))

    expect(cartApi.removeItem).toHaveBeenCalledWith(SERVER_ID)
  })

  it('puts the line back when the delete fails', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    vi.mocked(cartApi.removeItem).mockRejectedValue(new Error('nope'))

    await act(() => result.current.removeItem(SERVER_ID))

    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('never sends a pending id to the server', async () => {
    const { result } = renderHook(() => useCartActions(), { wrapper })
    const pendingId = useCartStore.getState().addItemLocal(addInput)

    await act(() => result.current.removeItem(pendingId))

    expect(cartApi.removeItem).not.toHaveBeenCalled()
  })
})

describe('useCartActions.clearCart', () => {
  it('clears on the server and locally', async () => {
    useCartStore.getState().replaceFromServer(serverCart)
    vi.mocked(cartApi.clear).mockResolvedValue({ message: 'ok' })
    vi.mocked(cartApi.get).mockResolvedValue({ ...serverCart, items: [] })

    const { result } = renderHook(() => useCartActions(), { wrapper })
    await act(() => result.current.clearCart())

    expect(cartApi.clear).toHaveBeenCalled()
    await waitFor(() => expect(useCartStore.getState().items).toEqual([]))
  })
})

describe('useCartActions.resetLocalCart', () => {
  it('empties the local cart without calling the server', () => {
    useCartStore.getState().replaceFromServer(serverCart)

    const { result } = renderHook(() => useCartActions(), { wrapper })
    act(() => result.current.resetLocalCart())

    expect(useCartStore.getState().items).toEqual([])
    expect(cartApi.clear).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && npx vitest run tests/hooks/useCartActions.test.tsx
```

Expected: FAIL — `Failed to resolve import "~/hooks/useCartActions"`.

- [ ] **Step 3: Write the hook**

`packages/web/app/hooks/useCartActions.ts`:

```ts
/**
 * The cart's single write path (#511).
 *
 * The server cart is the one `POST /api/orders` reads, so it is the one that
 * decides. Each action applies its change locally first — the UI must not wait
 * on a round trip — then sends it, then replaces the local cart with whatever
 * the server says the cart now is. A rejection restores the snapshot and puts
 * the reason in `syncError`, so the two can never disagree about what checkout
 * will find.
 *
 * The refetch goes through `queryClient.fetchQuery` on `cartKeys.detail()`
 * rather than a bare `cartApi.get()`, so the cart page's `useServerCart` — the
 * one place sale savings are read from — sees the new payload without a second
 * request. The server has already dropped its cache: every mutation handler
 * ends in `updateCartTotals`, which calls `invalidateCartCache`.
 */

import { useCallback, useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { cartApi } from "~/lib/api";
import { cartKeys } from "~/hooks/useCart";
import type { ServerCartPayload } from "~/lib/cart-projection";
import { useCartStore, type AddToCartInput, type CartItem } from "~/stores/cart";

/** A line the server has not acknowledged yet cannot be addressed by id. */
function isPending(id: string): boolean {
  return id.startsWith("pending");
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Could not update your cart";
}

function fetchCart(queryClient: QueryClient): Promise<ServerCartPayload> {
  return queryClient.fetchQuery({
    queryKey: cartKeys.detail(),
    queryFn: () => cartApi.get() as Promise<ServerCartPayload>,
    staleTime: 0,
  });
}

export interface CartActions {
  addItem: (input: AddToCartInput) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearCart: () => Promise<void>;
  /**
   * Empty the cart locally without a DELETE.
   *
   * For after a paid order: `routes/orders.ts` has already deleted the
   * purchased lines, and a DELETE here would be a wasted round trip that could
   * also take out anything added since.
   */
  resetLocalCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

export function useCartActions(): CartActions {
  const queryClient = useQueryClient();

  const addItem = useCallback(
    async (input: AddToCartInput) => {
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.addItemLocal(input);

      try {
        await cartApi.addItem({
          productId: input.productId,
          variantId: input.variantId,
          frameId: input.frameId ?? null,
          quantity: input.quantity ?? 1,
          customizations: input.customizations,
          isAiGenerated: input.isAiGenerated ?? false,
          aiDetails: input.aiDetails,
        });

        useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
      } catch (error) {
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.removeItemLocal(id);

      // A pending line has no server row to delete; dropping it locally is the
      // whole operation.
      if (isPending(id)) return;

      try {
        await cartApi.removeItem(id);
        useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
      } catch (error) {
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      // The server's schema has no zero quantity; zero means remove.
      if (quantity <= 0) {
        await removeItem(id);
        return;
      }

      const store = useCartStore.getState();
      const snapshot: CartItem[] = store.items;

      store.updateQuantityLocal(id, quantity);

      if (isPending(id)) return;

      try {
        await cartApi.updateItem(id, { quantity });
        useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
      } catch (error) {
        useCartStore.getState().restore(snapshot);
        useCartStore.getState().setSyncError(readError(error));
      }
    },
    [queryClient, removeItem]
  );

  const clearCart = useCallback(async () => {
    const store = useCartStore.getState();
    const snapshot: CartItem[] = store.items;

    store.clearLocal();

    try {
      await cartApi.clear();
      useCartStore.getState().replaceFromServer(await fetchCart(queryClient));
    } catch (error) {
      useCartStore.getState().restore(snapshot);
      useCartStore.getState().setSyncError(readError(error));
    }
  }, [queryClient]);

  const resetLocalCart = useCallback(() => {
    useCartStore.getState().clearLocal();
    queryClient.invalidateQueries({ queryKey: cartKeys.detail() });
  }, [queryClient]);

  const openDrawer = useCartStore((state) => state.openDrawer);
  const closeDrawer = useCartStore((state) => state.closeDrawer);
  const toggleDrawer = useCartStore((state) => state.toggleDrawer);

  return useMemo(
    () => ({
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      resetLocalCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    }),
    [
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      resetLocalCart,
      openDrawer,
      closeDrawer,
      toggleDrawer,
    ]
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/web && npx vitest run tests/hooks/useCartActions.test.tsx
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/useCartActions.ts packages/web/tests/hooks/useCartActions.test.tsx
git commit --only packages/web/app/hooks/useCartActions.ts packages/web/tests/hooks/useCartActions.test.tsx -m "feat(web): one write path for the cart, and it reaches the server

Every action applies locally, sends, then re-projects the server's cart; a
rejection restores the snapshot and reports why. So the basket the customer
sees and the basket POST /api/orders reads cannot drift apart.

Quantity zero removes rather than patching a quantity the schema rejects, and
a line the server has not acknowledged is never addressed by id.

The refetch goes through fetchQuery on cartKeys.detail(), so the cart page's
useServerCart gets the new sale savings from the same request.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

#### Task 2, part C — move every call site onto the hook, and show the error

This is where the legacy delegates die. Nothing may still reach into the store for a write after this commit.

**Files:**
- Modify: `packages/web/app/components/product/ProductDetail.tsx`
- Modify: `packages/web/app/components/product/ChooseOptions.tsx`
- Modify: `packages/web/app/components/cart/CartDrawer.tsx`
- Modify: `packages/web/app/routes/cart/index.tsx`
- Modify: `packages/web/app/stores/cart.ts` — delete the legacy delegates and the store's `useCartActions`
- Test: `packages/web/tests/components/cart/CartDrawer-sync-error.test.tsx`

**Interfaces:**
- Consumes: `useCartActions` (part B), `useCartSyncError` (part A).
- Deletes, in the same commit as the call-site switch: the store's `addItem`, `updateQuantity`, `removeItem`, `clearCart` delegates, its `useCartActions` export, and the `useShallow` import if nothing else uses it.

- [ ] **Step 1: Write the failing test**

`packages/web/tests/components/cart/CartDrawer-sync-error.test.tsx`:

```tsx
/**
 * A cart write that the server refused is rolled back, so the drawer has to
 * say why — otherwise the item the customer added simply is not there and
 * nothing explains it (#511).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

vi.mock('~/lib/api', () => ({
  cartApi: {
    get: vi.fn().mockResolvedValue({
      id: 'cart-1',
      itemCount: 0,
      subtotal: '0.00',
      savingTotal: '0.00',
      items: [],
      savedForLater: [],
    }),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}))

import { useCartStore } from '~/stores/cart'
import { CartDrawer } from '~/components/cart/CartDrawer'

function renderDrawer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CartDrawer />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  useCartStore.setState({ items: [], isDrawerOpen: true, syncError: null })
})

describe('CartDrawer sync error', () => {
  it('shows nothing when there is no error', () => {
    renderDrawer()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server’s reason when a write was refused', () => {
    useCartStore.setState({ syncError: 'Product variant is out of stock' })
    renderDrawer()

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Product variant is out of stock'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && npx vitest run tests/components/cart/CartDrawer-sync-error.test.tsx
```

Expected: FAIL — no element with role `alert`.

- [ ] **Step 3: Update the four call sites**

`ProductDetail.tsx` — replace the store import and the action read:

```tsx
// was: import { useCartStore } from '~/stores/cart'
import { useCartActions } from '~/hooks/useCartActions'

// was: const addItem = useCartStore((state) => state.addItem)
const { addItem } = useCartActions()
```

Leave the `addItem({...})` call at line 262 exactly as it is — the input shape is unchanged. Its `useCallback` dependency array already lists `addItem`.

`ChooseOptions.tsx` — the same two edits. `handleAdd` (line 376) keeps its body and its dependency array.

`CartDrawer.tsx`:

```tsx
// was: import { useCartActions, ... } from '~/stores/cart'
import { useCartActions } from '~/hooks/useCartActions'
import { useCartSyncError } from '~/stores/cart'   // alongside the other store imports
```

Add the read next to the existing hooks in the component body:

```tsx
  const syncError = useCartSyncError()
```

and render it above the item list, inside the panel:

```tsx
        {syncError && (
          <p
            role="alert"
            className="mx-4 mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {syncError}
          </p>
        )}
```

`routes/cart/index.tsx` — same import move for `useCartActions`, plus the same `syncError` read and the same alert block rendered above the line items.

`stores/cart.ts` — with nothing importing them any more, delete the four legacy delegates (`addItem`, `updateQuantity`, `removeItem`, `clearCart`), their declarations on the `CartStore` interface, the store's `useCartActions` export, and the `useShallow` import. This is the same commit as the call-site switch: the delegates existed to keep part A and part B compiling, and their reason to exist ends here.

- [ ] **Step 4: Run the tests**

```bash
cd packages/web && npx vitest run tests/components/cart tests/hooks/useCartActions.test.tsx tests/stores
```

Expected: all PASS. Then confirm nothing still reaches into the store for a write, and that the delegates are gone:

```bash
cd /Users/dhruv/work/masonart.com && grep -rn "state\.addItem\|state\.updateQuantity\|state\.removeItem\|state\.clearCart" packages/web/app
grep -n "useCartActions\|useShallow" packages/web/app/stores/cart.ts
cd packages/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: the first grep gives no output; the second gives no output; the typecheck shows no new errors against the baseline.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/product/ProductDetail.tsx packages/web/app/components/product/ChooseOptions.tsx packages/web/app/components/cart/CartDrawer.tsx packages/web/app/routes/cart/index.tsx packages/web/app/stores/cart.ts packages/web/tests/components/cart/CartDrawer-sync-error.test.tsx
git commit --only packages/web/app/components/product/ProductDetail.tsx packages/web/app/components/product/ChooseOptions.tsx packages/web/app/components/cart/CartDrawer.tsx packages/web/app/routes/cart/index.tsx packages/web/app/stores/cart.ts packages/web/tests/components/cart/CartDrawer-sync-error.test.tsx -m "feat(web): add to cart writes to the cart checkout reads

The PDP, the quickview, the drawer and the cart page all go through
useCartActions now, so what the customer adds is in the basket the order is
built from. A refused write rolls back, and the drawer says why — the repo has
no toast, and adding always opens the drawer, so that is where the customer
already is.

The store's local-only actions and its useCartActions go with them — they
survived one commit longer than the rename so the tree never stopped building.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Load the server cart on arrival

Without this the store shows whatever `localStorage` last held, which after this change is a stale projection rather than the truth.

**Files:**
- Create: `packages/web/app/components/cart/CartSync.tsx`
- Modify: `packages/web/app/routes/__root.tsx`
- Test: `packages/web/tests/components/cart/CartSync.test.tsx`

**Interfaces:**
- Consumes: `useServerCart` from `~/hooks/useCart`, `replaceFromServer` from the store.
- Produces: `function CartSync(): null`

- [ ] **Step 1: Write the failing test**

`packages/web/tests/components/cart/CartSync.test.tsx`:

```tsx
/**
 * The store is a projection of the server cart, so something has to fetch it
 * on arrival. Without this the first paint shows a stale localStorage cart and
 * checkout disagrees with what is on screen (#511).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

vi.mock('~/lib/api', () => ({
  cartApi: { get: vi.fn() },
}))

import { cartApi } from '~/lib/api'
import { useCartStore } from '~/stores/cart'
import { CartSync } from '~/components/cart/CartSync'

const serverCart = {
  id: 'cart-1',
  itemCount: 1,
  subtotal: '2000.00',
  savingTotal: '0.00',
  savedForLater: [],
  items: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      productId: 'prod-1',
      variantId: 'var-1',
      frameId: null,
      quantity: 1,
      unitPrice: '2000.00',
      framePrice: '0.00',
      lineTotal: '2000.00',
      customizations: null,
      isAiGenerated: false,
      aiDetails: null,
      isSavedForLater: false,
      createdAt: '2026-08-06T06:00:00.000Z',
      product: { id: 'prod-1', title: 'Blue Hour', slug: 'blue-hour', images: [] },
      variant: {
        id: 'var-1',
        sizeLabel: '24x36 inches',
        widthInches: 24,
        heightInches: 36,
        price: '2000.00',
      },
    },
  ],
}

function renderSync() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CartSync />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useCartStore.setState({ items: [], isDrawerOpen: false, syncError: null })
})

describe('CartSync', () => {
  it('projects the server cart into the store', async () => {
    vi.mocked(cartApi.get).mockResolvedValue(serverCart)

    renderSync()

    await waitFor(() =>
      expect(useCartStore.getState().items[0].id).toBe(
        '11111111-1111-1111-1111-111111111111'
      )
    )
  })

  it('leaves the store alone when the cart cannot be fetched', async () => {
    vi.mocked(cartApi.get).mockRejectedValue(new Error('offline'))

    renderSync()

    await waitFor(() => expect(cartApi.get).toHaveBeenCalled())
    expect(useCartStore.getState().items).toEqual([])
  })

  it('renders nothing', () => {
    vi.mocked(cartApi.get).mockResolvedValue(serverCart)
    const { container } = renderSync()
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && npx vitest run tests/components/cart/CartSync.test.tsx
```

Expected: FAIL — `Failed to resolve import "~/components/cart/CartSync"`.

- [ ] **Step 3: Write the component and mount it**

`packages/web/app/components/cart/CartSync.tsx`:

```tsx
/**
 * Puts the server's cart into the store, once per visit and after every
 * refetch.
 *
 * The store persists to localStorage for first paint, but the server cart is
 * what checkout reads (#511), so what is on screen has to come from there as
 * soon as it is known. Renders nothing; it is a subscription, not UI.
 *
 * Mounted at the root rather than per route, so a customer who lands on the
 * PDP and adds from there is already working against the real cart.
 */

import { useEffect } from 'react'

import { useServerCart } from '~/hooks/useCart'
import type { ServerCartPayload } from '~/lib/cart-projection'
import { useCartStore } from '~/stores/cart'

export function CartSync(): null {
  const { data } = useServerCart()
  const replaceFromServer = useCartStore((state) => state.replaceFromServer)

  useEffect(() => {
    if (data) replaceFromServer(data as unknown as ServerCartPayload)
  }, [data, replaceFromServer])

  return null
}
```

In `packages/web/app/routes/__root.tsx`, add the import beside the other cart import:

```tsx
import { CartSync } from '~/components/cart/CartSync'
```

and mount it immediately before `<CartDrawer />` (line 283), inside the same guard:

```tsx
        {/* Mounted once at the root so any surface can open the cart (#460) */}
        {!isAdminRoute && <CartSync />}
        {!isAdminRoute && <CartDrawer />}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/web && npx vitest run tests/components/cart/CartSync.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/cart/CartSync.tsx packages/web/app/routes/__root.tsx packages/web/tests/components/cart/CartSync.test.tsx
git commit --only packages/web/app/components/cart/CartSync.tsx packages/web/app/routes/__root.tsx packages/web/tests/components/cart/CartSync.test.tsx -m "feat(web): load the server cart on arrival

The store persists for first paint, but the server cart is the one checkout
reads, so it has to win as soon as it is known. Mounted at the root beside the
drawer, off on admin routes, and silent when the fetch fails — a customer
offline keeps seeing their last known basket rather than an empty one.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Checkout stops double-clearing

**Files:**
- Modify: `packages/web/app/components/checkout/PaymentButton.tsx`
- Test: `packages/web/tests/components/checkout/PaymentButton-cart-reset.test.tsx`

**Interfaces:**
- Consumes: `resetLocalCart` from `useCartActions`.

`routes/orders.ts:542-560` already deletes the purchased lines on payment. A `DELETE /api/cart` here would be a wasted round trip that could also remove anything added since.

- [ ] **Step 1: Write the failing test**

`packages/web/tests/components/checkout/PaymentButton-cart-reset.test.tsx`:

```tsx
/**
 * After a paid order the server has already emptied the cart
 * (routes/orders.ts:542). The button must not send a second DELETE — it would
 * be a wasted round trip, and it would take out anything added since.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.hoisted(() => {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    },
  })
})

vi.mock('~/lib/api', () => ({
  cartApi: { get: vi.fn(), clear: vi.fn() },
}))

import { cartApi } from '~/lib/api'
import { useCartActions } from '~/hooks/useCartActions'
import { useCartStore } from '~/stores/cart'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('post-payment cart reset', () => {
  it('empties locally without a DELETE', () => {
    useCartStore.setState({
      items: [
        {
          id: 'server-1',
          productId: 'p',
          variantId: 'v',
          frameId: null,
          quantity: 1,
          productTitle: 'x',
          productSlug: 'x',
          thumbnailUrl: '',
          sizeLabel: 'A4',
          widthInches: 8,
          heightInches: 12,
          unitPrice: 100,
          framePrice: 0,
          isAiGenerated: false,
          addedAt: '2026-08-06T06:00:00.000Z',
        },
      ],
    })

    const { result } = renderHook(() => useCartActions(), { wrapper })
    act(() => result.current.resetLocalCart())

    expect(useCartStore.getState().items).toEqual([])
    expect(cartApi.clear).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && npx vitest run tests/components/checkout/PaymentButton-cart-reset.test.tsx
```

This one passes as soon as Task 2 part B is committed — it pins `resetLocalCart`, which already exists by now. It is a regression pin, not a red-green cycle; the behaviour this task delivers is the call-site switch in Step 3, and the check that proves it is the grep in Step 4.

- [ ] **Step 3: Switch the button over**

In `packages/web/app/components/checkout/PaymentButton.tsx`:

```tsx
// was: import { useCartActions } from '~/stores/cart'
import { useCartActions } from '~/hooks/useCartActions'

// line 138 — was: const { clearCart } = useCartActions()
const { resetLocalCart } = useCartActions()
```

At line 204, inside the successful-verification branch:

```tsx
              setStatus('success')
              // The order already consumed the server cart (orders.ts:542), so
              // this only drops the local projection.
              resetLocalCart()
```

Update the `useCallback` dependency array at line 240: `clearCart` becomes `resetLocalCart`.

- [ ] **Step 4: Run the test and typecheck**

```bash
cd packages/web && npx vitest run tests/components/checkout/PaymentButton-cart-reset.test.tsx
npx tsc --noEmit 2>&1 | tail -5
cd /Users/dhruv/work/masonart.com && grep -n "clearCart\|useCartActions" packages/web/app/components/checkout/PaymentButton.tsx
```

Expected: test PASSES. The grep shows `useCartActions` imported from `~/hooks/useCartActions` and **no** remaining `clearCart` — that absence is the deliverable. The typecheck has a pre-existing error baseline in this repo; compare the count against `main`, do not expect zero.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/components/checkout/PaymentButton.tsx packages/web/tests/components/checkout/PaymentButton-cart-reset.test.tsx
git commit --only packages/web/app/components/checkout/PaymentButton.tsx packages/web/tests/components/checkout/PaymentButton-cart-reset.test.tsx -m "fix(web): don't clear the server cart twice after payment

Order creation already deletes the purchased lines. A second DELETE from the
payment button would be a wasted round trip, and would take out anything added
between the order and the redirect. The button now drops only the local
projection.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Merge the guest cart server-side

`POST /api/cart/merge` wants a `guestSessionId` in the body, but that id lives in an httpOnly cookie the page cannot read and `GET /api/cart` never returns it. The endpoint has never been callable from a browser. The merge moves to middleware, where the cookie is in scope.

**Files:**
- Modify: `packages/api/src/routes/cart.ts`
- Test: `packages/api/tests/routes/cart-guest-merge.test.ts`

**Interfaces:**
- Produces: `export async function mergeGuestCartInto(userId: string, guestSessionId: string): Promise<boolean>` — true when a guest cart was found and folded in.
- Produces: middleware `mergeGuestCartOnAuth`, registered on `cartApp` immediately after `optionalAuth`.

- [ ] **Step 1: Write the failing test**

`packages/api/tests/routes/cart-guest-merge.test.ts`:

The guest cookie is named `cart_session` (`packages/api/src/routes/cart.ts:47`). The middleware's one observable signature is that it clears that cookie — it only does so when it merges — so the suite pins the middleware through the response header and `mergeGuestCartInto` through a direct call.

```ts
/**
 * Guest cart → user cart, on the first authenticated request (#511).
 *
 * The old POST /api/cart/merge asked the client for a guest session id that
 * lives in an httpOnly cookie and is absent from the cart payload — so it could
 * never be called. These tests pin the replacement: the merge happens where the
 * cookie is readable, and the cookie is cleared so it cannot happen twice.
 *
 * `db` is mocked, per the convention in this directory. What this catches is
 * the wiring — who merges, when, and what happens to the cookie.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import '../setup';

// ============================================================================
// Mocks
// ============================================================================

const selectMock = vi.fn();
const updateMock = vi.fn();
const cartFindFirstMock = vi.fn();

/**
 * A drizzle builder double. Every method returns the chain, and the chain
 * itself is thenable, so both `.where(...)` awaited directly and
 * `.where(...).limit(1)` resolve to the same rows.
 */
function chain(rows: unknown[]) {
  const link: Record<string, unknown> = {};
  const self = () => link;
  Object.assign(link, {
    from: self,
    where: self,
    set: self,
    limit: () => Promise.resolve(rows),
    returning: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  });
  return link;
}

vi.mock('../../src/database', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    query: {
      carts: { findFirst: (...args: unknown[]) => cartFindFirstMock(...args) },
    },
  },
}));

vi.mock('../../src/lib/redis', () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn(),
  deleteCached: vi.fn(),
  CacheKeys: { CART: 'cart:' },
}));

/** `optionalAuth` reads the session through here; a null session is a guest. */
const getSessionMock = vi.fn();

vi.mock('../../src/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}));

vi.mock('../../src/lib/promotion-pricing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/promotion-pricing')>();
  return {
    ...actual,
    getActivePromotions: vi.fn().mockResolvedValue([]),
    loadPromotionProductSets: vi.fn().mockResolvedValue(new Map()),
  };
});

import { cartApp, mergeGuestCartInto } from '../../src/routes/cart';

const app = new Hono();
app.route('/api/cart', cartApp);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const USER_CART_ID = '22222222-2222-4222-8222-222222222222';
const GUEST_CART_ID = '33333333-3333-4333-8333-333333333333';
const GUEST_SESSION = 'guest_1754000000000_abc123';

function guestCartRow() {
  return { id: GUEST_CART_ID, userId: null, sessionId: GUEST_SESSION, isActive: true };
}

function userCartRow() {
  return { id: USER_CART_ID, userId: USER_ID, sessionId: null, isActive: true };
}

function guestItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    cartId: GUEST_CART_ID,
    productId: 'prod-1',
    variantId: 'var-1',
    frameId: null,
    quantity: 1,
    unitPrice: '2000.00',
    framePrice: '0.00',
    lineTotal: '2000.00',
    isSavedForLater: false,
    ...overrides,
  };
}

function signedIn() {
  getSessionMock.mockResolvedValue({ user: { id: USER_ID, email: 'a@b.c' } });
}

function guest() {
  getSessionMock.mockResolvedValue(null);
}

/** An empty cart read, so GET /api/cart succeeds after the middleware runs. */
function emptyCartRead() {
  cartFindFirstMock.mockResolvedValue({
    id: USER_CART_ID,
    userId: USER_ID,
    itemCount: 0,
    subtotal: '0.00',
    couponCode: null,
    couponDiscount: '0.00',
    currency: 'INR',
    items: [],
    createdAt: new Date('2026-08-06T06:00:00.000Z'),
    updatedAt: new Date('2026-08-06T06:00:00.000Z'),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectMock.mockReturnValue(chain([]));
  updateMock.mockReturnValue(chain([]));
  emptyCartRead();
});

// ============================================================================
// mergeGuestCartInto
// ============================================================================

describe('mergeGuestCartInto', () => {
  it('reports nothing merged when the guest has no cart', async () => {
    selectMock.mockReturnValue(chain([]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(false);
  });

  it('sums the quantity when the user already holds the same line', async () => {
    const existing = { ...guestItemRow(), id: 'user-line-1', cartId: USER_CART_ID, quantity: 2 };
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()])) // find guest cart
      .mockReturnValueOnce(chain([userCartRow()])) // get or create user cart
      .mockReturnValueOnce(chain([guestItemRow()])) // guest items
      .mockReturnValueOnce(chain([existing])) // matching user line
      .mockReturnValue(chain([{ itemCount: 3, subtotal: '6000.00' }]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(true);

    // 2 already held + 1 arriving
    const quantities = updateMock.mock.results
      .map((result) => result.value)
      .filter(Boolean);
    expect(quantities.length).toBeGreaterThan(0);
    expect(updateMock).toHaveBeenCalled();
  });

  it('moves a line the user does not hold', async () => {
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([guestItemRow()]))
      .mockReturnValueOnce(chain([])) // no matching user line
      .mockReturnValue(chain([{ itemCount: 1, subtotal: '2000.00' }]));

    await expect(mergeGuestCartInto(USER_ID, GUEST_SESSION)).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });
});

// ============================================================================
// mergeGuestCartOnAuth
// ============================================================================

describe('mergeGuestCartOnAuth', () => {
  it('clears the guest cookie once an authenticated request carries it', async () => {
    signedIn();
    selectMock
      .mockReturnValueOnce(chain([guestCartRow()]))
      .mockReturnValueOnce(chain([userCartRow()]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValue(chain([{ itemCount: 0, subtotal: '0.00' }]));

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('cart_session=');
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
  });

  it('leaves a guest s own cookie alone', async () => {
    guest();
    cartFindFirstMock.mockResolvedValue({
      id: GUEST_CART_ID,
      userId: null,
      itemCount: 0,
      subtotal: '0.00',
      couponCode: null,
      couponDiscount: '0.00',
      currency: 'INR',
      items: [],
      createdAt: new Date('2026-08-06T06:00:00.000Z'),
      updatedAt: new Date('2026-08-06T06:00:00.000Z'),
    });
    selectMock.mockReturnValue(chain([guestCartRow()]));

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/Max-Age=0/i);
  });

  it('does nothing for an authenticated request with no guest cookie', async () => {
    signedIn();
    selectMock.mockReturnValue(chain([userCartRow()]));

    const response = await app.request('/api/cart');

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/Max-Age=0/i);
  });

  it('serves the cart even when the merge blows up', async () => {
    signedIn();
    selectMock.mockImplementationOnce(() => {
      throw new Error('connection reset');
    });

    const response = await app.request('/api/cart', {
      headers: { Cookie: `cart_session=${GUEST_SESSION}` },
    });

    expect(response.status).toBe(200);
  });
});
```

If the builder double does not match a chain the moved code actually uses, adapt the double — the assertions are the contract, not the mock shape.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api && npx vitest run tests/routes/cart-guest-merge.test.ts
```

Expected: FAIL — `mergeGuestCartOnAuth` is not exported.

- [ ] **Step 3: Extract the merge and add the middleware**

In `packages/api/src/routes/cart.ts`:

1. Lift the body of the existing `POST /merge` handler (lines 940-1020 — guest-cart lookup, per-item quantity summing, `cartId` reassignment, `updateCartTotals`, `invalidateCartCache`) into a module-level function, unchanged in behaviour:

```ts
/**
 * Fold a guest cart into a user's, then leave the guest cart empty.
 *
 * Matching is on (productId, variantId, frameId, isSavedForLater) — the same
 * natural key `POST /items` dedupes on — and a match sums the quantities rather
 * than creating a second line.
 *
 * Returns true when a guest cart was found.
 */
export async function mergeGuestCartInto(
  userId: string,
  guestSessionId: string
): Promise<boolean> {
  // ...body moved verbatim from the old POST /merge handler...
}
```

2. Add the middleware directly beneath it:

```ts
/**
 * Merge on the first authenticated request that still carries a guest cookie.
 *
 * The guest session id is httpOnly and never leaves the server, so the client
 * cannot ask for this — it has to happen where the cookie is readable (#511).
 * The cookie is deleted afterwards so a second request cannot merge again.
 *
 * A failure here is logged and swallowed: an unmergeable guest cart must not
 * take down every cart read for that customer.
 */
const mergeGuestCartOnAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");
  const sessionId = getCookie(c, GUEST_CART_COOKIE);

  if (user && sessionId) {
    try {
      await mergeGuestCartInto(user.id, sessionId);
    } catch (error) {
      console.error("Error merging guest cart:", error);
    }
    deleteCookie(c, GUEST_CART_COOKIE, { path: "/" });
  }

  await next();
};
```

3. Register it, after `optionalAuth`:

```ts
cartApp.use("*", optionalAuth);
cartApp.use("*", mergeGuestCartOnAuth);
```

4. Delete the `POST /merge` route and the now-unused `mergeCartSchema`.

5. Imports: add `deleteCookie` to the `hono/cookie` import and `MiddlewareHandler` to the `hono` type import.

- [ ] **Step 4: Run the tests**

```bash
cd packages/api && npx vitest run tests/routes/cart-guest-merge.test.ts tests/routes/cart-sale-pricing.test.ts
```

Expected: both PASS. `cart-sale-pricing.test.ts` must stay green — it exercises the same router and will catch a middleware that throws on a guest request.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/cart.ts packages/api/tests/routes/cart-guest-merge.test.ts
git commit --only packages/api/src/routes/cart.ts packages/api/tests/routes/cart-guest-merge.test.ts -m "fix(api): merge the guest cart where the cookie is actually readable

POST /api/cart/merge asked the client for a guest session id that lives in an
httpOnly cookie and never appears in the cart payload, so no browser could ever
call it. The merge now runs as middleware on the first authenticated request
carrying that cookie, and clears the cookie so it cannot run twice.

A failure is logged and swallowed: one unmergeable guest cart must not break
every cart read for that customer.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Delete the half of the cart that never ran

**Files:**
- Modify: `packages/web/app/hooks/useCart.ts`
- Modify: `packages/web/app/lib/api.ts`
- Modify: `packages/web/tests/hooks/useCart.test.tsx`

**Interfaces:**
- Kept in `hooks/useCart.ts`: `cartKeys`, `useServerCart`, `useServerCartItemCount`, `useServerCartSubtotal`, `invalidateCart`, `setCartData`, `getCachedCart`, and the payload types.
- Deleted: `useAddToCart`, `useUpdateCartItem`, `useRemoveFromCart`, `useClearCart`, `useMergeCart`, `useIsCartSyncing`, `CartMutationContext`, `cartApi.merge`.

They implement optimistic rollback against the TanStack cache. Keeping them beside store-level optimism means two optimistic layers over one resource, which is how carts start disagreeing with themselves.

- [ ] **Step 1: Prove they are unreferenced**

```bash
cd /Users/dhruv/work/masonart.com && grep -rn "useAddToCart\|useUpdateCartItem\|useRemoveFromCart\|useClearCart\|useMergeCart\|useIsCartSyncing\|cartApi.merge" packages/web/app
```

Expected: no output. If anything appears, an earlier task missed a call site — fix that first.

- [ ] **Step 2: Delete**

- `hooks/useCart.ts`: remove the six hooks, `CartMutationContext`, and the now-unused `useMutation` / `UseMutationOptions` imports.
- `hooks/useCart.ts`, same pass: delete the local `ServerCart` / `ServerCartItem` / `CartItemCustomizations` / `AIDetails` interfaces and retype `useServerCart` to return `ServerCartPayload` from `~/lib/cart-projection` — one payload type, defined where the projection lives. Those interfaces claimed an `addedAt` field the database has never had (the column is `created_at`, `packages/api/src/database/schema/cart.ts:153`), which is its own proof nothing ever ran against them.
- `components/cart/CartSync.tsx`: with `useServerCart` correctly typed, drop the `as unknown as ServerCartPayload` cast Task 3 needed — it becomes `replaceFromServer(data)`.
- `lib/api.ts`: remove `cartApi.merge`.
- `tests/hooks/useCart.test.tsx`: remove the `describe` blocks for the deleted hooks and their imports. Keep the query-key and `useServerCart` suites.

- [ ] **Step 3: Run the surviving tests**

```bash
cd packages/web && npx vitest run tests/hooks tests/stores tests/components/cart
```

Expected: all PASS, with the deleted hooks' suites gone.

- [ ] **Step 4: Typecheck**

```bash
cd packages/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no *new* errors versus the pre-existing baseline.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/hooks/useCart.ts packages/web/app/lib/api.ts packages/web/tests/hooks/useCart.test.tsx
git commit --only packages/web/app/hooks/useCart.ts packages/web/app/lib/api.ts packages/web/tests/hooks/useCart.test.tsx -m "refactor(web): delete the cart mutations that never had a call site

Five hooks and a merge client, each with optimistic rollback against the query
cache, none of them ever called — which is how the storefront ended up writing
its cart to localStorage alone. The store owns optimism now; two layers of it
over one resource is how a cart starts disagreeing with itself.

ServerCartItem said addedAt. The column is created_at. Nothing that ran could
have missed that.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Prove it against a real stack

Everything above runs against mocks. This is the task that would have caught the original bug.

**Files:**
- Create: `tests/e2e/cart-server-persistence.spec.ts`

**Interfaces:** none — Playwright, repo root.

- [ ] **Step 1: Write the failing test**

`tests/e2e/cart-server-persistence.spec.ts`:

```ts
/**
 * The cart survives a reload, because it lives on the server (#511).
 *
 * The bug this pins: every cart write went to localStorage while
 * POST /api/orders built the order from the database cart, so checkout failed
 * with "No active cart found". Nothing caught it — tests/e2e/payment.spec.ts
 * stubs POST /api/orders outright, and every API route suite mocks db.
 *
 * So: no route stubs in this file. It talks to the real API.
 */

import { test, expect } from '@playwright/test'

test.describe('cart persistence', () => {
  test('an added item is on the server, not just in localStorage', async ({
    page,
  }) => {
    await page.goto('/posters', { waitUntil: 'networkidle' })

    const firstProduct = page.getByTestId('product-card').first()
    await firstProduct.click()
    await page.waitForLoadState('networkidle')

    const addRequest = page.waitForResponse(
      (response) =>
        response.url().includes('/api/cart/items') &&
        response.request().method() === 'POST'
    )

    await page.getByRole('button', { name: /add to cart/i }).click()

    const response = await addRequest
    expect(response.status()).toBe(201)

    // The drawer opens on add; the item is there before any reload.
    await expect(page.getByTestId('cart-drawer')).toBeVisible()

    // And still there after one, which localStorage alone could also do —
    // so assert the server's own answer as well.
    await page.reload({ waitUntil: 'networkidle' })

    const cart = await page.request.get('/api/cart')
    expect(cart.ok()).toBeTruthy()
    expect((await cart.json()).itemCount).toBeGreaterThan(0)
  })
})
```

Adjust the selectors to the real ones — read `tests/e2e/cart.spec.ts` and `tests/e2e/product-detail.spec.ts` for the test ids this repo actually uses, and scope for the duplicated mobile/desktop trees the way `CLAUDE.md` describes.

- [ ] **Step 2: Run it against a running stack**

```bash
cd /Users/dhruv/work/masonart.com && npx playwright test tests/e2e/cart-server-persistence.spec.ts --project=chromium
```

The API and web servers must be up. E2E base URL is `http://localhost:3001` — **not** 5173, which is a different application and makes these tests pass vacuously.

Expected before Tasks 1-6: FAIL, no `POST /api/cart/items` is ever sent. Expected after: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/cart-server-persistence.spec.ts
git commit --only tests/e2e/cart-server-persistence.spec.ts -m "test(e2e): the cart is on the server, against the real API

No route stubs in this file. payment.spec.ts fulfils POST /api/orders from a
page.route and every API route suite mocks db, which is exactly why a cart that
was never written to the server survived to production-ready.

Implements #511

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Close the ticket

- [ ] **Step 1: Full web suite**

```bash
cd packages/web && npx vitest run 2>&1 | tail -20
```

Compare failures against the `main` baseline — this repo has pre-existing failures. New failures are yours; old ones are not.

- [ ] **Step 2: Cart-related API suites**

```bash
cd packages/api && npx vitest run tests/routes/cart-sale-pricing.test.ts tests/routes/cart-guest-merge.test.ts tests/routes/order-promotion-pricing.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Mark the ticket done**

Move `plan/tracker-data/todo/feature-cart-checkout/ticket-0511-the-web-app-never-writes-to-th.yaml` to the done directory and update the tracker status files the way the other completed tickets in this feature were handled. Record on the ticket: the deviation from step 3 (mutation hooks deleted rather than wired), and that the guest merge moved into middleware because the endpoint was uncallable.

- [ ] **Step 4: Commit the tracker change**

```bash
git add plan/tracker-data
git commit -m "chore(tracker): close #511, the server cart write path

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the implementer

**The one thing that must stay true:** anything the customer adds to the cart reaches `cartItems` in the database before checkout runs. Every other decision here serves that.

**Two trees.** `packages/web/src/` is dead. `packages/web/tests/stores/cart.test.ts` — 50 green tests — covers it. Do not extend it, do not fix it, do not let its passing status stand in for coverage of the live store. Cleaning it up is worth a separate ticket and is out of scope here.

**Pre-existing baselines.** The web typecheck and the API suite both have failures on `main`. Diff against the baseline rather than expecting zero, and never treat a *skipped* API suite as a passing one — a suite whose `beforeAll` cannot reach the database reports as skipped, which reads green.
