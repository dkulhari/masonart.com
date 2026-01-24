# Manual Test: Product Catalog User Journey Flow

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Base URL**: http://localhost:3001

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] Database seeded with test product data (`bun run db:seed`)
- [ ] Docker services (PostgreSQL, Redis) running (`docker compose up -d`)
- [ ] Multiple products with different styles, subjects, and orientations available
- [ ] At least one product per category for comprehensive testing

## Overview
This document covers end-to-end manual testing of the complete product browsing user journey:
1. User lands on home page
2. User navigates to catalog via various entry points
3. User applies filters to narrow down products
4. User browses through filtered results
5. User views product details
6. User navigates back with filter preservation

---

## Home to Catalog Navigation Flow

### TC-001: Navigate from Home Page Hero to Catalog

**Description**: Verify users can navigate from home page hero CTA to catalog

**Steps**:
1. Navigate to http://localhost:3001/
2. Verify home page hero section is visible with headline
3. Locate "Shop Posters" CTA button
4. Click the button

**Expected Result**:
- URL changes to /posters
- Catalog page loads with "Shop Posters" heading
- Product grid is displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Navigate from Category Card to Filtered Catalog

**Description**: Verify clicking a category card navigates to filtered catalog

**Steps**:
1. Navigate to home page (/)
2. Scroll to categories section
3. Click on "Abstract" category card

**Expected Result**:
- URL changes to /posters?styles=abstract
- Catalog page loads with "Shop Posters" heading
- "abstract" filter tag is visible
- Only abstract-style products are displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-003: Navigate from Header Navigation to Catalog

**Description**: Verify header navigation link works correctly

**Steps**:
1. Navigate to any page
2. Locate "Posters" link in header navigation
3. Click the link

**Expected Result**:
- URL changes to /posters
- Catalog page loads successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Filter Application Flow

### TC-004: Apply Single Style Filter

**Description**: Verify applying a single style filter updates results

**Steps**:
1. Navigate to /posters (desktop viewport: 1280x800)
2. In the filter sidebar, click "Abstract" checkbox under Style section
3. Observe URL and product display

**Expected Result**:
- URL updates to include `styles=abstract`
- Filter tag "abstract" appears above product grid
- "Active filters:" text is visible
- Products displayed match the abstract style

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Apply Multiple Filters

**Description**: Verify applying multiple filters works correctly

**Steps**:
1. Navigate to /posters (desktop viewport)
2. Click "Portrait" orientation button
3. Click "Abstract" style checkbox
4. Observe URL and filters

**Expected Result**:
- URL contains both `orientation=portrait` and `styles=abstract`
- Both filter tags ("portrait", "abstract") are visible
- Products match both filter criteria

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-006: Apply Sort and Filter Combination

**Description**: Verify sort and filter can be applied together

**Steps**:
1. Navigate to /posters
2. Click "Price: Low to High" sort button
3. Select "Minimalist" style filter
4. Observe results

**Expected Result**:
- URL contains `sortBy=basePrice`, `sortOrder=asc`, and `styles=minimalist`
- Products are sorted by price ascending
- Only minimalist products are shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Remove Individual Filter via Tag Click

**Description**: Verify removing a single filter by clicking its tag

**Steps**:
1. Navigate to /posters?styles=abstract,minimalist
2. Click the "abstract" filter tag (X button)
3. Observe URL and results

**Expected Result**:
- "abstract" is removed from URL
- "minimalist" remains in URL
- Only minimalist products are now shown
- "abstract" tag disappears

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Clear All Filters

**Description**: Verify "Clear all" button removes all filters

**Steps**:
1. Navigate to /posters?styles=abstract&orientation=portrait
2. Click "Clear all" button
3. Observe URL and results

**Expected Result**:
- URL becomes /posters (no filter parameters)
- All filter tags disappear
- All products are shown without filtering

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Mobile Filter Experience

### TC-009: Open Mobile Filter Sheet and Apply Filter

**Description**: Verify mobile filter drawer works correctly

**Steps**:
1. Set viewport to 375x667 (mobile)
2. Navigate to /posters
3. Click "Filters" button
4. Verify filter sheet/drawer opens
5. Expand "Style" section if collapsed
6. Select "Abstract" checkbox
7. Click "Apply Filters" button

**Expected Result**:
- Filter sheet opens as a dialog/drawer
- Style section is expandable
- After applying, sheet closes
- URL updates to include `styles=abstract`
- Products are filtered accordingly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: Mobile Filter Count Badge

**Description**: Verify filter count badge displays on mobile

**Steps**:
1. Set viewport to mobile (375x667)
2. Navigate to /posters?styles=abstract&orientation=portrait
3. Observe the "Filters" button

**Expected Result**:
- "Filters" button shows a badge with count "2"
- Badge has primary color styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Product Browsing and Viewing Flow

### TC-011: Browse Catalog and View Product Details

**Description**: Verify product card click leads to detail page

**Steps**:
1. Navigate to /posters
2. Click on any product card
3. Observe product detail page

**Expected Result**:
- URL changes to product detail page (e.g., /posters/abstract/ocean-waves)
- Product title is displayed in h1
- "Select Size" options are visible
- "Add to Cart" button is visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Navigate Back from Product to Catalog (Browser Back)

**Description**: Verify browser back button returns to catalog

**Steps**:
1. Navigate to /posters
2. Click on a product card to view details
3. Click browser back button

**Expected Result**:
- Returns to /posters
- Catalog page loads with "Shop Posters" heading

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Navigate Back from Product via Breadcrumb

**Description**: Verify breadcrumb navigation works

**Steps**:
1. Navigate to /posters
2. Click on a product card
3. On product detail page, click "Posters" in breadcrumb navigation

**Expected Result**:
- Navigates to /posters
- Catalog page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Preserve Filters When Navigating Back from Product

**Description**: Verify filters are preserved after viewing a product

**Steps**:
1. Navigate to /posters?styles=abstract&orientation=portrait (desktop)
2. Verify filter tags are visible
3. Click on a product card
4. Click browser back button

**Expected Result**:
- Returns to /posters with filters preserved
- URL still contains `styles=abstract` and `orientation=portrait`
- Filter tags are still visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Pagination Flow

### TC-015: Navigate Through Pages of Results

**Description**: Verify pagination works correctly

**Steps**:
1. Navigate to /posters (ensure more than 20 products exist)
2. Verify pagination is visible
3. Verify page 1 is currently active
4. Click next page button

**Expected Result**:
- URL updates to include `page=2`
- Current page indicator shows "2"
- Different products are displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-016: Reset to Page 1 When Applying New Filter

**Description**: Verify filters reset pagination to page 1

**Steps**:
1. Navigate to /posters?page=2
2. Apply "Abstract" style filter

**Expected Result**:
- URL no longer contains `page=2`
- Filter is applied
- Results start from page 1

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Preserve Filters When Paginating

**Description**: Verify filters are preserved when changing pages

**Steps**:
1. Navigate to /posters?styles=abstract
2. Click next page button

**Expected Result**:
- URL contains both `styles=abstract` and `page=2`
- Products on page 2 are still filtered by abstract style

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Complete User Journey Scenarios

### TC-018: Journey - Home to Category to Filter to Product to Back

**Description**: Complete user journey from home to filtered product view

**Steps**:
1. Navigate to home page (/)
2. Click "Abstract" category card
3. Verify navigated to /posters?styles=abstract
4. Add "Portrait" orientation filter
5. Click on a product to view details
6. Click browser back button

**Expected Result**:
- Each step transitions smoothly
- Filters are preserved when navigating back
- URL contains both `styles=abstract` and `orientation=portrait`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-019: Journey - Browse, Filter, Sort, Product

**Description**: Complete journey with sorting

**Steps**:
1. Navigate to /posters
2. Apply "Nature & Landscape" subject filter
3. Apply "Price: Low to High" sort
4. Click on first product card
5. Verify price is visible on product page

**Expected Result**:
- Filters and sort are applied correctly
- Product detail page shows price
- Products were sorted by price

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Journey - Mobile Browse and Filter Products

**Description**: Complete mobile user journey

**Steps**:
1. Set viewport to mobile (375x667)
2. Navigate to home page
3. Click "Shop Posters" CTA
4. Click "Filters" button
5. Expand "Style" section and select "Abstract"
6. Click "Apply Filters"
7. Verify filter applied
8. Click on a product card

**Expected Result**:
- Mobile filter sheet opens and closes properly
- Filter is applied after clicking Apply
- Product detail page loads on mobile

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Journey - Search Refinement (Narrow then Broaden)

**Description**: User narrows and then broadens search

**Steps**:
1. Navigate to /posters?styles=abstract
2. Add "Portrait" orientation filter
3. Expand "Color" section and add "Blue" color filter
4. Remove "Portrait" filter by clicking its tag
5. Click "Clear all" to start fresh

**Expected Result**:
- Filters can be added incrementally
- Individual filters can be removed
- "Clear all" removes all filters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Edge Cases and Error Handling

### TC-022: Handle Invalid Filter Parameters

**Description**: Verify invalid filters are handled gracefully

**Steps**:
1. Navigate to /posters?styles=nonexistent-style-xyz
2. Observe page behavior

**Expected Result**:
- Page loads without error
- "Shop Posters" heading is visible
- Invalid filter may be ignored or cleared

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-023: Handle Missing Product in Detail Page

**Description**: Verify 404 handling for non-existent products

**Steps**:
1. Navigate to /posters/category/nonexistent-product-12345
2. Observe page behavior

**Expected Result**:
- "Product Not Found" message is displayed
- "Browse All Products" link is visible and works
- Clicking link navigates to /posters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-024: Handle Rapid Filter Changes

**Description**: Verify app handles rapid filter toggles

**Steps**:
1. Navigate to /posters (desktop)
2. Quickly click multiple filters in succession:
   - Portrait orientation
   - Abstract style
   - Minimalist style
   - Portrait again (to deselect)

**Expected Result**:
- Page remains functional
- No JavaScript errors
- Final filter state is correct

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Handle Page Reload with Filters Preserved

**Description**: Verify filters survive page reload

**Steps**:
1. Navigate to /posters?styles=abstract&orientation=portrait&sortBy=basePrice&sortOrder=asc
2. Verify filter tags are visible
3. Reload the page (F5 or Ctrl+R)

**Expected Result**:
- Filters are preserved after reload
- URL parameters remain intact
- Filter tags are still displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance Tests

### TC-026: Catalog Page Load Time

**Description**: Verify catalog page loads within acceptable time

**Steps**:
1. Open browser DevTools (Network tab)
2. Navigate to /posters
3. Measure time until "Shop Posters" heading is visible

**Expected Result**:
- Page loads within 5 seconds
- No significant layout shifts after initial load

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

### TC-027: Filter Application Response Time

**Description**: Verify filter updates are responsive

**Steps**:
1. Navigate to /posters (desktop)
2. Click a filter option
3. Measure time until URL updates

**Expected Result**:
- URL updates within 2 seconds
- Filter tag appears promptly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _____ ms
- Notes: _______________

---

### TC-028: Product Detail Navigation Time

**Description**: Verify product detail pages load quickly

**Steps**:
1. Navigate to /posters
2. Click on a product card
3. Measure time until product title is visible

**Expected Result**:
- Product detail loads within 3 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

### TC-029: No JavaScript Errors During Flow

**Description**: Verify no JS errors during typical user flow

**Steps**:
1. Open browser DevTools (Console tab)
2. Navigate through: / -> /posters -> apply filter -> product detail -> back
3. Check console for errors

**Expected Result**:
- No critical JavaScript errors
- Network errors (if any) are handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Accessibility Flow Tests

### TC-030: Keyboard Navigation Through Catalog

**Description**: Verify keyboard navigation works

**Steps**:
1. Navigate to /posters
2. Press Tab repeatedly
3. Navigate through filters and products using keyboard only

**Expected Result**:
- Focus is visible on each interactive element
- Tab order is logical
- Focus indicators are clearly visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Accessible Filter Controls

**Description**: Verify filter sections have proper accessibility attributes

**Steps**:
1. Navigate to /posters (desktop)
2. Inspect filter section buttons with DevTools
3. Check for aria-expanded attribute

**Expected Result**:
- Filter sections have `aria-expanded` attribute
- State changes when sections are expanded/collapsed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Screen Reader Active Filters Announcement

**Description**: Verify active filters are announced for screen readers

**Steps**:
1. Navigate to /posters?styles=abstract
2. Check for "Active filters:" section
3. Verify filter tags are present

**Expected Result**:
- "Active filters:" text is visible
- Filter tags have appropriate labels

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Product Page Breadcrumb Accessibility

**Description**: Verify breadcrumb is accessible

**Steps**:
1. Navigate to a product detail page
2. Inspect breadcrumb with DevTools

**Expected Result**:
- Breadcrumb has `aria-label="Breadcrumb"` on nav element
- Current page has `aria-current="page"`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design Tests

### TC-034: Complete Flow on Mobile Viewport

**Description**: Verify complete flow works on mobile

**Steps**:
1. Set viewport to 375x667
2. Complete: / -> /posters -> mobile filter -> apply -> product detail

**Expected Result**:
- All pages render correctly on mobile
- Filter sheet/drawer opens properly
- Product detail is readable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-035: Complete Flow on Tablet Viewport

**Description**: Verify complete flow works on tablet

**Steps**:
1. Set viewport to 768x1024
2. Navigate to /posters
3. View a product and navigate back

**Expected Result**:
- Product grid adapts to tablet width
- Navigation works correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Complete Flow on Desktop Viewport

**Description**: Verify complete flow works on desktop

**Steps**:
1. Set viewport to 1920x1080
2. Navigate to /posters
3. Verify desktop filter sidebar is visible
4. Apply a filter and view a product

**Expected Result**:
- Filter sidebar is visible (not hidden)
- Product grid displays more columns
- All features work correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BUG-001 | (Example) Filter tags overlap on very small screens | Low | Open |

---

## Summary

- **Total Test Cases**: 36
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| Product Owner | | | |
