# PDP parity reference — mesonart.com

Bar: <https://www.mesonart.com/collections/new/products/rainy-day-compassion-pac347>
Ours: <http://localhost:3001/posters/wabi-sabi-study>

All measurements taken at viewport **1440×900** (page container resolves to **1302px**, same as our
`.container-wide`). Mobile measurements at **390×844**.

Fonts already match: headings **Urbanist**, body **Poppins**. The gap is sizing, colour and structure,
not the type system.

## Column geometry (desktop, 1302px container)

| Box | x | width |
|---|---|---|
| Thumbnail rail | 21 | 58 |
| Main image | 90 | 658 (square, 658×658) |
| Buy panel | 796 | 485 |

So: gallery block spans 21→748 (727px incl. rail + 12px gutter), then a ~48px gap, then a 485px buy
column. Ours is currently a symmetric `607px 607px` grid — that is the single biggest structural gap.

## Measured styles

### H1
`Urbanist`, **42px**, weight **300**, colour `rgb(29,29,29)`, line-height normal.
Ours: 30px. Text includes the SKU inline — `Rainy Day Compassion #PAC347`.

### Price
`Poppins`, **24px**, weight **500**, colour **`rgb(187,0,0)`** (red).
No card, no border, no background. Ours currently sits in a grey rounded panel at 36px black.

### Add to cart
- background `rgb(23,23,23)`, colour white
- border-radius **60px** (full pill), height **60px**, padding `18px 26px`
- font 16px weight 400
- label carries the price: `Add to cart - Rs. 21,200.00`
- width 343px, sits on **one row** to the right of the quantity stepper (which is a separate
  bordered pill, `‹ 1 ›`, ~200px wide)

### Size selector
A native-looking **`<select>`**, not a stacked list:
- height **52px**, radius **6px**, background `rgba(23,23,23,0.024)`, padding `0 26px`
- font 16px weight 300, full column width (485px)
- first option is the placeholder `Select a Size`
- option label format: `24"H x 20"W/ 61H x 51W CM` — inches **and** cm in one string, no price

Ours renders every size as a full-width card with its own price; it eats the entire viewport.

### Frame selector
- Label line reads `<option group>:  <selected value>` — e.g.
  `Rolled Canvas/Frameless/Framed:  Rolled Canvas`
- Options are **circular photographic swatches** (~92px) showing a corner/edge crop of the material,
  wrapping onto multiple rows (7 options on the reference)
- Selected swatch gets a solid dark ring; the rest get a light ring
- No prices on the swatches

### Delivery estimate
One line under the swatches, blue/dark check glyph then:
`Arrives soon! Get it by **Aug 13–Aug 21** if you order today` — date range bold, rest muted.

### Trust list
Four stacked rows, icon left (~24px), then a bold title with a small `?` tooltip circle, and a muted
sub-line beneath:

| Title | Sub-line |
|---|---|
| Ship After You Are Satisfied | Each piece is made just for you! |
| Free Shipping on All Orders | 5-7 days fast free shipping worldwide |
| 30 Days Easy Returns | Learn more. |
| Safe Payment Options | 100% money back guarantee |

Ours has three inline badges in a row instead.

### Social proof (above H1)
- `● 89 saves · In 7 carts now` — red dot, red numerals — with a wishlist heart at the right
- `🛒 3 sold in last 84 hours` — red numerals — sits between H1 and price

### Below the buy panel, in order
1. `Visually Similar Artworks` — horizontal **carousel** with circular prev/next arrows, 5 cards
   visible, card = image + title + `from Rs. X` + `#SKU`
2. Tab bar: `About The Artwork` · `Details And Customization` · `Shipping And Returns` · `Review`
   — underline marks the active tab
3. Artist quote block, centred, with its own `Artist / Artist's Popular Art / Artist's Latest Art` tabs
4. `More to Love` — second carousel
5. `MesonArt in Real Life` — Instagram row
6. `Why MesonArt?` — 4-column icon band
7. Complimentary Art Advisory band

Ours: flat `Description` / `Perfect For` sections, a reviews wall, and a plain
`You May Also Like` grid.

## Mobile (390px)

- Main image is a rounded card with ~16px side padding
- Thumbnails become a **horizontal scroll strip** directly below the main image (~72px squares)
- Social proof line, then H1, then the sold-count line
- Expand/fullscreen button stays pinned top-right of the main image

## Out of scope

Shopify-specific chrome: `Buy with Shop` / `More payment options` (we use Razorpay), and the
site-wide header/footer (already covered by the completed `mesonart-design-parity` and
`global-chrome-parity` features).
