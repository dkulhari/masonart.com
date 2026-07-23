# Manual Test: Notification Preferences

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-30
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/account/notifications

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Test user account created
- [ ] Logged in as test user
- [ ] Test user with existing preferences (testuser2@example.com)
- [ ] Test user without preferences (testuser1@example.com)

## Overview
This document covers manual testing of the chobii.art notification preferences feature:
- Page access and authentication
- Email notification toggles
- SMS notification toggles
- Toggle persistence
- Loading states
- Error handling
- Accessibility

## Test Cases

---

## Authentication Tests

### TC-001: Unauthenticated User Redirect

**Description**: Verify unauthenticated users are redirected to login

**Steps**:
1. Clear all session cookies
2. Navigate to http://localhost:3001/account/notifications

**Expected Result**:
- Redirect to /auth/login
- URL contains redirect parameter: ?redirect=/account/notifications
- Login page displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirected URL: _______________

---

### TC-002: Post-Login Redirect

**Description**: Verify redirect back to notifications after login

**Steps**:
1. Clear cookies
2. Navigate to /account/notifications (redirected to login)
3. Complete login

**Expected Result**:
- After login, redirected to /account/notifications
- Notification preferences page loads
- User preferences displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Final URL: _______________

---

## Page Display Tests

### TC-003: Page Title and Header

**Description**: Verify page title and header display

**Steps**:
1. Log in as test user
2. Navigate to /account/notifications

**Expected Result**:
- Page title contains "Notification Preferences" and "chobii.art"
- H1 "Notification Preferences" visible
- Bell icon in header
- Page description visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Back to Account Link

**Description**: Verify back navigation link

**Steps**:
1. Navigate to notifications page
2. Locate "Back to Account" link
3. Click the link

**Expected Result**:
- Link visible (arrow icon + text)
- Navigates to /account
- Account dashboard loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Section Organization

**Description**: Verify Email and SMS sections displayed

**Steps**:
1. Navigate to notifications page
2. Examine section layout

**Expected Result**:
- Two distinct sections visible
- "Email Notifications" section with mail icon
- "SMS Notifications" section with phone icon
- Each section has 4 toggles
- Sections in separate cards

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Initial State Tests

### TC-006: New User Default Preferences

**Description**: Verify defaults for user without saved preferences

**Steps**:
1. Log in as new user (no saved prefs)
2. Navigate to notifications page

**Expected Result**:
- All 4 Email toggles ON (enabled)
- All 4 SMS toggles OFF (disabled)
- Toggles show correct visual state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email States: _______________
- SMS States: _______________

---

### TC-007: Existing User Saved Preferences

**Description**: Verify saved preferences load correctly

**Steps**:
1. Log in as user with saved preferences
2. Navigate to notifications page

**Expected Result**:
- Toggle states match database values
- No flickering on load
- Consistent with previous saves

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Loading State on Initial Load

**Description**: Verify loading spinner during preference fetch

**Steps**:
1. Navigate to notifications page
2. Observe initial load (throttle network if needed)

**Expected Result**:
- Loading spinner visible
- "Loading preferences..." text
- Spinner centered
- Toggles appear after load completes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Email Toggle Tests

### TC-009: Toggle Order Confirmation Email

**Description**: Verify Order Confirmation email toggle

**Steps**:
1. Locate "Order Confirmation" in Email section
2. Note current state
3. Click toggle
4. Wait for save
5. Refresh page

**Expected Result**:
- Toggle visible with correct label
- Description: "When your order is placed and confirmed"
- Click changes visual state
- Brief loading spinner in toggle
- "Preferences updated" success message
- State persisted after refresh

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: Toggle Order Shipped Email

**Description**: Verify Order Shipped email toggle

**Steps**:
1. Locate "Order Shipped" toggle
2. Toggle OFF
3. Verify visual change to gray
4. Toggle ON
5. Verify visual change to brand color

**Expected Result**:
- Toggle functions correctly
- OFF state: gray background
- ON state: brand color (brand-500)
- Success message each change

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-011: Toggle Out for Delivery Email

**Description**: Verify Out for Delivery email toggle

**Steps**:
1. Locate "Out for Delivery" toggle
2. Change state
3. Verify persistence

**Expected Result**:
- Toggle works correctly
- Description: "When your order is out for delivery"
- State saved to database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Toggle Delivered Email

**Description**: Verify Delivered email toggle

**Steps**:
1. Locate "Delivered" toggle
2. Change state
3. Refresh and verify

**Expected Result**:
- Toggle functions correctly
- Description: "When your order has been delivered"
- Persists after refresh

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## SMS Toggle Tests

### TC-013: Toggle Order Confirmation SMS

**Description**: Verify Order Confirmation SMS toggle

**Steps**:
1. Locate "Order Confirmation" in SMS section
2. Verify default OFF state
3. Toggle ON
4. Verify success
5. Refresh to confirm persistence

**Expected Result**:
- Toggle starts OFF (gray)
- Clicking turns ON (brand color)
- "Preferences updated" message
- State persisted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Toggle Order Shipped SMS

**Description**: Verify Order Shipped SMS toggle

**Steps**:
1. Find "Order Shipped" in SMS section
2. Toggle ON
3. Verify change

**Expected Result**:
- Toggle functional
- Visual feedback immediate
- Success message shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Toggle Out for Delivery SMS

**Description**: Verify Out for Delivery SMS toggle

**Steps**:
1. Locate toggle
2. Change state
3. Verify

**Expected Result**:
- Toggle works correctly
- Same behavior as email toggles

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-016: Toggle Delivered SMS

**Description**: Verify Delivered SMS toggle

**Steps**:
1. Locate toggle
2. Change state
3. Verify persistence

**Expected Result**:
- Toggle functions correctly
- State saved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Multiple Toggle Tests

### TC-017: Rapid Toggle Clicks

**Description**: Verify handling of rapid clicks

**Steps**:
1. Click a toggle
2. Immediately click again (during loading)
3. Wait for completion

**Expected Result**:
- Second click ignored OR properly queued
- No race conditions
- Final state is consistent
- No duplicate API calls

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-018: Multiple Different Toggles

**Description**: Verify changing multiple toggles in sequence

**Steps**:
1. Toggle Email Order Confirmation OFF
2. Toggle SMS Order Confirmation ON
3. Toggle Email Shipped OFF
4. Refresh page

**Expected Result**:
- Each toggle saves independently
- All 3 changes persisted
- No interference between saves

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-019: All Email Toggles OFF

**Description**: Verify all email notifications can be disabled

**Steps**:
1. Turn all 4 email toggles OFF
2. Verify all show gray
3. Refresh page

**Expected Result**:
- All toggles accept OFF state
- All remain OFF after refresh
- No "at least one required" restriction

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: All SMS Toggles ON

**Description**: Verify all SMS notifications can be enabled

**Steps**:
1. Turn all 4 SMS toggles ON
2. Verify all show brand color
3. Refresh page

**Expected Result**:
- All toggles turn ON
- All remain ON after refresh
- Visual consistency

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Loading State Tests

### TC-021: Toggle Loading Spinner

**Description**: Verify loading indicator during save

**Steps**:
1. Click any toggle
2. Observe toggle during API call

**Expected Result**:
- Small spinner inside toggle knob
- Spinner animates (spin class)
- Spinner disappears on completion
- Toggle in correct final state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-022: Toggle Disabled During Save

**Description**: Verify toggle disabled while saving

**Steps**:
1. Click a toggle
2. Try clicking same toggle during save

**Expected Result**:
- Toggle appears disabled (reduced opacity)
- Click is ignored
- cursor-not-allowed style

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error Handling Tests

### TC-023: Network Error on Toggle

**Description**: Verify toggle rollback on network error

**Steps**:
1. Disable network (DevTools offline)
2. Click a toggle
3. Observe behavior

**Expected Result**:
- Error message displayed
- Toggle reverts to previous state (rollback)
- Red error styling
- User can retry after reconnecting

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-024: Server Error on Toggle

**Description**: Verify toggle rollback on server error

**Steps**:
1. Simulate 500 error (block API endpoint)
2. Click a toggle

**Expected Result**:
- Error message shown
- Toggle reverts to original state
- Optimistic update rolled back

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Initial Load Error

**Description**: Verify error state when preferences fail to load

**Steps**:
1. Block /api/notification-preferences endpoint
2. Navigate to notifications page

**Expected Result**:
- Error message: "Unable to Load Preferences" or similar
- "Try Again" button visible
- Click retry reloads data

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

## Success Feedback Tests

### TC-026: Success Message Display

**Description**: Verify success message after toggle

**Steps**:
1. Toggle any preference
2. Wait for completion
3. Observe success message

**Expected Result**:
- "Preferences updated" message appears
- Green background/styling
- Checkmark icon may be present
- Message clearly visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Success Message Auto-Dismiss

**Description**: Verify success message disappears

**Steps**:
1. Toggle a preference
2. Note success message
3. Wait 3-5 seconds

**Expected Result**:
- Message automatically dismisses
- No manual close required
- Clean UI after dismiss

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Dismiss Time: _______________

---

## UI/UX Tests

### TC-028: Toggle Labels and Descriptions

**Description**: Verify toggle labeling is clear

**Steps**:
1. Review all 8 toggles
2. Check labels and descriptions

**Expected Result**:
- Each toggle has clear label
- Each has helpful description
- Same 4 labels in Email and SMS sections:
  - Order Confirmation
  - Order Shipped
  - Out for Delivery
  - Delivered

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-029: Info Card Display

**Description**: Verify information card at bottom

**Steps**:
1. Scroll to bottom of page
2. Find info card

**Expected Result**:
- Info card visible
- Explains email vs SMS behavior
- Notes critical notifications may still be sent
- Blue info styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility Tests

### TC-030: Keyboard Navigation

**Description**: Verify keyboard accessibility

**Steps**:
1. Tab through page
2. Use Space/Enter on toggles
3. Verify focus visibility

**Expected Result**:
- All toggles reachable via Tab
- Focus ring visible (ring-2 ring-brand-500)
- Space toggles the switch
- Enter toggles the switch
- Logical tab order (top to bottom)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Screen Reader Support

**Description**: Verify screen reader announces toggle state

**Steps**:
1. Enable screen reader (VoiceOver/NVDA)
2. Navigate to toggle
3. Toggle and listen

**Expected Result**:
- role="switch" announced
- aria-checked state announced ("checked"/"unchecked")
- Label read with toggle
- State change announced

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: ARIA Attributes

**Description**: Verify ARIA implementation

**Steps**:
1. Inspect toggle elements in DevTools

**Expected Result**:
- role="switch" present
- aria-checked matches visual state
- aria-checked updates on toggle
- Label associated via htmlFor/id

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Label Click

**Description**: Verify clicking label toggles switch

**Steps**:
1. Click on toggle label text (not toggle itself)

**Expected Result**:
- Toggle changes state
- Same behavior as clicking toggle
- cursor-pointer on label

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Color Contrast

**Description**: Verify sufficient color contrast

**Steps**:
1. Check label text contrast
2. Check description text contrast
3. Check toggle ON/OFF visibility

**Expected Result**:
- Labels have WCAG AA contrast
- Descriptions readable
- Toggle states clearly distinguishable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design Tests

### TC-035: Mobile Layout (375px)

**Description**: Verify page on mobile viewport

**Steps**:
1. Set viewport to 375x667
2. Navigate to notifications page

**Expected Result**:
- Single column layout
- No horizontal scroll
- Toggles easy to tap (44x44px target)
- Labels not truncated
- Cards stack vertically

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Tablet Layout (768px)

**Description**: Verify page on tablet

**Steps**:
1. Set viewport to 768x1024
2. Test toggle interactions

**Expected Result**:
- Appropriate spacing
- Toggles functional
- Good readability

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Touch Interaction

**Description**: Verify touch targets on mobile

**Steps**:
1. Use mobile device or emulator
2. Tap toggles
3. Tap labels

**Expected Result**:
- Toggles respond to tap
- Labels respond to tap
- No accidental taps
- Touch target minimum 44x44px

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Session Tests

### TC-038: Session Expiry

**Description**: Verify behavior when session expires

**Steps**:
1. Be on notifications page
2. Manually invalidate session (delete cookies)
3. Try to toggle a preference

**Expected Result**:
- Redirected to login
- No error crash
- Can return after re-login

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Multiple Tabs Sync

**Description**: Verify changes sync across tabs

**Steps**:
1. Open notifications in Tab A
2. Open notifications in Tab B
3. Toggle setting in Tab A
4. Refresh Tab B

**Expected Result**:
- Tab B shows updated setting after refresh
- Data consistency maintained
- No stale state issues

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Navigation Tests

### TC-040: Account Dashboard Quick Action

**Description**: Verify navigation from account dashboard

**Steps**:
1. Go to /account
2. Find Notifications quick action
3. Click it

**Expected Result**:
- Quick action card visible with bell icon
- "Notifications" text and description
- Navigates to /account/notifications

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance Tests

### TC-041: Toggle Response Time

**Description**: Verify toggle saves quickly

**Steps**:
1. Toggle a preference
2. Measure time to success message

**Expected Result**:
- Success within 1-2 seconds
- Optimistic update is immediate
- No perceived lag

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-042: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open DevTools Console
2. Navigate to page
3. Toggle all preferences
4. Check console

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
- Test User Email: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Performance**:
   - Consider batching multiple toggle changes
   - Debounce rapid clicks

2. **UX Improvements**:
   - Add "Save All" button for bulk changes
   - Show notification preview
   - Add time-of-day preferences

3. **Accessibility**:
   - Ensure success message announced to screen readers
   - Add live region for status updates
   - Test with various assistive technologies

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
