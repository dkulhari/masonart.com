# Manual Test: Authentication User Journey Flow

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Base URL**: http://localhost:3001
- **Auth Framework**: Better Auth

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running (`docker compose up -d`)
- [ ] Google OAuth credentials configured (for OAuth tests)
- [ ] Test user accounts available:
  - Fresh email for new registration
  - Existing user for login tests
- [ ] Password reset email service configured (for password reset tests)

## Overview
This document covers end-to-end manual testing of the complete authentication user journey:
1. User registers a new account
2. User is redirected to login with success message
3. User logs in with credentials
4. User accesses account dashboard
5. User manages account settings
6. User signs out
7. User logs back in

---

## Complete Registration Flow

### TC-001: Complete Full Registration to Account Access Flow

**Description**: Verify complete registration journey

**Steps**:
1. Navigate to /auth/register
2. Verify chobi.art branding is visible
3. Fill registration form:
   - Name: New User
   - Email: newuser@example.com (use unique email)
   - Password: ValidPass123!
   - Confirm Password: ValidPass123!
4. Click "Create Account" button
5. Verify redirect to login page
6. Verify success message appears
7. Log in with new credentials
8. Verify redirect to home or account

**Expected Result**:
- Registration form accepts valid input
- Success message: "Account created successfully"
- Login with new credentials succeeds
- User is authenticated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Registration with Redirect Parameter

**Description**: Verify redirect is preserved after registration

**Steps**:
1. Navigate to /auth/register?redirect=/checkout
2. Complete registration form
3. Submit registration
4. Observe redirect URL

**Expected Result**:
- After registration, redirects to login
- Login URL preserves redirect parameter
- After login, redirects to /checkout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-003: Show Error When Email Already Exists

**Description**: Verify duplicate email handling

**Steps**:
1. Navigate to /auth/register
2. Fill form with existing email
3. Submit registration

**Expected Result**:
- Error message appears: "Email already exists"
- User remains on registration page
- Form data is preserved

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-004: Navigate from Registration to Login

**Description**: Verify navigation link to login

**Steps**:
1. Navigate to /auth/register
2. Locate "Already have an account? Sign in" link
3. Click the link

**Expected Result**:
- Navigates to /auth/login
- Login page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Complete Login Flow

### TC-005: Complete Full Login to Account Access Flow

**Description**: Verify complete login journey

**Steps**:
1. Navigate to /auth/login
2. Verify "Welcome back" text is visible
3. Fill login form:
   - Email: existing@example.com
   - Password: password123
4. Click "Sign In" button
5. Verify redirect to home page

**Expected Result**:
- Login form accepts credentials
- Submit button processes request
- Redirects to home (/) after success
- User is authenticated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-006: Login with Redirect to Checkout

**Description**: Verify checkout redirect after login

**Steps**:
1. Navigate to /auth/login?redirect=/checkout
2. Complete login
3. Observe redirect

**Expected Result**:
- After successful login, redirects to /checkout
- Not to home page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Login with Redirect to Account

**Description**: Verify account redirect after login

**Steps**:
1. Navigate to /auth/login?redirect=/account
2. Complete login
3. Observe redirect

**Expected Result**:
- After successful login, redirects to /account
- Account dashboard loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Show Error for Invalid Credentials

**Description**: Verify invalid login handling

**Steps**:
1. Navigate to /auth/login
2. Enter wrong email/password combination
3. Click "Sign In"

**Expected Result**:
- Error message: "Invalid email or password"
- User remains on login page
- Password field may be cleared

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Navigate from Login to Registration

**Description**: Verify navigation link to register

**Steps**:
1. Navigate to /auth/login
2. Locate "Don't have an account? Create account" link
3. Click the link

**Expected Result**:
- Navigates to /auth/register
- Registration page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Account Dashboard Access Flow

### TC-010: Redirect Unauthenticated User to Login

**Description**: Verify protected route handling

**Steps**:
1. Clear browser session/cookies
2. Navigate directly to /account

**Expected Result**:
- Redirects to /auth/login
- URL contains redirect parameter: `/auth/login?redirect=/account`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-011: Allow Authenticated User to Access Dashboard

**Description**: Verify authenticated access

**Steps**:
1. Log in with valid credentials
2. Navigate to /account
3. Verify dashboard loads

**Expected Result**:
- "My Account" heading is visible
- User name is displayed
- User email is displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-012: Display User Profile Information

**Description**: Verify profile card contents

**Steps**:
1. Log in as user with known details
2. Navigate to /account
3. Check profile card

**Expected Result**:
- User name in h2
- Email displayed
- "Member since" date visible
- User initials or avatar displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Show Quick Actions on Dashboard

**Description**: Verify quick action links

**Steps**:
1. Navigate to /account (authenticated)
2. Locate quick actions section

**Expected Result**:
- "My Orders" link visible
- "AI Creations" link visible
- "Saved Addresses" link visible
- "Account Settings" link visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Navigate to Orders from Quick Actions

**Description**: Verify orders navigation

**Steps**:
1. Navigate to /account
2. Click "My Orders" quick action
3. Observe navigation

**Expected Result**:
- Navigates to /account/orders
- Orders page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-015: Navigate to AI Creations from Quick Actions

**Description**: Verify AI creations navigation

**Steps**:
1. Navigate to /account
2. Click "AI Creations" quick action

**Expected Result**:
- Navigates to /account/ai-creations
- AI history page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Sign Out Flow

### TC-016: Sign Out and Redirect to Home

**Description**: Verify sign out functionality

**Steps**:
1. Log in and navigate to /account
2. Verify "My Account" heading is visible
3. Click "Sign Out" button
4. Observe redirect

**Expected Result**:
- Sign out API is called
- Redirects to home (/) or login
- Session is cleared

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: Require Re-authentication After Sign Out

**Description**: Verify session is cleared

**Steps**:
1. Complete sign out (TC-016)
2. Try to navigate to /account

**Expected Result**:
- Redirects to /auth/login
- User is no longer authenticated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Cross-Page Navigation Flow

### TC-018: Maintain Authentication Across Pages

**Description**: Verify session persistence

**Steps**:
1. Log in
2. Navigate to /account
3. Navigate to / (home)
4. Navigate back to /account
5. Verify still authenticated

**Expected Result**:
- User remains logged in
- Account page loads without login
- User name is displayed correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-019: Navigation Between Auth Pages

**Description**: Verify auth page navigation

**Steps**:
1. Navigate to /auth/login
2. Click "Create account" link
3. Verify on /auth/register
4. Click "Sign in" link
5. Verify on /auth/login

**Expected Result**:
- Navigation between auth pages works
- Forms are accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Redirect Authenticated Users from Login Page

**Description**: Verify already-logged-in handling

**Steps**:
1. Log in
2. Navigate directly to /auth/login
3. Observe behavior

**Expected Result**:
- May redirect to home
- Or show different UI for logged-in user

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Password Reset Flow

### TC-021: Display Forgot Password Link

**Description**: Verify forgot password link exists

**Steps**:
1. Navigate to /auth/login
2. Locate forgot password link

**Expected Result**:
- Link text: "Forgot password?"
- Link href: /auth/forgot-password

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-022: Navigate to Forgot Password Page

**Description**: Verify forgot password navigation

**Steps**:
1. Navigate to /auth/login
2. Click "Forgot password?" link

**Expected Result**:
- Navigates to /auth/forgot-password
- Password reset form loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Google OAuth Flow

### TC-023: Display Google OAuth Button on Login

**Description**: Verify Google login option

**Steps**:
1. Navigate to /auth/login
2. Locate Google OAuth button

**Expected Result**:
- "Continue with Google" button is visible
- Button has Google branding

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-024: Display Google OAuth Button on Register

**Description**: Verify Google registration option

**Steps**:
1. Navigate to /auth/register
2. Locate Google OAuth button

**Expected Result**:
- "Continue with Google" button is visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: OAuth Divider on Login Page

**Description**: Verify OAuth/email separator

**Steps**:
1. Navigate to /auth/login
2. Check for divider between OAuth and email

**Expected Result**:
- "or sign in with email" divider visible
- Clear separation between OAuth and email options

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-026: OAuth Divider on Register Page

**Description**: Verify OAuth/email separator on register

**Steps**:
1. Navigate to /auth/register
2. Check for divider

**Expected Result**:
- "or sign up with email" divider visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Session Handling Flow

### TC-027: Handle Expired Session Gracefully

**Description**: Verify session expiry handling

**Steps**:
1. Log in and navigate to /account
2. Wait for session to expire (or manually clear cookies)
3. Refresh the page

**Expected Result**:
- Redirects to /auth/login
- No error displayed
- Can log in again

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-028: Handle Network Errors During Auth Check

**Description**: Verify network error handling

**Steps**:
1. Log in
2. Disable network (DevTools)
3. Navigate to /account
4. Observe behavior

**Expected Result**:
- Error is handled gracefully
- May redirect to login
- No crash or unhandled error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Legal Links Flow

### TC-029: Display Terms of Service Link

**Description**: Verify Terms link on login

**Steps**:
1. Navigate to /auth/login
2. Locate Terms of Service link

**Expected Result**:
- Link text: "Terms of Service"
- Link href: /terms

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-030: Display Privacy Policy Link

**Description**: Verify Privacy link on login

**Steps**:
1. Navigate to /auth/login
2. Locate Privacy Policy link

**Expected Result**:
- Link text: "Privacy Policy"
- Link href: /privacy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Display Legal Agreement on Registration

**Description**: Verify legal text on register

**Steps**:
1. Navigate to /auth/register
2. Locate legal agreement text

**Expected Result**:
- Text includes "By creating an account"
- Links to terms and privacy visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design Flow

### TC-032: Complete Login Flow on Mobile

**Description**: Verify mobile login

**Steps**:
1. Set viewport to 375x667
2. Navigate to /auth/login
3. Fill form with valid credentials
4. Submit and verify login

**Expected Result**:
- Form is usable on mobile
- All fields accessible
- Login succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Complete Registration Flow on Mobile

**Description**: Verify mobile registration

**Steps**:
1. Set viewport to 375x667
2. Navigate to /auth/register
3. Fill all form fields
4. Submit registration

**Expected Result**:
- Form is usable on mobile
- Password requirements visible
- Registration succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Display Account Dashboard on Tablet

**Description**: Verify tablet account layout

**Steps**:
1. Set viewport to 768x1024
2. Log in and navigate to /account

**Expected Result**:
- "My Account" heading visible
- Quick actions visible
- Layout adapts to tablet width

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility Flow

### TC-035: Proper Heading Hierarchy on Login

**Description**: Verify heading structure

**Steps**:
1. Navigate to /auth/login
2. Check for h1 element

**Expected Result**:
- h1 is present and visible
- Logical heading hierarchy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Proper Heading Hierarchy on Register

**Description**: Verify heading structure on register

**Steps**:
1. Navigate to /auth/register
2. Check for h1 element

**Expected Result**:
- h1 is present and visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Proper Heading Hierarchy on Account

**Description**: Verify heading structure on account

**Steps**:
1. Log in and navigate to /account
2. Check for h1 element

**Expected Result**:
- h1 is present: "My Account"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Form Labels Associated with Inputs

**Description**: Verify form label associations

**Steps**:
1. Navigate to /auth/login
2. Check email and password labels

**Expected Result**:
- `<label for="email">` exists
- `<label for="password">` exists
- Labels correctly associated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Keyboard Navigation Through Auth Flow

**Description**: Verify keyboard-only navigation

**Steps**:
1. Navigate to /auth/login
2. Use Tab to navigate through form
3. Type email and password
4. Press Enter to submit

**Expected Result**:
- Tab navigates logically
- Form submits via keyboard
- Login succeeds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance Tests

### TC-040: Login Page Load Time

**Description**: Verify login page performance

**Steps**:
1. Open DevTools (Network tab)
2. Navigate to /auth/login
3. Measure time until form is visible

**Expected Result**:
- Page loads within 5 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

### TC-041: Register Page Load Time

**Description**: Verify register page performance

**Steps**:
1. Navigate to /auth/register
2. Measure load time

**Expected Result**:
- Page loads within 5 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

### TC-042: Account Page Load Time (Authenticated)

**Description**: Verify account page performance

**Steps**:
1. Log in
2. Navigate to /account
3. Measure time until "My Account" visible

**Expected Result**:
- Page loads within 5 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _____ ms
- Notes: _______________

---

## Edge Cases

### TC-043: Special Characters in Name

**Description**: Verify special characters are handled

**Steps**:
1. Navigate to /auth/register
2. Enter name: "O'Connor-Smith"
3. Complete registration

**Expected Result**:
- Name is accepted
- Registration succeeds
- Name displays correctly in account

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-044: Email with Plus Sign

**Description**: Verify plus sign email handling

**Steps**:
1. Navigate to /auth/login
2. Enter email: test+tag@example.com
3. Enter valid password
4. Submit login

**Expected Result**:
- Email format is accepted
- Login processes correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-045: Preserve Form Data After Validation Error

**Description**: Verify form data persistence

**Steps**:
1. Navigate to /auth/register
2. Fill name, email, password
3. Enter mismatched confirm password
4. Blur field to trigger validation
5. Check other fields

**Expected Result**:
- Name field retains value
- Email field retains value
- Password field retains value
- Only confirm password shows error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-046: Loading State During Form Submission

**Description**: Verify loading indicator

**Steps**:
1. Navigate to /auth/login
2. Fill valid credentials
3. Click "Sign In"
4. Observe button state

**Expected Result**:
- Button becomes disabled during submission
- Loading indicator (spinner) may appear
- Prevents double submission

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| BUG-001 | (Example) Password toggle icon misaligned on mobile | Low | Open |

---

## Summary

- **Total Test Cases**: 46
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Developer | | | |
| Product Owner | | | |
