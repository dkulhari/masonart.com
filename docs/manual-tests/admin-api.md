# Manual Test: Admin API Routes

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **API Base URL**: http://localhost:3000/api
- **Admin Credentials**: Required (admin or super-admin role)

## Prerequisites
- [ ] Dev server running at http://localhost:3000 (API) and http://localhost:3001 (Frontend)
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running (`docker compose up -d`)
- [ ] Admin user account created with role 'admin' or 'super-admin'
- [ ] API testing tool ready (Postman, Insomnia, cURL, or browser DevTools)
- [ ] Test products and orders seeded in database

## Overview
This document covers manual testing of Admin API routes:
- Products Admin API (`/api/admin/products`)
- Orders Admin API (`/api/admin/orders`)

---

## Admin Products API

### TC-001: List Products (Authenticated Admin)

**Description**: Verify admin can list all products including drafts

**Endpoint**: `GET /api/admin/products`

**Steps**:
1. Sign in as admin user
2. Send GET request to `/api/admin/products`
3. Include session cookie in request

**Expected Result**:
- Status: 200
- Returns paginated list of products
- Includes draft, active, and archived products
- Response has: items, total, page, pageSize, totalPages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Products: _______________
- Status Codes Present: _______________

---

### TC-002: List Products - Unauthorized Access

**Description**: Verify non-admin users cannot access admin products API

**Endpoint**: `GET /api/admin/products`

**Steps**:
1. Sign out or use a customer account
2. Send GET request to `/api/admin/products`

**Expected Result**:
- Status: 401 or 403
- Error message indicates authorization required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-003: List Products - Filter by Status

**Description**: Verify products can be filtered by status

**Endpoint**: `GET /api/admin/products?status=active`

**Steps**:
1. Send GET request with status parameter
2. Test values: `draft`, `active`, `archived`

**Expected Result**:
- Status: 200
- All returned products have matching status
- Total count reflects filtered results

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Draft Count: _______________
- Active Count: _______________
- Archived Count: _______________

---

### TC-004: List Products - Search

**Description**: Verify products can be searched by title, SKU, or slug

**Endpoint**: `GET /api/admin/products?search=ocean`

**Steps**:
1. Send GET request with search parameter
2. Verify results match search term

**Expected Result**:
- Status: 200
- Results contain search term in title, SKU, or slug
- Case-insensitive matching

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search Results: _______________

---

### TC-005: List Products - Pagination

**Description**: Verify pagination works correctly

**Endpoint**: `GET /api/admin/products?page=2&pageSize=10`

**Steps**:
1. Send GET request with page and pageSize
2. Verify response pagination metadata

**Expected Result**:
- Status: 200
- Correct page number in response
- hasNextPage and hasPreviousPage accurate
- Items count matches pageSize (or remaining)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page: _______________
- Has Next: _______________

---

### TC-006: List Products - Sorting

**Description**: Verify products can be sorted

**Endpoint**: `GET /api/admin/products?sortBy=title&sortOrder=asc`

**Test Cases**:
- `sortBy=createdAt&sortOrder=desc` (default)
- `sortBy=title&sortOrder=asc`
- `sortBy=basePrice&sortOrder=desc`
- `sortBy=sku&sortOrder=asc`

**Expected Result**:
- Status: 200
- Products sorted according to parameters
- Order is consistent

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sort Working: _______________

---

### TC-007: Get Product by ID (Admin)

**Description**: Verify admin can get full product details with variants

**Endpoint**: `GET /api/admin/products/:id`

**Steps**:
1. Get a product ID from the list
2. Send GET request to `/api/admin/products/{id}`

**Expected Result**:
- Status: 200
- Returns complete product object
- Includes variants array
- All fields populated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Has Variants: _______________

---

### TC-008: Get Product - Invalid ID Format

**Description**: Verify proper error for invalid UUID format

**Endpoint**: `GET /api/admin/products/invalid-id`

**Steps**:
1. Send GET request with non-UUID ID

**Expected Result**:
- Status: 400
- Error: "Invalid product ID format"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-009: Get Product - Not Found

**Description**: Verify proper error for non-existent product

**Endpoint**: `GET /api/admin/products/00000000-0000-0000-0000-000000000000`

**Steps**:
1. Send GET request with valid UUID that doesn't exist

**Expected Result**:
- Status: 404
- Error: "Product not found"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-010: Create Product - Valid Data

**Description**: Verify admin can create a new product

**Endpoint**: `POST /api/admin/products`

**Request Body**:
```json
{
  "sku": "TEST-SKU-001",
  "title": "Test Product Title",
  "slug": "test-product-title",
  "description": "Test product description",
  "basePrice": "1999.00",
  "orientation": "landscape",
  "status": "draft",
  "styles": ["minimalist"],
  "subjects": ["nature"],
  "colors": ["blue"]
}
```

**Expected Result**:
- Status: 201
- Message: "Product created successfully"
- Returns created product with ID

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product ID: _______________

---

### TC-011: Create Product - Duplicate SKU

**Description**: Verify duplicate SKU is rejected

**Endpoint**: `POST /api/admin/products`

**Steps**:
1. Try to create product with existing SKU

**Expected Result**:
- Status: 409
- Error: "SKU already exists"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-012: Create Product - Duplicate Slug

**Description**: Verify duplicate slug is rejected

**Endpoint**: `POST /api/admin/products`

**Steps**:
1. Try to create product with existing slug

**Expected Result**:
- Status: 409
- Error: "Slug already exists"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-013: Create Product - Missing Required Fields

**Description**: Verify validation for required fields

**Endpoint**: `POST /api/admin/products`

**Test Cases**:
- Missing SKU
- Missing title
- Missing slug
- Missing basePrice
- Missing orientation

**Expected Result**:
- Status: 400
- Validation error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation Errors: _______________

---

### TC-014: Create Product - Invalid Slug Format

**Description**: Verify slug format validation

**Endpoint**: `POST /api/admin/products`

**Test Cases**:
- Slug with uppercase: "Test-Product"
- Slug with spaces: "test product"
- Slug with special chars: "test@product!"

**Expected Result**:
- Status: 400
- Error indicates invalid slug format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-015: Update Product

**Description**: Verify admin can update a product

**Endpoint**: `PATCH /api/admin/products/:id`

**Request Body**:
```json
{
  "title": "Updated Product Title",
  "basePrice": "2499.00"
}
```

**Expected Result**:
- Status: 200
- Message: "Product updated successfully"
- Returns updated product
- updatedAt timestamp changed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Updated At Changed: _______________

---

### TC-016: Update Product - Not Found

**Description**: Verify error for updating non-existent product

**Endpoint**: `PATCH /api/admin/products/00000000-0000-0000-0000-000000000000`

**Expected Result**:
- Status: 404
- Error: "Product not found"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-017: Delete Product (Archive)

**Description**: Verify admin can archive a product (soft delete)

**Endpoint**: `DELETE /api/admin/products/:id`

**Steps**:
1. Create or identify a test product
2. Send DELETE request

**Expected Result**:
- Status: 200
- Message: "Product archived successfully"
- Product status changed to "archived"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product Archived: _______________

---

### TC-018: Create Product Variant

**Description**: Verify admin can add a variant to a product

**Endpoint**: `POST /api/admin/products/:id/variants`

**Request Body**:
```json
{
  "sizeLabel": "24x36 inches",
  "widthInches": 24,
  "heightInches": 36,
  "price": "2999.00",
  "stockQuantity": 50,
  "isInStock": true
}
```

**Expected Result**:
- Status: 201
- Message: "Variant created successfully"
- Returns new variant

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Variant ID: _______________

---

### TC-019: Update Product Variant

**Description**: Verify admin can update a variant

**Endpoint**: `PATCH /api/admin/products/:id/variants/:variantId`

**Request Body**:
```json
{
  "price": "3499.00",
  "stockQuantity": 25
}
```

**Expected Result**:
- Status: 200
- Message: "Variant updated successfully"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Updated: _______________

---

### TC-020: Delete Product Variant

**Description**: Verify admin can delete a variant (soft delete)

**Endpoint**: `DELETE /api/admin/products/:id/variants/:variantId`

**Expected Result**:
- Status: 200
- Message: "Variant deleted successfully"
- Variant isActive set to false

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Variant Deactivated: _______________

---

## Admin Orders API

### TC-021: List Orders (Authenticated Admin)

**Description**: Verify admin can list all orders

**Endpoint**: `GET /api/admin/orders`

**Steps**:
1. Sign in as admin
2. Send GET request to `/api/admin/orders`

**Expected Result**:
- Status: 200
- Returns paginated list of orders
- Includes customer info
- Response has: items, total, page, pageSize

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Orders: _______________

---

### TC-022: List Orders - Filter by Status

**Description**: Verify orders can be filtered by status

**Endpoint**: `GET /api/admin/orders?status=processing`

**Test Cases**:
- `status=pending`
- `status=processing`
- `status=shipped`
- `status=delivered`
- `status=cancelled`

**Expected Result**:
- Status: 200
- All returned orders have matching status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Working: _______________

---

### TC-023: List Orders - Filter by Payment Status

**Description**: Verify orders can be filtered by payment status

**Endpoint**: `GET /api/admin/orders?paymentStatus=paid`

**Test Cases**:
- `paymentStatus=pending`
- `paymentStatus=paid`
- `paymentStatus=failed`
- `paymentStatus=refunded`

**Expected Result**:
- Status: 200
- All returned orders have matching payment status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filter Working: _______________

---

### TC-024: List Orders - Date Range Filter

**Description**: Verify orders can be filtered by date range

**Endpoint**: `GET /api/admin/orders?dateFrom=2024-01-01&dateTo=2024-01-31`

**Expected Result**:
- Status: 200
- All orders within date range
- Created at timestamps within range

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Date Filter Working: _______________

---

### TC-025: List Orders - Search

**Description**: Verify orders can be searched

**Endpoint**: `GET /api/admin/orders?search=MA-2024`

**Test Cases**:
- Search by order number
- Search by customer email
- Search by customer phone

**Expected Result**:
- Status: 200
- Results match search criteria

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search Working: _______________

---

### TC-026: Get Order Statistics

**Description**: Verify admin can get order statistics

**Endpoint**: `GET /api/admin/orders/stats`

**Expected Result**:
- Status: 200
- Returns:
  - byStatus (count per status)
  - byPaymentStatus (count per payment status)
  - totalRevenue
  - todayOrders
  - monthRevenue

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total Revenue: _______________
- Today's Orders: _______________

---

### TC-027: Get Order by ID

**Description**: Verify admin can get full order details

**Endpoint**: `GET /api/admin/orders/:id`

**Expected Result**:
- Status: 200
- Returns complete order with:
  - Order items with product/variant details
  - Customer information
  - Shipping address
  - Payment details
  - Timestamps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Has Items: _______________
- Has Address: _______________

---

### TC-028: Get Order by Order Number

**Description**: Verify admin can get order by order number

**Endpoint**: `GET /api/admin/orders/MA-20240115-001`

**Expected Result**:
- Status: 200
- Returns order details
- Order number matches

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Found by Order Number: _______________

---

### TC-029: Update Order

**Description**: Verify admin can update order details

**Endpoint**: `PATCH /api/admin/orders/:id`

**Request Body**:
```json
{
  "internalNotes": "Updated note from admin",
  "shippingMethod": "express"
}
```

**Expected Result**:
- Status: 200
- Message: "Order updated successfully"
- Fields updated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Updated: _______________

---

### TC-030: Update Order Status

**Description**: Verify admin can update order status

**Endpoint**: `PATCH /api/admin/orders/:id/status`

**Request Body**:
```json
{
  "status": "shipped",
  "reason": "Package handed to courier"
}
```

**Test Status Transitions**:
- `pending` -> `confirmed`
- `confirmed` -> `processing`
- `processing` -> `shipped`
- `shipped` -> `delivered`
- Any -> `cancelled`

**Expected Result**:
- Status: 200
- Message: "Order status updated successfully"
- Appropriate timestamp set (shippedAt, deliveredAt, cancelledAt)
- Reason appended to internal notes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Changed: _______________
- Timestamp Set: _______________

---

### TC-031: Update Shipping Details

**Description**: Verify admin can update shipping details

**Endpoint**: `PATCH /api/admin/orders/:id/shipping`

**Request Body**:
```json
{
  "carrier": "Delhivery",
  "trackingNumber": "DEL123456789",
  "trackingUrl": "https://www.delhivery.com/track/DEL123456789",
  "awbNumber": "AWB123456",
  "estimatedDelivery": "2024-01-20"
}
```

**Expected Result**:
- Status: 200
- Message: "Shipping details updated successfully"
- Shipping details merged with existing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tracking Number Set: _______________

---

### TC-032: Initiate Refund - Full Refund

**Description**: Verify admin can initiate a full refund

**Endpoint**: `POST /api/admin/orders/:id/refund`

**Request Body**:
```json
{
  "reason": "Customer requested cancellation"
}
```

**Prerequisites**:
- Order must have `paymentStatus: "paid"`
- Order must have valid `paymentDetails.paymentId`

**Expected Result**:
- Status: 200
- Message: "Refund initiated successfully"
- Returns refund details
- Order status updated to "refunded"
- Payment status updated to "refunded"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Refund ID: _______________

---

### TC-033: Initiate Refund - Partial Refund

**Description**: Verify admin can initiate a partial refund

**Endpoint**: `POST /api/admin/orders/:id/refund`

**Request Body**:
```json
{
  "amount": 1000.00,
  "reason": "Partial refund for damaged item"
}
```

**Expected Result**:
- Status: 200
- Refund amount matches request
- Payment status: "partially_refunded"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Partial Refund Processed: _______________

---

### TC-034: Refund - Order Not Paid

**Description**: Verify refund rejected for unpaid order

**Endpoint**: `POST /api/admin/orders/:id/refund`

**Steps**:
1. Find an order with `paymentStatus: "pending"`
2. Try to initiate refund

**Expected Result**:
- Status: 400
- Error: "Order has not been paid or already refunded"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-035: Refund - Amount Exceeds Total

**Description**: Verify refund rejected if amount exceeds order total

**Endpoint**: `POST /api/admin/orders/:id/refund`

**Request Body**:
```json
{
  "amount": 999999.00,
  "reason": "Test"
}
```

**Expected Result**:
- Status: 400
- Error: "Refund amount cannot exceed order total"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

## Error Handling

### TC-036: Unsupported HTTP Method

**Description**: Verify proper error for unsupported methods

**Endpoint**: `PUT /api/admin/products`

**Expected Result**:
- Status: 404 or 405
- Method not allowed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-037: Malformed JSON

**Description**: Verify proper error for malformed request body

**Endpoint**: `POST /api/admin/products`

**Request Body** (invalid JSON):
```
{invalid json
```

**Expected Result**:
- Status: 400
- JSON parse error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-038: Missing Content-Type Header

**Description**: Verify proper error for missing Content-Type

**Endpoint**: `POST /api/admin/products`

**Steps**:
1. Send POST without Content-Type header

**Expected Result**:
- Status: 400
- Error indicates missing Content-Type

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

## Performance Testing

### TC-039: Response Time - Products List

**Description**: Verify acceptable response time for products listing

**Endpoint**: `GET /api/admin/products`

**Expected Result**:
- Response time < 500ms
- Consistent performance

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-040: Response Time - Orders List

**Description**: Verify acceptable response time for orders listing

**Endpoint**: `GET /api/admin/orders`

**Expected Result**:
- Response time < 500ms
- Consistent performance

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-041: Response Time - Order Statistics

**Description**: Verify acceptable response time for statistics

**Endpoint**: `GET /api/admin/orders/stats`

**Expected Result**:
- Response time < 1 second
- Aggregations computed efficiently

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 41
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Database Version: _______________
- API Framework: Hono

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Security**:
   - Verify RBAC is enforced on all admin endpoints
   - Ensure sensitive data not exposed in error messages
   - Log all admin actions for audit trail

2. **Data Integrity**:
   - Verify cache invalidation after mutations
   - Check constraint handling (unique SKU/slug)
   - Test concurrent update handling

3. **Monitoring**:
   - Log API response times
   - Track error rates per endpoint
   - Monitor refund success rate

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
