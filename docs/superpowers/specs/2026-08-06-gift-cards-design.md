# Gift cards

**Date:** 2026-08-06
**Status:** design approved, pending implementation plan
**Feature:** `gift-cards`
**Related:** [Sale promotions and gallery membership](2026-08-05-sale-promotions-design.md) — §5 of that document fixes the layering order this feature sits at the bottom of.

---

## 1. Problem

chobii cannot sell or accept a gift card. The contracts for one are already written and have nothing behind them:

| Evidence | State |
|---|---|
| `packages/shared/src/schemas/checkout.ts:198-199` | `appliedGiftCardIds[]` and `giftCardAmount` declared on the cart schema |
| `packages/shared/src/schemas/checkout.ts:359` | `giftCardAmount` declared on the order schema, non-optional |
| `packages/api/src/database/schema/` | No gift card table. Nothing writes either field |
| `packages/api/src/database/schema/returns.ts:54` | `refundType` enum offers `store_credit` with no instrument capable of holding it |

So the API promises a gift card amount on every order and always reports zero, and the returns flow offers store credit it has no way to issue.

Two consequences beyond the missing feature. Support has no way to compensate a customer except a Razorpay refund against a specific captured payment, which does not exist for goodwill outside an order. And finance has no way to answer how much the business owes in unredeemed cards, because there is nothing to sum.

**A gift card is tender, not a discount.** It reduces the amount due after tax; it does not reduce the price. That distinction drives the whole design and is why this feature is separate from `sale-promotions`.

---

## 2. What already exists to build on

| Asset | Where | Use |
|---|---|---|
| Wallet ledger pattern | `packages/api/src/database/schema/wallet.ts`, `services/wallet.ts:90` | Denormalized balance column plus an append-only transaction ledger carrying a `balanceAfterPaise` snapshot, all in integer paise. Copied wholesale for gift cards |
| Admin balance adjustment | `services/wallet.ts:652` | Shape for the gift card adjustment endpoint |
| Payment initiation seam | `routes/orders.ts:696` | Builds the Razorpay order from `toPaise(order.total)`. The single place the charged amount is decided |
| Refund call | `lib/razorpay.ts:309`, used at `routes/admin/orders.ts:982` | Existing refund path, extended here rather than replaced |
| Rate limiter | `middleware/rate-limit.ts:48` | `rateLimit()` factory already behind `otpRateLimit`. Reused for code entry |
| Scheduled sweep | `services/approval-deadline.ts:251` | `setInterval` job pattern the repo already accepted over BullMQ. Reused for scheduled delivery |
| Email | `services/email.ts`, `services/email-templates.ts` | Delivery of the card to its recipient |
| Nullable order line | `schema/orders.ts:236` | `order_items.productId` is already nullable, so a gift card line needs no fake product |

---

## 3. Decisions taken

| # | Decision | Choice | Rationale |
|---|---|---|---|
| G1 | Relationship to the wallet | **Standalone entity with its own ledger.** Gift cards are not wallet credit | The wallet is spendable only on AI generations, so reusing it means teaching it to pay for orders anyway — the work reappears elsewhere. It also destroys the bearer property and makes the G6 refund split unimplementable, since gift money would be indistinguishable from topped-up money |
| G2 | Ownership | **Bearer instrument.** The code is not bound to an account | A gift is forwarded to someone who may not have registered yet. Binding the card to the first account that touches it means whoever opens the email first owns the balance permanently |
| G3 | Issuance | **Customer-bought and admin-issued** | Admin issuance is one form and one endpoint once the entity exists, and without it every goodwill credit is a manual database edit |
| G4 | Expiry | **Never expires.** `expiresAt` exists, nullable, unset | A card redeemable only on chobii is a closed-system prepaid instrument, outside RBI's PPI authorisation regime, so no validity window is imposed. Expiring a customer's money is a support liability, not a saving. The column exists so a future policy is configuration, not a migration |
| G5 | Code storage | **Hash and last four only** | A database dump then leaks nothing spendable, and nobody with database access can spend a customer's balance. Cost: no "resend the code" — see §4 |
| G6 | Refunds | **Split proportionally back to original tender** | The only version honest about what the customer paid with. Returning card payments as store credit invites chargebacks; returning everything to Razorpay is structurally impossible when a card covered the whole order |
| G7 | Purchase path | **Own flow, not the cart** | `cart_items.productId` and `variantId` are both NOT NULL (`schema/cart.ts:115-121`) and the cart derives `lineTotal` from product, variant and frame prices, so it cannot express a customer-chosen amount without dummy rows |
| G8 | Debit point | **At payment initiation, under a row lock** — not at code entry, not at verification | Code entry must stay a quote or an abandoned checkout eats the balance. Verification is too late: the Razorpay amount has already been computed from it |

**Out of scope** (named so they are not re-litigated per ticket): buying a gift card in the same checkout as posters, physical gift cards, multi-currency balances, partial-balance transfer between cards, reloading an existing card, wiring `returns.ts`'s `store_credit` refund type to auto-issue a card, gift wrapping and gift messaging on ordinary orders (a separate fulfilment feature that shares only the word "gift").

---

## 4. Data model

New file `packages/api/src/database/schema/gift-cards.ts`, exported from `schema/index.ts`. Mirrored in `packages/shared/src/schemas/gift-card.ts`.

```
gift_card
  id                   uuid pk
  codeHash             text unique notnull   -- sha256(normalized code + server pepper)
  codeLast4            text notnull indexed  -- display and admin search: "•••• 7QF3"
  initialBalancePaise  integer notnull
  balancePaise         integer notnull       -- denormalized, as users.walletBalancePaise is
  currency             text default 'INR'
  expiresAt            timestamptz null      -- always null today (G4)
  disabledAt           timestamptz null      -- admin kill switch; rows are never deleted
  issuedByUserId       text -> users.id null -- admin who issued; null when customer-bought
  purchaseOrderId      uuid -> orders.id null
  recipientEmail       text null
  recipientName        text null
  senderName           text null
  message              text null
  sendAt               timestamptz null      -- scheduled delivery; null means send on payment
  sentAt               timestamptz null      -- idempotency guard for the delivery sweep
  createdAt, updatedAt

gift_card_transaction                        -- append-only ledger, mirrors wallet_transactions
  id                   uuid pk
  giftCardId           uuid -> gift_card.id notnull
  type                 enum('issue','redeem','refund','adjustment','void')
  amountPaise          integer notnull       -- positive; type carries direction, as the wallet does
  balanceAfterPaise    integer notnull
  orderId              uuid -> orders.id null
  userId               text -> users.id null -- who redeemed
  createdBy            text -> users.id null -- admin, for adjustments
  description          text notnull
  createdAt

order_gift_card                              -- several cards may pay one order
  orderId              uuid -> orders.id notnull
  giftCardId           uuid -> gift_card.id notnull
  amountPaise          integer notnull
  pk (orderId, giftCardId)
```

**Order-side additions** — `packages/api/src/database/schema/orders.ts`:

```
orders.giftCardAmount    decimal(10,2) default '0.00' notnull
orders.giftCardPurchase  jsonb null   -- amount, recipient, sender, message, sendAt
```

`giftCardPurchase` holds what was bought until the card exists. A scheduled card is not minted at payment time (§6), so the recipient details have to live somewhere between purchase and delivery, and the order is where the purchase already is.

`gift_card.purchaseOrderId` carries a **unique** constraint, not merely an index. That constraint is the idempotency guarantee for minting: a second mint attempt for the same order fails at the database rather than relying on a read-then-write check that races.

**`giftCardAmount` is never summed into `orders.discount`.** It is tender, and it sits below the total, following the one-bucket-per-source rule established for promotions (`orders.promotionDiscount`, `orders.couponDiscount`, `orders.tradeDiscount` at `schema/orders.ts:184`). The charged amount is derived, not stored:

```
razorpayAmount = toPaise(order.total) − giftCardAmountPaise
```

`order_gift_card` is what `packages/shared/src/schemas/checkout.ts:198` already calls `appliedGiftCardIds[]`.

**Status is derived, never stored** — the same discipline as `promotion`. A card is `disabled` when `disabledAt` is set, `expired` when `expiresAt` has passed, `spent` when `balancePaise` is zero, otherwise `active`. No status column to fall out of sync with the balance.

**Units.** Gift cards are integer paise, like the wallet. Orders are decimal rupees. Conversion happens only at the boundary, through the existing `toPaise` (`lib/razorpay.ts:410`). Nothing stores a float.

### The code

Sixteen characters of Crockford base32 — the alphabet excludes I, L, O and U, so nothing is misread off a phone screen and no accidental words are generated — displayed grouped as `XXXX-XXXX-XXXX-XXXX`. That is roughly 2^80 of entropy, drawn from `crypto.randomBytes`. Never `Math.random`.

Input is normalized before hashing: uppercase, strip everything outside the alphabet. So `7qf3-a8k2…` and `7QF3A8K2…` are the same card.

**The full code exists exactly once, in the email.** Under G5 only the hash and last four are stored, so there is no resend. Support instead disables the card and issues a replacement carrying the remaining balance — auditable in both ledgers, and it avoids introducing an encryption key that would have to be managed and rotated.

Code entry endpoints carry `rateLimit()` keyed on user and IP. 2^80 is unguessable, but an unthrottled check is still a free-money oracle against shorter-lived admin-issued cards, and the limiter already exists.

---

## 5. Buying a card

`/gift-cards` collects amount, recipient email and name, sender name, message and an optional send date. `POST /api/gift-cards/purchase` creates an order:

- `orderType: 'gift_card'` — a fourth value on the enum at `schema/orders.ts:122`
- one `order_item` with `productId: null` (already nullable), titled `Gift card — ₹2,000`
- no shipping address, `shippingCost` `0.00`, `tax` `0.00`

Payment then reuses `POST /orders/:id/payment` and its verify endpoint unchanged.

**Why not the cart** (G7): a cart item requires both a `productId` and a `variantId`, so a gift card would need a dummy product and a dummy variant row, and the cart computes `lineTotal` from those rows — it cannot express a customer-typed amount. A gift card in the products table would then have to be excluded by hand from listing, facets, search, the sitemap and the sale resolver, each one a place to forget.

The accepted cost: **a gift card cannot be bought in the same checkout as a poster.** Shopify allows it. The fix later is a cart that tolerates non-product lines, which is not worth retrofitting now.

### Three rules that are correctness, not policy

1. **The card is minted only after `paymentStatus === 'paid'`, at the moment it is delivered.** Minting at order creation means an abandoned checkout creates spendable money. Minting at payment time for a *scheduled* card is equally wrong for a different reason: under G5 the plaintext code exists only in the return value of `issueGiftCard()`, so a card minted in March for a June send date has no recoverable code when June arrives. Immediate sends mint in the verify path; scheduled sends mint in the sweep (§6).
2. **A gift card order cannot be paid with a gift card.** Redemption rejects `orderType === 'gift_card'`. Without it, balance cycles between cards and every refund becomes a graph traversal.
3. **No tax on the voucher sale.** A voucher is neither goods nor services; the tax point is the redemption, not the sale. `tax` is hardcoded `"0.00"` across the codebase today, so this costs nothing now — it is recorded so that future tax work does not tax the voucher and then tax the poster it buys.

**Amounts are bounded:** ₹500 minimum, ₹50,000 maximum, as named constants beside the schema in the style of `WALLET_CONFIG_DEFAULTS` (`schema/wallet.ts`). An unbounded amount field is a fraud-testing surface and a support problem.

---

## 6. Delivery

**Minting and sending are the same event.** G5 keeps only the hash, so the plaintext code exists exactly once — in the return value of `issueGiftCard()`. There is no later moment at which it can be recovered and emailed. Delivery therefore drives creation, not the other way round:

| `sendAt` | Card created | By |
|---|---|---|
| null or past | at payment verification | the verify path |
| future | when the date arrives | the sweep |

Until a scheduled card is minted, the purchase lives on `orders.giftCardPurchase`. The order is paid and the customer has a receipt; the instrument simply does not exist yet, which is invisible to everyone except the recipient who has not been emailed.

The sweep is `services/gift-card-delivery.ts`, using the `setInterval` pattern of `services/approval-deadline.ts:251` — the repo already made that tradeoff against BullMQ, and a second scheduling story costs more than it buys. It selects paid `gift_card` orders whose `giftCardPurchase.sendAt` has arrived, mints, then emails.

**The unique constraint on `gift_card.purchaseOrderId` is the idempotency guard**, not `sentAt`. Two sweep workers, or a sweep racing a retried verification, both attempt the insert; exactly one wins and the loser sees a unique violation and stops. A read-then-write check would race in precisely the window that matters. `sentAt` remains as the record of when the email went out.

If the email fails after a successful mint, the card exists and is unsent — recoverable by hand from the admin screen, and strictly better than a customer holding two codes for one balance. Scheduling is capped at one year ahead.

The email carries the full code, the amount, the sender's name and the message, and is the only place the code ever appears.

---

## 7. Redemption

**Code entry is a quote.** `POST /api/orders/:id/gift-card { code }` validates the code, checks `disabledAt` and `expiresAt`, and returns `{ last4, balance, applicable }` where `applicable = min(balance, amountDue)`. Nothing is debited. Cards can be added and removed freely.

**The debit happens at payment initiation** (G8), inside `POST /orders/:id/payment`, in one database transaction:

1. `SELECT ... FOR UPDATE` on each gift card row. This row lock is the entire defence against double-spend — without it, the same code checked out in two tabs spends the balance twice.
2. Re-read the balance and re-clamp. The quote is advisory and may be stale.
3. Insert the `redeem` ledger row, decrement `gift_card.balancePaise`, insert `order_gift_card`, set `orders.giftCardAmount`.
4. Create the Razorpay order for `toPaise(order.total) − giftCardAmountPaise`.

**Idempotency.** `routes/orders.ts:679` already returns the existing Razorpay order on a repeat call. If `order_gift_card` rows exist for the order, steps 1–3 are skipped. A second call must never debit twice.

**Full coverage skips Razorpay.** When the remainder is exactly zero there is no payment to create and nothing to verify: the same transaction marks the order paid and the endpoint returns `{ fullyCoveredByGiftCard: true }`. Guarded on an exact zero, never a threshold.

**The hold must be released.** Balance is held from payment initiation until the order resolves — a genuine authorization hold. When an order moves to `cancelled` (`routes/admin/orders.ts:623`) or payment fails, each `order_gift_card` amount is credited back with a `void` ledger row and `orders.giftCardAmount` is cleared. Without this path an abandoned checkout silently eats the customer's balance, and nobody reports it because it looks like the card was already spent.

**Checking a balance without buying** — `POST /api/gift-cards/balance { code }`, rate-limited, returns balance and last four. Recipients ask constantly; without it support answers by hand.

---

## 8. Refunds

Rewrites the refund handler at `routes/admin/orders.ts:955-1010`.

Given a refund of X on an order where gift cards paid G of total T — **all three converted to paise first**, because `refundAmount` arrives at the endpoint as a float in rupees (`routes/admin/orders.ts:971`) and splitting a float is how a rupee goes missing:

```
giftCardLeg = round(X × G / T)
razorpayLeg = X − giftCardLeg        -- subtracted, never rounded independently
```

Subtracting the second leg rather than rounding it separately guarantees the two always sum to exactly X. The Razorpay leg goes through `createRefund` as today.

**Splitting the gift card leg across several cards.** Each card gets `round(giftCardLeg × cardAmount / G)`, and the last card in a stable order (by `giftCardId`) absorbs the remainder so the parts sum exactly to `giftCardLeg`. Same subtract-the-last-one discipline as above, one level down.

**Refunds are capped per order, per card.** Cumulative `refund` ledger rows for a given `(orderId, giftCardId)` may never exceed that row's `order_gift_card.amountPaise`. `order_gift_card` records what was applied and is never mutated by a refund, so without this check two partial refunds can credit back more than the card ever paid — minting balance out of a rounding argument.

Two current behaviours change:

- **`routes/admin/orders.ts:967`** returns 400 `"Payment ID not found for this order"` when `paymentDetails.paymentId` is absent. That is now a legitimate state — gift cards covered the whole order — and must skip the Razorpay leg instead of failing.
- **`routes/admin/orders.ts:974`** guards only `refundAmount > order.total`. It must additionally never let the Razorpay leg exceed what Razorpay actually captured.

A disabled card still receives its refund credit. It is the customer's money; re-enabling is a separate admin decision.

---

## 9. Admin

`/admin/gift-cards` lists last four, initial and current balance, derived status, recipient, and a link to the purchasing order. Search accepts a full code — hashed, then looked up — or the last four, which is indexed.

The detail view shows the full ledger, a disable/enable toggle, and a balance adjustment requiring a reason, mirroring `adjustWalletBalance` (`services/wallet.ts:652`).

The issue form displays the generated code **once**, at creation. The G5 constraint applies to admins too.

**Total outstanding balance sits at the top of the list.** Unredeemed gift cards are a liability on the books, and that question currently has no answer at all.

---

## 10. Storefront surfaces

- **`/gift-cards`** — the purchase flow of §5.
- **Checkout** — a gift card input in `OrderSummary.tsx`, its own labelled control rather than the dormant coupon box (there are no coupon codes; see the promotions design D1), the list of applied cards with a remove action, and an "Amount due" line showing total minus gift cards.
- **Order confirmation and order detail** — the gift card tender line.

**No "my gift cards" account page.** A bearer card belongs to whoever holds the code (G2), so such a page would either lie or quietly convert the card into account-bound credit. Cards a user bought already appear in their order history; cards they spent already appear on the orders that used them.

---

## 11. Testing

**Unit** — code generation (format, alphabet, normalization, hash stability), the applicable-amount clamp, and the refund split, specifically that both legs sum to exactly the refund amount at awkward rounding points.

**Integration**, concentrated on what is actually dangerous:

- two concurrent payment initiations against one card — exactly one debit survives
- a repeat call to the payment endpoint does not debit twice
- full coverage marks the order paid with no Razorpay round trip
- cancellation releases the held balance
- a refund succeeds on an order with no `paymentId`
- two partial refunds cannot credit a card more than it paid
- a refund across two cards splits so the parts sum exactly to the gift card leg
- a gift card order refuses gift card payment
- a disabled card is rejected at quote time, and a card with `expiresAt` set in the past is too (no card expires under G4, so the test sets the column directly)

**E2E** — buy a card, receive the email, redeem part of it on an order, confirm the reduced balance, spend the remainder on a second order.

Seed data gains a gift card fixture.

---

## 12. Ticket map

| Phase | Location | Content |
|---|---|---|
| Schema + contracts | `packages/api/src/database/schema/gift-cards.ts`, `packages/shared/src/schemas` | `gift_card`, `gift_card_transaction`, `order_gift_card`, `orders.giftCardAmount`, `orderType: 'gift_card'`, shared Zod schemas |
| Code and service | `packages/api/src/lib/gift-card-code.ts`, `services/gift-card.ts` | Generation, normalization, hashing; issue / redeem / void / refund / adjust, all transactional |
| Purchase and delivery | `routes/gift-cards.ts`, `services/gift-card-delivery.ts` | Purchase order, minting on payment verification, the delivery sweep and email template |
| Redemption | `routes/orders.ts` | Quote endpoint, the locked debit at payment initiation, full-coverage path, release on cancel |
| Refunds | `routes/admin/orders.ts` | Proportional split, both changed guards |
| Admin API and UI | `routes/admin/gift-cards.ts`, `packages/web/app/routes/admin` | CRUD, adjustment, outstanding liability, list and detail |
| Storefront | `packages/web/app` | `/gift-cards` page, checkout control, order surfaces |
| E2E | `tests/e2e` | Purchase through redemption through remainder |
