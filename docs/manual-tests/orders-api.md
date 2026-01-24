# Manual Test: Orders API

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
- [ ] Admin user credentials available
- [ ] Products and cart items available

## Test Cases

### TC-001: Get User Orders - Empty List

**Description**: Verify authenticated user can retrieve their orders list when they have no orders

**Steps**:
1. Authenticate as a new user with no order history
2. Send GET request to `/api/orders` with authentication token
3. Verify response shows empty orders array

**Expected Result**:
- Status code: 200
- Response body contains:
  - `orders` array (empty)
  - Pagination metadata: `{ "total": 0, "page": 1, "limit": 10 }`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-002: Get User Orders Without Authentication

**Description**: Verify unauthenticated requests are rejected

**Steps**:
1. Send GET request to `/api/orders` without authentication token
2. Verify appropriate error response

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-003: Create Order from Cart - Success

**Description**: Verify authenticated user can create an order from their cart

**Steps**:
1. Authenticate as user
2. Add 2-3 items to cart
3. Send POST request to `/api/orders` with:
   ```json
   {
     "shippingAddress": {
       "name": "John Doe",
       "addressLine1": "123 Main Street",
       "addressLine2": "Apt 4B",
       "city": "Mumbai",
       "state": "Maharashtra",
       "pincode": "400001",
       "phone": "+919876543210",
       "type": "home"
     },
     "billingAddress": {
       "name": "John Doe",
       "addressLine1": "123 Main Street",
       "addressLine2": "Apt 4B",
       "city": "Mumbai",
       "state": "Maharashtra",
       "pincode": "400001",
       "phone": "+919876543210",
       "type": "home"
     },
     "paymentMethod": "razorpay"
   }
   ```
4. Verify order is created

**Expected Result**:
- Status code: 201 Created
- Response contains:
  - Order with unique order number (format: ORD-XXXXXXXX)
  - Order status: "pending"
  - Payment status: "pending"
  - Order items matching cart contents
  - Calculated totals (subtotal, tax, shipping, discount, total)
  - Shipping and billing addresses
- Cart is automatically cleared after order creation
- Order persisted in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-004: Create Order with Same Billing and Shipping Address

**Description**: Verify order can be created when billing address matches shipping address

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Send POST request with identical shipping and billing addresses

**Expected Result**:
- Status code: 201 Created
- Order created successfully
- Both addresses stored correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-005: Create Order from Empty Cart

**Description**: Verify error handling when attempting to create order with empty cart

**Steps**:
1. Authenticate as user
2. Ensure cart is empty
3. Send POST request to `/api/orders`

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates cart is empty
- No order created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-006: Create Order Without Authentication

**Description**: Verify unauthenticated requests are rejected

**Steps**:
1. Send POST request to `/api/orders` without authentication token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-007: Create Order with Missing Required Fields

**Description**: Verify validation of required address fields

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Send POST request with missing required fields:
   - Missing shippingAddress
   - Missing name in address
   - Missing addressLine1
   - Missing city, state, or pincode
   - Missing phone number
   - Missing paymentMethod
4. Test each missing field separately

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates which field is missing
- Response includes validation details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-008: Create Order with Invalid Phone Number

**Description**: Verify phone number validation (E.164 format)

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Test with invalid phone numbers:
   - `"1234567890"` (missing country code)
   - `"+1234"` (too short)
   - `"abc123"` (non-numeric)
   - `"+919876543210123"` (too long)

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates invalid phone format
- Phone should be in E.164 format: `+[country code][number]`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-009: Create Order with Invalid Pincode

**Description**: Verify pincode validation (6-digit Indian format)

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Test with invalid pincodes:
   - `"12345"` (too short)
   - `"1234567"` (too long)
   - `"ABCDEF"` (non-numeric)

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates invalid pincode format
- Pincode should be 6 digits

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-010: Create Order with Invalid Payment Method

**Description**: Verify payment method validation

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Send POST request with invalid payment method:
   ```json
   {
     "paymentMethod": "invalid_method"
   }
   ```

**Expected Result**:
- Status code: 400 Bad Request
- Error message lists valid payment methods: razorpay, stripe, cod, upi

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-011: Order Totals Calculation - Subtotal

**Description**: Verify order subtotal is calculated correctly

**Steps**:
1. Authenticate as user
2. Add items to cart with known prices and quantities
3. Create order
4. Verify subtotal = Σ(item.price × item.quantity)

**Expected Result**:
- Subtotal calculation is accurate
- Includes all cart items
- Accounts for frames and customizations

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Expected subtotal: ₹____
- Actual subtotal: ₹____

---

### TC-012: Order Totals Calculation - Tax (GST)

**Description**: Verify GST (18%) is calculated correctly

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Create order
4. Verify tax = subtotal × 0.18 (18% GST)

**Expected Result**:
- Tax calculation is accurate
- Standard GST rate of 18% applied
- Tax amount properly formatted (2 decimals)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Subtotal: ₹____
- Expected tax (18%): ₹____
- Actual tax: ₹____

---

### TC-013: Order Totals Calculation - Shipping

**Description**: Verify shipping charges are applied correctly

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Create order
4. Verify shipping charges based on business rules

**Expected Result**:
- Shipping charges applied correctly
- Free shipping threshold honored (if applicable)
- Shipping amount clearly displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Shipping charge: ₹____

---

### TC-014: Order Totals Calculation - Discount

**Description**: Verify discount is applied correctly (if applicable)

**Steps**:
1. Authenticate as user
2. Apply coupon code (if implemented)
3. Add items to cart
4. Create order
5. Verify discount is calculated and applied

**Expected Result**:
- Discount calculated correctly
- Discount amount deducted from total
- Discount details included in order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Discount: ₹____

---

### TC-015: Order Totals Calculation - Final Total

**Description**: Verify final order total is calculated correctly

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Create order
4. Verify total = subtotal + tax + shipping - discount

**Expected Result**:
- Total calculation is accurate
- Formula: subtotal + tax + shipping - discount
- All amounts with 2 decimal precision

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Subtotal: ₹____
- Tax: ₹____
- Shipping: ₹____
- Discount: ₹____
- Expected total: ₹____
- Actual total: ₹____

---

### TC-016: Order Number Generation - Uniqueness

**Description**: Verify each order gets a unique order number

**Steps**:
1. Authenticate as user
2. Create multiple orders (3-5 orders)
3. Verify each has unique order number
4. Check order number format: ORD-XXXXXXXX

**Expected Result**:
- All order numbers are unique
- Format: ORD- followed by 8 alphanumeric characters
- Order numbers are sequential or random but never duplicate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Order numbers: ____________

---

### TC-017: Get User Orders - Multiple Orders

**Description**: Verify user can retrieve their complete order history

**Steps**:
1. Authenticate as user
2. Create 3 orders
3. Send GET request to `/api/orders`
4. Verify all orders are returned

**Expected Result**:
- Status code: 200
- Response contains all user's orders
- Orders sorted by creation date (newest first)
- Each order includes:
  - Order number, status, payment status
  - Total amount, order date
  - Shipping address
  - Number of items

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-018: Get Orders with Pagination

**Description**: Verify pagination works for order listing

**Steps**:
1. Authenticate as user
2. Create 15+ orders
3. Send GET request to `/api/orders?page=1&limit=10`
4. Verify first 10 orders returned
5. Send request for page 2
6. Verify next 5 orders returned

**Expected Result**:
- Status code: 200
- Correct number of orders per page
- Pagination metadata includes: total, page, limit, totalPages
- Can navigate between pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-019: Filter Orders by Status

**Description**: Verify filtering orders by order status

**Steps**:
1. Authenticate as user
2. Create orders with different statuses
3. Send GET request to `/api/orders?status=pending`
4. Verify only pending orders returned
5. Test with other statuses: confirmed, processing, shipped, delivered, cancelled

**Expected Result**:
- Status code: 200
- All returned orders have the specified status
- Valid statuses: pending, confirmed, processing, shipped, delivered, cancelled, refunded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-020: Get Single Order by ID - Success

**Description**: Verify user can retrieve detailed information for specific order

**Steps**:
1. Authenticate as user
2. Create an order and get order ID
3. Send GET request to `/api/orders/{order_id}`
4. Verify complete order details returned

**Expected Result**:
- Status code: 200
- Response includes:
  - Order details (number, status, dates, totals)
  - Order items with product details
  - Shipping and billing addresses
  - Payment information
  - Tracking information (if available)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-021: Get Order Without Authentication

**Description**: Verify unauthenticated requests are rejected

**Steps**:
1. Send GET request to `/api/orders/{order_id}` without authentication token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-022: User Isolation - Cannot Access Other Users' Orders

**Description**: Verify users can only access their own orders

**Steps**:
1. Authenticate as User A
2. Create an order and get order ID
3. Authenticate as User B
4. Attempt to retrieve User A's order
5. Send GET request to `/api/orders/{user_a_order_id}`

**Expected Result**:
- Status code: 403 Forbidden or 404 Not Found
- Error message indicates order not found or insufficient permissions
- No data leakage between users

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-023: Get Non-Existent Order

**Description**: Verify error handling for invalid order ID

**Steps**:
1. Authenticate as user
2. Send GET request to `/api/orders/00000000-0000-0000-0000-000000000000`

**Expected Result**:
- Status code: 404 Not Found
- Error message indicates order not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024: Update Order Status (Admin Only) - Success

**Description**: Verify admin can update order status

**Steps**:
1. Authenticate as regular user and create order
2. Get order ID
3. Authenticate as admin user
4. Send PUT request to `/api/orders/{order_id}` with:
   ```json
   {
     "status": "processing"
   }
   ```

**Expected Result**:
- Status code: 200
- Response shows updated order status
- Change persisted in database
- Only admin can perform this action

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-025: Update Order with Tracking Information (Admin)

**Description**: Verify admin can add tracking information to order

**Steps**:
1. Authenticate as admin
2. Get a shipped/processing order ID
3. Send PUT request with tracking details:
   ```json
   {
     "status": "shipped",
     "trackingNumber": "TRACK123456789",
     "trackingUrl": "https://tracking.example.com/TRACK123456789",
     "carrier": "Blue Dart"
   }
   ```

**Expected Result**:
- Status code: 200
- Response includes tracking information
- Customer can view tracking details

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-026: Update Order as Regular User

**Description**: Verify regular users cannot update order details

**Steps**:
1. Authenticate as regular user
2. Create order
3. Attempt to update order status (should fail)

**Expected Result**:
- Status code: 403 Forbidden
- Error message indicates insufficient permissions
- Only admins can update order status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-027: Update Order with Invalid Status

**Description**: Verify status validation on order updates

**Steps**:
1. Authenticate as admin
2. Send PUT request with invalid status:
   ```json
   {
     "status": "invalid_status"
   }
   ```

**Expected Result**:
- Status code: 400 Bad Request
- Error message lists valid statuses
- Valid: pending, confirmed, processing, shipped, delivered, cancelled, refunded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-028: Cancel Order (User) - Success

**Description**: Verify user can cancel their own order

**Steps**:
1. Authenticate as user
2. Create order (status: pending)
3. Send PUT request to `/api/orders/{order_id}/cancel`
4. Verify order status changes to "cancelled"

**Expected Result**:
- Status code: 200
- Order status updated to "cancelled"
- Payment status updated if applicable
- Cancellation timestamp recorded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-029: Cancel Order - Time Restrictions

**Description**: Verify cancellation restrictions based on order status

**Steps**:
1. Authenticate as user
2. Create order with status "shipped"
3. Attempt to cancel order

**Expected Result**:
- Status code: 400 Bad Request
- Error message indicates order cannot be cancelled (already shipped)
- Only pending/confirmed orders can be cancelled by users

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030: Cancel Order Without Authentication

**Description**: Verify unauthenticated cancellation requests are rejected

**Steps**:
1. Send PUT request to `/api/orders/{order_id}/cancel` without token

**Expected Result**:
- Status code: 401 Unauthorized
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-031: Cancel Another User's Order

**Description**: Verify users cannot cancel other users' orders

**Steps**:
1. Authenticate as User A and create order
2. Get order ID
3. Authenticate as User B
4. Attempt to cancel User A's order

**Expected Result**:
- Status code: 403 Forbidden or 404 Not Found
- Error message indicates insufficient permissions
- Order not cancelled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-032: Cancel Order (Admin) - Any Status

**Description**: Verify admin can cancel orders in any status

**Steps**:
1. Create order as user (status: shipped)
2. Authenticate as admin
3. Send PUT request to `/api/orders/{order_id}/cancel`

**Expected Result**:
- Status code: 200
- Order cancelled successfully
- Admin can cancel regardless of status
- Reason/note can be added

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-033: Order Items Include Product Details

**Description**: Verify order items contain complete product information

**Steps**:
1. Authenticate as user
2. Add items with variants and frames to cart
3. Create order
4. Retrieve order and inspect items structure

**Expected Result**:
- Each order item includes:
  - Quantity, price
  - Product details (title, SKU, image)
  - Variant details (size, dimensions)
  - Frame details (if applicable)
  - AI generation reference (if applicable)
  - Custom text (if applicable)
- Product details are snapshot at time of order (not joined)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-034: Order with Photo Approval Required

**Description**: Verify order can include items requiring photo approval

**Steps**:
1. Authenticate as user
2. Add custom/AI product requiring approval to cart
3. Create order
4. Verify photo approval status in order

**Expected Result**:
- Status code: 201 Created
- Order created with photoApprovalRequired: true
- Photo approval status: "pending"
- Order processing waits for approval

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-035: Payment Integration - Razorpay Order Creation

**Description**: Verify order includes Razorpay payment integration details

**Steps**:
1. Authenticate as user
2. Add items to cart
3. Create order with paymentMethod: "razorpay"
4. Verify response includes Razorpay order ID

**Expected Result**:
- Status code: 201 Created
- Response includes razorpayOrderId
- Razorpay order ID can be used in frontend payment flow

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Razorpay Order ID: ____________

---

### TC-036: Cart Cleared After Order Creation

**Description**: Verify user's cart is automatically cleared after successful order

**Steps**:
1. Authenticate as user
2. Add 3 items to cart
3. Create order successfully
4. Send GET request to `/api/cart`
5. Verify cart is empty

**Expected Result**:
- Status code for cart: 200
- Cart is empty after order creation
- All items moved to order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-037: Response Format Validation

**Description**: Verify all order API responses follow consistent format

**Steps**:
1. Test multiple order endpoints
2. Verify response structure consistency
3. Check data types match schema
4. Validate timestamp formats

**Expected Result**:
- All responses follow consistent schema
- Error responses include status, message, details
- Dates in ISO 8601 format
- Currency values with 2 decimals
- Order numbers in correct format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-038: HTTP Method Validation

**Description**: Verify endpoints reject unsupported HTTP methods

**Steps**:
1. Send PATCH request to `/api/orders` (if not supported)
2. Test other unsupported methods

**Expected Result**:
- Status code: 405 Method Not Allowed
- Allow header lists supported methods

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-039: Large Order Handling

**Description**: Verify system handles orders with many items

**Steps**:
1. Authenticate as user
2. Add 50 different items to cart
3. Create order
4. Verify order processes successfully

**Expected Result**:
- Status code: 201 Created
- All items included in order
- Totals calculated correctly
- No performance issues or timeouts

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:
- Order creation time: ___ms
- Number of items: ___

---

### TC-040: Performance Testing

**Description**: Verify orders API response times are acceptable

**Steps**:
1. Test various order operations and measure response times:
   - Create order
   - List orders
   - Get single order
   - Update order
   - Cancel order

**Expected Result**:
- Create order: < 1000ms
- List orders: < 500ms
- Get order: < 300ms
- Update/cancel: < 300ms
- No timeouts or errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response times:
  - Create order: ___ms
  - List orders: ___ms
  - Get order: ___ms
  - Update: ___ms
  - Cancel: ___ms

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary
- Total Test Cases: 40
- Passed: ___
- Failed: ___
- Blocked: ___
- Pass Rate: ___%

## Notes
- Authentication token format: `Bearer {token}`
- All order operations require authentication
- Orders are user-specific (strong isolation between users)
- Admin users have additional permissions for order management
- Phone numbers must be in E.164 format: `+[country][number]`
- Indian pincodes are 6 digits
- Order numbers format: `ORD-XXXXXXXX`
- GST rate: 18%
- Currency: INR (₹) with 2 decimal places
- Valid order statuses: pending, confirmed, processing, shipped, delivered, cancelled, refunded
- Valid payment statuses: pending, paid, failed, refunded
- Valid payment methods: razorpay, stripe, cod, upi
