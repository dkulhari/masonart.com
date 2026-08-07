# Mesonart home Customer Reviews band — measured spec

Measured live off `https://www.mesonart.com/` on 2026-08-07 by reading the
`loox-dynamic-carousel-widget` **shadow root** (`shadowRoot` is open) and its
computed styles. Viewport `innerWidth: 1624`, page gutter 48px, content width
1528px. This file is the bar. Where it disagrees with ticket #581's description
table, this file wins — #581 was written from the screenshot alone and got the
structure wrong.

## The structural finding

**It is not one alternating rail.** The widget is a two-column CSS grid holding
**two independently-tracked Swipers over the same 21 reviews**:

```
.dynamic-carousel-sliders-grid  display:grid
  grid-template-columns: 383.994px 1127.76px    /* text | media */
  grid-template-rows:    423.994px
  gap: 16px
```

- **Left column** — `.dynamic-carousel-text-swiper-container`, 384×424 at x=48.
  A *fixed blush plate* that text slides move through. One card visible.
- **Right column** — `.dynamic-carousel-image-swiper-container`, 1128×424 at
  x=448. Media tiles 560×424, pitch 568 (8px gap). `items-per-view="2"` = two
  fully-visible tiles.

Both swipers hold **all 21 reviews** and advance together. A review is not
routed to one column or the other — it appears as a quote on the left and, if it
has media, as a tile on the right. Ticket #581's `buildReviewSlides` interleaves
one flat list; that is the wrong model and produces a different band.

Shipped implementation renders one `overflow-x-auto` rail of alternating slides.
That is the defect.

## Section shell

| Thing | Value |
|---|---|
| Page background | `#ffffff` (no sand band) |
| Header section | its own block, ends at y=237 |
| Carousel section padding | `64px 0` |
| Page width wrapper | `padding: 0 48px`, content 1528 |
| Gap header bottom → rail top | 63px |

## Header row (separate section, above the widget)

`.customer-reviewx` — `display:flex; justify-content:space-between; align-items:center; gap:15px; width:1528`

Left block (width 337):
- `h2` "Customer Reviews" — **Urbanist 42px / 50.4px line-height, weight 300, `#1d1d1d`**
- Rating row 60px below the h2 top (y=212), `display:flex; align-items:center`:
  - 5 star svgs, **16px**, colour **`#f5c264`** (NOT the `#ff8d00` the slides use)
  - label span, 16px, `#000`, text `9000+   Score 4.9/ 5.0`
  - The star `<title>` says `4.9 rating (7000 reviews)` — their own label
    disagrees with their own widget. **Do not copy the numbers**; keep ours real.

Right block — `a.button.button--primary.button--md`:
- 154×59, `border-radius: 60px`, background `#fff`, colour `#000`
- `padding: 19.485px 26px`, font **18px / weight 500**
- inner flex, `gap: 12px`, label "View All" + a 20px arrow svg on the right
- vertically centred against the two-line left block

## Text column — the blush plate

The blush is on the **swiper viewport**, not on the slide:

| Thing | Value |
|---|---|
| Element | `.swiper.text-swiper` |
| Size | 384 × 424 |
| Background | **`rgb(246, 239, 236)`** = `#f6efec` |
| Radius | `40px` (`corner-radius="40"`) |
| Overflow | hidden — slides translate through a static plate |

Slide interior — `.dynamic-carousel-text-swiper-content`:

```
display: grid;
gap: 16px;
padding: 56px 40px;
height: 424px;
```

Rows top→bottom:

1. **Stars** — `.review-rating`, `display:flex; gap:4px`, five 24px svgs,
   colour **`#ff8d00`** (`stars-color`). Left-aligned. Row height 24.
2. **Body** — `p.review-text`, **Poppins 24px / 36px line-height, weight 300**,
   colour **`rgb(76,70,66)`** = `#4c4642`, `text-align: start`, width 304.
   Truncated at `max-characters="180"`.
3. **Attribution** — `.reviewer-name-container`, `display:flex; align-items:center;
   gap:4px`, pushed to the **bottom-right** (measured x=294..392 against a content
   box that ends at 392):
   - verified badge `span.lxs-icon.verified-badge`, **18px**, colour
     **`rgb(104,92,83)`** = `#685c53`
   - name `span.reviewer-name`, **18px**, colour **`rgb(51,48,46)`** = `#33302e`,
     rendered `Daniel N.` (first name + last initial)

**Quote mark** — `div.lxs-icon.quote-marks`, `position:absolute`, **54×38**,
colour **`rgb(120,88,59)`** = `#78583b`, placed at x=40,y=292 against a plate at
x=48,y=300 — i.e. **offset `-8px, -8px` outside the plate's top-left corner**,
overlapping it. It is `quote-marks-icon="style-1"`: two solid comma-shaped marks,
not a typographic `&ldquo;`.

## Media column — tiles

| Thing | Value |
|---|---|
| Tile | 560 × 424 (ratio ≈ 1.32) |
| Pitch | 568 (8px gap) |
| Radius | `40px` on `.swiper-material-wrapper`, overflow hidden |
| Image | `img.review-image`, `object-fit: cover`, full bleed |
| Source | `…_orig_thumb.jpg` — a thumbnail, not the original |
| Placeholder | wrapper carries a per-image average colour while loading |
| Rating overlay | present in DOM but `hidden` — tiles carry no text |

### The still lies about tile widths

`mesonart-home-reviews-band.png` shows three tiles of visibly different widths
(roughly 548 / 348 / 184). A blind critic read that as content-driven,
aspect-ratio sizing and called our uniform tiles the giveaway. It is not: every
one of the widget's 21 media slides measures **560px in the live DOM**. The
classes are `swiper-material-wrapper` / `swiper-material-content` — Swiper's
**Material effect**, which animates slide size through a transition. The still
was captured mid-advance. Size tiles uniformly; do not chase the screenshot.

## Controls

**Arrows** — `.swiper-button-prev` / `.swiper-button-next`:
- 56 × 56, `border-radius: 100%`, background `#fff`
- prev at x=20 (centre 48 — dead on the content's left edge)
- next at x=1540 (centre 1568 — 8px inside the content's right edge)
- vertically centred on the 424 rail

**Pagination** — one shared row under the grid, **left-aligned at x=112**
(content starts at 48, so 64px in), total width 90, 12px below the rail.
Swiper *dynamic bullets*:

| State | Size |
|---|---|
| active | 24 × 8 pill |
| large (adjacent) | 8 × 8 |
| medium (next out) | 5 × 5 |
| invisible / out-of-range | 0 |

**Autoplay** — `autoplay-delay="5"` (5s). Both swipers advance in lockstep.

## What ours must keep regardless of parity

- The suppression rule, unmoved and after the hooks.
- The real aggregate — never their hardcoded `9000+ / 4.9`.
- `data-testid="home-reviews"` and `home-reviews-score`.
- Video: `poster`, `preload="none"`, never `autoPlay`.
- Autoplay off under `prefers-reduced-motion`; pauses on hover and on focus
  within the region.

## Not yet measured

Mobile (`items-per-view-mobile="3"`). `resize_window` did not change the page's
layout viewport, so the mobile arrangement is unverified.
