# Manual Test: AI Content Moderation

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080)
- **Date**: 2026-02-17
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Frontend URL**: http://localhost:3001
- **API URL**: http://localhost:3000

## Prerequisites
- [ ] Dev server running at http://localhost:3001 (Web) and http://localhost:3000 (API)
- [ ] Database migrations applied (`bun run db:migrate` — not `db:push`, which skips the audit-log trigger, #663)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Admin user account created
- [ ] Customer user account created
- [ ] AI generations seeded in database with various moderation statuses
- [ ] Email service configured (Resend) for notification testing

## Overview
This document covers manual testing of AI Content Moderation:
- Admin moderation dashboard (`/admin/ai-moderation`)
- User AI creations page (`/account/ai-creations`) with moderation status
- Email notifications for approve/reject actions
- Cart and gallery access gates based on moderation status
- Sidebar navigation

---

## Admin Moderation Dashboard - Access Control

### TC-001: Admin Can Access Moderation Page

**Description**: Verify admin user can access the AI moderation dashboard

**URL**: `/admin/ai-moderation`

**Steps**:
1. Login as admin user
2. Navigate to `/admin/ai-moderation`

**Expected Result**:
- Page loads successfully
- Page title: "AI Moderation"
- Generation grid or empty state visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page Loaded: _______________

---

### TC-002: Non-Admin Denied Access

**Description**: Verify non-admin users cannot access the moderation page

**Steps**:
1. Login as customer user
2. Navigate to `/admin/ai-moderation`

**Expected Result**:
- Redirected to login page OR
- "Access Denied" message displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Behavior: _______________

---

### TC-003: Unauthenticated User Redirected

**Description**: Verify unauthenticated users are redirected to login

**Steps**:
1. Clear browser session/cookies
2. Navigate directly to `/admin/ai-moderation`

**Expected Result**:
- Redirected to `/auth/login`
- Return URL preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect URL: _______________

---

## Admin Moderation Dashboard - Page Structure

### TC-004: Page Title and Header

**Description**: Verify page header elements

**Expected Result**:
- Page title: "AI Moderation"
- Refresh button visible
- Header styling consistent with admin panel

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title Displayed: _______________

---

### TC-005: Document Meta Tags

**Description**: Verify HTML title and robots meta

**Expected Result**:
- Title: "AI Moderation - Admin - chobii.art" (or similar)
- Meta robots: "noindex, nofollow"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- HTML Title: _______________

---

## Stats Cards

### TC-006: Pending Review Stat Card

**Description**: Verify Pending Review stat card display

**Expected Result**:
- Card displays "Pending Review" label
- Shows count of generations awaiting review
- Number formatted correctly
- Card is clickable (filters to pending)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pending Count: _______________

---

### TC-007: Approved Stat Card

**Description**: Verify Approved stat card display

**Expected Result**:
- Card displays "Approved" label
- Shows count of approved generations
- Green styling/indicator
- Card is clickable (filters to approved)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Approved Count: _______________

---

### TC-008: Rejected Stat Card

**Description**: Verify Rejected stat card display

**Expected Result**:
- Card displays "Rejected" label
- Shows count of rejected generations
- Red styling/indicator
- Card is clickable (filters to rejected)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rejected Count: _______________

---

### TC-009: Flagged Stat Card

**Description**: Verify Flagged stat card display

**Expected Result**:
- Card displays "Flagged" label
- Shows count of flagged generations
- Orange/warning styling
- Card is clickable (filters to flagged)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Flagged Count: _______________

---

### TC-010: Stats Total Equals Sum

**Description**: Verify total generations matches sum of all statuses

**Steps**:
1. Note count from each stat card
2. Sum all counts

**Expected Result**:
- Total (if displayed) matches sum of:
  pending_review + approved + rejected + flagged

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Matches: _______________

---

## Filter Controls

### TC-011: Status Filter Dropdown

**Description**: Verify status filter dropdown presence

**Expected Result**:
- Dropdown/select visible
- Options include: All, Pending Review, Approved, Rejected, Flagged

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Present: _______________

---

### TC-012: Filter by Pending Review

**Description**: Verify filtering by pending review status

**Steps**:
1. Select "Pending Review" from filter
2. Observe grid results

**Expected Result**:
- Only pending_review generations shown
- URL updated with status param
- Grid refreshes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filtered Correctly: _______________

---

### TC-013: Filter by Approved

**Description**: Verify filtering by approved status

**Steps**:
1. Select "Approved" from filter
2. Observe grid results

**Expected Result**:
- Only approved generations shown
- URL updated: `?status=approved`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filtered Correctly: _______________

---

### TC-014: Filter by Rejected

**Description**: Verify filtering by rejected status

**Steps**:
1. Select "Rejected" from filter
2. Observe grid results

**Expected Result**:
- Only rejected generations shown
- URL updated: `?status=rejected`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filtered Correctly: _______________

---

### TC-015: Search by Prompt Text

**Description**: Verify search functionality

**Steps**:
1. Enter text in search input
2. Submit or wait for debounce

**Expected Result**:
- Generations filtered by prompt text
- Partial match supported
- URL updated with search param

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search Works: _______________

---

### TC-016: Clear Filters

**Description**: Verify clearing all filters

**Steps**:
1. Apply a status filter
2. Enter search text
3. Click "Clear" or reset to "All"

**Expected Result**:
- All generations shown
- URL params cleared
- Filter controls reset

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Clear Works: _______________

---

## Generations Grid

### TC-017: Grid Display with Data

**Description**: Verify generation cards display correctly

**Prerequisites**: At least one AI generation exists

**Expected Result**:
- Grid of generation cards visible
- Each card shows:
  - Generated image thumbnail
  - Prompt text (truncated if long)
  - Style preset
  - Status badge
  - Creation date
  - Action buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Grid Displayed: _______________

---

### TC-018: Empty State Display

**Description**: Verify empty state when no generations

**Prerequisites**: No generations match current filter

**Expected Result**:
- "No generations found" message
- Or helpful empty state illustration
- Clear call-to-action or hint

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty State: _______________

---

### TC-019: Status Badge Colors

**Description**: Verify status badge colors on cards

**Expected Colors**:
- Pending Review: Amber/Yellow
- Approved: Green
- Rejected: Red
- Flagged: Orange

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Colors Correct: _______________

---

### TC-020: Generation Card Information

**Description**: Verify all required info on generation card

**Per Card Expected**:
- Image thumbnail (clickable for preview)
- Prompt text
- Style preset label
- Status badge
- Created date
- User name/email
- Action buttons (Approve/Reject)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Info Complete: _______________

---

## Action Buttons

### TC-021: Approve Button Visible

**Description**: Verify Approve button on pending/flagged cards

**Prerequisites**: Generation with pending_review or flagged status

**Expected Result**:
- Green "Approve" button visible
- Button enabled
- Clear icon (checkmark)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button Visible: _______________

---

### TC-022: Approve Action - Success

**Description**: Verify approve action works

**Steps**:
1. Click "Approve" on a pending generation
2. Observe result

**Expected Result**:
- Success toast notification
- Card status updates to "Approved"
- Stats cards refresh
- No page reload required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Approve Works: _______________

---

### TC-023: Reject Button Visible

**Description**: Verify Reject button on pending/flagged cards

**Prerequisites**: Generation with pending_review or flagged status

**Expected Result**:
- Red "Reject" button visible
- Button enabled
- Clear icon (X or reject icon)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button Visible: _______________

---

### TC-024: Reject Action - Modal Opens

**Description**: Verify reject modal opens

**Steps**:
1. Click "Reject" on a pending generation
2. Observe modal

**Expected Result**:
- Modal opens
- Category dropdown visible
- Reason text field visible
- Cancel and Confirm buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Modal Opens: _______________

---

### TC-025: Rejection Categories

**Description**: Verify rejection category options

**Expected Categories**:
- NSFW / Adult Content
- Violence
- Copyright / Trademark
- Hate Speech
- Spam / Low Quality
- Other

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Categories Present: _______________

---

### TC-026: Reject Action - Requires Fields

**Description**: Verify reject requires category and reason

**Steps**:
1. Open reject modal
2. Try to confirm without filling fields

**Expected Result**:
- Validation error shown
- Category required
- Reason required (min characters)
- Cannot submit without both

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation Works: _______________

---

### TC-027: Reject Action - Success

**Description**: Verify reject action completes

**Steps**:
1. Open reject modal
2. Select category
3. Enter reason text
4. Click Confirm

**Expected Result**:
- Modal closes
- Success toast notification
- Card status updates to "Rejected"
- Stats cards refresh

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Reject Works: _______________

---

### TC-028: Reject Action - Cancel

**Description**: Verify cancel on reject modal

**Steps**:
1. Open reject modal
2. Click Cancel

**Expected Result**:
- Modal closes
- No changes made
- Generation status unchanged

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cancel Works: _______________

---

## Bulk Actions

### TC-029: Checkbox Selection

**Description**: Verify individual card selection

**Steps**:
1. Click checkbox on a generation card
2. Observe selection state

**Expected Result**:
- Checkbox becomes checked
- Card visually highlighted
- Selection count updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Selection Works: _______________

---

### TC-030: Select All Checkbox

**Description**: Verify select all functionality

**Steps**:
1. Click "Select All" checkbox
2. Observe all cards

**Expected Result**:
- All visible cards selected
- Count shows total selected
- Bulk action bar appears

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Select All Works: _______________

---

### TC-031: Bulk Action Bar Display

**Description**: Verify bulk action bar appears

**Prerequisites**: At least one card selected

**Expected Result**:
- Action bar visible (fixed or floating)
- Shows "X selected" count
- "Approve All" button
- "Reject All" button
- Clear selection option

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Bar Visible: _______________

---

### TC-032: Bulk Approve

**Description**: Verify bulk approve action

**Steps**:
1. Select multiple pending generations
2. Click "Approve All"
3. Confirm if prompted

**Expected Result**:
- All selected items approved
- Success message with count
- Stats refresh
- Selection cleared

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Bulk Approve: _______________

---

### TC-033: Bulk Reject

**Description**: Verify bulk reject action

**Steps**:
1. Select multiple pending generations
2. Click "Reject All"
3. Fill rejection modal (single reason for all)
4. Confirm

**Expected Result**:
- All selected items rejected
- Same reason applied to all
- Success message with count
- Selection cleared

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Bulk Reject: _______________

---

## Image Preview Modal

### TC-034: Preview Modal Opens

**Description**: Verify image preview functionality

**Steps**:
1. Click on generation thumbnail
2. Observe modal

**Expected Result**:
- Modal opens with full-size image
- Image loads properly
- Close button visible
- Escape key closes modal

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Preview Works: _______________

---

### TC-035: Preview Shows Details

**Description**: Verify preview modal shows generation details

**Expected Details**:
- Full prompt text
- Style preset
- Creation date
- User who created it
- Current moderation status
- Action buttons (if still actionable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Details Shown: _______________

---

## Pagination

### TC-036: Pagination Display

**Description**: Verify pagination controls

**Prerequisites**: More than one page of generations

**Expected Result**:
- Page numbers visible
- Previous/Next buttons
- Current page highlighted
- Total count shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pagination Visible: _______________

---

### TC-037: Navigate Pages

**Description**: Verify page navigation works

**Steps**:
1. Click page 2
2. Click Next
3. Click Previous

**Expected Result**:
- Grid content updates
- URL updates with page param
- Scroll to top (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation Works: _______________

---

## Sidebar Navigation

### TC-038: AI Moderation Link in Sidebar

**Description**: Verify navigation link exists

**Steps**:
1. Login as admin
2. Navigate to any admin page
3. Observe sidebar

**Expected Result**:
- "AI Moderation" link visible
- Shield/moderation icon displayed
- Positioned appropriately in nav

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Link Visible: _______________

---

### TC-039: Sidebar Link Active State

**Description**: Verify active state when on moderation page

**Steps**:
1. Navigate to `/admin/ai-moderation`
2. Observe sidebar

**Expected Result**:
- AI Moderation link highlighted
- Active styling applied
- Distinguishable from other links

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Active State: _______________

---

### TC-040: Sidebar Link Navigation

**Description**: Verify sidebar link navigates correctly

**Steps**:
1. Be on different admin page
2. Click "AI Moderation" in sidebar

**Expected Result**:
- Navigates to `/admin/ai-moderation`
- Page loads correctly
- No console errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation Works: _______________

---

## User AI Creations Page - Moderation Status

### TC-041: Moderation Status Badge Display

**Description**: Verify status badge on user's creations

**URL**: `/account/ai-creations`

**Steps**:
1. Login as customer with AI generations
2. Navigate to `/account/ai-creations`

**Expected Result**:
- Each creation shows moderation status badge
- Badge color matches status
- Badge icon appropriate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badges Displayed: _______________

---

### TC-042: Pending Review Badge

**Description**: Verify pending review badge appearance

**Expected Result**:
- Label: "Pending Review"
- Color: Amber/Yellow
- Shield icon
- Visible on pending creations

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Correct: _______________

---

### TC-043: Approved Badge

**Description**: Verify approved badge appearance

**Expected Result**:
- Label: "Approved"
- Color: Green
- Checkmark/shield check icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Correct: _______________

---

### TC-044: Rejected Badge

**Description**: Verify rejected badge appearance

**Expected Result**:
- Label: "Rejected"
- Color: Red
- X/shield X icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Correct: _______________

---

### TC-045: Flagged Badge

**Description**: Verify flagged badge appearance

**Expected Result**:
- Label: "Under Review"
- Color: Orange
- Alert/warning icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Correct: _______________

---

## User AI Creations - Add to Cart Gate

### TC-046: Add to Cart - Approved Generation

**Description**: Verify approved creation can be added to cart

**Prerequisites**: Customer has approved AI generation

**Steps**:
1. Find approved creation
2. Click "Add to Cart"

**Expected Result**:
- Button enabled and clickable
- Opens frame/size selection
- Can proceed to add to cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Add to Cart Works: _______________

---

### TC-047: Add to Cart - Pending Generation

**Description**: Verify pending creation cannot be added to cart

**Prerequisites**: Customer has pending_review AI generation

**Steps**:
1. Find pending creation
2. Observe Add to Cart button

**Expected Result**:
- Button disabled OR
- Shows "Pending Approval" text instead
- Cannot proceed to cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart Blocked: _______________

---

### TC-048: Add to Cart - Rejected Generation

**Description**: Verify rejected creation cannot be added to cart

**Prerequisites**: Customer has rejected AI generation

**Steps**:
1. Find rejected creation
2. Observe Add to Cart area

**Expected Result**:
- Button disabled or hidden
- Clear indication not purchasable
- Rejection reason visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart Blocked: _______________

---

### TC-049: Add to Cart - Flagged Generation

**Description**: Verify flagged creation cannot be added to cart

**Prerequisites**: Customer has flagged AI generation

**Steps**:
1. Find flagged creation
2. Observe Add to Cart button

**Expected Result**:
- Button disabled
- Shows "Under Review" indication
- Cannot proceed to cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart Blocked: _______________

---

## User AI Creations - Rejection Display

### TC-050: Rejection Reason Display

**Description**: Verify rejection reason shown to user

**Prerequisites**: Customer has rejected AI generation

**Expected Result**:
- Red warning box/banner visible
- Rejection reason text shown
- Rejection category indicated
- Helpful message about guidelines

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Reason Displayed: _______________

---

### TC-051: Rejection Category Display

**Description**: Verify rejection category shown

**Expected Result**:
- Category label visible
- Human-readable category name
- Consistent with admin selection

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Category Shown: _______________

---

## User AI Creations - Moderation Filter

### TC-052: Moderation Filter Dropdown

**Description**: Verify moderation filter on user page

**Expected Result**:
- Filter dropdown visible
- Options: All, Pending Review, Approved, Rejected

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Present: _______________

---

### TC-053: Filter by Pending

**Description**: Verify user can filter by pending status

**Steps**:
1. Select "Pending Review" from filter
2. Observe results

**Expected Result**:
- Only pending creations shown
- URL updated
- Count accurate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Works: _______________

---

### TC-054: Filter by Approved

**Description**: Verify user can filter by approved status

**Steps**:
1. Select "Approved" from filter
2. Observe results

**Expected Result**:
- Only approved creations shown
- All have Add to Cart enabled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Works: _______________

---

### TC-055: Filter by Rejected

**Description**: Verify user can filter by rejected status

**Steps**:
1. Select "Rejected" from filter
2. Observe results

**Expected Result**:
- Only rejected creations shown
- All show rejection reason

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Works: _______________

---

## Email Notifications

### TC-056: Approved Email Sent

**Description**: Verify email sent on approval

**Prerequisites**:
- Email service configured
- Customer has valid email

**Steps**:
1. Admin approves a generation
2. Check customer's email

**Expected Result**:
- Email received within minutes
- Subject mentions approval
- From: chobii.art or noreply@

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email Received: _______________

---

### TC-057: Approved Email Content

**Description**: Verify approved email content

**Expected Content**:
- Personalized greeting (user name)
- Creation details (prompt, style)
- Generated image thumbnail
- "Add to Cart" call-to-action link
- chobii.art branding

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Content Correct: _______________

---

### TC-058: Approved Email Link Works

**Description**: Verify CTA link in approved email

**Steps**:
1. Open approved email
2. Click "Add to Cart" or similar link

**Expected Result**:
- Navigates to AI creations page
- Or directly to cart with item
- User can proceed with purchase

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Link Works: _______________

---

### TC-059: Rejected Email Sent

**Description**: Verify email sent on rejection

**Steps**:
1. Admin rejects a generation
2. Check customer's email

**Expected Result**:
- Email received within minutes
- Subject mentions rejection/review
- Professional tone

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email Received: _______________

---

### TC-060: Rejected Email Content

**Description**: Verify rejected email content

**Expected Content**:
- Personalized greeting
- Creation details (prompt)
- Rejection reason
- Rejection category
- Link to guidelines
- Option to create new

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Content Correct: _______________

---

### TC-061: Rejected Email - No Harsh Language

**Description**: Verify rejection email is professional

**Expected Result**:
- Polite and professional tone
- Does not use accusatory language
- Explains why content doesn't meet guidelines
- Encourages trying again

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tone Appropriate: _______________

---

## Gallery Gate (If Applicable)

### TC-062: Share to Gallery - Approved Only

**Description**: Verify only approved generations can be shared

**Prerequisites**: Gallery/public sharing feature exists

**Steps**:
1. Find approved creation
2. Click "Share to Gallery"

**Expected Result**:
- Share option enabled for approved
- Can successfully share

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Share Works: _______________

---

### TC-063: Share to Gallery - Pending Blocked

**Description**: Verify pending cannot be shared

**Steps**:
1. Find pending creation
2. Look for share option

**Expected Result**:
- Share button disabled/hidden
- Or shows "Pending Approval" message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Share Blocked: _______________

---

### TC-064: Share to Gallery - Rejected Blocked

**Description**: Verify rejected cannot be shared

**Steps**:
1. Find rejected creation
2. Look for share option

**Expected Result**:
- Share button disabled/hidden
- Cannot share rejected content

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Share Blocked: _______________

---

## Responsive Design

### TC-065: Admin Dashboard - Mobile

**Description**: Verify admin moderation on mobile

**Viewport**: 375x667

**Expected Result**:
- Stats cards stack or scroll horizontally
- Grid becomes single column
- Action buttons accessible
- Filters in collapsible menu

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Layout: _______________

---

### TC-066: Admin Dashboard - Tablet

**Description**: Verify admin moderation on tablet

**Viewport**: 768x1024

**Expected Result**:
- 2-column grid layout
- Stats cards visible
- Sidebar collapses appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tablet Layout: _______________

---

### TC-067: User Creations - Mobile

**Description**: Verify user AI creations on mobile

**Viewport**: 375x667

**Expected Result**:
- Cards stack vertically
- Status badges readable
- Rejection reason visible
- Filter accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Layout: _______________

---

### TC-068: Modals - Mobile

**Description**: Verify modals work on mobile

**Viewport**: 375x667

**Steps**:
1. Open reject modal on mobile
2. Fill fields
3. Submit

**Expected Result**:
- Modal fits screen
- Fields usable
- Can scroll if needed
- Submit works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Modals Work: _______________

---

## Accessibility

### TC-069: Keyboard Navigation - Admin Grid

**Description**: Verify keyboard navigation works

**Steps**:
1. Tab through generation cards
2. Enter to activate
3. Arrow keys in modal

**Expected Result**:
- All cards focusable
- Focus visible
- Actions keyboard accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard Works: _______________

---

### TC-070: Screen Reader - Status Badges

**Description**: Verify status badges have labels

**Expected Result**:
- Badges have aria-label
- Status announced
- Icons have alt text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Labels Present: _______________

---

### TC-071: Screen Reader - Action Buttons

**Description**: Verify action buttons accessible

**Expected Result**:
- Approve/Reject buttons labeled
- Modal announced
- Form fields labeled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Actions Accessible: _______________

---

## Performance

### TC-072: Admin Page Load Time

**Description**: Verify acceptable load time

**Steps**:
1. Navigate to `/admin/ai-moderation`
2. Measure time to interactive

**Expected Result**:
- Initial load < 3 seconds
- Grid renders quickly
- No layout shifts

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-073: Filter Response Time

**Description**: Verify filter performance

**Steps**:
1. Apply status filter
2. Measure response

**Expected Result**:
- Filter results < 1 second
- Loading indicator if delayed
- Smooth transition

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Speed: _______________

---

### TC-074: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open browser console
2. Navigate through moderation features
3. Perform various actions

**Expected Result**:
- No JS errors
- No unhandled promises
- Clean console

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Error States

### TC-075: API Error on Load

**Description**: Verify error handling on page load failure

**Steps**:
1. Simulate API failure (disconnect network)
2. Load admin moderation page

**Expected Result**:
- Error message displayed
- Retry button available
- No crash

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Handled: _______________

---

### TC-076: Action Error Handling

**Description**: Verify error on failed approve/reject

**Steps**:
1. Simulate action failure
2. Try to approve generation

**Expected Result**:
- Error toast shown
- Generation unchanged
- Can retry

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Handled: _______________

---

### TC-077: Email Failure Handling

**Description**: Verify action succeeds even if email fails

**Expected Result**:
- Approve/reject still works
- Status updated
- Email failure logged (not shown to admin)
- No blocking on email

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Action Proceeds: _______________

---

## Edge Cases

### TC-078: Very Long Prompt Text

**Description**: Verify handling of long prompts

**Prerequisites**: Generation with 500+ character prompt

**Expected Result**:
- Prompt truncated in grid
- Full prompt in preview
- No layout breaking

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Long Prompt Handled: _______________

---

### TC-079: Missing Image

**Description**: Verify handling when image fails to load

**Expected Result**:
- Placeholder shown
- Card still functional
- Can still approve/reject

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fallback Works: _______________

---

### TC-080: Concurrent Moderation

**Description**: Verify handling when two admins review same item

**Steps**:
1. Admin A opens item
2. Admin B approves item
3. Admin A tries to reject

**Expected Result**:
- Error or info message
- Status shows updated state
- No double-action

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Concurrency Handled: _______________

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

### Moderation Statistics
- Total Generations: _______________
- Pending Review: _______________
- Approved: _______________
- Rejected: _______________
- Flagged: _______________

### Email Testing Notes
- Email Provider: Resend
- Test Email Used: _______________
- Delivery Time: _______________

### Additional Observations
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Keyboard shortcuts for approve/reject
   - Batch reason template for common rejections
   - Quick filters for today's submissions

2. **Features**:
   - Moderator assignment
   - Audit log viewer
   - Appeal workflow for users

3. **Monitoring**:
   - Track approval rate
   - Monitor queue length
   - Alert when queue exceeds threshold

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
