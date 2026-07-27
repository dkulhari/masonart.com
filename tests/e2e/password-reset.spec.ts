/**
 * Password Reset Flow E2E Tests (#242)
 *
 * The login page's "Forgot password?" link 404'd for five months because the
 * page didn't exist. These tests pin the full page flow (the email itself is
 * covered by API tests in packages/api/tests/routes/auth-emails.test.ts).
 */

import { test, expect } from "@playwright/test";

test.describe("Forgot password", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page links to a real forgot-password page", async ({ page }) => {
    await page.goto("/auth/login", { waitUntil: "networkidle" });
    await page.locator('a[href="/auth/forgot-password"]').click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await expect(
      page.getByRole("button", { name: /send reset link/i })
    ).toBeVisible();
  });

  test("submitting an email shows the check-your-email state", async ({
    page,
  }) => {
    await page.goto("/auth/forgot-password", { waitUntil: "networkidle" });

    await page.locator("input#email").fill("test-customer@example.com");

    const [resetRequest] = await Promise.all([
      page.waitForRequest((req) =>
        req.url().includes("/api/auth/request-password-reset")
      ),
      page.getByRole("button", { name: /send reset link/i }).click(),
    ]);
    expect(resetRequest.method()).toBe("POST");

    await expect(page.getByText("Check your email")).toBeVisible({
      timeout: 10000,
    });
  });

  test("invalid email shows a validation error without a request", async ({
    page,
  }) => {
    await page.goto("/auth/forgot-password", { waitUntil: "networkidle" });
    await page.locator("input#email").fill("not-an-email");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByRole("alert")).toContainText(/valid email/i);
  });
});

test.describe("Reset password", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visiting without a token shows the invalid-link state", async ({
    page,
  }) => {
    await page.goto("/auth/reset-password", { waitUntil: "networkidle" });
    await expect(page.getByText("Invalid or expired link")).toBeVisible();
    await expect(
      page.locator('a[href="/auth/forgot-password"]')
    ).toBeVisible();
  });

  test("with a token, the new-password form renders and validates", async ({
    page,
  }) => {
    await page.goto("/auth/reset-password?token=e2e-dummy-token", {
      waitUntil: "networkidle",
    });

    await page.locator("input#password").fill("short");
    await page.locator("input#confirm").fill("short");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByRole("alert")).toContainText(/at least 8/i);

    await page.locator("input#password").fill("ValidNewPass123!");
    await page.locator("input#confirm").fill("Different123!");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByRole("alert")).toContainText(/do not match/i);
  });
});
