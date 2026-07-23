# Manual Test: Payment Processing Flow

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/checkout (Payment step)
- **Payment Gateway**: Razorpay (Test Mode)

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Razorpay test keys configured (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
- [ ] Items in cart, shipping/delivery steps completed
- [ ] User logged in for authenticated checkout

## Overview
This document covers manual testing of the chobi.art payment processing flow, including:
- Payment button states and interactions
- Razorpay checkout modal integration
- Payment success flow
- Payment failure handling
- Payment cancellation
- Payment verification
- Error states and recovery
- Responsive design
- Accessibility

## Test Cases

---

## Payment Button

### TC-001: Payment Button Display

**Description**: Verify payment button is visible and styled correctly

**Steps**:
1. Complete shipping and delivery steps
2. Navigate to Payment step
3. Observe Pay button

**Expected Result**:
- "Pay ₹X,XXX" button visible
- Button shows formatted price with rupee symbol
- Credit card icon on button
- Brand color styling (brand-500)
- Full width button

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button text: _______________

---

### TC-002: Payment Amount Display

**Description**: Verify payment amount matches order total

**Steps**:
1. Add item(s) to cart
2. Complete checkout steps
3. Compare Pay button amount to Order Summary total

**Expected Result**:
- Pay button amount matches Total Amount in summary
- Correct INR format (₹X,XXX)
- Includes shipping if applicable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pay button: ___, Order total: ___

---

### TC-003: Security Notice Display

**Description**: Verify security indicators are visible

**Steps**:
1. Navigate to Payment step
2. Look for security messages

**Expected Result**:
- "Secured by Razorpay" notice visible
- Encryption message visible
- Lock/shield icon present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Accepted Payment Methods

**Description**: Verify payment method badges are displayed

**Steps**:
1. Navigate to Payment step
2. Look for payment method indicators

**Expected Result**:
- UPI badge/label visible
- Cards badge/label visible
- Net Banking badge/label visible
- Wallets badge/label visible
- Razorpay logo/branding

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Methods displayed: _______________

---

## Payment Initiation

### TC-005: Loading State on Click

**Description**: Verify loading state when payment button clicked

**Steps**:
1. Navigate to Payment step
2. Click Pay button
3. Observe button state immediately

**Expected Result**:
- Button shows loading text ("Creating Order..." or "Processing...")
- Spinner/loading indicator visible
- Button becomes disabled
- Prevents double-clicking

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading text: _______________

---

### TC-006: Razorpay Modal Opens

**Description**: Verify Razorpay checkout modal appears

**Steps**:
1. Click Pay button
2. Wait for order creation
3. Observe Razorpay modal

**Expected Result**:
- Razorpay checkout modal opens
- Shows correct payment amount
- Prefilled customer name and email
- Multiple payment options visible (UPI, Card, Net Banking, Wallet)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Modal displayed: _______________

---

### TC-007: Order Creation Before Payment

**Description**: Verify order is created before Razorpay modal

**Steps**:
1. Open browser Network tab
2. Click Pay button
3. Monitor API calls

**Expected Result**:
- POST to /api/orders creates order
- Order ID/number returned
- Payment initiation call made
- Razorpay order ID received

**Actual Result**:
- [ ] PASS / [ ] FAIL
- API calls observed: _______________

---

## Payment Success Flow

### TC-008: Card Payment Success (Test Mode)

**Description**: Verify successful card payment flow

**Steps**:
1. Click Pay button
2. In Razorpay modal, select "Card"
3. Enter test card: 4111 1111 1111 1111
4. Enter any future expiry and CVV
5. Complete payment

**Expected Result**:
- Payment processes successfully
- "Payment Successful" message displayed
- Success icon/animation shown
- Button turns green/success state
- Redirects to order confirmation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: UPI Payment Success (Test Mode)

**Description**: Verify successful UPI payment flow

**Steps**:
1. Click Pay button
2. In Razorpay modal, select "UPI"
3. Enter test UPI ID: success@razorpay
4. Complete payment

**Expected Result**:
- Payment processes successfully
- Success message displayed
- Redirects to order confirmation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: Net Banking Payment Success (Test Mode)

**Description**: Verify successful net banking payment flow

**Steps**:
1. Click Pay button
2. In Razorpay modal, select "Net Banking"
3. Select any test bank
4. Complete test payment flow

**Expected Result**:
- Bank page simulation appears
- Success option available
- Payment completes successfully
- Redirects to order confirmation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-011: Cart Cleared After Success

**Description**: Verify cart is emptied after successful payment

**Steps**:
1. Complete successful payment
2. Navigate to /cart
3. Check cart contents

**Expected Result**:
- Cart is empty after payment
- Cart count in header shows 0
- localStorage cart data cleared

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart status: _______________

---

### TC-012: Redirect to Order Confirmation

**Description**: Verify redirect after successful payment

**Steps**:
1. Complete successful payment
2. Wait for redirect

**Expected Result**:
- Automatic redirect to /checkout/success
- Order number in URL parameter
- Order confirmation page displays

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect URL: _______________

---

## Payment Failure Handling

### TC-013: Order Creation Failure

**Description**: Verify handling when order creation fails

**Steps**:
1. (Simulate API error or use test scenario)
2. Click Pay button
3. Observe error handling

**Expected Result**:
- Error message displayed in red/error styling
- "Failed to create order" or similar message
- Button returns to enabled state
- User can retry

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error message: _______________

---

### TC-014: Payment Initiation Failure

**Description**: Verify handling when payment initiation fails

**Steps**:
1. (Simulate payment API error)
2. Click Pay button
3. Observe after order created but payment fails

**Expected Result**:
- Error message displayed
- "Failed to initiate payment" or similar
- Button returns to enabled state
- User can retry

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error message: _______________

---

### TC-015: Payment Declined (Card)

**Description**: Verify handling when card payment is declined

**Steps**:
1. Click Pay button
2. In Razorpay modal, enter test decline card
3. Use card: 4000 0000 0000 0002 (or Razorpay's decline test card)
4. Attempt payment

**Expected Result**:
- "Payment failed" message displayed
- Error state styling (red background)
- "Try Again" button appears
- User can retry payment

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error message: _______________

---

### TC-016: Payment Verification Failure

**Description**: Verify handling when payment verification fails

**Steps**:
1. Complete payment but verification fails
2. Observe error handling

**Expected Result**:
- Error message about verification failure
- Red/error styling displayed
- Instructions to contact support
- Order number preserved for reference

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error message: _______________

---

### TC-017: Try Again Button

**Description**: Verify retry functionality after failure

**Steps**:
1. Trigger payment failure
2. Click "Try Again" button
3. Attempt payment again

**Expected Result**:
- "Try Again" button visible after failure
- Click initiates new payment attempt
- Loading state shows again
- Can complete successful payment

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Payment Cancellation

### TC-018: Cancel via Modal Close

**Description**: Verify handling when user closes Razorpay modal

**Steps**:
1. Click Pay button
2. Razorpay modal opens
3. Click X or outside modal to close

**Expected Result**:
- "Payment was cancelled" message displayed
- Neutral/warning styling (not error)
- Button returns to normal state
- Can retry payment

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Message displayed: _______________

---

### TC-019: Cancel via Back Button

**Description**: Verify handling when user clicks back during payment

**Steps**:
1. Click Pay button
2. During payment processing, try browser back
3. Observe behavior

**Expected Result**:
- Warning about leaving page (if implemented)
- Or cancellation handled gracefully
- Cart data preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Return to Idle State After Cancel

**Description**: Verify button state after cancellation

**Steps**:
1. Trigger payment cancellation
2. Observe Pay button state

**Expected Result**:
- Button returns to normal "Pay ₹X,XXX" text
- Button enabled (not disabled)
- No spinner showing
- Ready for new attempt

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button state: _______________

---

## Order Summary in Payment Step

### TC-021: Order Summary Visibility

**Description**: Verify order summary in payment step

**Steps**:
1. Navigate to Payment step
2. Observe Order Summary section

**Expected Result**:
- "Order Summary" heading visible
- Shipping address displayed ("Shipping to:")
- Delivery method displayed ("Delivery:")
- Total Amount prominently shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-022: Shipping Address in Summary

**Description**: Verify shipping address displays correctly

**Steps**:
1. Navigate to Payment step
2. Check shipping address section

**Expected Result**:
- "Shipping to:" label
- Full name displayed
- Full address displayed
- City, State, PIN visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Address displayed: _______________

---

### TC-023: Delivery Method in Summary

**Description**: Verify delivery method displays correctly

**Steps**:
1. Navigate to Payment step
2. Check delivery method section

**Expected Result**:
- "Delivery:" label
- Selected method (Standard/Express)
- Estimated delivery time

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delivery shown: _______________

---

### TC-024: Total Amount Display

**Description**: Verify total amount is prominently displayed

**Steps**:
1. Navigate to Payment step
2. Check Total Amount display

**Expected Result**:
- "Total Amount" label
- Large/bold price display
- Correct INR format
- Matches Order Summary total

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Amount: _______________

---

## Navigation

### TC-025: Back Button to Delivery

**Description**: Verify Back button returns to Delivery step

**Steps**:
1. Navigate to Payment step
2. Click "Back" button

**Expected Result**:
- "Back" button visible
- Click returns to Delivery step
- Delivery selection preserved
- Can return to Payment

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-026: Progress Indicator in Payment

**Description**: Verify progress indicator shows Payment as active

**Steps**:
1. Navigate to Payment step
2. Check progress indicator

**Expected Result**:
- Payment step highlighted as current
- Shipping step shows completed (green checkmark)
- Delivery step shows completed (green checkmark)
- Green connector lines for completed steps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Navigate Back After Error

**Description**: Verify can navigate back after payment error

**Steps**:
1. Trigger payment error
2. Click Back button
3. Return to Delivery step

**Expected Result**:
- Can navigate back despite error
- Delivery step accessible
- All previous data preserved
- Can return to Payment and retry

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Form Data Preserved After Error

**Description**: Verify form data preserved after payment error

**Steps**:
1. Complete shipping form
2. Navigate to Payment
3. Trigger error
4. Navigate back to Shipping

**Expected Result**:
- All shipping form fields preserved
- Name, email, phone, address filled
- No need to re-enter data

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fields preserved: _______________

---

## Multiple Items

### TC-029: Payment for Multiple Items

**Description**: Verify payment with multiple cart items

**Steps**:
1. Add 3+ items to cart
2. Complete checkout to Payment step
3. Verify total and complete payment

**Expected Result**:
- Pay button shows correct total
- All items in order
- Successful payment for full amount
- Order confirmation shows all items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item count: ___, Total: ___

---

### TC-030: Correct Total for Multiple Items

**Description**: Verify total calculation with multiple items

**Steps**:
1. Add items: Poster 1 (₹1,500), Poster 2 (₹2,000)
2. Navigate to Payment step
3. Calculate expected total

**Expected Result**:
- Subtotal: ₹3,500
- Shipping: FREE (or ₹99 if under threshold)
- Total matches calculation
- Pay button shows correct amount

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Calculation: _______________

---

## High Value Orders

### TC-031: High Value Order Payment

**Description**: Verify payment for high-value orders

**Steps**:
1. Add expensive item(s) (₹5,000+)
2. Complete checkout to Payment step
3. Complete payment

**Expected Result**:
- Correct high amount displayed
- Payment processes successfully
- No issues with large amounts
- Proper formatting (₹5,000+ with commas)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order total: _______________

---

## Razorpay Script Loading

### TC-032: Razorpay Script Loads

**Description**: Verify Razorpay script loads successfully

**Steps**:
1. Navigate to Payment step
2. Check Network tab for Razorpay script
3. Click Pay button

**Expected Result**:
- Razorpay checkout.js script loads
- No script errors in console
- Modal opens when Pay clicked

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Script loaded: _______________

---

### TC-033: Razorpay Script Load Failure

**Description**: Verify handling when Razorpay fails to load

**Steps**:
1. Block Razorpay script (via browser tools)
2. Navigate to Payment step
3. Click Pay button

**Expected Result**:
- Error message displayed
- "Payment service unavailable" or similar
- Graceful degradation
- Suggestion to try again

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Behavior: _______________

---

## Responsive Design

### TC-034: Mobile Payment Button

**Description**: Verify payment button on mobile

**Steps**:
1. Set viewport to mobile (375x667)
2. Navigate to Payment step
3. Observe Pay button

**Expected Result**:
- Pay button visible and full width
- Amount clearly readable
- Touch-friendly size
- Security notice visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-035: Mobile Razorpay Modal

**Description**: Verify Razorpay modal on mobile

**Steps**:
1. Set viewport to mobile
2. Click Pay button
3. Observe Razorpay modal

**Expected Result**:
- Modal adapts to mobile viewport
- Payment options accessible
- Can scroll if needed
- Touch inputs work correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Tablet Payment

**Description**: Verify payment on tablet

**Steps**:
1. Set viewport to tablet (768x1024)
2. Complete payment flow

**Expected Result**:
- All elements properly sized
- Razorpay modal displays correctly
- Payment completes successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Desktop Payment

**Description**: Verify payment on desktop

**Steps**:
1. Set viewport to desktop (1280x800)
2. Complete payment flow

**Expected Result**:
- Pay button properly positioned
- Razorpay modal centered
- All text readable
- Payment completes successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility

### TC-038: Payment Button Accessibility

**Description**: Verify Pay button is accessible

**Steps**:
1. Navigate to Payment step
2. Tab to Pay button
3. Press Enter

**Expected Result**:
- Button focusable via keyboard
- Visible focus indicator
- Can activate with Enter/Space
- Screen reader announces button text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Error Message Accessibility

**Description**: Verify error messages are accessible

**Steps**:
1. Trigger payment error
2. Check error announcement

**Expected Result**:
- Error message visible
- Screen reader can announce error
- Color not only indicator (icon/text also)
- Error has sufficient contrast

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-040: Keyboard Navigation

**Description**: Verify keyboard navigation in payment step

**Steps**:
1. Navigate to Payment step
2. Use Tab to move through elements

**Expected Result**:
- All interactive elements focusable
- Logical tab order
- Focus indicators visible
- Can navigate back with Shift+Tab

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-041: Payment Step Load Time

**Description**: Verify payment step loads quickly

**Steps**:
1. Time navigation to Payment step
2. Measure until Pay button visible

**Expected Result**:
- Payment step loads < 3 seconds
- No blocking resources
- Button immediately interactive

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load time: _______________

---

### TC-042: No JavaScript Errors

**Description**: Verify no console errors during payment flow

**Steps**:
1. Open browser console
2. Complete entire payment flow
3. Check for errors

**Expected Result**:
- No JavaScript errors
- No unhandled promise rejections
- Network errors handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors found: _______________

---

### TC-043: Payment Processing Time

**Description**: Verify payment completes in reasonable time

**Steps**:
1. Click Pay button
2. Complete test payment
3. Measure total time

**Expected Result**:
- Order creation < 2 seconds
- Razorpay modal opens < 2 seconds
- Payment verification < 3 seconds
- Total flow < 10 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total time: _______________

---

## Error Recovery

### TC-044: Retry After Network Error

**Description**: Verify can retry after network error

**Steps**:
1. Start payment
2. Simulate network error (go offline momentarily)
3. Restore network and retry

**Expected Result**:
- Network error displayed
- Retry option available
- Successful payment on retry
- No duplicate orders

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-045: Session Timeout Handling

**Description**: Verify handling of session timeout during payment

**Steps**:
1. Navigate to Payment step
2. Wait for session timeout (if applicable)
3. Attempt payment

**Expected Result**:
- Appropriate error message
- Redirect to login if needed
- Cart data preserved
- Can return to checkout after login

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 45
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Razorpay Mode: Test
- Razorpay Key ID (first 4 chars): rzp_

### Razorpay Test Cards
- Success: 4111 1111 1111 1111 (any CVV, future expiry)
- Decline: Check Razorpay documentation for current test cards

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Add saved cards for returning customers
   - Show estimated delivery date before payment
   - Add order summary expandable section

2. **Features**:
   - Support for EMI options
   - Support for Pay Later options
   - Add coupon code application in payment step

3. **Security**:
   - Implement idempotency keys for payment requests
   - Add payment fraud detection
   - Log all payment attempts for audit

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
