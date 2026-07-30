# Product grid: uniform alignment, multi-image hover, mesonart-identical styling

**Date:** 2026-07-30
**Status:** design approved, pending implementation plan
**Research basis:** [docs/research/mesonart-grid/README.md](../../research/mesonart-grid/README.md) — measured reverse-engineering of `mesonart.com`, captured 2026-07-30

---

## 1. Problem

The storefront grid has three defects and one missing capability.

**Defects (current code):**

| # | Defect | Evidence |
|---|---|---|
| D1 | Two different card ratios in production | `routes/posters/index.tsx:523` passes `uniformAspectRatio="aspect-[2/3]"`; `routes/index.tsx:251` passes `aspect-[3/4]` |
| D2 | Card chrome does not stretch to the grid row | `<a>` is the grid item and stretches, but the inner `div.card-hover` carrying `border border-border bg-card` is content-height. Within a row, products with style tags render a taller bordered box than those without — ragged bottom edges. |
| D3 | Skeleton ratio is hardcoded | `ProductCard.tsx:222` uses `aspect-[2/3]` regardless of the `uniformAspectRatio` prop, so the home page shifts layout on load→loaded |

**Missing capability:** no multi-image hover. Mesonart reveals 2nd–4th media on hover, positioned by cursor X.

**Root cause of D1–D3:** aspect ratio is a *decision made at three call sites* rather than an invariant. `ASPECT_RATIO_MAP` (`ProductCard.tsx:59-65`) maps `product.orientation` → a Tailwind class, and `uniformAspectRatio` exists to override it. Any component that renders a card must remember to pass the right override.

---

## 2. Approach

Move ratio from a per-call-site decision to a **pipeline-guaranteed invariant**, then delete the machinery that existed to manage the variation.

Two mechanisms, both measured from mesonart:

1. **Ratio lives on the in-flow `<img>`, not the wrapper.** Exactly one image per card sits in normal flow with `aspect-square`; it *is* the media box's height. All hover slides are `position:absolute; inset:0` and cannot contribute height.
2. **Rows align by CSS Grid stretch, not by height-locking text.** Mesonart's card heights genuinely differ (measured 359.88 / 376.88 / 379.88px) because titles wrap to 3 or 4 lines. Rows still align because `display:grid` sizes each row to its tallest item and stretches the rest. Measured across 104 cards: within every row all heights identical; between rows they differ.

**Consequence:** no `min-height`, no `line-clamp`, and no ratio branching are needed for alignment. That is the simplification this design buys.

### Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Target ratio | **1:1 square** | Chosen for **orientation neutrality**, not minimum mat — see the table below. It is the only ratio where portrait and landscape are treated identically (0-point spread), and the only one where square art is not letterboxed. A 4:5 box gives portrait *less* mat (35.5% vs 48.4%) but penalises landscape by 23 points and panoramic by 9; on a catalogue that is 13/40 square and 13/40 landscape-or-panoramic, that trade is not worth taking. |
| Hover image source | **Human-uploaded** | All photos including room mockups are curated and uploaded by a person. No auto-compositing. |
| Off-ratio handling, artwork | **Mat, never crop** | `fit:'contain'` at 88% inset on a flat mat. |
| Off-ratio handling, photos | **Human-chosen crop** | Fills the square edge-to-edge, no mat. The uploader picks zoom + position. The rule is "never crop *blindly*", not "never crop". |
| Dark mode | **Dropped** | Nothing in the codebase sets the `.dark` class — no theme provider, no toggle, no `classList.add('dark')`. The `.dark` block (`globals.css:93`) and 125 `dark:` utilities across 6 files are already unreachable. Single palette. |
| Styling | **Identical to mesonart** | Full measured token set in Appendix A. |
| Data migration | **None — reseed** | Product is pre-launch. No compatibility shim, no rollback path. |

**Mat area by candidate box ratio**, at the chosen 88% inset. Computed, not estimated:

| box | square 1:1 | portrait 2:3 | landscape 3:2 | panoramic 16:9 | portrait↔landscape spread |
|---|---|---|---|---|---|
| **1:1** *(chosen)* | **22.6%** | 48.4% | 48.4% | 56.4% | **0.0 pts** |
| 4:5 | 38.0% | **35.5%** | 58.7% | 65.2% | 23.2 pts |
| 3:4 | 41.9% | **31.2%** | 61.3% | 67.3% | 30.1 pts |

Read this as: square is the *even* choice, not the *tightest* one. 4:5 and 3:4 both frame a portrait poster more generously, and if the catalogue were portrait-dominant one of them would win. It is not — 26 of 40 products are square, landscape or panoramic.

### Rejected alternatives

- **Per-collection ratio prop** — a 1:1 asset in a 4:5 box must either double-mat (visible seam) or cover-crop (violates the no-blind-crop rule). Loses the single-canonical-asset guarantee.
- **Auto-composited room mockups from flat-on templates** — superseded by the human-upload decision. Also constrained by `sharp` having no perspective transform.
- **Blurred-fill / edge-sampled mats** — superseded: photos are now cropped to fill, so there is no surrounding space to fill.
- **BullMQ queue for image processing** — one image per request at ~400ms is fine inline. Reconsider only if the mat step measurably slows uploads.
- **Carousel library (Flickity/Embla) for the hover track** — mesonart uses Flickity with `draggable:false`, i.e. no gesture and no continuous motion. An opacity crossfade in ~20 lines beats ~25KB of carousel.
- **Warm-grey mat + warm off-white page** — dropped in favour of measured parity. Available later as a one-token change.

---

## 3. The asset contract

The spine of the design. The pipeline upholds it; the frontend is entitled to assume it.

```ts
// packages/shared/src/types/product.ts
export interface ProductImage {
  id: string
  url: string                  // processed square WebP
  altText: string
  type: ProductImageType       // 'main' | 'room-mockup' | 'detail' | 'texture' | 'frame-preview' | '360-view'
  sortOrder: number
  width: number                // always === height. Contract, not coincidence.
  height: number
  variants?: ImageVariant[]    // 150/400/800/1200 WebP, same 1:1
  /** Human-chosen crop window, normalised 0..1 against the original. Absent for type:'main'. */
  crop?: { x: number; y: number; w: number; h: number }
  /** Storage key of the unprocessed upload. Load-bearing: required to revise a crop. */
  originalKey: string
}
```

**Guarantees:**

1. `images[]` sorted by `sortOrder`; `images[0].type === 'main'`.
2. Every entry is exactly square (`width === height`), including room mockups. No slide can differ from the box.
3. Every entry has the same variant size ladder, so `sizes`/`srcset` is one shared constant.
4. `images.length >= 1` always; `>= 2` enables hover. One image degrades to a static card with no conditional CSS.

### Type reconciliation

Three incompatible shapes exist today and must collapse to one. This is in scope because the feature depends on `type`.

| Location | Current shape |
|---|---|
| `packages/shared/src/types/product.ts:328` | `{ id, url, thumbnailUrl?, altText, type, sortOrder, width?, height? }` |
| dev DB `products.images` jsonb | `{ id, url, alt, isPrimary, sortOrder, width, height }` |
| `packages/web/.../ProductCard.tsx:18` | `{ id, url, alt?, isPrimary?, webpUrl?, width?, height?, variants? }` |

The shared type wins. `isPrimary` is dropped — superseded by `type: 'main'` + `sortOrder`. `width`/`height` become required. `crop` and `originalKey` are added. Web and API both import from `@chobii/shared`; no local redefinitions.

`product.orientation` **stays** on the product as merchandising metadata (it drives filters and the detail page) but **stops touching layout**.

---

## 4. Image pipeline (API)

Extends `packages/api/src/lib/image-processing.ts`. `sharp@^0.34.5` is already a dependency.

```ts
export const MAT_COLOR = { r: 250, g: 250, b: 250 } as const  // must equal --mat. See §7.
export const MAT_CANVAS = 1500                                 // mesonart's master size
export const MAT_ART_INSET = 0.88                              // art occupies 88% of longest side

/** type:'main' — any input ratio, contained at 88% inset on the mat. Never cropped. */
export async function matToSquare(input: Buffer): Promise<Buffer>

/** photographic types — extract the human-chosen rect, resize to square. No mat. */
export async function cropToSquare(
  input: Buffer,
  crop: { x: number; y: number; w: number; h: number },   // normalised 0..1
): Promise<Buffer>
```

Both output `MAT_CANVAS × MAT_CANVAS` WebP.

| type | fills square | mat | framing decided by |
|---|---|---|---|
| `main` | no — inset to 88% | flat `MAT_COLOR` | automatic, never cropped |
| `room-mockup`, `detail`, `texture`, `frame-preview`, `360-view` | yes, edge-to-edge | none | human, at upload |

**Mat geometry** (88% inset guarantees a visible mat on every product, so square art does not bleed to the edge while portrait art floats):

```
1:1 box, art inset to 88% of longest side

 square 1:1     portrait 2:3    landscape 3:2   panoramic 16:9
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ ▓▓▓▓▓▓▓▓ │   │   ▓▓▓▓   │   │          │   │          │
│ ▓▓▓▓▓▓▓▓ │   │   ▓▓▓▓   │   │ ▓▓▓▓▓▓▓▓ │   │          │
│ ▓▓▓▓▓▓▓▓ │   │   ▓▓▓▓   │   │ ▓▓▓▓▓▓▓▓ │   │ ▓▓▓▓▓▓▓▓ │
│ ▓▓▓▓▓▓▓▓ │   │   ▓▓▓▓   │   │ ▓▓▓▓▓▓▓▓ │   │ ▓▓▓▓▓▓▓▓ │
│ ▓▓▓▓▓▓▓▓ │   │   ▓▓▓▓   │   │          │   │          │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
  6% all round   6% t/b         6% l/r         6% l/r
                 21% l/r        21% t/b        25% t/b
```

**No upscaling.** `withoutEnlargement: true` — a small source sits smaller on the mat rather than being interpolated. Admin warns when the source's long edge is under 1200px. Fake resolution is worse than a wider mat.

**Wiring.** `processImage()` is left untouched — it also serves avatars and AI generations, where squaring would be wrong. A thin orchestrator sits beside it and is called only by the product path:

```
routes/admin/products.ts  POST /upload-image
  multipart { file, type, crop? }
        │
        ├─ type === 'main' ? matToSquare(buf) : cropToSquare(buf, crop)
        ├─ processImage()          → existing IMAGE_SIZES ladder (150/400/800/1200 WebP)
        ├─ uploadOptimizedImage()  → existing S3/Minio + StoragePaths
        └─ uploadFile(original)    → StoragePaths.PRODUCTS + 'originals/' → originalKey
        ↓
  { url, key, originalKey, width, height, variants, type, crop? }
```

Variant machinery, S3 keys and `StoragePaths` are reused unchanged. Inline, no queue.

**Originals are retained** under an `originals/` prefix. Not for data preservation (nothing to preserve pre-launch) but because re-cropping and re-matting both require the untouched source.

**`MAT_COLOR` is a named constant, not configuration.** It is baked into pixels; pretending it is configurable invites a change that silently desyncs new products from old. The comment on it states that changing it requires reprocessing all products.

---

## 5. Card and grid (web)

### File split

Current `ProductCard.tsx` is 241 lines; adding scrub logic would exceed 350. Split along the one real seam — the media box is the only stateful part.

```
packages/web/app/components/product/
  productCardTokens.ts     MEDIA_RATIO, SIZES_ATTR, EASE_PRIMARY, EASE_FAST     ~15
  ProductCardMedia.tsx     square box, stacked slides, scrub state, dots        ~110
  ProductCard.tsx          shell: media + title + price + badges                ~120
  ProductCardSkeleton.tsx  extracted, imports MEDIA_RATIO                       ~30
  ProductGrid.tsx          grid only                                            ~80
```

All four constants are **Tailwind class strings or attribute values**, so they compose directly in `cn()`:

```ts
// productCardTokens.ts
export const MEDIA_RATIO  = 'aspect-square'
export const SIZES_ATTR   = '(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw'
export const EASE_PRIMARY = 'ease-[cubic-bezier(.3,1,.3,1)]'   // --animation-primary
export const EASE_FAST    = 'ease-[cubic-bezier(.7,0,.3,1)]'   // --animation-fast
```

**Deleted:** `ASPECT_RATIO_MAP`, the `uniformAspectRatio` prop on both components, the `size` variant map, and the `div.card-hover border border-border bg-card` wrapper. With no bordered box there is nothing to be ragged — D2 dissolves rather than being patched.

### Media box

```tsx
const [active, setActive] = useState(0)   // 0 = rest, 1..n-1 = hover slides

/** mesonart's rule, generalised past their hardcoded mediaCount === 2|3|4 */
function zoneFor(clientX: number, el: HTMLElement, n: number) {
  const { left, width } = el.getBoundingClientRect()
  const zones = n - 1                     // slide 0 is unreachable while hovering
  return Math.min(zones, Math.max(1, Math.ceil(((clientX - left) / width) * zones)))
}
```

```tsx
<Link to="/posters/$slug" params={{ slug }}            // @tanstack/react-router
      aria-label={title} tabIndex={-1}
      className="relative block overflow-hidden rounded-[var(--card-radius)] bg-mat"
      onPointerMove={e => e.pointerType === 'mouse' && setActive(zoneFor(e.clientX, e.currentTarget, images.length))}
      onPointerLeave={() => setActive(0)}>

  {/* in-flow: THIS sets the box height. Never absolute. */}
  <img src={images[0].url} alt={images[0].altText}
       width={images[0].width} height={images[0].height}
       loading="lazy" decoding="async" sizes={SIZES_ATTR}
       className="block w-full aspect-square object-contain" />

  {/* absolute: cannot set height */}
  {images.slice(1).map((m, i) => (
    <img key={m.id} src={m.url} alt="" aria-hidden
         width={m.width} height={m.height}
         loading="lazy" decoding="async" sizes={SIZES_ATTR}
         className={cn('absolute inset-0 hidden h-full w-full object-contain md:block',
                       'motion-safe:transition-opacity motion-safe:duration-500', EASE_PRIMARY,
                       active === i + 1 ? 'opacity-100' : 'opacity-0')} />
  ))}
</Link>
```

`object-contain` never fires, since the pipeline guarantees square. It is chosen over `cover` because `cover` would silently crop a bad asset. A dev-only assertion logs loudly on any `ProductImage` where `width !== height` — enforce the invariant rather than paper over it.

### Hover state machine

```
REST  active = 0
  slide 0 visible; dots opacity 0 + translateY(8px); quick-view opacity 0;
  quick-add translateY(8px) + opacity 0
    │ pointermove (mouse only)                      │ pointerleave
    ▼                                               ▲
HOVER  active = zoneFor(clientX)
  4 media:  x < W/3 → 1 · W/3..2W/3 → 2 · ≥2W/3 → 3
  3 media:  x < W/2 → 1 · else → 2
  2 media:  always 1
  slide 0 unreachable while hovering — hover always shows a different image
  dots → opacity 1 + translateY(0); quick-view → opacity 1;
  quick-add → translateY(0) + opacity 1
  card footprint unchanged (measured identical before/during on mesonart)
```

Verified on mesonart by entering fresh at 8 cursor fractions: `0.02/0.10/0.20 → 1`, `0.35/0.50/0.65 → 2`, `0.80/0.98 → 3`. Not time-based — holding still for 5.6s across 14 polls kept `selected-index="2"` frozen.

### Divergences from mesonart (deliberate)

1. **`sizes` on every image.** Their omission causes a measured 6.7× over-fetch — `width=1080` into a 160.75px card at 375px viewport. `SIZES_ATTR = "(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"`.
2. **Hover slides unmounted below `md`.** They ship them under `display:none` and still download all four per card.
3. **Keyboard reachability preserved.** They set Flickity `accessibility: false` plus `tabIndex={-1}` on the media link; acceptable only because the title is a separate real link, which we keep. Dots are `aria-hidden` decorative indicators rather than fake buttons, since every image is reachable on the product page.
4. **`motion-safe:` on all transitions.**

### Grid

```tsx
<ul className="grid list-none
               grid-cols-2 md:grid-cols-3 xl:grid-cols-4
               gap-x-[13.5px] gap-y-5">
```

Matches mesonart's measured column counts and `gap: 20px 13.5px`. Mesonart's `grid-flow-row-dense` is **not** carried over — it exists solely to back-fill holes left by their multi-cell `.product-card--promo` app blocks, which we do not have. Omitting it keeps DOM order and visual order identical, which matters for keyboard and screen-reader traversal.

Both call sites (`routes/posters/index.tsx:519`, `routes/index.tsx:248`) drop their conflicting `uniformAspectRatio` props — resolving D1. `ProductCardSkeleton` imports `MEDIA_RATIO` — resolving D3.

---

## 6. Admin upload

`ProductForm.tsx:393` already loops a multi-file picker into `POST /api/admin/products/upload-image`. The delta is a `type` selector and a crop step.

```
Admin → Product → Media
  [ main        ▾ ]  artwork.jpg      matted preview, no crop UI          ⠿
  [ room-mockup ▾ ]  living-room.jpg  ┌──────────┐  zoom ▁▂▃▅▆           ⠿
                                      │  drag to │
                                      │  reframe │
                                      └──────────┘
  [ detail      ▾ ]  texture.jpg      ┌──────────┐  zoom ▁▂▃▅▆           ⠿
  + add media
```

- `type: 'main'` → no crop UI; matted automatically.
- Photographic types → square viewport, drag to pan, scroll/slider to zoom. Default is the largest centred square, so a careless upload still yields something sane.
- Rows are drag-reorderable → `sortOrder`.
- Warning shown when the source's long edge is under 1200px.

**New dependency:** `react-easy-crop` (~15KB) in `packages/web`. It emits exactly the normalised rect the contract stores, and touch pan/pinch/zoom is more fiddly to hand-roll than it looks.

Request becomes `multipart { file, type, crop? }`; the route branches to `matToSquare` or `cropToSquare` and returns `originalKey` alongside the existing fields.

---

## 7. The one cross-boundary coupling

Worth naming because it is the thing most likely to rot: **the mat colour exists in two places that must agree.**

- `MAT_COLOR` in `image-processing.ts` — baked into WebP pixels by `sharp` on the server. CSS cannot reach it.
- `bg-mat` on the media box — visible during load and behind any transparency.

If they drift, every card flashes one colour then settles to another. Mitigation: a single exported constant in `@chobii/shared` consumed by both — TypeScript imports it directly; CSS receives it as the generated `--mat` custom property. A unit test asserts the two resolve to the same RGB.

Everything else in the card is a pure CSS token and changeable at will.

---

## 8. Seed and testing

**Seed** (not a migration — nothing to preserve). Downloads the 40 Unsplash sources once, mats each as `type: 'main'`, writes the new `ProductImage` shape with `originalKey`. Generates no room mockups, since those are human-uploaded; seeded products therefore have `images.length === 1` and render as static cards. One fixture product carries 4 hand-made images so the hover path is exercisable locally.

| Level | Assertion | Location |
|---|---|---|
| unit | `matToSquare` outputs 1500×1500 for 2:3 / 3:2 / 16:9 / 1:1 inputs. Art placement asserted by trimming the mat: `sharp(out).trim()` bounding box longest side === `1500 × 0.88` (1320) ±2px, and the box is centred ±1px. No upscaling: a 900px-wide source stays 900px wide on the canvas. | `packages/api/tests/` (Vitest) |
| unit | `cropToSquare` honours a normalised rect; clamps out-of-range rects | same |
| unit | `MAT_COLOR` and `--mat` resolve to the same RGB | same |
| unit | `zoneFor()` — 3-zone map for n=4, 2-zone for n=3, always-1 for n=2, generalised n−1 | `packages/web/tests/` |
| component | 1 image → no hover affordances; 4 images → 3 dots; `active` resets on pointer-leave; non-mouse `pointerType` ignored | Testing Library |
| **e2e regression** | **every card in a grid row has equal height, and every media box is square**, at 1440 / 1024 / 375 | `tests/e2e/` (Playwright) |

The e2e assertion is the one that matters — it is the actual property being bought, and it fails loudly if anyone reintroduces a ratio branch. Method mirrors how mesonart was measured: bucket cards by rounded `getBoundingClientRect().top`, assert one distinct height per bucket.

---

## 9. Out of scope

- Removing the 125 unreachable `dark:` utilities and the `.dark` block — unrelated cleanup, tracked separately.
- Auto-generated or AI-generated room mockups.
- Focal-point editing for `type: 'main'` (never cropped, so nothing to focus).
- Editable crop *after* upload — `originalKey` makes it possible later; no UI in this scope.
- Quick-view drawer behaviour. This spec covers the button's appearance and reveal only.
- Product detail page ratio (keeps natural ratio).
- Video media (`<video-media>` slides). The contract permits it; no implementation here.

---

## Appendix A — measured mesonart token set

Captured 2026-07-30 at 1440×900, DPR 1, on `/collections/landscape-canvas-paitning?filter.p.m.custom.style=Wabi-Sabi+Art`. Their tokens are space-separated **RGB** triples; chobii uses **HSL** triples with the same `hsl(var(--x) / alpha)` convention.

| mesonart | value | → chobii token | HSL |
|---|---|---|---|
| `--color-background` | `255 255 255` | `--background` | `0 0% 100%` *(unchanged)* |
| `--color-foreground` | `23 23 23` | `--foreground` | `0 0% 9%` |
| `--color-placeholder` | `250 250 250` | `--mat` **(new)** | `0 0% 98%` |
| `--color-border` | `23 23 23 / .1` | `--border` | `0 0% 9% / .1` |
| `--color-border-light` | `23 23 23 / .06` | `--border-light` **(new)** | `0 0% 9% / .06` |
| `--color-button-background` | `23 23 23` | — | `0 0% 9%` |
| `--color-button-text` | `255 255 255` | — | `0 0% 100%` |
| `--color-rating` | `245 158 11` (amber-500) | `--rating` **(new)** | `38 92% 50%` |
| `--color-sale-tag` | `225 29 72` (rose-600) | `--destructive` | `347 77% 50%` |
| `--card-radius` | `clamp(0.625rem, 1.053vw, 1.25rem)` | `--card-radius` **(new)** | 10→20px fluid |
| `--animation-primary` | `.5s cubic-bezier(.3, 1, .3, 1)` | `--ease-primary` **(new)** | — |
| `--animation-fast` | `.3s cubic-bezier(.7, 0, .3, 1)` | `--ease-fast` **(new)** | — |
| `--page-width` | `1600px` | — | — |

`--sp-*` is Tailwind's spacing scale 1:1 (`--sp-4` = `1rem` = `p-4`), so no spacing tokens are needed.

**Type** — Poppins + Urbanist, both free on Google Fonts. Loaded weights confirmed: Poppins 300/400/500, Urbanist 300/500.

```
body        Poppins 300 · 16px
headings    Urbanist 300
card title  Poppins 500 · 16px / 20px · #171717 · text-center
card price  Poppins 300 · 16px / 16px · #171717
  "From"    Poppins 400 · 12.8px · inline <small>
buttons     Poppins 400 · capitalize
```

Their theme defines a fluid `--font-product-size: clamp(1rem, 0.873rem + 0.3175vw, 1.25rem)`, but this collection pins `16px !important`. Take the 16px that actually renders.

**Card chrome**

```
card         background transparent · border 0
media box    background rgb(250 250 250) · radius clamp(10px, 1.053vw, 20px) · overflow hidden
grid         gap 20px (row) / 13.5px (column)
details      margin-top 11px
```

**Affordances**

```
quick-view   48×48 · radius 60px · bg #fff · backdrop-blur(12px) · fg #171717 · inset 16px
quick-add    171.6×40 · radius 60px · bg #171717 · fg #fff · padding 12.1px 22px · capitalize
             bottom 28px · justify-center (md+) / justify-end + 12px inset (mobile, 40×40 icon)
dots pill    104×24 · radius full · bg #fff · padding-inline 16px · bottom −14px · flex items-center
dot          5×5 ::before · radius full
             inactive  background #171717, no shadow
             active    background transparent, box-shadow 0 0 0 2px #171717   (a ring)
             transition background-color .5s cubic-bezier(.3,1,.3,1), box-shadow .5s same
```

**Computed transitions on the card**

| element | transition |
|---|---|
| images | `opacity .5s cubic-bezier(.3,1,.3,1), transform .5s cubic-bezier(.3,1,.3,1)` |
| dots pill | `opacity .5s …, visibility .5s …, transform .5s cubic-bezier(.3,1,.3,1)` |
| quick-add wrapper | `opacity .5s …, transform .5s cubic-bezier(.3,1,.3,1)` |
| quick-add / quick-view button | `box-shadow .5s cubic-bezier(.3,1,.3,1), opacity .3s cubic-bezier(.7,0,.3,1)` |

**Breakpoints** (measured; `media box height == card width` at every width)

| viewport | columns | card width | media height |
|---|---|---|---|
| 1536 | 4 | 258.1 | 258.1 |
| 1440 | 4 | 235.9 | 235.9 |
| 1280 | 4 | 195.9 | 195.9 |
| 1024 | 3 | 308.3 | 308.3 |
| 768 | 3 | 233.7 | 233.7 |
| 640 | 2 | 293.3 | 293.3 |
| 375 | 2 | 160.8 | 160.8 |

---

## Appendix B — accepted consequences of "identical"

Recorded so these are decisions rather than later surprises.

1. **The mat is near-invisible.** `#fafafa` on a pure-white page is ~2% contrast. This is verifiably their design (`--color-background: 255 255 255`). If it reads too subtly against the real catalogue, changing `--mat` is a one-token edit — but `MAT_COLOR` must change with it and all products must be reprocessed (§7).
2. **The brand colour leaves the grid.** Mesonart's CTA is neutral-900. `--primary: 25 95% 53%` (chobii's amber/terracotta) will no longer appear on product cards.
3. **Poppins 300 is a light body weight.** Fine at 16px on white; worth checking against existing copy density before adopting site-wide.
4. **Landscape room photos are cropped, not letterboxed.** By design, per the human-chosen crop decision. A 3:2 room photo loses ~33% of its width or the equivalent in height depending on the chosen window. The uploader sees exactly what will be kept.
