/**
 * Playwright Authentication Setup
 *
 * This setup file performs real authentication and saves the storage state
 * for reuse by tests that require authentication.
 *
 * Flow:
 * 1. Register customer test user via web form
 * 2. Register trade test user via web form, then update role in database
 * 3. Register admin test user via web form, then update role in database
 * 4. Login as each user and save their storage states
 *
 * Run order: This setup runs BEFORE any authenticated tests.
 */

import { test as setup } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage state file paths
const STORAGE_DIR = path.join(__dirname, "..", ".auth");
export const CUSTOMER_STORAGE_STATE = path.join(STORAGE_DIR, "customer.json");
export const TRADE_STORAGE_STATE = path.join(STORAGE_DIR, "trade.json");
export const ADMIN_STORAGE_STATE = path.join(STORAGE_DIR, "admin.json");

// Test user credentials - must match seed-test-users.ts
const TEST_USERS = {
  customer: {
    email: "test-customer@example.com",
    password: "TestPassword123!",
    name: "Test Customer",
  },
  trade: {
    email: "test-trade@interior.com", // Match seeded trade user
    password: "TestPassword123!",
    name: "Test Trade User",
  },
  admin: {
    email: "test-admin@masonart.com",
    password: "TestPassword123!",
    name: "Test Admin",
  },
};

/**
 * Helper to login a user via the web form
 */
async function loginUser(
  page: import("@playwright/test").Page,
  credentials: { email: string; password: string }
): Promise<boolean> {
  await page.goto("/auth/login");
  await page.waitForLoadState("networkidle");

  // Fill login form
  await page.locator('input#email, input[name="email"]').fill(credentials.email);
  await page.locator('input#password, input[name="password"]').fill(credentials.password);

  // Submit the form
  await page.locator('button[type="submit"]:has-text("Sign In")').click();

  // Wait for navigation (success or error)
  // Use 25s timeout to stay within 30s test timeout but allow slow redirects
  try {
    await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
      timeout: 25000,
    });
    return true;
  } catch {
    // Guard against browser being closed by test timeout
    if (page.isClosed()) {
      throw new Error("Login timed out - page was closed");
    }
    // Check for error message
    const errorVisible = await page.locator('text=Sign in failed').isVisible();
    const invalidVisible = await page.locator('text=Invalid email or password').isVisible();
    if (errorVisible || invalidVisible) {
      return false;
    }
    throw new Error("Login failed with unexpected error");
  }
}

/**
 * Helper to register a user via the web form
 */
async function registerUser(
  page: import("@playwright/test").Page,
  credentials: { email: string; password: string; name: string }
): Promise<boolean> {
  await page.goto("/auth/register");
  await page.waitForLoadState("networkidle");

  // Fill registration form
  await page.locator('input#name').fill(credentials.name);
  await page.locator('input#email').fill(credentials.email);
  await page.locator('input#password').fill(credentials.password);

  // Fill confirm password if present
  const confirmPassword = page.locator('input#confirmPassword');
  if ((await confirmPassword.count()) > 0) {
    await confirmPassword.fill(credentials.password);
  }

  // Wait for form validation
  await page.waitForTimeout(500);

  // Submit the form
  await page.locator('button[type="submit"]:has-text("Create Account")').click();

  // Wait for redirect to login with registered=true
  try {
    await page.waitForURL(/\/auth\/login.*registered=true/, { timeout: 15000 });
    console.log(`[Auth Setup] Registered: ${credentials.email}`);
    return true;
  } catch {
    // Check for "already exists" error
    const errorEl = page.locator(".bg-red-50, .text-red-700, [role='alert']").first();
    if (await errorEl.isVisible()) {
      const errorText = await errorEl.textContent();
      if (errorText?.toLowerCase().includes("already") || errorText?.toLowerCase().includes("exists")) {
        console.log(`[Auth Setup] User already exists: ${credentials.email}`);
        return false;
      }
    }
    // User might already exist, try to continue
    return false;
  }
}

/**
 * Helper to update user role in the database using the update-user-role script
 */
function updateUserRole(email: string, role: string): void {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const scriptPath = path.join(projectRoot, "packages/api/src/database/update-user-role.ts");

  try {
    execFileSync("bun", ["run", scriptPath, email, role], {
      cwd: projectRoot,
      stdio: "inherit",
    });
  } catch (error) {
    console.error(`[Auth Setup] Failed to update role for ${email}:`, error);
  }
}

/**
 * Setup: Authenticate as Customer
 *
 * Registers customer account if needed, logs in, and saves storage state
 */
setup("authenticate as customer", async ({ page }) => {
  const credentials = TEST_USERS.customer;
  console.log(`[Auth Setup] Setting up customer: ${credentials.email}`);

  // Try to register (will fail silently if user exists)
  await registerUser(page, credentials);

  // Login
  const loggedIn = await loginUser(page, credentials);

  if (!loggedIn) {
    throw new Error(`Failed to login as customer: ${credentials.email}`);
  }

  // Verify authentication by visiting account page
  await page.goto("/account");
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/auth/login")) {
    throw new Error("Customer authentication failed - redirected back to login");
  }

  // Save the storage state
  await page.context().storageState({ path: CUSTOMER_STORAGE_STATE });
  console.log(`[Auth Setup] Customer auth state saved to: ${CUSTOMER_STORAGE_STATE}`);
});

/**
 * Setup: Authenticate as Trade User
 *
 * Registers trade account if needed, updates role, logs in, and saves storage state
 */
setup("authenticate as trade", async ({ page }) => {
  const credentials = TEST_USERS.trade;
  console.log(`[Auth Setup] Setting up trade user: ${credentials.email}`);

  // Try to register (will fail silently if user exists)
  await registerUser(page, credentials);

  // Update role to trade (works whether just registered or already existed)
  console.log(`[Auth Setup] Updating role to trade for: ${credentials.email}`);
  updateUserRole(credentials.email, "trade");

  // Login
  const loggedIn = await loginUser(page, credentials);

  if (!loggedIn) {
    throw new Error(`Failed to login as trade user: ${credentials.email}`);
  }

  // Verify authentication by visiting account page
  await page.goto("/account");
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/auth/login")) {
    throw new Error("Trade authentication failed - redirected back to login");
  }

  // Save the storage state
  await page.context().storageState({ path: TRADE_STORAGE_STATE });
  console.log(`[Auth Setup] Trade auth state saved to: ${TRADE_STORAGE_STATE}`);
});

/**
 * Setup: Authenticate as Admin
 *
 * Registers admin account if needed, updates role, logs in, and saves storage state
 */
setup("authenticate as admin", async ({ page }) => {
  const credentials = TEST_USERS.admin;
  console.log(`[Auth Setup] Setting up admin: ${credentials.email}`);

  // Try to register (will fail silently if user exists)
  await registerUser(page, credentials);

  // Update role to admin (works whether just registered or already existed)
  console.log(`[Auth Setup] Updating role to admin for: ${credentials.email}`);
  updateUserRole(credentials.email, "admin");

  // Login
  const loggedIn = await loginUser(page, credentials);

  if (!loggedIn) {
    throw new Error(`Failed to login as admin: ${credentials.email}`);
  }

  // Verify authentication by visiting account page
  await page.goto("/account");
  await page.waitForLoadState("networkidle");

  if (page.url().includes("/auth/login")) {
    throw new Error("Admin authentication failed - redirected back to login");
  }

  // Save the storage state
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
  console.log(`[Auth Setup] Admin auth state saved to: ${ADMIN_STORAGE_STATE}`);
});
