/**
 * Content Manager Access Matrix E2E Tests
 *
 * Proves the content-manager role boundary in both directions:
 * - CAN: enter admin panel, land on products, manage the catalog
 * - CANNOT: reach dashboard, orders, customers, or other admin sections
 * - Regression: customers still cannot reach product management
 *
 * Uses the content-manager.json storage state created by auth.setup.ts.
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_MANAGER_AUTH = path.join(
  __dirname,
  "..",
  ".auth",
  "content-manager.json"
);
const CUSTOMER_AUTH = path.join(__dirname, "..", ".auth", "customer.json");

test.describe("Content Manager access", () => {
  test.use({ storageState: CONTENT_MANAGER_AUTH });

  test("/admin redirects to /admin/products (no dashboard)", async ({
    page,
  }) => {
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test("can access product management", async ({ page }) => {
    await page.goto("/admin/products", { waitUntil: "networkidle" });

    // Product management UI renders (not the Access Denied screen)
    await expect(page.getByText("Access Denied")).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: /products/i }).first()
    ).toBeVisible();
  });

  test("sidebar shows only catalog sections", async ({ page }) => {
    await page.goto("/admin/products", { waitUntil: "networkidle" });

    // Scope to the sidebar navigation
    const sidebar = page.locator("aside, nav").filter({
      has: page.getByRole("link", { name: "Products" }),
    }).first();

    await expect(
      sidebar.getByRole("link", { name: "Products" })
    ).toBeVisible();

    // Admin-only sections must not be present anywhere in the nav
    for (const hidden of [
      "Dashboard",
      "Orders",
      "Customers",
      "Analytics",
      "Settings",
      "AI Moderation",
      "Returns",
    ]) {
      await expect(
        sidebar.getByRole("link", { name: hidden, exact: true })
      ).not.toBeVisible();
    }
  });

  test("direct navigation to admin-only sections shows Access Denied", async ({
    page,
  }) => {
    for (const blocked of ["/admin/orders", "/admin/customers", "/admin/reviews"]) {
      await page.goto(blocked, { waitUntil: "networkidle" });
      await expect(page.getByText("Access Denied")).toBeVisible();
    }
  });

  test("can open the new product form (create access)", async ({ page }) => {
    await page.goto("/admin/products/new", { waitUntil: "networkidle" });
    await expect(page.getByText("Access Denied")).not.toBeVisible();
    // Form UI is reachable for content-managers
    await expect(page.locator("form").first()).toBeVisible();
  });
});

test.describe("Customer cannot manage products (regression)", () => {
  test.use({ storageState: CUSTOMER_AUTH });

  test("customer gets Access Denied on /admin/products", async ({ page }) => {
    await page.goto("/admin/products", { waitUntil: "networkidle" });
    await expect(page.getByText("Access Denied")).toBeVisible();
  });

  test("customer gets Access Denied on /admin", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "networkidle" });
    await expect(page.getByText("Access Denied")).toBeVisible();
  });
});
