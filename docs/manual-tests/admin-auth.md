# Manual Test: Admin Authentication & Authorization

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
- [ ] Test users created with different roles:
  - [ ] Customer user (`role: customer`)
  - [ ] Trade user (`role: trade`)
  - [ ] Admin user (`role: admin`)
  - [ ] Super-admin user (`role: super-admin`)

## Overview
This document covers manual testing of admin authentication and authorization:
- Admin login flow
- Role-based access control (RBAC)
- Session management
- Permission boundaries
- Security measures

---

## Authentication Flow

### TC-001: Admin Login Page Access

**Description**: Verify admin login page is accessible

**URL**: `/admin/login`

**Steps**:
1. Navigate to `/admin/login`
2. Verify page loads

**Expected Result**:
- Login form displayed
- Email and password fields visible
- Sign In button visible
- Page title indicates admin login

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Screenshot: _______________

---

### TC-002: Admin Login - Valid Credentials

**Description**: Verify admin can login with valid credentials

**URL**: `/admin/login`

**Steps**:
1. Enter admin email: `admin@masonart.com`
2. Enter password: `[valid password]`
3. Click "Sign In"

**Expected Result**:
- Successful login
- Redirect to `/admin/dashboard`
- Session cookie set (`masonart.session.*`)
- User name displayed in header

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect Location: _______________
- Session Cookie Set: _______________

---

### TC-003: Admin Login - Invalid Credentials

**Description**: Verify proper error for invalid credentials

**URL**: `/admin/login`

**Steps**:
1. Enter admin email
2. Enter incorrect password
3. Click "Sign In"

**Expected Result**:
- Error message displayed
- "Invalid credentials" or similar message
- No redirect
- No session created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-004: Admin Login - Non-Admin User

**Description**: Verify customer/trade users cannot access admin

**URL**: `/admin/login`

**Steps**:
1. Enter customer user email
2. Enter valid password
3. Click "Sign In"

**Expected Result**:
- Login succeeds but access denied
- Error: "Insufficient permissions" or redirect to customer area
- Cannot access admin routes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Behavior: _______________

---

### TC-005: Admin Login - Unverified Email

**Description**: Verify admin with unverified email cannot login

**URL**: `/admin/login`

**Steps**:
1. Create admin account with unverified email
2. Attempt to login

**Expected Result**:
- Error message about email verification
- No access to admin area

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

### TC-006: Admin Login - Empty Fields

**Description**: Verify validation for empty fields

**URL**: `/admin/login`

**Steps**:
1. Leave email empty, click Sign In
2. Leave password empty, click Sign In
3. Leave both empty, click Sign In

**Expected Result**:
- Validation errors displayed
- Form not submitted
- Clear error messages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation Working: _______________

---

### TC-007: Admin Login - Invalid Email Format

**Description**: Verify email format validation

**URL**: `/admin/login`

**Steps**:
1. Enter invalid email format (e.g., "admin@")
2. Click Sign In

**Expected Result**:
- Validation error for email format
- Form not submitted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Message: _______________

---

## Session Management

### TC-008: Session Persistence

**Description**: Verify admin session persists across page reloads

**Steps**:
1. Login as admin
2. Refresh page
3. Navigate to different admin pages
4. Verify session maintained

**Expected Result**:
- User remains logged in
- Session cookie valid
- No re-authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Session Persisted: _______________

---

### TC-009: Session Expiry

**Description**: Verify session expires after timeout

**Steps**:
1. Login as admin
2. Note session expiry time
3. Wait or manipulate cookie
4. Attempt to access admin page

**Expected Result**:
- Session cookie expires (7 days default)
- Redirect to login page
- Clear error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Session Duration: _______________

---

### TC-010: Admin Sign Out

**Description**: Verify admin can sign out

**URL**: `/admin/dashboard`

**Steps**:
1. Login as admin
2. Click profile dropdown
3. Click "Sign Out"

**Expected Result**:
- Session terminated
- Redirect to login page
- Session cookie cleared
- Cannot access admin without re-login

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cookie Cleared: _______________

---

### TC-011: Multiple Tab Session

**Description**: Verify session works across multiple browser tabs

**Steps**:
1. Login as admin in Tab 1
2. Open Tab 2 and navigate to `/admin`
3. Verify both tabs authenticated
4. Sign out in Tab 1
5. Refresh Tab 2

**Expected Result**:
- Both tabs share session initially
- After signout, Tab 2 redirects to login

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Multi-tab Behavior: _______________

---

## Role-Based Access Control (RBAC)

### TC-012: Customer Role - Admin Dashboard Access

**Description**: Verify customer cannot access admin dashboard

**URL**: `/admin/dashboard`

**Steps**:
1. Login as customer user
2. Navigate to `/admin/dashboard`

**Expected Result**:
- Access denied
- Redirect to login or error page
- Status: 403 Forbidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect To: _______________

---

### TC-013: Customer Role - Admin Products Access

**Description**: Verify customer cannot access admin products

**URL**: `/admin/products`

**Steps**:
1. Login as customer user
2. Navigate to `/admin/products`

**Expected Result**:
- Access denied
- Proper error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-014: Customer Role - Admin Orders Access

**Description**: Verify customer cannot access admin orders

**URL**: `/admin/orders`

**Steps**:
1. Login as customer user
2. Navigate to `/admin/orders`

**Expected Result**:
- Access denied
- Proper error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-015: Trade Role - Admin Access

**Description**: Verify trade user cannot access admin

**URL**: `/admin/dashboard`

**Steps**:
1. Login as trade user
2. Navigate to `/admin/dashboard`

**Expected Result**:
- Access denied
- Redirect to trade dashboard or error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Behavior: _______________

---

### TC-016: Admin Role - Full Admin Access

**Description**: Verify admin can access all admin routes

**Test Routes**:
- `/admin/dashboard`
- `/admin/products`
- `/admin/products/new`
- `/admin/orders`
- `/admin/orders/:id`

**Expected Result**:
- All pages accessible
- Full CRUD operations available
- No permission errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- All Routes Accessible: _______________

---

### TC-017: Super-Admin Role - Full Access

**Description**: Verify super-admin has all admin privileges

**Steps**:
1. Login as super-admin
2. Access all admin routes
3. Verify additional super-admin features if any

**Expected Result**:
- All admin features accessible
- Additional super-admin capabilities available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Super-Admin Features: _______________

---

### TC-018: Admin Role - Sensitive Operations

**Description**: Verify admin can perform sensitive operations

**Operations**:
- Update order status
- Initiate refunds
- Archive products
- Update shipping

**Expected Result**:
- All operations permitted for admin
- Actions logged for audit

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Operations Tested: _______________

---

## Route Protection

### TC-019: Unauthenticated Admin Dashboard Access

**Description**: Verify unauthenticated users cannot access admin

**URL**: `/admin/dashboard`

**Steps**:
1. Clear all cookies/session
2. Navigate directly to `/admin/dashboard`

**Expected Result**:
- Redirect to `/admin/login`
- No admin content displayed
- Clear redirect message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect Working: _______________

---

### TC-020: Unauthenticated Admin API Access

**Description**: Verify unauthenticated API requests are rejected

**Endpoint**: `GET /api/admin/products`

**Steps**:
1. Clear session/cookies
2. Make API request without auth

**Expected Result**:
- Status: 401 Unauthorized
- No data returned
- Clear error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________

---

### TC-021: Direct URL Access After Logout

**Description**: Verify admin pages inaccessible after logout

**Steps**:
1. Login as admin
2. Visit `/admin/orders`
3. Sign out
4. Use browser back button to return

**Expected Result**:
- Cannot view cached admin content
- Redirect to login
- Cache properly invalidated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Back Button Behavior: _______________

---

### TC-022: Admin Route with Return URL

**Description**: Verify return URL handling after login

**Steps**:
1. Clear session
2. Navigate to `/admin/orders`
3. Get redirected to login
4. Login successfully

**Expected Result**:
- After login, redirect to `/admin/orders`
- Return URL preserved
- Seamless user experience

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Return URL Working: _______________

---

## Security Testing

### TC-023: CSRF Protection

**Description**: Verify CSRF protection on admin forms

**Steps**:
1. Login as admin
2. Inspect form submissions
3. Verify CSRF token present

**Expected Result**:
- CSRF token in requests
- Requests without token rejected
- Token rotates properly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- CSRF Protected: _______________

---

### TC-024: Cookie Security Attributes

**Description**: Verify session cookie has proper security attributes

**Steps**:
1. Login as admin
2. Inspect session cookie in DevTools

**Expected Result**:
- Cookie name: `masonart.session.*`
- HttpOnly: true
- Secure: true (in production)
- SameSite: Lax or Strict
- Path: /
- Expires: 7 days from creation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- HttpOnly: _______________
- Secure: _______________
- SameSite: _______________

---

### TC-025: Password Not Exposed

**Description**: Verify password is never exposed in API responses

**Steps**:
1. Login as admin
2. Call `/api/auth/get-session`
3. Inspect response

**Expected Result**:
- No password field in response
- No password hash exposed
- User object sanitized

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Password Hidden: _______________

---

### TC-026: Rate Limiting - Login

**Description**: Verify rate limiting on login endpoint

**Steps**:
1. Attempt 10+ failed logins rapidly
2. Observe response

**Expected Result**:
- Rate limiting kicks in
- Error: "Too many attempts"
- Temporary lockout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rate Limit After: _______________ attempts

---

### TC-027: Robots Meta Tag

**Description**: Verify admin pages have noindex directive

**URL**: Any admin page

**Steps**:
1. Navigate to admin page
2. Inspect meta robots tag

**Expected Result**:
- `<meta name="robots" content="noindex, nofollow">`
- Admin pages not indexable by search engines

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Robots Tag: _______________

---

### TC-028: XSS Prevention in Login Form

**Description**: Verify XSS prevention in form inputs

**Steps**:
1. Enter `<script>alert('XSS')</script>` in email field
2. Submit form

**Expected Result**:
- Input sanitized/escaped
- No script execution
- Proper error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- XSS Prevented: _______________

---

## UI/UX Testing

### TC-029: Loading States

**Description**: Verify loading states during authentication

**Steps**:
1. Click Sign In button
2. Observe loading state

**Expected Result**:
- Button shows loading indicator
- Form inputs disabled during submission
- No double submissions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Loading Indicator: _______________

---

### TC-030: Error Message Display

**Description**: Verify error messages are user-friendly

**Test Cases**:
- Invalid credentials
- Network error
- Server error

**Expected Result**:
- Clear, helpful error messages
- No technical jargon
- Actionable guidance

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Quality: _______________

---

### TC-031: Password Field Toggle

**Description**: Verify password visibility toggle

**Steps**:
1. Enter password
2. Toggle visibility icon

**Expected Result**:
- Password shown/hidden on toggle
- Icon changes appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Toggle Working: _______________

---

### TC-032: Keyboard Navigation

**Description**: Verify form is keyboard accessible

**Steps**:
1. Tab through form elements
2. Press Enter to submit

**Expected Result**:
- Tab order logical
- Enter submits form
- Focus visible indicators

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard Accessible: _______________

---

### TC-033: Mobile Responsiveness

**Description**: Verify login page works on mobile

**Viewport**: 375x667 (iPhone SE)

**Steps**:
1. Set mobile viewport
2. Navigate to login page
3. Complete login flow

**Expected Result**:
- Form fully visible
- Inputs usable
- Buttons tappable
- Keyboard doesn't obscure inputs

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Ready: _______________

---

## Admin Header & Navigation

### TC-034: Admin Header - User Info Display

**Description**: Verify logged-in user info in header

**Steps**:
1. Login as admin
2. Check header area

**Expected Result**:
- Admin name displayed
- Role indicator (optional)
- Avatar/profile icon

**Actual Result**:
- [ ] PASS / [ ] FAIL
- User Info Shown: _______________

---

### TC-035: Admin Header - Dropdown Menu

**Description**: Verify admin profile dropdown

**Steps**:
1. Click on profile area in header
2. Observe dropdown menu

**Expected Result**:
- Dropdown opens
- Sign Out option visible
- Profile/Settings link (if applicable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Dropdown Working: _______________

---

### TC-036: Admin Sidebar - Role-Based Items

**Description**: Verify sidebar shows appropriate menu items

**Steps**:
1. Login as admin
2. Check sidebar navigation

**Expected Result**:
- Dashboard link
- Products link
- Orders link
- All items functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Menu Items Present: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 36
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Authentication Configuration
- Session duration: 7 days
- Session cache time: 5 minutes
- Cookie prefix: `masonart.session`

### Test User Credentials
- Admin: [email] / [password]
- Super-Admin: [email] / [password]
- Customer: [email] / [password]

### Additional Observations
_______________________________________________
_______________________________________________

## Recommendations

1. **Security Improvements**:
   - Consider 2FA for admin accounts
   - Implement session revocation on password change
   - Add audit logging for all admin actions

2. **UX Improvements**:
   - Add "Remember me" functionality
   - Implement password reset flow
   - Show last login time

3. **Monitoring**:
   - Track failed login attempts
   - Alert on suspicious activity
   - Monitor session anomalies

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
