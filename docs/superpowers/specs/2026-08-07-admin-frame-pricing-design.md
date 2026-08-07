# Admin Frame Management and Pricing

**Date:** 2026-08-07
**Status:** Approved, ready for planning
**Blocks on:** ticket #566 (`plan/tracker-data/todo/feature-cart-checkout/ticket-0566-pdp-frame-options-drop-the-fla.yaml`)

## Problem

An admin cannot change what a frame costs. Frames are seeded in code
(`packages/api/src/database/seed-frames.ts`) and reach the storefront through a
single read-only endpoint. Changing the price of the gold frame is a code
deploy.

The storage is not the gap. The `frames` table
(`packages/api/src/database/schema/products.ts:243`) already gives every frame
its own two pricing columns:

- `priceModifier` `decimal(5,2)`, a multiplier, default `1.00`
- `priceAddition` `decimal(10,2)`, a flat rupee amount, default `0.00`

Seven rows are seeded, every one with `priceAddition: "0.00"`:

| name | type | priceModifier |
| --- | --- | --- |
| Rolled Canvas | rolled | 1.00 |
| Frameless | frameless | 1.33 |
| Stretch + Gold Frame | gold | 1.40 |
| Stretch + Silver Frame | silver | 1.40 |
| Stretch + Black Frame | black | 1.40 |
| Stretch + White Frame | white | 1.40 |
| Stretch + Wood Frame | wood | 1.40 |

So "price each frame type separately" needs no schema change to be
*representable*. What is missing is a write path: no admin route, no admin
screen. This document specifies both, plus the full frame CRUD around them.

### Why #566 blocks this

`frameAddition` in `packages/shared/src/constants/frames.ts:570` is the one
frame-pricing formula:

```ts
round(unitPrice * max(0, priceModifier - 1)) + priceAddition
```

The cart's POST and PATCH paths use it. The PDP does not — `posters/$slug.tsx:127`
re-derives frame price from `priceModifierValue` alone and drops `priceAddition`
entirely (ticket #566). Today that is harmless, because every seeded frame has
`priceAddition` of exactly `0.00`.

The moment an admin can type a flat addition into a frame, it stops being
harmless: the PDP quotes low, the quickview quotes correctly, and checkout
charges the correct higher number. This feature is the event that arms the bug.
So #566 lands first, on its own, against today's all-zero data where it can be
verified in isolation.

## Decisions

| Question | Decision |
| --- | --- |
| Scope | Full frame CRUD, not pricing-only |
| `frame_type` enum | Becomes free text; a new `category` enum carries display grouping |
| Swatch images | Uploaded to R2 under the existing `StoragePaths.FRAMES` prefix |
| Price safety | Live in-form price preview computed by the shared `frameAddition`; in-place save, no scheduling |
| Delete | Archive (`isActive: false`), never hard delete |
| #566 | Fixed first, as a blocking prerequisite |

## 1. Data model

```ts
// packages/api/src/database/schema/products.ts
export const frameCategoryEnum = pgEnum("frame_category", [
  "rolled",
  "frameless",
  "framed",
])

export const frames = pgTable("frames", {
  // ...
  type: text("type").notNull(),                        // was frameTypeEnum
  category: frameCategoryEnum("category").notNull(),   // new
  // ...
})
```

### `type` becomes text

The `frame_type` pg enum has ten values, seven in use, three dead (`none`,
`walnut`, `oak`). A hard ceiling of ten frames — three of them labelled for
woods nobody stocks — is not compatible with an admin who can create frames.

`type` becomes a free slug, validated `^[a-z0-9-]+$`, with a **unique index**.
Unique because `getFramePreviewColor` (`FrameSelector.tsx:409`) keys its swatch
fallback color map on `type`, and two frames sharing a type are
indistinguishable to any type-keyed lookup. All seven seeded rows are already
unique.

### `category` is a new enum

`type` is open-ended; `category` is genuinely closed. It is the three rungs of
mesonart's format axis that `frameGroupLabel` (`FrameSelector.tsx:158`) renders
as "Rolled Canvas/Frameless/Framed".

Today the component *infers* that grouping from `type` through a hardcoded
`frameCategoryLabel` (`FrameSelector.tsx:146`): `rolled` and `frameless` map to
themselves, everything else falls through to "Framed". That inference is exactly
what breaks the day an admin invents a type — a new moulding would silently land
in the right bucket only by accident, and a new *format* would land in the wrong
one with no error anywhere.

Making it a column the admin picks turns a client-side guess into data.
`frameCategoryLabel` is deleted; `FrameSelector` reads `frame.category`.

### Migration

Hand-written, **not** `drizzle-kit generate` output. Generate will not emit a
backfill, and dropping the enum before the backfill destroys the source data.
The order is load-bearing:

1. `ALTER TABLE frames ADD COLUMN category text;` — nullable for now
2. Backfill:
   ```sql
   UPDATE frames SET category = CASE type::text
     WHEN 'rolled'    THEN 'rolled'
     WHEN 'frameless' THEN 'frameless'
     ELSE 'framed'
   END;
   ```
3. `CREATE TYPE frame_category AS ENUM ('rolled','frameless','framed');`
   then `ALTER TABLE frames ALTER COLUMN category TYPE frame_category USING category::frame_category;`
   then `ALTER TABLE frames ALTER COLUMN category SET NOT NULL;`
4. `ALTER TABLE frames ALTER COLUMN type TYPE text USING type::text;`
5. `DROP TYPE frame_type;`

Step 5 must follow step 4 — Postgres refuses to drop a type a column still
references. Step 3's `SET NOT NULL` must follow the backfill, or it fails on the
seeded rows.

### What does not change

No foreign key changes. `cartItems.frameId` (`schema/cart.ts:123`) and
`orderItems.frameId` (`schema/orders.ts:318`) keep `onDelete: "set null"`.
Since nothing hard-deletes a frame, that clause never fires — which is the
point. A hard delete would silently null the frame off historical orders.

`export type FrameType` (`products.ts:328`) is derived from the enum and
collapses to `string`. Harmless: the storefront already treats frame type as a
plain string (`FrameSelector.tsx:409`, `stores/cart.ts:152`).

`availableSizes` is left alone — see Out of Scope.

## 2. API surface

New `packages/api/src/routes/admin/frames.ts`, mounted at `/api/admin/frames`
in `packages/api/src/index.ts`, behind the same admin auth middleware as its
siblings.

| Verb | Path | Behaviour |
| --- | --- | --- |
| GET | `/` | All frames including archived. Archived rows are returned, not filtered — the UI dims them rather than hiding them. |
| GET | `/:id` | One frame. |
| POST | `/` | Create. |
| PATCH | `/:id` | Partial update. |
| DELETE | `/:id` | **Archive**: sets `isActive: false`, mirroring `admin/products.ts:642`. Refused if it would leave zero active frames — a PDP with no format options is a broken buy panel. |
| POST | `/upload-image` | Multipart swatch upload. |

### Upload

Mirrors `admin/products.ts:250` for its size and MIME guards, but calls
`uploadOptimizedImage(buffer, filename, contentType, { prefix: StoragePaths.FRAMES })`
directly rather than `buildProductMedia`. No matting, no art-box measurement, no
crop window: those exist because artwork must never be cropped blindly. A frame
swatch is product photography and fills its square.

`StoragePaths.FRAMES` (`lib/storage.ts:76`) already exists with zero consumers —
a reserved prefix this is the first use of.

The response's variant ladder maps onto the two existing columns: `thumbnail`
variant to `thumbnailUrl`, `card` variant to `imageUrl`. One upload fills both;
the form has no second image field.

Both columns stay plain text, so the seven seeded rows pointing at
`/frames/*.png` in `packages/web/public/frames/` keep working untouched.

### Cache

Every mutation busts `CacheKeys.PRODUCT + "frames"`. Without it the 15-minute
TTL on `GET /api/products/frames` (`products.ts:862`) means an admin saves a
price, reloads the PDP, sees the old number, and saves again.

### Public endpoint

`GET /api/products/frames` adds `category` to its select. That is its only
change.

### Validation

In `packages/shared/src/schemas/product.ts`: `frameCategorySchema`,
`createFrameInputSchema`, and `updateFrameInputSchema = createFrameInputSchema.partial()`.

Price bounds:

- `priceModifier` in `[1.00, 5.00]`
- `priceAddition` in `[0, 99999.99]` — fits `decimal(10,2)`

The modifier floor is `1.00` rather than `0` because `frameAddition` already
clamps a below-one modifier to zero markup. Rejecting at the form is better than
accepting a number the pricing formula will silently ignore.

`PRODUCT_IMAGE_TYPES` and `MAX_PRODUCT_IMAGE_MB` are module-private in
`admin/products.ts:209-210`. The frames upload needs the same guards, so both
lift to a shared module rather than being copied. This is the same class of
duplicate the feature is already cleaning up elsewhere.

## 3. Admin UI

Files follow the products and collections shape exactly, at
`packages/web/app/routes/admin/frames/`: `index.tsx` (list), `new.tsx`,
`$id.tsx`.

Sidebar entry "Frames" joins the **Catalog** group beside Collections and
Categories (`AdminSidebar.tsx:137-143`), not the top level.

### List screen

Table columns: swatch thumbnail, name, type, category, modifier, addition,
active, sort order, row actions.

Archived rows render dimmed with an Unarchive action rather than being hidden.
Hiding them would make archiving irreversible through the UI.

### Form

One component serving both `new.tsx` and `$id.tsx`. Fields: name, type slug,
category select, description, material, thickness, color, swatch upload,
active, sort order, and the two price fields.

### Price preview

The preview is the reason the form exists in this shape. It sits beneath the
price inputs and recomputes as the admin types:

```
Gold Frame  ×1.40  +₹0
  on a ₹1,499 print    +₹600     → ₹2,099
  on a ₹4,999 print    +₹2,000   → ₹6,999
  on a ₹14,999 print   +₹6,000   → ₹20,999
```

Three reference prices rather than one, because a frame is priced as a
percentage precisely so its cost tracks the size of the piece. A single sample
row would conceal the behaviour the admin is choosing. The reference prices are
a constant in `@chobii/shared`, beside `frameAddition`.

**The preview calls `frameAddition()` from `@chobii/shared` directly.** Not a
reimplementation, not a display-formatted copy. This is the entire lesson of
#566: that bug exists because the PDP re-derived a formula the server already
owned. A preview with its own arithmetic would be the same bug in a new place,
and a worse one — it is the screen whose job is to convince the admin the number
is right.

## 4. Pricing invariants

Three surfaces must agree on what a frame adds, to the paisa:

1. the admin price preview,
2. the PDP and quickview quote,
3. the cart write.

After #566 lands, all three call `frameAddition`. That is the invariant the
tests pin.

Sitting carts keep their stored `framePrice` and are not repriced when the
catalogue moves (`cart.ts:791`) — deliberate, and unchanged here.

One pre-existing asymmetry, recorded rather than fixed: the add-to-cart dedupe
path recomputes `framePrice` from the *current* frame row against the line's
stored `unitPrice` (`cart.ts:796`). So a price edit does partially leak into an
existing cart line when the customer bumps its quantity. Out of scope; noted so
nobody rediscovers it as a regression from this feature.

## 5. Testing

- **Migration** — the seven seeded rows land in the right categories after
  backfill (`rolled`, `frameless`, and five `framed`), and every `type` value
  survives verbatim.
- **API** — create, patch, archive; archiving the last active frame is refused;
  every mutation busts the frames cache key; Zod rejects a modifier of `0.5` and
  of `9.0`.
- **Coupling test** — the admin preview and the server's cart quote produce an
  identical number for a frame carrying **both** a non-zero `priceModifier` and
  a non-zero `priceAddition`. This is #566's missing case, asserted from the
  admin side as well.
- **Web** — the form's preview is driven by `frameAddition`; `FrameSelector`
  groups on `category` rather than a hardcoded type map.
- **E2E** (per-feature, per repo convention) — admin edits the gold frame's
  price, the PDP quotes the new number, the cart charges it.

## 6. Ticket sequence

Prerequisite, in its existing home under `cart-checkout`:

0. **#566** — route the PDP and quickview through one shared client-side frame
   price calculation; add the both-non-zero test case.

Then, as a new feature:

1. Migration, schema, seed update
2. Shared Zod schemas, price bounds, lifted image guards
3. Admin API routes and cache busting
4. `POST /upload-image` via `StoragePaths.FRAMES`
5. Admin list screen
6. Admin form and live price preview
7. `FrameSelector` reads `category`; delete `frameCategoryLabel`
8. E2E

Separate, non-blocking cleanup ticket — delete the dead frame vocabulary:

- `ALL_FRAME_OPTIONS`, `ACTUAL_FRAME_OPTIONS`, `FRAME_BY_TYPE`, `getFrameByType`
  and the mat/glass constants in `shared/constants/frames.ts` (roughly 500
  lines) — zero consumers in `packages/api` or `packages/web`.
- `frameTypeSchema` (`shared/schemas/product.ts:548`), a Zod enum over a
  *different, hyphenated* frame vocabulary (`'poster-only'`, `'black-frame'`, …)
  sharing no value with the DB enum. Its own test asserts that
  `safeParse('black')` fails.
- `cartItemSchema` and `orderItemSchema` in `shared/schemas/checkout.ts:153,300`,
  the only consumers of `frameTypeSchema` — themselves consumed by nothing in
  `packages/api` or `packages/web`.

None of this is on a live path, so it carries no checkout risk and this feature
does not touch it. It is recorded here because it is a second, contradictory
frame catalogue sitting next to the one being made editable, and leaving it
there invites someone to wire the wrong one up.

## 7. Out of scope

- **`availableSizes` editing.** The column exists on `frames` and is selected
  into the public response (`products.ts:882`), but nothing reads it. Surfacing
  it in the admin form would promise a per-size availability filter the
  storefront does not enforce. Its fate is decided in the cleanup ticket.
- **Scheduled price windows.** `shippingConfig` (`schema/shipping.ts:148`) has
  `effectiveFrom`/`effectiveTo` for exactly this, and frames could follow. Not
  now: frames are not the sale lever the free-shipping threshold is, and the
  CRUD is already large.
- **Audit log.** No audit table exists anywhere in the schema. Adding the first
  one is its own decision, not a side effect of this feature.
- **Per-size price matrix.** A frame priced differently per print size, beyond
  what the multiplier already produces, would need a new table and a change to
  `frameAddition`'s signature, cart, and orders.
- **Cart repricing behaviour.** Unchanged, including the dedupe-path asymmetry
  described above.
