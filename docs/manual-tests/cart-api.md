# Manual Test: Cart API

## Test Environment
- **Browser/Tool**: Postman / cURL / Thunder Client
- **API Base URL**: http://localhost:3000
- **Date**: 2026-01-16
- **Tester**: Manual QA

## Prerequisites
- [x] Dev server running at http://localhost:3000
- [x] Database seeded with test data
- [x] User authentication working
- [ ] Test user credentials available
- [ ] Products with variants available in database

## Test Cases

### TC-001: Get Empty Cart (Authenticated User)

**Description**: Verify authenticated user can retrieve their empty cart

**Steps**:
1. Authenticate as a new user
2. Send GET request to `/api/cart` with authentication token
3. Verify response shows empty cart

**Expected Result**:
- Status code: 200
- Response body contains empty array: `[]`
- No items from other users are visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-002: Get Cart Without Authentication

**Description**: Verify unauthenticated requests are rejected

**Steps**:
1. Send GET request to `/api/cart` without authentication token
2. Verify appropriate error response

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-003: Add Item to Cart - Success

**Description**: Verify authenticated user can add a product to their cart

**Steps**:
1. Authenticate as user
2. Get a valid product ID and variant ID from products API
3. Send POST request to `/api/cart` with:
   ```json
   {
     "productId": "{valid-product-uuid}",
     "variantId": "{valid-variant-uuid}",
     "quantity": 2,
     "frameId": null
   }
   ```
4. Verify item is added to cart

**Expected Result**:
- Status code: 201 Created
- Response contains created cart item with:
  - `id`, `userId`, `productId`, `variantId`, `quantity`, `frameId`
  - Product and variant details joined in response
- Item is persisted in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-004: Add Item with Frame

**Description**: Verify user can add a product with frame option

**Steps**:
1. Authenticate as user
2. Get valid product ID, variant ID, and frame ID
3. Send POST request to `/api/cart` with frameId specified:
   ```json
   {
     "productId": "{product-uuid}",
     "variantId": "{variant-uuid}",
     "quantity": 1,
     "frameId": "{frame-uuid}"
   }
   ```

**Expected Result**:
- Status code: 201 Created
- Response includes frame details
- Frame price modifier applied to total

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-005: Add Item with AI Generation

**Description**: Verify user can add AI-generated poster to cart

**Steps**:
1. Authenticate as user
2. Create an AI generation (or get existing generation ID)
3. Send POST request with aiGenerationId:
   ```json
   {
     "productId": "{product-uuid}",
     "variantId": "{variant-uuid}",
     "quantity": 1,
     "aiGenerationId": "{generation-uuid}",
     "frameId": null
   }
   ```

**Expected Result**:
- Status code: 201 Created
- Response includes AI generation reference
- Custom AI poster added to cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-006: Add Item with Custom Text

**Description**: Verify user can add product with custom text personalization

**Steps**:
1. Authenticate as user
2. Send POST request with customText field:
   ```json
   {
     "productId": "{product-uuid}",
     "variantId": "{variant-uuid}",
     "quantity": 1,
     "customText": "Happy Anniversary!\nJohn & Jane",
     "frameId": null
   }
   ```

**Expected Result**:
- Status code: 201 Created
- Response includes custom text
- Personalized item added to cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-007: Add Item Without Authentication

**Description**: Verify unauthenticated requests are rejected

**Steps**:
1. Send POST request to `/api/cart` without authentication token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-008: Add Item with Missing Required Fields

**Description**: Verify validation of required fields

**Steps**:
1. Authenticate as user
2. Send POST request with missing fields:
   - Missing productId
   - Missing variantId
   - Missing quantity
3. Test each missing field separately

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates which field is missing
- Response includes validation details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-009: Add Item with Invalid Product ID

**Description**: Verify error handling for non-existent product

**Steps**:
1. Authenticate as user
2. Send POST request with invalid product UUID:
   ```json
   {
     "productId": "00000000-0000-0000-0000-000000000000",
     "variantId": "{valid-variant-uuid}",
     "quantity": 1
   }
   ```

**Expected Result**:
- Status code: 400 or 404
- Error message indicates product not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-010: Add Item with Invalid Variant ID

**Description**: Verify error handling for non-existent variant

**Steps**:
1. Authenticate as user
2. Send POST request with invalid variant UUID

**Expected Result**:
- Status code: 400 or 404
- Error message indicates variant not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-011: Add Item with Invalid Quantity

**Description**: Verify quantity validation

**Steps**:
1. Authenticate as user
2. Test with various invalid quantities:
   - Quantity = 0
   - Quantity = -1
   - Quantity = 1000 (exceeds stock)
   - Non-numeric quantity

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates invalid quantity
- Quantity must be positive integer

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-012: Add Duplicate Item (Same Product & Variant)

**Description**: Verify behavior when adding same item twice

**Steps**:
1. Authenticate as user
2. Add item to cart
3. Add the same product and variant again

**Expected Result**:
- Option A: Quantity is incremented on existing cart item
- Option B: Separate cart items created
- Behavior is consistent and documented

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-013: Get Cart with Multiple Items

**Description**: Verify retrieving cart with multiple products

**Steps**:
1. Authenticate as user
2. Add 3-5 different items to cart
3. Send GET request to `/api/cart`
4. Verify all items are returned

**Expected Result**:
- Status code: 200
- Response contains all cart items
- Each item includes product and variant details
- Items ordered by creation date (newest first or oldest first)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-014: User Isolation - Cannot See Other Users' Carts

**Description**: Verify users can only access their own cart

**Steps**:
1. Authenticate as User A
2. Add items to cart
3. Authenticate as User B
4. Send GET request to `/api/cart`
5. Verify User B's cart is empty (doesn't see User A's items)

**Expected Result**:
- Status code: 200
- User B sees empty cart or only their own items
- No data leakage between users

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-015: Update Cart Item Quantity - Success

**Description**: Verify user can update quantity of cart item

**Steps**:
1. Authenticate as user
2. Add item to cart
3. Get cart item ID
4. Send PUT request to `/api/cart/{cart_item_id}` with:
   ```json
   {
     "quantity": 5
   }
   ```

**Expected Result**:
- Status code: 200
- Response shows updated quantity
- Change persisted in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-016: Update Cart Item Frame

**Description**: Verify user can change frame selection

**Steps**:
1. Authenticate as user
2. Add item to cart with no frame
3. Send PUT request to update with frame:
   ```json
   {
     "frameId": "{frame-uuid}"
   }
   ```

**Expected Result**:
- Status code: 200
- Response shows updated frame
- Frame details included in response

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-017: Update Cart Item - Remove Frame

**Description**: Verify user can remove frame from cart item

**Steps**:
1. Authenticate as user
2. Add item to cart with frame
3. Send PUT request with frameId set to null:
   ```json
   {
     "frameId": null
   }
   ```

**Expected Result**:
- Status code: 200
- Frame removed from cart item
- Price recalculated without frame modifier

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-018: Update Cart Item Without Authentication

**Description**: Verify unauthenticated update requests are rejected

**Steps**:
1. Send PUT request to `/api/cart/{cart_item_id}` without authentication token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-019: Update Another User's Cart Item

**Description**: Verify users cannot update other users' cart items

**Steps**:
1. Authenticate as User A and add item to cart
2. Get cart item ID
3. Authenticate as User B
4. Attempt to update User A's cart item

**Expected Result**:
- Status code: 403 Forbidden or 404 Not Found
- Error message indicates insufficient permissions
- No data modified

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-020: Update Non-Existent Cart Item

**Description**: Verify error handling for invalid cart item ID

**Steps**:
1. Authenticate as user
2. Send PUT request to `/api/cart/00000000-0000-0000-0000-000000000000`

**Expected Result**:
- Status code: 404 Not Found
- Error message indicates cart item not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-021: Update Cart Item with Invalid Data

**Description**: Verify validation on update requests

**Steps**:
1. Authenticate as user
2. Add item to cart
3. Send PUT request with invalid data:
   - Invalid quantity (0, negative)
   - Invalid frameId (non-existent UUID)
   - Invalid data types

**Expected Result**:
- Status code: 400 Bad Request
- Error message describes validation failure

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-022: Remove Single Cart Item - Success

**Description**: Verify user can remove specific item from cart

**Steps**:
1. Authenticate as user
2. Add multiple items to cart
3. Get a cart item ID
4. Send DELETE request to `/api/cart/{cart_item_id}`
5. Verify item is removed

**Expected Result**:
- Status code: 200 or 204 No Content
- Success message returned
- Item no longer appears in GET /api/cart
- Other cart items remain

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-023: Remove Cart Item Without Authentication

**Description**: Verify unauthenticated delete requests are rejected

**Steps**:
1. Send DELETE request to `/api/cart/{cart_item_id}` without authentication token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024: Remove Another User's Cart Item

**Description**: Verify users cannot remove other users' cart items

**Steps**:
1. Authenticate as User A and add item to cart
2. Get cart item ID
3. Authenticate as User B
4. Attempt to delete User A's cart item

**Expected Result**:
- Status code: 403 Forbidden or 404 Not Found
- Error message indicates insufficient permissions
- Item not deleted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-025: Remove Non-Existent Cart Item

**Description**: Verify error handling when deleting non-existent item

**Steps**:
1. Authenticate as user
2. Send DELETE request to `/api/cart/00000000-0000-0000-0000-000000000000`

**Expected Result**:
- Status code: 404 Not Found
- Error message indicates cart item not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-026: Clear Entire Cart - Success

**Description**: Verify user can clear all items from cart at once

**Steps**:
1. Authenticate as user
2. Add multiple items to cart (3-5 items)
3. Send DELETE request to `/api/cart` (without item ID)
4. Verify cart is empty

**Expected Result**:
- Status code: 200 or 204 No Content
- Success message returned
- GET /api/cart returns empty array
- All user's cart items removed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-027: Clear Cart Without Authentication

**Description**: Verify unauthenticated clear cart requests are rejected

**Steps**:
1. Send DELETE request to `/api/cart` without authentication token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-028: Clear Already Empty Cart

**Description**: Verify clearing an empty cart is handled gracefully

**Steps**:
1. Authenticate as user
2. Ensure cart is empty
3. Send DELETE request to `/api/cart`

**Expected Result**:
- Status code: 200 or 204 No Content
- Success message (no error even though cart was empty)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-029: Cart Persistence Across Sessions

**Description**: Verify cart items persist when user logs out and back in

**Steps**:
1. Authenticate as user and add items to cart
2. Log out (end session)
3. Log in again with same user
4. Retrieve cart

**Expected Result**:
- Status code: 200
- All previously added items still in cart
- Cart data persisted between sessions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030: Cart Item with Product Details

**Description**: Verify cart response includes complete product information

**Steps**:
1. Authenticate as user
2. Add item to cart
3. Retrieve cart and inspect response structure

**Expected Result**:
- Status code: 200
- Each cart item includes:
  - Cart item fields: id, userId, productId, variantId, quantity, frameId, etc.
  - Joined product data: title, images, basePrice, etc.
  - Joined variant data: sizeLabel, dimensions, price, stock
  - Joined frame data (if applicable): type, material, priceModifier

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-031: Calculate Cart Total

**Description**: Verify cart total calculation includes all items and modifiers

**Steps**:
1. Authenticate as user
2. Add multiple items with different quantities and frames
3. Retrieve cart
4. Calculate expected total manually
5. Verify total in response matches calculation

**Expected Result**:
- Cart response includes total calculation
- Total = Σ(variant.price × quantity × (1 + frame.priceModifier))
- Calculation is accurate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Expected total: ₹____
- Actual total: ₹____

---

### TC-032: Stock Validation on Add to Cart

**Description**: Verify system checks product stock availability

**Steps**:
1. Authenticate as user
2. Find a product variant with limited stock (e.g., stock = 2)
3. Attempt to add quantity = 10 to cart

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates insufficient stock
- Cart item not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-033: Multiple Items Same Product Different Variants

**Description**: Verify user can add different sizes of same product

**Steps**:
1. Authenticate as user
2. Add product variant "Small" to cart
3. Add same product variant "Large" to cart
4. Retrieve cart

**Expected Result**:
- Status code: 200
- Cart contains 2 separate items
- Both variants of same product are in cart

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-034: Response Format Validation

**Description**: Verify all cart API responses follow consistent format

**Steps**:
1. Test multiple cart endpoints
2. Verify response structure consistency
3. Check data types match schema
4. Validate timestamp formats

**Expected Result**:
- All responses follow consistent schema
- Error responses include status, message, details
- Dates in ISO 8601 format
- Numeric values properly formatted (price with 2 decimals)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-035: HTTP Method Validation

**Description**: Verify endpoints reject unsupported HTTP methods

**Steps**:
1. Send PATCH request to `/api/cart` (if not supported)
2. Send POST request to `/api/cart/{id}` (if only PUT supported)
3. Test other unsupported methods

**Expected Result**:
- Status code: 405 Method Not Allowed
- Allow header lists supported methods

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-036: Concurrent Cart Operations

**Description**: Verify cart handles concurrent modifications correctly

**Steps**:
1. Authenticate as user
2. Add item to cart
3. Open two API clients
4. Simultaneously update same cart item with different quantities
5. Verify final state is consistent

**Expected Result**:
- No race conditions or data corruption
- Last write wins or optimistic locking implemented
- Database maintains consistency

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-037: Special Characters in Custom Text

**Description**: Verify handling of special characters in customization

**Steps**:
1. Authenticate as user
2. Add item with custom text containing:
   - Special characters: `& < > " '`
   - Newlines and tabs
   - Unicode: 🎨 ❤️ ⭐
   - Long text (1000+ characters)

**Expected Result**:
- Status code: 201 Created
- Special characters properly stored and retrieved
- No XSS or injection vulnerabilities

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-038: Performance Testing

**Description**: Verify cart API response times are acceptable

**Steps**:
1. Add 20 items to cart
2. Send GET request to `/api/cart` and measure response time
3. Test update and delete operations

**Expected Result**:
- GET cart response time < 500ms
- POST/PUT/DELETE response time < 300ms
- No performance degradation with multiple items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response times:
  - GET cart: ___ms
  - POST add item: ___ms
  - PUT update item: ___ms
  - DELETE remove item: ___ms

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary
- Total Test Cases: 38
- Passed: ___
- Failed: ___
- Blocked: ___
- Pass Rate: ___%

## Notes
- Authentication token format: `Bearer {token}`
- All cart operations require authentication
- Cart items are user-specific (strong isolation required)
- Prices should include currency symbol (₹) and 2 decimal places
- UUIDs should be version 4 format
