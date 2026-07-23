# Manual Test: Account Dashboard

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/account

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Test user account created
- [ ] Logged in as test user

## Overview
This document covers manual testing of the chobii.art user account dashboard:
- Authentication check and redirect
- Profile card with user information
- Recent orders section
- Quick actions sidebar
- Help section
- Sign out functionality

## Test Cases

---

## Authentication Tests

### TC-001: Unauthenticated User Redirect

**Description**: Verify unauthenticated users are redirected to login

**Steps**:
1. Clear all session cookies
2. Navigate to http://localhost:3001/account

**Expected Result**:
- Redirect to /auth/login
- URL contains redirect parameter: ?redirect=/account
- Login page displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirected URL: _______________

---

### TC-002: Redirect Preservation

**Description**: Verify account redirect is preserved in login URL

**Steps**:
1. Clear cookies
2. Navigate to /account
3. Observe login URL

**Expected Result**:
- Login URL contains "redirect" parameter
- Parameter value includes "account"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect Param: _______________

---

## Loading State Tests

### TC-003: Loading Spinner Display

**Description**: Verify loading state while fetching session

**Steps**:
1. Navigate to account page
2. Observe initial load (may need to throttle network)

**Expected Result**:
- Loader2 spinner visible (animate-spin class)
- Spinner in brand color (text-brand-500)
- "Loading your account" text displayed
- Centered on page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Page Header Tests (Authenticated)

### TC-004: Page Title Display

**Description**: Verify page title and description

**Steps**:
1. Log in as test user
2. Navigate to /account

**Expected Result**:
- H1 "My Account" visible
- Description "Manage your orders, profile, and preferences" visible
- Page styled with proper spacing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: HTML Title and Meta Tags

**Description**: Verify correct SEO meta tags

**Steps**:
1. Navigate to account page (authenticated)
2. Inspect page source or DevTools

**Expected Result**:
- Title contains "My Account" and "chobii.art"
- robots meta tag contains "noindex"
- meta description contains "account"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

## Profile Card Tests

### TC-006: User Name Display

**Description**: Verify user name is displayed

**Steps**:
1. Log in as user "John Doe"
2. Navigate to /account
3. Locate profile card

**Expected Result**:
- H2 with user's name visible
- Name properly formatted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Displayed Name: _______________

---

### TC-007: User Email Display

**Description**: Verify user email is displayed

**Steps**:
1. Navigate to account page
2. Locate email in profile card

**Expected Result**:
- User email visible (e.g., john@example.com)
- Email in muted text color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Displayed Email: _______________

---

### TC-008: Member Since Date

**Description**: Verify member since date display

**Steps**:
1. Navigate to account page
2. Locate "Member since" text

**Expected Result**:
- "Member since" text visible
- Date formatted properly (e.g., "January 2024")
- Calendar icon may be present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Date Displayed: _______________

---

### TC-009: User Initials Avatar

**Description**: Verify initials displayed when no user image

**Steps**:
1. Log in as user without profile image
2. Navigate to account page
3. Locate avatar area

**Expected Result**:
- User initials displayed (e.g., "JD" for John Doe)
- Initials in brand-colored circle (bg-brand-100)
- Proper font styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Initials Displayed: _______________

---

### TC-010: User Image Avatar

**Description**: Verify user image when available

**Steps**:
1. Log in as user with profile image (OAuth user)
2. Navigate to account page
3. Locate avatar area

**Expected Result**:
- User profile image displayed
- Image has alt text (user's name)
- Rounded/circular styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Image Visible: _______________

---

### TC-011: Settings Button

**Description**: Verify Settings button in profile card

**Steps**:
1. Navigate to account page
2. Locate Settings button in profile card

**Expected Result**:
- Settings button visible
- Links to /account/settings
- Settings/cog icon visible
- Proper hover styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Sign Out Button Display

**Description**: Verify Sign Out button in profile card

**Steps**:
1. Navigate to account page
2. Locate Sign Out button

**Expected Result**:
- "Sign Out" button visible
- Red text color (text-red-600)
- LogOut icon visible
- Button type="button"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Recent Orders Section Tests

### TC-013: Recent Orders Header

**Description**: Verify Recent Orders section header

**Steps**:
1. Navigate to account page
2. Locate Recent Orders section

**Expected Result**:
- H2 "Recent Orders" visible
- Package icon visible in header
- "View All" link visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: View All Link

**Description**: Verify View All orders link

**Steps**:
1. Navigate to account page
2. Click "View All" link in Recent Orders header

**Expected Result**:
- Link navigates to /account/orders
- Orders page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-015: Orders Loading Skeleton

**Description**: Verify loading skeleton while fetching orders

**Steps**:
1. Navigate to account page
2. Observe orders section during load (throttle network if needed)

**Expected Result**:
- Skeleton loaders visible (animate-pulse class)
- Multiple placeholder cards shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Empty Orders State Tests

### TC-016: No Orders Message

**Description**: Verify empty state when no orders

**Steps**:
1. Log in as user with no orders
2. Navigate to account page

**Expected Result**:
- H3 "No orders yet" visible
- Description "Start shopping to see your order history" visible
- Empty state icon visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Browse Posters CTA

**Description**: Verify call-to-action in empty orders state

**Steps**:
1. View empty orders state
2. Locate "Browse Posters" button

**Expected Result**:
- "Browse Posters" button/link visible
- Links to /posters
- Brand-colored styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Orders List with Data Tests

### TC-018: Order Number Display

**Description**: Verify order numbers are displayed

**Steps**:
1. Log in as user with orders
2. Navigate to account page
3. View recent orders

**Expected Result**:
- Order numbers visible (e.g., "MA-20240115-0001")
- Each order has unique number
- Numbers formatted consistently

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order Numbers: _______________

---

### TC-019: Order Status Badges

**Description**: Verify order status is displayed with badges

**Steps**:
1. View orders with different statuses
2. Observe status badges

**Expected Result**:
- Status badges visible for each order
- Different colors for different statuses:
  - Delivered: Green
  - Shipped: Blue
  - Processing: Yellow/Amber
  - Pending Payment: Yellow
  - Cancelled: Red

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Statuses Seen: _______________

---

### TC-020: Order Totals Display

**Description**: Verify order totals are shown

**Steps**:
1. View orders list
2. Check total amounts

**Expected Result**:
- Total amount visible for each order
- Formatted as currency (e.g., "Rs.2,499")
- Proper font weight for emphasis

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Item Count Display

**Description**: Verify item counts shown

**Steps**:
1. View orders list
2. Check item count

**Expected Result**:
- Item count visible (e.g., "2 items")
- Proper pluralization (1 item vs 2 items)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-022: View Details Link

**Description**: Verify order detail links

**Steps**:
1. View orders list
2. Click "View Details" on an order

**Expected Result**:
- "View Details" link visible on each order
- Links to /account/orders/{order-number}
- Order detail page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-023: Order Limit Display

**Description**: Verify dashboard shows max 3 recent orders

**Steps**:
1. Log in as user with 5+ orders
2. View recent orders section

**Expected Result**:
- Maximum 3 orders shown
- Most recent orders displayed first
- "View All" link to see more

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Orders Shown: _______________

---

## Order Status Display Tests

### TC-024: Pending Payment Status

**Description**: Verify Pending Payment status display

**Steps**:
1. Create/view order with pending_payment status
2. Check dashboard

**Expected Result**:
- "Pending Payment" badge visible
- Yellow/warning color styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Shipped Status

**Description**: Verify Shipped status display

**Steps**:
1. View order with shipped status

**Expected Result**:
- "Shipped" badge visible
- Blue color styling
- May show estimated delivery

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-026: Cancelled Status

**Description**: Verify Cancelled status display

**Steps**:
1. View order with cancelled status

**Expected Result**:
- "Cancelled" badge visible
- Red color styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Orders Error State Tests

### TC-027: Orders API Error

**Description**: Verify error handling when orders fail to load

**Steps**:
1. Simulate API error (block orders endpoint in DevTools)
2. Reload account page

**Expected Result**:
- "Unable to load orders" message visible
- Error icon displayed
- Red background/border styling (bg-red-50, border-red-200)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

## Quick Actions Sidebar Tests

### TC-028: Quick Actions Header

**Description**: Verify Quick Actions section display

**Steps**:
1. Navigate to account page
2. Locate Quick Actions sidebar

**Expected Result**:
- H3 "Quick Actions" visible
- Section has proper card styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-029: My Orders Action

**Description**: Verify My Orders quick action

**Steps**:
1. Locate My Orders action
2. Check content and link

**Expected Result**:
- "My Orders" text visible
- Description "Track and manage your orders" visible
- Links to /account/orders
- Chevron icon visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: AI Creations Action

**Description**: Verify AI Creations quick action

**Steps**:
1. Locate AI Creations action
2. Check content and link

**Expected Result**:
- "AI Creations" text visible
- Description "View your AI-generated art" visible
- Links to /account/ai-creations
- Sparkles or appropriate icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Saved Addresses Action

**Description**: Verify Saved Addresses quick action

**Steps**:
1. Locate Saved Addresses action

**Expected Result**:
- "Saved Addresses" text visible
- Description "Manage delivery addresses" visible
- Links to /account/addresses
- Map pin or home icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Account Settings Action

**Description**: Verify Account Settings quick action

**Steps**:
1. Locate Account Settings action

**Expected Result**:
- "Account Settings" text visible
- Description "Update profile & preferences" visible
- Links to /account/settings
- Settings icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Quick Actions Navigation Tests

### TC-033: Navigate to Orders

**Description**: Verify My Orders navigation

**Steps**:
1. Click "My Orders" quick action

**Expected Result**:
- Navigation to /account/orders
- Orders page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-034: Navigate to AI Creations

**Description**: Verify AI Creations navigation

**Steps**:
1. Click "AI Creations" quick action

**Expected Result**:
- Navigation to /account/ai-creations
- AI creations page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-035: Navigate to Addresses

**Description**: Verify Saved Addresses navigation

**Steps**:
1. Click "Saved Addresses" quick action

**Expected Result**:
- Navigation to /account/addresses
- Addresses page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-036: Navigate to Settings

**Description**: Verify Account Settings navigation

**Steps**:
1. Click "Account Settings" quick action

**Expected Result**:
- Navigation to /account/settings
- Settings page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Help Section Tests

### TC-037: Help Section Display

**Description**: Verify Need Help section

**Steps**:
1. Navigate to account page
2. Locate help section (usually in sidebar)

**Expected Result**:
- H3 "Need Help?" visible
- Description text visible
- HelpCircle or question icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Help Description

**Description**: Verify help description text

**Steps**:
1. Locate help section

**Expected Result**:
- Text "Have questions about your order or account?" visible
- Text is readable and properly styled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Contact Support Link

**Description**: Verify Contact Support link

**Steps**:
1. Locate "Contact Support" link
2. Click the link

**Expected Result**:
- "Contact Support" link visible
- Arrow icon visible
- Links to /contact
- Contact page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Sign Out Functionality Tests

### TC-040: Sign Out Button Click

**Description**: Verify sign out triggers API call

**Steps**:
1. Open Network tab in DevTools
2. Click "Sign Out" button
3. Observe network requests

**Expected Result**:
- POST request to /api/auth/sign-out
- Request completes successfully
- User is logged out

**Actual Result**:
- [ ] PASS / [ ] FAIL
- API Called: _______________

---

### TC-041: Sign Out Redirect

**Description**: Verify redirect after sign out

**Steps**:
1. Click "Sign Out" button
2. Wait for completion
3. Observe final URL

**Expected Result**:
- Redirect to home page (/)
- No longer authenticated
- Trying to access /account redirects to login

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirected URL: _______________

---

## Responsive Design Tests

### TC-042: Mobile Layout

**Description**: Verify account page on mobile viewport

**Steps**:
1. Set viewport to 375x667 (iPhone SE)
2. Navigate to account page

**Expected Result**:
- All content visible and accessible
- Vertical stacked layout
- No horizontal scrolling
- Profile card full width
- Quick actions accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-043: Mobile - Settings Text Hidden

**Description**: Verify Settings shows icon only on mobile

**Steps**:
1. Set viewport to 375x667
2. View profile card Settings button

**Expected Result**:
- Settings icon visible
- "Settings" text may be hidden (icon-only)
- Button still functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-044: Tablet Layout

**Description**: Verify account page on tablet

**Steps**:
1. Set viewport to 768x1024 (iPad)
2. Navigate to account page

**Expected Result**:
- Proper spacing and layout
- Quick Actions section visible
- All sections accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-045: Desktop Layout

**Description**: Verify account page on desktop

**Steps**:
1. Set viewport to 1280x800
2. Navigate to account page

**Expected Result**:
- 3-column grid layout (lg:grid-cols-3)
- Profile card, orders, and sidebar visible
- Proper use of wide container

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-046: Desktop Settings Text

**Description**: Verify Settings shows text on desktop

**Steps**:
1. Set viewport to 1280x800
2. View profile card Settings button

**Expected Result**:
- "Settings" text visible
- Settings icon visible
- Full button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility Tests

### TC-047: Heading Hierarchy

**Description**: Verify proper heading structure

**Steps**:
1. Navigate to account page
2. Inspect heading tags

**Expected Result**:
- Single H1 ("My Account")
- Multiple H2s (user name, "Recent Orders")
- H3s for sidebar sections
- No skipped levels

**Actual Result**:
- [ ] PASS / [ ] FAIL
- H1 Count: _______________

---

### TC-048: Semantic HTML

**Description**: Verify semantic HTML structure

**Steps**:
1. Inspect page structure

**Expected Result**:
- Main content wrapper
- Proper article/section usage
- Navigation elements for actions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-049: Avatar Alt Text

**Description**: Verify avatar image has alt text

**Steps**:
1. Log in with profile image
2. Inspect avatar img element

**Expected Result**:
- Alt attribute present
- Alt text is user's name
- Meaningful description

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Alt Text: _______________

---

### TC-050: Keyboard Navigation

**Description**: Verify keyboard accessibility

**Steps**:
1. Tab through the page
2. Test all interactive elements

**Expected Result**:
- All buttons/links reachable by Tab
- Visible focus indicators
- Logical tab order
- Enter activates buttons/links

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-051: Sign Out Button Type

**Description**: Verify Sign Out is a button element

**Steps**:
1. Inspect Sign Out element

**Expected Result**:
- Element is <button>
- type="button" attribute
- Not a link (for proper semantics)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Element Type: _______________

---

## Navigation Tests

### TC-052: View All Orders Navigation

**Description**: Verify View All link navigation

**Steps**:
1. Click "View All" in Recent Orders header

**Expected Result**:
- Navigation to /account/orders
- Orders page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-053: Settings from Profile

**Description**: Verify Settings button navigation

**Steps**:
1. Click Settings button in profile card

**Expected Result**:
- Navigation to /account/settings
- Settings page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Performance Tests

### TC-054: Page Load Time

**Description**: Verify acceptable load time

**Steps**:
1. Open DevTools Network tab
2. Navigate to account page
3. Measure load time

**Expected Result**:
- "My Account" visible within 5 seconds
- Content loads progressively
- No blocking resources

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-055: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open DevTools Console
2. Navigate to account page
3. Interact with page

**Expected Result**:
- No JavaScript errors
- Network errors handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Error Handling Tests

### TC-056: Auth API Error

**Description**: Verify handling of auth API errors

**Steps**:
1. Block /api/auth/get-session in DevTools
2. Navigate to account page

**Expected Result**:
- Redirects to /auth/login
- No crash or white screen

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Behavior: _______________

---

### TC-057: Network Timeout

**Description**: Verify handling of network timeout

**Steps**:
1. Throttle network to slow connection
2. Navigate to account page

**Expected Result**:
- Loading state shown
- Eventually loads or shows error
- No indefinite loading

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 57
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
   - Consider skeleton loading for orders
   - Lazy load order details

2. **UX Improvements**:
   - Add order tracking link
   - Show recent AI creations preview
   - Add account notifications

3. **Accessibility**:
   - Ensure all actions have visible focus
   - Add skip links for navigation
   - Test with screen reader

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
