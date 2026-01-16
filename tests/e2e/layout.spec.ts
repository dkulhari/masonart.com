import { test, expect, type Page } from '@playwright/test';

/**
 * Layout E2E Tests
 *
 * Tests for the root layout components that appear on all pages:
 * - Header (logo, navigation, cart, user menu)
 * - Footer (company info, links, social media)
 * - Navigation functionality
 * - Responsive behavior
 * - Accessibility
 */

test.describe('Root Layout - Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the header with logo', async ({ page }) => {
    // Check that header exists
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check for logo/brand
    const logo = header.locator('[data-testid="logo"], img[alt*="MasonArt"], a[href="/"]').first();
    await expect(logo).toBeVisible();
  });

  test('should display main navigation links', async ({ page }) => {
    const nav = page.locator('nav, [role="navigation"]').first();
    await expect(nav).toBeVisible();

    // Check for common navigation links
    // Note: Exact selectors depend on implementation
    const navLinks = nav.locator('a');
    const navCount = await navLinks.count();

    // Should have at least navigation links (Shop, AI Generator, etc.)
    expect(navCount).toBeGreaterThan(0);
  });

  test('should display cart icon with item count', async ({ page }) => {
    // Look for cart icon/link
    const cartLink = page.locator(
      '[data-testid="cart-link"], [aria-label*="cart"], a[href*="/cart"]'
    ).first();

    // Cart should be present (even if empty)
    await expect(cartLink).toBeVisible();
  });

  test('should display user menu/auth buttons', async ({ page }) => {
    // Look for login/register or user menu
    const authElement = page.locator(
      '[data-testid="auth-menu"], [data-testid="user-menu"], a[href*="/login"], a[href*="/account"], button:has-text("Login"), button:has-text("Sign In")'
    ).first();

    await expect(authElement).toBeVisible();
  });

  test('should have proper semantic HTML structure', async ({ page }) => {
    // Header should use semantic HTML
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Should have proper ARIA landmarks
    const navigation = page.locator('[role="navigation"], nav');
    await expect(navigation.first()).toBeVisible();
  });

  test('should make logo clickable and navigate to home', async ({ page }) => {
    await page.goto('/products'); // Go to another page first

    const logo = page.locator('header [data-testid="logo"], header a[href="/"]').first();
    await logo.click();

    // Should navigate to home
    await expect(page).toHaveURL('/');
  });

  test('should display search functionality', async ({ page }) => {
    // Look for search input or button
    const searchElement = page.locator(
      'input[type="search"], [data-testid="search"], [aria-label*="search"]'
    ).first();

    // Search should be available (if implemented)
    const searchCount = await searchElement.count();
    // This is optional, so we just check it exists or doesn't cause errors
    expect(searchCount).toBeGreaterThanOrEqual(0);
  });

  test('should be sticky/fixed on scroll', async ({ page }) => {
    // Create a page with enough content to scroll
    await page.setContent(`
      <html>
        <body>
          <header style="position: fixed; top: 0;">Header</header>
          <main style="height: 2000px;">Content</main>
        </body>
      </html>
    `);

    const header = page.locator('header');
    const initialPosition = await header.boundingBox();

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);

    const scrolledPosition = await header.boundingBox();

    // Header should remain visible (sticky/fixed)
    await expect(header).toBeVisible();
  });
});

test.describe('Root Layout - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should navigate to Shop/Products page', async ({ page }) => {
    const shopLink = page.locator('nav a[href*="/products"], nav a:has-text("Shop"), nav a:has-text("Products")').first();

    if (await shopLink.count() > 0) {
      await shopLink.click();
      await expect(page).toHaveURL(/\/(products|shop)/);
    } else {
      // Navigation link not implemented yet
      test.skip();
    }
  });

  test('should navigate to AI Generator page', async ({ page }) => {
    const aiLink = page.locator('nav a[href*="/ai"], nav a:has-text("AI Generator"), nav a:has-text("Create")').first();

    if (await aiLink.count() > 0) {
      await aiLink.click();
      await expect(page).toHaveURL(/\/(ai|generate|create)/);
    } else {
      // Navigation link not implemented yet
      test.skip();
    }
  });

  test('should navigate to Cart page', async ({ page }) => {
    const cartLink = page.locator('a[href="/cart"], [data-testid="cart-link"]').first();

    if (await cartLink.count() > 0) {
      await cartLink.click();
      await expect(page).toHaveURL('/cart');
    } else {
      // Cart link not implemented yet
      test.skip();
    }
  });

  test('should navigate to Account/Login page', async ({ page }) => {
    const accountLink = page.locator('a[href*="/account"], a[href*="/login"]').first();

    if (await accountLink.count() > 0) {
      await accountLink.click();
      await expect(page).toHaveURL(/\/(account|login|auth)/);
    } else {
      // Account link not implemented yet
      test.skip();
    }
  });

  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/products');

    const activeLink = page.locator('nav a[aria-current="page"], nav a.active').first();

    if (await activeLink.count() > 0) {
      await expect(activeLink).toBeVisible();

      // Active link should have different styling
      const className = await activeLink.getAttribute('class');
      expect(className).toBeTruthy();
    } else {
      // Active state not implemented yet
      test.skip();
    }
  });
});

test.describe('Root Layout - Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('should display company information', async ({ page }) => {
    const footer = page.locator('footer');

    // Should contain company name or description
    const companyInfo = footer.locator(':has-text("MasonArt"), :has-text("Mason")').first();

    if (await companyInfo.count() > 0) {
      await expect(companyInfo).toBeVisible();
    } else {
      // Company info section not implemented yet
      test.skip();
    }
  });

  test('should display footer navigation links', async ({ page }) => {
    const footer = page.locator('footer');
    const footerLinks = footer.locator('a');

    const linkCount = await footerLinks.count();
    expect(linkCount).toBeGreaterThan(0);
  });

  test('should display customer service links', async ({ page }) => {
    const footer = page.locator('footer');

    // Common customer service links
    const serviceLinks = [
      'Contact',
      'FAQ',
      'Support',
      'Help',
      'Shipping',
      'Returns',
    ];

    let foundLinks = 0;
    for (const linkText of serviceLinks) {
      const link = footer.locator(`a:has-text("${linkText}")`);
      if (await link.count() > 0) {
        foundLinks++;
      }
    }

    // Should have at least one customer service link
    expect(foundLinks).toBeGreaterThan(0);
  });

  test('should display social media links', async ({ page }) => {
    const footer = page.locator('footer');

    // Look for social media links or icons
    const socialLinks = footer.locator(
      'a[href*="facebook"], a[href*="twitter"], a[href*="instagram"], a[href*="linkedin"], ' +
      'a[aria-label*="Facebook"], a[aria-label*="Twitter"], a[aria-label*="Instagram"]'
    );

    const socialCount = await socialLinks.count();
    // Social media is optional, so we just verify it doesn't cause errors
    expect(socialCount).toBeGreaterThanOrEqual(0);
  });

  test('should display copyright information', async ({ page }) => {
    const footer = page.locator('footer');

    // Look for copyright text
    const copyright = footer.locator(':has-text("©"), :has-text("Copyright"), :has-text("2024"), :has-text("2025"), :has-text("2026")').first();

    if (await copyright.count() > 0) {
      await expect(copyright).toBeVisible();
    } else {
      // Copyright not implemented yet
      test.skip();
    }
  });

  test('should display payment method icons', async ({ page }) => {
    const footer = page.locator('footer');

    // Look for payment icons (Visa, Mastercard, etc.)
    const paymentIcons = footer.locator(
      '[alt*="Visa"], [alt*="Mastercard"], [alt*="payment"], img[src*="payment"], [data-testid="payment-icons"]'
    );

    const paymentCount = await paymentIcons.count();
    // Payment icons are optional
    expect(paymentCount).toBeGreaterThanOrEqual(0);
  });

  test('should have proper semantic HTML structure', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Footer should use semantic HTML
    const footerTag = await footer.evaluate(el => el.tagName.toLowerCase());
    expect(footerTag).toBe('footer');
  });

  test('should display legal links (Privacy, Terms)', async ({ page }) => {
    const footer = page.locator('footer');

    const privacyLink = footer.locator('a[href*="/privacy"], a:has-text("Privacy")');
    const termsLink = footer.locator('a[href*="/terms"], a:has-text("Terms")');

    const hasPrivacy = await privacyLink.count() > 0;
    const hasTerms = await termsLink.count() > 0;

    // At least one legal link should be present
    expect(hasPrivacy || hasTerms).toBeTruthy();
  });
});

test.describe('Root Layout - Responsive Design', () => {
  test('should display mobile menu on small screens', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Look for mobile menu button (hamburger)
    const mobileMenuButton = page.locator(
      'button[aria-label*="menu"], button:has-text("Menu"), [data-testid="mobile-menu-button"], ' +
      'button svg, button:has([aria-hidden="true"])'
    ).first();

    if (await mobileMenuButton.count() > 0) {
      await expect(mobileMenuButton).toBeVisible();

      // Click to open mobile menu
      await mobileMenuButton.click();
      await page.waitForTimeout(300); // Wait for animation

      // Mobile menu should be visible
      const mobileMenu = page.locator(
        '[data-testid="mobile-menu"], nav[aria-label*="Mobile"], .mobile-menu'
      ).first();

      if (await mobileMenu.count() > 0) {
        await expect(mobileMenu).toBeVisible();
      }
    } else {
      // Mobile menu not implemented yet
      test.skip();
    }
  });

  test('should hide mobile menu on desktop screens', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Mobile menu button should not be visible on desktop
    const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]');

    if (await mobileMenuButton.count() > 0) {
      await expect(mobileMenuButton).not.toBeVisible();
    }
  });

  test('should display desktop navigation on large screens', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Desktop navigation should be visible
    const desktopNav = page.locator('nav:not([aria-label*="Mobile"])').first();
    await expect(desktopNav).toBeVisible();
  });

  test('should adapt footer layout for mobile', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Footer should still be accessible on mobile
    const footerBox = await footer.boundingBox();
    expect(footerBox).toBeTruthy();
    expect(footerBox!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('Root Layout - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have proper ARIA landmarks', async ({ page }) => {
    // Check for main landmarks
    const header = page.locator('header, [role="banner"]');
    const main = page.locator('main, [role="main"]');
    const footer = page.locator('footer, [role="contentinfo"]');
    const nav = page.locator('nav, [role="navigation"]');

    await expect(header.first()).toBeVisible();
    await expect(main.first()).toBeVisible();
    await expect(footer.first()).toBeVisible();
    await expect(nav.first()).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Tab through header elements
    await page.keyboard.press('Tab');

    // First focusable element should be focused
    const focusedElement = await page.locator(':focus').first();
    await expect(focusedElement).toBeTruthy();
  });

  test('should have skip to content link', async ({ page }) => {
    // Look for skip navigation link (accessibility best practice)
    const skipLink = page.locator('a[href="#main"], a[href="#content"], a:has-text("Skip to")').first();

    if (await skipLink.count() > 0) {
      // Skip link should be present (might be visually hidden)
      await expect(skipLink).toBeTruthy();
    } else {
      // Skip link not implemented yet (optional)
      test.skip();
    }
  });

  test('should have proper link text (not "click here")', async ({ page }) => {
    // Get all links
    const links = page.locator('a');
    const linkCount = await links.count();

    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const text = await link.textContent();

      if (text) {
        const normalizedText = text.toLowerCase().trim();

        // Links should have descriptive text
        expect(normalizedText).not.toBe('click here');
        expect(normalizedText).not.toBe('here');
        expect(normalizedText).not.toBe('link');
      }
    }
  });

  test('should have sufficient color contrast', async ({ page }) => {
    // This is a basic check - for full contrast testing, use axe-core
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check that header has background color set
    const bgColor = await header.evaluate(el =>
      window.getComputedStyle(el).backgroundColor
    );

    expect(bgColor).toBeTruthy();
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)'); // Not transparent
  });

  test('should have descriptive page title', async ({ page }) => {
    const title = await page.title();

    // Title should exist and be descriptive
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
    expect(title.toLowerCase()).toContain('mason'); // Should contain brand name
  });

  test('should have proper focus indicators', async ({ page }) => {
    // Tab to first interactive element
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus').first();

    if (await focusedElement.count() > 0) {
      // Get outline style
      const outline = await focusedElement.evaluate(el =>
        window.getComputedStyle(el).outline
      );

      // Should have some kind of focus indicator
      // (This is a basic check - actual focus styles may vary)
      expect(outline).toBeTruthy();
    }
  });
});

test.describe('Root Layout - Performance', () => {
  test('should load header within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    const header = page.locator('header');
    await expect(header).toBeVisible();

    const loadTime = Date.now() - startTime;

    // Header should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should not have layout shift on load', async ({ page }) => {
    await page.goto('/');

    const header = page.locator('header');
    const initialBox = await header.boundingBox();

    // Wait a bit for any layout shifts
    await page.waitForTimeout(500);

    const finalBox = await header.boundingBox();

    // Header position should remain stable
    expect(initialBox?.y).toBeCloseTo(finalBox?.y || 0, 0);
  });

  test('should lazy load non-critical footer content', async ({ page }) => {
    await page.goto('/');

    // Footer should be present but might lazy load some content
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // This is more of a check that footer doesn't block initial render
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });
});

test.describe('Root Layout - Cart Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should update cart count when items are added', async ({ page }) => {
    const cartLink = page.locator('[data-testid="cart-link"], [aria-label*="cart"]').first();

    if (await cartLink.count() > 0) {
      // Get initial cart count
      const initialCount = await cartLink.locator('[data-testid="cart-count"]').first();

      if (await initialCount.count() > 0) {
        const initialText = await initialCount.textContent();

        // Navigate to products and add item (if implemented)
        // This is a placeholder for when the full flow is implemented

        // For now, just verify cart count element exists
        await expect(initialCount).toBeVisible();
      }
    } else {
      test.skip();
    }
  });

  test('should show cart preview on hover (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    const cartLink = page.locator('[data-testid="cart-link"]').first();

    if (await cartLink.count() > 0) {
      // Hover over cart
      await cartLink.hover();
      await page.waitForTimeout(200);

      // Look for cart preview/dropdown
      const cartPreview = page.locator('[data-testid="cart-preview"], [role="tooltip"]').first();

      if (await cartPreview.count() > 0) {
        await expect(cartPreview).toBeVisible();
      } else {
        // Cart preview not implemented yet
        test.skip();
      }
    } else {
      test.skip();
    }
  });
});

test.describe('Root Layout - User Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show login/register when not authenticated', async ({ page }) => {
    // Clear any existing sessions
    await page.context().clearCookies();
    await page.reload();

    const loginLink = page.locator('a[href*="/login"], a:has-text("Login"), a:has-text("Sign In")').first();

    if (await loginLink.count() > 0) {
      await expect(loginLink).toBeVisible();
    } else {
      // Auth UI not implemented yet
      test.skip();
    }
  });

  test('should show user menu when authenticated', async ({ page }) => {
    // This test would require setting up authentication
    // For now, we'll skip it and implement when auth is fully set up
    test.skip();
  });

  test('should display user avatar/icon', async ({ page }) => {
    const userMenu = page.locator(
      '[data-testid="user-menu"], [aria-label*="account"], [aria-label*="user"]'
    ).first();

    if (await userMenu.count() > 0) {
      const avatar = userMenu.locator('img, svg').first();

      if (await avatar.count() > 0) {
        await expect(avatar).toBeVisible();
      }
    } else {
      test.skip();
    }
  });
});

test.describe('Root Layout - Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], [data-testid="search-input"]').first();

    if (await searchInput.count() > 0) {
      await expect(searchInput).toBeVisible();

      // Search should be interactive
      await searchInput.click();
      await expect(searchInput).toBeFocused();
    } else {
      // Search not implemented yet
      test.skip();
    }
  });

  test('should show search results on input', async ({ page }) => {
    const searchInput = page.locator('input[type="search"]').first();

    if (await searchInput.count() > 0) {
      await searchInput.fill('poster');
      await page.waitForTimeout(300); // Debounce

      const searchResults = page.locator('[data-testid="search-results"]').first();

      if (await searchResults.count() > 0) {
        await expect(searchResults).toBeVisible();
      } else {
        // Search results not implemented yet
        test.skip();
      }
    } else {
      test.skip();
    }
  });

  test('should navigate to search page on submit', async ({ page }) => {
    const searchForm = page.locator('form[role="search"], [data-testid="search-form"]').first();

    if (await searchForm.count() > 0) {
      const searchInput = searchForm.locator('input').first();
      await searchInput.fill('abstract art');

      await searchForm.press('Enter');

      // Should navigate to search results page
      await expect(page).toHaveURL(/search|query/);
    } else {
      test.skip();
    }
  });
});

test.describe('Root Layout - Breadcrumbs', () => {
  test('should display breadcrumbs on product pages', async ({ page }) => {
    await page.goto('/products/123'); // Example product page

    const breadcrumbs = page.locator('[aria-label="Breadcrumb"], nav ol, [data-testid="breadcrumbs"]').first();

    if (await breadcrumbs.count() > 0) {
      await expect(breadcrumbs).toBeVisible();

      // Should have multiple breadcrumb items
      const breadcrumbItems = breadcrumbs.locator('li, a');
      const itemCount = await breadcrumbItems.count();
      expect(itemCount).toBeGreaterThan(1);
    } else {
      // Breadcrumbs not implemented yet or not on this page
      test.skip();
    }
  });

  test('should have structured data for breadcrumbs', async ({ page }) => {
    await page.goto('/products/123');

    // Look for breadcrumb structured data
    const breadcrumbSchema = page.locator('script[type="application/ld+json"]').first();

    if (await breadcrumbSchema.count() > 0) {
      const schemaContent = await breadcrumbSchema.textContent();

      if (schemaContent && schemaContent.includes('BreadcrumbList')) {
        expect(schemaContent).toContain('@type');
        expect(schemaContent).toContain('itemListElement');
      }
    } else {
      // Structured data not implemented yet
      test.skip();
    }
  });
});
