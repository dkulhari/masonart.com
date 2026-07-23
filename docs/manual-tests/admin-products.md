# Manual Test: Admin Products Management

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
- [ ] MinIO running for image storage
- [ ] Admin user account created
- [ ] Test products seeded in database

## Overview
This document covers manual testing of Admin Products Management:
- Products listing page (`/admin/products`)
- Create product page (`/admin/products/new`)
- Edit product page (`/admin/products/:id`)
- Product variants management
- Image upload functionality
- Search, filter, and pagination

---

## Products List Page

### TC-001: Products List Page Load

**Description**: Verify products list page loads successfully

**URL**: `/admin/products`

**Steps**:
1. Login as admin
2. Navigate to `/admin/products`

**Expected Result**:
- Page title: "Products"
- Products table/grid visible
- Add Product button visible
- Refresh button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page Loaded: _______________

---

### TC-002: Document Title and Meta

**Description**: Verify HTML title and robots meta

**Expected Result**:
- Title: "Products - Admin - chobii.art" (or similar)
- Meta robots: "noindex, nofollow"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________
- Robots: _______________

---

### TC-003: Products Table Structure

**Description**: Verify products table has correct columns

**Expected Columns**:
- Image (thumbnail)
- SKU
- Title
- Price
- Status
- Featured indicator
- Actions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Columns Present: _______________

---

### TC-004: Product Row Data Display

**Description**: Verify product data displays correctly in rows

**Steps**:
1. Observe product rows
2. Verify data formatting

**Expected Result**:
- SKU format: XX-NNN
- Title truncated if long
- Price with currency symbol (₹)
- Status badge with color
- Featured star/indicator

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Data Format Correct: _______________

---

### TC-005: Status Badge Colors

**Description**: Verify status badges have correct colors

**Status Colors**:
- Active: Green
- Draft: Yellow/Amber
- Archived: Gray

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Active Badge: _______________
- Draft Badge: _______________
- Archived Badge: _______________

---

### TC-006: Add Product Button

**Description**: Verify Add Product button navigation

**Steps**:
1. Click "Add Product" button
2. Verify navigation

**Expected Result**:
- Navigates to `/admin/products/new`
- Button clearly visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

## Search and Filter

### TC-007: Search Input Presence

**Description**: Verify search input is visible

**Expected Result**:
- Search input with placeholder "Search products..."
- Search icon visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search Input: _______________

---

### TC-008: Search by Title

**Description**: Verify search filters by product title

**Steps**:
1. Enter product title in search
2. Wait for results
3. Verify filtered list

**Expected Result**:
- Results contain search term in title
- Case-insensitive matching
- URL updates with search param

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search Results: _______________

---

### TC-009: Search by SKU

**Description**: Verify search filters by SKU

**Steps**:
1. Enter SKU in search (e.g., "TX-001")
2. Verify filtered results

**Expected Result**:
- Results match SKU
- Partial match supported

**Actual Result**:
- [ ] PASS / [ ] FAIL
- SKU Search: _______________

---

### TC-010: Clear Search

**Description**: Verify search can be cleared

**Steps**:
1. Enter search term
2. Clear the input
3. Verify results reset

**Expected Result**:
- All products shown again
- URL param removed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Clear Working: _______________

---

### TC-011: Status Filter Dropdown

**Description**: Verify status filter dropdown

**Steps**:
1. Find status filter dropdown
2. Select different options

**Expected Result**:
- Dropdown with options: All, Active, Draft, Archived
- Selection filters results
- URL updates with status param

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Options: _______________

---

### TC-012: Filter by Active Status

**Description**: Verify filtering by Active status

**URL**: `/admin/products?status=active`

**Expected Result**:
- Only active products shown
- Filter dropdown shows "Active"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Active Count: _______________

---

### TC-013: Filter by Draft Status

**Description**: Verify filtering by Draft status

**URL**: `/admin/products?status=draft`

**Expected Result**:
- Only draft products shown
- Filter dropdown shows "Draft"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Draft Count: _______________

---

### TC-014: Filter by Archived Status

**Description**: Verify filtering by Archived status

**URL**: `/admin/products?status=archived`

**Expected Result**:
- Only archived products shown
- Filter dropdown shows "Archived"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Archived Count: _______________

---

### TC-015: Combined Search and Filter

**Description**: Verify search and filter work together

**Steps**:
1. Set status filter to "Active"
2. Enter search term
3. Verify results

**Expected Result**:
- Results match both criteria
- Both params in URL

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Combined Working: _______________

---

## Pagination

### TC-016: Pagination Controls Display

**Description**: Verify pagination controls visible

**Prerequisites**: More than 20 products in database

**Expected Result**:
- Page numbers visible
- Previous/Next buttons
- Current page highlighted
- Total count displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pagination Present: _______________

---

### TC-017: Navigate to Next Page

**Description**: Verify next page navigation

**Steps**:
1. Click "Next" or page 2
2. Verify URL and content change

**Expected Result**:
- URL updates with page=2
- Different products shown
- Current page indicator updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Next Page: _______________

---

### TC-018: Navigate to Previous Page

**Description**: Verify previous page navigation

**Steps**:
1. Navigate to page 2
2. Click "Previous" or page 1

**Expected Result**:
- Returns to first page
- URL updates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Previous Page: _______________

---

### TC-019: Page Size Selection

**Description**: Verify page size can be changed (if implemented)

**Steps**:
1. Find page size dropdown
2. Change page size

**Expected Result**:
- Options: 10, 20, 50, 100
- Results update to match

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page Size Selector: _______________

---

## Sorting

### TC-020: Sort by Title

**Description**: Verify sorting by title

**URL**: `/admin/products?sortBy=title&sortOrder=asc`

**Expected Result**:
- Products sorted alphabetically
- Column header indicates sort direction

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title Sort: _______________

---

### TC-021: Sort by Created Date

**Description**: Verify sorting by creation date

**URL**: `/admin/products?sortBy=createdAt&sortOrder=desc`

**Expected Result**:
- Newest products first (desc)
- Oldest products first (asc)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Date Sort: _______________

---

### TC-022: Sort by Price

**Description**: Verify sorting by price

**URL**: `/admin/products?sortBy=basePrice&sortOrder=desc`

**Expected Result**:
- Highest price first (desc)
- Lowest price first (asc)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Sort: _______________

---

### TC-023: Toggle Sort Order

**Description**: Verify clicking column toggles sort order

**Steps**:
1. Click sortable column header
2. Click again to toggle

**Expected Result**:
- First click: asc
- Second click: desc
- Visual indicator changes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Toggle Working: _______________

---

## Create Product

### TC-024: Create Product Form Display

**Description**: Verify create product form elements

**URL**: `/admin/products/new`

**Expected Fields**:
- SKU (required)
- Title (required)
- Slug (required, auto-generated)
- Description
- Base Price (required)
- Orientation (required)
- Status (draft/active)
- Styles (multi-select)
- Subjects (multi-select)
- Colors (multi-select)
- Featured toggle
- AI Generated toggle

**Actual Result**:
- [ ] PASS / [ ] FAIL
- All Fields Present: _______________

---

### TC-025: SKU Field Validation

**Description**: Verify SKU field validation

**Test Cases**:
- Empty SKU: should show error
- Duplicate SKU: should show error on submit
- Valid format: accepted

**Expected Result**:
- Clear validation messages
- Cannot submit without SKU

**Actual Result**:
- [ ] PASS / [ ] FAIL
- SKU Validation: _______________

---

### TC-026: Auto-Generate Slug

**Description**: Verify slug auto-generates from title

**Steps**:
1. Enter title "Test Product Name"
2. Tab out of field
3. Check slug field

**Expected Result**:
- Slug: "test-product-name"
- Lowercase, hyphenated
- Editable after generation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Auto-Slug: _______________

---

### TC-027: Slug Format Validation

**Description**: Verify slug accepts only valid format

**Test Cases**:
- "Test Slug": invalid (uppercase, space)
- "test-slug": valid
- "test@slug!": invalid (special chars)

**Expected Result**:
- Validation error for invalid formats
- Only lowercase, hyphens, numbers allowed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Slug Validation: _______________

---

### TC-028: Price Field Validation

**Description**: Verify price field validation

**Test Cases**:
- Empty: should show error
- Negative: should reject
- Non-numeric: should reject
- Valid decimal: accepted

**Expected Result**:
- Number input only
- Two decimal places
- Minimum value check

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Validation: _______________

---

### TC-029: Orientation Selection

**Description**: Verify orientation dropdown

**Expected Options**:
- Portrait
- Landscape
- Square
- Panoramic

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Options Present: _______________

---

### TC-030: Status Selection

**Description**: Verify status selection

**Expected Options**:
- Draft (default)
- Active

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Default Status: _______________

---

### TC-031: Style Multi-Select

**Description**: Verify styles can be selected

**Steps**:
1. Click styles dropdown
2. Select multiple styles
3. Verify selection shown

**Expected Result**:
- Multiple selection possible
- Selected items shown as tags/chips
- Can remove selections

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Multi-Select Working: _______________

---

### TC-032: Create Product - Success

**Description**: Verify successful product creation

**Steps**:
1. Fill all required fields
2. Click Save/Create button
3. Verify success

**Expected Result**:
- Success toast/message
- Redirect to products list or edit page
- Product appears in list

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product Created: _______________

---

### TC-033: Create Product - Validation Errors

**Description**: Verify validation errors on submit

**Steps**:
1. Leave required fields empty
2. Click Save
3. Check errors

**Expected Result**:
- Error messages for each required field
- Form not submitted
- Fields highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Shown: _______________

---

### TC-034: Cancel Button

**Description**: Verify cancel navigation

**Steps**:
1. Make changes to form
2. Click Cancel

**Expected Result**:
- Navigates back to products list
- Changes not saved
- Possible confirmation dialog

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cancel Working: _______________

---

## Edit Product

### TC-035: Edit Page Load

**Description**: Verify edit page loads with data

**URL**: `/admin/products/:id`

**Steps**:
1. Click edit on a product
2. Verify form pre-filled

**Expected Result**:
- All fields populated with existing data
- Page title shows product name
- Update button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Data Loaded: _______________

---

### TC-036: Edit Product - Update Fields

**Description**: Verify fields can be updated

**Steps**:
1. Change title
2. Change price
3. Click Update

**Expected Result**:
- Success message
- Changes saved
- updatedAt timestamp changed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Update Working: _______________

---

### TC-037: Edit Product - Duplicate SKU Error

**Description**: Verify duplicate SKU rejected on update

**Steps**:
1. Change SKU to existing one
2. Click Update

**Expected Result**:
- Error: "SKU already exists"
- Changes not saved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Duplicate Check: _______________

---

### TC-038: Edit Product - Duplicate Slug Error

**Description**: Verify duplicate slug rejected

**Steps**:
1. Change slug to existing one
2. Click Update

**Expected Result**:
- Error: "Slug already exists"
- Changes not saved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Slug Check: _______________

---

## Delete/Archive Product

### TC-039: Delete Button Visible

**Description**: Verify delete/archive button on edit page

**URL**: `/admin/products/:id`

**Expected Result**:
- Delete or Archive button visible
- Different styling (red/warning)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Button Visible: _______________

---

### TC-040: Delete Confirmation Dialog

**Description**: Verify confirmation before delete

**Steps**:
1. Click Delete button
2. Observe dialog

**Expected Result**:
- Confirmation modal appears
- Product name shown
- Cancel and Confirm buttons

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Dialog Shows: _______________

---

### TC-041: Cancel Delete

**Description**: Verify cancel on delete dialog

**Steps**:
1. Click Delete
2. Click Cancel in dialog

**Expected Result**:
- Dialog closes
- Product not deleted
- Remain on edit page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cancel Working: _______________

---

### TC-042: Confirm Delete

**Description**: Verify successful deletion

**Steps**:
1. Click Delete
2. Confirm in dialog

**Expected Result**:
- Success message
- Redirect to products list
- Product status changed to "archived"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delete Working: _______________

---

## Product Variants

### TC-043: Variants Section Display

**Description**: Verify variants section on edit page

**Expected Result**:
- "Variants" or "Size Variants" section header
- List of existing variants
- Add Variant button

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Section Visible: _______________

---

### TC-044: Variant Display Data

**Description**: Verify variant data displayed

**Expected Fields per Variant**:
- Size label (e.g., "12x16 inches")
- Price
- Stock quantity
- In Stock indicator
- Edit/Delete actions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Variant Data: _______________

---

### TC-045: Add Variant Button

**Description**: Verify Add Variant opens form

**Steps**:
1. Click "Add Variant"
2. Verify form appears

**Expected Result**:
- Modal or inline form appears
- Fields: sizeLabel, width, height, price, stock

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Form Opens: _______________

---

### TC-046: Create Variant - Success

**Description**: Verify new variant creation

**Steps**:
1. Click Add Variant
2. Fill form
3. Save

**Expected Result**:
- Success message
- Variant added to list
- No page reload needed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Variant Created: _______________

---

### TC-047: Edit Variant

**Description**: Verify variant editing

**Steps**:
1. Click Edit on variant
2. Change price
3. Save

**Expected Result**:
- Form pre-filled
- Changes saved
- List updated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Edit Working: _______________

---

### TC-048: Delete Variant

**Description**: Verify variant deletion

**Steps**:
1. Click Delete on variant
2. Confirm deletion

**Expected Result**:
- Confirmation dialog
- Variant removed from list
- Success message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delete Working: _______________

---

## Image Upload

### TC-049: Image Upload Section

**Description**: Verify image upload section visible

**Expected Result**:
- Upload area/dropzone visible
- "Upload Image" or drag-drop text
- Supported formats listed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Upload Section: _______________

---

### TC-050: Image Upload - Click

**Description**: Verify click-to-upload works

**Steps**:
1. Click upload area
2. Select image file
3. Verify upload

**Expected Result**:
- File picker opens
- Image uploads
- Preview shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Click Upload: _______________

---

### TC-051: Image Upload - Drag and Drop

**Description**: Verify drag-and-drop upload

**Steps**:
1. Drag image file to dropzone
2. Drop file

**Expected Result**:
- Dropzone highlights
- File uploads
- Preview shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Drag Drop: _______________

---

### TC-052: Image Upload - Invalid Format

**Description**: Verify invalid format rejection

**Steps**:
1. Try to upload .txt or .pdf file

**Expected Result**:
- Error message
- File not uploaded
- Valid formats listed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Format Check: _______________

---

### TC-053: Image Upload - Size Limit

**Description**: Verify file size limit

**Steps**:
1. Try to upload very large image (>10MB)

**Expected Result**:
- Error message about size limit
- File not uploaded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Size Limit: _______________

---

### TC-054: Existing Images Display

**Description**: Verify existing images shown on edit

**Expected Result**:
- Image thumbnails visible
- Primary image indicated
- Delete button on each

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Images Shown: _______________

---

### TC-055: Set Primary Image

**Description**: Verify setting primary image

**Steps**:
1. Click "Set Primary" on non-primary image

**Expected Result**:
- Image becomes primary
- Indicator moves
- Saved to database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Primary Set: _______________

---

### TC-056: Delete Image

**Description**: Verify image deletion

**Steps**:
1. Click delete on image
2. Confirm deletion

**Expected Result**:
- Image removed
- Success message
- Cannot delete if only image (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Image Deleted: _______________

---

## Empty and Error States

### TC-057: Empty Products List

**Description**: Verify empty state display

**Prerequisites**: No products in database

**Expected Result**:
- "No products found" message
- Add Product CTA button
- Helpful illustration (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Empty State: _______________

---

### TC-058: Empty Search Results

**Description**: Verify empty search results

**Steps**:
1. Search for non-existent term

**Expected Result**:
- "No products match your search" message
- Clear search suggestion

**Actual Result**:
- [ ] PASS / [ ] FAIL
- No Results Message: _______________

---

### TC-059: Product Not Found

**Description**: Verify 404 for invalid product ID

**URL**: `/admin/products/invalid-id-here`

**Expected Result**:
- "Product not found" message
- Back to products link

**Actual Result**:
- [ ] PASS / [ ] FAIL
- 404 Handling: _______________

---

### TC-060: Loading State - List

**Description**: Verify loading state on list page

**Steps**:
1. Simulate slow network
2. Load products page

**Expected Result**:
- Skeleton loaders shown
- Smooth transition to data
- No layout shift

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading State: _______________

---

### TC-061: Loading State - Edit

**Description**: Verify loading state on edit page

**Steps**:
1. Navigate to edit page
2. Observe loading

**Expected Result**:
- Form skeleton or spinner
- Data loads into fields

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Edit Loading: _______________

---

### TC-062: API Error Handling

**Description**: Verify error when API fails

**Steps**:
1. Simulate API error
2. Check error display

**Expected Result**:
- Error message shown
- Retry button available
- No crash

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Handling: _______________

---

## Responsive Design

### TC-063: Mobile - Products List

**Description**: Verify products list on mobile

**Viewport**: 375x667

**Expected Result**:
- Table converts to cards or list
- All data visible
- Touch-friendly actions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile List: _______________

---

### TC-064: Mobile - Create/Edit Form

**Description**: Verify form works on mobile

**Viewport**: 375x667

**Expected Result**:
- Form fields stack vertically
- Full-width inputs
- Keyboard doesn't obscure

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Form: _______________

---

### TC-065: Mobile - Add Product Button

**Description**: Verify add button visible on mobile

**Viewport**: 375x667

**Expected Result**:
- Button accessible
- May be floating action button

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Add Button: _______________

---

### TC-066: Tablet Layout

**Description**: Verify products page on tablet

**Viewport**: 768x1024

**Expected Result**:
- Optimal use of space
- Table visible
- Sidebar collapsed or visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tablet Layout: _______________

---

## Accessibility

### TC-067: Form Labels

**Description**: Verify all form fields have labels

**Steps**:
1. Inspect form inputs
2. Check for associated labels

**Expected Result**:
- All inputs have labels
- Labels clickable to focus input
- Required fields marked

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Labels Present: _______________

---

### TC-068: Keyboard Navigation

**Description**: Verify form is keyboard accessible

**Steps**:
1. Tab through form
2. Enter to submit

**Expected Result**:
- Logical tab order
- All fields reachable
- Enter submits form

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard Nav: _______________

---

### TC-069: Focus Indicators

**Description**: Verify visible focus indicators

**Steps**:
1. Tab through interactive elements
2. Observe focus rings

**Expected Result**:
- Clear focus indicators
- Consistent styling
- High contrast

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Focus Visible: _______________

---

### TC-070: Error Announcements

**Description**: Verify errors announced to screen readers

**Steps**:
1. Submit form with errors
2. Check aria-live regions

**Expected Result**:
- Errors announced
- Focus moves to first error
- Clear error descriptions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- A11y Errors: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 70
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Product Counts
- Total Products: _______________
- Active: _______________
- Draft: _______________
- Archived: _______________

### Additional Observations
_______________________________________________
_______________________________________________

## Recommendations

1. **UX Improvements**:
   - Bulk edit functionality
   - Duplicate product feature
   - Version history for products

2. **Performance**:
   - Implement virtual scrolling for large lists
   - Optimize image loading
   - Cache product data

3. **Features**:
   - Product preview before save
   - Scheduled publishing
   - SEO metadata fields

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
