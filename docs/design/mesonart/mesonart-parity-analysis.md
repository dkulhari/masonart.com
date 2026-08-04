# Mesonart.com → chobii.art UI Parity Analysis

**Date:** 2026-08-04 (merged from two independent analyses dated 2026-08-03)
**Reference:** https://mesonart.com — Shopify, custom theme (`shuja` card components, Swiper rails)
**Ours:** chobii.art — `packages/web`, TanStack Start / React Router v7 + Tailwind + shadcn/ui

**How this was produced — two independent passes, then merged:**

1. **Visual pass** — live browser capture at 1440×900, both sites side by side.
2. **Source pass** — raw HTML/JSON pulled from mesonart production (`/`, `/collections/artworks`, `/products/<handle>`, `/products/<handle>.js`) plus their served CSS custom properties; our side read from source in `packages/web`.
3. **Re-verification (2026-08-04)** — fresh screenshots via headless Chrome at 1440×900, used to settle every point where the two passes disagreed. See [Appendix C](#appendix-c--corrections-from-re-verification).

Screenshots in this folder (all 1440px wide, captured 2026-08-04):

| File | Subject |
|---|---|
| `mesonart-hero.jpeg` | mesonart above-the-fold |
| `mesonart-header-nav.jpeg` | mesonart global chrome, top 300px |
| `mesonart-home-full.jpeg` | mesonart home, full page (7216px) |
| `mesonart-collection-grid.jpeg` | mesonart collection toolbar + sidebar + grid |
| `mesonart-filter-sidebar.jpeg` | mesonart collection header, discover chips, facets |
| `mesonart-product-page.jpeg` | mesonart PDP, first 2400px |
| `mesonart-pdp-buybox.jpeg` | mesonart PDP right panel |
| `chobii-hero.jpeg` | our above-the-fold |
| `chobii-header-nav.jpeg` | our global chrome, top 300px |
| `chobii-home-full.jpeg` | our home, full page |
| `chobii-posters-grid.jpeg` | our `/posters` sidebar + grid |
| `chobii-filter-sidebar.jpeg` | our filter rail |
| `chobii-product-full.jpeg` | our PDP, full page |
| `chobii-pdp-buybox.jpeg` | our PDP right panel |

> **Scope note.** "Exactly similar" here means the same layout system, typography, spacing and interaction patterns — **not** their logo, wordmark, product copy, artwork, artist names or photography. Copying those verbatim is a trade-dress and copyright problem. Everything below targets structural and stylistic parity with our own content.

---

## 1. Site map of mesonart.com

### 1.1 Global chrome (every page)

See `mesonart-header-nav.jpeg` vs `chobii-header-nav.jpeg`.

| Layer | Content |
|---|---|
| Sale strip (beige `#E5E2D5`) | "SUMMER SALE: DEALS STILL GOING 40% OFF." + live countdown `11H : 43M : 47S` |
| Announcement bar (beige) | Social icons (FB/IG/YT/Pinterest) left · rotating message with ←/→ arrows ("Free Shipping & 30 Days Return", Klarna/Afterpay) · region/currency selector right (`India (INR ₹)`) |
| Header row (white) | **Centered wordmark** · right cluster: Search, Account, Wishlist (count badge), Cart |
| Nav row 1 — pages | Best Sellers · New In · Custom Art · Trade Program · Gift Card · Reviews · Artist · Our Story |
| Nav row 2 — styles | All Art · Wabi Sabi Art · Plaster & Texture Art · Minimalist Art · Colorful Art · Pop Art & Graffiti Art · Surrealist Art · Pollock Art · Hyperrealism Art · Bohemian Art · Ukiyo-E Art · Expressionist Art · **Sale** (red) |
| Drawers | Cart drawer (order note, discount code, free-shipping progress, subtotal, recently viewed) · Search drawer with recommendations · mobile bottom dock |
| Floating | Right-edge vertical "Get 40% OFF" tab · chat bubble bottom-right |
| Footer | 4 columns — *Customer Services* (FAQs, Reviews & Ratings, Shipping & Delivery, Returns & Exchanges, Art Commission, To The Trade) · *About* (Our Story, Artist Team, Contact Us, Projects, Blog) · Newsletter · Contact (address, WhatsApp, per-order-suffix email routing); USP strip above (Handcrafted · Free Shipping · Eco Friendly · Safe Payments) |

Mega-menu URL inventory: `/collections/{artworks, new, style_wabi-sabi, plaste-art, minimalist-art, colorful-paintings, pop-art, style_pollock-art, style_surrealist-art, style_ukiyo-e, style_bohemian-art, super-realism-oil-painting, style_expressionist-art}`, `/pages/{all-artists, reviews, promotion, trade, commission-art, about-us, contact, faqs, shipping-delivery, returns-exchanges}`, `/blogs/news`, `/products/meson-art-gift-card`, `/search`, `/cart`, `/apps/wishlist`.

### 1.2 Home (`/`)

`mesonart-hero.jpeg`, `mesonart-home-full.jpeg`. Shopify section handles in parentheses.

1. **Hero slideshow** (`slideshow`) — **contained, not full-bleed**: a rounded-corner slide inside the 1600px container with adjacent slides peeking at both edges. Room-lifestyle photography with the artwork in situ; single outline-pill CTA **"SHOP All ART"**; some slides are video.
2. **Featured collections** (`featured_collections`) — collection tiles.
3. **Category grid** (`mesonart_category_grid`) — mosaic of style categories.
4. **Best Seller** (`collection_showcase`) — display heading, style **tabs** (Wabi-Sabi / Plaster / Pop / Minimalist / Colorful), each swapping a 4-col product carousel (~36 cards per tab), "View all →".
5. **Shop By Popular** (`collection_list`) — 8 subject tiles (Abstract, Landscape, Beach & Ocean, Graffiti, Latest Work, City, Floral, Horse) + "View Popular Categories" pill.
6. **Shop by Room** — beige band: left room-photo slideshow, right a list of rooms with **live product counts** (Living Room 3853 · Entryway 2656 · Executive Office 581 · Bathroom 125 · Reading Nook 158 · Dining Room 324 · Nursery & Kids Room 131); hovering a room swaps the photo.
7. **New In** (`featured_collection`) — product carousel + View all.
8. **Shop By Orientation** — pill links: Vertical / Square / Horizontal / Panoramic / Circular / Set of 2-3.
9. **Featured Artists** (`feature_block_collection`) — 3 rows, each: artist name in huge display type + portrait + 5 mini artwork thumbs, linking to that artist's collection.
10. **Customer Reviews** (`customer_review` ×2) — "9000+ Score 4.9/5.0" strip + review-card carousel + View All.
11. **Brand Story** (`rich_text_video`) — beige band, story paragraph, "Read More" pill, video/photo right.
12. **USP icon row** (`home_icons`) → footer.

**Character:** a merchandising stack. Roughly 8 product/collection rails before any brand copy. Copy is short and imperative; photography does the work.

### 1.3 Collection page (product directory)

`mesonart-filter-sidebar.jpeg` (header + facets), `mesonart-collection-grid.jpeg` (toolbar + grid).

1. **Beige header band** — breadcrumbs (Home / Collections / All Artwork), **display H1** (per-word spans with a reveal animation), SEO description paragraph + "Show More".
2. **Discover carousel** — horizontally scrollable circular image chips of every other collection (~18), with arrows.
3. **Sticky toolbar** — "Hide filters" outline pill · **"3878 products"** count · "Sort by: Best selling" pill dropdown.
4. **Left facet rail**, every option carrying a count:

| Group | Options |
|---|---|
| Style (12) | Wabi-Sabi Art (788), Plaste & Texture Art (815), Colorful Art (653), Minimalist Art (474), Pop Art (514), Surrealist Art (146), Pollock Art (111), Bohemian Art (149), Expressionist Art (56), Hyperrealism Art (105), Graffiti Art (199), Ukiyo-e Art (50) |
| Subject (17) | Abstract (2959), Minimalism (1870), Landscape (431), People (395), Sea (298), Animal (304), Flowers (195), Cartoon (116), City (90), Love, Snow, Wine, Colorful Art, Horse, Portraits, Sea & Beach, Still Life |
| Orientation (6) | Vertical, Square, Horizontal, Panoramic, Circle, **Set of 2/3** |
| Color (14, swatch chips) | Black, White, Gray, Beige, Brown, Yellow, Blue, Gold, Green, Orange, Pink, Purple, Red, Grey |
| Vibe (4) | Sophisticated & Intellectual, Tranquility & Zen, Vitality & Passion, Warmth & Cozy |
| Room (12) | Living Room, Entryway, Hallway & Stairs, Bedroom, Dining Room, Reading Nook, Kitchen, Nursery & Kids Room, Office & Study, Commercial & Lobby, Bathroom, Executive Office |
| Aesthetic (12) | Japandi Essence, Organic Modern, California Coastal, Mid-century Modern, Modern Farmhouse, Mediterranean Revival, Parisian Chic, Dopamine Decor, Quiet Luxury, Dark Academia, Industrial Loft, Eclectic Gallery |
| Medium (4) | Shopify taxonomy values — acrylic / oil / mixed media / texturizing paste |
| Uniqueness | Open (edition type) |
| Availability | Made to Order |

5. **Sort** (9): Featured · Most relevant · Best selling · Alphabetically A–Z / Z–A · Price low→high / high→low · Date old→new / new→old.
6. **Grid** — `card-grid card-grid--4 mobile:card-grid--2` → 4 columns desktop / 2 mobile, `grid-flow-row-dense`, inside `--page-width: 1600px`. Card anatomy:
   - Square media (`media--square`), artwork shown as a **framed mockup on white**, `--card-radius` corners.
   - Hover: cross-fades to an alternate mockup (cursor X position picks which); **"View"** (quick-view eye) and **"Choose options"** buttons fade in.
   - Below the image: star row + review count "(65)" left, **wishlist heart** right.
   - Then title (2–3 lines, weight 500) left, `From Rs. 25,300.00` right-aligned on the first line.
   - Occasional **promo tile** occupying a grid cell — beige, "Rated 4.9/5 by 9,000+ Users" + "Collector Voices" pill.
7. Lazy-load on scroll (no numbered pagination), USP row, footer.

### 1.4 Product page

`mesonart-product-page.jpeg`, `mesonart-pdp-buybox.jpeg`. Example: `/products/abstract-graffiti-art-ga051`.

**Left column:** vertical thumbnail rail (~10 thumbs: artwork, room scenes, texture close-ups, packaging) + large gallery with zoom modal and prev/next.

**Right buy panel, in order:**

1. "**49** saves · In **17** carts now" + wishlist heart
2. `<h1>` in display font, light weight, per-word spans
3. Star rating + "(104)" → scrolls to reviews
4. Urgency: "**1** sold in last **87** hours"
5. Price `Rs. 21,300.00` (red when on sale)
6. Divider · "Hurry up! Sale ends in 11H : 45M : 42S" · divider
7. **Size** — 14 options, dual units (`48''Hx 36''W/ 122 x 91 CM`)
8. **Rolled Canvas / Frameless / Framed** — 7 finishes: Rolled Canvas, Frameless, Stretch + Gold / Silver / Black / White / Wood Frame
   → **14 × 7 = 98 variants**, $218–$2,860
9. Delivery estimate: "Arrives soon! Get it by Aug 10–Aug 18 if you order today"
10. Quantity stepper + full-width **black pill "Add to cart — Rs. 21,300.00"** + "More payment options" (Shop Pay etc.)
11. Trust accordions, each opening a drawer: *Ship After You Are Satisfied* · *Free Shipping on All Orders* · *30 Days Easy Returns* · *Safe Payment Options*
12. Share row (FB/IG/YT/Pinterest) + "Need help?"
13. Sticky mini add-to-cart bar on scroll · "View VR Effect" (view-on-your-wall)

**Below the fold:** Visually Similar Artworks (12-card rail) → artist block → More to Love → **MesonArt in Real Life** (UGC room photos) → **Why MesonArt?** (Thousands of 5-Star Reviews · Global Selection of Original Art · Satisfaction Guaranteed · Support Emerging Artists) → **Complimentary Art Advisory** → tabbed content → Loox photo reviews → recently viewed → footer. Floating review-popup toast bottom-left.

**Tabbed content:** *About the Artwork* (editorial paragraph, then Finish / Style / Subject / Mediums) · *Details and Customization* (Availability, Mediums, Uniqueness, Creation Time, Ready to Hang, Frame, Authenticity, Signature, Customization, Outdoor Safe) · *Shipping and Returns* (cost, time, returns, handling — tube / boxed / wooden crate, carrier, delivery area) · *Review* (~120 named, multi-language).

### 1.5 Secondary pages

`/search` · `/cart` · wishlist app · `/pages/`: about-us, reviews, commission-art, trade, all-artists, faqs, shipping-delivery, returns-exchanges, contact, promotion · `/blogs/news` · gift-card sold as a product.

---

## 2. Design tokens — measured

Left column: mesonart's served CSS custom properties, cross-checked against rendered pixels. Right: our [globals.css](../../../packages/web/app/styles/globals.css) / [tailwind.config.ts](../../../packages/web/tailwind.config.ts) and what actually renders.

| Token | mesonart | chobii — declared | chobii — rendered | Status |
|---|---|---|---|---|
| Body font | Poppins **300**, line-height 1.2 | `--font-sans: Poppins` | Poppins **400** | ⚠️ weight |
| Heading font | **Urbanist 300**, line-height 1, H1 ≈ 44px | `--font-heading: Urbanist` | **Poppins 700** — token consumed nowhere | ❌ |
| Product title | Poppins 500, `clamp(1rem, …, 1.25rem)` | `text-base font-medium` | fixed 16px | ⚠️ no clamp |
| Nav | Urbanist 500, `clamp(0.875rem, …, 1.125rem)` | shadcn default | Poppins 500 fixed | ❌ |
| Text color | `rgb(23 23 23)` | `--foreground: 0 0% 9%` | same | ✅ |
| Primary / CTA | **`#171717` pill, white text, radius 60px, 2px border**; outline-pill variant | `--primary: 25 95% 53%` | orange fills, `rounded-lg` | ❌ **largest single delta** |
| Accent | red `rgb(225 29 72)` — sale price/tag only | `--brand-*` amber scale | orange everywhere + purple AI badges | ❌ |
| Section band | beige `~#E5E2D5`; collections `rgb(219 216 194)` | none | white / light-gray only | ❌ |
| Highlight | `rgb(255 221 191)` peach | none | — | ❌ |
| Rating star | `rgb(245 158 11)` amber-500 | `--rating: 38 92% 50%` (identical) | hardcoded `fill-yellow-400` | ⚠️ token unused |
| Card radius | `clamp(10px, 1.053vw, 20px)` | `--card-radius`, same clamp | same | ✅ |
| Card border/shadow | border 0, shadow opacity 0.1, 0 offset | none | none | ⚠️ |
| Page width | **1600px** | container `2xl: 1400px` | 1400px | ❌ |
| Page padding | 20px | `2rem` | 32px | ⚠️ |
| Motion | `.5s cubic-bezier(.3,1,.3,1)` / `.3s cubic-bezier(.7,0,.3,1)` | `--ease-primary` / `--ease-fast`, identical | same | ✅ |
| Placeholder / mat | `rgb(250 250 250)` | `--mat: 0 0% 98%` | same | ✅ |
| Display headings | split-word spans with reveal animation | — | bold sans, no animation | ❌ |
| Dark mode | none | full dark palette | — | ours extra |

**Already at parity** (product-grid-alignment work, #360–#375): grid columns 2 / md:3 / xl:4, gaps 20px row / 13.5px column, square media contract, cursor-zone hover slides, card radius clamp, easing curves, mat colour, and the Poppins/Urbanist webfonts being loaded at all.

**The core finding:** the token file already adopted mesonart's values, but **components do not consume them.** `--font-heading` appears exactly once — its own declaration at `globals.css:126` — and no component uses a `font-heading` utility. `__root.tsx` loads Poppins 300/400/500 and Urbanist 300/500; **weight 700 is never loaded**, yet every heading is `font-bold`, so headings render faux-bold Poppins. Fixing consumption is cheap and moves the needle more than any new component.

---

## 3. Gap analysis by page

### 3.1 Global chrome

| mesonart | chobii today | Gap |
|---|---|---|
| Sale strip + countdown | none | New component, admin-configurable |
| Announcement bar (social / rotator / currency) | none | New component |
| Centered logo; Search / Login / Wishlist / Cart right | Left logo, 4 links, cart + account | Restructure [Header.tsx](../../../packages/web/app/components/layout/Header.tsx); add Search and Wishlist |
| Two-row nav (pages + styles) | Single row (Posters / Create / Gallery / About) | New nav data + a styles row fed from categories |
| Floating offer tab + chat | none | Optional |
| 4-col footer + USP row | 3-col footer ✅ structure, no USP row, no contact column | Add USP strip + contact column, restyle beige |

### 3.2 Home

| mesonart | chobii today | Gap |
|---|---|---|
| Contained slideshow, room photography, one outline-pill CTA | Orange-gradient marketing hero, badge, 2 CTAs, trust row | **Full rebuild** — needs lifestyle photography |
| Best Seller tabs + carousels | Static 8-card Featured grid | Tabs + carousel component |
| Shop By Popular photo tiles (8 subjects) | "Shop by Style" gradient tiles (4, images 404 → gradient fallback) | Swap to photo tiles, real assets |
| Shop by Room band with live counts | none | New section + room taxonomy on products + count endpoint |
| New In carousel | none | Reuse carousel |
| Orientation pills | exists only as a filter | Small section |
| Featured Artists | none | New section — needs an artist entity |
| Reviews strip + carousel | none on home | Reviews API exists; aggregate + carousel |
| Brand story band + video | "Why Choose" cards + AI banner | Restyle; keep AI banner as our differentiator |
| ~8 rails before brand copy | 1 product rail | Rail-density gap |

### 3.3 Collection page

Closest page already: post product-grid-alignment we match the square 1500×1500 contract, 4-col aligned grid, and hover mockup carousel (ours has dots and multi-slide zones — arguably richer than their single swap). See `chobii-posters-grid.jpeg` vs `mesonart-collection-grid.jpeg`.

Gaps:

> **Status, 2026-08-04.** Everything in this list is now closed except where noted. The header band, toolbar and facet counts landed with #390–#394; the Discover carousel, promo tiles and the sort gap with #404–#414. Struck items record what was true when measured.

- ~~**No beige header band**~~ — done (#390–#394).
- ~~**No Discover chip carousel** of sibling collections.~~ Done (#410). Chips read the style vocabulary in `@chobii/shared` and borrow the main image of a representative product per style, so no curated per-collection photography was needed after all.
- ~~**No toolbar**~~ — done (#390–#394).
- ~~**No facet counts**~~ — done. **Active-filter chips already existed** when this was written; `ActiveFilterTags` was on both mobile and desktop.
- **Facet coverage.** Ours: Style (10), Subject (9), Color (13), Room (7), Orientation (4), Special (AI / Featured). Missing entirely: **Vibe, Aesthetic, Medium, Uniqueness, Availability, price**. Under-covered: Room 7 vs 12, Subject 9 vs 17, Orientation missing **Circle** and **Set of 2/3**. Requires **product metadata expansion** (schema + seed + API filter params), not just UI.
- ~~**Sort**: 6 vs 9 — missing Featured, Most relevant, Best selling (needs a sales/relevance signal).~~ **Now 8 (#405, #409.)** The parenthetical was wrong about two of the three. **Featured** needed no signal at all — the API accepted `sortBy=featuredOrder` the whole time; it sorted nulls first, and `featuredOrder` is null on most of the catalogue, so the option would have led with the products nobody featured. **Best selling** was the only one lacking a signal, and `order_items.quantity` had carried one all along; it is now a live aggregate over settled orders, with a curator pin (`products.isPopular`/`popularOrder`) layered above the number without altering it. **Most relevant** stays out, and not for want of a signal: on a collection page with no search query there is nothing for relevance to mean.
- **Card**: no quick-view, no "Choose options". Star rating, review count and wishlist heart landed with #387–#394. Title-left / price-right ✅ already matched.
- **Badges**: our orange "Featured" and purple "AI" chips clash with a monochrome system — restyle or drop.
- ~~**Pagination**: numbered component vs their lazy-load on scroll.~~ Done (#390–#394).
- ~~**No promo tiles** in the grid.~~ Done (#411). One cell, carrying the catalogue's approved-review aggregate — or nothing: below ten approved reviews the component renders null rather than round a thin sample into a marketing number. Seeding real orders and reviews (#414) is what gave it something true to say.
- **Mat colour**: our cards show a light-gray mat; theirs sit on white with a framed mockup. Worth a deliberate decision.

### 3.4 Product page

Structure already broadly matches — gallery left, buy panel right, size list, frame selector, trust icons, similar products. See `chobii-pdp-buybox.jpeg` vs `mesonart-pdp-buybox.jpeg`.

Gaps:

- **Thumbnail rail**: ours horizontal below the gallery, theirs vertical at left. CSS restructure. No zoom modal on ours.
- **Buy-panel order and content**: no social proof (saves / in-carts), no urgency line, no delivery ETA, no sale countdown, no star rating in the panel.
- **CTA**: ours is a plain button; theirs is a full-width black pill with the price inside — "Add to cart — ₹1,699.00".
- **Heading**: ours bold Poppins 30px; theirs Urbanist 300 at ~44px.
- **Size selector**: theirs a dropdown with dual units; ours a row list with a "Show in cm" toggle — functionally equivalent, restyle only.
- **Frame selector**: ours is richer (image, description, price delta, material); theirs is text radio pills. **Keep ours**, restyle to monochrome.
- **Trust**: ours is a static 3-icon row; theirs is 4 accordions opening drawers.
- **Missing sections**: Visually Similar, More to Love, artist block, UGC "in real life", "Why us", art advisory, tabbed detail block with a spec table, sticky add-to-cart bar, share row, view-on-wall/VR.
- **Reviews**: we have the Loox-style layout skeleton; needs real data rendering.

### 3.5 Pages we don't have

Artists index · artist detail · Reviews page · Sale/promo page · Trade program · Commission art · Gift card product · Blog · Wishlist.
We do have: About, Contact, FAQ, Shipping, Returns, Terms, Privacy, Cookies, Track, Gallery, Create.

---

## 4. Data model work implied

The facet gap is a **data problem before it is a UI problem** — every product needs values for the new fields, so budget a backfill/reseed alongside the UI work.

Their model, for reference. Namespaced product tags:
`Artist_<name>` · `Color_<name>` · `Orientation_<name>` · `Style_<name>` · `Subject_<name>`

Storefront facets are Shopify metafields:
`filter.p.m.custom.{style, subject, orientation, painting_color, shop_by_vibe, shop_by_room, shop_by_aesthetic, uniqueness, availability}` · `filter.v.t.shopify.painting-medium`

Ours needs, in `packages/api/src/database/schema` + `packages/shared/src/{schemas,constants}`:

- extend `styles`, `subjects`, `rooms`, `orientation` value sets to the lists in §1.3
- new: `vibe`, `aesthetic`, `medium`, `uniqueness`, `availability`
- new: `artist` entity (for artist pages, PDP block, home strip)
- counters for real social proof: saves (= wishlist rows), in-carts (= cart rows), recent sales
- ~~a relevance/best-selling signal for sort~~ — **best-selling needed no new model.** `order_items.quantity` joined to settled `orders` is the signal; see `packages/api/src/lib/product-sales.ts`. Relevance still has no definition without a search query.
- size ladders keyed by orientation family, replacing hand-seeded per-product variants — see [§5.6](#56-how-ours-differs)

---

## 5. Sizes, ratios and the variant matrix

Measured by pulling `/products/<handle>.js` for **72 products** across every orientation family and parsing the `Size` option.

### 5.1 The short answer

**Aspect ratio is not fixed per poster, and it is not a property of the poster at all.**

The chain is: `Orientation tag → one canonical size ladder → the ladder contains several different aspect ratios`. So the *same artwork* is sold at 6:5, 4:3, 3:2 and a couple of odd ratios, depending on which size step the customer picks. Nothing in the product constrains it to a single ratio.

They can do this because every piece is **100% hand-painted, made to order**. There is no master file to crop — the artist recomposes the painting at whatever proportion was ordered. Ratio is a manufacturing instruction, not an image property.

### 5.2 The three canonical ladders

Every product reuses one of three ladders verbatim; only the label ordering differs.

**A. Rectangular — 14 steps** (25 of 72 products; 8 more use a 15-step variant that appends `100×75`). Used by both `Orientation_Vertical` and `Orientation_Horizontal` — identical numbers, the label just swaps which dimension is called H.

Prices below are `Abstract Graffiti Art #GA051`, USD:

| Size (long × short, in) | Ratio | Area in² | Rolled | Frameless | + Black Frame | $/in² |
|---|---|---:|---:|---:|---:|---:|
| 24 × 20 | **6:5** | 480 | 218 | 370 | 390 | 0.454 |
| 32 × 24 | **4:3** | 768 | 293 | 510 | 530 | 0.382 |
| 36 × 24 | **3:2** | 864 | 328 | 580 | 590 | 0.380 |
| 40 × 30 | **4:3** | 1200 | 449 | 760 | 790 | 0.374 |
| 48 × 32 | **3:2** | 1536 | 559 | 1020 | 1050 | 0.364 |
| 48 × 36 | **4:3** | 1728 | 624 | 1120 | 1170 | 0.361 |
| 54 × 36 | **3:2** | 1944 | 689 | 1240 | 1280 | 0.354 |
| 54 × 40 | **27:20** | 2160 | 754 | 1380 | 1420 | 0.349 |
| 60 × 40 | **3:2** | 2400 | 832 | 1510 | 1560 | 0.347 |
| 64 × 48 | **4:3** | 3072 | 1047 | 1910 | 1960 | 0.341 |
| 72 × 48 | **3:2** | 3456 | 1105 | 2090 | 2120 | 0.320 |
| 72 × 54 | **4:3** | 3888 | 1235 | 2320 | 2360 | 0.318 |
| 80 × 53 | **44:29** (≈3:2) | 4240 | 1339 | 2530 | 2570 | 0.316 |
| 80 × 60 | **4:3** | 4800 | 1495 | 2780 | 2860 | 0.311 |

Ratio mix within this one ladder: **4:3 ×6, 3:2 ×5, 6:5 ×1, 27:20 ×1, 44:29 ×1** — five distinct proportions, interleaved, not grouped.

**B. Square — 10 steps** (18 of 72): 24, 30, 32, 36, 40, 44, 48, 55, 60, 72 in. Always **1:1**. An 8-step short version exists (drops 44 and 72).

**C. Panoramic — 11 steps** (15 of 72): 36×18, 60×20, 48×24, 72×24, 60×30, 80×30, 90×30, 72×36, 80×40, 90×45, 100×50 in.
Ratio mix: **2:1 ×7, 3:1 ×3, 8:3 ×1**. Panoramic products carry the ladder in *both* directions — the tall variants (`36"H × 18"W`) and wide variants come from the same numbers.

**Sets** reuse ladder A or B with a `2P` / `3P` prefix and per-panel dimensions: `3P (Each 36"H x 18"W / 91H x 46W CM)`. `Set of 2/3` is its own orientation facet value.

### 5.3 Label conventions

Four formats in the wild, same numbers underneath:

```
24"H x 20"W/ 61H x 51W CM        vertical, long side first, H-labelled
24"Wx 20"H/ 61 x 51 CM           horizontal, same numbers, W-labelled
24"x 20"/ 61 x 51 CM             bare, orientation implied by the tag
3P (Each 36"H x 18"W / 91H x 46W CM)   sets
```

Always dual-unit — inches and cm in the same string. Their own data is inconsistent about ordering; the customer disambiguates from the product image.

### 5.4 The second axis: finish

Constant across essentially every product (7 values):
`Rolled Canvas · Frameless · Stretch + Gold Frame · Stretch + Silver Frame · Stretch + Black Frame · Stretch + White Frame · Stretch + Wood Frame`

**Size × Finish = the full variant matrix.** 14 × 7 = **98 variants** for a rectangular product; 10 × 7 = 70 for a square one.

### 5.5 Pricing

Price tracks **area, not ratio**. Two same-area steps at different ratios cost the same. There is a volume taper: $/in² falls from 0.454 at the smallest step to 0.311 at the largest, roughly 30% off the unit rate across the ladder.

Finish multipliers off the rolled price: Frameless ≈ **+70%**, any stretched frame ≈ **+75–90%**. Gold/silver/wood carry no premium over black or white.

### 5.6 How ours differs

| | mesonart | chobii today |
|---|---|---|
| Ratio per product | **variable** — one ladder spans 5 ratios | variable too, but incidentally |
| Ladders | 3 canonical, reused verbatim, 10–15 steps | 3 in [sizes.ts](../../../packages/shared/src/constants/sizes.ts): square 8 (12–48"), portrait-landscape 8, panoramic 4 |
| Panoramic ratios | 2:1, 3:1, 8:3 | all **3:1** (12×36, 16×48, 20×60, 24×72) |
| Portrait ladder ratios | 4:3 ×6, 3:2 ×5, +3 odd | 3:4 ×5, 4:5 ×1, 2:3 ×2 |
| Max size | 100 × 75 in | 48 × 60 in |
| Finish axis | 7 values, part of the variant matrix | `frames` is a **separate add-on list** with price deltas, not a matrix axis |
| Variants per product | 70–105 | typically **4** (seeded per-product rows in the `variants` table) |
| Ladder wiring | orientation → ladder, enforced | `getSizesForOrientation()` exists in `sizes.ts` but **is called nowhere**; variants are hand-seeded per product |
| Master image | none — hand-painted per order | single **square 1500×1500**, ratio-independent by design |
| Units | dual inch + cm always inline | inches, with a "Show in cm" toggle |

**Implications for parity work:**

1. **The square master image is not in conflict with variable ratios.** Their card grid is square too; the ratio only materialises at manufacture. Our square contract can stay exactly as is.
2. **Wire orientation → ladder.** `getSizesForOrientation()` is dead code; make it the source of truth for which steps a product may offer, instead of hand-seeding 4 rows per product.
3. **Extend the ladders** to 10–14 steps and raise the ceiling — a 4-step ladder topping out at 48" reads as posters, not gallery art. Add the missing orientation families (Circle, Set of 2/3) if we adopt those facets.
4. **Decide on the finish axis.** Ours is arguably better UX (frame cards with images and price deltas) and avoids a 98-row variant explosion. Keep it as an add-on; do not copy the matrix.
5. **Price by area with a taper**, rather than per-size hand-entered prices. Their curve — 0.45 → 0.31 $/in² — is a usable starting shape.
6. **Dual-unit labels inline** (`48" × 36" / 122 × 91 cm`) instead of a cm toggle, so the size list is scannable in either system at once.

---

## 6. What it takes — phased plan

Ordered by visual-impact-per-hour.

### Phase A — Design-system compliance (S, ~1–2 days)

Highest leverage. Makes every page read as "mesonart" without a single new component.

1. **Consume the tokens we already have**: wire `--font-heading` (Urbanist 300) into all headings; body → 300; display sizes (H1 42px+); stop using `font-bold` (700 isn't even loaded).
2. **Kill orange as primary**: `--primary` → `#171717`, pill radius token (`3.75rem`), 2px border; red `225 29 72` reserved for sale price/tag. Restyle every Button, badge and link.
3. Add **beige band token** (`~#E5E2D5`) + peach highlight; apply to alternating sections.
4. **Strip gradients and blur blobs** from `HeroSection` and `AIGeneratorSection` in [index.tsx](../../../packages/web/app/routes/index.tsx).
5. Replace hardcoded `fill-yellow-400` with `text-rating`.
6. Container **1400 → 1600px**; page padding 32 → 20px.
7. Fluid type: `clamp()` for nav / button / product title sizes.
8. Split-word display-heading component with reveal animation.

### Phase B — Global chrome (M, ~2–3 days)

Header restructure (centered logo, search, wishlist, cart), two-row nav, announcement bar + sale strip, footer USP row + contact column + beige restyle.

### Phase C — Collection page (M, ~3–4 days)

Toolbar (hide-filters toggle, inline count, sort dropdown), beige header band with display H1 + description + breadcrumbs, Discover chip carousel, card upgrades (rating, review count, heart, quick-view, "Choose options"), promo tiles, lazy-load paging.
Then the **data work**: color/room/vibe/aesthetic/medium tags in schema + seed + filter API + sidebar groups with counts.

### Phase D — Home rebuild (M–L, ~4–5 days)

Hero slideshow (reuse the room mockups our seed pipeline already generates), Best Seller tabs + carousel, Popular photo tiles, Shop-by-Room band with counts, New In, Orientation pills, Reviews strip, Brand Story band. Featured Artists lands with Phase F.

### Phase E — Product page (M, ~2–3 days)

Vertical thumb rail + zoom modal, buy-panel reorder, price-in-CTA black pill, trust accordions, share row, delivery ETA, sticky add-to-cart, tabbed detail block + spec table, Visually Similar / More to Love rails, **real** social-proof counters (saves = wishlist rows, carts = cart rows).

Also the size work from [§5.6](#56-how-ours-differs): wire `getSizesForOrientation()` in as the ladder source, extend ladders to 10–14 steps with a higher ceiling, switch to area-based pricing with a volume taper, and print dual-unit labels inline.

### Phase F — New pages (M–L, ~3–5 days)

Artist entity + artists index + artist detail + PDP artist block; Reviews page; Sale page; Trade program; Commission art; Gift card as a product; Blog; Wishlist.

### Dependencies and risks

- **Imagery is the real bottleneck.** Mesonart's look is ~80% photography — room scenes, texture close-ups, packaging shots, artist portraits. The grid contract and card mockups are solved; hero, room, UGC and artist sections need lifestyle assets that don't exist yet. Budget this separately from engineering.
- **Product metadata doesn't exist yet** for color/room/vibe/aesthetic/medium — schema + reseed + API before collection filters reach parity.
- **Urgency and social proof**: real-data-only. Fabricated "3 sold in last 68 hours" is a dark pattern; show a counter or show nothing.
- **Keep our differentiators** — AI generator, rich frame selector, INR pricing, dark mode — restyled into the monochrome system rather than deleted. Decide explicitly whether dark mode survives; mesonart has none, and light-only is simpler to match.

### Estimate

| Phase | Effort |
|---|---|
| A — Design-system compliance | 1–2 d |
| B — Global chrome | 2–3 d |
| C — Collection page (+ data) | 3–4 d |
| D — Home rebuild | 4–5 d |
| E — Product page | 2–3 d |
| F — New pages | 3–5 d |
| **Total** | **~15–22 engineering days**, excluding photography and content |

**If only one thing gets done:** Phase A. Roughly two days, no new components, and it carries about half the perceived similarity on its own.

---

## Appendix A — raw values worth keeping

```
--page-width: 1600px
--rounded-button: 3.75rem
--buttons-border-width: 2px
--color-base-text: 23 23 23
--color-base-button: 23 23 23        /* near-black, white text */
--color-base-highlight: 255 221 191  /* peach */
--color-sale-price: 225 29 72        /* rose-600 */
--color-rating: 245 158 11           /* amber-500 */
--color-placeholder: 250 250 250     /* == our --mat */
--color-background (collections): 219 216 194   /* warm sand */
--font-heading-family: Urbanist, 300, line-height 1
--font-body-family: Poppins, 300, line-height 1.2
--font-navigation-size: clamp(0.875rem, 0.748rem + 0.3174vw, 1.125rem)
--font-button-size:     clamp(0.875rem, 0.8115rem + 0.1587vw, 1.0rem)
--font-product-size:    clamp(1.0rem,  0.873rem  + 0.3175vw, 1.25rem)
--animation-primary: .5s cubic-bezier(.3, 1, .3, 1)
--animation-fast:    .3s cubic-bezier(.7, 0, .3, 1)
card grid: card-grid--4 / mobile:card-grid--2, grid-flow-row-dense
card root: .card.product-card.product-card--standard.flex.flex-col.leading-none.relative
```

Size ladders (inches), reusable verbatim:

```
rect-14   24x20 32x24 36x24 40x30 48x32 48x36 54x36 54x40 60x40 64x48 72x48 72x54 80x53 80x60
rect-15   … + 100x75
square-10 24 30 32 36 40 44 48 55 60 72
pano-11   36x18 60x20 48x24 72x24 60x30 80x30 90x30 72x36 80x40 90x45 100x50
finishes  Rolled Canvas · Frameless · Stretch + {Gold, Silver, Black, White, Wood} Frame
```

## Appendix B — how to re-capture the screenshots

Headless Chrome via the repo's Playwright, viewport 1440×900, `deviceScaleFactor: 1`, JPEG q82. Clips taller than the viewport need `fullPage: true` alongside `clip`, otherwise the capture is silently truncated at 900px. Our side needs the dev server on `:3001` and the API on `:3000` (DB on host port **5440**, not the 5433 in `.env`). Capture script kept out of the repo; regenerate as needed.

## Appendix C — corrections from re-verification

Points where the two source analyses disagreed, settled against the 2026-08-04 screenshots:

| Point | Resolution |
|---|---|
| Style / Subject facet counts | **12 / 17**, all visible with per-option counts. The "5 / 8" reading was wrong. |
| Our fonts | Tokens match mesonart, **components don't consume them**. The "✅ at parity" reading was wrong — token parity is not render parity. |
| Hero | **Contained slide with peeking neighbours**, not full-bleed. Both original readings said full-bleed. |
| Home sections | *Shop By Popular* (8 subject tiles) and *Shop by Room* (beige band, counts) are **two separate sections**; one pass merged them. *Shop By Orientation* pills were missed by the other. |
| Header nav | **Two rows** (pages, then styles, Sale in red) under a centered wordmark — the flat single list read off the mega-menu DOM was wrong. |
| Frame control | Radio **pills** visually; the underlying `<select>` is themed. |
| Footer | **4 columns** incl. a contact column, plus a USP strip. |
| Our size units | We already have a "Show in cm" toggle — dual units are partly covered, contrary to one reading. |
| Currency | Their storefront localises: INR in India, USD in the US. Both captures were valid. |
| Phase-A payoff | ~50%, not ~80%. |

## Appendix D — corrections from building it (2026-08-04, #404–#414)

| Claim in this document | What was actually true |
|---|---|
| Sort needs "a sales/relevance signal" for all three missing options (§3.3) | Only Best selling did. Featured was reachable through the API already and merely sorted nulls first. Most relevant has no honest definition on a page with no query — it is out by choice, not for want of data. |
| The Discover carousel is blocked on per-collection photography (§6 *Dependencies*) | It is not. A chip can carry the main image of a representative product in its style. Check whether existing data can supply an asset before booking a shoot. |
| Best selling "needs a sales signal that doesn't exist" | `order_items` has carried `quantity` and `orders` a payment status the whole time. What did not exist was any seeded purchase — so the query was correct and returned zero for everything, which reads identically to being unimplemented. |
| The collection page is "closest already" (§3.3 preamble) | True of the layout, and it is why three items sat unbuilt for a full feature cycle after Phase C was marked done. Closest is not done. |
