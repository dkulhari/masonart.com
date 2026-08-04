# chobii.art — mesonart Parity Plan of Action (tt-skill-driven)

| | |
|---|---|
| Status | **Six features delivered** (2026-08-04, #387–#414). Phase A (#376–#385), the Phase E size slice (#386), Phase B and Phase C complete — Phase C genuinely so as of #404–#414, which closed the three §3.3 items the first pass had left open. Phase D (home rebuild), the Phase E PDP restructure and Phase F (new pages) remain. |
| Date | 2026-08-04 |
| Input | [mesonart-parity-analysis.md](mesonart-parity-analysis.md) — measured, re-verified 2026-08-04 |
| Scope | Structural and stylistic parity only. Not their logo, copy, artwork, artist names or photography — see the analysis' scope note |

Turns the analysis' §6 phase plan into a concrete sequence of tt-skill invocations. Phase letters below are the analysis' letters, not ticketrack features; each phase maps to one or more features.

## Where we are

**Phase A — design-system compliance. Done.** All 8 items of §6 Phase A across #376–#385: Urbanist 300 headings consumed at the base layer, orange primary retired for the measured near-black pill, beige band and peach highlight tokens, gradients and blur blobs stripped, rating token adopted, page 1400→1600px at a 20px gutter, fluid `clamp()` scales, split-word `DisplayHeading`. Plus a `Button` primitive (none existed — that absence is how orange reached 54 files) and a repo-wide compliance guard at `packages/web/tests/styles/storefront-token-compliance.test.ts`.

**Phase E — size slice only. Done.** #386 wired `getSizesForOrientation()` in as the source of truth for seeded variants, extended the three ladders to the measured step counts, replaced hand-entered per-variant prices with area pricing at the measured ~31% volume taper, and moved labels to dual-unit inline. The rest of Phase E — PDP restructure — is untouched.

**Phases B and C — done**, as features 2–6 below. **Phase D, the Phase E PDP restructure and Phase F remain**; see *What remains*.

**Phase C was declared done early.** Features 2 and 3 shipped the collection page and this document said Phase C was complete, while three §3.3 items were still open: the Discover chip carousel (§1.3.2) was never built, promo tiles (§1.3.6) had no component anywhere, and sort stood at 6 options against mesonart's 9. Feature 6 (#404–#414) closed them.

Two of those three were not blocked on anything. **Featured** was reachable through the API the whole time — it merely sorted nulls first, and `featuredOrder` is null on most of the catalogue, so the option would have led with the products nobody featured. The Discover chips were recorded here as blocked on per-collection photography; they are not, because a chip can borrow the main image of a representative product in that style. Only **Best selling** genuinely lacked a signal, and `order_items` had carried one all along.

## Build order, and why it departs from §6

§6 lists B before C. We run **C before B**, for four reasons:

1. **C is on the critical path; B is a leaf.** C's facet/metadata work (§4) is the prerequisite for D's Shop-by-Room live counts and part of F. Nothing depends on B.
2. **C cashes in Phase A.** The beige header band is `SectionBand tone="beige"`; the display H1 is `DisplayHeading`. Both were built for Phase A and are currently used only on the home page.
3. §3.3 calls the collection page "closest already" — small work closes a visible gap.
4. **B's most distinctive element has nothing behind it.** There is no promotion entity anywhere in `packages/api/src/database/schema/`. A countdown to a sale that does not exist is precisely the fabricated-urgency dark pattern the analysis' *Dependencies and risks* section forbids. The sale strip waits for a real promotion concept.

Wishlist is pulled out ahead of both: B needs a header count badge and C needs a card heart, `users.wishlistProductIds` already exists as a column, and no API routes do. Building it once beats half-building it twice.

## Feature sequence

Two of these already exist in ticketrack as empty todo features — use them, do not create duplicates.

| # | Feature | ticketrack | Covers | Est |
|---|---|---|---|---|
| 1 | `wishlist` | ✅ **done** — #387–#389 | API routes over the existing column, `useWishlist` store, heart on card + PDP, header badge | 0.5–1 d |
| 2 | `collection-page-parity` | ✅ **done** — #390–#394 | Beige header band + breadcrumbs, sticky toolbar (hide-filters, count, sort pill), facet-count API + sidebar counts, card star row, lazy-load paging | 2–3 d |
| 3 | `product-metadata-facets` | ✅ **done** — #395–#399 | §6 Phase C data half + §4: facet vocabularies to shared constants, new `vibe`/`aesthetic`/`medium`/`uniqueness`/`availability`, Room 7→12, Subject 9→17, Orientation +Circle/+Set-of-2-3, filter API params, reseed | 2–3 d |
| 4 | `global-chrome-parity` | ✅ **done** — #400–#402 | §6 Phase B minus the sale strip: centered wordmark, right cluster, two-row nav, announcement bar, footer USP row + contact column + beige restyle | 2 d |
| 5 | `advanced-search` | ✅ **done** — #403 | Search drawer over the existing `GET /api/products/search`, wired into the new header | 1 d |
| 6 | `collection-page-parity-remainder` | ✅ **done** — #404–#414 | The three §3.3 items feature 2 left open: Discover chip carousel, promo tiles, sort 6→8. Plus the real popularity signal behind Best selling — live sales aggregate, curator pin, admin visibility — and the seeded orders/reviews both signals needed | 1.5 d |

### What was delivered

**Feature 1 — wishlist (#387–#389).** Four auth-gated routes over the `users.wishlistProductIds` column that had existed with nothing reading it. Add/remove are atomic SQL (`array_append` guarded by containment, `array_remove`) rather than read-modify-write, so two tabs cannot clobber each other, and both are idempotent because the UI is an optimistic toggle. The heart is monochrome — `--sale` is reserved for sale prices. The PDP button that had carried `aria-label="Add to wishlist"` and no handler is now wired.

**Feature 2 — collection-page-parity (#390–#394).** Beige header band with breadcrumbs + `BreadcrumbList` JSON-LD; sticky toolbar carrying the count and a sort pill (sort moved out of the filter sidebar, where mesonart does not put it); `GET /api/products/facets` plus a review aggregate on the list; sidebar counts with zero-count options *disabled rather than hidden*; a card star row that renders **nothing** when a product has no approved reviews; and lazy-load paging where `?page=N` means "everything up to N", fetched in one widened request.

**Feature 3 — product-metadata-facets (#395–#399).** Nine facet vocabularies from §1.3, adopted verbatim, as the single source of truth in `@chobii/shared`. Found a **third** parallel vocabulary while doing it: `constants/styles.ts` held `STYLE_CONFIGS`/`SUBJECT_CONFIGS`/`COLOR_CONFIGS` referenced nowhere outside its own test — dead but fully tested, exactly the state the size ladders were in. Now deprecated with a pointer. Five new columns, validated filter params (which also closed a hand-escaped `sql.raw` path), and deterministic seeding so a reseed reproduces the same catalogue.

**Feature 4 — global-chrome-parity (#400–#402).** Announcement bar, centred wordmark, a styles nav row generated from the shared vocabulary, footer USP strip and contact column.

**Feature 5 — advanced-search (#403).** A drawer over the search endpoint that had existed for months with no way to reach it.

**Feature 6 — collection-page-parity-remainder (#404–#414).** `GET /api/products/collections` returns a display-ready row per style — count plus the main image of a representative product — so the Discover rail needed no curated assets. `PromoTile` occupies one grid cell and renders the catalogue's approved-review aggregate *or nothing*: below ten approved reviews it returns null rather than round a thin sample into a marketing number. Sort went 6→8; "Most relevant" stays out because on a collection page with no query there is nothing for relevance to mean.

Best selling is a correlated scalar subquery over `order_items` joined to settled orders — **not** a join, because the list query already joins `reviews` and groups by product, so a second join fans the rows out and silently multiplies both `sum(quantity)` and `count(reviews.id)`. `products.isPopular`/`popularOrder` let a curator lift a product above that ordering; the admin list shows the real units-sold figure beside the pin so the two can be seen to disagree.

#414 seeded twelve settled orders and fourteen reviews, which is what turned both signals from structurally-correct-but-empty into visible: the catalogue now reads 4.5 from 12 approved reviews and Best selling ranks 5/4/3/3/3/2 units. Two orders are voided and `paper-layers` appears only in those, so a regression that starts counting cancelled orders shows up as that product gaining sales from nothing.


### Corrections to the analysis, found while building

- **"No active-filter chips" was already wrong** — `ActiveFilterTags` existed on both mobile and desktop.
- **The product API returned no review data at all**, despite populated reviews tables. That, not the card, was why stars were missing.
- **Facet vocabularies are hardcoded literals** in `ProductFilters.tsx` while the API validates them as unconstrained comma-separated strings. No single source of truth — the same disease the size ladders had. Feature 3 is the fix.
- **The `sql.raw` ARRAY construction in the products filter escapes quotes by hand.** Safe only because the vocabularies are fixed; feature 3 should close it properly.
- **`sortBy` is declared in three places** — the API zod enum, `ProductFilters.SortOption`, and `lib/api.ts`. Adding a sort value means touching all three and only the typecheck catches the one you forget. Same disease as the facet vocabularies feature 3 fixed; sort was not part of that sweep.
- **`hooks/useReviews.ts` fetches against a relative `API_BASE = '/api'` and there is no Vite proxy for it**, so those requests never leave the dev server. Found because the promo tile rendered in jsdom and never in the browser while the endpoint answered curl perfectly. The catalogue-stats fetcher moved to `lib/api.ts`, which uses `getApiUrl()`; every other fetch in that hook still has the original shape.
- **`tests/routes/products.test.ts` has a stale assertion**: `should filter by styles` requests `?styles=minimalist,abstract`, ids outside the vocabulary feature 3 introduced, so the 400 it gets is correct and the test is wrong.

### What remains

Unchanged from the analysis, and all still blocked on the same things:

- **Phase D — home rebuild.** Hero slideshow, Best Seller tabs, Popular photo tiles, Shop-by-Room band. Needs lifestyle photography that does not exist.
- **Phase E — PDP restructure.** Vertical thumb rail, zoom modal, buy-panel reorder, price-in-CTA pill, trust accordions, Visually Similar / More to Love. The size slice (#386) is the only part done.
- **Phase F — new pages.** Artists, Reviews, Trade, Commission, Gift Card, Blog, and the wishlist *page* (feature 1 shipped the affordance and the badge, not the destination).
- **The sale strip and its countdown.** Still blocked on a promotion entity; a countdown to a sale that does not exist stays out.
- **Two loose ends from §5.6**, recorded when they were found: the admin variant endpoints still accept arbitrary sizes and prices rather than reading the ladder, and `SizeSelector`'s "Show in cm" toggle is now both redundant against dual-unit labels *and* dead (its `onClick` body is empty).
- **"Most relevant" sort**, the ninth option. Not blocked on a signal — blocked on a definition. It only means something alongside a search query, and the collection page has none.
- **Best selling reflects seeded orders, not trade.** #414's twelve orders are dev fixture data. The query is real; the numbers become meaningful when real orders arrive.

## Per-feature execution loop

For each feature in the order above:

1. `/tt-new-feature <name> "<description>"` — skip for `wishlist` and `advanced-search`, which already exist; use `/tt-edit-feature` if their description needs the parity context.
2. `/tt-plan-feature <name>` — phased tickets with structured TDD steps, created only when the feature is up next so tickets carry real file paths rather than guesses.
3. `/tt-implement-feature <name>` — autonomous TDD implementation, commits carry `(#NN)`.
4. `/tt-feature-status <name>` — all tickets done, no blockers.

**Support skills anytime:** stray bug/task → `/tt-new-ticket` + `/tt-work-ticket` · failing suite → `/tt-fix-tests` · UI investigation → `/tt-debug-browser`.

## Gates

Every feature must leave these green before the next one starts:

- `cd packages/web && bunx vitest run` — **1753 passing, 0 failing** as of #414 (1715 as of #403). No new failures.
- `cd packages/shared && bunx vitest run` — **880 passing**, 0 failing. No new failures.
- `cd packages/api && DATABASE_URL='postgresql://poster_app:dev_password@localhost:5440/poster_app_dev' bunx vitest run` — **~22–36 failing is the baseline**. Pre-existing AI/redis/queue/auth/health suites, and the failing *file set* varies between identical runs under parallelism — confirm any suspected regression by running the single file alone before believing it.
  **Set `DATABASE_URL` explicitly.** `packages/api/vitest.config.ts` falls back to port **5433**, which is a different project's postgres and now rejects `poster_app` outright (`password authentication failed`). Without the override every database-backed api test fails — 19 in `tests/routes/products.test.ts` alone — with nothing wrong in the code.
- `bun run typecheck` — **23 errors is the baseline.** Never higher. Turbo stops at the first failing package, so a partial count means an earlier package failed, not that errors vanished.
- `bunx playwright test tests/e2e/product-grid-alignment.spec.ts --project=chromium --no-deps` — **18 passing.** Use `--no-deps`: the four `auth.setup.ts` projects fail to log in the test users for pre-existing reasons, and the grid spec needs no auth.
- `bunx vitest run tests/styles/storefront-token-compliance.test.ts` — the Phase A guard. Any new component that reaches for `font-bold`, `fill-yellow-400`, the `brand-*` scale, `blur-3xl` or a brand gradient fails here.

## Constraints carried into every ticket

- **Real data only.** No fabricated urgency, no invented social proof. Saves = wishlist rows, in-carts = cart rows, counts = real queries. Show a real counter or show nothing.
- **The token guard is law.** New UI consumes `primary`/`accent`/`band`/`highlight`/`rating` and the `Button`/`SectionBand`/`DisplayHeading` primitives. `--brand-*` is admin- and AI-generator-only.
- **The square media contract is untouchable.** `--mat` is baked into image pixels by sharp; `MEDIA_RATIO`, the card radius clamp and `grow`-based row alignment are the #360–#375 contract and are covered by E2E.
- **Keep our differentiators**, restyled rather than deleted: AI generator, the rich frame selector (theirs is text radio pills — the analysis says keep ours), INR pricing, dark mode.
- **One source of truth per vocabulary.** Facet options are currently hardcoded literals in `ProductFilters.tsx` while the API validates them as free-text comma lists with no enum — the same disease as the dead size ladders. Feature 3 moves them to `packages/shared/src/constants/` and both ends consume that.
- **Ticket workflow mandatory** — in-progress before work, work sessions logged, `(#NN)` in commits, verification evidence in the completion comment.

## Blocked on non-engineering input

- **Photography.** The analysis calls mesonart ~80% photography. Phase D's hero, Shop-by-Room and UGC sections need lifestyle assets; Phase F needs artist portraits. None exist. Budget separately.
  ~~The Discover chip carousel needs circular imagery per collection.~~ **It did not.** Each chip borrows the main image of a representative product in its style — highest `featuredOrder`, else newest — so the rail restyles itself as the catalogue changes. This entry blocked #410 for no reason; check whether existing data can supply an asset before booking a photo shoot.
- **Promotion entity.** No schema for sales/promotions. Gates the sale strip, the countdown, the Sale page and the `text-sale` token having anything to colour.
- **Facet vocabularies are a business decision.** Feature 3 proposes adopting the analysis' §1.3 lists verbatim; if chobii's catalogue wants different Vibe/Aesthetic values, decide before the reseed, not after.

## Key file anchors

| Concern | Path |
|---|---|
| Design tokens | [globals.css](../../../packages/web/app/styles/globals.css) · [tailwind.config.ts](../../../packages/web/tailwind.config.ts) |
| Primitives | [ui/Button.tsx](../../../packages/web/app/components/ui/Button.tsx) · [ui/SectionBand.tsx](../../../packages/web/app/components/ui/SectionBand.tsx) · [ui/DisplayHeading.tsx](../../../packages/web/app/components/ui/DisplayHeading.tsx) |
| Collection page | [routes/posters/index.tsx](../../../packages/web/app/routes/posters/index.tsx) · [ProductFilters.tsx](../../../packages/web/app/components/product/ProductFilters.tsx) · [ProductCard.tsx](../../../packages/web/app/components/product/ProductCard.tsx) |
| Global chrome | [layout/Header.tsx](../../../packages/web/app/components/layout/Header.tsx) · [layout/Footer.tsx](../../../packages/web/app/components/layout/Footer.tsx) |
| Product API + filters | [routes/products.ts](../../../packages/api/src/routes/products.ts) (filter params at :46, search at :263) |
| Product schema | [schema/products.ts](../../../packages/api/src/database/schema/products.ts) (facet columns at :90) |
| Wishlist column | [schema/users.ts](../../../packages/api/src/database/schema/users.ts) (:170) |
| Size ladders | [constants/sizes.ts](../../../packages/shared/src/constants/sizes.ts) · [seed-variants.ts](../../../packages/api/src/database/seed-variants.ts) |
| Local dev | DB on host port **5440**, web `:3001`, API `:3000` |

## Local environment traps (all cost real time on 2026-08-04)

1. **Seed from the repo root**, never from `packages/api`. Bun loads `.env` from cwd, so running it in the package directory loses the R2/minio credentials — and `processProductImages` treats upload failure as non-fatal, so the seed reports **success** while writing products with zero images. That breaks every grid E2E in a way that looks exactly like a component regression. Check afterwards: `SELECT count(*) FILTER (WHERE jsonb_array_length(coalesce(images,'[]'))=0) FROM products;` must be 0.
2. **`.env` used to point `DATABASE_URL` at port 5433**, which is a *different project's* postgres (`surveytrack-postgres`). Corrected 2026-08-04; backup at `.env.bak-1785829333`. It hid for so long because `packages/api/package.json` runs `bun run --env-file=../../.env`, and **`--env-file` overrides inherited environment variables** — so an inline override reached vitest but never anything started through `bun run dev`.
3. **API route tests mock `db`, so they cannot catch a reference to a column that does not exist.** A route filtering on `products.isActive` passed 17 green tests; the table has `status`. When adding a route, run its queries against the real database once and add a schema-assumption test.
4. **Reviews require a real `order_item_id`**, and no orders are seeded. The three fixture reviews on `synthetic-nature` exist because the FK was dropped and restored `NOT VALID`.
5. **Anything applied to the database by hand is one reseed from gone.** The reference imagery was first installed by a scratchpad `UPDATE products SET images = …` against a static server on `:3099` — it did not survive the next `seed.ts` run, and the scratchpad it lived in is temp-directory storage. It now comes back through the seed itself: `REFERENCE_MEDIA` in `seed.ts` maps all 41 slugs to file prefixes under `SEED_MEDIA_DIR` (`.cache/seed-media/`, gitignored), each with three room scenes. The directory is machine-local, so if it is ever lost every product falls back to its declared stock URL and the catalogue quietly reverts — check with `SELECT count(*) FROM products p, jsonb_array_elements(p.images) i WHERE i->>'type' = 'room-mockup';`, which should be **122**, not 3. That imagery is third-party and watermarked: a placeholder standing in until real artwork exists, never publishable. `provenance.json` in the same directory records where each file came from and which product it stands in for; `tools/` beside it regenerates the set. Deleting `.cache/seed-media/` removes all of it in one step and the seed keeps working.
