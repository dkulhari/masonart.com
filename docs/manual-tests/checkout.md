# Manual Test: Checkout Page

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/checkout

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Items added to cart before testing checkout
- [ ] User logged in for authenticated checkout tests

## Overview
This document covers manual testing of the chobi.art checkout page, including:
- Multi-step checkout flow (Shipping, Delivery, Payment)
- Progress steps indicator
- Shipping address form validation
- Delivery options selection
- Payment step preparation
- Order summary sidebar
- Trust badges and security indicators
- Responsive design
- Accessibility

## Test Cases

---

## Page Header

### TC-001: Page Title Display

**Description**: Verify checkout page header displays correctly

**Steps**:
1. Add items to cart
2. Navigate to http://localhost:3001/checkout

**Expected Result**:
- "Checkout" heading (h1) visible
- Page title contains "Checkout | chobi.art"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Back to Cart Link

**Description**: Verify "Back to Cart" link works correctly

**Steps**:
1. Navigate to /checkout with items in cart
2. Click "Back to Cart" link

**Expected Result**:
- Link visible with text "Back to Cart"
- Navigation to /cart when clicked
- Cart contents preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-003: Noindex Robots Meta Tag

**Description**: Verify checkout page is not indexed by search engines

**Steps**:
1. Navigate to /checkout
2. Inspect page source or use browser dev tools
3. Check for robots meta tag

**Expected Result**:
- `<meta name="robots" content="noindex">` present
- Page should not appear in search results

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Robots content: _______________

---

## Empty Cart State

### TC-004: Empty Cart Message

**Description**: Verify empty cart message on checkout page

**Steps**:
1. Clear browser localStorage
2. Navigate to /checkout

**Expected Result**:
- "Your cart is empty" heading visible
- Shopping cart icon displayed
- Descriptive text about adding items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Browse Posters Button (Empty Cart)

**Description**: Verify "Browse Posters" CTA button works

**Steps**:
1. Navigate to /checkout with empty cart
2. Click "Browse Posters" button

**Expected Result**:
- Button visible and styled prominently
- Navigation to /posters on click

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Progress Steps Indicator

### TC-006: Progress Steps Display

**Description**: Verify all checkout steps are displayed

**Steps**:
1. Add items to cart
2. Navigate to /checkout
3. Observe progress indicator

**Expected Result**:
- Three steps visible: Shipping, Delivery, Payment
- Each step has an icon
- Current step highlighted (brand color)
- Connector lines between steps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Steps displayed: _______________

---

### TC-007: Current Step Highlighting

**Description**: Verify current step is visually highlighted

**Steps**:
1. Navigate to /checkout (Shipping step)
2. Complete shipping, move to Delivery
3. Complete delivery, move to Payment

**Expected Result**:
- Current step has brand-500 background color
- Previous completed steps show green checkmark
- Connector lines turn green for completed sections

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Clickable Completed Steps

**Description**: Verify can click on completed steps to navigate back

**Steps**:
1. Complete shipping step
2. Click on "Shipping" in progress indicator

**Expected Result**:
- Navigation back to Shipping step
- Form data preserved
- Can proceed again

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Shipping Step - Form Fields

### TC-009: Full Name Field

**Description**: Verify Full Name field displays and validates correctly

**Steps**:
1. Navigate to /checkout with items in cart
2. Locate Full Name field
3. Test validation (empty, single character, valid name)

**Expected Result**:
- Label: "Full Name" with required indicator (*)
- Error for empty: "Full name is required"
- Error for short: "Name must be at least 2 characters"
- Accepts valid names (2+ characters)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation messages: _______________

---

### TC-010: Email Field

**Description**: Verify Email field displays and validates correctly

**Steps**:
1. Locate Email field
2. Test validation (empty, invalid format, valid email)

**Expected Result**:
- Label: "Email" with required indicator (*)
- Error for empty: "Email is required"
- Error for invalid: "Please enter a valid email address"
- Accepts valid email (e.g., test@example.com)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation messages: _______________

---

### TC-011: Phone Field

**Description**: Verify Phone field displays and validates correctly

**Steps**:
1. Locate Phone field
2. Test validation (empty, short number, valid 10-digit)

**Expected Result**:
- Label: "Phone" with required indicator (*)
- Error for empty: "Phone number is required"
- Error for invalid: "Please enter a valid 10-digit phone number"
- Accepts valid 10-digit number (e.g., 9876543210)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation messages: _______________

---

### TC-012: Address Field

**Description**: Verify Address field displays and validates correctly

**Steps**:
1. Locate Address (addressLine1) field
2. Test validation (empty, short address, valid address)

**Expected Result**:
- Label: "Address" with required indicator (*)
- Textarea field for multiline input
- Error for empty: "Address is required"
- Error for short: "Please enter a complete address"
- Accepts valid address (10+ characters)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation messages: _______________

---

### TC-013: Optional Address Line 2 Field

**Description**: Verify Address Line 2 is optional

**Steps**:
1. Locate Address Line 2 field
2. Leave empty and submit form
3. Fill with value and submit form

**Expected Result**:
- Label includes "(Optional)"
- No validation error when empty
- Accepts any value

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Optional Landmark Field

**Description**: Verify Landmark field is optional

**Steps**:
1. Locate Landmark field
2. Leave empty and verify no error

**Expected Result**:
- Label includes "(Optional)"
- No validation error when empty
- Accepts any value

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: City Field

**Description**: Verify City field displays and validates correctly

**Steps**:
1. Locate City field
2. Test validation

**Expected Result**:
- Label: "City" with required indicator (*)
- Error for empty: "City is required"
- Accepts valid city name

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation messages: _______________

---

### TC-016: State Dropdown

**Description**: Verify State dropdown contains Indian states

**Steps**:
1. Locate State dropdown
2. Click to expand options
3. Verify states list

**Expected Result**:
- Label: "State" with required indicator (*)
- Dropdown contains all Indian states
- Maharashtra, Delhi, Karnataka, etc. present
- Error for unselected: "State is required"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- States found: _______________

---

### TC-017: PIN Code Field

**Description**: Verify PIN Code field displays and validates correctly

**Steps**:
1. Locate PIN Code (postalCode) field
2. Test validation (empty, 3 digits, 6 digits)

**Expected Result**:
- Label: "PIN Code" with required indicator (*)
- Error for empty: "PIN code is required"
- Error for invalid: "Please enter a valid 6-digit PIN code"
- Accepts valid 6-digit PIN (e.g., 400001)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation messages: _______________

---

### TC-018: Order Notes Section

**Description**: Verify Order Notes (special instructions) field

**Steps**:
1. Locate Order Notes section
2. Fill with text
3. Verify character count

**Expected Result**:
- "Order Notes" heading visible
- Textarea with placeholder about special instructions
- Character count displayed (e.g., "9/500")
- Maximum 500 characters enforced

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Max length: _______________

---

### TC-019: Continue to Delivery Button - Invalid Form

**Description**: Verify Continue button is disabled when form invalid

**Steps**:
1. Navigate to /checkout with items
2. Leave form empty
3. Check button state

**Expected Result**:
- "Continue to Delivery" button visible
- Button disabled when form incomplete/invalid
- Button has disabled styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button state: _______________

---

### TC-020: Continue to Delivery Button - Valid Form

**Description**: Verify Continue button enables when form valid

**Steps**:
1. Fill all required fields with valid data
2. Check button state
3. Click button

**Expected Result**:
- Button becomes enabled (not disabled)
- Click navigates to Delivery step
- Form data preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Delivery Step

### TC-021: Delivery Options Display

**Description**: Verify delivery options section displays correctly

**Steps**:
1. Complete shipping form
2. Click "Continue to Delivery"
3. Observe delivery options

**Expected Result**:
- "Delivery Options" heading (h2) visible
- Standard Delivery option visible
- Express Delivery option visible
- Each option shows estimated days and price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Options displayed: _______________

---

### TC-022: Standard Delivery Option

**Description**: Verify Standard Delivery details

**Steps**:
1. Navigate to Delivery step
2. Examine Standard Delivery option

**Expected Result**:
- "Standard Delivery" label
- "5-7 business days" delivery estimate
- Free or ₹99 shipping based on cart total
- Selected by default (highlighted border)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Details: _______________

---

### TC-023: Express Delivery Option

**Description**: Verify Express Delivery details

**Steps**:
1. Navigate to Delivery step
2. Examine Express Delivery option
3. Click to select

**Expected Result**:
- "Express Delivery" label
- "2-3 business days" delivery estimate
- Higher price than standard (e.g., ₹199)
- Border highlights when selected (brand-500)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Details: _______________

---

### TC-024: Free Shipping Threshold

**Description**: Verify free shipping for orders over ₹999

**Steps**:
1. Add items totaling > ₹999
2. Navigate to Delivery step
3. Check Standard Delivery price

**Expected Result**:
- Standard Delivery shows "FREE" in green
- "You qualify for free standard shipping!" message visible
- No ₹99 charge applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping price: _______________

---

### TC-025: Paid Shipping Under Threshold

**Description**: Verify shipping charge for orders under ₹999

**Steps**:
1. Add items totaling < ₹999
2. Navigate to Delivery step
3. Check Standard Delivery price

**Expected Result**:
- Standard Delivery shows ₹99
- Progress indicator showing amount needed for free shipping

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping price: _______________

---

### TC-026: Shipping Address Summary

**Description**: Verify shipping address summary in Delivery step

**Steps**:
1. Complete shipping form
2. Navigate to Delivery step
3. Observe "Shipping To" section

**Expected Result**:
- "Shipping To" heading visible
- Entered name, address, city displayed
- "Edit" button/link visible
- Clicking Edit returns to Shipping step

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Address displayed correctly: _______________

---

### TC-027: Back Button in Delivery Step

**Description**: Verify Back button returns to Shipping step

**Steps**:
1. Navigate to Delivery step
2. Click "Back" button

**Expected Result**:
- "Back" button visible
- Click returns to Shipping step
- Form data preserved in Shipping form

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Continue to Payment Button

**Description**: Verify Continue to Payment button works

**Steps**:
1. Navigate to Delivery step
2. Select delivery option
3. Click "Continue to Payment"

**Expected Result**:
- "Continue to Payment" button visible and enabled
- Click navigates to Payment step
- Delivery selection preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Payment Step

### TC-029: Payment Section Display

**Description**: Verify Payment section displays correctly

**Steps**:
1. Complete Shipping and Delivery steps
2. Click "Continue to Payment"
3. Observe Payment section

**Expected Result**:
- "Payment" heading (h2) visible
- Order summary visible
- Pay button with amount visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: Order Summary in Payment Step

**Description**: Verify order summary shows shipping and delivery info

**Steps**:
1. Navigate to Payment step
2. Examine order summary

**Expected Result**:
- "Order Summary" heading visible
- "Shipping to:" with address displayed
- "Delivery:" with selected method
- Total Amount prominently displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Summary details: _______________

---

### TC-031: Back Button in Payment Step

**Description**: Verify Back button returns to Delivery step

**Steps**:
1. Navigate to Payment step
2. Click "Back" button

**Expected Result**:
- "Back" button visible
- Click returns to Delivery step
- All selections preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Order Summary Sidebar

### TC-032: Order Summary Heading

**Description**: Verify Order Summary sidebar displays correctly

**Steps**:
1. Navigate to /checkout with items
2. Observe right sidebar (desktop) or collapsed section

**Expected Result**:
- "Order Summary" heading (h2) visible
- Item count badge (e.g., "2 items")
- Show/Hide items toggle

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Subtotal Display

**Description**: Verify subtotal calculation in Order Summary

**Steps**:
1. Add multiple items to cart
2. Navigate to /checkout
3. Verify subtotal in Order Summary

**Expected Result**:
- "Subtotal" label visible
- Amount in INR format (₹X,XXX)
- Sum of all item prices

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Subtotal: _______________

---

### TC-034: Shipping Line Display

**Description**: Verify shipping line in Order Summary

**Steps**:
1. Navigate to /checkout
2. Check shipping line in Order Summary

**Expected Result**:
- "Shipping" label visible
- Shows "FREE" (green) or ₹99 based on threshold
- Updates when delivery method changes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping displayed: _______________

---

### TC-035: Total Display

**Description**: Verify total calculation in Order Summary

**Steps**:
1. Add items to cart
2. Navigate to /checkout
3. Check total in Order Summary

**Expected Result**:
- "Total" label prominently displayed
- Amount = Subtotal + Shipping
- Larger/bolder font than other values
- INR format (₹X,XXX)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total: _______________

---

### TC-036: Show/Hide Items Toggle

**Description**: Verify items can be shown/hidden in Order Summary

**Steps**:
1. Navigate to /checkout
2. Click "Show items" toggle
3. Click "Hide items" toggle

**Expected Result**:
- Toggle shows "Show items" or "Hide items" text
- Clicking reveals/hides item list
- Items show thumbnail, title, size, quantity, price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Trust Badges

### TC-037: Secure Checkout Notice

**Description**: Verify secure checkout trust indicators

**Steps**:
1. Navigate to /checkout with items
2. Look for security notices

**Expected Result**:
- "Secure Checkout" label visible
- Encryption/security message visible
- Lock/shield icon present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Trust Badges Display

**Description**: Verify all trust badges are displayed

**Steps**:
1. Navigate to /checkout
2. Scroll to view trust badges section

**Expected Result**:
- Free shipping badge (orders over ₹999)
- Secure checkout badge (encrypted payment)
- 30-day returns badge (hassle-free)
- Appropriate icons for each

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badges displayed: _______________

---

## Responsive Design

### TC-039: Mobile Layout

**Description**: Verify checkout displays correctly on mobile

**Steps**:
1. Set viewport to mobile (375x667)
2. Navigate to /checkout with items
3. Test all steps

**Expected Result**:
- Single column layout
- Form fields full width
- Order Summary below form (or collapsible)
- All buttons full width
- Touch-friendly targets
- Step labels may be hidden (icons only)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-040: Tablet Layout

**Description**: Verify checkout displays correctly on tablet

**Steps**:
1. Set viewport to tablet (768x1024)
2. Navigate to /checkout
3. Test all functionality

**Expected Result**:
- Appropriate responsive layout
- All form fields accessible
- Progress steps visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-041: Desktop Layout

**Description**: Verify checkout displays correctly on desktop

**Steps**:
1. Set viewport to desktop (1280x800 or 1920x1080)
2. Navigate to /checkout
3. Observe layout

**Expected Result**:
- Two/three column grid layout (lg:grid-cols-3)
- Form on left (2 columns)
- Order Summary on right (1 column)
- Order Summary sticky when scrolling
- Proper spacing and gaps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility

### TC-042: Heading Hierarchy

**Description**: Verify proper heading structure

**Steps**:
1. Navigate to /checkout
2. Inspect heading levels (h1, h2, h3)

**Expected Result**:
- One h1 for page title ("Checkout")
- h2 for section headings (Shipping Address, Delivery Options, etc.)
- Logical heading hierarchy (no skipped levels)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- h1 count: ___, h2 count: ___

---

### TC-043: Form Labels

**Description**: Verify all form inputs have associated labels

**Steps**:
1. Navigate to /checkout
2. Check each form field for label association

**Expected Result**:
- All inputs have visible labels
- Labels use `for` attribute matching input `id`
- Required fields indicated with asterisk (*)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fields with labels: _______________

---

### TC-044: Keyboard Navigation

**Description**: Verify form is keyboard accessible

**Steps**:
1. Navigate to /checkout
2. Use Tab key to move through form
3. Use Enter to submit/activate buttons

**Expected Result**:
- All form fields focusable
- Tab order follows visual order
- Focus indicators visible
- Buttons activatable with Enter/Space

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-045: Validation Error Accessibility

**Description**: Verify validation errors are accessible

**Steps**:
1. Submit form with empty required fields
2. Check error message presentation

**Expected Result**:
- Error messages visible near fields
- Errors associated with fields (aria-describedby)
- Error styling (red text, border)
- Screen reader can announce errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-046: Page Load Time

**Description**: Verify checkout page loads quickly

**Steps**:
1. Add items to cart
2. Navigate to /checkout
3. Measure time until content visible

**Expected Result**:
- Page loads in under 5 seconds
- No blocking resources
- Form interactive quickly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load time: _______________

---

### TC-047: No JavaScript Errors

**Description**: Verify no console errors during checkout flow

**Steps**:
1. Open browser dev tools console
2. Complete full checkout flow
3. Monitor for errors

**Expected Result**:
- No JavaScript errors in console
- No React/framework errors
- Network errors handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors found: _______________

---

## Error Handling

### TC-048: Corrupted localStorage

**Description**: Verify handling of corrupted cart data

**Steps**:
1. Set corrupted data in localStorage
2. Navigate to /checkout
3. Observe behavior

**Expected Result**:
- Page loads without crashing
- May show empty cart state
- Graceful error handling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-049: Empty localStorage

**Description**: Verify handling of empty cart

**Steps**:
1. Clear localStorage completely
2. Navigate to /checkout

**Expected Result**:
- Empty cart state displayed
- No JavaScript errors
- Browse Posters CTA available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Multi-Item Cart

### TC-050: Multiple Items Display

**Description**: Verify checkout with multiple cart items

**Steps**:
1. Add 3+ different items to cart
2. Navigate to /checkout
3. Check Order Summary

**Expected Result**:
- Correct item count displayed
- All items visible in expanded summary
- Correct subtotal calculation
- Each item shows title, size, quantity, price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item count: ___, Subtotal: ___

---

### TC-051: Item with Frame

**Description**: Verify checkout displays framed items correctly

**Steps**:
1. Add item with frame selection
2. Navigate to /checkout
3. Check item in Order Summary

**Expected Result**:
- Frame name displayed with item
- Frame price included in item total
- Correct total calculation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Frame displayed: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 51
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Checkout Implementation: TanStack Start + Zustand

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Add address autocomplete
   - Save addresses for returning customers
   - Show real-time delivery date estimates

2. **Features**:
   - Add promo code field in checkout
   - Add gift wrap option
   - Support multiple shipping addresses

3. **Performance**:
   - Consider lazy loading Order Summary images
   - Optimize form validation performance

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
