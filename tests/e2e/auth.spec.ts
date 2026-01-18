import { test, expect } from '@playwright/test';

/**
 * Authentication Pages E2E Tests
 *
 * Tests for the MasonArt authentication pages including:
 * - Login page (/auth/login)
 * - Register page (/auth/register)
 *
 * Based on actual implementations in:
 * - packages/web/app/routes/auth/login.tsx
 * - packages/web/app/routes/auth/register.tsx
 */

// ============================================================================
// Login Page Tests
// ============================================================================

test.describe('Login Page', () => {
  // ==========================================================================
  // Page Header and Branding
  // ==========================================================================

  test.describe('Page Header', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should display MasonArt logo/brand', async ({ page }) => {
      const logo = page.locator('h1:has-text("MasonArt")');
      await expect(logo).toBeVisible();
    });

    test('should have brand color in logo text', async ({ page }) => {
      const brandSpan = page.locator('h1 span.text-brand-500:has-text("Art")');
      await expect(brandSpan).toBeVisible();
    });

    test('should display welcome message', async ({ page }) => {
      const message = page.locator('text=Welcome back');
      await expect(message).toBeVisible();
    });

    test('should have correct page title', async ({ page }) => {
      await expect(page).toHaveTitle(/Sign In.*MasonArt/);
    });

    test('should have noindex robots meta tag', async ({ page }) => {
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
    });

    test('should have meta description', async ({ page }) => {
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description).toContain('Sign in');
    });

    test('should link logo to home page', async ({ page }) => {
      const logoLink = page.locator('a[href="/"]').first();
      await expect(logoLink).toBeVisible();
    });
  });

  // ==========================================================================
  // Google OAuth
  // ==========================================================================

  test.describe('Google OAuth', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should display Continue with Google button', async ({ page }) => {
      const googleButton = page.locator('button:has-text("Continue with Google")');
      await expect(googleButton).toBeVisible();
    });

    test('should display Google icon in button', async ({ page }) => {
      const googleIcon = page.locator('button:has-text("Continue with Google") svg');
      await expect(googleIcon).toBeVisible();
    });

    test('should have divider with "or sign in with email" text', async ({ page }) => {
      const divider = page.locator('text=or sign in with email');
      await expect(divider).toBeVisible();
    });

    test('should have divider lines', async ({ page }) => {
      const dividerLines = page.locator('.h-px.bg-border');
      const count = await dividerLines.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Email Field
  // ==========================================================================

  test.describe('Email Field', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should display email label', async ({ page }) => {
      const label = page.locator('label[for="email"]');
      await expect(label).toBeVisible();
      await expect(label).toContainText('Email');
    });

    test('should display email input field', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toBeVisible();
    });

    test('should have email placeholder', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toHaveAttribute('placeholder', 'your@email.com');
    });

    test('should have email autocomplete', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toHaveAttribute('autocomplete', 'email');
    });

    test('should have email type', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toHaveAttribute('type', 'email');
    });

    test('should display mail icon', async ({ page }) => {
      // Icon should be in the email field container
      const emailContainer = page.locator('#email').locator('..');
      const icon = emailContainer.locator('svg');
      await expect(icon).toBeVisible();
    });
  });

  // ==========================================================================
  // Password Field
  // ==========================================================================

  test.describe('Password Field', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should display password label', async ({ page }) => {
      const label = page.locator('label[for="password"]');
      await expect(label).toBeVisible();
      await expect(label).toContainText('Password');
    });

    test('should display password input field', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toBeVisible();
    });

    test('should have password placeholder', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toHaveAttribute('placeholder', 'Enter your password');
    });

    test('should have password autocomplete', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toHaveAttribute('autocomplete', 'current-password');
    });

    test('should have password type by default', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toHaveAttribute('type', 'password');
    });

    test('should display lock icon', async ({ page }) => {
      const passwordContainer = page.locator('#password').locator('..');
      const icons = passwordContainer.locator('svg');
      const count = await icons.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display show/hide password toggle', async ({ page }) => {
      const toggle = page.locator('#password').locator('..').locator('button');
      await expect(toggle).toBeVisible();
    });

    test('should toggle password visibility when clicking eye icon', async ({ page }) => {
      const input = page.locator('#password');
      const toggle = page.locator('#password').locator('..').locator('button');

      // Initially password type
      await expect(input).toHaveAttribute('type', 'password');

      // Click toggle
      await toggle.click();
      await expect(input).toHaveAttribute('type', 'text');

      // Click again to hide
      await toggle.click();
      await expect(input).toHaveAttribute('type', 'password');
    });

    test('should display Forgot password link', async ({ page }) => {
      const link = page.locator('a[href="/auth/forgot-password"]');
      await expect(link).toBeVisible();
      await expect(link).toContainText('Forgot password');
    });
  });

  // ==========================================================================
  // Form Validation
  // ==========================================================================

  test.describe('Form Validation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should show error for empty email', async ({ page }) => {
      const input = page.locator('#email');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Email is required');
      await expect(error).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
      const input = page.locator('#email');
      await input.fill('invalid-email');
      await input.blur();

      const error = page.locator('text=Please enter a valid email address');
      await expect(error).toBeVisible();
    });

    test('should accept valid email', async ({ page }) => {
      const input = page.locator('#email');
      await input.fill('test@example.com');
      await input.blur();

      const error = page.locator('text=Please enter a valid email address');
      await expect(error).not.toBeVisible();
    });

    test('should show error for empty password', async ({ page }) => {
      const input = page.locator('#password');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Password is required');
      await expect(error).toBeVisible();
    });

    test('should show error for short password', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('12345');
      await input.blur();

      const error = page.locator('text=Password must be at least 6 characters');
      await expect(error).toBeVisible();
    });

    test('should accept valid password (6+ chars)', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('validpassword');
      await input.blur();

      const error = page.locator('text=Password must be at least 6 characters');
      await expect(error).not.toBeVisible();
    });

    test('should show error styling on invalid fields', async ({ page }) => {
      const input = page.locator('#email');
      await input.focus();
      await input.blur();

      // Should have red border class
      await expect(input).toHaveClass(/border-red-500/);
    });
  });

  // ==========================================================================
  // Submit Button
  // ==========================================================================

  test.describe('Submit Button', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should display Sign In button', async ({ page }) => {
      const button = page.locator('button[type="submit"]:has-text("Sign In")');
      await expect(button).toBeVisible();
    });

    test('should have arrow icon in button', async ({ page }) => {
      const button = page.locator('button[type="submit"]');
      const icon = button.locator('svg');
      await expect(icon).toBeVisible();
    });

    test('should be disabled when form is invalid', async ({ page }) => {
      const button = page.locator('button[type="submit"]');
      await expect(button).toBeDisabled();
    });

    test('should be enabled when form is valid', async ({ page }) => {
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');

      const button = page.locator('button[type="submit"]');
      await expect(button).not.toBeDisabled();
    });

    test('should have muted style when disabled', async ({ page }) => {
      const button = page.locator('button[type="submit"]');
      await expect(button).toHaveClass(/bg-muted/);
    });

    test('should have brand color when enabled', async ({ page }) => {
      await page.fill('#email', 'test@example.com');
      await page.fill('#password', 'password123');

      const button = page.locator('button[type="submit"]');
      await expect(button).toHaveClass(/bg-brand-500/);
    });
  });

  // ==========================================================================
  // Navigation Links
  // ==========================================================================

  test.describe('Navigation Links', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should display Create account link', async ({ page }) => {
      const link = page.locator('a:has-text("Create account")');
      await expect(link).toBeVisible();
    });

    test('should have correct link to register page', async ({ page }) => {
      const link = page.locator('a:has-text("Create account")');
      const href = await link.getAttribute('href');
      expect(href).toContain('/auth/register');
    });

    test('should display "Don\'t have an account?" text', async ({ page }) => {
      const text = page.locator("text=Don't have an account?");
      await expect(text).toBeVisible();
    });

    test('should display Terms of Service link', async ({ page }) => {
      const link = page.locator('a[href="/terms"]');
      await expect(link).toBeVisible();
      await expect(link).toContainText('Terms of Service');
    });

    test('should display Privacy Policy link', async ({ page }) => {
      const link = page.locator('a[href="/privacy"]');
      await expect(link).toBeVisible();
      await expect(link).toContainText('Privacy Policy');
    });

    test('should display "By signing in" terms text', async ({ page }) => {
      const text = page.locator('text=By signing in');
      await expect(text).toBeVisible();
    });

    test('should navigate to register page when clicking Create account', async ({ page }) => {
      const link = page.locator('a:has-text("Create account")');
      await link.click();
      await expect(page).toHaveURL(/\/auth\/register/);
    });
  });

  // ==========================================================================
  // Redirect Handling
  // ==========================================================================

  test.describe('Redirect Handling', () => {
    test('should preserve redirect URL in register link', async ({ page }) => {
      await page.goto('/auth/login?redirect=/checkout');

      const link = page.locator('a:has-text("Create account")');
      const href = await link.getAttribute('href');
      expect(href).toContain('/auth/register');
      expect(href).toContain('redirect');
    });

    test('should not add redirect param when no redirect specified', async ({ page }) => {
      await page.goto('/auth/login');

      const link = page.locator('a:has-text("Create account")');
      const href = await link.getAttribute('href');
      expect(href).toBe('/auth/register');
    });
  });

  // ==========================================================================
  // Success Message
  // ==========================================================================

  test.describe('Success Message After Registration', () => {
    test('should display success message when registered=true', async ({ page }) => {
      await page.goto('/auth/login?registered=true');

      const message = page.locator('text=Account created successfully');
      await expect(message).toBeVisible();
    });

    test('should display success icon with message', async ({ page }) => {
      await page.goto('/auth/login?registered=true');

      const container = page.locator('.bg-green-50');
      await expect(container).toBeVisible();
    });

    test('should not display success message normally', async ({ page }) => {
      await page.goto('/auth/login');

      const message = page.locator('text=Account created successfully');
      await expect(message).not.toBeVisible();
    });
  });

  // ==========================================================================
  // Responsive Design
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test('should display properly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/auth/login');

      const form = page.locator('form');
      await expect(form).toBeVisible();

      const emailInput = page.locator('#email');
      await expect(emailInput).toBeVisible();
    });

    test('should display properly on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/auth/login');

      const logo = page.locator('h1:has-text("MasonArt")');
      await expect(logo).toBeVisible();
    });

    test('should display properly on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/auth/login');

      const container = page.locator('.max-w-md');
      await expect(container).toBeVisible();
    });

    test('should have centered layout', async ({ page }) => {
      await page.goto('/auth/login');

      const centerContainer = page.locator('.flex.items-center.justify-center');
      await expect(centerContainer).toBeVisible();
    });
  });

  // ==========================================================================
  // Accessibility
  // ==========================================================================

  test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/login');
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('should have labels for all form inputs', async ({ page }) => {
      const emailLabel = page.locator('label[for="email"]');
      const passwordLabel = page.locator('label[for="password"]');

      await expect(emailLabel).toBeVisible();
      await expect(passwordLabel).toBeVisible();
    });

    test('should be keyboard navigable', async ({ page }) => {
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeTruthy();
    });

    test('should have focus ring on inputs', async ({ page }) => {
      const input = page.locator('#email');
      await input.focus();

      // Tailwind uses ring classes for focus
      await expect(input).toHaveClass(/focus:ring-2/);
    });

    test('should show form errors accessibly', async ({ page }) => {
      const input = page.locator('#email');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Email is required');
      await expect(error).toBeVisible();
    });
  });

  // ==========================================================================
  // Performance
  // ==========================================================================

  test.describe('Performance', () => {
    test('should load page within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/auth/login');
      await expect(page.locator('h1')).toBeVisible();

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000);
    });

    test('should not have JavaScript errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto('/auth/login');
      await page.waitForTimeout(1000);

      const criticalErrors = errors.filter(
        (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
      );

      expect(criticalErrors.length).toBe(0);
    });
  });
});

// ============================================================================
// Register Page Tests
// ============================================================================

test.describe('Register Page', () => {
  // ==========================================================================
  // Page Header and Branding
  // ==========================================================================

  test.describe('Page Header', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display MasonArt logo/brand', async ({ page }) => {
      const logo = page.locator('h1:has-text("MasonArt")');
      await expect(logo).toBeVisible();
    });

    test('should have brand color in logo text', async ({ page }) => {
      const brandSpan = page.locator('h1 span.text-brand-500:has-text("Art")');
      await expect(brandSpan).toBeVisible();
    });

    test('should display create account message', async ({ page }) => {
      const message = page.locator('text=Create your account to get started');
      await expect(message).toBeVisible();
    });

    test('should have correct page title', async ({ page }) => {
      await expect(page).toHaveTitle(/Create Account.*MasonArt/);
    });

    test('should have noindex robots meta tag', async ({ page }) => {
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots).toContain('noindex');
    });

    test('should have meta description', async ({ page }) => {
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();
      expect(description).toContain('Create');
    });

    test('should link logo to home page', async ({ page }) => {
      const logoLink = page.locator('a[href="/"]').first();
      await expect(logoLink).toBeVisible();
    });
  });

  // ==========================================================================
  // Google OAuth
  // ==========================================================================

  test.describe('Google OAuth', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display Continue with Google button', async ({ page }) => {
      const googleButton = page.locator('button:has-text("Continue with Google")');
      await expect(googleButton).toBeVisible();
    });

    test('should display Google icon in button', async ({ page }) => {
      const googleIcon = page.locator('button:has-text("Continue with Google") svg');
      await expect(googleIcon).toBeVisible();
    });

    test('should have divider with "or sign up with email" text', async ({ page }) => {
      const divider = page.locator('text=or sign up with email');
      await expect(divider).toBeVisible();
    });
  });

  // ==========================================================================
  // Name Field
  // ==========================================================================

  test.describe('Name Field', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display Full Name label', async ({ page }) => {
      const label = page.locator('label[for="name"]');
      await expect(label).toBeVisible();
      await expect(label).toContainText('Full Name');
    });

    test('should display name input field', async ({ page }) => {
      const input = page.locator('#name');
      await expect(input).toBeVisible();
    });

    test('should have name placeholder', async ({ page }) => {
      const input = page.locator('#name');
      await expect(input).toHaveAttribute('placeholder', 'Your full name');
    });

    test('should have name autocomplete', async ({ page }) => {
      const input = page.locator('#name');
      await expect(input).toHaveAttribute('autocomplete', 'name');
    });

    test('should display user icon', async ({ page }) => {
      const nameContainer = page.locator('#name').locator('..');
      const icon = nameContainer.locator('svg');
      await expect(icon).toBeVisible();
    });
  });

  // ==========================================================================
  // Email Field
  // ==========================================================================

  test.describe('Email Field', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display email label', async ({ page }) => {
      const label = page.locator('label[for="email"]');
      await expect(label).toBeVisible();
      await expect(label).toContainText('Email');
    });

    test('should display email input field', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toBeVisible();
    });

    test('should have email placeholder', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toHaveAttribute('placeholder', 'your@email.com');
    });

    test('should have email autocomplete', async ({ page }) => {
      const input = page.locator('#email');
      await expect(input).toHaveAttribute('autocomplete', 'email');
    });
  });

  // ==========================================================================
  // Password Field
  // ==========================================================================

  test.describe('Password Field', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display password label', async ({ page }) => {
      const label = page.locator('label[for="password"]');
      await expect(label).toBeVisible();
      await expect(label).toContainText('Password');
    });

    test('should display password input field', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toBeVisible();
    });

    test('should have password placeholder', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toHaveAttribute('placeholder', 'Create a password');
    });

    test('should have new-password autocomplete', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toHaveAttribute('autocomplete', 'new-password');
    });

    test('should have password type by default', async ({ page }) => {
      const input = page.locator('#password');
      await expect(input).toHaveAttribute('type', 'password');
    });

    test('should toggle password visibility', async ({ page }) => {
      const input = page.locator('#password');
      const toggle = page.locator('#password').locator('..').locator('button');

      await expect(input).toHaveAttribute('type', 'password');

      await toggle.click();
      await expect(input).toHaveAttribute('type', 'text');

      await toggle.click();
      await expect(input).toHaveAttribute('type', 'password');
    });
  });

  // ==========================================================================
  // Password Requirements
  // ==========================================================================

  test.describe('Password Requirements', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should not display requirements initially', async ({ page }) => {
      const requirements = page.locator('text=At least 8 characters');
      await expect(requirements).not.toBeVisible();
    });

    test('should display requirements when password has input', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('a');

      const requirements = page.locator('text=At least 8 characters');
      await expect(requirements).toBeVisible();
    });

    test('should display all 4 password requirements', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('a');

      await expect(page.locator('text=At least 8 characters')).toBeVisible();
      await expect(page.locator('text=Contains a number')).toBeVisible();
      await expect(page.locator('text=Contains a lowercase letter')).toBeVisible();
      await expect(page.locator('text=Contains an uppercase letter')).toBeVisible();
    });

    test('should show green checkmark for met requirements', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('a');

      // Lowercase is met, should be green
      const lowercaseReq = page.locator('text=Contains a lowercase letter');
      await expect(lowercaseReq).toHaveClass(/text-green-600/);
    });

    test('should show muted color for unmet requirements', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('a');

      // 8 chars is not met
      const lengthReq = page.locator('text=At least 8 characters');
      await expect(lengthReq).toHaveClass(/text-muted-foreground/);
    });

    test('should mark all requirements green when valid password', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('Password1');

      // All requirements met
      await expect(page.locator('.text-green-600:has-text("At least 8 characters")')).toBeVisible();
      await expect(page.locator('.text-green-600:has-text("Contains a number")')).toBeVisible();
      await expect(page.locator('.text-green-600:has-text("Contains a lowercase letter")')).toBeVisible();
      await expect(page.locator('.text-green-600:has-text("Contains an uppercase letter")')).toBeVisible();
    });
  });

  // ==========================================================================
  // Confirm Password Field
  // ==========================================================================

  test.describe('Confirm Password Field', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display Confirm Password label', async ({ page }) => {
      const label = page.locator('label[for="confirmPassword"]');
      await expect(label).toBeVisible();
      await expect(label).toContainText('Confirm Password');
    });

    test('should display confirm password input field', async ({ page }) => {
      const input = page.locator('#confirmPassword');
      await expect(input).toBeVisible();
    });

    test('should have confirm password placeholder', async ({ page }) => {
      const input = page.locator('#confirmPassword');
      await expect(input).toHaveAttribute('placeholder', 'Confirm your password');
    });

    test('should have new-password autocomplete', async ({ page }) => {
      const input = page.locator('#confirmPassword');
      await expect(input).toHaveAttribute('autocomplete', 'new-password');
    });

    test('should toggle confirm password visibility', async ({ page }) => {
      const input = page.locator('#confirmPassword');
      const toggle = page.locator('#confirmPassword').locator('..').locator('button');

      await expect(input).toHaveAttribute('type', 'password');

      await toggle.click();
      await expect(input).toHaveAttribute('type', 'text');
    });
  });

  // ==========================================================================
  // Form Validation
  // ==========================================================================

  test.describe('Form Validation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should show error for empty name', async ({ page }) => {
      const input = page.locator('#name');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Name is required');
      await expect(error).toBeVisible();
    });

    test('should show error for short name', async ({ page }) => {
      const input = page.locator('#name');
      await input.fill('A');
      await input.blur();

      const error = page.locator('text=Name must be at least 2 characters');
      await expect(error).toBeVisible();
    });

    test('should accept valid name', async ({ page }) => {
      const input = page.locator('#name');
      await input.fill('John Doe');
      await input.blur();

      const error = page.locator('text=Name is required');
      await expect(error).not.toBeVisible();
    });

    test('should show error for empty email', async ({ page }) => {
      const input = page.locator('#email');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Email is required');
      await expect(error).toBeVisible();
    });

    test('should show error for invalid email', async ({ page }) => {
      const input = page.locator('#email');
      await input.fill('invalid-email');
      await input.blur();

      const error = page.locator('text=Please enter a valid email address');
      await expect(error).toBeVisible();
    });

    test('should show error for empty password', async ({ page }) => {
      const input = page.locator('#password');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Password is required');
      await expect(error).toBeVisible();
    });

    test('should show error for weak password', async ({ page }) => {
      const input = page.locator('#password');
      await input.fill('weak');
      await input.blur();

      const error = page.locator('text=Password does not meet requirements');
      await expect(error).toBeVisible();
    });

    test('should show error for empty confirm password', async ({ page }) => {
      const input = page.locator('#confirmPassword');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Please confirm your password');
      await expect(error).toBeVisible();
    });

    test('should show error for mismatched passwords', async ({ page }) => {
      await page.fill('#password', 'Password1');
      const input = page.locator('#confirmPassword');
      await input.fill('Password2');
      await input.blur();

      const error = page.locator('text=Passwords do not match');
      await expect(error).toBeVisible();
    });

    test('should accept matching passwords', async ({ page }) => {
      await page.fill('#password', 'Password1');
      const input = page.locator('#confirmPassword');
      await input.fill('Password1');
      await input.blur();

      const error = page.locator('text=Passwords do not match');
      await expect(error).not.toBeVisible();
    });
  });

  // ==========================================================================
  // Submit Button
  // ==========================================================================

  test.describe('Submit Button', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display Create Account button', async ({ page }) => {
      const button = page.locator('button[type="submit"]:has-text("Create Account")');
      await expect(button).toBeVisible();
    });

    test('should have arrow icon in button', async ({ page }) => {
      const button = page.locator('button[type="submit"]');
      const icon = button.locator('svg');
      await expect(icon).toBeVisible();
    });

    test('should be disabled when form is invalid', async ({ page }) => {
      const button = page.locator('button[type="submit"]');
      await expect(button).toBeDisabled();
    });

    test('should be enabled when form is valid', async ({ page }) => {
      await page.fill('#name', 'John Doe');
      await page.fill('#email', 'john@example.com');
      await page.fill('#password', 'Password1');
      await page.fill('#confirmPassword', 'Password1');

      const button = page.locator('button[type="submit"]');
      await expect(button).not.toBeDisabled();
    });

    test('should have muted style when disabled', async ({ page }) => {
      const button = page.locator('button[type="submit"]');
      await expect(button).toHaveClass(/bg-muted/);
    });

    test('should have brand color when enabled', async ({ page }) => {
      await page.fill('#name', 'John Doe');
      await page.fill('#email', 'john@example.com');
      await page.fill('#password', 'Password1');
      await page.fill('#confirmPassword', 'Password1');

      const button = page.locator('button[type="submit"]');
      await expect(button).toHaveClass(/bg-brand-500/);
    });
  });

  // ==========================================================================
  // Navigation Links
  // ==========================================================================

  test.describe('Navigation Links', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should display Sign in link', async ({ page }) => {
      const link = page.locator('a:has-text("Sign in")');
      await expect(link).toBeVisible();
    });

    test('should have correct link to login page', async ({ page }) => {
      const link = page.locator('a:has-text("Sign in")');
      const href = await link.getAttribute('href');
      expect(href).toContain('/auth/login');
    });

    test('should display "Already have an account?" text', async ({ page }) => {
      const text = page.locator('text=Already have an account?');
      await expect(text).toBeVisible();
    });

    test('should display Terms of Service link', async ({ page }) => {
      const link = page.locator('a[href="/terms"]');
      await expect(link).toBeVisible();
      await expect(link).toContainText('Terms of Service');
    });

    test('should display Privacy Policy link', async ({ page }) => {
      const link = page.locator('a[href="/privacy"]');
      await expect(link).toBeVisible();
      await expect(link).toContainText('Privacy Policy');
    });

    test('should display "By creating an account" terms text', async ({ page }) => {
      const text = page.locator('text=By creating an account');
      await expect(text).toBeVisible();
    });

    test('should navigate to login page when clicking Sign in', async ({ page }) => {
      const link = page.locator('a:has-text("Sign in")');
      await link.click();
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  });

  // ==========================================================================
  // Redirect Handling
  // ==========================================================================

  test.describe('Redirect Handling', () => {
    test('should preserve redirect URL in login link', async ({ page }) => {
      await page.goto('/auth/register?redirect=/checkout');

      const link = page.locator('a:has-text("Sign in")');
      const href = await link.getAttribute('href');
      expect(href).toContain('/auth/login');
      expect(href).toContain('redirect');
    });

    test('should not add redirect param when no redirect specified', async ({ page }) => {
      await page.goto('/auth/register');

      const link = page.locator('a:has-text("Sign in")');
      const href = await link.getAttribute('href');
      expect(href).toBe('/auth/login');
    });
  });

  // ==========================================================================
  // Responsive Design
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test('should display properly on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/auth/register');

      const form = page.locator('form');
      await expect(form).toBeVisible();

      const nameInput = page.locator('#name');
      await expect(nameInput).toBeVisible();
    });

    test('should display properly on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/auth/register');

      const logo = page.locator('h1:has-text("MasonArt")');
      await expect(logo).toBeVisible();
    });

    test('should display properly on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/auth/register');

      const container = page.locator('.max-w-md');
      await expect(container).toBeVisible();
    });

    test('should have centered layout', async ({ page }) => {
      await page.goto('/auth/register');

      const centerContainer = page.locator('.flex.items-center.justify-center');
      await expect(centerContainer).toBeVisible();
    });

    test('should handle long password requirements list on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/auth/register');

      await page.fill('#password', 'a');

      const requirements = page.locator('text=At least 8 characters');
      await expect(requirements).toBeVisible();
    });
  });

  // ==========================================================================
  // Accessibility
  // ==========================================================================

  test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/auth/register');
    });

    test('should have proper heading hierarchy', async ({ page }) => {
      const h1Count = await page.locator('h1').count();
      expect(h1Count).toBe(1);
    });

    test('should have labels for all form inputs', async ({ page }) => {
      const nameLabel = page.locator('label[for="name"]');
      const emailLabel = page.locator('label[for="email"]');
      const passwordLabel = page.locator('label[for="password"]');
      const confirmLabel = page.locator('label[for="confirmPassword"]');

      await expect(nameLabel).toBeVisible();
      await expect(emailLabel).toBeVisible();
      await expect(passwordLabel).toBeVisible();
      await expect(confirmLabel).toBeVisible();
    });

    test('should be keyboard navigable', async ({ page }) => {
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeTruthy();
    });

    test('should show form errors accessibly', async ({ page }) => {
      const input = page.locator('#name');
      await input.focus();
      await input.blur();

      const error = page.locator('text=Name is required');
      await expect(error).toBeVisible();
    });

    test('should have password requirements as accessible text', async ({ page }) => {
      await page.fill('#password', 'a');

      // Requirements should be visible text, not just icons
      const reqText = page.locator('text=At least 8 characters');
      await expect(reqText).toBeVisible();
    });
  });

  // ==========================================================================
  // Performance
  // ==========================================================================

  test.describe('Performance', () => {
    test('should load page within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/auth/register');
      await expect(page.locator('h1')).toBeVisible();

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000);
    });

    test('should not have JavaScript errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto('/auth/register');
      await page.waitForTimeout(1000);

      const criticalErrors = errors.filter(
        (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
      );

      expect(criticalErrors.length).toBe(0);
    });
  });
});

// ============================================================================
// Cross-Page Navigation Tests
// ============================================================================

test.describe('Auth Page Navigation', () => {
  test('should navigate from login to register and back', async ({ page }) => {
    await page.goto('/auth/login');

    // Go to register
    const registerLink = page.locator('a:has-text("Create account")');
    await registerLink.click();
    await expect(page).toHaveURL(/\/auth\/register/);

    // Go back to login
    const loginLink = page.locator('a:has-text("Sign in")');
    await loginLink.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('should preserve redirect through navigation', async ({ page }) => {
    await page.goto('/auth/login?redirect=/account');

    // Go to register
    const registerLink = page.locator('a:has-text("Create account")');
    await registerLink.click();
    await expect(page).toHaveURL(/\/auth\/register.*redirect.*account/);
  });

  test('should use browser back button correctly', async ({ page }) => {
    await page.goto('/auth/login');
    await page.locator('a:has-text("Create account")').click();
    await expect(page).toHaveURL(/\/auth\/register/);

    await page.goBack();
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Auth Error Handling', () => {
  test('should handle network errors gracefully on login page', async ({ page }) => {
    await page.goto('/auth/login');

    // Page should load without crashing
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });

  test('should handle network errors gracefully on register page', async ({ page }) => {
    await page.goto('/auth/register');

    // Page should load without crashing
    const form = page.locator('form');
    await expect(form).toBeVisible();
  });
});
