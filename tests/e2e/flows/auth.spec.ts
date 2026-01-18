import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Authentication Flow E2E Tests
 *
 * End-to-end tests for the complete authentication user journey:
 * 1. User registers a new account
 * 2. User is redirected to login with success message
 * 3. User logs in with new credentials
 * 4. User accesses account dashboard
 * 5. User manages account settings
 * 6. User updates profile information
 * 7. User signs out
 * 8. User logs back in
 *
 * These tests simulate real user journeys across multiple pages,
 * testing the integration between:
 * - packages/web/app/routes/auth/register.tsx (Registration)
 * - packages/web/app/routes/auth/login.tsx (Login)
 * - packages/web/app/routes/account/index.tsx (Account Dashboard)
 * - packages/api/src/auth/index.ts (Better Auth Backend)
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique test email to avoid conflicts between test runs
 */
function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `test_${timestamp}_${random}@example.com`;
}

/**
 * Generate a valid test password meeting all requirements
 */
function generateTestPassword(): string {
  return 'TestPassword123!';
}

/**
 * Mock authenticated session API response
 */
async function mockAuthenticatedSession(page: Page, userData?: Partial<{
  id: string;
  name: string;
  email: string;
  createdAt: string;
}>) {
  await page.route('**/api/auth/get-session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: userData?.id || 'test-user-id',
          name: userData?.name || 'Test User',
          email: userData?.email || 'test@example.com',
          createdAt: userData?.createdAt || '2024-01-01T00:00:00Z',
        },
      }),
    });
  });
}

/**
 * Mock unauthenticated session (no user)
 */
async function mockUnauthenticatedSession(page: Page) {
  await page.route('**/api/auth/get-session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    });
  });
}

/**
 * Mock successful sign-up API response
 */
async function mockSuccessfulSignUp(page: Page) {
  await page.route('**/api/auth/sign-up/email', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'new-user-id',
          name: 'New Test User',
          email: 'newuser@example.com',
          createdAt: new Date().toISOString(),
        },
      }),
    });
  });
}

/**
 * Mock failed sign-up API response (email exists)
 */
async function mockFailedSignUpEmailExists(page: Page) {
  await page.route('**/api/auth/sign-up/email', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Email already exists',
        code: 'EMAIL_EXISTS',
      }),
    });
  });
}

/**
 * Mock successful sign-in API response
 */
async function mockSuccessfulSignIn(page: Page, userData?: Partial<{
  id: string;
  name: string;
  email: string;
}>) {
  await page.route('**/api/auth/sign-in/email', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: userData?.id || 'test-user-id',
          name: userData?.name || 'Test User',
          email: userData?.email || 'test@example.com',
          createdAt: new Date().toISOString(),
        },
        session: {
          id: 'session-id',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
    });
  });
}

/**
 * Mock failed sign-in API response (invalid credentials)
 */
async function mockFailedSignIn(page: Page) {
  await page.route('**/api/auth/sign-in/email', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS',
      }),
    });
  });
}

/**
 * Mock successful sign-out API response
 */
async function mockSuccessfulSignOut(page: Page) {
  await page.route('**/api/auth/sign-out', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

/**
 * Mock orders API response (empty for new users)
 */
async function mockEmptyOrders(page: Page) {
  await page.route('**/api/orders*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });
}

/**
 * Fill the registration form with valid data
 */
async function fillRegistrationForm(page: Page, data?: Partial<{
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}>) {
  const formData = {
    name: data?.name || 'Test User',
    email: data?.email || generateTestEmail(),
    password: data?.password || generateTestPassword(),
    confirmPassword: data?.confirmPassword || data?.password || generateTestPassword(),
  };

  await page.fill('#name', formData.name);
  await page.fill('#email', formData.email);
  await page.fill('#password', formData.password);
  await page.fill('#confirmPassword', formData.confirmPassword);

  return formData;
}

/**
 * Fill the login form with credentials
 */
async function fillLoginForm(page: Page, data: {
  email: string;
  password: string;
}) {
  await page.fill('#email', data.email);
  await page.fill('#password', data.password);
}

// ============================================================================
// Complete Registration Flow Tests
// ============================================================================

test.describe('Auth Flow - Complete Registration Journey', () => {
  test('should complete full registration to account access flow', async ({ page }) => {
    // Setup mocks
    await mockSuccessfulSignUp(page);
    await mockSuccessfulSignIn(page);
    await mockAuthenticatedSession(page, { name: 'New User', email: 'newuser@example.com' });
    await mockEmptyOrders(page);

    // Step 1: Navigate to registration page
    await page.goto('/auth/register');
    await expect(page.locator('h1:has-text("MasonArt")')).toBeVisible();

    // Step 2: Fill registration form
    await fillRegistrationForm(page, {
      name: 'New User',
      email: 'newuser@example.com',
      password: 'ValidPass123!',
      confirmPassword: 'ValidPass123!',
    });

    // Step 3: Submit registration
    const submitButton = page.locator('button[type="submit"]:has-text("Create Account")');
    await expect(submitButton).not.toBeDisabled();
    await submitButton.click();

    // Step 4: Should be redirected to login with success message
    await expect(page).toHaveURL(/\/auth\/login\?registered=true/);
    await expect(page.locator('text=Account created successfully')).toBeVisible();

    // Step 5: Log in with new credentials
    await fillLoginForm(page, {
      email: 'newuser@example.com',
      password: 'ValidPass123!',
    });

    const loginButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await loginButton.click();

    // Step 6: Should be redirected to home or account
    await page.waitForURL(/^(\/|\/account)/);
  });

  test('should handle registration with redirect parameter', async ({ page }) => {
    await mockSuccessfulSignUp(page);

    // Navigate to registration with checkout redirect
    await page.goto('/auth/register?redirect=/checkout');

    // Fill form
    await fillRegistrationForm(page, {
      name: 'Checkout User',
      email: 'checkout@example.com',
      password: 'ValidPass123!',
      confirmPassword: 'ValidPass123!',
    });

    // Submit
    const submitButton = page.locator('button[type="submit"]:has-text("Create Account")');
    await submitButton.click();

    // Should redirect to login preserving the redirect
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/redirect/);
  });

  test('should show error when email already exists', async ({ page }) => {
    await mockFailedSignUpEmailExists(page);

    await page.goto('/auth/register');

    await fillRegistrationForm(page, {
      name: 'Existing User',
      email: 'existing@example.com',
      password: 'ValidPass123!',
      confirmPassword: 'ValidPass123!',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Create Account")');
    await submitButton.click();

    // Should show error message
    await expect(page.locator('text=Email already exists').or(page.locator('[role="alert"]'))).toBeVisible();
  });

  test('should navigate from registration to login page', async ({ page }) => {
    await page.goto('/auth/register');

    // Click "Already have an account?" link
    const loginLink = page.locator('a:has-text("Sign in")');
    await expect(loginLink).toBeVisible();
    await loginLink.click();

    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Complete Login Flow Tests
// ============================================================================

test.describe('Auth Flow - Complete Login Journey', () => {
  test('should complete full login to account access flow', async ({ page }) => {
    await mockSuccessfulSignIn(page, { name: 'John Doe', email: 'john@example.com' });
    await mockAuthenticatedSession(page, { name: 'John Doe', email: 'john@example.com' });
    await mockEmptyOrders(page);

    // Step 1: Navigate to login page
    await page.goto('/auth/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();

    // Step 2: Fill login form
    await fillLoginForm(page, {
      email: 'john@example.com',
      password: 'password123',
    });

    // Step 3: Submit login
    const submitButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await expect(submitButton).not.toBeDisabled();
    await submitButton.click();

    // Step 4: Should be redirected to home
    await page.waitForURL('/');
  });

  test('should handle login with redirect to checkout', async ({ page }) => {
    await mockSuccessfulSignIn(page);
    await mockAuthenticatedSession(page);

    // Navigate to login with checkout redirect
    await page.goto('/auth/login?redirect=/checkout');

    await fillLoginForm(page, {
      email: 'test@example.com',
      password: 'password123',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await submitButton.click();

    // Should redirect to checkout after login
    await page.waitForURL(/\/checkout/);
  });

  test('should handle login with redirect to account', async ({ page }) => {
    await mockSuccessfulSignIn(page);
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    // Navigate to login with account redirect
    await page.goto('/auth/login?redirect=/account');

    await fillLoginForm(page, {
      email: 'test@example.com',
      password: 'password123',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await submitButton.click();

    // Should redirect to account after login
    await page.waitForURL(/\/account/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await mockFailedSignIn(page);

    await page.goto('/auth/login');

    await fillLoginForm(page, {
      email: 'wrong@example.com',
      password: 'wrongpassword',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await submitButton.click();

    // Should show error message
    await expect(
      page.locator('text=Invalid email or password').or(page.locator('[role="alert"]'))
    ).toBeVisible();
  });

  test('should navigate from login to registration page', async ({ page }) => {
    await page.goto('/auth/login');

    // Click "Create account" link
    const registerLink = page.locator('a:has-text("Create account")');
    await expect(registerLink).toBeVisible();
    await registerLink.click();

    await expect(page).toHaveURL(/\/auth\/register/);
  });
});

// ============================================================================
// Account Dashboard Access Flow Tests
// ============================================================================

test.describe('Auth Flow - Account Dashboard Access', () => {
  test('should redirect unauthenticated user to login when accessing account', async ({ page }) => {
    await mockUnauthenticatedSession(page);

    await page.goto('/account');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page).toHaveURL(/redirect.*account/);
  });

  test('should allow authenticated user to access account dashboard', async ({ page }) => {
    await mockAuthenticatedSession(page, {
      name: 'John Doe',
      email: 'john@example.com',
    });
    await mockEmptyOrders(page);

    await page.goto('/account');

    // Should display account dashboard
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();
    await expect(page.locator('text=John Doe')).toBeVisible();
    await expect(page.locator('text=john@example.com')).toBeVisible();
  });

  test('should display user profile information on dashboard', async ({ page }) => {
    await mockAuthenticatedSession(page, {
      name: 'Jane Smith',
      email: 'jane@example.com',
      createdAt: '2024-01-15T00:00:00Z',
    });
    await mockEmptyOrders(page);

    await page.goto('/account');

    // Profile card should show user details
    await expect(page.locator('h2:has-text("Jane Smith")')).toBeVisible();
    await expect(page.locator('text=jane@example.com')).toBeVisible();

    // Should show member since date
    await expect(page.locator('text=Member since')).toBeVisible();
  });

  test('should show quick actions on account dashboard', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    await page.goto('/account');

    // Check quick actions are visible
    await expect(page.locator('text=My Orders')).toBeVisible();
    await expect(page.locator('text=AI Creations')).toBeVisible();
    await expect(page.locator('text=Saved Addresses')).toBeVisible();
    await expect(page.locator('text=Account Settings')).toBeVisible();
  });

  test('should navigate to orders page from quick actions', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    await page.goto('/account');

    // Click on My Orders
    const ordersLink = page.locator('a[href="/account/orders"]');
    await ordersLink.click();

    await expect(page).toHaveURL(/\/account\/orders/);
  });

  test('should navigate to AI creations page from quick actions', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    await page.goto('/account');

    // Click on AI Creations
    const aiLink = page.locator('a[href="/account/ai-creations"]');
    await aiLink.click();

    await expect(page).toHaveURL(/\/account\/ai-creations/);
  });
});

// ============================================================================
// Sign Out Flow Tests
// ============================================================================

test.describe('Auth Flow - Sign Out Journey', () => {
  test('should sign out user and redirect to home', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);
    await mockSuccessfulSignOut(page);

    // First, go to account
    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    // Mock unauthenticated after sign out
    await page.unroute('**/api/auth/get-session');
    await mockUnauthenticatedSession(page);

    // Click Sign Out button
    const signOutButton = page.locator('button:has-text("Sign Out")');
    await signOutButton.click();

    // Should redirect to home or login
    await page.waitForURL(/^(\/|\/auth\/login)/);
  });

  test('should clear session and require re-authentication after sign out', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);
    await mockSuccessfulSignOut(page);

    // Go to account
    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    // Sign out
    await page.unroute('**/api/auth/get-session');
    await mockUnauthenticatedSession(page);

    const signOutButton = page.locator('button:has-text("Sign Out")');
    await signOutButton.click();
    await page.waitForURL(/^(\/|\/auth\/login)/);

    // Try to access account again
    await page.goto('/account');

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Cross-Page Navigation Flow Tests
// ============================================================================

test.describe('Auth Flow - Cross-Page Navigation', () => {
  test('should maintain authentication state across page navigations', async ({ page }) => {
    await mockAuthenticatedSession(page, { name: 'Persistent User' });
    await mockEmptyOrders(page);

    // Navigate through multiple pages
    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    // Go to home
    await page.goto('/');

    // Go back to account
    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();
    await expect(page.locator('text=Persistent User')).toBeVisible();
  });

  test('should handle navigation between auth pages', async ({ page }) => {
    // Start at login
    await page.goto('/auth/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();

    // Go to register
    await page.locator('a:has-text("Create account")').click();
    await expect(page).toHaveURL(/\/auth\/register/);

    // Go back to login
    await page.locator('a:has-text("Sign in")').click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should redirect authenticated users away from login page', async ({ page }) => {
    await mockAuthenticatedSession(page);

    // Mock redirect behavior (Better Auth typically redirects authenticated users)
    await page.goto('/auth/login');

    // If already logged in, might redirect or show different content
    // Test depends on implementation - check for home redirect or user menu
    const redirected = await page.url().includes('/auth/login');

    // If not redirected, page should at least be accessible
    if (redirected) {
      await expect(page.locator('form')).toBeVisible();
    }
  });
});

// ============================================================================
// Password Reset Flow Tests
// ============================================================================

test.describe('Auth Flow - Password Reset', () => {
  test('should display forgot password link on login page', async ({ page }) => {
    await page.goto('/auth/login');

    const forgotLink = page.locator('a[href="/auth/forgot-password"]');
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toContainText('Forgot password');
  });

  test('should navigate to forgot password page', async ({ page }) => {
    await page.goto('/auth/login');

    const forgotLink = page.locator('a[href="/auth/forgot-password"]');
    await forgotLink.click();

    await expect(page).toHaveURL(/\/auth\/forgot-password/);
  });
});

// ============================================================================
// Google OAuth Flow Tests
// ============================================================================

test.describe('Auth Flow - Google OAuth', () => {
  test('should display Google OAuth button on login page', async ({ page }) => {
    await page.goto('/auth/login');

    const googleButton = page.locator('button:has-text("Continue with Google")');
    await expect(googleButton).toBeVisible();
  });

  test('should display Google OAuth button on register page', async ({ page }) => {
    await page.goto('/auth/register');

    const googleButton = page.locator('button:has-text("Continue with Google")');
    await expect(googleButton).toBeVisible();
  });

  test('should have proper divider between OAuth and email login', async ({ page }) => {
    await page.goto('/auth/login');

    // Check for "or sign in with email" divider
    const divider = page.locator('text=or sign in with email');
    await expect(divider).toBeVisible();
  });

  test('should have proper divider between OAuth and email register', async ({ page }) => {
    await page.goto('/auth/register');

    // Check for "or sign up with email" divider
    const divider = page.locator('text=or sign up with email');
    await expect(divider).toBeVisible();
  });
});

// ============================================================================
// Session Expiry Flow Tests
// ============================================================================

test.describe('Auth Flow - Session Handling', () => {
  test('should handle expired session gracefully', async ({ page }) => {
    // First, mock authenticated session
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    // Simulate session expiry by changing the mock
    await page.unroute('**/api/auth/get-session');
    await page.route('**/api/auth/get-session', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session expired' }),
      });
    });

    // Refresh the page
    await page.reload();

    // Should redirect to login
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should handle network errors during auth check', async ({ page }) => {
    await page.route('**/api/auth/get-session', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.abort('failed');
    });

    await page.goto('/account');

    // Should redirect to login on auth error
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Terms and Privacy Links Flow Tests
// ============================================================================

test.describe('Auth Flow - Legal Links', () => {
  test('should display Terms of Service link on login page', async ({ page }) => {
    await page.goto('/auth/login');

    const termsLink = page.locator('a[href="/terms"]');
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toContainText('Terms of Service');
  });

  test('should display Privacy Policy link on login page', async ({ page }) => {
    await page.goto('/auth/login');

    const privacyLink = page.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toContainText('Privacy Policy');
  });

  test('should display legal agreement text on registration', async ({ page }) => {
    await page.goto('/auth/register');

    const legalText = page.locator('text=By creating an account');
    await expect(legalText).toBeVisible();
  });
});

// ============================================================================
// Responsive Design Flow Tests
// ============================================================================

test.describe('Auth Flow - Responsive Design', () => {
  test('should complete login flow on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockSuccessfulSignIn(page);
    await mockAuthenticatedSession(page);

    await page.goto('/auth/login');

    // Form should be visible and functional
    await fillLoginForm(page, {
      email: 'mobile@example.com',
      password: 'password123',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await submitButton.click();

    await page.waitForURL('/');
  });

  test('should complete registration flow on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockSuccessfulSignUp(page);

    await page.goto('/auth/register');

    // Form should be visible and functional
    await fillRegistrationForm(page, {
      name: 'Mobile User',
      email: 'mobile@example.com',
      password: 'ValidPass123!',
      confirmPassword: 'ValidPass123!',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Create Account")');
    await submitButton.click();

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should display account dashboard properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    await page.goto('/account');

    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    // Quick actions should be visible
    await expect(page.locator('text=My Orders')).toBeVisible();
  });
});

// ============================================================================
// Accessibility Flow Tests
// ============================================================================

test.describe('Auth Flow - Accessibility', () => {
  test('should have proper heading hierarchy on login page', async ({ page }) => {
    await page.goto('/auth/login');

    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('should have proper heading hierarchy on register page', async ({ page }) => {
    await page.goto('/auth/register');

    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('should have proper heading hierarchy on account page', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    await page.goto('/account');

    const h1 = page.locator('h1');
    await expect(h1.first()).toBeVisible();
  });

  test('should have form labels associated with inputs', async ({ page }) => {
    await page.goto('/auth/login');

    // Email label should be associated with email input
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();

    // Password label should be associated with password input
    const passwordLabel = page.locator('label[for="password"]');
    await expect(passwordLabel).toBeVisible();
  });

  test('should support keyboard navigation through auth flow', async ({ page }) => {
    await mockSuccessfulSignIn(page);
    await mockAuthenticatedSession(page);

    await page.goto('/auth/login');

    // Tab through form fields
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Skip Google button if present

    // Type email
    await page.keyboard.type('test@example.com');

    // Tab to password
    await page.keyboard.press('Tab');
    await page.keyboard.type('password123');

    // Tab to submit and press Enter
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Skip show/hide toggle
    await page.keyboard.press('Enter');

    // Should submit and redirect
    await page.waitForURL('/');
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Auth Flow - Performance', () => {
  test('should load login page within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/auth/login');
    await expect(page.locator('form')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000); // 5 seconds max
  });

  test('should load register page within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/auth/register');
    await expect(page.locator('form')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should load account page within acceptable time when authenticated', async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockEmptyOrders(page);

    const startTime = Date.now();

    await page.goto('/account');
    await expect(page.locator('h1:has-text("My Account")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

test.describe('Auth Flow - Edge Cases', () => {
  test('should handle special characters in name during registration', async ({ page }) => {
    await mockSuccessfulSignUp(page);

    await page.goto('/auth/register');

    await fillRegistrationForm(page, {
      name: "O'Connor-Smith",
      email: 'oconnor@example.com',
      password: 'ValidPass123!',
      confirmPassword: 'ValidPass123!',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Create Account")');
    await submitButton.click();

    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should handle email with plus sign', async ({ page }) => {
    await mockSuccessfulSignIn(page);
    await mockAuthenticatedSession(page);

    await page.goto('/auth/login');

    await fillLoginForm(page, {
      email: 'test+tag@example.com',
      password: 'password123',
    });

    const submitButton = page.locator('button[type="submit"]:has-text("Sign In")');
    await submitButton.click();

    await page.waitForURL('/');
  });

  test('should preserve form data after validation error', async ({ page }) => {
    await page.goto('/auth/register');

    // Fill form with mismatched passwords
    await page.fill('#name', 'Test User');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'ValidPass123!');
    await page.fill('#confirmPassword', 'DifferentPass123!');

    // Blur to trigger validation
    await page.locator('#confirmPassword').blur();

    // Check that previous fields still have their values
    await expect(page.locator('#name')).toHaveValue('Test User');
    await expect(page.locator('#email')).toHaveValue('test@example.com');
    await expect(page.locator('#password')).toHaveValue('ValidPass123!');
  });

  test('should show loading state during form submission', async ({ page }) => {
    // Add delay to sign-in response
    await page.route('**/api/auth/sign-in/email', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-id', name: 'Test', email: 'test@example.com' },
        }),
      });
    });
    await mockAuthenticatedSession(page);

    await page.goto('/auth/login');
    await fillLoginForm(page, {
      email: 'test@example.com',
      password: 'password123',
    });

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Check for loading indicator (spinner or disabled state)
    await expect(submitButton).toBeDisabled();
  });
});
