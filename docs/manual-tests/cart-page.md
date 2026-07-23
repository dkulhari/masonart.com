# Manual Test: Cart Page

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/cart

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Products available to add to cart
- [ ] Docker services (PostgreSQL, Redis) running

## Overview
This document covers manual testing of the chobii.art cart page, including:
- Cart items display
- Quantity management
- Remove items
- Order summary
- Shipping calculation
- Empty cart state
- Navigation to checkout
- Cart persistence

## Test Cases

---

## Empty Cart State

### TC-001: Empty Cart Display

**Description**: Verify empty cart state displays correctly

**Steps**:
1. Clear browser localStorage
2. Navigate to http://localhost:3001/cart

**Expected Result**:
- Shopping bag icon visible
- "Your cart is empty" heading
- Description text about adding items
- "Browse Posters" CTA button
- "Create with AI" secondary button

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Browse Posters Button (Empty Cart)

**Description**: Verify "Browse Posters" navigates to products

**Steps**:
1. Navigate to empty cart
2. Click "Browse Posters" button

**Expected Result**:
- Navigation to /posters
- Product listing page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-003: Create with AI Button (Empty Cart)

**Description**: Verify "Create with AI" button navigates correctly

**Steps**:
1. Navigate to empty cart
2. Click "Create with AI" button

**Expected Result**:
- Navigation to /create
- AI generator page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-004: Recommended Section (Empty Cart)

**Description**: Verify recommended products section in empty cart

**Steps**:
1. Navigate to empty cart
2. Scroll to recommendations section

**Expected Result**:
- "Recommended for You" heading
- Description text
- "View Featured Collection" link
- Link navigates to /posters?featured=true

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Cart With Items

### TC-005: Page Header Display

**Description**: Verify cart page header with items

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Observe page header

**Expected Result**:
- "Shopping Cart" heading (text-2xl/3xl)
- Item count displayed (e.g., "3 items in your cart")
- Singular/plural correct ("1 item" vs "2 items")

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item Count: _______________

---

### TC-006: Cart Layout

**Description**: Verify two-column layout on desktop

**Steps**:
1. Add items to cart
2. Navigate to /cart on desktop
3. Observe layout

**Expected Result**:
- Left column (2/3): Cart items list
- Right column (1/3): Order summary
- Gap between columns
- Proper alignment

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Cart Item Display

### TC-007: Cart Item Information

**Description**: Verify cart item displays all information

**Steps**:
1. Add product with size and frame to cart
2. Navigate to /cart
3. Examine cart item

**Expected Result**:
- Product image
- Product title
- Selected size
- Selected frame (if any)
- Unit price
- Quantity display
- Remove button

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Cart Item Image

**Description**: Verify cart item image displays correctly

**Steps**:
1. Add product to cart
2. Navigate to /cart
3. Observe product image

**Expected Result**:
- Product image visible
- Correct aspect ratio
- Clickable (navigates to product)
- Proper sizing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Cart Item Product Link

**Description**: Verify clicking cart item navigates to product

**Steps**:
1. Add product to cart
2. Navigate to /cart
3. Click on product title/image

**Expected Result**:
- Navigation to product detail page
- Correct product displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-010: Multiple Cart Items

**Description**: Verify multiple items display correctly

**Steps**:
1. Add 3 different products to cart
2. Navigate to /cart
3. Observe items list

**Expected Result**:
- All items displayed
- Each item has proper spacing
- Proper order (newest first or by add time)
- Scroll if many items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Number of Items: _______________

---

## Quantity Management

### TC-011: Increase Quantity

**Description**: Verify increasing item quantity

**Steps**:
1. Add product to cart
2. Navigate to /cart
3. Click quantity increase button (+)

**Expected Result**:
- Quantity increases by 1
- Subtotal updates
- Cart total updates
- Header cart count updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- New Quantity: _______________

---

### TC-012: Decrease Quantity

**Description**: Verify decreasing item quantity

**Steps**:
1. Add product to cart (quantity 2+)
2. Navigate to /cart
3. Click quantity decrease button (-)

**Expected Result**:
- Quantity decreases by 1
- Subtotal updates
- Cart total updates
- Cannot go below 1

**Actual Result**:
- [ ] PASS / [ ] FAIL
- New Quantity: _______________

---

### TC-013: Minimum Quantity (1)

**Description**: Verify cannot decrease below 1

**Steps**:
1. Add product to cart (quantity 1)
2. Navigate to /cart
3. Try to decrease quantity

**Expected Result**:
- Decrease button disabled or no effect
- Quantity stays at 1
- Use remove button to delete item

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Maximum Quantity

**Description**: Verify maximum quantity handling

**Steps**:
1. Add product to cart
2. Increase quantity to stock limit (if any)
3. Try to increase further

**Expected Result**:
- Cannot exceed stock quantity
- Message about max quantity (if implemented)
- Or no stock limit in frontend

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Max Quantity: _______________

---

### TC-015: Price Updates with Quantity

**Description**: Verify line item total updates with quantity

**Steps**:
1. Add product to cart (Rs.1000)
2. Increase quantity to 3
3. Observe line total

**Expected Result**:
- Line total = Unit Price x Quantity
- Rs.1000 x 3 = Rs.3,000
- Proper formatting

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Calculated Total: _______________

---

## Remove Items

### TC-016: Remove Item Button

**Description**: Verify remove item functionality

**Steps**:
1. Add product to cart
2. Navigate to /cart
3. Click remove/trash button on item

**Expected Result**:
- Item removed from cart
- Cart updates immediately
- Subtotal updates
- If last item, empty state shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Remove Confirmation

**Description**: Verify remove confirmation (if implemented)

**Steps**:
1. Add product to cart
2. Navigate to /cart
3. Click remove button
4. Observe confirmation

**Expected Result**:
- If confirmation: Dialog appears
- Cancel returns to cart
- Confirm removes item
- Or immediate removal (no confirmation)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-018: Clear Cart Button

**Description**: Verify clear entire cart functionality

**Steps**:
1. Add multiple items to cart
2. Navigate to /cart
3. Click "Clear Cart" button

**Expected Result**:
- All items removed
- Empty cart state displayed
- Confirmation before clearing (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Order Summary

### TC-019: Order Summary Display

**Description**: Verify order summary section displays correctly

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Observe order summary sidebar

**Expected Result**:
- "Order Summary" heading
- Subtotal with item count
- Shipping line
- Tax line (calculated at checkout)
- Estimated Total

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Subtotal Calculation

**Description**: Verify subtotal is calculated correctly

**Steps**:
1. Add multiple items with different prices
2. Navigate to /cart
3. Verify subtotal

**Expected Result**:
- Subtotal = Sum of (Price x Quantity) for all items
- Correct currency formatting
- Updates when cart changes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Calculated Subtotal: _______________

---

### TC-021: Free Shipping Progress Bar

**Description**: Verify free shipping progress indicator

**Steps**:
1. Add item with subtotal < Rs.999
2. Navigate to /cart
3. Observe shipping section

**Expected Result**:
- Progress bar visible
- "Add Rs.X more for free shipping!" message
- Progress bar width reflects amount toward Rs.999
- Updates as cart changes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Amount for Free Shipping: _______________

---

### TC-022: Shipping Fee Calculation

**Description**: Verify shipping fee logic

**Steps**:
1. Test with subtotal < Rs.999
2. Test with subtotal >= Rs.999
3. Observe shipping cost

**Expected Result**:
- Below Rs.999: Shipping = Rs.99
- Rs.999 or above: Shipping = FREE (green text)
- Total updates accordingly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping Under 999: _______________
- Shipping Over 999: _______________

---

### TC-023: Tax Calculation Display

**Description**: Verify tax display

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Observe tax line

**Expected Result**:
- Tax line shows "Calculated at checkout"
- Not included in estimated total
- Appropriate styling (muted text)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-024: Estimated Total

**Description**: Verify estimated total calculation

**Steps**:
1. Add items to cart (subtotal Rs.1500)
2. Navigate to /cart
3. Check estimated total

**Expected Result**:
- Total = Subtotal + Shipping
- If free shipping: Total = Subtotal
- Prominently displayed (larger font)
- Correct formatting

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Estimated Total: _______________

---

### TC-025: Sticky Order Summary

**Description**: Verify order summary stays visible on scroll

**Steps**:
1. Add many items to cart
2. Navigate to /cart on desktop
3. Scroll down through items

**Expected Result**:
- Order summary remains sticky (top-24)
- Stays visible while scrolling items
- Max height prevents overflow issues

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Proceed to Checkout

### TC-026: Checkout Button Display

**Description**: Verify checkout button is displayed

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Observe checkout button

**Expected Result**:
- "Proceed to Checkout" button visible
- Arrow icon present
- Brand color styling (brand-500)
- Full width button

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Checkout Button Navigation

**Description**: Verify checkout button navigates correctly

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Click "Proceed to Checkout"

**Expected Result**:
- Navigation to /checkout
- Cart data preserved
- Checkout page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Trust Badges

### TC-028: Trust Badges Display

**Description**: Verify trust badges are displayed

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Observe trust badges section

**Expected Result**:
- Free shipping badge (Truck icon)
- Secure checkout badge (Shield icon)
- 30-day returns badge (RotateCcw icon)
- Appropriate text for each

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-029: Payment Methods Display

**Description**: Verify payment methods are shown

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Scroll to payment methods

**Expected Result**:
- "Accepted Payment Methods" label
- Visa, Mastercard, Razorpay, UPI badges
- Styled as small chips/badges

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Continue Shopping

### TC-030: Continue Shopping Link

**Description**: Verify continue shopping link

**Steps**:
1. Add items to cart
2. Navigate to /cart
3. Click "Continue Shopping" link

**Expected Result**:
- Link visible below cart items
- Navigation to /posters
- ChevronRight icon present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Cart Persistence

### TC-031: Cart Persists on Page Refresh

**Description**: Verify cart survives page refresh

**Steps**:
1. Add items to cart
2. Note cart contents
3. Refresh page (F5)
4. Check cart

**Expected Result**:
- All items still in cart
- Quantities preserved
- Selections (size, frame) preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Cart Persists Across Navigation

**Description**: Verify cart persists across site navigation

**Steps**:
1. Add items to cart
2. Navigate to home page
3. Navigate to products
4. Return to /cart

**Expected Result**:
- All items still in cart
- Cart count in header consistent
- No data loss

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Cart Persists Browser Close

**Description**: Verify cart persists after browser close

**Steps**:
1. Add items to cart
2. Close browser completely
3. Reopen browser
4. Navigate to /cart

**Expected Result**:
- Items still in cart (localStorage)
- All data preserved
- Or cleared if guest cart expires

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Cart Syncs Across Tabs

**Description**: Verify cart updates across browser tabs

**Steps**:
1. Open /cart in Tab 1
2. Open /cart in Tab 2
3. Add item via Tab 2
4. Observe Tab 1

**Expected Result**:
- Tab 1 updates (may need refresh)
- Or storage event syncs carts
- Both tabs show same cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## SEO & Meta Tags

### TC-035: Page Title

**Description**: Verify cart page title

**Steps**:
1. Navigate to /cart
2. Check document title

**Expected Result**:
- Title: "Shopping Cart | chobii.art"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-036: Meta Description

**Description**: Verify cart page meta description

**Steps**:
1. Navigate to /cart
2. Inspect meta description

**Expected Result**:
- Description about cart management
- Mentions chobii.art
- Appropriate for cart page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-037: Robots Meta Tag

**Description**: Verify cart page is noindex

**Steps**:
1. Navigate to /cart
2. Check robots meta tag

**Expected Result**:
- robots content = "noindex"
- Cart pages should not be indexed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Robots Value: _______________

---

## Responsive Design

### TC-038: Mobile Layout

**Description**: Verify cart page on mobile

**Steps**:
1. Set viewport to mobile (375x667)
2. Add items to cart
3. Navigate to /cart

**Expected Result**:
- Single column layout
- Cart items full width
- Order summary below items
- Buttons full width
- All content accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Tablet Layout

**Description**: Verify cart page on tablet

**Steps**:
1. Set viewport to tablet (768x1024)
2. Navigate to /cart

**Expected Result**:
- Appropriate responsive layout
- May be single or two column
- All functionality works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-040: Desktop Layout

**Description**: Verify cart page on desktop

**Steps**:
1. Set viewport to desktop (1920x1080)
2. Navigate to /cart

**Expected Result**:
- Two-column layout
- Cart items on left (2/3)
- Order summary on right (1/3)
- Proper spacing and gaps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility

### TC-041: Keyboard Navigation

**Description**: Verify cart is keyboard accessible

**Steps**:
1. Navigate to /cart
2. Tab through all interactive elements

**Expected Result**:
- All buttons focusable
- Quantity controls accessible
- Remove buttons accessible
- Checkout button focusable
- Visible focus indicators

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-042: Screen Reader Compatibility

**Description**: Verify proper accessibility markup

**Steps**:
1. Navigate to /cart
2. Inspect ARIA and semantic HTML

**Expected Result**:
- Proper heading hierarchy
- Buttons have accessible names
- Images have alt text
- Cart updates announced (if live region)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-043: Cart Operations Speed

**Description**: Verify cart operations are fast

**Steps**:
1. Navigate to /cart
2. Test quantity changes
3. Test item removal
4. Measure response time

**Expected Result**:
- Instant UI updates (< 100ms)
- No perceptible lag
- Smooth animations

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-044: Large Cart Performance

**Description**: Verify performance with many items

**Steps**:
1. Add 20+ items to cart
2. Navigate to /cart
3. Test all operations

**Expected Result**:
- Page renders quickly
- Scroll is smooth
- Operations remain fast
- No memory issues

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Edge Cases

### TC-045: Product Removed from Store

**Description**: Verify handling when cart product no longer exists

**Steps**:
1. Add product to cart
2. Remove product from database
3. Navigate to /cart

**Expected Result**:
- Graceful handling
- Item removed or shows error
- Cart still functional
- User notified if possible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-046: Price Changed After Add

**Description**: Verify handling when product price changes

**Steps**:
1. Add product at Rs.1000
2. Update product price to Rs.1200 in database
3. Navigate to /cart

**Expected Result**:
- Shows current price or original price
- Clear indication if price changed
- Total calculated correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-047: Product Out of Stock After Add

**Description**: Verify handling when cart item goes out of stock

**Steps**:
1. Add product to cart
2. Mark product out of stock in database
3. Navigate to /cart

**Expected Result**:
- Item shows out of stock indicator
- Cannot proceed to checkout with OOS items
- Or item removed with notification

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error Handling

### TC-048: LocalStorage Disabled

**Description**: Verify behavior when localStorage unavailable

**Steps**:
1. Disable localStorage in browser
2. Try to add items to cart
3. Navigate to /cart

**Expected Result**:
- Graceful fallback
- In-memory cart or error message
- No crashes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-049: Corrupted Cart Data

**Description**: Verify handling of corrupted localStorage

**Steps**:
1. Manually corrupt cart data in localStorage
2. Navigate to /cart

**Expected Result**:
- Cart resets gracefully
- No crashes or errors
- User can continue shopping

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 49
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Cart Store Implementation: Zustand + localStorage

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Add undo for removed items
   - Show savings/discounts if applicable
   - Add quantity input field for direct entry

2. **Features**:
   - Add "Save for Later" functionality
   - Show estimated delivery date
   - Add promo code field

3. **Performance**:
   - Consider cart state optimization for large carts
   - Add skeleton loading during hydration

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
