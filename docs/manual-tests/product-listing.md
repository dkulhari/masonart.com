# Manual Test: Product Listing Page

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/posters

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products (various styles, subjects, prices)
- [ ] Docker services (PostgreSQL, Redis) running

## Overview
This document covers manual testing of the chobii.art product listing page, including:
- Page header with product count
- Filter sidebar (desktop) and sheet (mobile)
- Active filter tags
- Product grid display
- Pagination
- URL-based filter state
- Empty states

## Test Cases

---

## Page Header

### TC-001: Page Header Display

**Description**: Verify page header renders correctly

**Steps**:
1. Navigate to http://localhost:3001/posters
2. Observe the page header section

**Expected Result**:
- Background color is muted/30
- Headline "Shop Posters" visible (text-3xl/4xl)
- Product count shown (e.g., "Showing 24 products")

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Product Count with Filters

**Description**: Verify product count updates with active filters

**Steps**:
1. Navigate to /posters
2. Apply a filter (e.g., style=abstract)
3. Observe the product count

**Expected Result**:
- Count updates to show filtered results
- Text shows "Showing X products matching your filters"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Desktop Filter Sidebar

### TC-003: Filter Sidebar Visibility (Desktop)

**Description**: Verify filter sidebar is visible on desktop

**Steps**:
1. Set viewport to desktop (1024px+)
2. Navigate to /posters
3. Observe left sidebar

**Expected Result**:
- Filter sidebar visible (w-64)
- Sticky positioning (top-20)
- Scrollable if content overflows
- Border styling applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Styles Filter

**Description**: Verify styles filter functionality

**Steps**:
1. Navigate to /posters on desktop
2. Locate "Styles" filter section
3. Select a style option (e.g., "Abstract")

**Expected Result**:
- Checkbox becomes checked
- URL updates with ?styles=abstract
- Products filtered accordingly
- Page resets to page 1

**Actual Result**:
- [ ] PASS / [ ] FAIL
- URL after filter: _______________

---

### TC-005: Multiple Style Selection

**Description**: Verify multiple styles can be selected

**Steps**:
1. Navigate to /posters
2. Select "Abstract" style
3. Select "Minimalist" style

**Expected Result**:
- Both checkboxes checked
- URL shows ?styles=abstract,minimalist
- Products matching either style shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- URL: _______________

---

### TC-006: Subjects Filter

**Description**: Verify subjects filter functionality

**Steps**:
1. Navigate to /posters
2. Locate "Subjects" filter section
3. Select a subject option

**Expected Result**:
- Subject filter applied
- URL updates with subjects parameter
- Products filtered by subject

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Colors Filter

**Description**: Verify colors filter functionality

**Steps**:
1. Navigate to /posters
2. Locate "Colors" filter section
3. Select a color option

**Expected Result**:
- Color filter applied
- URL updates with colors parameter
- Products filtered by color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Rooms Filter

**Description**: Verify room suggestions filter functionality

**Steps**:
1. Navigate to /posters
2. Locate "Rooms" filter section
3. Select a room option

**Expected Result**:
- Room filter applied
- URL updates with rooms parameter
- Products suitable for selected room shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Orientation Filter

**Description**: Verify orientation filter functionality

**Steps**:
1. Navigate to /posters
2. Select an orientation (square/portrait/landscape/panoramic)

**Expected Result**:
- Only products with selected orientation shown
- URL updates with orientation parameter
- Filter visually indicates selection

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: Price Range Filter

**Description**: Verify price min/max filter functionality

**Steps**:
1. Navigate to /posters
2. Enter minimum price (e.g., 500)
3. Enter maximum price (e.g., 2000)

**Expected Result**:
- Products within price range shown
- URL updates with priceMin and priceMax
- Products outside range hidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Range: _______________

---

### TC-011: AI Generated Filter

**Description**: Verify AI generated filter functionality

**Steps**:
1. Navigate to /posters
2. Toggle "AI Generated" filter

**Expected Result**:
- Only AI-generated products shown
- URL shows isAiGenerated=true
- Filter toggle indicates active state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Featured Filter

**Description**: Verify featured filter functionality

**Steps**:
1. Navigate to /posters
2. Toggle "Featured" filter

**Expected Result**:
- Only featured products shown
- URL shows isFeatured=true
- Filter toggle indicates active state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Sort By Options

**Description**: Verify sort options functionality

**Steps**:
1. Navigate to /posters
2. Change sort option (createdAt, price, title)
3. Change sort order (asc/desc)

**Expected Result**:
- Products reorder accordingly
- URL updates with sortBy and sortOrder
- Default is createdAt desc

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Mobile Filter Sheet

### TC-014: Mobile Filter Button Visibility

**Description**: Verify filter button is visible on mobile

**Steps**:
1. Set viewport to mobile (< 1024px)
2. Navigate to /posters
3. Look for filter button

**Expected Result**:
- "Filters" button visible
- Shows active filter count badge if filters applied
- Desktop sidebar hidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Mobile Filter Sheet Opens

**Description**: Verify filter sheet opens on mobile

**Steps**:
1. Set viewport to mobile
2. Navigate to /posters
3. Tap "Filters" button

**Expected Result**:
- Filter sheet slides in from right
- Backdrop overlay visible
- Sheet contains all filter options
- Close button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-016: Mobile Filter Sheet Closes

**Description**: Verify filter sheet closes correctly

**Steps**:
1. Open mobile filter sheet
2. Test closing methods:
   a. Tap backdrop
   b. Tap close button (X)

**Expected Result**:
- Sheet closes on backdrop tap
- Sheet closes on X button tap
- Body scroll restored

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Mobile Filters Apply

**Description**: Verify filters apply from mobile sheet

**Steps**:
1. Open mobile filter sheet
2. Apply multiple filters
3. Close sheet

**Expected Result**:
- Filters apply immediately
- Products update
- URL updates with filter params
- Active filter count updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-018: Body Scroll Lock on Mobile

**Description**: Verify body scroll is locked when sheet is open

**Steps**:
1. Open mobile filter sheet
2. Try to scroll the page behind the sheet

**Expected Result**:
- Page scroll is locked
- Only sheet content scrollable
- Scroll restored when sheet closes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Active Filter Tags

### TC-019: Active Filter Tags Display

**Description**: Verify active filter tags show when filters applied

**Steps**:
1. Navigate to /posters
2. Apply multiple filters (style, subject, color)
3. Observe active filter tags

**Expected Result**:
- "Active filters:" label shown
- Each active filter displayed as tag
- Tags are removable (X icon)
- "Clear all" link visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Remove Individual Filter Tag

**Description**: Verify individual filter can be removed by tag

**Steps**:
1. Apply filter for "Abstract" style
2. Click X on "abstract" filter tag

**Expected Result**:
- Tag removed
- URL updated without that filter
- Products update immediately
- If last filter, tags section hidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Clear All Filters

**Description**: Verify "Clear all" removes all filters

**Steps**:
1. Apply multiple filters
2. Click "Clear all" link

**Expected Result**:
- All filters cleared
- URL reset to /posters
- All products shown
- Filter tags section hidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-022: Filter Tags on Mobile

**Description**: Verify filter tags display on mobile

**Steps**:
1. Set viewport to mobile
2. Apply filters via mobile sheet
3. Observe filter tags below filter button

**Expected Result**:
- Active filter tags visible below filter button
- Tags scrollable if many
- Same removal functionality

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Product Grid

### TC-023: Product Grid Layout (Desktop)

**Description**: Verify product grid layout on desktop

**Steps**:
1. Set viewport to desktop (1920px)
2. Navigate to /posters with products

**Expected Result**:
- 4 columns on lg screens
- Proper gap between cards
- All cards same width

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Columns: _______________

---

### TC-024: Product Grid Layout (Tablet)

**Description**: Verify product grid layout on tablet

**Steps**:
1. Set viewport to tablet (768px)
2. Navigate to /posters

**Expected Result**:
- 3 columns on md screens
- Proper responsive gap

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Columns: _______________

---

### TC-025: Product Grid Layout (Mobile)

**Description**: Verify product grid layout on mobile

**Steps**:
1. Set viewport to mobile (375px)
2. Navigate to /posters

**Expected Result**:
- 2 columns on mobile
- Smaller gap
- Cards fill viewport width

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Columns: _______________

---

### TC-026: Product Card Display

**Description**: Verify product cards display correctly

**Steps**:
1. Navigate to /posters
2. Examine individual product cards

**Expected Result**:
- Product image with correct aspect ratio
- Featured badge if applicable
- AI Generated badge if applicable
- Title with truncation
- Style tags
- Price as "From Rs.X,XXX"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Product Card Navigation

**Description**: Verify clicking product navigates to detail page

**Steps**:
1. Navigate to /posters
2. Click on a product card

**Expected Result**:
- Navigation to /posters/{category}/{slug}
- Product detail page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-028: Product Card Hover States

**Description**: Verify product card hover interactions

**Steps**:
1. Navigate to /posters
2. Hover over product cards

**Expected Result**:
- Card shadow increases
- Image scales slightly (105%)
- Title color changes to brand-600

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Pagination

### TC-029: Pagination Display

**Description**: Verify pagination displays when needed

**Steps**:
1. Navigate to /posters with > 24 products
2. Scroll to bottom of product grid

**Expected Result**:
- Pagination visible
- Previous/Next buttons present
- Page numbers displayed
- Current page highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: Pagination - Next Page

**Description**: Verify navigation to next page

**Steps**:
1. Navigate to /posters page 1
2. Click "Next" button

**Expected Result**:
- URL updates to ?page=2
- Products for page 2 load
- Page 2 highlighted in pagination
- Scroll to top of page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- URL: _______________

---

### TC-031: Pagination - Previous Page

**Description**: Verify navigation to previous page

**Steps**:
1. Navigate to /posters?page=2
2. Click "Previous" button

**Expected Result**:
- URL updates to ?page=1 or removes page param
- Products for page 1 load
- Page 1 highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Pagination - Direct Page Selection

**Description**: Verify clicking page number navigates directly

**Steps**:
1. Navigate to /posters
2. Click page number "3"

**Expected Result**:
- URL updates to ?page=3
- Products for page 3 load
- Page 3 highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Pagination with Filters

**Description**: Verify pagination maintains filter state

**Steps**:
1. Navigate to /posters?styles=abstract
2. Go to page 2

**Expected Result**:
- URL: /posters?styles=abstract&page=2
- Filters preserved
- Products still filtered

**Actual Result**:
- [ ] PASS / [ ] FAIL
- URL: _______________

---

### TC-034: Pagination Ellipsis

**Description**: Verify ellipsis displays for many pages

**Steps**:
1. Navigate to /posters with many products (100+)
2. Observe pagination

**Expected Result**:
- Ellipsis (...) shows for skipped pages
- First and last page always visible
- Pages around current visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-035: Pagination Buttons Disabled States

**Description**: Verify Previous/Next disabled at boundaries

**Steps**:
1. Navigate to page 1
2. Check Previous button
3. Navigate to last page
4. Check Next button

**Expected Result**:
- Previous disabled on page 1
- Next disabled on last page
- Disabled buttons have muted styling
- cursor-not-allowed applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Pagination Accessibility

**Description**: Verify pagination is accessible

**Steps**:
1. Navigate to /posters
2. Tab through pagination
3. Check ARIA labels

**Expected Result**:
- nav element has aria-label="Pagination"
- Buttons have aria-label (e.g., "Go to page 2")
- Current page has aria-current="page"
- Keyboard navigation works

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Empty State

### TC-037: Empty State Display

**Description**: Verify empty state when no products match

**Steps**:
1. Navigate to /posters
2. Apply impossible filter combination

**Expected Result**:
- Empty state message displayed
- "No products found" heading
- "Try adjusting your filters" description
- Link to create with AI shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Empty State Create Link

**Description**: Verify create link in empty state

**Steps**:
1. Trigger empty state
2. Click "Create with AI" link

**Expected Result**:
- Navigation to /create page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## URL State Management

### TC-039: Direct URL Navigation

**Description**: Verify filters apply from URL parameters

**Steps**:
1. Navigate directly to /posters?styles=abstract&priceMin=500
2. Observe page state

**Expected Result**:
- Filters auto-applied from URL
- Filter checkboxes reflect URL state
- Active filter tags shown
- Products filtered accordingly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-040: URL Sharing

**Description**: Verify filtered URLs are shareable

**Steps**:
1. Apply multiple filters
2. Copy URL
3. Open in new tab/browser

**Expected Result**:
- Same filters applied in new tab
- Same products shown
- URL accurately represents filter state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-041: Browser Back/Forward

**Description**: Verify browser navigation works with filters

**Steps**:
1. Navigate to /posters
2. Apply filter (styles=abstract)
3. Apply another filter (colors=blue)
4. Click browser back button
5. Click browser forward button

**Expected Result**:
- Back removes last filter
- Forward reapplies filter
- Page state matches URL

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## SEO

### TC-042: Page Title

**Description**: Verify page title updates with filters

**Steps**:
1. Navigate to /posters
2. Check title
3. Apply filter for "Abstract"
4. Check title again

**Expected Result**:
- Default: "Shop Posters | chobii.art"
- With style: "Abstract Posters | chobii.art"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Titles: _______________

---

### TC-043: Meta Description

**Description**: Verify meta description is appropriate

**Steps**:
1. Navigate to /posters
2. Inspect meta description

**Expected Result**:
- Description mentions poster collection
- Updated to reflect total count with filters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-044: Canonical URL

**Description**: Verify canonical URL is set

**Steps**:
1. Navigate to /posters?page=2
2. Check canonical link

**Expected Result**:
- Canonical URL: https://chobii.art/posters
- Pagination not included in canonical

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Canonical: _______________

---

### TC-045: Robots Meta for Paginated Pages

**Description**: Verify robots meta for pagination

**Steps**:
1. Navigate to /posters (page 1)
2. Check robots meta
3. Navigate to /posters?page=2
4. Check robots meta

**Expected Result**:
- Page 1: "index, follow"
- Page 2+: "noindex, follow"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-046: Open Graph Tags

**Description**: Verify Open Graph meta tags

**Steps**:
1. Navigate to /posters
2. Inspect og: meta tags

**Expected Result**:
- og:title present
- og:description present
- og:image (first product image or default)
- og:url = canonical URL

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-047: Initial Load Time

**Description**: Verify acceptable initial load time

**Steps**:
1. Open DevTools Network tab
2. Navigate to /posters
3. Observe load time

**Expected Result**:
- Initial content visible < 2 seconds
- Full page load < 4 seconds
- Products rendered quickly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-048: Filter Response Time

**Description**: Verify filter changes are responsive

**Steps**:
1. Navigate to /posters
2. Apply filter
3. Measure time to update

**Expected Result**:
- URL updates immediately
- Products refresh within 1 second
- No loading flicker

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

## Accessibility

### TC-049: Keyboard Navigation

**Description**: Verify page is keyboard accessible

**Steps**:
1. Navigate to /posters
2. Tab through all interactive elements

**Expected Result**:
- All filters keyboard accessible
- Product cards focusable
- Pagination navigable
- Visible focus indicators

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-050: Screen Reader Compatibility

**Description**: Verify proper ARIA labels

**Steps**:
1. Navigate to /posters
2. Inspect ARIA attributes

**Expected Result**:
- Filter sections have proper headings
- Checkboxes labeled correctly
- Mobile sheet has role="dialog"
- aria-modal="true" on sheet

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error Handling

### TC-051: API Error Handling

**Description**: Verify graceful handling when API fails

**Steps**:
1. Stop API server
2. Navigate to /posters

**Expected Result**:
- Page loads without crashing
- Empty state shown
- Error message displayed (optional)
- Filters still functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-052: Invalid URL Parameters

**Description**: Verify handling of invalid URL params

**Steps**:
1. Navigate to /posters?page=abc&priceMin=-100
2. Observe behavior

**Expected Result**:
- Page handles gracefully
- Invalid params ignored or defaulted
- No console errors
- Page renders normally

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 52
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Number of Test Products: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Performance**:
   - Implement virtual scrolling for large product lists
   - Add skeleton loading for filter application

2. **UX Improvements**:
   - Add filter count in each section
   - Implement "Apply Filters" button on mobile for batch updates

3. **Accessibility**:
   - Announce filter changes to screen readers
   - Add live region for product count updates

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
