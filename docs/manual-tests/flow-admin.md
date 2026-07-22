# Manual Test: Admin Product and Order Management User Journey Flow

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Base URL**: http://localhost:3001
- **Admin URL**: http://localhost:3001/admin

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test data (`bun run db:seed`)
- [ ] Docker services (PostgreSQL, Redis) running (`docker compose up -d`)
- [ ] Admin user account created:
  - Email: admin@chobi.art
  - Role: admin or super-admin
- [ ] Test products and orders in database
- [ ] Non-admin user account for access control testing

## Overview
This document covers end-to-end manual testing of the complete admin management user journeys:
1. Admin logs in and accesses admin dashboard
2. Admin navigates to products section
3. Admin creates, views, edits, and archives products
4. Admin navigates to orders section
5. Admin views, filters, and manages orders
6. Admin updates order status and shipping details

---

## Admin Authentication Access Flow

### TC-001: Redirect Unauthenticated Users from Admin

**Description**: Verify admin pages require authentication

**Steps**:
1. Clear browser session/cookies
2. Navigate directly to /admin

**Expected Result**:
- Redirects to /auth/login
- URL contains redirect parameter to /admin

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Redirect Non-Admin Users from Admin

**Description**: Verify role-based access control

**Steps**:
1. Log in as regular user (role: customer)
2. Navigate to /admin

**Expected Result**:
- Access denied (403 or redirect)
- Does not show admin dashboard
- May redirect to home with error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-003: Allow Admin Users to Access Dashboard

**Description**: Verify admin access

**Steps**:
1. Log in as admin user (role: admin)
2. Navigate to /admin

**Expected Result**:
- Admin dashboard loads
- "Dashboard" or "Admin Dashboard" heading visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Display Admin Navigation Menu

**Description**: Verify admin sidebar navigation

**Steps**:
1. Log in as admin
2. Navigate to /admin
3. Check navigation links

**Expected Result**:
- Products link (/admin/products) visible
- Orders link (/admin/orders) visible
- Dashboard link visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Dashboard Flow

### TC-005: Display Dashboard with Stats Overview

**Description**: Verify dashboard metrics

**Steps**:
1. Log in as admin
2. Navigate to /admin
3. Check for key metrics

**Expected Result**:
- Dashboard displays overview stats
- May include: total products, orders, revenue
- Refresh button may be available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-006: Navigate to Products from Dashboard

**Description**: Verify products navigation

**Steps**:
1. On admin dashboard
2. Click Products link in sidebar

**Expected Result**:
- Navigates to /admin/products
- Products list page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Navigate to Orders from Dashboard

**Description**: Verify orders navigation

**Steps**:
1. On admin dashboard
2. Click Orders link in sidebar

**Expected Result**:
- Navigates to /admin/orders
- Orders list page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Products List Management Flow

### TC-008: Display Products List

**Description**: Verify products table

**Steps**:
1. Navigate to /admin/products
2. Observe products display

**Expected Result**:
- Products table/grid is visible
- Product titles displayed
- Product status badges visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Filter Products by Status

**Description**: Verify status filtering

**Steps**:
1. On /admin/products
2. Click status filter dropdown
3. Select "Draft"

**Expected Result**:
- URL updates to include `status=draft`
- Only draft products shown
- Active products hidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: Search Products by Title

**Description**: Verify product search

**Steps**:
1. On /admin/products
2. Locate search input
3. Enter "Ocean"
4. Press Enter

**Expected Result**:
- Products filtered by search term
- Only products with "Ocean" in title shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-011: Navigate to Create New Product

**Description**: Verify create product navigation

**Steps**:
1. On /admin/products
2. Click "Add Product" or "New Product" button

**Expected Result**:
- Navigates to /admin/products/new
- Create product form loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Navigate to Product Detail/Edit

**Description**: Verify product edit navigation

**Steps**:
1. On /admin/products
2. Click on a product row or edit button

**Expected Result**:
- Navigates to /admin/products/{id}
- Product edit form loads with existing data

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Create Product Flow

### TC-013: Display Create Product Form

**Description**: Verify create form elements

**Steps**:
1. Navigate to /admin/products/new
2. Check form fields

**Expected Result**:
- Title input visible
- Description textarea visible
- Base price input visible
- SKU input visible
- Submit button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Create New Product

**Description**: Verify product creation

**Steps**:
1. On /admin/products/new
2. Fill form:
   - Title: New E2E Test Poster
   - Description: Created during E2E testing
   - Base Price: 2999
   - SKU: E2E-TEST-001
3. Click "Create" or "Save" button

**Expected Result**:
- Form submits successfully
- Success message appears
- May redirect to products list or product detail

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Validation Errors for Required Fields

**Description**: Verify form validation

**Steps**:
1. On /admin/products/new
2. Leave all fields empty
3. Click submit button

**Expected Result**:
- Validation errors displayed
- "required" messages appear
- Form does not submit

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Edit Product Flow

### TC-016: Display Product Details in Edit Form

**Description**: Verify pre-filled form

**Steps**:
1. Navigate to /admin/products/{existing-product-id}
2. Check form fields

**Expected Result**:
- Title field contains existing product title
- Description pre-filled
- Price pre-filled
- All existing data loaded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Update Product and Show Success

**Description**: Verify product update

**Steps**:
1. On product edit page
2. Change title to "Updated Test Poster"
3. Click "Save" or "Update" button

**Expected Result**:
- Form submits successfully
- Success message: "Product updated" or similar
- Changes are saved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-018: Navigate Back to Products List

**Description**: Verify back navigation

**Steps**:
1. On product edit page
2. Click "Back" or "Cancel" button

**Expected Result**:
- Navigates to /admin/products
- Products list loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Orders List Management Flow

### TC-019: Display Orders List

**Description**: Verify orders table

**Steps**:
1. Navigate to /admin/orders
2. Observe orders display

**Expected Result**:
- Orders table is visible
- Order numbers displayed
- Customer names/emails visible
- Status badges displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Filter Orders by Status

**Description**: Verify order status filtering

**Steps**:
1. On /admin/orders
2. Click status filter dropdown
3. Select "Processing"

**Expected Result**:
- URL updates to include `status=processing`
- Only processing orders shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Search Orders by Order Number

**Description**: Verify order search

**Steps**:
1. On /admin/orders
2. Enter order number in search
3. Press Enter

**Expected Result**:
- Orders filtered by search term
- Matching order displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-022: Navigate to Order Detail

**Description**: Verify order detail navigation

**Steps**:
1. On /admin/orders
2. Click on an order row

**Expected Result**:
- Navigates to /admin/orders/{id}
- Order detail page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-023: Display Order Status Badges

**Description**: Verify status badge colors

**Steps**:
1. On /admin/orders
2. Observe status badges for different orders

**Expected Result**:
- Different statuses have different colors
- Processing, Shipped, etc. are distinguishable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Order Detail Management Flow

### TC-024: Display Order Details

**Description**: Verify order detail page

**Steps**:
1. Navigate to /admin/orders/{id}
2. Check displayed information

**Expected Result**:
- Order number visible
- Customer name/email visible
- Order total visible
- Order date visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Display Order Items

**Description**: Verify order items list

**Steps**:
1. On order detail page
2. Check order items section

**Expected Result**:
- Product titles listed
- Quantities shown
- Prices displayed
- Line totals correct

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-026: Update Order Status

**Description**: Verify status update

**Steps**:
1. On order detail page
2. Find status dropdown or "Update Status" button
3. Change status to "Shipped"
4. Save if required

**Expected Result**:
- Status can be changed
- Success message appears
- New status is displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: Add Shipping Tracking Information

**Description**: Verify tracking entry

**Steps**:
1. On order detail page
2. Find tracking number input
3. Enter: TRACK123456789
4. Select carrier (if available)
5. Save tracking

**Expected Result**:
- Tracking number saved
- Carrier saved
- May trigger shipment notification

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Navigate Back to Orders List

**Description**: Verify back navigation

**Steps**:
1. On order detail page
2. Click "Back" button

**Expected Result**:
- Navigates to /admin/orders
- Orders list loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Complete Admin User Journey Tests

### TC-029: Journey - Dashboard to Products to Create to List

**Description**: Complete product management journey

**Steps**:
1. Log in as admin, go to /admin
2. Click Products link
3. Verify products list
4. Click "Add Product"
5. Fill product form
6. Click "Back" to return to list

**Expected Result**:
- Each step transitions smoothly
- Navigation works correctly
- Product list shows after returning

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: Journey - Dashboard to Orders to Filter to Detail

**Description**: Complete order management journey

**Steps**:
1. Start at /admin
2. Click Orders link
3. View orders list
4. Click on an order row
5. View order detail
6. Click "Back" to return to list

**Expected Result**:
- Each step works correctly
- Order details are visible
- Navigation is preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Journey - Products Edit to Orders Cross-Navigation

**Description**: Verify cross-section navigation

**Steps**:
1. Go to /admin/products
2. Click on a product to edit
3. From sidebar, click Orders link
4. Verify on /admin/orders
5. Click Products link
6. Verify on /admin/products

**Expected Result**:
- Can navigate between sections freely
- No loss of admin state
- All navigation works from any admin page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Journey - Search Product to View to Back

**Description**: Verify search and navigation flow

**Steps**:
1. Go to /admin/products
2. Search for a product
3. Click on search result
4. View product detail
5. Click browser back button
6. Verify on products list

**Expected Result**:
- Search works correctly
- Product detail loads
- Back navigation works
- Products list still visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Responsive Design Flow

### TC-033: Admin on Tablet Viewport

**Description**: Verify tablet layout

**Steps**:
1. Set viewport to 768x1024
2. Navigate to /admin/products

**Expected Result**:
- Products list visible
- Layout adapts to tablet width
- All functionality accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Admin on Desktop Viewport

**Description**: Verify desktop layout

**Steps**:
1. Set viewport to 1920x1080
2. Navigate to /admin/products

**Expected Result**:
- Full sidebar visible
- Product data displays with all columns
- No horizontal scrolling needed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-035: Admin on Mobile Viewport

**Description**: Verify mobile navigation

**Steps**:
1. Set viewport to 375x667
2. Navigate to /admin

**Expected Result**:
- Mobile menu accessible (may be collapsed)
- Can access Products and Orders
- Content is readable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Accessibility Flow

### TC-036: Heading Hierarchy on Products Page

**Description**: Verify heading structure

**Steps**:
1. Navigate to /admin/products
2. Check for h1 element

**Expected Result**:
- h1 is present (e.g., "Products")
- Logical heading hierarchy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Heading Hierarchy on Orders Page

**Description**: Verify heading structure on orders

**Steps**:
1. Navigate to /admin/orders
2. Check for h1 element

**Expected Result**:
- h1 is present (e.g., "Orders")

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Keyboard Navigation Through Admin

**Description**: Verify keyboard accessibility

**Steps**:
1. Navigate to /admin/products
2. Use Tab to navigate through elements
3. Navigate to sidebar links

**Expected Result**:
- Focus indicators visible
- Tab order is logical
- All interactive elements focusable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Form Labels on Product Form

**Description**: Verify form accessibility

**Steps**:
1. Navigate to /admin/products/new
2. Check labels with DevTools

**Expected Result**:
- `<label for="title">` exists
- Labels properly associated with inputs

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Performance Flow

### TC-040: Products Page Load Time

**Description**: Verify products page performance

**Steps**:
1. Open DevTools (Network tab)
2. Navigate to /admin/products
3. Measure time until products visible

**Expected Result**:
- Page loads within 5 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

### TC-041: Orders Page Load Time

**Description**: Verify orders page performance

**Steps**:
1. Navigate to /admin/orders
2. Measure load time

**Expected Result**:
- Page loads within 5 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

### TC-042: No JavaScript Errors During Navigation

**Description**: Verify no JS errors

**Steps**:
1. Open DevTools Console
2. Navigate: /admin -> /admin/products -> /admin/orders
3. Check for errors

**Expected Result**:
- No critical JavaScript errors
- Network errors handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Admin Error Handling Flow

### TC-043: Handle Non-Existent Product

**Description**: Verify 404 for missing product

**Steps**:
1. Navigate to /admin/products/nonexistent-id
2. Observe behavior

**Expected Result**:
- "Not Found" message or redirect
- No crash or unhandled error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-044: Handle Non-Existent Order

**Description**: Verify 404 for missing order

**Steps**:
1. Navigate to /admin/orders/nonexistent-id
2. Observe behavior

**Expected Result**:
- "Not Found" message or redirect
- Error handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-045: Handle API Errors on Products List

**Description**: Verify API error handling

**Steps**:
1. Simulate API failure (network offline or mock)
2. Navigate to /admin/products
3. Observe error state

**Expected Result**:
- Error message displayed
- User-friendly error state
- Retry option may be available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Bulk Actions Flow

### TC-046: Select Multiple Products

**Description**: Verify bulk selection

**Steps**:
1. Navigate to /admin/products
2. Find checkboxes on product rows
3. Select first two products

**Expected Result**:
- Checkboxes can be selected
- Selection state visible
- Bulk action button may appear

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-047: Select All Products

**Description**: Verify select all functionality

**Steps**:
1. Navigate to /admin/products
2. Find "Select All" checkbox in header
3. Click it

**Expected Result**:
- All visible product checkboxes selected
- Select all checkbox checked

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Admin Data Export Flow

### TC-048: Export Option on Orders Page

**Description**: Verify export availability

**Steps**:
1. Navigate to /admin/orders
2. Look for "Export" button

**Expected Result**:
- Export button visible (if implemented)
- Click triggers export or shows options

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BUG-001 | (Example) Product SKU validation too strict | Medium | Open |

---

## Summary

- **Total Test Cases**: 48
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| Product Owner | | | |
