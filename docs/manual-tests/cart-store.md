# Manual Test: Cart Store (Zustand)

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Application URL**: http://localhost:3001
- **API URL**: http://localhost:3000

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products
- [ ] Browser DevTools accessible (React DevTools recommended)
- [ ] Network tab accessible for API monitoring

## Overview
This document covers manual testing of the chobii.art Zustand cart store:
- Cart state management
- Add/update/remove operations
- Optimistic updates
- Error handling and rollback
- Total calculations
- Backend synchronization

## Test Cases

---

## Initial State

### TC-001: Cart Store Initializes Empty

**Description**: Verify cart starts in empty state

**Steps**:
1. Clear browser storage (localStorage, sessionStorage)
2. Navigate to site
3. Inspect cart state in DevTools (React DevTools or console)

**Expected Result**:
- items: [] (empty array)
- isLoading: false
- error: null
- isInitialized: false (before fetch)
- totals.subtotal: 0
- totals.total: 0
- itemCount: 0

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Initial State: _______________

---

### TC-002: Cart Icon Shows Zero Items

**Description**: Verify cart icon reflects empty cart

**Steps**:
1. With empty cart
2. Check header cart icon

**Expected Result**:
- No badge on cart icon
- Cart icon visible but without count

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart Icon: _______________

---

### TC-003: Cart Page Shows Empty State

**Description**: Verify cart page handles empty cart

**Steps**:
1. Navigate to /cart with empty cart
2. Check page content

**Expected Result**:
- Empty cart message displayed
- "Continue Shopping" or similar CTA
- No error states

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty Cart UI: _______________

---

## Fetch Cart Operation

### TC-004: Fetch Cart on Page Load

**Description**: Verify cart is fetched from backend on load

**Steps**:
1. Open Network tab in DevTools
2. Refresh page
3. Check for cart API request

**Expected Result**:
- GET request to /api/cart
- Request includes credentials
- Cart state updated with response
- isInitialized becomes true

**Actual Result**:
- [ ] PASS / [ ] FAIL
- API Request: _______________

---

### TC-005: Loading State During Fetch

**Description**: Verify loading state is set during fetch

**Steps**:
1. Throttle network in DevTools (Slow 3G)
2. Refresh page
3. Observe cart state

**Expected Result**:
- isLoading: true during fetch
- Loading indicator if shown
- isLoading: false after completion

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading State: _______________

---

### TC-006: Error Handling on Fetch Failure

**Description**: Verify error handling when cart fetch fails

**Steps**:
1. Disconnect network or simulate 500 error
2. Refresh page
3. Check error state

**Expected Result**:
- error: populated with error message
- isLoading: false
- isInitialized: true (even on error)
- User-friendly error displayed if applicable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error State: _______________

---

## Add Item Operation

### TC-007: Add Item to Cart

**Description**: Verify adding a product to cart

**Steps**:
1. Navigate to product detail page
2. Select size/variant
3. Click "Add to Cart" button
4. Check cart state

**Expected Result**:
- POST request to /api/cart/add
- New item appears in cart
- Item has correct productId, variantId, quantity
- itemCount increases
- Totals recalculated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item Added: _______________

---

### TC-008: Add Item - Optimistic Update

**Description**: Verify optimistic update shows immediately

**Steps**:
1. Throttle network (Slow 3G)
2. Add item to cart
3. Observe UI immediately after click

**Expected Result**:
- Item appears immediately (optimistic)
- Temporary ID assigned (temp-{timestamp})
- isLoading: true during API call
- Real item ID replaces temp ID on success

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Optimistic Update: _______________

---

### TC-009: Add Item with Frame

**Description**: Verify adding item with frame customization

**Steps**:
1. Navigate to product detail
2. Select size
3. Select frame option
4. Add to cart

**Expected Result**:
- frameId included in cart item
- Frame name/material populated
- Frame price modifier included
- Total reflects frame price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Frame Added: _______________

---

### TC-010: Add Item with Upload URL

**Description**: Verify adding custom/AI-generated item

**Steps**:
1. Create AI-generated poster
2. Add to cart with custom image

**Expected Result**:
- uploadUrl included in cart item
- Custom image reference saved
- Item displays custom image

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Upload URL: _______________

---

### TC-011: Add Item - Rollback on Error

**Description**: Verify rollback when add fails

**Steps**:
1. Disconnect network
2. Try to add item to cart
3. Observe behavior

**Expected Result**:
- Optimistic item appears briefly
- Item removed when API fails
- Previous state restored
- Error message set
- User notified of failure

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rollback: _______________

---

### TC-012: Add Duplicate Item

**Description**: Verify behavior when adding same product/variant again

**Steps**:
1. Add item to cart
2. Add same product+variant again

**Expected Result**:
- Quantity increases (or new item added per implementation)
- No duplicate entries (if combining)
- Totals updated correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Duplicate Handling: _______________

---

### TC-013: Cart Badge Updates on Add

**Description**: Verify header cart badge updates

**Steps**:
1. Note current cart count
2. Add item to cart
3. Check header badge

**Expected Result**:
- Badge count increases
- Update is immediate (optimistic)
- Badge displays correct total quantity

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Update: _______________

---

## Update Item Operation

### TC-014: Update Item Quantity

**Description**: Verify updating item quantity

**Steps**:
1. Add item to cart
2. Go to cart page
3. Change quantity (+ button or input)
4. Check state

**Expected Result**:
- PUT/PATCH request to /api/cart/{itemId}
- Quantity updates in state
- Totals recalculated
- itemCount updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Quantity Updated: _______________

---

### TC-015: Update Item - Optimistic Update

**Description**: Verify optimistic quantity update

**Steps**:
1. Throttle network
2. Change item quantity
3. Observe UI

**Expected Result**:
- Quantity changes immediately
- isLoading: true
- Updates confirmed on API success

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Optimistic Update: _______________

---

### TC-016: Update Item - Rollback on Error

**Description**: Verify rollback when update fails

**Steps**:
1. Add item to cart
2. Disconnect network
3. Try to change quantity
4. Observe rollback

**Expected Result**:
- Optimistic update appears
- Previous quantity restored on failure
- Error message displayed
- isLoading: false

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rollback: _______________

---

### TC-017: Update Frame on Item

**Description**: Verify changing frame option

**Steps**:
1. Add item without frame
2. Go to cart
3. Select frame for item
4. Check state

**Expected Result**:
- frameId updated
- Frame price modifier added
- Totals recalculated with frame price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Frame Update: _______________

---

### TC-018: Update Quantity to Zero

**Description**: Verify behavior when quantity set to 0

**Steps**:
1. Add item to cart
2. Set quantity to 0 (or use minus until 0)

**Expected Result**:
- Either: Remove item from cart
- Or: Prevent quantity below 1
- State remains consistent

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Zero Quantity: _______________

---

## Remove Item Operation

### TC-019: Remove Single Item

**Description**: Verify removing an item from cart

**Steps**:
1. Add items to cart
2. Click remove/delete button on one item
3. Check state

**Expected Result**:
- DELETE request to /api/cart/{itemId}
- Item removed from items array
- Totals recalculated
- itemCount decreases

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item Removed: _______________

---

### TC-020: Remove Item - Optimistic Update

**Description**: Verify optimistic removal

**Steps**:
1. Throttle network
2. Remove item
3. Observe UI

**Expected Result**:
- Item disappears immediately
- isLoading: true
- Confirmed on API success

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Optimistic Removal: _______________

---

### TC-021: Remove Item - Rollback on Error

**Description**: Verify rollback when remove fails

**Steps**:
1. Add items to cart
2. Disconnect network
3. Try to remove item
4. Observe rollback

**Expected Result**:
- Item disappears optimistically
- Item reappears on failure
- Error message displayed
- Previous state restored

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rollback: _______________

---

### TC-022: Remove Last Item

**Description**: Verify removing the last item in cart

**Steps**:
1. Have single item in cart
2. Remove that item
3. Check state

**Expected Result**:
- items: []
- itemCount: 0
- totals reset to 0
- Empty cart state displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Last Item: _______________

---

## Clear Cart Operation

### TC-023: Clear Entire Cart

**Description**: Verify clearing all items at once

**Steps**:
1. Add multiple items to cart
2. Click "Clear Cart" button (if available)
3. Check state

**Expected Result**:
- All items removed
- items: []
- totals reset to 0
- itemCount: 0
- API call to clear cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart Cleared: _______________

---

### TC-024: Clear Cart - Optimistic Update

**Description**: Verify optimistic clear

**Steps**:
1. Add items to cart
2. Throttle network
3. Clear cart
4. Observe UI

**Expected Result**:
- Cart empties immediately
- isLoading: true
- Confirmed on success

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Optimistic Clear: _______________

---

### TC-025: Clear Cart - Rollback on Error

**Description**: Verify rollback when clear fails

**Steps**:
1. Add items to cart
2. Disconnect network
3. Try to clear cart
4. Observe rollback

**Expected Result**:
- Cart appears empty briefly
- All items restored on failure
- Error message displayed
- Previous totals restored

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rollback: _______________

---

## Total Calculations

### TC-026: Calculate Subtotal

**Description**: Verify subtotal calculation

**Steps**:
1. Add items with known prices
2. Check subtotal calculation

**Expected Result**:
- Subtotal = sum of (variant price + frame price) * quantity
- For each item: (basePrice + frameModifier) * qty
- Calculation accurate to the paisa

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Subtotal: _______________

---

### TC-027: Calculate Tax (GST)

**Description**: Verify 18% GST tax calculation

**Steps**:
1. Add items to cart
2. Check tax calculation

**Expected Result**:
- Tax = subtotal * 0.18
- 18% GST applied
- Tax amount accurate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tax Calculation: _______________

---

### TC-028: Shipping Cost

**Description**: Verify shipping cost (free shipping)

**Steps**:
1. Add items to cart
2. Check shipping cost

**Expected Result**:
- shipping: 0 (free shipping)
- No shipping added to total

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping: _______________

---

### TC-029: Calculate Grand Total

**Description**: Verify total calculation

**Steps**:
1. Add items to cart
2. Calculate expected total manually
3. Compare with displayed total

**Expected Result**:
- Total = subtotal + tax + shipping - discount
- With 0 shipping and 0 discount: subtotal + (subtotal * 0.18)
- Total = subtotal * 1.18

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Grand Total: _______________

---

### TC-030: Item Count Calculation

**Description**: Verify item count reflects quantities

**Steps**:
1. Add items with various quantities
2. Check itemCount

**Expected Result**:
- itemCount = sum of all item quantities
- Not count of unique items
- Updates on quantity changes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item Count: _______________

---

### TC-031: Empty Cart Totals

**Description**: Verify totals with empty cart

**Steps**:
1. Clear cart
2. Check totals

**Expected Result**:
- subtotal: 0
- tax: 0
- shipping: 0
- discount: 0
- total: 0
- itemCount: 0

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty Totals: _______________

---

### TC-032: Totals Update After Changes

**Description**: Verify totals recalculate after every change

**Steps**:
1. Add item, check totals
2. Add another item, check totals
3. Update quantity, check totals
4. Remove item, check totals

**Expected Result**:
- Totals recalculate after each operation
- Values always accurate
- No stale data

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Totals Update: _______________

---

### TC-033: Frame Price Included in Totals

**Description**: Verify frame prices affect totals

**Steps**:
1. Add item without frame, note subtotal
2. Add frame to item
3. Check subtotal change

**Expected Result**:
- Subtotal increases by (frame.priceModifier * quantity)
- Tax recalculates
- Total reflects frame cost

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Frame Price: _______________

---

## Edge Cases

### TC-034: Item Without Variant

**Description**: Verify handling of item missing variant data

**Steps**:
1. If possible, create item without variant (edge case)
2. Check total calculation

**Expected Result**:
- Base price treated as 0
- No crash or error
- Calculation handles undefined gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Missing Variant: _______________

---

### TC-035: Item Without Frame

**Description**: Verify items without frames calculate correctly

**Steps**:
1. Add item without selecting frame
2. Check calculation

**Expected Result**:
- frameModifier treated as 0
- Only variant price used
- No undefined errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- No Frame: _______________

---

### TC-036: Large Quantities

**Description**: Verify handling of large item quantities

**Steps**:
1. Set item quantity to 999
2. Check calculations and display

**Expected Result**:
- Calculation handles large numbers
- No overflow issues
- Display remains readable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Large Quantity: _______________

---

### TC-037: Multiple Items (Large Cart)

**Description**: Verify performance with many items

**Steps**:
1. Add 10+ different items to cart
2. Check performance and calculations

**Expected Result**:
- All items displayed
- Calculations remain accurate
- UI remains responsive
- No performance degradation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Large Cart: _______________

---

## Loading States

### TC-038: Loading State During Add

**Description**: Verify loading state when adding items

**Steps**:
1. Monitor isLoading state
2. Add item to cart

**Expected Result**:
- isLoading: true during add
- isLoading: false after success
- Loading indicator shown if implemented

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading State: _______________

---

### TC-039: Loading State During Update

**Description**: Verify loading state when updating items

**Steps**:
1. Monitor isLoading state
2. Update item quantity

**Expected Result**:
- isLoading: true during update
- isLoading: false after success

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading State: _______________

---

### TC-040: Loading State During Remove

**Description**: Verify loading state when removing items

**Steps**:
1. Monitor isLoading state
2. Remove item from cart

**Expected Result**:
- isLoading: true during remove
- isLoading: false after success

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading State: _______________

---

## Error States

### TC-041: Error Cleared on Success

**Description**: Verify errors are cleared after successful operation

**Steps**:
1. Cause an error (network failure)
2. Note error state
3. Perform successful operation

**Expected Result**:
- error: null after success
- Previous error cleared
- Clean state restored

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Cleared: _______________

---

### TC-042: Error Preserves Items

**Description**: Verify errors don't lose cart data

**Steps**:
1. Add items to cart (successful)
2. Cause error on next operation
3. Check items array

**Expected Result**:
- Items preserved after error
- Only failed operation rolled back
- Existing data intact

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Items Preserved: _______________

---

### TC-043: Custom Error Messages

**Description**: Verify error messages are user-friendly

**Steps**:
1. Trigger various error conditions
2. Check error messages

**Expected Result**:
- "Failed to add item to cart"
- "Failed to update item"
- "Failed to remove item"
- "Failed to clear cart"
- "Failed to fetch cart"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Messages: _______________

---

## Cart Persistence

### TC-044: Cart Survives Page Refresh

**Description**: Verify cart data persists across refreshes

**Steps**:
1. Add items to cart
2. Refresh page (F5)
3. Check cart contents

**Expected Result**:
- Cart items restored from backend
- Same items present
- Totals recalculated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Persistence: _______________

---

### TC-045: Cart Survives Navigation

**Description**: Verify cart survives client-side navigation

**Steps**:
1. Add items to cart
2. Navigate to different pages
3. Return to cart page

**Expected Result**:
- Cart state preserved in memory
- Items still present
- No re-fetch needed (unless policy)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

## Guest vs Authenticated

### TC-046: Guest Cart

**Description**: Verify cart works for guest users

**Steps**:
1. Without logging in
2. Add items to cart
3. Check functionality

**Expected Result**:
- Guest can add to cart
- Session/cookie tracks cart
- Cart persists for session

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Guest Cart: _______________

---

### TC-047: Cart After Login

**Description**: Verify cart merges/persists after login

**Steps**:
1. Add items as guest
2. Log in
3. Check cart contents

**Expected Result**:
- Guest cart merged with user cart (or kept)
- Items preserved
- No data loss

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Login Merge: _______________

---

## Performance

### TC-048: Rapid State Updates

**Description**: Verify cart handles rapid operations

**Steps**:
1. Rapidly click add/update buttons
2. Observe behavior

**Expected Result**:
- All operations processed
- State remains consistent
- No race conditions
- Final state accurate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rapid Updates: _______________

---

### TC-049: Memory Management

**Description**: Verify no memory leaks

**Steps**:
1. Perform many add/remove operations
2. Monitor browser memory in DevTools

**Expected Result**:
- Memory usage stable
- No unbounded growth
- Zustand store efficient

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Memory: _______________

---

### TC-050: API Call Efficiency

**Description**: Verify minimal API calls

**Steps**:
1. Monitor Network tab
2. Perform cart operations
3. Check for unnecessary calls

**Expected Result**:
- One API call per operation
- No duplicate requests
- Efficient backend communication

**Actual Result**:
- [ ] PASS / [ ] FAIL
- API Efficiency: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 50
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Zustand Version: _______________
- Browser: _______________
- React Version: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **State Management**:
   - Monitor for memory leaks in long sessions
   - Consider optimistic update debouncing
   - Implement retry logic for failed operations

2. **User Experience**:
   - Clear feedback for all cart operations
   - Undo functionality for removals
   - Loading skeletons for async operations

3. **Testing**:
   - Add automated unit tests for calculations
   - Test concurrent operations
   - Test with slow network conditions

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
