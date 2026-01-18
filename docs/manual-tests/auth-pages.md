# Manual Test: Authentication Pages (Login & Register)

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URLs**:
  - Login: http://localhost:3001/auth/login
  - Register: http://localhost:3001/auth/register

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database migrations applied (`bun run db:push`)
- [ ] Docker services (PostgreSQL, Redis) running

## Overview
This document covers manual testing of the MasonArt authentication UI pages:
- Login page (/auth/login)
- Register page (/auth/register)
- Google OAuth integration
- Form validation and error states
- Redirect handling

## Test Cases

---

## Login Page Tests

### TC-001: Login Page Renders Correctly

**Description**: Verify the login page displays all required elements

**Steps**:
1. Navigate to http://localhost:3001/auth/login
2. Observe the page layout

**Expected Result**:
- MasonArt logo visible with "Art" in brand color (brand-500)
- "Welcome back" message displayed
- Google OAuth button visible
- "or sign in with email" divider visible
- Email and password fields present
- Sign In button visible
- "Create account" link visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Logo Links to Home

**Description**: Verify MasonArt logo navigates to home page

**Steps**:
1. Navigate to login page
2. Click on the MasonArt logo

**Expected Result**:
- Navigation to http://localhost:3001/
- Home page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-003: Page Title and Meta Tags

**Description**: Verify correct SEO meta tags

**Steps**:
1. Navigate to login page
2. Inspect page source or DevTools

**Expected Result**:
- Title contains "Sign In" and "MasonArt"
- robots meta tag contains "noindex"
- meta description contains "Sign in"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________
- Robots: _______________

---

## Google OAuth Tests

### TC-004: Google OAuth Button Display

**Description**: Verify Google OAuth button is correctly displayed

**Steps**:
1. Navigate to login page
2. Locate the Google button

**Expected Result**:
- "Continue with Google" button visible
- Google icon (SVG) visible in button
- Button has proper styling and hover states

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-005: Google OAuth Initiation

**Description**: Verify Google OAuth flow starts correctly

**Steps**:
1. Navigate to login page
2. Click "Continue with Google" button
3. Observe behavior

**Expected Result**:
- Redirects to Google OAuth authorization page
- OR displays loading state if using popup

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Behavior: _______________

---

### TC-006: OAuth Divider Display

**Description**: Verify divider between OAuth and email sign-in

**Steps**:
1. Navigate to login page
2. Observe divider section

**Expected Result**:
- Horizontal divider lines visible
- "or sign in with email" text centered between lines
- Text in muted color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Email Field Tests

### TC-007: Email Field Display

**Description**: Verify email field is correctly displayed

**Steps**:
1. Navigate to login page
2. Locate email field

**Expected Result**:
- Label "Email" visible
- Input field with type="email"
- Placeholder "your@email.com"
- Mail icon visible
- autocomplete="email" attribute set

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Email Field Interaction

**Description**: Verify email field focus and input behavior

**Steps**:
1. Navigate to login page
2. Click on email field
3. Type an email address

**Expected Result**:
- Focus ring appears on click
- Text input works correctly
- Focus styling visible (ring-2)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-009: Email Validation - Empty

**Description**: Verify validation for empty email

**Steps**:
1. Navigate to login page
2. Click email field, then click away (blur)
3. Observe error message

**Expected Result**:
- "Email is required" error message visible
- Error styling applied (red border)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-010: Email Validation - Invalid Format

**Description**: Verify email format validation

**Steps**:
1. Navigate to login page
2. Enter "invalid-email" in email field
3. Click away (blur)

**Expected Result**:
- "Please enter a valid email address" error message
- Error styling applied (red border)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-011: Email Validation - Valid Format

**Description**: Verify valid email is accepted

**Steps**:
1. Navigate to login page
2. Enter "test@example.com" in email field
3. Click away (blur)

**Expected Result**:
- No error message displayed
- Normal input styling (no red border)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Password Field Tests

### TC-012: Password Field Display

**Description**: Verify password field is correctly displayed

**Steps**:
1. Navigate to login page
2. Locate password field

**Expected Result**:
- Label "Password" visible
- Input field with type="password"
- Placeholder "Enter your password"
- Lock icon visible
- Show/hide password toggle button visible
- autocomplete="current-password" attribute set

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Password Toggle Visibility

**Description**: Verify password show/hide toggle works

**Steps**:
1. Navigate to login page
2. Enter password "test123"
3. Click show/hide toggle button
4. Observe password visibility
5. Click toggle again

**Expected Result**:
- Initially type="password" (hidden)
- After first click: type="text" (visible)
- Icon changes to indicate state
- After second click: type="password" (hidden again)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Password Validation - Empty

**Description**: Verify validation for empty password

**Steps**:
1. Navigate to login page
2. Click password field, then click away (blur)

**Expected Result**:
- "Password is required" error message visible
- Error styling applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-015: Password Validation - Short

**Description**: Verify minimum password length validation

**Steps**:
1. Navigate to login page
2. Enter "12345" (5 chars) in password field
3. Click away (blur)

**Expected Result**:
- "Password must be at least 6 characters" error message
- Error styling applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-016: Forgot Password Link

**Description**: Verify forgot password link is displayed

**Steps**:
1. Navigate to login page
2. Locate "Forgot password?" link

**Expected Result**:
- Link text "Forgot password?" visible
- Links to /auth/forgot-password
- Proper hover styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- href: _______________

---

## Submit Button Tests

### TC-017: Submit Button - Disabled State

**Description**: Verify submit button is disabled when form is invalid

**Steps**:
1. Navigate to login page (empty form)
2. Observe submit button state

**Expected Result**:
- "Sign In" button visible with arrow icon
- Button is disabled (cursor not pointer)
- Button has muted background color (bg-muted)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-018: Submit Button - Enabled State

**Description**: Verify submit button is enabled when form is valid

**Steps**:
1. Navigate to login page
2. Enter valid email: test@example.com
3. Enter valid password: password123
4. Observe submit button state

**Expected Result**:
- Button is NOT disabled (clickable)
- Button has brand color (bg-brand-500)
- Cursor shows pointer on hover

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-019: Submit Button - Loading State

**Description**: Verify loading state during form submission

**Steps**:
1. Fill in valid credentials
2. Click Sign In button
3. Observe button during API call

**Expected Result**:
- Button shows loading indicator (spinner)
- Button is disabled during loading
- Form fields may be disabled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Navigation Links Tests

### TC-020: Create Account Link

**Description**: Verify create account link navigates to register

**Steps**:
1. Navigate to login page
2. Click "Create account" link

**Expected Result**:
- Navigation to /auth/register
- Register page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-021: Terms of Service Link

**Description**: Verify Terms of Service link

**Steps**:
1. Navigate to login page
2. Click "Terms of Service" link

**Expected Result**:
- Links to /terms
- Page loads or navigates correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- href: _______________

---

### TC-022: Privacy Policy Link

**Description**: Verify Privacy Policy link

**Steps**:
1. Navigate to login page
2. Click "Privacy Policy" link

**Expected Result**:
- Links to /privacy
- Page loads or navigates correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- href: _______________

---

### TC-023: Terms Text Display

**Description**: Verify terms agreement text

**Steps**:
1. Navigate to login page
2. Locate terms text at bottom

**Expected Result**:
- Text "By signing in, you agree to our..." visible
- Terms and Privacy links embedded in text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Redirect Handling Tests

### TC-024: Redirect Preservation in Register Link

**Description**: Verify redirect URL is passed to register page

**Steps**:
1. Navigate to http://localhost:3001/auth/login?redirect=/checkout
2. Click "Create account" link
3. Observe URL

**Expected Result**:
- Register URL contains redirect parameter
- /auth/register?redirect=/checkout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Register URL: _______________

---

### TC-025: No Redirect Parameter - Default

**Description**: Verify normal navigation without redirect

**Steps**:
1. Navigate to http://localhost:3001/auth/login (no redirect param)
2. Click "Create account" link

**Expected Result**:
- Register URL is plain /auth/register
- No redirect parameter added

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Register URL: _______________

---

## Success Message Tests

### TC-026: Registration Success Message

**Description**: Verify success message after registration

**Steps**:
1. Navigate to http://localhost:3001/auth/login?registered=true

**Expected Result**:
- Green success banner visible
- "Account created successfully" message displayed
- Check icon visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-027: No Success Message - Normal

**Description**: Verify no success message on normal visit

**Steps**:
1. Navigate to http://localhost:3001/auth/login

**Expected Result**:
- No green success banner visible
- Normal page layout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Register Page Tests

### TC-028: Register Page Renders Correctly

**Description**: Verify the register page displays all required elements

**Steps**:
1. Navigate to http://localhost:3001/auth/register
2. Observe the page layout

**Expected Result**:
- MasonArt logo visible with "Art" in brand color
- "Create your account to get started" message displayed
- Google OAuth button visible
- "or sign up with email" divider visible
- Full Name, Email, Password, Confirm Password fields present
- Create Account button visible
- "Sign in" link visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-029: Register Page Meta Tags

**Description**: Verify correct SEO meta tags for register page

**Steps**:
1. Navigate to register page
2. Inspect page source or DevTools

**Expected Result**:
- Title contains "Create Account" and "MasonArt"
- robots meta tag contains "noindex"
- meta description contains "Create"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-030: Name Field Validation - Empty

**Description**: Verify name field validation

**Steps**:
1. Navigate to register page
2. Click name field, then blur

**Expected Result**:
- "Name is required" error message visible
- Error styling applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-031: Name Field Validation - Too Short

**Description**: Verify minimum name length

**Steps**:
1. Navigate to register page
2. Enter "A" in name field
3. Blur

**Expected Result**:
- "Name must be at least 2 characters" error message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-032: Password Requirements Display

**Description**: Verify password requirements appear when typing

**Steps**:
1. Navigate to register page
2. Start typing in password field

**Expected Result**:
- Requirements list appears after first character
- Shows 4 requirements:
  - At least 8 characters
  - Contains a number
  - Contains a lowercase letter
  - Contains an uppercase letter

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-033: Password Requirements - Met Status

**Description**: Verify requirements turn green when met

**Steps**:
1. Navigate to register page
2. Enter "a" in password field
3. Observe "Contains a lowercase letter" requirement

**Expected Result**:
- "Contains a lowercase letter" shows green checkmark
- Green color (text-green-600)
- Other unmet requirements stay muted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-034: Password Requirements - All Met

**Description**: Verify all requirements green when password is valid

**Steps**:
1. Navigate to register page
2. Enter "Password1" in password field

**Expected Result**:
- All 4 requirements show green checkmarks
- All text is text-green-600
- No errors displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-035: Confirm Password Validation

**Description**: Verify confirm password matching

**Steps**:
1. Navigate to register page
2. Enter "Password1" in password field
3. Enter "Password2" in confirm password field
4. Blur

**Expected Result**:
- "Passwords do not match" error message visible
- Error styling applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error: _______________

---

### TC-036: Confirm Password - Match

**Description**: Verify matching passwords accepted

**Steps**:
1. Navigate to register page
2. Enter "Password1" in password field
3. Enter "Password1" in confirm password field
4. Blur

**Expected Result**:
- No error message
- Normal input styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-037: Confirm Password Toggle

**Description**: Verify confirm password show/hide toggle

**Steps**:
1. Navigate to register page
2. Enter password in confirm field
3. Click show/hide toggle

**Expected Result**:
- Password visibility toggles correctly
- Icon changes to indicate state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: Register Form - Full Valid Submission

**Description**: Verify form enables with all valid data

**Steps**:
1. Navigate to register page
2. Fill in:
   - Name: John Doe
   - Email: john@example.com
   - Password: Password1
   - Confirm Password: Password1
3. Observe submit button

**Expected Result**:
- Create Account button is NOT disabled
- Button has brand color (bg-brand-500)
- Button is clickable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-039: Sign In Link Navigation

**Description**: Verify sign in link navigates to login

**Steps**:
1. Navigate to register page
2. Click "Sign in" link

**Expected Result**:
- Navigation to /auth/login
- Login page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-040: Register Redirect Preservation

**Description**: Verify redirect passed to login link

**Steps**:
1. Navigate to http://localhost:3001/auth/register?redirect=/checkout
2. Click "Sign in" link

**Expected Result**:
- Login URL contains redirect parameter
- /auth/login?redirect=/checkout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Login URL: _______________

---

## Responsive Design Tests

### TC-041: Mobile Layout - Login

**Description**: Verify login page on mobile viewport

**Steps**:
1. Set viewport to 375x667 (iPhone SE)
2. Navigate to login page

**Expected Result**:
- All elements visible and accessible
- Form fills available width
- No horizontal scrolling
- Centered layout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-042: Mobile Layout - Register

**Description**: Verify register page on mobile viewport

**Steps**:
1. Set viewport to 375x667 (iPhone SE)
2. Navigate to register page

**Expected Result**:
- All fields visible and accessible
- Password requirements fit in viewport
- No horizontal scrolling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-043: Tablet Layout

**Description**: Verify auth pages on tablet viewport

**Steps**:
1. Set viewport to 768x1024 (iPad)
2. Navigate to login and register pages

**Expected Result**:
- Centered form container
- Proper spacing and margins
- Logo and all elements visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-044: Desktop Layout

**Description**: Verify auth pages on desktop viewport

**Steps**:
1. Set viewport to 1280x800
2. Navigate to login and register pages

**Expected Result**:
- max-w-md container visible
- Centered layout with proper margins
- All elements properly spaced

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility Tests

### TC-045: Heading Hierarchy

**Description**: Verify proper heading structure

**Steps**:
1. Navigate to login page
2. Inspect headings

**Expected Result**:
- Single H1 (MasonArt logo/brand)
- No skipped heading levels

**Actual Result**:
- [ ] PASS / [ ] FAIL
- H1 Count: _______________

---

### TC-046: Form Labels

**Description**: Verify all inputs have associated labels

**Steps**:
1. Navigate to login page
2. Inspect email and password fields

**Expected Result**:
- label[for="email"] exists and is visible
- label[for="password"] exists and is visible
- Labels properly associated with inputs

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-047: Keyboard Navigation

**Description**: Verify form is keyboard navigable

**Steps**:
1. Navigate to login page
2. Press Tab repeatedly
3. Navigate through all interactive elements

**Expected Result**:
- Focus visible on each element
- Logical tab order
- Can reach all buttons and links
- Can submit form with Enter

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tab Order: _______________

---

### TC-048: Focus Ring Visibility

**Description**: Verify focus rings on inputs

**Steps**:
1. Navigate to login page
2. Tab to email field

**Expected Result**:
- Focus ring visible (ring-2 class)
- High contrast visible ring
- Ring appears on all focusable elements

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance Tests

### TC-049: Page Load Time - Login

**Description**: Verify acceptable load time

**Steps**:
1. Open DevTools Network tab
2. Navigate to login page
3. Measure time to interactive

**Expected Result**:
- H1 visible within 5 seconds
- Form interactive quickly
- No blocking resources

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-050: No JavaScript Errors

**Description**: Verify no console errors

**Steps**:
1. Open DevTools Console
2. Navigate to login and register pages
3. Fill forms and interact

**Expected Result**:
- No JavaScript errors in console
- Network errors (if any) handled gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors Found: _______________

---

## Cross-Page Navigation Tests

### TC-051: Login to Register and Back

**Description**: Verify navigation between auth pages

**Steps**:
1. Navigate to login page
2. Click "Create account"
3. Click "Sign in" on register page

**Expected Result**:
- Navigation works both directions
- URL updates correctly
- Form state resets appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-052: Browser Back Button

**Description**: Verify browser navigation works

**Steps**:
1. Navigate to login page
2. Click "Create account" to go to register
3. Click browser back button

**Expected Result**:
- Returns to login page
- URL updates correctly
- Page renders without errors

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
- Screen Resolution: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Security**:
   - Ensure HTTPS in production
   - Verify secure cookie handling
   - Check password strength requirements

2. **UX Improvements**:
   - Consider adding password strength meter
   - Add "Remember me" checkbox option
   - Improve error message clarity

3. **Accessibility**:
   - Ensure screen reader compatibility
   - Add aria-labels where needed
   - Test with keyboard-only navigation

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
