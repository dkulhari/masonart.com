# Manual Test: Product Detail Page

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/posters/{category}/{slug}

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products (various sizes, frames)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] At least one product with multiple variants and frames

## Overview
This document covers manual testing of the chobi.art product detail page, including:
- Product image gallery
- Product information display
- Size selection
- Frame selection
- Price calculation
- Add to cart functionality
- Breadcrumb navigation
- Related products
- SEO and JSON-LD

## Test Cases

---

## Page Load & Display

### TC-001: Product Page Loads

**Description**: Verify product page loads correctly with valid slug

**Steps**:
1. Navigate to a valid product URL (e.g., /posters/abstract/cosmic-dreams)
2. Observe page content

**Expected Result**:
- Page loads without errors
- Product title displayed
- Product image visible
- Price displayed
- Add to cart button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Loading State Display

**Description**: Verify loading skeleton displays during data fetch

**Steps**:
1. Throttle network to slow 3G
2. Navigate to product page
3. Observe loading state

**Expected Result**:
- Skeleton loading displayed
- Breadcrumb skeleton visible
- Image placeholder visible
- Smooth transition to content

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-003: 404 Not Found

**Description**: Verify 404 page for non-existent product

**Steps**:
1. Navigate to /posters/category/non-existent-product-slug
2. Observe page content

**Expected Result**:
- "Product Not Found" heading displayed
- Description explains product doesn't exist
- "Browse All Products" link present
- Link navigates to /posters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Breadcrumb Navigation

### TC-004: Breadcrumb Display

**Description**: Verify breadcrumb navigation renders correctly

**Steps**:
1. Navigate to product detail page
2. Observe breadcrumb navigation

**Expected Result**:
- "Home" link to /
- "Posters" link to /posters
- Category link (e.g., "Abstract") to /posters?styles=abstract
- Current product title (truncated if long)
- Proper separators between items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Breadcrumb Navigation Links

**Description**: Verify breadcrumb links work correctly

**Steps**:
1. Navigate to product detail page
2. Click "Home" breadcrumb
3. Navigate back
4. Click "Posters" breadcrumb
5. Navigate back
6. Click category breadcrumb

**Expected Result**:
- Home navigates to /
- Posters navigates to /posters
- Category navigates to /posters?styles={category}

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-006: Breadcrumb Current Page

**Description**: Verify current page styling in breadcrumb

**Steps**:
1. Navigate to product detail page
2. Observe current page in breadcrumb

**Expected Result**:
- Product title is last item
- Has font-medium styling
- aria-current="page" attribute
- Not a link (not clickable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Product Images

### TC-007: Primary Image Display

**Description**: Verify primary product image displays correctly

**Steps**:
1. Navigate to product detail page
2. Observe main product image

**Expected Result**:
- Large primary image displayed
- Correct aspect ratio for orientation
- High quality image loaded
- Alt text present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Image Gallery Thumbnails

**Description**: Verify image thumbnails display and work

**Steps**:
1. Navigate to product with multiple images
2. Observe thumbnail gallery
3. Click different thumbnails

**Expected Result**:
- Thumbnails for all product images
- Primary image indicated
- Clicking thumbnail updates main image
- Active thumbnail highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Image Zoom/Lightbox

**Description**: Verify image zoom or lightbox functionality (if implemented)

**Steps**:
1. Navigate to product detail page
2. Click on main product image
3. Observe zoom/lightbox behavior

**Expected Result**:
- Image opens in larger view or zooms
- Close button available
- Keyboard escape closes
- Pan/zoom on large image (if applicable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: Image Placeholder

**Description**: Verify placeholder for products without images

**Steps**:
1. Navigate to product without images (or remove from test data)
2. Observe image area

**Expected Result**:
- Placeholder displayed (not broken image)
- Styled appropriately (e.g., Palette icon)
- No console errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Product Information

### TC-011: Product Title Display

**Description**: Verify product title displays correctly

**Steps**:
1. Navigate to product detail page
2. Observe product title

**Expected Result**:
- Title clearly visible
- Appropriate font size (heading)
- Matches database/API value

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-012: Product Description

**Description**: Verify product description displays

**Steps**:
1. Navigate to product detail page
2. Locate product description

**Expected Result**:
- Full description visible or expandable
- Short description if available
- Proper formatting preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Product SKU Display

**Description**: Verify product SKU is displayed

**Steps**:
1. Navigate to product detail page
2. Look for SKU information

**Expected Result**:
- SKU displayed (possibly in subtle text)
- Correct SKU value

**Actual Result**:
- [ ] PASS / [ ] FAIL
- SKU: _______________

---

### TC-014: Product Styles/Tags

**Description**: Verify product styles and tags display

**Steps**:
1. Navigate to product with styles
2. Observe style tags

**Expected Result**:
- Style tags displayed
- Subjects displayed if available
- Tags formatted nicely (capitalized)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Styles: _______________

---

### TC-015: Artist Information

**Description**: Verify artist information displays (if applicable)

**Steps**:
1. Navigate to product with artist
2. Look for artist attribution

**Expected Result**:
- Artist name displayed
- Possibly linked to artist page
- Proper attribution format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Artist: _______________

---

### TC-016: Product Badges

**Description**: Verify product badges (Featured, AI Generated)

**Steps**:
1. Navigate to featured product
2. Navigate to AI-generated product
3. Observe badges

**Expected Result**:
- Featured badge visible on featured products
- AI Generated badge on AI products
- Badges styled appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Size Selection

### TC-017: Size Options Display

**Description**: Verify size options are displayed

**Steps**:
1. Navigate to product with multiple sizes
2. Observe size selector

**Expected Result**:
- All available sizes shown
- Size labels clear (e.g., "12x18 inches")
- Current selection indicated
- Price for each size visible or calculated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sizes: _______________

---

### TC-018: Size Selection Updates Price

**Description**: Verify selecting size updates displayed price

**Steps**:
1. Navigate to product page
2. Note initial price
3. Select different size
4. Observe price change

**Expected Result**:
- Price updates immediately
- Correct price for selected variant
- Currency format correct (Rs.X,XXX)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Change: _______________

---

### TC-019: Default Size Selection

**Description**: Verify default size is pre-selected

**Steps**:
1. Navigate to product page
2. Observe initial size selection

**Expected Result**:
- First size or popular size selected
- Selection visually indicated
- Price shows for default size

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Default Size: _______________

---

### TC-020: Out of Stock Size

**Description**: Verify out of stock sizes are handled

**Steps**:
1. Navigate to product with out-of-stock size
2. Attempt to select out-of-stock size

**Expected Result**:
- Out of stock sizes visually different
- Cannot select or shows "Out of Stock"
- Stock quantity indicator (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Size Dimensions Display

**Description**: Verify size dimensions are shown

**Steps**:
1. Navigate to product page
2. Examine size options

**Expected Result**:
- Width x Height displayed
- Units shown (inches or cm)
- Aspect ratio may be shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Frame Selection

### TC-022: Frame Options Display

**Description**: Verify frame options are displayed

**Steps**:
1. Navigate to product with frame options
2. Observe frame selector

**Expected Result**:
- All frame types shown (No Frame, Black, White, etc.)
- Frame descriptions visible
- Frame images/previews if available
- Current selection indicated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Frames: _______________

---

### TC-023: Frame Selection Updates Price

**Description**: Verify selecting frame updates price

**Steps**:
1. Navigate to product page
2. Note initial price (no frame)
3. Select a frame option
4. Observe price change

**Expected Result**:
- Price increases with frame selection
- Price modifier applied correctly (% or fixed)
- Total price clearly displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Change: _______________

---

### TC-024: No Frame Option

**Description**: Verify "No Frame" or poster-only option

**Steps**:
1. Navigate to product page
2. Select "No Frame" option

**Expected Result**:
- No frame option available
- Base price shown
- No price modifier applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Frame Price Modifiers

**Description**: Verify frame price modifiers calculate correctly

**Steps**:
1. Select size with base price Rs.1000
2. Select frame with 50% modifier
3. Calculate expected total

**Expected Result**:
- Percentage modifiers: Base + (Base * %)
- Fixed modifiers: Base + Fixed amount
- Total displayed correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Calculation: _______________

---

### TC-026: Frame Unavailable

**Description**: Verify handling of unavailable frames

**Steps**:
1. Navigate to product with unavailable frame option
2. Observe unavailable frame

**Expected Result**:
- Unavailable frame visually distinct
- Cannot be selected
- Tooltip or message explaining unavailability

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Frame Preview Image

**Description**: Verify frame preview updates product image

**Steps**:
1. Navigate to product page
2. Select different frame options
3. Observe product image

**Expected Result**:
- Product image shows with selected frame (if implemented)
- Or frame preview image displayed separately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Price Display

### TC-028: Base Price Display

**Description**: Verify base price displays correctly

**Steps**:
1. Navigate to product page
2. Observe price display

**Expected Result**:
- Price clearly visible
- Currency symbol (Rs.)
- Proper Indian number formatting (X,XX,XXX)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price: _______________

---

### TC-029: Price Range Display

**Description**: Verify price range for products with variants

**Steps**:
1. Navigate to product with price variations
2. Observe initial price display

**Expected Result**:
- Shows "From Rs.XXX" or range "Rs.XXX - Rs.XXX"
- Updates to exact price on selection

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: Price Updates Real-time

**Description**: Verify price updates as options change

**Steps**:
1. Navigate to product page
2. Change size
3. Change frame
4. Observe price updates

**Expected Result**:
- Price updates immediately
- No page reload required
- Correct calculation throughout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Add to Cart

### TC-031: Add to Cart Button Display

**Description**: Verify add to cart button is visible

**Steps**:
1. Navigate to product page
2. Locate add to cart button

**Expected Result**:
- Button prominently displayed
- Clear text (e.g., "Add to Cart")
- Brand color styling
- Enabled when product in stock

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Add to Cart Success

**Description**: Verify adding product to cart works

**Steps**:
1. Navigate to product page
2. Select size and frame
3. Click "Add to Cart"
4. Observe response

**Expected Result**:
- Item added to cart
- Success feedback (toast, animation, etc.)
- Cart count updates in header
- Cart icon may show notification

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Add to Cart with No Selection

**Description**: Verify behavior when required options not selected

**Steps**:
1. Navigate to product requiring selections
2. Try to add to cart without selecting options

**Expected Result**:
- User prompted to select required options
- Error message or highlight on missing selection
- Item not added until selections made

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Add Multiple Quantities

**Description**: Verify quantity selection and adding multiple

**Steps**:
1. Navigate to product page
2. Increase quantity (if quantity selector exists)
3. Add to cart
4. Check cart contents

**Expected Result**:
- Quantity selector works (if present)
- Correct quantity added to cart
- Cart shows total quantity

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Quantity Added: _______________

---

### TC-035: Add Same Product Again

**Description**: Verify adding same product configuration again

**Steps**:
1. Add product to cart
2. Stay on page
3. Add same configuration again

**Expected Result**:
- Quantity increments in cart
- Or duplicate item added (depends on implementation)
- Appropriate feedback

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Out of Stock - Add to Cart Disabled

**Description**: Verify add to cart disabled for out of stock

**Steps**:
1. Navigate to out-of-stock product or variant
2. Observe add to cart button

**Expected Result**:
- Button disabled or shows "Out of Stock"
- Muted styling
- cursor-not-allowed if disabled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Related Products

### TC-037: Related Products Section Display

**Description**: Verify related products section renders

**Steps**:
1. Navigate to product page
2. Scroll to related products section

**Expected Result**:
- "You May Also Like" heading visible
- Grid of related products
- 5 products on desktop, fewer on mobile

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Related Product Cards

**Description**: Verify related product cards display correctly

**Steps**:
1. Navigate to product page
2. Examine related product cards

**Expected Result**:
- Product image
- Title and price (when implemented)
- Clickable to product detail

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Related Products Navigation

**Description**: Verify clicking related product navigates

**Steps**:
1. Navigate to product page
2. Click on related product

**Expected Result**:
- Navigates to related product page
- New product details displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## SEO & Meta Tags

### TC-040: Page Title

**Description**: Verify correct page title for SEO

**Steps**:
1. Navigate to product page
2. Check document title

**Expected Result**:
- Title format: "{Product Title} | chobi.art"
- Or custom seoTitle if set

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-041: Meta Description

**Description**: Verify meta description for SEO

**Steps**:
1. Navigate to product page
2. Inspect meta description tag

**Expected Result**:
- Contains product name
- Contains price information
- Mentions chobi.art
- Compelling marketing copy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-042: Open Graph Tags

**Description**: Verify Open Graph meta tags for social sharing

**Steps**:
1. Navigate to product page
2. Inspect og: meta tags

**Expected Result**:
- og:title = Product title
- og:description present
- og:type = "product"
- og:image = Product image URL
- og:url = Canonical URL
- product:price:amount present
- product:price:currency = "INR"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-043: Twitter Card Tags

**Description**: Verify Twitter Card meta tags

**Steps**:
1. Navigate to product page
2. Inspect twitter: meta tags

**Expected Result**:
- twitter:card = "summary_large_image"
- twitter:title present
- twitter:description present
- twitter:image present
- twitter:label1 = "Price"
- twitter:data1 = Price value

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-044: Canonical URL

**Description**: Verify canonical URL is set

**Steps**:
1. Navigate to product page
2. Check canonical link element

**Expected Result**:
- Canonical URL: https://chobi.art/posters/{slug}
- No query parameters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Canonical: _______________

---

### TC-045: JSON-LD Product Schema

**Description**: Verify JSON-LD structured data

**Steps**:
1. Navigate to product page
2. Inspect application/ld+json script

**Expected Result**:
- @type = "Product"
- name = Product title
- description present
- image array
- sku present
- brand = "chobi.art"
- offers with AggregateOffer
- lowPrice and highPrice
- priceCurrency = "INR"
- availability (InStock/OutOfStock)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-046: JSON-LD Rating (if applicable)

**Description**: Verify rating data in JSON-LD

**Steps**:
1. Navigate to product with reviews
2. Check aggregateRating in JSON-LD

**Expected Result**:
- aggregateRating present
- ratingValue matches average
- reviewCount matches count

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design

### TC-047: Mobile Layout

**Description**: Verify product page layout on mobile

**Steps**:
1. Set viewport to mobile (375x667)
2. Navigate to product page
3. Scroll through all sections

**Expected Result**:
- Image full width
- Content stacks vertically
- Buttons full width
- Text readable
- All functionality accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-048: Tablet Layout

**Description**: Verify product page layout on tablet

**Steps**:
1. Set viewport to tablet (768x1024)
2. Navigate to product page

**Expected Result**:
- Appropriate layout for medium screens
- Image and info may be side by side
- Proper spacing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-049: Desktop Layout

**Description**: Verify product page layout on desktop

**Steps**:
1. Set viewport to desktop (1920x1080)
2. Navigate to product page

**Expected Result**:
- Two-column layout (image | info)
- Proper container width
- Comfortable spacing
- All sections visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility

### TC-050: Keyboard Navigation

**Description**: Verify page is keyboard accessible

**Steps**:
1. Navigate to product page
2. Tab through all interactive elements

**Expected Result**:
- Image gallery navigable
- Size options selectable via keyboard
- Frame options selectable
- Add to cart button focusable
- Visible focus indicators

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-051: Screen Reader Compatibility

**Description**: Verify proper ARIA and semantic HTML

**Steps**:
1. Navigate to product page
2. Use screen reader or inspect ARIA

**Expected Result**:
- Proper heading hierarchy
- Images have alt text
- Form controls labeled
- Breadcrumb uses nav element

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-052: Color Contrast

**Description**: Verify sufficient color contrast

**Steps**:
1. Navigate to product page
2. Check text contrast ratios

**Expected Result**:
- Text readable against backgrounds
- WCAG AA compliance minimum
- Price and CTA buttons have good contrast

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-053: Page Load Time

**Description**: Verify acceptable page load time

**Steps**:
1. Open DevTools Network tab
2. Navigate to product page
3. Measure load time

**Expected Result**:
- LCP < 2.5 seconds
- FCP < 1.8 seconds
- Full load < 4 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-054: Image Optimization

**Description**: Verify images are optimized

**Steps**:
1. Navigate to product page
2. Inspect image requests

**Expected Result**:
- Appropriate image sizes loaded
- Modern format (WebP if supported)
- Lazy loading on below-fold images

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error Handling

### TC-055: API Error Handling

**Description**: Verify handling when API fails

**Steps**:
1. Stop API server
2. Navigate to product page

**Expected Result**:
- Error page or 404 displayed
- No unhandled exceptions
- User-friendly message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-056: Image Load Error

**Description**: Verify handling when images fail to load

**Steps**:
1. Block image URLs in DevTools
2. Navigate to product page

**Expected Result**:
- Placeholder or fallback displayed
- No broken image icons
- Page remains functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 56
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Test Product Slug: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Add zoom functionality for product images
   - Show frame preview on product image
   - Add "Save for Later" / Wishlist functionality

2. **SEO**:
   - Implement review schema when reviews added
   - Add product Q&A schema if applicable

3. **Performance**:
   - Implement image srcset for responsive images
   - Add priority hints for primary product image

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
