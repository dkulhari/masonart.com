# Manual Test: Order Tracking

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-30
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/track

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database migrations applied (`bun run db:migrate` — not `db:push`, which skips the audit-log trigger, #663)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Test orders exist in database with known order numbers
- [ ] Test order has email: test@example.com
- [ ] Test order has phone: 9876543210
- [ ] At least one order has tracking information

## Overview
This document covers manual testing of the chobii.art guest order tracking feature:
- Public tracking page access
- Guest order lookup via email
- Guest order lookup via phone
- Token-based tracking links
- Tracking timeline display
- Carrier information display
- Error handling
- Mobile responsiveness

## Test Cases

---

## Page Navigation Tests

### TC-001: Direct URL Access

**Description**: Verify tracking page loads correctly

**Steps**:
1. Navigate to http://localhost:3001/track

**Expected Result**:
- Page loads without errors
- "Track Your Order" heading visible
- Lookup form displayed
- Order number input visible
- Email/Phone toggle visible
- "Track Order" button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: HTML Title and Meta Tags

**Description**: Verify correct page title and meta tags

**Steps**:
1. Navigate to /track
2. Inspect page source or DevTools

**Expected Result**:
- Title contains "Track" and "chobii.art"
- Meta description references order tracking
- Page is indexable (public page)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-003: Footer Link Navigation

**Description**: Verify tracking link from footer

**Steps**:
1. Navigate to homepage
2. Scroll to footer
3. Find "Track Order" or similar link
4. Click the link

**Expected Result**:
- Link visible in footer
- Navigates to /track
- Tracking page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Form Display Tests

### TC-004: Email Tab Default State

**Description**: Verify Email tab is selected by default

**Steps**:
1. Navigate to /track
2. Observe form state

**Expected Result**:
- Email tab highlighted/selected
- Email input field visible
- Phone input NOT visible
- "Email" tab styled as active

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Phone Tab Switch

**Description**: Verify switching to Phone tab

**Steps**:
1. Navigate to /track
2. Click "Phone" tab

**Expected Result**:
- Phone tab becomes highlighted
- Phone input field appears
- Email input field hides
- Tab switch is smooth

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-006: Tab Value Preservation

**Description**: Verify input values preserved when switching tabs

**Steps**:
1. Enter order number "CA-2026-000123"
2. Enter email "test@example.com"
3. Switch to Phone tab
4. Enter phone "9876543210"
5. Switch back to Email tab

**Expected Result**:
- Order number still shows "CA-2026-000123"
- Email still shows "test@example.com"
- Phone value preserved when switching back

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Form Validation Tests

### TC-007: Empty Order Number Validation

**Description**: Verify validation for empty order number

**Steps**:
1. Leave order number empty
2. Enter valid email
3. Click "Track Order"

**Expected Result**:
- Form does not submit
- Error message: "Please enter your order number" or similar
- Error styling visible
- Order number input highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-008: Empty Email Validation

**Description**: Verify validation for empty email

**Steps**:
1. Enter valid order number
2. Leave email empty (Email tab selected)
3. Click "Track Order"

**Expected Result**:
- Form does not submit
- Error message: "Please enter your email address" or similar
- Email input highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-009: Empty Phone Validation

**Description**: Verify validation for empty phone

**Steps**:
1. Enter valid order number
2. Switch to Phone tab
3. Leave phone empty
4. Click "Track Order"

**Expected Result**:
- Form does not submit
- Error message: "Please enter your phone number" or similar
- Phone input highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-010: Invalid Email Format

**Description**: Verify validation for invalid email format

**Steps**:
1. Enter valid order number
2. Enter "invalid-email" (no @ symbol)
3. Click "Track Order"

**Expected Result**:
- Form does not submit OR
- Validation error shown
- Browser native validation may trigger

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Email Lookup Tests

### TC-011: Successful Order Lookup with Email

**Description**: Verify successful lookup with valid order and email

**Steps**:
1. Enter valid order number (e.g., from test data)
2. Enter matching email address
3. Click "Track Order"

**Expected Result**:
- Loading spinner appears
- Button text changes to "Looking up order..."
- Order details appear after loading
- Order number displayed
- Status badge visible
- Timeline visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order Status: _______________

---

### TC-012: Case Insensitive Email

**Description**: Verify email lookup is case insensitive

**Steps**:
1. Enter valid order number
2. Enter email in UPPERCASE (e.g., "TEST@EXAMPLE.COM")
3. Click "Track Order"

**Expected Result**:
- Order found successfully
- Email comparison is case insensitive

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Email Mismatch Security

**Description**: Verify wrong email returns generic error (no info leak)

**Steps**:
1. Enter valid order number
2. Enter wrong email (not associated with order)
3. Click "Track Order"

**Expected Result**:
- Error message displayed
- Message does NOT reveal if order exists
- Generic "Order not found" type message
- Form remains visible for retry

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

## Phone Lookup Tests

### TC-014: Successful Order Lookup with Phone

**Description**: Verify successful lookup with valid order and phone

**Steps**:
1. Enter valid order number
2. Switch to Phone tab
3. Enter matching phone number
4. Click "Track Order"

**Expected Result**:
- Loading state shown
- Order details appear
- Order information displayed correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Phone Format Variations

**Description**: Verify various phone formats accepted

**Steps**:
1. Test phone as "9876543210"
2. Test phone as "+919876543210"
3. Test phone as "91 98765 43210"

**Expected Result**:
- All formats should resolve to same number
- Lookup succeeds for matching orders
- System normalizes phone number

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Formats Tested: _______________

---

### TC-016: Phone Mismatch Security

**Description**: Verify wrong phone returns generic error

**Steps**:
1. Enter valid order number
2. Enter wrong phone number
3. Click "Track Order"

**Expected Result**:
- Generic error message
- No information about whether order exists
- Same error as "order not found"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error Handling Tests

### TC-017: Order Not Found

**Description**: Verify handling of non-existent order

**Steps**:
1. Enter non-existent order number (e.g., "CA-9999-999999")
2. Enter any email
3. Click "Track Order"

**Expected Result**:
- Error alert displayed
- Message indicates order not found
- Error has role="alert" for accessibility
- Form remains visible for retry

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-018: Network Error Handling

**Description**: Verify handling of network errors

**Steps**:
1. Disable network (DevTools > Network > Offline)
2. Enter valid order details
3. Click "Track Order"

**Expected Result**:
- User-friendly error message
- No technical error details exposed
- Retry possible after reconnecting

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-019: Server Error Handling

**Description**: Verify handling of server errors

**Steps**:
1. Simulate server error (block API endpoint with 500 response)
2. Submit tracking form

**Expected Result**:
- Error alert displayed
- User-friendly message
- No stack trace or technical details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Loading State Tests

### TC-020: Button Loading State

**Description**: Verify button shows loading state

**Steps**:
1. Enter valid order details
2. Click "Track Order"
3. Observe button during API call

**Expected Result**:
- Spinner visible in button
- Button text changes to "Looking up order..."
- Button disabled during loading
- No double-submission possible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Input Disabled During Loading

**Description**: Verify inputs disabled during lookup

**Steps**:
1. Submit tracking form
2. Try to edit inputs during loading

**Expected Result**:
- Order number input disabled
- Email/Phone input disabled
- Tab buttons disabled
- User cannot modify during request

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Tracking Results Display Tests

### TC-022: Order Number Display

**Description**: Verify order number shown in results

**Steps**:
1. Successfully look up an order
2. Check results display

**Expected Result**:
- Order number prominently displayed
- Matches submitted order number
- Proper formatting

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order Number: _______________

---

### TC-023: Status Badge Display

**Description**: Verify order status badge

**Steps**:
1. Look up orders with different statuses
2. Observe status badges

**Expected Result**:
- Status badge visible
- Appropriate color for status:
  - Confirmed: Blue
  - Shipped: Blue/Purple
  - Out for Delivery: Blue
  - Delivered: Green
- Status text readable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Statuses Tested: _______________

---

### TC-024: Timeline Display

**Description**: Verify tracking timeline

**Steps**:
1. Look up a shipped order
2. Examine timeline

**Expected Result**:
- Timeline shows order progress
- Completed steps have checkmarks/filled icons
- Current step highlighted
- Pending steps shown as empty/gray
- Timestamps visible for completed steps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Carrier Information Display

**Description**: Verify shipping carrier details

**Steps**:
1. Look up order with tracking info
2. Check carrier section

**Expected Result**:
- Carrier name displayed (e.g., "Blue Dart", "FedEx")
- Tracking number visible
- Tracking number in monospace font
- External tracking link available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Carrier: _______________
- Tracking #: _______________

---

### TC-026: External Tracking Link

**Description**: Verify carrier tracking link works

**Steps**:
1. Look up order with tracking
2. Click "Track with Carrier" or similar link

**Expected Result**:
- Link opens in new tab
- Navigates to carrier tracking page
- Link has target="_blank"
- Link has rel="noopener noreferrer"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- URL Opened: _______________

---

### TC-027: Estimated Delivery Display

**Description**: Verify estimated delivery date

**Steps**:
1. Look up shipped order with ETA
2. Check delivery estimate

**Expected Result**:
- Estimated delivery date visible
- Readable date format (e.g., "Feb 15, 2024")
- May show day of week

**Actual Result**:
- [ ] PASS / [ ] FAIL
- ETA Displayed: _______________

---

### TC-028: Shipping Address Display

**Description**: Verify delivery address shown (partial)

**Steps**:
1. Look up an order
2. Check address display

**Expected Result**:
- City visible
- State visible
- Postal code visible
- Full street address NOT shown (privacy)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Address Shown: _______________

---

## Token-Based Tracking Tests

### TC-029: Valid Token Direct Access

**Description**: Verify direct access via token URL

**Steps**:
1. Navigate to /track/{valid-token} (32+ character token)
2. Observe page load

**Expected Result**:
- Order details load automatically
- No form shown (or form hidden)
- Order information displayed
- No manual input required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: Invalid Token Error

**Description**: Verify invalid token handling

**Steps**:
1. Navigate to /track/invalid-short-token

**Expected Result**:
- Error message displayed
- "Invalid tracking link" or similar message
- Link to manual lookup offered
- No sensitive information revealed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-031: Expired Token Error

**Description**: Verify expired token handling

**Steps**:
1. Navigate to /track/{expired-token}

**Expected Result**:
- Error message about expiration
- "Link has expired" or similar
- Option to use manual lookup
- Clear recovery path

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

## New Search Tests

### TC-032: Track Another Order

**Description**: Verify ability to search again after results

**Steps**:
1. Complete successful order lookup
2. Find "Track Another Order" or reset button
3. Click the button

**Expected Result**:
- Results cleared
- Form reappears
- Inputs empty
- Ready for new search

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design Tests

### TC-033: Mobile Layout (375px)

**Description**: Verify tracking page on mobile

**Steps**:
1. Set viewport to 375x667
2. Navigate to /track
3. Complete a lookup

**Expected Result**:
- Form fills width
- No horizontal scroll
- Tab buttons accessible
- Touch targets 44px+
- Results readable
- Timeline stacks vertically

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Tablet Layout (768px)

**Description**: Verify tracking page on tablet

**Steps**:
1. Set viewport to 768x1024
2. Test tracking flow

**Expected Result**:
- Layout adapts appropriately
- All elements accessible
- Proper spacing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-035: Desktop Layout (1280px)

**Description**: Verify tracking page on desktop

**Steps**:
1. Set viewport to 1280x800
2. Test tracking flow

**Expected Result**:
- Centered content
- Max-width applied
- Results well-formatted
- Timeline horizontal or clear hierarchy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility Tests

### TC-036: Form Labels

**Description**: Verify form inputs have accessible labels

**Steps**:
1. Inspect form elements
2. Check label associations

**Expected Result**:
- Order number has label
- Email has label
- Phone has label
- Labels linked via htmlFor/id

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Error Announcements

**Description**: Verify errors announced to screen readers

**Steps**:
1. Trigger validation error
2. Check error element

**Expected Result**:
- Error has role="alert"
- Error text descriptive
- Focus may move to error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Keyboard Navigation

**Description**: Verify full keyboard accessibility

**Steps**:
1. Tab through entire form
2. Activate with Enter/Space
3. Tab through results

**Expected Result**:
- All interactive elements focusable
- Visible focus indicators
- Logical tab order
- Enter submits form
- Tab buttons keyboard accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Focus Management

**Description**: Verify focus moves appropriately

**Steps**:
1. Submit form with error
2. Submit successful lookup

**Expected Result**:
- On error: focus moves to error or invalid field
- On success: focus moves to results
- No focus trap

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance Tests

### TC-040: Page Load Time

**Description**: Verify acceptable page load

**Steps**:
1. Clear cache
2. Navigate to /track
3. Measure time to interactive

**Expected Result**:
- Form visible within 3 seconds
- No layout shifts after load
- Acceptable on slow 3G

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-041: API Response Time

**Description**: Verify acceptable lookup speed

**Steps**:
1. Submit tracking request
2. Measure time to results

**Expected Result**:
- Results appear within 2 seconds
- Loading state shown immediately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-042: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open DevTools Console
2. Complete tracking flow
3. Check for errors

**Expected Result**:
- No JavaScript errors
- No React warnings
- Clean console

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 42
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Screen Resolution: _______________
- Test Order Numbers Used: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Performance**:
   - Consider caching recent lookups
   - Lazy load carrier images/logos

2. **UX Improvements**:
   - Add email tracking link copy button
   - Show order item preview
   - Add estimated delivery countdown

3. **Accessibility**:
   - Ensure timeline is screen reader friendly
   - Add skip link to results
   - Test with VoiceOver/NVDA

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
