# Manual Test: Photo Approval Workflow

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-30
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Admin URL**: http://localhost:3001/admin/approvals
- **Customer URL**: http://localhost:3001/approve/:token

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Admin user logged in
- [ ] Test order with AI-generated item exists
- [ ] Order status set to "processing" (triggers approval creation)
- [ ] Production approval record exists in database

## Overview
This document covers manual testing of the chobi.art production photo approval workflow:

**Admin Workflow**:
- Admin approvals dashboard
- Approval list with filtering and stats
- Approval detail view
- Photo upload functionality
- Admin comments/responses
- Customer notification

**Customer Workflow**:
- Public approval page access via token
- Photo gallery with zoom
- Request changes flow
- Approve production flow
- Status tracking

---

# PART 1: ADMIN WORKFLOW

## Admin Approvals Dashboard

### TC-001: Navigate to Approvals Dashboard

**Description**: Verify admin can access the approvals dashboard

**Steps**:
1. Log in as admin user
2. Navigate to http://localhost:3001/admin/approvals

**Expected Result**:
- Page loads without errors
- "Photo Approvals" heading visible
- Stats cards displayed (Pending Upload, Pending Approval, Changes Requested, Approved)
- Approvals list/table visible
- Filter controls available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Approvals Stats Display

**Description**: Verify stats cards show correct counts

**Steps**:
1. Navigate to /admin/approvals
2. Observe stats cards at top of page

**Expected Result**:
- "Pending Upload" shows count of approvals awaiting photos
- "Pending Approval" shows count awaiting customer review
- "Changes Requested" shows count with customer feedback
- "Approved" shows count of completed approvals
- Counts match actual database records

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pending Upload count: ___
- Pending Approval count: ___
- Changes Requested count: ___
- Approved count: ___

---

### TC-003: Approvals List Display

**Description**: Verify approval cards display correct information

**Steps**:
1. Navigate to /admin/approvals
2. Observe approval cards/rows

**Expected Result**:
- Order number displayed
- Customer name/email visible
- Item title from snapshot visible
- Status badge with correct color
- Deadline information shown
- Created date visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Filter Approvals by Status

**Description**: Verify status filter works correctly

**Steps**:
1. Navigate to /admin/approvals
2. Click on status filter dropdown
3. Select "Pending Approval"
4. Observe filtered results

**Expected Result**:
- Only approvals with "pending_approval" status shown
- Stats may update or remain global
- Clear filter option available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Search Approvals

**Description**: Verify search functionality

**Steps**:
1. Navigate to /admin/approvals
2. Enter order number in search field
3. Observe filtered results

**Expected Result**:
- Results filtered by search term
- Matches on order number
- Clear search option available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Approval Detail Page

### TC-006: Navigate to Approval Detail

**Description**: Verify navigation to approval detail page

**Steps**:
1. Navigate to /admin/approvals
2. Click on an approval card/row

**Expected Result**:
- Navigates to /admin/approvals/:id
- Page loads without errors
- Back button visible
- Order information displayed
- Customer information displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Approval Detail - Status Display

**Description**: Verify status badge and deadline display

**Steps**:
1. Navigate to approval detail page
2. Observe status section

**Expected Result**:
- Status badge shows current status with correct color
- Deadline countdown displayed (X days/hours remaining)
- Status-specific actions/messages shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Deadline: _______________

---

### TC-008: Photo Upload Section (Pending Upload State)

**Description**: Verify photo upload UI for pending_upload status

**Steps**:
1. Navigate to approval in "pending_upload" status
2. Locate photo upload section

**Expected Result**:
- Upload section visible
- URL input fields or file upload available
- "Notify customer" checkbox/toggle present
- Upload/Submit button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Upload Production Photos

**Description**: Verify photo upload functionality

**Steps**:
1. Navigate to approval in "pending_upload" status
2. Enter photo URLs or upload files
3. Check "Notify customer" option
4. Click Upload/Submit button

**Expected Result**:
- Photos uploaded successfully
- Success message displayed
- Status changes to "pending_approval"
- Photos displayed in gallery
- Customer notification sent (if checked)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: View Uploaded Photos

**Description**: Verify photo gallery display

**Steps**:
1. Navigate to approval with photos
2. Observe photo section

**Expected Result**:
- Photo thumbnails displayed
- Photos clickable for larger view
- Photo count shown
- Delete option available for admin

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Photo count: ___
- Notes: _______________

---

### TC-011: Delete Photos

**Description**: Verify admin can delete photos

**Steps**:
1. Navigate to approval with photos
2. Click delete photos button
3. Confirm deletion

**Expected Result**:
- Confirmation dialog shown
- Photos removed after confirmation
- Status may revert to "pending_upload"
- Success message displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: View Comments Timeline

**Description**: Verify comments display correctly

**Steps**:
1. Navigate to approval with comments
2. Observe comments section

**Expected Result**:
- Comments displayed in chronological order
- Admin comments styled distinctly
- Customer comments styled distinctly
- Timestamps shown
- Author type (chobi.art Team / Customer) indicated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Add Admin Comment

**Description**: Verify admin can add comments

**Steps**:
1. Navigate to approval detail
2. Find comment input field
3. Enter comment text
4. Click Send/Submit button

**Expected Result**:
- Comment added to timeline
- Comment shows as "chobi.art Team" / "Admin"
- Timestamp shown
- Input cleared after submission

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Copy Approval Link

**Description**: Verify copy approval link functionality

**Steps**:
1. Navigate to approval detail
2. Click "Copy Link" button

**Expected Result**:
- Link copied to clipboard
- Visual feedback (button text change, toast, etc.)
- Link format: /approve/:token

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Link: _______________

---

### TC-015: Navigate to Related Order

**Description**: Verify link to order detail

**Steps**:
1. Navigate to approval detail
2. Click order number or "View Order" link

**Expected Result**:
- Navigates to /admin/orders/:orderId
- Order detail page loads
- Approval badge visible on order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

# PART 2: CUSTOMER WORKFLOW

## Customer Approval Page Access

### TC-016: Access Approval Page via Token

**Description**: Verify customer can access approval page

**Steps**:
1. Obtain approval token (from email or admin page)
2. Navigate to http://localhost:3001/approve/:token

**Expected Result**:
- Page loads without errors
- "Production Photo Review" heading visible
- Order number displayed
- Item information shown
- Status badge visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Invalid Token Handling

**Description**: Verify error handling for invalid tokens

**Steps**:
1. Navigate to /approve/invalid-token-123

**Expected Result**:
- Error message displayed
- "Approval not found" or similar message
- Retry button available
- No sensitive information leaked

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error message: _______________

---

### TC-018: Expired Token Handling

**Description**: Verify handling of expired approval links

**Steps**:
1. Navigate to approval with expired token

**Expected Result**:
- Error message about expiration
- Clear explanation to customer
- Contact information or next steps provided

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Customer Photo Review

### TC-019: View Production Photos

**Description**: Verify photo display on customer page

**Steps**:
1. Navigate to approval in "pending_approval" status
2. Observe photo section

**Expected Result**:
- All production photos displayed
- Photos in grid layout
- Thumbnail size appropriate
- Photos clickable for full view

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Photo count: ___

---

### TC-020: Full-Screen Photo Gallery

**Description**: Verify full-screen gallery functionality

**Steps**:
1. Navigate to approval with photos
2. Click on a photo
3. Observe full-screen gallery

**Expected Result**:
- Gallery opens in full-screen overlay
- Photo displayed at high resolution
- Navigation arrows visible (if multiple photos)
- Close button (X) visible
- Photo counter shown (1/3, etc.)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Gallery Zoom Controls

**Description**: Verify zoom functionality in gallery

**Steps**:
1. Open full-screen gallery
2. Use zoom controls (+ / -)
3. Try dragging zoomed image

**Expected Result**:
- Zoom in increases image size (up to 400%)
- Zoom out decreases (min 100%)
- Current zoom percentage displayed
- Zoomed image can be panned/dragged
- Double-tap on mobile works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Max zoom reached: ___%
- Notes: _______________

---

### TC-022: Gallery Keyboard Navigation

**Description**: Verify keyboard controls in gallery

**Steps**:
1. Open full-screen gallery
2. Press Arrow Left/Right keys
3. Press +/- keys
4. Press Escape key

**Expected Result**:
- Arrow keys navigate between photos
- +/- keys control zoom
- Escape closes gallery

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-023: Gallery Navigation Arrows

**Description**: Verify arrow button navigation

**Steps**:
1. Open gallery on first photo
2. Click right arrow
3. Click left arrow

**Expected Result**:
- Right arrow advances to next photo
- Left arrow goes to previous photo
- Arrows disabled at start/end
- Photo counter updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Customer Actions

### TC-024: Request Changes - Open Form

**Description**: Verify change request form opens

**Steps**:
1. Navigate to approval in "pending_approval" status
2. Click "Request Changes" button

**Expected Result**:
- Comment form appears
- Text area visible with placeholder
- Submit and Cancel buttons visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Request Changes - Submit

**Description**: Verify change request submission

**Steps**:
1. Open change request form
2. Enter description of requested changes
3. Click Submit button

**Expected Result**:
- Success message displayed
- Comment added to timeline
- Status changes to "changes_requested"
- Form closes
- Action buttons update

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-026: Request Changes - Validation

**Description**: Verify empty comment validation

**Steps**:
1. Open change request form
2. Leave comment empty
3. Observe Submit button

**Expected Result**:
- Submit button disabled when empty
- Enabled once text entered

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Request Changes - Cancel

**Description**: Verify form can be cancelled

**Steps**:
1. Open change request form
2. Enter some text
3. Click Cancel button

**Expected Result**:
- Form closes
- Text not submitted
- Original action buttons visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Approve Production

**Description**: Verify approval submission

**Steps**:
1. Navigate to approval in "pending_approval" status
2. Click "Approve & Ship" button
3. Confirm in dialog

**Expected Result**:
- Confirmation dialog appears
- After confirm: Success message displayed
- Status changes to "approved"
- Approval date shown
- Action buttons hidden
- Thank you message visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-029: Approve - Cancel Confirmation

**Description**: Verify approval can be cancelled

**Steps**:
1. Click "Approve & Ship" button
2. Cancel in confirmation dialog

**Expected Result**:
- Dialog closes
- No status change
- Action buttons still visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Customer Status States

### TC-030: Pending Upload State

**Description**: Verify display when photos not yet uploaded

**Steps**:
1. Navigate to approval in "pending_upload" status

**Expected Result**:
- "Awaiting Photos" or similar status badge
- Message explaining photos not ready
- No action buttons shown
- No photo gallery section

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Changes Requested State

**Description**: Verify display after customer requests changes

**Steps**:
1. Navigate to approval in "changes_requested" status

**Expected Result**:
- "Changes Requested" status badge
- Conversation timeline visible
- Customer's change request shown
- Admin response (if any) shown
- Action buttons visible for re-review

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Approved State

**Description**: Verify display after approval

**Steps**:
1. Navigate to approval in "approved" status

**Expected Result**:
- "Approved" status badge (green)
- Confirmation message displayed
- Approval date shown
- Photos still viewable
- No action buttons
- "Proceeding to shipping" message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Expired State

**Description**: Verify display when deadline passed

**Steps**:
1. Navigate to approval in "expired" status

**Expected Result**:
- "Expired" status badge (red)
- Explanation message
- Photos still viewable
- No action buttons
- Note about order proceeding

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Deadline Display

**Description**: Verify deadline countdown

**Steps**:
1. Navigate to approval with upcoming deadline
2. Observe deadline indicator

**Expected Result**:
- Deadline countdown shown
- Days remaining for > 24 hours
- Hours remaining for < 24 hours
- Urgent styling for < 24 hours

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Deadline text: _______________

---

## Customer Comments

### TC-035: View Conversation History

**Description**: Verify comments timeline display

**Steps**:
1. Navigate to approval with comments
2. Observe conversation section

**Expected Result**:
- "Conversation" heading visible
- All comments displayed
- Admin comments styled (blue background)
- Customer comments styled differently
- Timestamps shown
- Chronological order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

# PART 3: INTEGRATION TESTS

## Order Integration

### TC-036: Approval Creation on Order Processing

**Description**: Verify approvals created when order moves to processing

**Steps**:
1. Create order with AI-generated item
2. Complete payment
3. Admin updates status to "processing"
4. Check admin approvals list

**Expected Result**:
- Approval record created automatically
- Linked to correct order and item
- Status is "pending_upload"
- Deadline set (default 7 days)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Approval Badge on Order Detail

**Description**: Verify approval status shown on admin order detail

**Steps**:
1. Navigate to /admin/orders/:id for order with approval
2. Observe approval section

**Expected Result**:
- Approval status badge visible
- Link to approval management
- Progress indicator (X/Y approved)
- Correct status color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Customer Order Detail Shows Approval

**Description**: Verify customer can see approval status in their order

**Steps**:
1. Log in as customer
2. Navigate to /account/orders/:id
3. Observe approval section

**Expected Result**:
- "Production Approval" section visible
- Current status displayed
- Deadline shown if pending
- Link to review photos
- Progress indicator

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Email Notifications

### TC-039: Photo Upload Notification

**Description**: Verify email sent when photos uploaded

**Steps**:
1. Admin uploads photos with "Notify customer" checked
2. Check email (or email logs)

**Expected Result**:
- Email sent to customer
- Subject references approval
- Contains approval link
- Shows order info
- Photo preview or count

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email received: [ ] Yes / [ ] No
- Notes: _______________

---

### TC-040: Approval Confirmation Email

**Description**: Verify email sent when customer approves

**Steps**:
1. Customer approves production
2. Check email (or email logs)

**Expected Result**:
- Confirmation email sent
- Thanks customer for approval
- Notes order proceeding to shipping
- Contains order info

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email received: [ ] Yes / [ ] No
- Notes: _______________

---

# PART 4: MOBILE RESPONSIVENESS

### TC-041: Admin Dashboard Mobile View

**Description**: Verify admin approvals page on mobile

**Steps**:
1. Open /admin/approvals in mobile viewport (375x667)
2. Test all functionality

**Expected Result**:
- Stats cards stack vertically
- Approval list scrollable
- All text readable
- Filters accessible
- No horizontal overflow

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-042: Admin Detail Mobile View

**Description**: Verify admin approval detail on mobile

**Steps**:
1. Open approval detail in mobile viewport
2. Test all sections

**Expected Result**:
- All sections visible
- Photo upload section works
- Comments readable
- Buttons full-width
- Forms usable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-043: Customer Page Mobile View

**Description**: Verify customer approval page on mobile

**Steps**:
1. Open /approve/:token in mobile viewport
2. Test all functionality

**Expected Result**:
- Header stacks properly
- Photos in 2-column grid
- Action buttons prominent
- Gallery works with touch
- Forms usable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-044: Gallery Touch Controls

**Description**: Verify gallery works with touch

**Steps**:
1. Open gallery on mobile device
2. Swipe left/right
3. Pinch to zoom
4. Drag zoomed image

**Expected Result**:
- Swipe navigates photos
- Pinch zoom works
- Panning works when zoomed
- Double-tap to zoom
- Tap X to close

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Test Summary

| Category | Total | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| Admin Dashboard | 5 | | | |
| Admin Detail | 10 | | | |
| Customer Access | 3 | | | |
| Customer Photo Review | 5 | | | |
| Customer Actions | 6 | | | |
| Customer States | 6 | | | |
| Customer Comments | 1 | | | |
| Integration | 3 | | | |
| Email Notifications | 2 | | | |
| Mobile | 4 | | | |
| **TOTAL** | **44** | | | |

## Notes

### Known Issues
(Document any known issues discovered during testing)

### Recommendations
(Document any UX improvements or suggestions)

### Environment Issues
(Document any environment-specific problems encountered)
