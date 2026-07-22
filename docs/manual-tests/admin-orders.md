# Manual Test: Admin Orders Management

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Frontend URL**: http://localhost:3001
- **API URL**: http://localhost:3000

## Prerequisites
- [ ] Dev server running at http://localhost:3001 (Web) and http://localhost:3000 (API)
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Admin user account created
- [ ] Test orders seeded in database with various statuses
- [ ] Razorpay test mode configured (for refund testing)

## Overview
This document covers manual testing of Admin Orders Management:
- Orders listing page (`/admin/orders`)
- Order detail page (`/admin/orders/:id`)
- Order status updates
- Shipping details management
- Refund processing
- Statistics and reporting

---

## Orders List Page

### TC-001: Orders List Page Load

**Description**: Verify orders list page loads successfully

**URL**: `/admin/orders`

**Steps**:
1. Login as admin
2. Navigate to `/admin/orders`

**Expected Result**:
- Page title: "Orders"
- Orders table visible
- Refresh and Export buttons visible
- Stats cards visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page Loaded: _______________

---

### TC-002: Document Title and Meta

**Description**: Verify HTML title and robots meta

**Expected Result**:
- Title: "Orders - Admin - chobi.art" (or similar)
- Meta robots: "noindex, nofollow"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-003: Orders Table Structure

**Description**: Verify orders table columns

**Expected Columns**:
- Order Number
- Customer
- Date
- Items Count
- Total
- Status
- Payment Status
- Actions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Columns Present: _______________

---

### TC-004: Order Row Data Display

**Description**: Verify order data displays correctly

**Steps**:
1. Observe order rows
2. Verify data formatting

**Expected Result**:
- Order number format: MA-YYYYMMDD-XXX
- Customer name and email
- Date formatted (e.g., Jan 15, 2024)
- Total with currency (₹)
- Status badge with color
- Payment status badge

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Data Format Correct: _______________

---

### TC-005: Order Status Badge Colors

**Description**: Verify status badges have correct colors

**Status Colors**:
- Pending: Yellow
- Confirmed: Blue
- Processing: Blue
- Shipped: Purple
- Delivered: Green
- Cancelled: Red

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Colors Correct: _______________

---

### TC-006: Payment Status Badge Colors

**Description**: Verify payment status badges

**Payment Status Colors**:
- Pending: Yellow
- Paid: Green
- Failed: Red
- Refunded: Purple/Gray

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Payment Colors: _______________

---

## Statistics Cards

### TC-007: Today's Orders Card

**Description**: Verify Today's Orders stat card

**Expected Result**:
- Shows count of orders placed today
- Number formatted
- Clickable to filter (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Today Count: _______________

---

### TC-008: Pending Orders Card

**Description**: Verify Pending Orders stat card

**Expected Result**:
- Shows orders needing attention
- Warning styling if > 0
- Clickable to filter (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pending Count: _______________

---

### TC-009: Total Revenue Card

**Description**: Verify Total Revenue stat card

**Expected Result**:
- Formatted currency (₹)
- Handles large numbers (e.g., ₹12.5L)
- All-time or period based

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Revenue: _______________

---

### TC-010: This Month Revenue Card

**Description**: Verify monthly revenue stat

**Expected Result**:
- Current month revenue
- Properly formatted
- Updates in real-time (or on refresh)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Month Revenue: _______________

---

## Search and Filters

### TC-011: Search Input

**Description**: Verify search input presence

**Expected Result**:
- Search input visible
- Placeholder text
- Search icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search Present: _______________

---

### TC-012: Search by Order Number

**Description**: Verify search by order number

**Steps**:
1. Enter order number (e.g., "MA-2024")
2. Verify results

**Expected Result**:
- Matching orders shown
- Partial match supported
- URL updated with search param

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Order Search: _______________

---

### TC-013: Search by Customer Email

**Description**: Verify search by customer email

**Steps**:
1. Enter customer email
2. Verify results

**Expected Result**:
- Orders from that customer shown
- Partial email match works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email Search: _______________

---

### TC-014: Search by Customer Name

**Description**: Verify search by customer name

**Steps**:
1. Enter customer name
2. Verify results

**Expected Result**:
- Orders from matching customers
- Case-insensitive

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Name Search: _______________

---

### TC-015: Status Filter Dropdown

**Description**: Verify order status filter

**Expected Options**:
- All Status
- Pending
- Confirmed
- Processing
- Shipped
- Out for Delivery
- Delivered
- Cancelled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Options: _______________

---

### TC-016: Filter by Processing Status

**Description**: Verify filtering by Processing

**URL**: `/admin/orders?status=processing`

**Expected Result**:
- Only processing orders shown
- Filter dropdown shows "Processing"
- Count accurate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Processing Count: _______________

---

### TC-017: Filter by Shipped Status

**Description**: Verify filtering by Shipped

**URL**: `/admin/orders?status=shipped`

**Expected Result**:
- Only shipped orders shown
- Includes orders awaiting delivery

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipped Count: _______________

---

### TC-018: Filter by Delivered Status

**Description**: Verify filtering by Delivered

**URL**: `/admin/orders?status=delivered`

**Expected Result**:
- Only completed orders shown
- Has deliveredAt timestamp

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delivered Count: _______________

---

### TC-019: Filter by Cancelled Status

**Description**: Verify filtering by Cancelled

**URL**: `/admin/orders?status=cancelled`

**Expected Result**:
- Only cancelled orders shown
- Has cancelledAt timestamp

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cancelled Count: _______________

---

### TC-020: Payment Status Filter

**Description**: Verify payment status filter

**Expected Options**:
- All Payment Status
- Pending
- Paid
- Failed
- Refunded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Payment Filter: _______________

---

### TC-021: Filter by Paid

**Description**: Verify filtering by paid orders

**URL**: `/admin/orders?paymentStatus=paid`

**Expected Result**:
- Only paid orders shown
- Has paidAt timestamp

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Paid Count: _______________

---

### TC-022: Date Range Filter

**Description**: Verify date range filter

**Steps**:
1. Set "From" date
2. Set "To" date
3. Verify filtered results

**Expected Result**:
- Orders within date range
- URL updated with dateFrom/dateTo
- Clear dates option

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Date Filter: _______________

---

### TC-023: Combined Filters

**Description**: Verify multiple filters work together

**Steps**:
1. Set status filter to "shipped"
2. Set payment status to "paid"
3. Add search term

**Expected Result**:
- Results match all criteria
- All params in URL
- Clear all option

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Combined Filters: _______________

---

## Pagination

### TC-024: Pagination Display

**Description**: Verify pagination controls

**Prerequisites**: More than 20 orders

**Expected Result**:
- Page numbers visible
- Previous/Next buttons
- "Page X of Y" display
- Total count shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pagination: _______________

---

### TC-025: Navigate Pages

**Description**: Verify page navigation

**Steps**:
1. Click Next
2. Click page number
3. Click Previous

**Expected Result**:
- Content updates
- URL updates with page param
- Current page highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

## Action Menu

### TC-026: Action Menu Button

**Description**: Verify action menu per row

**Steps**:
1. Click action button (⋮) on row
2. Observe menu

**Expected Result**:
- Menu opens
- View Details option
- Update Status option
- Quick actions (if applicable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Menu Opens: _______________

---

### TC-027: View Details Action

**Description**: Verify View Details navigation

**Steps**:
1. Click action menu
2. Click "View Details"

**Expected Result**:
- Navigates to `/admin/orders/:id`
- Order detail page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-028: Update Status Quick Action

**Description**: Verify Update Status from list

**Steps**:
1. Click action menu
2. Click "Update Status"

**Expected Result**:
- Status modal opens
- Current status shown
- Can change status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Quick Status: _______________

---

## Order Detail Page

### TC-029: Order Detail Page Load

**Description**: Verify order detail page loads

**URL**: `/admin/orders/:id`

**Expected Result**:
- Order number in header
- Status badges visible
- Back button works
- Refresh button works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page Loaded: _______________

---

### TC-030: Order Header Information

**Description**: Verify order header details

**Expected Elements**:
- Order number (with copy button)
- Created date
- Order status badge
- Payment status badge
- Order type (regular/AI generated)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Header Info: _______________

---

### TC-031: Copy Order Number

**Description**: Verify copy order number functionality

**Steps**:
1. Click copy button next to order number
2. Paste somewhere

**Expected Result**:
- Order number copied
- Toast confirmation
- Correct format copied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Copy Works: _______________

---

### TC-032: Action Buttons - Update Status

**Description**: Verify Update Status button

**Expected Result**:
- Button visible
- Opens status update modal
- Appropriate for current status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button Present: _______________

---

### TC-033: Action Buttons - Update Shipping

**Description**: Verify Update Shipping button

**Expected Result**:
- Button visible
- Opens shipping modal
- For orders ready to ship

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button Present: _______________

---

### TC-034: Action Buttons - Initiate Refund

**Description**: Verify Initiate Refund button

**Expected Result**:
- Button visible for paid orders
- Red styling (warning action)
- Opens refund modal

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Refund Button: _______________

---

## Order Items Section

### TC-035: Order Items Display

**Description**: Verify order items section

**Expected Result**:
- Section header "Order Items (N)"
- List of all items
- Each item has image, name, details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Items Shown: _______________

---

### TC-036: Order Item Details

**Description**: Verify item details display

**Per Item**:
- Product thumbnail
- Product title
- Size (e.g., 18x24 inches)
- SKU
- Unit price
- Quantity
- Line total
- Frame info (if applicable)
- Fulfillment status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Item Details: _______________

---

### TC-037: AI Generated Item Indicator

**Description**: Verify AI item indicator

**Prerequisites**: Order with AI generated item

**Expected Result**:
- AI badge/indicator on item
- Links to AI generation (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- AI Indicator: _______________

---

### TC-038: Fulfillment Status

**Description**: Verify fulfillment status per item

**Expected States**:
- Pending Fulfillment
- Fulfilled (with date)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fulfillment Status: _______________

---

## Customer Information

### TC-039: Customer Section Display

**Description**: Verify customer information section

**Expected Result**:
- Section header "Customer"
- Customer name
- Customer email (clickable)
- Customer phone (if available)
- Account type indicator (guest/registered)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Customer Info: _______________

---

### TC-040: Guest Order Display

**Description**: Verify guest order customer info

**Prerequisites**: Order from guest checkout

**Expected Result**:
- "Guest" indicator
- Guest email shown
- Guest phone shown (if provided)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Guest Display: _______________

---

## Shipping Address

### TC-041: Shipping Address Display

**Description**: Verify shipping address section

**Expected Result**:
- Section header "Shipping Address"
- Full name
- Phone number
- Address line 1
- Address line 2 (if present)
- Landmark (if present)
- City, State, Postal Code
- Country

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Address Display: _______________

---

### TC-042: Address Formatting

**Description**: Verify address formatting

**Expected Result**:
- Proper line breaks
- Postal code formatted
- Country name or code

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Formatting: _______________

---

## Shipping Details

### TC-043: Shipping Details Display

**Description**: Verify shipping details section

**Expected Result**:
- Section header "Shipping Details"
- Carrier name
- Tracking number
- AWB number (if applicable)
- Tracking link (clickable)
- Estimated delivery date

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shipping Details: _______________

---

### TC-044: Tracking Link

**Description**: Verify tracking link works

**Steps**:
1. Click Track link
2. Verify opens carrier website

**Expected Result**:
- Opens in new tab
- Correct tracking URL
- Shows tracking info

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Track Link: _______________

---

### TC-045: Empty Shipping Details

**Description**: Verify when no shipping info yet

**Prerequisites**: Order not yet shipped

**Expected Result**:
- "Not shipped yet" message
- Update Shipping button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty State: _______________

---

## Payment Summary

### TC-046: Payment Summary Display

**Description**: Verify payment summary section

**Expected Result**:
- Section header "Payment Summary"
- Subtotal
- Shipping cost
- Discount (if applicable)
- Tax (GST)
- Total
- All amounts formatted as currency

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Summary Display: _______________

---

### TC-047: Discount Display

**Description**: Verify discount shows correctly

**Prerequisites**: Order with discount applied

**Expected Result**:
- Discount amount shown
- Negative value or strikethrough
- Discount code (if applicable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Discount Shown: _______________

---

### TC-048: Payment Method Display

**Description**: Verify payment method info

**Expected Result**:
- Payment method (Razorpay)
- Payment ID
- Paid at timestamp

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Payment Info: _______________

---

## Timeline

### TC-049: Timeline Section Display

**Description**: Verify order timeline section

**Expected Result**:
- Section header "Timeline"
- Chronological list of events
- Each event has timestamp
- Visual timeline indicator

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Timeline Display: _______________

---

### TC-050: Timeline Events

**Description**: Verify expected timeline events

**Expected Events**:
- Order Created
- Payment Received (if paid)
- Order Confirmed (if confirmed)
- Order Processing (if processing)
- Order Shipped (if shipped)
- Out for Delivery (if applicable)
- Order Delivered (if delivered)
- Order Cancelled (if cancelled)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Events Present: _______________

---

### TC-051: Timeline Event Details

**Description**: Verify event details

**Per Event**:
- Event name
- Timestamp
- Additional info (tracking #, reason, etc.)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Event Details: _______________

---

## Notes Sections

### TC-052: Customer Notes Display

**Description**: Verify customer notes section

**Expected Result**:
- Section header "Customer Notes"
- Customer's order notes shown
- Or "No notes" if empty

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Customer Notes: _______________

---

### TC-053: Internal Notes Display

**Description**: Verify internal notes section

**Expected Result**:
- Section header "Internal Notes"
- Admin notes shown
- Edit button visible
- Can add/update notes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Internal Notes: _______________

---

### TC-054: Edit Internal Notes

**Description**: Verify editing internal notes

**Steps**:
1. Click Edit button
2. Add/modify notes
3. Save

**Expected Result**:
- Notes editable
- Save success message
- Notes updated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Edit Working: _______________

---

## Status Update Modal

### TC-055: Status Modal Opens

**Description**: Verify status update modal

**Steps**:
1. Click "Update Status"
2. Observe modal

**Expected Result**:
- Modal opens
- Current status shown
- Status dropdown
- Reason/notes field
- Cancel and Save buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Modal Opens: _______________

---

### TC-056: Status Dropdown Options

**Description**: Verify available status options

**Expected Transitions**:
- From Pending: Confirmed, Cancelled
- From Confirmed: Processing, Cancelled
- From Processing: Shipped, Cancelled
- From Shipped: Delivered, Cancelled
- From Delivered: No further transitions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Options Correct: _______________

---

### TC-057: Update Status - Success

**Description**: Verify successful status update

**Steps**:
1. Open status modal
2. Select new status
3. Add reason
4. Save

**Expected Result**:
- Success message
- Modal closes
- Status badge updates
- Timeline updated
- Reason added to notes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Update Success: _______________

---

### TC-058: Update Status - Cancel

**Description**: Verify cancel on status modal

**Steps**:
1. Open status modal
2. Click Cancel

**Expected Result**:
- Modal closes
- No changes saved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cancel Works: _______________

---

## Shipping Update Modal

### TC-059: Shipping Modal Opens

**Description**: Verify shipping update modal

**Steps**:
1. Click "Update Shipping"
2. Observe modal

**Expected Result**:
- Modal opens
- Carrier input
- Tracking number input
- AWB input
- Tracking URL input
- Estimated delivery date
- Cancel and Save buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Modal Opens: _______________

---

### TC-060: Shipping Modal - Prefilled Data

**Description**: Verify existing data shown

**Prerequisites**: Order with shipping details

**Expected Result**:
- Existing carrier shown
- Existing tracking shown
- All fields editable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Prefilled: _______________

---

### TC-061: Update Shipping - Success

**Description**: Verify successful shipping update

**Steps**:
1. Open shipping modal
2. Fill/update details
3. Save

**Expected Result**:
- Success message
- Modal closes
- Shipping section updates
- Tracking link works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Update Success: _______________

---

### TC-062: Shipping with Auto Status Update

**Description**: Verify adding shipping changes status

**Prerequisites**: Order in Processing status

**Steps**:
1. Add shipping details
2. Save

**Expected Result**:
- Prompt to change status to Shipped
- Or automatic status change
- Timeline updated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Auto Status: _______________

---

## Refund Processing

### TC-063: Refund Modal Opens

**Description**: Verify refund initiation modal

**Steps**:
1. Click "Initiate Refund"
2. Observe modal

**Expected Result**:
- Modal opens
- Order total shown
- Amount field (optional for partial)
- Reason field (required)
- Warning about action
- Cancel and Confirm buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Modal Opens: _______________

---

### TC-064: Full Refund

**Description**: Verify full refund process

**Steps**:
1. Open refund modal
2. Leave amount as full
3. Enter reason
4. Confirm

**Expected Result**:
- Confirmation dialog
- Processing state
- Success message
- Order status: Refunded
- Payment status: Refunded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Full Refund: _______________

---

### TC-065: Partial Refund

**Description**: Verify partial refund process

**Steps**:
1. Open refund modal
2. Enter partial amount
3. Enter reason
4. Confirm

**Expected Result**:
- Amount validated
- Success message
- Payment status: Partially Refunded
- Refund amount logged

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Partial Refund: _______________

---

### TC-066: Refund - Amount Exceeds Total

**Description**: Verify refund validation

**Steps**:
1. Enter amount greater than order total
2. Try to confirm

**Expected Result**:
- Validation error
- Cannot proceed
- Clear error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation: _______________

---

### TC-067: Refund - Already Refunded

**Description**: Verify cannot double refund

**Prerequisites**: Already refunded order

**Expected Result**:
- Refund button disabled or hidden
- Or error on attempt
- Clear indication order refunded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Prevention: _______________

---

## Error States

### TC-068: Order Not Found

**Description**: Verify 404 for invalid order ID

**URL**: `/admin/orders/invalid-id`

**Expected Result**:
- "Order Not Found" message
- Back to Orders button
- No sensitive data exposed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Not Found: _______________

---

### TC-069: API Error on Load

**Description**: Verify error handling on page load

**Steps**:
1. Simulate API failure
2. Load order detail

**Expected Result**:
- Error message shown
- Retry button
- Back to list option

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Handling: _______________

---

### TC-070: Empty Orders List

**Description**: Verify empty state

**Prerequisites**: No orders in system

**Expected Result**:
- "No orders yet" message
- Helpful illustration
- Stats show zeros

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty State: _______________

---

## Responsive Design

### TC-071: Mobile - Orders List

**Description**: Verify orders list on mobile

**Viewport**: 375x667

**Expected Result**:
- Table converts to cards
- Status badges visible
- Actions accessible
- Filters in collapsible menu

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile List: _______________

---

### TC-072: Mobile - Order Detail

**Description**: Verify order detail on mobile

**Viewport**: 375x667

**Expected Result**:
- All sections visible
- Proper stacking
- Action buttons accessible
- Modals work

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Detail: _______________

---

### TC-073: Mobile - Stats Cards

**Description**: Verify stats on mobile

**Viewport**: 375x667

**Expected Result**:
- Cards stack or scroll
- Numbers readable
- Touch-friendly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Stats: _______________

---

### TC-074: Tablet Layout

**Description**: Verify on tablet

**Viewport**: 768x1024

**Expected Result**:
- Optimal layout
- Table visible
- Two-column detail sections

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tablet: _______________

---

## Accessibility

### TC-075: Keyboard Navigation - List

**Description**: Verify list is keyboard navigable

**Steps**:
1. Tab through list
2. Enter to select
3. Escape to close menus

**Expected Result**:
- All rows reachable
- Action menus keyboard accessible
- Focus visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard List: _______________

---

### TC-076: Keyboard Navigation - Detail

**Description**: Verify detail page keyboard access

**Steps**:
1. Tab through all sections
2. Interact with buttons
3. Navigate modals

**Expected Result**:
- All interactive elements focusable
- Modal focus trap works
- Escape closes modals

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard Detail: _______________

---

### TC-077: Screen Reader Labels

**Description**: Verify screen reader accessibility

**Expected Result**:
- Status badges have labels
- Buttons have names
- Tables have headers
- Modals announced

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Screen Reader: _______________

---

## Performance

### TC-078: List Page Load Time

**Description**: Verify acceptable load time

**Steps**:
1. Measure initial load
2. Measure with filters

**Expected Result**:
- Initial load < 2 seconds
- Filtered results < 1 second

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-079: Detail Page Load Time

**Description**: Verify detail page performance

**Expected Result**:
- Full page load < 2 seconds
- All sections render quickly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Detail Load: _______________

---

### TC-080: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Navigate orders section
2. Perform various actions
3. Check console

**Expected Result**:
- No JS errors
- No unhandled promises
- Clean console

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 80
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Order Statistics
- Total Orders: _______________
- Today: _______________
- Pending: _______________
- Processing: _______________
- Shipped: _______________
- Delivered: _______________
- Cancelled: _______________
- Total Revenue: _______________

### Additional Observations
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Bulk status update
   - Print order/packing slip
   - Email customer from detail page

2. **Features**:
   - Order export (CSV/Excel)
   - Order notes history
   - Shipment tracking integration

3. **Monitoring**:
   - Track average order value
   - Monitor refund rate
   - Alert on unusual cancellations

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
