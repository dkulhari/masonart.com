# Manual Test: Cart to Checkout to Payment User Journey Flow

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Base URL**: http://localhost:3001
- **Payment Gateway**: Razorpay (Test Mode)

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products (`bun run db:seed`)
- [ ] Docker services (PostgreSQL, Redis) running (`docker compose up -d`)
- [ ] Razorpay test credentials configured
- [ ] At least one product available for testing
- [ ] Test payment cards available (Razorpay test mode)

## Overview
This document covers end-to-end manual testing of the complete purchase user journey:
1. User browses products
2. User adds items to cart
3. User reviews cart
4. User proceeds to checkout
5. User fills shipping information
6. User selects delivery option
7. User completes payment
8. User sees order confirmation

---

## Product to Cart Flow

### TC-001: Add Product to Cart from Product Detail Page

**Description**: Verify user can add product to cart

**Steps**:
1. Navigate to /posters
2. Click on any product card
3. Verify product detail page loads
4. Click "Add to Cart" button
5. Navigate to /cart

**Expected Result**:
- Product detail page shows "Add to Cart" button
- Button click triggers success indication
- Cart page shows the added item

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Update Cart Count in Header After Adding Item

**Description**: Verify header cart icon updates with count

**Steps**:
1. Navigate to a product detail page
2. Note current cart icon state
3. Click "Add to Cart"
4. Observe cart icon in header

**Expected Result**:
- Cart icon shows updated count
- Count increments by 1

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Cart to Checkout Navigation Flow

### TC-003: Navigate from Cart to Checkout

**Description**: Verify "Proceed to Checkout" navigation

**Steps**:
1. Add an item to cart
2. Navigate to /cart
3. Verify item is displayed
4. Click "Proceed to Checkout" button

**Expected Result**:
- URL changes to /checkout
- Checkout page loads with "Checkout" heading
- Order summary shows cart items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Display Cart Summary in Checkout

**Description**: Verify order summary on checkout page

**Steps**:
1. Add items to cart
2. Navigate to /checkout
3. Locate "Order Summary" section

**Expected Result**:
- "Order Summary" heading is visible
- Cart items are listed (may need to click "Show items")
- Totals are displayed correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Preserve Cart Items When Navigating to Checkout

**Description**: Verify cart items are preserved

**Steps**:
1. Add specific items to cart (note titles)
2. Navigate to /checkout
3. Expand order summary to view items

**Expected Result**:
- All added items appear in order summary
- Quantities match what was added
- Prices are correct

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Checkout Steps Flow

### TC-006: Progress from Shipping to Delivery Step

**Description**: Verify shipping form completion advances to delivery

**Steps**:
1. Navigate to /checkout with items in cart
2. Fill shipping form:
   - Full Name: John Doe
   - Email: john.doe@example.com
   - Phone: 9876543210
   - Address: 123 Test Street, Building A
   - City: Mumbai
   - State: Maharashtra
   - PIN Code: 400001
3. Click "Continue to Delivery"

**Expected Result**:
- Form validates successfully
- Advances to "Delivery Options" step
- Delivery options are displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Progress from Delivery to Payment Step

**Description**: Verify delivery selection advances to payment

**Steps**:
1. Complete shipping step (TC-006)
2. On delivery step, keep standard delivery selected
3. Click "Continue to Payment"

**Expected Result**:
- Advances to "Payment" step
- Payment method options are displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Allow Going Back Through Steps

**Description**: Verify back navigation works

**Steps**:
1. Complete shipping step
2. On delivery step, click "Back" button

**Expected Result**:
- Returns to "Shipping Address" step
- Form data is preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Preserve Form Data When Navigating Back

**Description**: Verify form data persistence

**Steps**:
1. Fill shipping form with custom name "Jane Smith"
2. Continue to delivery step
3. Click "Back" button
4. Check Full Name field

**Expected Result**:
- Full Name field still contains "Jane Smith"
- All other fields are preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Complete Purchase Flow

### TC-010: Complete Full Checkout Flow

**Description**: Verify end-to-end checkout flow

**Steps**:
1. Add item to cart
2. Navigate to /checkout
3. Fill shipping address
4. Click "Continue to Delivery"
5. Click "Continue to Payment"
6. Verify "Pay" button is visible

**Expected Result**:
- Each step transitions correctly
- All progress indicators update
- Pay button is enabled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-011: Initiate Payment

**Description**: Verify payment initiation

**Steps**:
1. Complete checkout flow to payment step
2. Click "Pay" button
3. Observe loading state

**Expected Result**:
- Button shows loading/processing state
- "Creating Order" or spinner appears
- Razorpay modal opens (in test mode)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Show Success State After Payment (Test Mode)

**Description**: Verify payment success flow

**Steps**:
1. Complete checkout to payment step
2. Click "Pay" button
3. Complete payment in Razorpay test mode
4. Observe success state

**Expected Result**:
- "Payment Successful" message appears
- Order confirmation is displayed
- Order number is shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Clear Cart After Successful Payment

**Description**: Verify cart is cleared post-payment

**Steps**:
1. Complete successful payment
2. Navigate to /cart

**Expected Result**:
- Cart is empty
- "Your cart is empty" message appears

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Delivery Options Flow

### TC-014: Select Express Delivery Option

**Description**: Verify express delivery selection

**Steps**:
1. Complete shipping step
2. On delivery options, click "Express Delivery"
3. Observe selection state

**Expected Result**:
- Express Delivery option is highlighted/selected
- Border changes to indicate selection
- Delivery estimate updates (2-3 business days)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Show Different Delivery Times for Options

**Description**: Verify delivery time estimates display

**Steps**:
1. Navigate to delivery step
2. Review delivery options

**Expected Result**:
- Standard: "5-7 business days" visible
- Express: "2-3 business days" visible
- Prices displayed for each option

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Free Shipping Threshold Flow

### TC-016: Show Free Shipping When Over Threshold

**Description**: Verify free shipping for qualifying orders

**Steps**:
1. Add item(s) totaling more than 999 to cart
2. Navigate to checkout
3. Complete shipping step
4. Check delivery options

**Expected Result**:
- "FREE" label is visible for standard delivery
- No shipping cost added to total

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Show Shipping Cost When Under Threshold

**Description**: Verify shipping fee for small orders

**Steps**:
1. Add item totaling less than 999 to cart
2. Navigate to checkout
3. Complete shipping step
4. Check delivery options

**Expected Result**:
- Shipping cost (99) is displayed
- Total includes shipping

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Multiple Items Purchase Flow

### TC-018: Display Correct Item Count for Multiple Items

**Description**: Verify item count badge

**Steps**:
1. Add 3 different items to cart (or 1 item with quantity 3)
2. Navigate to /checkout
3. Check item count badge

**Expected Result**:
- Badge shows "3 items"
- All items visible in order summary

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-019: Complete Purchase with Multiple Items

**Description**: Verify multi-item checkout

**Steps**:
1. Add multiple items to cart
2. Complete full checkout flow
3. Complete payment

**Expected Result**:
- All items included in order
- Total price is correct
- Payment succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Item with Frame Purchase Flow

### TC-020: Display Framed Item in Order Summary

**Description**: Verify framed items display correctly

**Steps**:
1. Add a product with frame option selected
2. Navigate to checkout
3. Expand order summary

**Expected Result**:
- Item shows with frame name (e.g., "Black Wood Frame")
- Frame price included in line item total

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Complete Purchase with Framed Item

**Description**: Verify framed item purchase succeeds

**Steps**:
1. Add framed item to cart
2. Complete full checkout flow
3. Complete payment

**Expected Result**:
- Order includes framed item
- Total includes frame price
- Payment succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## AI Generated Item Purchase Flow

### TC-022: Complete Purchase with AI Generated Item

**Description**: Verify AI-generated artwork can be purchased

**Steps**:
1. Create AI poster via /create
2. Add AI-generated poster to cart
3. Complete checkout flow
4. Complete payment

**Expected Result**:
- AI item appears in cart with style info
- Checkout flow works normally
- Payment succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Guest Checkout Flow

### TC-023: Allow Checkout Without Login

**Description**: Verify guest checkout is available

**Steps**:
1. Ensure not logged in (clear session if needed)
2. Add item to cart
3. Navigate to /checkout
4. Verify checkout form is available

**Expected Result**:
- Checkout form is accessible without login
- "Shipping Address" form is visible
- Email field is required for guest

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-024: Require Email for Guest Checkout

**Description**: Verify email is required for guests

**Steps**:
1. Navigate to /checkout as guest
2. Check email field

**Expected Result**:
- Email field is visible and required
- Cannot proceed without valid email

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Order Notes Flow

### TC-025: Allow Adding Order Notes

**Description**: Verify order notes can be added

**Steps**:
1. Navigate to /checkout
2. Find "Special instructions" textarea
3. Enter: "Please gift wrap this item."

**Expected Result**:
- Textarea is visible
- Text can be entered
- Character limit (if any) is enforced

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-026: Preserve Order Notes Through Checkout

**Description**: Verify notes persist through steps

**Steps**:
1. Enter order notes
2. Complete shipping step
3. Continue through delivery and payment steps
4. Check if notes are visible in summary

**Expected Result**:
- Notes are preserved through checkout
- Notes will be included in order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Mobile Checkout Flow

### TC-027: Complete Checkout Flow on Mobile

**Description**: Verify mobile checkout works

**Steps**:
1. Set viewport to 375x667
2. Add item to cart
3. Navigate to /checkout
4. Complete shipping form
5. Continue through steps

**Expected Result**:
- All forms are usable on mobile
- Buttons are accessible
- Steps progress correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Display Checkout Steps Properly on Mobile

**Description**: Verify step indicators on mobile

**Steps**:
1. Set viewport to mobile
2. Navigate through checkout steps
3. Observe step indicators

**Expected Result**:
- Step indicators are visible (may be icons only)
- Current step is highlighted
- Completed steps show checkmarks

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Tablet Checkout Flow

### TC-029: Complete Checkout Flow on Tablet

**Description**: Verify tablet checkout works

**Steps**:
1. Set viewport to 768x1024
2. Complete full checkout flow

**Expected Result**:
- Layout adapts to tablet width
- All functionality works correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Complete User Journey Tests

### TC-030: Journey - Home to Catalog to Product to Cart to Checkout to Payment

**Description**: Complete end-to-end purchase journey

**Steps**:
1. Start at home page (/)
2. Click "Shop Posters" to go to catalog
3. Click on a product card
4. Add item to cart
5. Navigate to /cart
6. Click "Proceed to Checkout"
7. Fill shipping address
8. Select delivery
9. Complete payment

**Expected Result**:
- Each transition is smooth
- All data is preserved
- Payment succeeds
- Order confirmation shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Journey - Cart with Multiple Items Through Complete Checkout

**Description**: Multi-item end-to-end purchase

**Steps**:
1. Add 3 different items to cart
2. Verify cart shows "4 items" (if quantities total 4)
3. Complete checkout with all items
4. Verify payment success
5. Check cart is empty

**Expected Result**:
- All items processed
- Correct total charged
- Cart cleared after payment

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Journey - Express Delivery Purchase

**Description**: Complete purchase with express delivery

**Steps**:
1. Add item to cart
2. Navigate to checkout
3. Complete shipping
4. Select "Express Delivery" option
5. Complete payment

**Expected Result**:
- Express delivery price added to total
- Delivery estimate shows 2-3 days
- Payment succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error Recovery Flow

### TC-033: Handle and Recover from Form Validation Errors

**Description**: Verify form validation and recovery

**Steps**:
1. Navigate to /checkout
2. Fill form with invalid data:
   - Email: invalid-email
   - Phone: 123 (too short)
   - PIN Code: 123 (invalid)
3. Try to continue (button should be disabled)
4. Fix errors with valid data
5. Try to continue again

**Expected Result**:
- Continue button is disabled with invalid data
- Error messages are displayed
- After fixing, button becomes enabled
- Can proceed successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Handle Empty Cart Redirect

**Description**: Verify empty cart handling

**Steps**:
1. Clear cart
2. Navigate directly to /checkout

**Expected Result**:
- Shows "Your cart is empty" message
- "Browse Posters" link is visible
- Link navigates to /posters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance Tests

### TC-035: Complete Checkout Flow Within Acceptable Time

**Description**: Verify checkout performance

**Steps**:
1. Start timer
2. Complete full checkout flow (up to payment step)
3. Stop timer

**Expected Result**:
- Total time under 10 seconds
- No significant delays between steps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Time: _____ ms
- Notes: _______________

---

### TC-036: No JavaScript Errors During Checkout Flow

**Description**: Verify no JS errors during checkout

**Steps**:
1. Open browser DevTools (Console tab)
2. Complete full checkout flow
3. Check console for errors

**Expected Result**:
- No critical JavaScript errors
- Network errors handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Accessibility Tests

### TC-037: Keyboard Navigable Checkout

**Description**: Verify keyboard navigation works

**Steps**:
1. Navigate to /checkout
2. Use Tab to move through form fields
3. Complete form using keyboard only

**Expected Result**:
- All fields are focusable
- Tab order is logical
- Form can be submitted via keyboard

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Form Labels for Screen Readers

**Description**: Verify form labels are associated

**Steps**:
1. Navigate to /checkout
2. Inspect form inputs with DevTools
3. Check for associated labels

**Expected Result**:
- All inputs have `<label for="...">` elements
- Labels match input IDs
- Required fields are indicated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Validation Errors Accessible

**Description**: Verify errors are announced accessibly

**Steps**:
1. Navigate to /checkout
2. Focus on email input, leave empty
3. Tab away to trigger validation
4. Check for error message

**Expected Result**:
- Error message appears
- Error is associated with input
- Screen reader can announce error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BUG-001 | (Example) Payment button briefly flickers on mobile | Low | Open |

---

## Summary

- **Total Test Cases**: 39
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| Product Owner | | | |
