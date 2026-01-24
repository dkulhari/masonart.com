# Manual Test: Products API

## Test Environment
- **Browser/Tool**: Postman / cURL / Thunder Client
- **API Base URL**: http://localhost:3000
- **Date**: 2026-01-16
- **Tester**: Manual QA

## Prerequisites
- [x] Dev server running at http://localhost:3000
- [x] Database seeded with test data
- [ ] Admin user credentials available
- [ ] Authentication token for admin user

## Test Cases

### TC-001: List All Products (Public)

**Description**: Verify that unauthenticated users can retrieve a list of active products

**Steps**:
1. Send GET request to `/api/products`
2. Verify response status is 200
3. Check response contains array of products

**Expected Result**:
- Status code: 200
- Response body contains:
  - `products` array with product objects
  - Each product has: `id`, `sku`, `title`, `slug`, `description`, `basePrice`, `status`, `orientation`, `images`, etc.
  - Pagination metadata (if implemented)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-002: Filter Products by Status

**Description**: Verify filtering products by status (active, draft, archived)

**Steps**:
1. Send GET request to `/api/products?status=active`
2. Verify all returned products have status "active"
3. Repeat with `status=draft` and `status=archived`

**Expected Result**:
- Status code: 200
- All products in response have the specified status
- Draft products should only be visible to authenticated admin users

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-003: Filter Products by Orientation

**Description**: Verify filtering products by orientation (square, portrait, landscape, panoramic, round)

**Steps**:
1. Send GET request to `/api/products?orientation=portrait`
2. Verify all returned products have orientation "portrait"
3. Test with other orientations: square, landscape, panoramic, round

**Expected Result**:
- Status code: 200
- All products match the specified orientation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-004: Filter Products by Style

**Description**: Verify filtering products by art style

**Steps**:
1. Send GET request to `/api/products?style=minimalist`
2. Verify returned products include "minimalist" in their styles array
3. Test with other styles (wabi-sabi, abstract, botanical, etc.)

**Expected Result**:
- Status code: 200
- Products contain the specified style in their styles array

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-005: Filter Products by Subject

**Description**: Verify filtering products by subject matter

**Steps**:
1. Send GET request to `/api/products?subject=nature`
2. Verify returned products include "nature" in their subjects array
3. Test with other subjects

**Expected Result**:
- Status code: 200
- Products contain the specified subject in their subjects array

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-006: Filter Products by Color

**Description**: Verify filtering products by dominant colors

**Steps**:
1. Send GET request to `/api/products?color=blue`
2. Verify returned products include "blue" in their colors array
3. Test with other colors (red, green, black, white, etc.)

**Expected Result**:
- Status code: 200
- Products contain the specified color in their colors array

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-007: Filter Products by Price Range

**Description**: Verify filtering products by minimum and maximum price

**Steps**:
1. Send GET request to `/api/products?minPrice=500&maxPrice=2000`
2. Verify all returned products have basePrice >= 500 and <= 2000
3. Test edge cases (minPrice only, maxPrice only, invalid ranges)

**Expected Result**:
- Status code: 200
- All products fall within the specified price range
- Invalid price ranges return appropriate error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-008: Search Products by Text

**Description**: Verify text search across product titles and descriptions

**Steps**:
1. Send GET request to `/api/products?search=abstract`
2. Verify returned products contain "abstract" in title or description
3. Test case-insensitive search
4. Test with special characters

**Expected Result**:
- Status code: 200
- Results include products matching the search term
- Search is case-insensitive

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-009: Sort Products by Price

**Description**: Verify sorting products by price (ascending and descending)

**Steps**:
1. Send GET request to `/api/products?sortBy=price&sortOrder=asc`
2. Verify products are sorted by basePrice in ascending order
3. Send request with `sortOrder=desc`
4. Verify products are sorted in descending order

**Expected Result**:
- Status code: 200
- Products are correctly sorted by price
- First product has lowest/highest price respectively

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-010: Pagination

**Description**: Verify pagination works correctly with page and limit parameters

**Steps**:
1. Send GET request to `/api/products?page=1&limit=10`
2. Verify response contains exactly 10 products (if available)
3. Send request for page 2
4. Verify different products are returned
5. Test with invalid page numbers (0, negative, non-numeric)

**Expected Result**:
- Status code: 200
- Correct number of products per page
- Navigation between pages works correctly
- Invalid pagination parameters return appropriate error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-011: Combine Multiple Filters

**Description**: Verify multiple filters can be applied simultaneously

**Steps**:
1. Send GET request to `/api/products?status=active&orientation=portrait&minPrice=1000&style=minimalist`
2. Verify all returned products match ALL specified criteria

**Expected Result**:
- Status code: 200
- All products match every filter criterion
- Empty array returned if no products match

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-012: Get Single Product by ID

**Description**: Verify retrieving a single product by its UUID

**Steps**:
1. Get a product ID from the list endpoint
2. Send GET request to `/api/products/{product_id}`
3. Verify correct product details are returned

**Expected Result**:
- Status code: 200
- Response contains complete product details
- Product ID matches the requested ID

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-013: Get Non-Existent Product

**Description**: Verify error handling for invalid product ID

**Steps**:
1. Send GET request to `/api/products/00000000-0000-0000-0000-000000000000`
2. Verify appropriate error response

**Expected Result**:
- Status code: 404
- Error message indicates product not found
- Response format matches error schema

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-014: Get Product with Invalid UUID Format

**Description**: Verify error handling for malformed product ID

**Steps**:
1. Send GET request to `/api/products/invalid-uuid-format`
2. Verify appropriate error response

**Expected Result**:
- Status code: 400
- Error message indicates invalid UUID format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-015: Get Product Variants

**Description**: Verify retrieving all size variants for a product

**Steps**:
1. Get a product ID from the list endpoint
2. Send GET request to `/api/products/{product_id}/variants`
3. Verify variant details are returned

**Expected Result**:
- Status code: 200
- Response contains array of product variants
- Each variant has: `id`, `productId`, `sizeLabel`, `widthCm`, `heightCm`, `price`, `stock`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-016: Get Variants for Non-Existent Product

**Description**: Verify error handling when requesting variants for invalid product

**Steps**:
1. Send GET request to `/api/products/00000000-0000-0000-0000-000000000000/variants`
2. Verify appropriate error response

**Expected Result**:
- Status code: 404
- Error message indicates product not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-017: Create Product (Admin Only) - Success

**Description**: Verify admin can create a new product

**Steps**:
1. Authenticate as admin user and obtain token
2. Send POST request to `/api/products` with valid product data:
   ```json
   {
     "sku": "TEST-001",
     "title": "Test Product",
     "slug": "test-product",
     "description": "Test description",
     "basePrice": 999.99,
     "status": "draft",
     "orientation": "square",
     "images": ["https://example.com/image.jpg"],
     "styles": ["minimalist"],
     "subjects": ["abstract"],
     "colors": ["blue"]
   }
   ```
3. Include admin authentication token in headers

**Expected Result**:
- Status code: 201
- Response contains created product with generated ID
- Product is saved in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-018: Create Product Without Authentication

**Description**: Verify unauthenticated requests are rejected

**Steps**:
1. Send POST request to `/api/products` without authentication token
2. Include valid product data in body

**Expected Result**:
- Status code: 401
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-019: Create Product as Non-Admin User

**Description**: Verify regular users cannot create products

**Steps**:
1. Authenticate as regular customer user
2. Send POST request to `/api/products` with valid product data
3. Include customer authentication token

**Expected Result**:
- Status code: 403
- Error message indicates insufficient permissions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-020: Create Product with Invalid Data

**Description**: Verify validation of required fields and data types

**Steps**:
1. Authenticate as admin user
2. Send POST request to `/api/products` with invalid data:
   - Missing required fields (sku, title, basePrice)
   - Invalid price (negative or non-numeric)
   - Invalid enum values (status, orientation)
   - Invalid data types
3. Test each validation rule separately

**Expected Result**:
- Status code: 400
- Error message describes validation failures
- Response includes field-level error details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-021: Create Product with Duplicate SKU

**Description**: Verify SKU uniqueness constraint

**Steps**:
1. Authenticate as admin user
2. Create a product with SKU "TEST-DUP"
3. Attempt to create another product with the same SKU "TEST-DUP"

**Expected Result**:
- First request: 201 Created
- Second request: 400 or 409 Conflict
- Error message indicates duplicate SKU

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-022: Update Product (Admin Only) - Success

**Description**: Verify admin can update existing product

**Steps**:
1. Authenticate as admin user
2. Create or get an existing product ID
3. Send PUT request to `/api/products/{product_id}` with updated data:
   ```json
   {
     "title": "Updated Product Title",
     "basePrice": 1299.99,
     "status": "active"
   }
   ```

**Expected Result**:
- Status code: 200
- Response contains updated product data
- Changes are persisted in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-023: Update Product Without Authentication

**Description**: Verify unauthenticated update requests are rejected

**Steps**:
1. Send PUT request to `/api/products/{product_id}` without authentication token

**Expected Result**:
- Status code: 401
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024: Update Non-Existent Product

**Description**: Verify error handling when updating non-existent product

**Steps**:
1. Authenticate as admin user
2. Send PUT request to `/api/products/00000000-0000-0000-0000-000000000000`

**Expected Result**:
- Status code: 404
- Error message indicates product not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-025: Delete Product (Admin Only) - Success

**Description**: Verify admin can delete a product

**Steps**:
1. Authenticate as admin user
2. Create a test product or get existing product ID
3. Send DELETE request to `/api/products/{product_id}`
4. Verify product is removed from database

**Expected Result**:
- Status code: 200 or 204
- Success message returned
- Product no longer retrievable via GET

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-026: Delete Product Without Authentication

**Description**: Verify unauthenticated delete requests are rejected

**Steps**:
1. Send DELETE request to `/api/products/{product_id}` without authentication token

**Expected Result**:
- Status code: 401
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-027: Delete Non-Existent Product

**Description**: Verify error handling when deleting non-existent product

**Steps**:
1. Authenticate as admin user
2. Send DELETE request to `/api/products/00000000-0000-0000-0000-000000000000`

**Expected Result**:
- Status code: 404
- Error message indicates product not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-028: Response Format Validation

**Description**: Verify all responses follow consistent format and schema

**Steps**:
1. Test multiple endpoints
2. Verify response structure consistency
3. Check data types match schema
4. Validate timestamp formats (ISO 8601)

**Expected Result**:
- All successful responses have consistent structure
- Error responses include status, message, and optionally details
- Dates in ISO 8601 format
- Numeric values properly formatted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-029: HTTP Method Validation

**Description**: Verify endpoints reject unsupported HTTP methods

**Steps**:
1. Send PATCH request to `/api/products` (if not implemented)
2. Send POST request to `/api/products/{id}` (if only PUT is supported)
3. Test other unsupported methods

**Expected Result**:
- Status code: 405 Method Not Allowed
- Allow header lists supported methods

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030: Content-Type Validation

**Description**: Verify API handles different content types correctly

**Steps**:
1. Send POST request with `Content-Type: application/json`
2. Send POST request with invalid Content-Type (e.g., text/plain)
3. Send POST request without Content-Type header

**Expected Result**:
- JSON content type accepted
- Invalid content types rejected with 415
- Missing content type handled appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-031: Large Payload Handling

**Description**: Verify API handles large product data appropriately

**Steps**:
1. Send POST request with very long product description (10,000+ characters)
2. Send POST request with large images array (100+ URLs)
3. Test API limits and constraints

**Expected Result**:
- Reasonable limits enforced
- Error message if payload too large
- No server crashes or timeouts

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-032: Special Characters in Product Data

**Description**: Verify handling of special characters and Unicode

**Steps**:
1. Create product with title containing special characters: `Product "Test" & Co. <Script>`
2. Create product with Unicode characters: `日本語 • Français • العربية`
3. Verify proper storage and retrieval

**Expected Result**:
- Special characters properly escaped
- Unicode characters preserved
- No injection vulnerabilities

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-033: CORS Headers

**Description**: Verify CORS headers are set correctly for browser access

**Steps**:
1. Send OPTIONS request to `/api/products`
2. Send GET request and check CORS headers
3. Verify Access-Control-Allow-Origin header

**Expected Result**:
- CORS headers present
- Appropriate origins allowed
- Preflight requests handled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-034: Rate Limiting (if implemented)

**Description**: Verify rate limiting protects against abuse

**Steps**:
1. Send 100 rapid requests to `/api/products`
2. Check if rate limiting is enforced
3. Verify rate limit headers (X-RateLimit-*)

**Expected Result**:
- Rate limiting enforced after threshold
- 429 status code returned when limit exceeded
- Rate limit headers indicate limits and reset time

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-035: Performance Testing

**Description**: Verify API response times are acceptable

**Steps**:
1. Send GET request to `/api/products` and measure response time
2. Test with different filter combinations
3. Test with large datasets (100+ products)

**Expected Result**:
- Response time < 500ms for simple queries
- Response time < 1000ms for complex filtered queries
- No timeouts or performance degradation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response times:
  - Simple query: ___ms
  - Filtered query: ___ms
  - Large dataset: ___ms

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary
- Total Test Cases: 35
- Passed: ___
- Failed: ___
- Blocked: ___
- Pass Rate: ___%

## Notes
- Admin authentication token format: `Bearer {token}`
- All timestamps should be in ISO 8601 format with UTC timezone
- UUIDs should be version 4 format
- Price values should be in INR (Indian Rupees) with 2 decimal places
