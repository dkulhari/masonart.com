# Manual Test: Order Confirmation Page

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/checkout/success

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Successfully completed order (or test order number)
- [ ] Email service configured for confirmation emails (optional)

## Overview
This document covers manual testing of the chobii.art order confirmation page, including:
- Success header with order number
- Copy order number functionality
- Order items display
- Shipping details section
- Payment summary section
- What's Next steps
- Action buttons (Continue Shopping, View Orders)
- Generic success state (no order number)
- Loading and error states
- Responsive design
- Accessibility
- SEO meta tags

## Test Cases

---

## Success Header

### TC-001: Success Icon Display

**Description**: Verify success check icon displays

**Steps**:
1. Complete a successful payment
2. Navigate to /checkout/success?orderNumber=ORD-XXXX
3. Observe header section

**Expected Result**:
- Green success icon visible (checkmark in circle)
- Icon has animation (zoom-in effect)
- Green background (bg-green-100)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Order Confirmed Title

**Description**: Verify "Order Confirmed" title displays

**Steps**:
1. Navigate to order confirmation page
2. Observe page title

**Expected Result**:
- "Order Confirmed" heading (h1) visible
- Large, prominent text
- Fade-in animation (if implemented)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title text: _______________

---

### TC-003: Thank You Message

**Description**: Verify thank you message displays

**Steps**:
1. Navigate to order confirmation page
2. Observe message below title

**Expected Result**:
- "Thank you for your purchase!" message visible
- Friendly, appreciative tone
- Muted text color for secondary emphasis

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Message: _______________

---

### TC-004: Order Number Display

**Description**: Verify order number is displayed

**Steps**:
1. Navigate to /checkout/success?orderNumber=ORD-20260119-001
2. Look for order number section

**Expected Result**:
- "Order Number" label visible
- Order number displayed (e.g., ORD-20260119-001)
- Receipt icon next to order number
- Prominent display (brand color)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order number: _______________

---

### TC-005: Email Confirmation Notice

**Description**: Verify email confirmation message

**Steps**:
1. Navigate to order confirmation page
2. Look for email notice

**Expected Result**:
- "Confirmation email sent to" message visible
- User's email address displayed
- Mail icon present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email shown: _______________

---

## Copy Order Number

### TC-006: Copy Button Display

**Description**: Verify copy button is available

**Steps**:
1. Navigate to order confirmation page
2. Look for copy button near order number

**Expected Result**:
- Copy button/icon visible
- Tooltip or title "Copy order number"
- Clickable appearance

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Copy Functionality

**Description**: Verify copy to clipboard works

**Steps**:
1. Navigate to order confirmation page
2. Click copy button
3. Paste in text editor

**Expected Result**:
- Order number copied to clipboard
- Paste shows correct order number
- No extra formatting or spaces

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Copied value: _______________

---

### TC-008: Copy Success Feedback

**Description**: Verify visual feedback after copying

**Steps**:
1. Click copy button
2. Observe button change

**Expected Result**:
- Icon changes to checkmark
- Button title changes to "Copied!"
- Green/success styling
- Reverts after a few seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Feedback shown: _______________

---

## Order Items Section

### TC-009: Order Items Header

**Description**: Verify Order Items section header

**Steps**:
1. Navigate to order confirmation with items
2. Locate Order Items section

**Expected Result**:
- "Order Items" heading (h2) visible
- Item count in header (e.g., "Order Items (3)")
- Package icon displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item count: _______________

---

### TC-010: Item Details Display

**Description**: Verify individual item details

**Steps**:
1. Navigate to order confirmation
2. Examine each item in the list

**Expected Result**:
- Product thumbnail or placeholder image
- Product title
- Size (e.g., "24x32 inches")
- Frame name (if applicable)
- Quantity (e.g., "Qty: 2")
- Item price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Details visible: _______________

---

### TC-011: Multiple Items Display

**Description**: Verify multiple items are displayed

**Steps**:
1. Complete order with 3+ items
2. Navigate to order confirmation
3. Check all items listed

**Expected Result**:
- All ordered items displayed
- Each item has complete details
- Items separated clearly
- Correct item count in header

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Items count: _______________

---

### TC-012: Item with Frame Display

**Description**: Verify framed item shows frame details

**Steps**:
1. Order item with frame
2. Navigate to order confirmation
3. Check item display

**Expected Result**:
- Frame name displayed (e.g., "Black Wood Frame")
- Frame price included
- Visual indication of framed item

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Frame shown: _______________

---

### TC-013: Item Without Thumbnail

**Description**: Verify handling of items without images

**Steps**:
1. Order item that lacks thumbnail
2. Navigate to order confirmation
3. Check image area

**Expected Result**:
- Placeholder icon/image displayed
- No broken image
- Muted background styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Shipping Details Section

### TC-014: Shipping Details Header

**Description**: Verify Shipping Details section header

**Steps**:
1. Navigate to order confirmation
2. Locate Shipping Details section

**Expected Result**:
- "Shipping Details" heading (h2) visible
- Map pin icon displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Recipient Name

**Description**: Verify recipient name displays

**Steps**:
1. Navigate to order confirmation
2. Check shipping section

**Expected Result**:
- Full name displayed prominently
- First item in address block

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Name shown: _______________

---

### TC-016: Full Address Display

**Description**: Verify complete address displays

**Steps**:
1. Navigate to order confirmation
2. Check address details

**Expected Result**:
- Address Line 1 visible
- Address Line 2 (if entered)
- City, State - PIN Code format
- "Mumbai, Maharashtra - 400001"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Address: _______________

---

### TC-017: Phone Number Display

**Description**: Verify phone number displays

**Steps**:
1. Navigate to order confirmation
2. Check for phone number

**Expected Result**:
- Phone number visible
- Properly formatted
- Phone icon (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Phone: _______________

---

### TC-018: Delivery Method Display

**Description**: Verify delivery method in shipping section

**Steps**:
1. Navigate to order confirmation
2. Check delivery information

**Expected Result**:
- Delivery method label (Standard/Express)
- "Standard Delivery" or "Express Delivery"
- Truck icon present
- Estimated delivery timeframe

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delivery method: _______________

---

### TC-019: Estimated Delivery Date

**Description**: Verify estimated delivery displays

**Steps**:
1. Navigate to order confirmation
2. Check delivery estimate

**Expected Result**:
- Estimated delivery timeframe visible
- "5-7 business days" or "2-3 business days"
- Or specific date range

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Estimate: _______________

---

## Payment Summary Section

### TC-020: Payment Summary Header

**Description**: Verify Payment Summary section header

**Steps**:
1. Navigate to order confirmation
2. Locate Payment Summary section

**Expected Result**:
- "Payment Summary" heading (h2) visible
- Credit card icon displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Subtotal Display

**Description**: Verify subtotal is displayed

**Steps**:
1. Navigate to order confirmation
2. Check Payment Summary

**Expected Result**:
- "Subtotal" label visible
- Amount in INR (₹X,XXX)
- Sum of item prices

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Subtotal: _______________

---

### TC-022: Shipping Cost Display

**Description**: Verify shipping cost in payment summary

**Steps**:
1. Navigate to order confirmation
2. Check shipping line

**Expected Result**:
- "Shipping" label visible
- Shows "FREE" in green (if over threshold)
- Or shows ₹99 (if under threshold)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping cost: _______________

---

### TC-023: Discount Display (When Applicable)

**Description**: Verify discount shows when applied

**Steps**:
1. Complete order with discount/coupon
2. Navigate to order confirmation
3. Check for discount line

**Expected Result**:
- "Discount" label in green
- Negative amount (-₹XXX)
- Only visible when discount > 0

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Discount: _______________

---

### TC-024: No Discount When Zero

**Description**: Verify discount line hidden when zero

**Steps**:
1. Complete order without discount
2. Navigate to order confirmation
3. Check Payment Summary

**Expected Result**:
- No "Discount" line visible
- Clean summary without zero values

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Total Paid Display

**Description**: Verify total paid amount displays

**Steps**:
1. Navigate to order confirmation
2. Check Total Paid section

**Expected Result**:
- "Total Paid" label visible
- Amount prominent (larger font)
- Correct total = Subtotal - Discount + Shipping
- INR format (₹X,XXX)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Paid: _______________

---

### TC-026: Payment Complete Badge

**Description**: Verify payment complete indicator

**Steps**:
1. Navigate to order confirmation
2. Look for payment status badge

**Expected Result**:
- "Payment Complete" badge visible
- Green styling (bg-green-100)
- Checkmark icon
- Success indication

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge displayed: _______________

---

## What's Next Section

### TC-027: What Happens Next Header

**Description**: Verify What Happens Next section

**Steps**:
1. Navigate to order confirmation
2. Locate What Happens Next section

**Expected Result**:
- "What Happens Next" heading (h2) visible
- Section clearly separated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Four Steps Display

**Description**: Verify all four next steps are shown

**Steps**:
1. Navigate to order confirmation
2. Count steps in section

**Expected Result**:
- Step 1: Confirmation Email
- Step 2: Order Processing
- Step 3: Shipping Updates
- Step 4: Delivery
- Numbered 1-4 in brand color circles

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Steps count: _______________

---

### TC-029: Step Descriptions

**Description**: Verify each step has description

**Steps**:
1. Navigate to order confirmation
2. Read each step's description

**Expected Result**:
- Step 1: "order details and receipt"
- Step 2: "prepare your order"
- Step 3: "tracking information"
- Step 4: "arrive at your doorstep"
- Each step has heading and description

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Descriptions visible: _______________

---

### TC-030: Step Icons

**Description**: Verify each step has appropriate icon

**Steps**:
1. Navigate to order confirmation
2. Check icons for each step

**Expected Result**:
- Mail icon for Confirmation Email
- Package icon for Order Processing
- Truck icon for Shipping Updates
- Home icon for Delivery
- Icons in brand-colored circles

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Icons present: _______________

---

## Action Buttons

### TC-031: Continue Shopping Button

**Description**: Verify Continue Shopping button

**Steps**:
1. Navigate to order confirmation
2. Locate Continue Shopping button

**Expected Result**:
- "Continue Shopping" button visible
- Shopping bag icon present
- Primary button styling (brand color)
- Links to /posters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Continue Shopping Navigation

**Description**: Verify Continue Shopping navigates correctly

**Steps**:
1. Click "Continue Shopping" button
2. Observe navigation

**Expected Result**:
- Navigates to /posters
- Products page loads
- Can continue browsing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-033: View All Orders Button

**Description**: Verify View All Orders button

**Steps**:
1. Navigate to order confirmation
2. Locate View All Orders button

**Expected Result**:
- "View All Orders" button visible
- User icon present
- Secondary button styling (outline)
- Links to /account/orders

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: View Orders Navigation

**Description**: Verify View Orders navigates to account

**Steps**:
1. Click "View All Orders" button
2. Observe navigation

**Expected Result**:
- Navigates to /account/orders
- Order history page loads
- New order appears in list

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Generic Success State (No Order Number)

### TC-035: Generic Success Without Order Number

**Description**: Verify page works without order number

**Steps**:
1. Navigate to /checkout/success (no parameters)
2. Observe page content

**Expected Result**:
- Success icon displays
- "Order Confirmed" title
- "Thank you for your purchase" message
- Generic confirmation email mention
- Continue Shopping and View Orders buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Contact Us Link

**Description**: Verify Need Help contact link

**Steps**:
1. Navigate to /checkout/success
2. Look for help/contact section

**Expected Result**:
- "Need help?" text visible
- "Contact us" link present
- Links to /contact page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Link destination: _______________

---

## Loading State

### TC-037: Loading Spinner Display

**Description**: Verify loading state while fetching order

**Steps**:
1. Navigate to /checkout/success?orderNumber=XXX
2. Observe immediate display (before data loads)

**Expected Result**:
- Loading spinner visible
- "Loading your order details..." message
- Centered on page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Transition from Loading to Content

**Description**: Verify smooth transition to content

**Steps**:
1. Navigate to order confirmation
2. Watch for loading to content transition

**Expected Result**:
- Loading state shows briefly
- Smooth transition to order details
- No flash or jarring change
- All content appears together

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error State

### TC-039: Order Not Found Error

**Description**: Verify error when order doesn't exist

**Steps**:
1. Navigate to /checkout/success?orderNumber=INVALID-ORDER
2. Observe error display

**Expected Result**:
- Red error icon (AlertCircle)
- "Unable to Load Order" title
- Error message displayed
- "View All Orders" link available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error message: _______________

---

### TC-040: Error Recovery Options

**Description**: Verify user can recover from error

**Steps**:
1. Trigger order not found error
2. Click "View All Orders" link

**Expected Result**:
- Link navigates to /account/orders
- User can find their orders
- No dead end

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## SEO Meta Tags

### TC-041: Page Title

**Description**: Verify page title is set correctly

**Steps**:
1. Navigate to order confirmation
2. Check browser tab/document title

**Expected Result**:
- Title contains "Order Confirmed"
- Title contains "chobii.art"
- Format: "Order Confirmed | chobii.art"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-042: Noindex Robots Tag

**Description**: Verify page is not indexed

**Steps**:
1. Navigate to order confirmation
2. Check robots meta tag

**Expected Result**:
- `<meta name="robots" content="noindex">` present
- Order confirmation pages should not be indexed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Robots content: _______________

---

### TC-043: Description Meta Tag

**Description**: Verify meta description exists

**Steps**:
1. Navigate to order confirmation
2. Check meta description

**Expected Result**:
- Meta description tag present
- Describes order confirmation
- Not empty

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

## URL Parameters

### TC-044: orderNumber Parameter

**Description**: Verify orderNumber URL parameter works

**Steps**:
1. Navigate to /checkout/success?orderNumber=ORD-12345
2. Check if order loads

**Expected Result**:
- Order number parameter parsed
- API call made with order number
- Order details displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-045: orderId Parameter

**Description**: Verify orderId URL parameter works

**Steps**:
1. Navigate to /checkout/success?orderId=order_abc123
2. Check if order loads

**Expected Result**:
- Order ID parameter parsed
- API call made with order ID
- Order details displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design

### TC-046: Mobile Layout

**Description**: Verify mobile responsive design

**Steps**:
1. Set viewport to mobile (375x667)
2. Navigate to order confirmation
3. Scroll through all sections

**Expected Result**:
- Single column layout
- All sections stacked vertically
- Buttons full width (flex-col)
- Text readable, properly sized
- No horizontal scroll

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-047: Tablet Layout

**Description**: Verify tablet responsive design

**Steps**:
1. Set viewport to tablet (768x1024)
2. Navigate to order confirmation
3. Check layout

**Expected Result**:
- Appropriate responsive layout
- What's Next steps in 2-column grid
- All content accessible
- Proper spacing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-048: Desktop Layout

**Description**: Verify desktop layout

**Steps**:
1. Set viewport to desktop (1280x800)
2. Navigate to order confirmation
3. Check layout

**Expected Result**:
- Shipping and Payment in 2-column grid (lg:grid-cols-2)
- What's Next steps in grid
- Buttons side by side (flex-row)
- Proper max-width container

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility

### TC-049: Heading Hierarchy

**Description**: Verify proper heading structure

**Steps**:
1. Navigate to order confirmation
2. Check heading levels

**Expected Result**:
- One h1 ("Order Confirmed")
- Multiple h2 for sections
- h3 for subsections if needed
- No skipped heading levels

**Actual Result**:
- [ ] PASS / [ ] FAIL
- h1: ___, h2: ___, h3: ___

---

### TC-050: Button Accessibility

**Description**: Verify buttons are accessible

**Steps**:
1. Navigate to order confirmation
2. Check copy button accessibility
3. Check action buttons

**Expected Result**:
- Copy button has title attribute
- All buttons have descriptive text
- Focus indicators visible
- Keyboard accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-051: Keyboard Navigation

**Description**: Verify full keyboard navigation

**Steps**:
1. Navigate to order confirmation
2. Use Tab key through page
3. Check focus order

**Expected Result**:
- All interactive elements focusable
- Logical tab order
- Clear focus indicators
- Can activate buttons with Enter

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-052: Link Accessibility

**Description**: Verify links have descriptive text

**Steps**:
1. Navigate to order confirmation
2. Check all link texts

**Expected Result**:
- "Continue Shopping" descriptive
- "View All Orders" descriptive
- "Contact us" descriptive
- No generic "click here" links

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-053: Page Load Time

**Description**: Verify page loads quickly

**Steps**:
1. Navigate to order confirmation
2. Measure time to content visible

**Expected Result**:
- Page loads < 5 seconds
- Loading state shows < 1 second
- Content renders smoothly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load time: _______________

---

### TC-054: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open browser console
2. Navigate to order confirmation
3. Check for errors

**Expected Result**:
- No JavaScript errors
- No unhandled rejections
- Network errors handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors found: _______________

---

## Navigation

### TC-055: Browser Back Button

**Description**: Verify browser back works correctly

**Steps**:
1. Navigate: /posters → /checkout/success
2. Click browser back button
3. Observe navigation

**Expected Result**:
- Navigates back to previous page
- No errors
- History maintained correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-056: Direct URL Access

**Description**: Verify direct URL access works

**Steps**:
1. Enter URL directly: /checkout/success?orderNumber=XXX
2. Press Enter

**Expected Result**:
- Page loads (may require login)
- Order details shown if valid
- Error shown if invalid order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Edge Cases

### TC-057: Missing Email in Order

**Description**: Verify handling of missing email

**Steps**:
1. View order without userEmail
2. Check email confirmation section

**Expected Result**:
- No "Confirmation email sent to" section
- Or generic message
- Page doesn't break

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-058: Missing Shipping Address

**Description**: Verify handling of missing shipping

**Steps**:
1. View order without shipping address
2. Check Shipping Details section

**Expected Result**:
- Section hidden or shows placeholder
- No errors or broken layout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-059: Empty Items Array

**Description**: Verify handling of empty items

**Steps**:
1. View order with no items
2. Check Order Items section

**Expected Result**:
- Order Items section not displayed
- Or shows "No items" message
- Page doesn't break

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-060: Express Delivery Display

**Description**: Verify Express delivery shows correctly

**Steps**:
1. Complete order with Express delivery
2. View order confirmation

**Expected Result**:
- "Express Delivery" label shown
- "2-3 business days" estimate
- Different from standard display

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delivery displayed: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 60
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Order Confirmation Route: /checkout/success

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Add print receipt functionality
   - Add email forward/resend option
   - Show estimated delivery date prominently

2. **Features**:
   - Add social share buttons for new purchase
   - Add product review reminder scheduling
   - Add order tracking link integration

3. **Engagement**:
   - Add related products section
   - Add "Shop Similar" recommendations
   - Add newsletter signup if not already subscribed

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
