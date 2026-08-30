# Manual Test: Authentication Routes

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-18
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **API Base URL**: http://localhost:3000/api (Backend) / http://localhost:3001 (Frontend)
- **Auth Framework**: Better Auth v1.x

## Prerequisites
- [ ] Dev server running at http://localhost:3000 (API) and http://localhost:3001 (Frontend)
- [ ] Database migrations applied (`bun run db:migrate` — not `db:push`, which skips the audit-log trigger, #663)
- [ ] Docker services (PostgreSQL, Redis) running (`docker compose up -d`)
- [ ] API testing tool ready (Postman, Insomnia, cURL, or browser DevTools)
- [ ] Google OAuth credentials configured (for OAuth tests only)

## Overview
This document covers manual testing of Better Auth integration routes:
- User Registration (Sign-Up)
- User Login (Sign-In)
- User Logout (Sign-Out)
- Session Management

## Test Cases

---

### TC-001: Auth Routes Availability

**Description**: Verify all authentication routes are mounted and accessible

**Endpoint**: `/api/auth/*`

**Steps**:
1. Open browser DevTools (Network tab)
2. Send GET request to `/api/auth/session`
3. Verify response is not 404

**Expected Result**:
- Auth routes are mounted
- Returns valid response (not 404)
- Response has appropriate status code (200, 401, etc.)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## User Registration (Sign-Up)

### TC-002: Register User with Valid Credentials

**Description**: Create new user account with valid email and password

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "testuser@example.com",
  "password": "TestPassword123!",
  "name": "Test User"
}
```

**Steps**:
1. Send POST request to `/api/auth/sign-up/email`
2. Include `Content-Type: application/json` header
3. Use request body above with unique email

**Expected Result**:
- Status: 200-299
- Returns user data (user object)
- User created in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status Code: _______________
- Response: _______________

---

### TC-003: Registration Returns User Data

**Description**: Verify successful registration returns user information

**Endpoint**: `POST /api/auth/sign-up/email`

**Steps**:
1. Register a new user with valid credentials
2. Examine response body

**Expected Result**:
- Response contains user object
- User object includes: id, email, name
- No password/hash in response
- Proper JSON format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- User Data: _______________

---

### TC-004: Reject Registration with Missing Email

**Description**: Verify validation for missing email field

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "password": "TestPassword123!",
  "name": "Test User"
}
```

**Steps**:
1. Send registration request without email field
2. Check response status and error message

**Expected Result**:
- Status: 400-499
- Error message indicates missing email
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Error: _______________

---

### TC-005: Reject Registration with Missing Password

**Description**: Verify validation for missing password field

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "testuser@example.com",
  "name": "Test User"
}
```

**Steps**:
1. Send registration request without password field
2. Check response status and error message

**Expected Result**:
- Status: 400-499
- Error message indicates missing password
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Error: _______________

---

### TC-006: Reject Registration with Invalid Email Format

**Description**: Verify email format validation

**Endpoint**: `POST /api/auth/sign-up/email`

**Test Cases**:
- Email: `invalid-email` (no @ symbol)
- Email: `@example.com` (missing local part)
- Email: `test@` (missing domain)
- Email: `test @example.com` (space in email)

**Steps**:
1. Send registration request with invalid email format
2. Check response status and error message

**Expected Result**:
- Status: 400-499
- Error message indicates invalid email format
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Test: _______________
- Status: _______________

---

### TC-007: Reject Registration with Weak Password

**Description**: Verify password strength validation

**Endpoint**: `POST /api/auth/sign-up/email`

**Test Cases**:
- Password: `weak` (too short, < 8 chars)
- Password: `password` (too common)
- Password: `12345678` (only numbers)

**Steps**:
1. Send registration request with weak password
2. Check response status and error message

**Expected Result**:
- Status: 400-499
- Error message indicates weak password
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Password: _______________
- Status: _______________

---

### TC-008: Reject Registration with Duplicate Email

**Description**: Verify unique email constraint

**Endpoint**: `POST /api/auth/sign-up/email`

**Steps**:
1. Register a user with email `duplicate@example.com`
2. Try to register another user with same email
3. Check response status and error message

**Expected Result**:
- First registration: Success (200-299)
- Second registration: Failure (400-499)
- Error message indicates duplicate email
- Only one user in database

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Error: _______________

---

### TC-009: Register with Only Required Fields

**Description**: Verify registration works with minimal fields (email, password only)

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "minimal@example.com",
  "password": "TestPassword123!"
}
```

**Steps**:
1. Send registration request without optional fields (name)
2. Check response status

**Expected Result**:
- Status: 200-299
- User created successfully
- Name field is null or default value

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-010: Reject Registration without Content-Type Header

**Description**: Verify Content-Type validation

**Endpoint**: `POST /api/auth/sign-up/email`

**Steps**:
1. Send registration request without `Content-Type` header
2. Check response status

**Expected Result**:
- Status: 400-499
- Error indicates missing or invalid Content-Type

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-011: Reject Registration with Malformed JSON

**Description**: Verify JSON parsing error handling

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body** (invalid JSON):
```
invalid json{
```

**Steps**:
1. Send registration request with malformed JSON
2. Check response status and error message

**Expected Result**:
- Status: 400-499
- Error indicates JSON parsing error
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-012: Security - XSS Attempt in Name Field

**Description**: Verify input sanitization for XSS prevention

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "xsstest@example.com",
  "password": "TestPassword123!",
  "name": "<script>alert('xss')</script>"
}
```

**Steps**:
1. Send registration request with XSS payload in name
2. Register successfully
3. Retrieve user data and check name field

**Expected Result**:
- Registration succeeds or rejects safely
- If accepted, name is sanitized or escaped
- No script execution

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Stored Name: _______________

---

### TC-013: Security - SQL Injection Prevention

**Description**: Verify protection against SQL injection

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "admin'--@example.com",
  "password": "' OR '1'='1"
}
```

**Steps**:
1. Send registration request with SQL injection attempt
2. Check response

**Expected Result**:
- Request fails or is handled safely
- No SQL error messages exposed
- No unauthorized access

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-014: Edge Case - Very Long Email

**Description**: Verify email length validation

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "aaaaaaaaaaaaaaaaaaaaaaaaaaa...@example.com",
  "password": "TestPassword123!"
}
```
(300+ characters)

**Steps**:
1. Send registration request with very long email
2. Check response

**Expected Result**:
- Status: 400-499
- Error indicates email too long
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-015: Edge Case - Very Long Password

**Description**: Verify password length limit

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "longpass@example.com",
  "password": "a...a"
}
```
(200+ characters)

**Steps**:
1. Send registration request with very long password
2. Check response

**Expected Result**:
- Status: 400-499
- Error indicates password exceeds max length (128 chars)
- User not created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

## User Login (Sign-In)

### TC-016: Login with Valid Credentials

**Description**: Authenticate user with correct email and password

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "email": "testuser@example.com",
  "password": "TestPassword123!"
}
```

**Steps**:
1. Register a user first (use TC-002)
2. Send POST request to `/api/auth/sign-in/email`
3. Check response status and data

**Expected Result**:
- Status: 200-299
- Returns session data
- User authenticated successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Session Data: _______________

---

### TC-017: Login Returns Session Data

**Description**: Verify login response contains session information

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Login with valid credentials
2. Examine response body

**Expected Result**:
- Response contains session/user object
- Includes: user id, email, name
- Session token present
- No password in response

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Session Data: _______________

---

### TC-018: Login Sets Session Cookie

**Description**: Verify session cookie is set after successful login

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Login with valid credentials
2. Check response headers for `Set-Cookie`
3. Verify cookie contains session token

**Expected Result**:
- `Set-Cookie` header present
- Cookie name matches session cookie (e.g., `chobii.session`)
- Cookie has secure flags (HttpOnly, SameSite)
- Cookie has expiration date

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cookie: _______________
- Flags: _______________

---

### TC-019: Reject Login with Incorrect Password

**Description**: Verify authentication fails with wrong password

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "email": "testuser@example.com",
  "password": "WrongPassword123!"
}
```

**Steps**:
1. Login with valid email but incorrect password
2. Check response status and error

**Expected Result**:
- Status: 400-499 (typically 401)
- Error message indicates invalid credentials
- No session created

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Error: _______________

---

### TC-020: Reject Login with Non-Existent Email

**Description**: Verify authentication fails with unregistered email

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "email": "nonexistent@example.com",
  "password": "TestPassword123!"
}
```

**Steps**:
1. Login with non-existent email
2. Check response status and error

**Expected Result**:
- Status: 400-499 (typically 401)
- Error message indicates invalid credentials
- No session created
- No user enumeration (same error as wrong password)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Error: _______________

---

### TC-021: Reject Login with Missing Email

**Description**: Verify validation for missing email field

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "password": "TestPassword123!"
}
```

**Steps**:
1. Send login request without email
2. Check response status

**Expected Result**:
- Status: 400-499
- Error indicates missing email

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-022: Reject Login with Missing Password

**Description**: Verify validation for missing password field

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "email": "testuser@example.com"
}
```

**Steps**:
1. Send login request without password
2. Check response status

**Expected Result**:
- Status: 400-499
- Error indicates missing password

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-023: Reject Login with Empty Credentials

**Description**: Verify validation for empty string values

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "email": "",
  "password": ""
}
```

**Steps**:
1. Send login request with empty strings
2. Check response status

**Expected Result**:
- Status: 400-499
- Error indicates invalid credentials

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-024: Case-Sensitive Email Login

**Description**: Verify email case handling during login

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Register user with email `testuser@example.com`
2. Login with `TESTUSER@EXAMPLE.COM` (uppercase)
3. Check if login succeeds

**Expected Result**:
- Email should be case-insensitive
- Login succeeds with any case variation
- Status: 200-299

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Notes: _______________

---

### TC-025: Security - SQL Injection Prevention

**Description**: Verify protection against SQL injection in login

**Endpoint**: `POST /api/auth/sign-in/email`

**Request Body**:
```json
{
  "email": "admin'--",
  "password": "' OR '1'='1"
}
```

**Steps**:
1. Send login request with SQL injection attempt
2. Check response

**Expected Result**:
- Status: 400-499
- Login fails
- No SQL errors exposed
- No unauthorized access

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-026: Concurrent Login Requests

**Description**: Verify system handles multiple simultaneous login attempts

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Register a test user
2. Send 5 simultaneous login requests for same user
3. Check all responses

**Expected Result**:
- All requests handled successfully
- All return status 200-299
- All create valid sessions
- No race conditions or errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- All Successful: _______________
- Notes: _______________

---

## User Logout (Sign-Out)

### TC-027: Logout Authenticated User

**Description**: End user session and clear authentication

**Endpoint**: `POST /api/auth/sign-out`

**Steps**:
1. Login as a user (get session cookie)
2. Send POST request to `/api/auth/sign-out` with session cookie
3. Check response status

**Expected Result**:
- Status: 200-299
- Session terminated
- User logged out successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-028: Logout Clears Session Cookie

**Description**: Verify session cookie is cleared/expired after logout

**Endpoint**: `POST /api/auth/sign-out`

**Steps**:
1. Login and get session cookie
2. Send logout request with session cookie
3. Check `Set-Cookie` header in response
4. Try to access protected route with old cookie

**Expected Result**:
- `Set-Cookie` header present
- Cookie is expired or cleared (Max-Age=0 or expires in past)
- Old cookie no longer valid for authentication

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cookie: _______________
- Old Cookie Valid: _______________

---

### TC-029: Logout without Session Cookie

**Description**: Verify logout handles missing session gracefully

**Endpoint**: `POST /api/auth/sign-out`

**Steps**:
1. Send logout request without any cookies
2. Check response status

**Expected Result**:
- Status: 200-499 (handled gracefully)
- No server error
- Appropriate message

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-030: Logout with Invalid Session Cookie

**Description**: Verify logout handles invalid session token

**Endpoint**: `POST /api/auth/sign-out`

**Steps**:
1. Send logout request with invalid session cookie
2. Use cookie: `chobii.session=invalid-token-12345`
3. Check response status

**Expected Result**:
- Status: 200-499 (handled gracefully)
- No server error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-031: Logout with Expired Session

**Description**: Verify logout handles expired session

**Endpoint**: `POST /api/auth/sign-out`

**Steps**:
1. Use an expired session cookie
2. Send logout request
3. Check response

**Expected Result**:
- Status: 200-499 (handled gracefully)
- No server error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-032: Reject Logout with GET Method

**Description**: Verify logout requires POST method

**Endpoint**: `GET /api/auth/sign-out`

**Steps**:
1. Send GET request to logout endpoint
2. Check response status

**Expected Result**:
- Status: 400-499 (405 Method Not Allowed)
- Error indicates POST required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

## Session Management

### TC-033: Retrieve Current Session

**Description**: Get current user session information

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Login as a user (get session cookie)
2. Send GET request to `/api/auth/session` with cookie
3. Check response

**Expected Result**:
- Status: 200-299
- Returns session data
- Includes user information

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Session Data: _______________

---

### TC-034: Session Returns User Data

**Description**: Verify session endpoint returns complete user information

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Get current session with valid cookie
2. Examine response body

**Expected Result**:
- User object present
- Contains: id, email, name, role
- Session metadata: expiresAt, token
- No sensitive data (password)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- User Data: _______________

---

### TC-035: Session Request without Cookie

**Description**: Verify session endpoint handles unauthenticated requests

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Send GET request without session cookie
2. Check response

**Expected Result**:
- Status: 200 or 401
- Returns null/empty session or error
- No server error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- Response: _______________

---

### TC-036: Session Request with Invalid Cookie

**Description**: Verify session endpoint handles invalid tokens

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Send request with invalid cookie: `chobii.session=invalid-token`
2. Check response

**Expected Result**:
- Status: 200 or 401
- Returns null/empty session or error
- No server error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-037: Session Cookie Format Validation

**Description**: Verify session validates cookie format correctly

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Login and get valid session cookie
2. Use session cookie to get session
3. Verify session is validated

**Expected Result**:
- Valid cookie accepted
- Session data returned
- Status: 200

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

## Error Handling

### TC-038: Unsupported HTTP Method

**Description**: Verify endpoints reject unsupported methods

**Endpoint**: `DELETE /api/auth/sign-in/email`

**Steps**:
1. Send DELETE request to sign-in endpoint
2. Check response

**Expected Result**:
- Status: 400-499 (405 Method Not Allowed)
- Error message indicates method not allowed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-039: Error Response Format

**Description**: Verify consistent error response structure

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Send invalid login request
2. Examine error response structure

**Expected Result**:
- Content-Type: application/json
- Response has error field
- Error includes message
- Consistent structure across all errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Format: _______________

---

### TC-040: Rapid Successive Requests

**Description**: Verify system handles rapid repeated requests

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Send 3 rapid successive requests to session endpoint
2. Check all responses

**Expected Result**:
- All requests handled
- All return valid responses
- No rate limiting errors (unless implemented)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## HTTP Method Validation

### TC-041: Reject Sign-Up with GET Method

**Description**: Verify sign-up requires POST method

**Endpoint**: `GET /api/auth/sign-up/email`

**Steps**:
1. Send GET request to sign-up endpoint
2. Check response

**Expected Result**:
- Status: 405 Method Not Allowed
- Error message clear

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-042: Reject Sign-In with PUT Method

**Description**: Verify sign-in requires POST method

**Endpoint**: `PUT /api/auth/sign-in/email`

**Steps**:
1. Send PUT request to sign-in endpoint
2. Check response

**Expected Result**:
- Status: 405 Method Not Allowed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-043: Handle OPTIONS Request for CORS

**Description**: Verify CORS preflight handling

**Endpoint**: `OPTIONS /api/auth/sign-in/email`

**Steps**:
1. Send OPTIONS request to auth endpoint
2. Check response headers

**Expected Result**:
- Status: 200-299
- CORS headers present:
  - Access-Control-Allow-Origin
  - Access-Control-Allow-Methods
  - Access-Control-Allow-Headers

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________
- CORS Headers: _______________

---

## Response Headers

### TC-044: Content-Type for JSON Responses

**Description**: Verify proper Content-Type header

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Send request to any auth endpoint
2. Check Content-Type header in response

**Expected Result**:
- Content-Type: application/json
- Proper charset specified (utf-8)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Content-Type: _______________

---

### TC-045: Security Headers

**Description**: Verify security headers are set

**Endpoint**: Any auth endpoint

**Steps**:
1. Send request to auth endpoint
2. Examine response headers

**Expected Result**:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY or SAMEORIGIN
- Strict-Transport-Security (if HTTPS)
- No sensitive info in headers

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Security Headers: _______________

---

## Performance Testing

### TC-046: Response Time - Registration

**Description**: Verify acceptable response time for registration

**Endpoint**: `POST /api/auth/sign-up/email`

**Steps**:
1. Register a new user
2. Measure response time

**Expected Result**:
- Response time < 2 seconds
- Reasonable performance

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-047: Response Time - Login

**Description**: Verify acceptable response time for login

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Login with valid credentials
2. Measure response time

**Expected Result**:
- Response time < 1 second
- Quick authentication

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

### TC-048: Response Time - Session Check

**Description**: Verify acceptable response time for session check

**Endpoint**: `GET /api/auth/session`

**Steps**:
1. Check session with valid cookie
2. Measure response time

**Expected Result**:
- Response time < 500ms
- Fast session validation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response Time: _______________

---

## Integration Testing

### TC-049: Complete Registration → Login Flow

**Description**: Verify complete user journey from registration to login

**Steps**:
1. Register new user
2. Logout (if auto-logged in)
3. Login with same credentials
4. Verify session is active

**Expected Result**:
- Registration succeeds
- Login succeeds
- Session cookie set
- User authenticated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-050: Complete Login → Session → Logout Flow

**Description**: Verify complete authenticated session lifecycle

**Steps**:
1. Login with valid credentials
2. Check session endpoint
3. Logout
4. Try to access session again

**Expected Result**:
- Login succeeds
- Session returns user data
- Logout succeeds
- Session check returns null/401 after logout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Google OAuth Testing

### TC-051: Initiate Google OAuth Flow

**Description**: Verify Google OAuth sign-in initiation

**Endpoint**: `POST /api/auth/sign-in/social`

**Request Body**:
```json
{
  "provider": "google",
  "callbackURL": "http://localhost:3001/auth/callback"
}
```

**Steps**:
1. Send POST request to `/api/auth/sign-in/social`
2. Include provider and callbackURL
3. Check response for redirect URL

**Expected Result**:
- Status: 200-302
- Returns Google OAuth authorization URL
- URL contains client_id and redirect_uri

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Redirect URL: _______________

---

### TC-052: Handle Google OAuth Callback

**Description**: Verify OAuth callback handling

**Endpoint**: `GET /api/auth/callback/google`

**Steps**:
1. Navigate to Google OAuth authorization URL
2. Complete Google sign-in
3. Observe callback handling
4. Check if user is created/logged in

**Expected Result**:
- User redirected back to app
- Session cookie set
- User account created or linked
- Redirect to callbackURL

**Actual Result**:
- [ ] PASS / [ ] FAIL
- User Created: _______________

---

### TC-053: OAuth Account Linking

**Description**: Verify OAuth accounts can be linked to existing email accounts

**Steps**:
1. Register user with email `test@gmail.com`
2. Sign out
3. Sign in with Google using same email
4. Verify account is linked

**Expected Result**:
- Accounts are linked successfully
- Single user record with multiple accounts
- Both sign-in methods work

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Account Linked: _______________

---

### TC-054: OAuth Error Handling - Missing Code

**Description**: Verify handling of OAuth callback without code

**Endpoint**: `GET /api/auth/callback/google`

**Steps**:
1. Send GET request to callback without code parameter
2. Check response

**Expected Result**:
- Status: 400-499
- Error message indicates missing code
- User not authenticated

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

## Email Verification Testing

### TC-055: Registration Sends Verification Email

**Description**: Verify email verification is sent on registration

**Endpoint**: `POST /api/auth/sign-up/email`

**Steps**:
1. Register new user with valid email
2. Check server logs for verification URL (in dev mode)
3. Verify email contains verification link

**Expected Result**:
- Registration succeeds
- Verification email/log generated
- Contains valid verification URL with token
- Token expires in 24 hours

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Verification URL: _______________

---

### TC-056: Verify Email Address

**Description**: Verify email verification flow

**Endpoint**: `GET /api/auth/verify-email` (with token)

**Steps**:
1. Register new user
2. Get verification token from email/logs
3. Navigate to verification URL
4. Check if email is marked as verified

**Expected Result**:
- Email marked as verified
- User auto-signed in (per config)
- Redirect to success page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Email Verified: _______________

---

### TC-057: Reject Expired Verification Token

**Description**: Verify expired tokens are rejected

**Steps**:
1. Use an expired verification token (>24 hours old)
2. Attempt to verify email
3. Check response

**Expected Result**:
- Status: 400-499
- Error indicates token expired
- Email not verified

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

### TC-058: Reject Invalid Verification Token

**Description**: Verify invalid tokens are rejected

**Steps**:
1. Send request with invalid/tampered token
2. Check response

**Expected Result**:
- Status: 400-499
- Error indicates invalid token
- Email not verified

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status: _______________

---

## User Role Testing (RBAC)

### TC-059: Default Role Assignment

**Description**: Verify new users get default customer role

**Steps**:
1. Register new user
2. Check session data for role
3. Verify role is "customer"

**Expected Result**:
- Role field present in user data
- Default role is "customer"
- AI credits set to 5 (default)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Role: _______________
- AI Credits: _______________

---

### TC-060: Session Contains User Role

**Description**: Verify session endpoint returns user role

**Endpoint**: `GET /api/auth/get-session`

**Steps**:
1. Login as user
2. Check session endpoint
3. Verify role is included

**Expected Result**:
- Session includes user.role
- Role matches database value
- Additional fields present (firstName, lastName, etc.)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- User Role: _______________

---

### TC-061: Admin Role Properties

**Description**: Verify admin users have correct role

**Steps**:
1. Create admin user (via database or admin panel)
2. Login as admin
3. Check session for role

**Expected Result**:
- Role is "admin" or "super-admin"
- Admin permissions available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Admin Role: _______________

---

### TC-062: Trade Role Properties

**Description**: Verify trade users have correct role

**Steps**:
1. Create trade user or upgrade existing user
2. Login as trade user
3. Check session for role and trade status

**Expected Result**:
- Role is "trade"
- tradeStatus is "approved"
- Trade permissions available

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Trade Role: _______________
- Trade Status: _______________

---

## Additional User Fields Testing

### TC-063: Registration with Additional Fields

**Description**: Verify additional user fields can be set on registration

**Endpoint**: `POST /api/auth/sign-up/email`

**Request Body**:
```json
{
  "email": "fulluser@example.com",
  "password": "TestPassword123!",
  "name": "Full Name",
  "firstName": "First",
  "lastName": "Last",
  "phone": "+1234567890"
}
```

**Steps**:
1. Register with all optional fields
2. Check session for field values

**Expected Result**:
- All fields stored correctly
- Fields returned in session
- Phone verified defaults to false

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fields Present: _______________

---

### TC-064: Update User Profile

**Description**: Verify user can update their profile

**Steps**:
1. Login as user
2. Update profile via API
3. Verify changes persist

**Expected Result**:
- Profile updates successfully
- Changes reflected in session
- Email change triggers verification

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Updated Fields: _______________

---

## Session Cookie Configuration

### TC-065: Cookie Configuration - Secure Flags

**Description**: Verify session cookie has correct configuration

**Endpoint**: `POST /api/auth/sign-in/email`

**Steps**:
1. Login successfully
2. Inspect `Set-Cookie` header
3. Verify cookie attributes

**Expected Result**:
- Cookie name: `chobii.session`
- HttpOnly: true
- SameSite: Lax or Strict
- Secure: true (in production)
- Max-Age or Expires set (7 days)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cookie Name: _______________
- Flags: _______________

---

### TC-066: Session Expiry

**Description**: Verify session expires after configured time

**Steps**:
1. Login and get session
2. Note session expiry time
3. Verify expiry matches config (7 days)

**Expected Result**:
- Session has expiry timestamp
- Expiry is approximately 7 days from login
- Session update age is 24 hours

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Expiry Time: _______________

---

### TC-067: Session Cookie Caching

**Description**: Verify session cookie caching behavior

**Steps**:
1. Login and get session
2. Make multiple session checks
3. Observe response times

**Expected Result**:
- Session is cached (5 minute max-age per config)
- Subsequent requests faster
- Cache invalidated on logout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cache Working: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 67
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Database Version: _______________
- Better Auth Version: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Security**:
   - Ensure rate limiting on auth endpoints
   - Monitor failed login attempts
   - Implement CAPTCHA for repeated failures

2. **User Experience**:
   - Clear error messages for users
   - Password strength indicator
   - Remember me functionality

3. **Monitoring**:
   - Log authentication events
   - Track session creation/destruction
   - Monitor suspicious activity

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
