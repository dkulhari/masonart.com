# Sale promotions and gallery membership

**Date:** 2026-08-05
**Status:** design approved, pending implementation plan
**Closes:** [mesonart parity analysis §3.1](../../design/mesonart/mesonart-parity-analysis.md#31-global-chrome) — the two remaining ❌ rows in Global chrome (sale strip + countdown, floating offer tab) — and the "Sale/promo page" gap in §3.5.
**Features:** `sale-promotions`, `gallery-membership`

---

## 1. Problem

Mesonart runs a permanent 40%-off sale as the first thing any visitor sees, across four surfaces:

| Surface | Their behaviour |
|---|---|
| Sale strip | Beige bar above the header: `SUMMER SALE: DEALS STILL GOING 40% OFF.` + live countdown `11H : 43M : 47S` |
| Sale banner | Modal offering the discount in exchange for signing up |
| Rail tab | Once the banner is dismissed, a black vertical tab pinned to the right edge, mid-viewport, reading **Get 40% OFF**; clicking reopens the banner |
| PDP echo | `Hurry up! Sale ends in 11H : 45M : 42S` inside the buy panel (§1.4 item 6) |

We have none of it, and cannot build any of it today, because **there is no promotion entity anywhere in the system**:

| Evidence | State |
|---|---|
| `packages/api/src/database/schema/` | No coupon, discount or promotion table. Ten schema files, none of them pricing rules |
| `packages/api/src/routes/orders.ts:268` | `const discount = "0.00"; // TODO: Apply coupon if provided` |
| `packages/api/src/routes/orders.ts:298-299` | `couponCode` is stored verbatim from client input; `couponDiscount` is hardcoded `"0.00"` |
| `packages/api/src/database/schema/cart.ts:73-75` | `couponCode` / `couponDiscount` columns exist and are never written |
| `packages/shared/src/schemas/checkout.ts:100,228` | `discountTypeSchema` and `applyCouponInputSchema` exist as unimplemented contracts |
| `packages/web/app/components/layout/AnnouncementBar.tsx:11-14` | Comment records the sale strip as a deliberate omission, blocked on exactly this |

So a customer can type any coupon code they like into checkout and it is recorded on the order while changing nothing. That is the other half of the problem this design closes.

**Second requirement, from the same reading of their site:** the discount is account-gated. You "join" to get it. We are adopting that, under the name **the gallery**.

---

## 2. How online stores actually run sales

Researched 2026-08-05; sources in §12.

**Automatic discounts vs codes.** Automatic discounts apply without customer action and are the standard for storewide and segment sales; codes are for targeted campaigns, influencers and per-recipient exclusives. A code the customer must find and paste is friction on a sale whose whole purpose is to be unmissable.

**The compare-at trap.** The common shortcut — inflate a "compare at" price and call the difference a discount — makes the discount invisible to reporting and distorts gross figures. Discounts should be recorded as discounts on the order.

**Depth.** Prevailing bands: 10–20% for email capture and repeat purchase, 25–40% for flash sales and abandonment recovery. 40% is flash-sale depth, which is what mesonart is claiming to run.

**Gating works.** Popups carrying a discount convert around 7.65% against 5.10% for incentive-free capture. Percent-off is the dominant incentive among top performers. Minimal fields — email alone — convert best.

**The dismissed-popup teaser is a known pattern.** A sticky teaser that persists after the visitor closes the offer, following them across the site so they can convert later in the session, is documented practice. Mesonart's black vertical rail is exactly this pattern. It is not decoration; it is the recovery path for a dismissed offer.

**Frequency.** Once per session, then roughly weekly if the visitor does not take it.

**Guardrails are the thing most stores skip.** Analysis of 117M Shopify discounts found the overwhelming majority run without usage caps, eligibility rules or minimum thresholds. Our model carries per-customer limits and an exclusion list from the first migration rather than after the first incident.

---

## 3. Decisions taken

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Discount mechanics | **Automatic only.** No codes anywhere | The sale is storewide-shaped. A code is friction on an offer that must be unmissable, and we would need a code-issuance system to gate it |
| D2 | What logged-out visitors see | **Teased price, gated at cart.** Grid and PDP show base struck through, sale price beside it, "Members" tag. Cart shows the saving as locked with a Join button | The price is real and reachable, so it is a teaser and not bait. A gate with no visible number gives the visitor nothing to want |
| D3 | Targeting | **Scope + exclusions.** One promotion targets the whole catalogue, a filter (style / subject / room / featured), or a hand-picked product list — plus an exclusion list that always wins | Covers "all products" and "these ones" in one model. A rule engine is not needed for one 40%-off sale |
| D4 | What "the gallery" is | **Registered account + explicit opt-in flag** (`galleryMember`, `galleryJoinedAt`, consent timestamp) | Gives a genuinely consented marketing list. Treating any account as a member would silently enrol every past customer and give consent we were never granted |
| D5 | Countdown | **Rolling window per visitor**, clamped by the real end. Configurable per promotion | §6. Deliberate; the deception is a config field, not hardcoded |
| D6 | Stacking | **Never.** Highest `priority` wins, ties broken by deeper discount | One price per product. Stacking rules are where discount systems become unauditable. Scope of D6 is promotion-vs-promotion only — codes are D8 |
| D7 | Tracker shape | Two features: `sale-promotions`, `gallery-membership` | Promotions can ship ungated and useful; membership is independently testable |
| D8 | Codes and gift cards | **Out of scope to build, reserved in the model.** Promotion money and code money live in separate columns (§4), and the layering order is fixed now (§5) | A shared `discount` column makes a settled order unattributable after the fact — you cannot tell a sale from a code six months later. One column and one paragraph now, versus a data migration and a resolver rewrite later |

**Out of scope** (YAGNI — named so they are not re-litigated per ticket): discount codes, stacking, BOGO / tiered / volume discounts, minimum-cart thresholds, loyalty tiers or points, scheduled email sends to the member list, multi-currency sale pricing, per-variant or per-size discount depth.

**Gift cards are not a discount** and never enter this feature. A gift card is **tender**: it applies after tax against the amount due, carries a balance, is partially consumable, and refunds return to it. It must never reach `resolveSalePrice` and must never be written to a discount column. The separate `gift-cards` feature owns it. The one input Shopify labels "Discount code or gift card" (as seen at mesonart's checkout) is a single box routing to two unrelated systems — copying the label is not copying the design.

---

## 4. Data model

New file `packages/api/src/database/schema/promotions.ts`, exported from `schema/index.ts`. Mirrored in `packages/shared/src/schemas/promotion.ts`.

```
promotion
  id                    uuid pk
  name                  text          -- internal: "Summer Sale 2026"
  headline              text          -- shown: "SUMMER SALE — 40% OFF EVERYTHING"
  discountType          enum('percentage','fixed')
  discountValue         integer       -- 40, or paise for 'fixed'
  scopeType             enum('all','filter','products')
  scopeFilter           jsonb null    -- { styles[], subjects[], rooms[], isFeatured }
  membersOnly           boolean       default true
  startsAt              timestamptz
  endsAt                timestamptz null
  isEnabled             boolean       default false
  priority              integer       default 0
  perCustomerOrderLimit integer null
  countdownMode         enum('real','rolling')  default 'rolling'
  rollingWindowMinutes  integer       default 720
  rollingJitterMinutes  integer       default 90
  createdBy             text -> user.id
  createdAt, updatedAt

promotion_product    (promotionId, productId)  pk both   -- scopeType='products'
promotion_exclusion  (promotionId, productId)  pk both   -- always wins, any scopeType
```

**State is derived, never stored.** A promotion is active when `isEnabled && now >= startsAt && (endsAt is null || now < endsAt)`. There is no `status` column to fall out of sync, and a sale ends without anyone remembering to switch it off.

**`endsAt` is private.** It is never serialized to the storefront — only the resolved countdown deadline crosses the wire (§6), so the real end date is not sitting in the network tab.

**Order-side additions** — `packages/api/src/database/schema/orders.ts`:

- `orders.promotionId` → `promotion.id`, nullable
- `orders.promotionDiscount` decimal(10,2) default `'0.00'` — **new**
- `order_items.itemDiscount` (already declared, line 258) starts being written

**One bucket per discount source.** `orders.discount` already exists (line 171) alongside `orders.couponDiscount` (line 179). The promotion does **not** write into either. Instead:

```
orders.promotionDiscount  -- this feature, automatic, line-level
orders.couponDiscount     -- reserved for D8, order-level, stays '0.00'
orders.discount           -- derived total: promotionDiscount + couponDiscount
```

`orders.discount` is what the customer saved and what the invoice shows; the two source columns are what reporting attributes. Writing the promotion into the shared `discount` column and nothing else would settle orders that cannot be attributed once codes exist — a report cannot separate "the sale worked" from "someone leaked a code". Adding the column now costs one migration line; adding it after orders exist costs a backfill that has no source data to backfill from.

`orders.couponCode` stays, and stays **unwritten from client input** (§5). Today `routes/orders.ts:298` persists whatever string the request sends beside a hardcoded `couponDiscount: "0.00"` — an order record that claims a code was applied when none was.

This is the §2 "compare-at trap" avoided deliberately: the discount is recorded as a discount, so revenue reporting stays honest even while the countdown is not.

---

## 5. Pricing resolution and enforcement

**One resolver, `packages/api/src/lib/promotion-pricing.ts`** — modelled on `product-sales.ts`, which is the existing precedent for a derived pricing/ranking signal.

```ts
resolveSalePrice(product, activePromotions, { isMember })
  → { promotionId, percentOff, basePrice, salePrice, locked } | null
```

- `locked: true` means a sale price exists but the viewer is not a member — the surfaces render the price and the gate, and the cart charges base.
- Active promotions are cached in-process with a 60s TTL. The table is tiny and read on every product request.
- Rounding happens **per line**, half-up, to 2dp — never on the cart subtotal, or line sums stop reconciling with the total.

**Callers** (the same function, never reimplemented): product list, product detail, cart read, order creation, `/sale` page.

**Stored `lineTotal` stays a base price.** `cart.ts:196-204` computes `(unitPrice + framePrice) * quantity` and stores it on the row at add-to-cart time. Promotion pricing must **not** be baked into that column: a cart sitting for three days across the end of a sale would otherwise still charge the sale price. Sale price is resolved at read time and returned alongside the stored base as `{ base, sale, locked }`.

**The server is the only authority.** Order creation re-resolves from the database and ignores any price the client sends. If the viewer is not a member at the moment the order is created, they pay base — the gate cannot be bypassed by holding a cart open through a logout. `perCustomerOrderLimit`, when set, is enforced at the same point by counting that customer's settled orders carrying the `promotionId`.

**No code is read from the request.** `routes/orders.ts:298` currently writes `couponCode: input.couponCode` — unvalidated client text stored next to a hardcoded zero discount. This feature has no codes (D1), so order creation writes `couponCode: null` and drops `couponCode` from the create-order input schema (`routes/orders.ts:75`). The checkout UI already has a complete coupon input at `OrderSummary.tsx:201` that never renders, because no caller passes `onApplyCoupon` — it stays dormant, and is the seam a future D8 would wire up.

**Layering order — fixed now, built later.** Even with codes out of scope, the order in which money comes off has to be settled before the resolver exists, because it determines what `resolveSalePrice` returns and what the totals code composes:

```
1. line base price            (cart.ts stored lineTotal)
2. − promotion discount       per line, half-up 2dp   → order_items.itemDiscount
   = discounted line subtotal → orders.subtotal
3. − code discount            order level, applied to the ALREADY-discounted subtotal
                                                       → orders.couponDiscount   [D8, unbuilt]
4. + shipping
5. + tax                      on the post-discount amount
   = orders.total
6. − gift card                tender against the total, not a discount [gift-cards feature]
   = amount charged to Razorpay
```

A code applies to the discounted subtotal, not the base — otherwise a 40% sale plus a 20% code takes 60% off the base and the two discounts can exceed the price. Tax is computed after discounts because the customer is taxed on what they pay. The gift card sits below tax because it is payment, not price.

**Checkout already requires an account** (`orders.ts` builds the order from `user.id`), while carts support guests via a cookie session (`cart.ts:272-276`). So the funnel is: guest browses and sees the teased price → adds to cart → cart shows the locked saving → join → price unlocks. The gate sits where the customer was already going to have to register.

---

## 6. The countdown

**This is a deliberate urgency device, and it is configured, not hardcoded.**

Resolution runs server-side during SSR — no hydration flicker, and no client clock to tamper with:

1. Cookie `promo_deadline_<promotionId>` holds this visitor's deadline. Absent or already past → mint `now + rollingWindowMinutes − rand(rollingJitterMinutes)` and set it. The jitter stops every visitor seeing an identical `12:00:00`.
2. Displayed deadline = `min(cookieDeadline, endsAt)` when `endsAt` is set. When the sale genuinely is ending, the number drops below the usual window on the next load. The displayed time never exceeds the time actually remaining.
3. Timer reaches zero mid-session while the sale is still live → the next load mints a fresh window. This is mesonart's "DEALS STILL GOING" behaviour.
4. `countdownMode = 'real'` → the deadline is `endsAt` and the cookie is unused.

**Legal note, recorded once so the decision is traceable.** India's CCPA *Guidelines for Prevention and Regulation of Dark Patterns, 2023* list "false urgency" as a named dark pattern, and chobii.art sells INR-domestic, so that is the applicable regime (penalties under the Consumer Protection Act, 2019). The practice is widespread and weakly enforced; the business has taken the risk knowingly. `countdownMode` exists so the behaviour can be switched to a truthful countdown in a single admin edit, without a deploy, if that ever changes.

**What stays honest regardless:** no active promotion → no strip, no countdown, no banner, no rail, no badges, and the announcement bar reverts to its shipping and returns messages. There is no hardcoded "40% OFF" string in any component. The discount amount, the headline and the eligible products all come from the row. The urgency is manufactured; the *price* is not.

---

## 7. Storefront surfaces

| Surface | Behaviour | Location |
|---|---|---|
| Sale strip | Headline + `HH : MM : SS`, beige band above the announcement bar. Renders `null` with no active promotion | `AnnouncementBar.tsx` (comment at 11-14 rewritten, not deleted — the constraint survives, only the reason it was unbuildable expires) |
| Sale banner | Modal: headline, depth, single email field, "Join the gallery". Once per session; 7-day cooldown after dismissal | new `components/promo/` |
| Rail tab | Black vertical tab, right edge, mid-viewport, `Get 40% OFF` from the promotion row. Appears when the banner is dismissed or cooled down; click reopens the banner | new `components/promo/` |
| Product card | Base struck through, sale price, "Members" tag when `locked` | `components/product/ProductCard.tsx` |
| PDP buy panel | Same, plus the countdown echo (their §1.4 item 6) | `routes/posters/$slug` |
| Cart | Per-line saving; when `locked`, the saving row reads as locked with a Join button | `routes/cart` |
| `/sale` page | Grid of eligible products, promotion headline, countdown. Red **Sale** link in nav row 2 | new route; closes parity §3.5 |

Every one of these reads the same resolved payload. None of them computes a discount.

---

## 8. Gallery membership

`packages/api/src/database/schema/users.ts` gains: `galleryMember boolean default false`, `galleryJoinedAt timestamptz null`, `marketingConsentAt timestamptz null`, `joinSource text null` (`banner` / `rail` / `cart` / `registration` / `sale-page`).

`POST /api/gallery/join` — authenticated, idempotent, sets all four. Membership is returned in the session payload so every surface can resolve `locked` without an extra request.

**Guest flow:** the banner takes an email → routes to registration with `?join=gallery` → the intent survives the auth redirect → on first successful session the user is joined automatically and lands back where they were, with the price now unlocked. Registration also carries an opt-in checkbox for people who arrive the ordinary way.

**Consent is a timestamp, not a boolean**, because that is what has to be produced if the consent is ever questioned. Existing customers are not backfilled as members — they see the same join prompt as anyone else. That is the point of D4.

---

## 9. Admin

`/admin/promotions` — list plus editor, following the existing admin route patterns (`routes/admin/products`, `routes/admin/reviews`).

The editor sets: name, headline, depth, scope (all / filter / product picker), exclusion picker, `membersOnly`, `startsAt` / `endsAt`, `isEnabled`, `priority`, `perCustomerOrderLimit`, and the countdown block (`countdownMode`, window, jitter) with the §6 note inline in the form so whoever configures it knows what they are switching on.

`/admin/customers` gains a gallery-member filter and a consented-email export.

---

## 10. Testing

- **Unit** (`promotion-pricing.test.ts`): scope matching for all three `scopeType`s; exclusion beats every scope; no stacking under equal and unequal priority; `locked` for non-members; rounding at line level; inactive promotions (disabled, not yet started, expired) resolve to `null`.
- **Countdown**: fresh visitor mints a window; returning visitor within the window sees it continue; expired cookie re-mints; `min(rolling, endsAt)` clamps near the real end; `countdownMode='real'` ignores the cookie.
- **Integration**: cart read returns `{base, sale, locked}`; order creation writes `promotionId` and real discount figures; a client-supplied price is ignored; a non-member at order time pays base; `perCustomerOrderLimit` blocks the second order.
- **E2E** (`tests/e2e/`, per the per-feature cadence in `.claude/CLAUDE.md`): full lifecycle — no promotion renders nothing anywhere → active promotion shows strip, timer, badges → expiry reverts prices and removes all chrome. Guest sees locked price → joins → price unlocks. Banner dismiss → rail appears → click reopens.

Scope selectors for mobile vs desktop trees, per the gotcha in `.claude/CLAUDE.md`.

---

## 11. Ticket map

**`sale-promotions`** — schema and shared types → resolver → product/cart/order surfaces → admin API and UI → countdown → strip, badges, cart lock, `/sale` page → E2E.

**`gallery-membership`** — user fields → join endpoint and session payload → registration opt-in and post-auth auto-join → join modal → banner → rail → member state hook → admin members list → E2E.

Membership's schema and endpoint work runs parallel to promotions; its UI depends on the resolver returning `locked`. Ticket numbers, phases and TDD steps are generated by `/tt-plan-feature` against each feature.

---

## 12. Sources

- [Shopify discount codes guide (2026) — Seguno](https://www.seguno.com/blog/shopify-discount-codes-guide)
- [Shopify Discount Strategy Guide 2026 — EasyApps](https://easyappsecom.com/guides/shopify-discount-strategy)
- [Automatic Discounts vs Discount Codes — Discountray](https://discountray.com/blog/automatic-discounts-vs-discount-codes/)
- [Shopify Automatic Discounts: Complete Guide for 2026 — Adsgun](https://adsgun.com/shopify-automatic-discounts-guide/)
- [Email Popup Examples & Best Practices: 2026 Conversion Guide — Claspo](https://claspo.io/blog/email-pop-up-examples/)
- [27 Popup Best Practices for High Conversions — Wisepops](https://wisepops.com/blog/popup-best-practice)
- [Discount Popup: 8 Examples & Best Practices — Wisepops](https://wisepops.com/blog/discount-popup)
- [Email Popup Examples and Best Practices for Ecommerce Signups — Omnisend](https://www.omnisend.com/blog/email-popup-examples/)
