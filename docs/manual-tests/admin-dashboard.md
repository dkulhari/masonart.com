# Manual Test: Admin Dashboard

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Frontend URL**: http://localhost:3001
- **API URL**: http://localhost:3000

## Prerequisites
- [ ] Dev server running at http://localhost:3001 (Web) and http://localhost:3000 (API)
- [ ] Database migrations applied (`bun run db:migrate` — not `db:push`, which skips the audit-log trigger, #663)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Admin user account created
- [ ] Test data seeded (products, orders, users)

## Overview
This document covers manual testing of the Admin Dashboard page (`/admin/dashboard`):
- Page layout and structure
- Statistics cards
- Recent activity widgets
- Quick actions
- Responsive design
- Accessibility

---

## Page Structure

### TC-001: Dashboard Page Load

**Description**: Verify dashboard page loads successfully

**URL**: `/admin/dashboard`

**Steps**:
1. Login as admin
2. Navigate to `/admin/dashboard`
3. Wait for page load

**Expected Result**:
- Page loads without errors
- No JavaScript errors in console
- All sections visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-002: Dashboard Page Title

**Description**: Verify page has correct title

**URL**: `/admin/dashboard`

**Expected Result**:
- H1: "Dashboard"
- Document title contains "Dashboard" and "chobii.art"
- Welcome message with admin name

**Actual Result**:
- [ ] PASS / [ ] FAIL
- H1 Text: _______________
- Document Title: _______________

---

### TC-003: Robots Meta Tag

**Description**: Verify admin dashboard has noindex directive

**Steps**:
1. View page source or DevTools
2. Find meta robots tag

**Expected Result**:
- `<meta name="robots" content="noindex, nofollow">`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tag Present: _______________

---

### TC-004: Admin Navigation Sidebar

**Description**: Verify admin navigation is visible

**Expected Result**:
- Sidebar visible on desktop
- Dashboard link active/highlighted
- Products link present
- Orders link present
- Logo/brand visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sidebar Visible: _______________
- Active Link Highlighted: _______________

---

### TC-005: Admin Header

**Description**: Verify admin header displays correctly

**Expected Result**:
- Admin user name visible
- Profile dropdown accessible
- Sign out option available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- User Name: _______________

---

## Statistics Cards

### TC-006: Total Orders Card

**Description**: Verify Total Orders stat card displays

**Steps**:
1. Locate "Total Orders" or "Orders" card
2. Verify count displayed

**Expected Result**:
- Card visible with icon
- Order count displayed
- Formatted number (e.g., "1,234")

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order Count: _______________

---

### TC-007: Today's Orders Card

**Description**: Verify Today's Orders stat card displays

**Expected Result**:
- Card shows orders from today
- Count is accurate
- Clear label

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Today's Count: _______________

---

### TC-008: Pending Orders Card

**Description**: Verify Pending Orders stat card displays

**Expected Result**:
- Shows orders needing attention
- Count of pending status orders
- Visual indicator (e.g., warning color)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pending Count: _______________

---

### TC-009: Total Revenue Card

**Description**: Verify Total Revenue stat card displays

**Expected Result**:
- Revenue formatted as currency (₹)
- Large number formatting (e.g., "₹12.5L")
- Growth indicator (if implemented)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Revenue Amount: _______________

---

### TC-010: Active Products Card

**Description**: Verify Active Products stat card displays

**Expected Result**:
- Count of active products
- Clear label
- Icon present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product Count: _______________

---

### TC-011: Total Customers Card

**Description**: Verify Total Customers stat card displays

**Expected Result**:
- Total registered users count
- Clear formatting
- Growth trend (if implemented)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Customer Count: _______________

---

### TC-012: Stats Card Loading State

**Description**: Verify loading state for stats cards

**Steps**:
1. Refresh dashboard
2. Observe card loading states

**Expected Result**:
- Skeleton loaders during fetch
- Smooth transition to data
- No layout shift

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading Animation: _______________

---

### TC-013: Stats Card Error State

**Description**: Verify error handling for stats

**Steps**:
1. Simulate API failure
2. Check card behavior

**Expected Result**:
- Error indicator shown
- Retry option available
- Graceful degradation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Handling: _______________

---

## Recent Orders Section

### TC-014: Recent Orders List Display

**Description**: Verify recent orders section shows latest orders

**Expected Result**:
- Section header "Recent Orders"
- List of 5-10 recent orders
- Order number visible
- Customer name visible
- Order total visible
- Status badge visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Orders Shown: _______________

---

### TC-015: Recent Orders - Order Number

**Description**: Verify order numbers display correctly

**Expected Result**:
- Format: CA-YYYY-NNNNNN (e.g. CA-2026-000123)
- Clickable (links to order detail)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Format Correct: _______________

---

### TC-016: Recent Orders - Status Badges

**Description**: Verify status badges with correct colors

**Test Status Colors**:
- Pending: Yellow/Amber
- Processing: Blue
- Shipped: Purple
- Delivered: Green
- Cancelled: Red

**Expected Result**:
- Correct color per status
- Readable text
- Consistent styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Colors Correct: _______________

---

### TC-017: Recent Orders - View All Link

**Description**: Verify "View All Orders" link

**Steps**:
1. Locate "View All" or similar link
2. Click link

**Expected Result**:
- Link visible
- Navigates to `/admin/orders`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Link Works: _______________

---

### TC-018: Recent Orders - Empty State

**Description**: Verify empty state when no orders

**Prerequisites**: Database with no orders

**Expected Result**:
- "No orders yet" message
- Possibly a call-to-action

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty State: _______________

---

## Quick Actions Section

### TC-019: Quick Action - Add Product

**Description**: Verify Add Product quick action

**Steps**:
1. Find "Add Product" button/link
2. Click action

**Expected Result**:
- Button visible
- Navigates to `/admin/products/new`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-020: Quick Action - View Orders

**Description**: Verify View Orders quick action

**Steps**:
1. Find "View Orders" button/link
2. Click action

**Expected Result**:
- Button visible
- Navigates to `/admin/orders`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-021: Quick Action - View Products

**Description**: Verify View Products quick action

**Steps**:
1. Find "View Products" button/link
2. Click action

**Expected Result**:
- Button visible
- Navigates to `/admin/products`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

## Charts and Graphs (if implemented)

### TC-022: Revenue Chart

**Description**: Verify revenue chart displays correctly

**Expected Result**:
- Chart renders without errors
- Data points visible
- Axis labels clear
- Time period selector (if available)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Chart Rendered: _______________

---

### TC-023: Orders Chart

**Description**: Verify orders trend chart

**Expected Result**:
- Shows order volume over time
- Proper date formatting
- Hover tooltips

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Chart Working: _______________

---

## Data Refresh

### TC-024: Refresh Button

**Description**: Verify refresh button functionality

**Steps**:
1. Find refresh/reload button
2. Click button
3. Observe data update

**Expected Result**:
- Button visible
- Loading state shown
- Data refreshed
- Timestamp updated (if shown)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Refresh Working: _______________

---

### TC-025: Auto-Refresh (if implemented)

**Description**: Verify auto-refresh functionality

**Steps**:
1. Note current stats
2. Create an order in another tab
3. Wait for auto-refresh interval
4. Check if stats updated

**Expected Result**:
- Stats update automatically
- No page reload required
- Configurable interval

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Auto-refresh Interval: _______________

---

## Responsive Design

### TC-026: Desktop Layout (1920x1080)

**Description**: Verify dashboard on large desktop

**Viewport**: 1920x1080

**Expected Result**:
- Full sidebar visible
- Stats cards in row
- Charts side by side
- No horizontal scroll

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Layout Correct: _______________

---

### TC-027: Laptop Layout (1366x768)

**Description**: Verify dashboard on standard laptop

**Viewport**: 1366x768

**Expected Result**:
- Sidebar visible (may be narrower)
- Content fits without scroll
- All elements visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Layout Correct: _______________

---

### TC-028: Tablet Layout (768x1024)

**Description**: Verify dashboard on tablet

**Viewport**: 768x1024 (iPad)

**Expected Result**:
- Sidebar may collapse to hamburger
- Stats cards stack appropriately
- Touch-friendly buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tablet Ready: _______________

---

### TC-029: Mobile Layout (375x667)

**Description**: Verify dashboard on mobile

**Viewport**: 375x667 (iPhone SE)

**Expected Result**:
- Hamburger menu for navigation
- Stats cards single column
- Recent orders in card format
- All content accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Ready: _______________

---

### TC-030: Mobile Navigation

**Description**: Verify mobile navigation works

**Viewport**: 375x667

**Steps**:
1. Tap hamburger menu
2. Verify menu opens
3. Navigate to different page
4. Verify menu closes

**Expected Result**:
- Menu opens with animation
- All menu items visible
- Navigation works
- Menu closes after selection

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Nav Working: _______________

---

## Accessibility

### TC-031: Heading Hierarchy

**Description**: Verify proper heading structure

**Steps**:
1. Inspect heading elements
2. Verify hierarchy (h1 > h2 > h3)

**Expected Result**:
- Single h1 ("Dashboard")
- h2 for section headings
- Logical hierarchy
- No skipped levels

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Hierarchy Correct: _______________

---

### TC-032: Keyboard Navigation

**Description**: Verify dashboard is keyboard navigable

**Steps**:
1. Use Tab to navigate through elements
2. Verify all interactive elements reachable

**Expected Result**:
- All links/buttons focusable
- Visible focus indicators
- Logical tab order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard Accessible: _______________

---

### TC-033: Screen Reader Labels

**Description**: Verify screen reader accessibility

**Steps**:
1. Use VoiceOver or similar
2. Navigate dashboard

**Expected Result**:
- Stat cards have aria-labels
- Links are descriptive
- Icons have alt text
- Sections are landmarks

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Screen Reader Ready: _______________

---

### TC-034: Color Contrast

**Description**: Verify sufficient color contrast

**Steps**:
1. Check text on backgrounds
2. Verify badge readability

**Expected Result**:
- WCAG AA compliant (4.5:1 for normal text)
- Status badges readable
- All text legible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Contrast OK: _______________

---

## Performance

### TC-035: Initial Load Time

**Description**: Verify dashboard loads quickly

**Steps**:
1. Clear cache
2. Navigate to dashboard
3. Measure load time

**Expected Result**:
- Time to Interactive < 3 seconds
- All stats visible < 2 seconds
- No layout shift

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-036: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open DevTools Console
2. Load dashboard
3. Interact with page
4. Check for errors

**Expected Result**:
- No JavaScript errors
- No unhandled promise rejections
- No React/framework warnings

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

### TC-037: Network Request Efficiency

**Description**: Verify efficient data fetching

**Steps**:
1. Open DevTools Network tab
2. Load dashboard
3. Count API requests

**Expected Result**:
- Minimal API calls
- No duplicate requests
- Proper caching headers

**Actual Result**:
- [ ] PASS / [ ] FAIL
- API Calls Count: _______________

---

## Error States

### TC-038: API Timeout Handling

**Description**: Verify dashboard handles slow API

**Steps**:
1. Simulate slow network
2. Load dashboard

**Expected Result**:
- Loading indicators shown
- No crash
- Timeout message (if applicable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Timeout Handling: _______________

---

### TC-039: Partial Data Failure

**Description**: Verify dashboard handles partial data failure

**Steps**:
1. Simulate one API endpoint failing
2. Verify other sections still work

**Expected Result**:
- Failed section shows error
- Other sections work normally
- Retry option available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Graceful Degradation: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 39
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Dashboard Statistics
- Total Orders: _______________
- Today's Orders: _______________
- Pending Orders: _______________
- Total Revenue: _______________
- Active Products: _______________
- Total Customers: _______________

### Performance Metrics
- Initial Load: _______________
- Time to Interactive: _______________
- API Response Times: _______________

### Additional Observations
_______________________________________________
_______________________________________________

## Recommendations

1. **Performance**:
   - Consider data caching for stats
   - Implement skeleton loaders
   - Lazy load charts

2. **UX Improvements**:
   - Add date range selector for stats
   - Implement real-time updates
   - Add export functionality

3. **Monitoring**:
   - Track dashboard load times
   - Monitor API error rates
   - Alert on anomalous stat changes

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
