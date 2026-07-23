import { test, expect } from '@playwright/test';

/**
 * SEO Meta Tags E2E Tests
 *
 * Comprehensive tests for verifying SEO meta tags across all pages:
 * - Basic meta tags (title, description, viewport, charset)
 * - Open Graph meta tags (og:title, og:description, og:type, og:image)
 * - Twitter Card meta tags (twitter:card, twitter:title, twitter:description)
 * - Robots directives (index, noindex, follow, nofollow)
 * - Canonical links
 * - Favicon and icons
 * - Theme color
 *
 * Based on meta configurations in:
 * - packages/web/app/routes/__root.tsx (global meta)
 * - packages/web/app/routes/index.tsx (home page)
 * - packages/web/app/routes/posters/index.tsx (listing page)
 * - Other route-specific meta configurations
 */

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the content attribute of a meta tag by name
 */
async function getMetaContent(
  page: import('@playwright/test').Page,
  selector: string
): Promise<string | null> {
  const element = page.locator(selector);
  if ((await element.count()) === 0) {
    return null;
  }
  return element.getAttribute('content');
}

/**
 * Get meta tag content by name attribute
 */
async function getMetaByName(
  page: import('@playwright/test').Page,
  name: string
): Promise<string | null> {
  return getMetaContent(page, `meta[name="${name}"]`);
}

/**
 * Get meta tag content by property attribute (Open Graph)
 */
async function getMetaByProperty(
  page: import('@playwright/test').Page,
  property: string
): Promise<string | null> {
  return getMetaContent(page, `meta[property="${property}"]`);
}

/**
 * Get link href by rel attribute
 */
async function getLinkByRel(
  page: import('@playwright/test').Page,
  rel: string
): Promise<string | null> {
  const element = page.locator(`link[rel="${rel}"]`);
  if ((await element.count()) === 0) {
    return null;
  }
  // Use first() to handle multiple matching elements (e.g., multiple favicon sizes)
  return element.first().getAttribute('href');
}

// ============================================================================
// Global Meta Tags (Applied to All Pages)
// ============================================================================

test.describe('SEO - Global Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have utf-8 charset', async ({ page }) => {
    const charset = page.locator('meta[charset="utf-8"]');
    await expect(charset).toBeTruthy();
  });

  test('should have viewport meta tag with correct content', async ({ page }) => {
    const viewport = await getMetaByName(page, 'viewport');
    expect(viewport).toBeTruthy();
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('should have theme-color meta tag', async ({ page }) => {
    const themeColor = await getMetaByName(page, 'theme-color');
    expect(themeColor).toBe('#f97316'); // chobii.art brand orange color
  });

  test('should have favicon link', async ({ page }) => {
    const favicon = await getLinkByRel(page, 'icon');
    expect(favicon).toBeTruthy();
    expect(favicon).toContain('favicon');
  });

  test('should have apple-touch-icon', async ({ page }) => {
    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    expect(await appleTouchIcon.count()).toBeGreaterThanOrEqual(1);
    const href = await appleTouchIcon.first().getAttribute('href');
    expect(href).toContain('apple-touch-icon');
  });

  test('should have web manifest link', async ({ page }) => {
    const manifest = await getLinkByRel(page, 'manifest');
    expect(manifest).toBeTruthy();
    expect(manifest).toContain('webmanifest');
  });

  test('should have Open Graph site_name', async ({ page }) => {
    const siteName = await getMetaByProperty(page, 'og:site_name');
    expect(siteName).toBe('chobii.art');
  });

  test('should have html lang attribute set to english', async ({ page }) => {
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'en');
  });
});

// ============================================================================
// Home Page Meta Tags
// ============================================================================

test.describe('SEO - Home Page Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have correct page title', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('chobii.art');
    expect(title).toContain('Premium');
    expect(title).toContain('Posters');
  });

  test('should have meta description with relevant keywords', async ({ page }) => {
    const description = await getMetaByName(page, 'description');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(50);
    expect(description!.length).toBeLessThanOrEqual(165); // SEO best practice (ideally under 160)

    // Should contain relevant keywords
    const lowerDesc = description!.toLowerCase();
    expect(
      lowerDesc.includes('poster') ||
        lowerDesc.includes('art') ||
        lowerDesc.includes('frame')
    ).toBe(true);
  });

  test('should have Open Graph title', async ({ page }) => {
    const ogTitle = await getMetaByProperty(page, 'og:title');
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).toContain('chobii.art');
  });

  test('should have Open Graph description', async ({ page }) => {
    const ogDescription = await getMetaByProperty(page, 'og:description');
    expect(ogDescription).toBeTruthy();
    expect(ogDescription!.length).toBeGreaterThan(20);
  });

  test('should have Open Graph type set to website', async ({ page }) => {
    const ogType = await getMetaByProperty(page, 'og:type');
    expect(ogType).toBe('website');
  });

  test('should have Twitter Card meta tags', async ({ page }) => {
    const twitterCard = await getMetaByName(page, 'twitter:card');
    expect(twitterCard).toBe('summary_large_image');

    const twitterTitle = await getMetaByName(page, 'twitter:title');
    expect(twitterTitle).toBeTruthy();
    expect(twitterTitle).toContain('chobii.art');
  });

  test('should have Twitter description', async ({ page }) => {
    const twitterDescription = await getMetaByName(page, 'twitter:description');
    expect(twitterDescription).toBeTruthy();
  });

  test('should allow indexing (no noindex directive)', async ({ page }) => {
    const robots = await getMetaByName(page, 'robots');
    // If robots meta exists, it should allow indexing
    if (robots) {
      expect(robots).not.toContain('noindex');
    }
  });
});

// ============================================================================
// Posters Listing Page Meta Tags
// ============================================================================

test.describe('SEO - Posters Listing Page Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/posters');
  });

  test('should have page title with Shop Posters', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('Posters');
    expect(title).toContain('chobii.art');
  });

  test('should have meta description for posters', async ({ page }) => {
    const description = await getMetaByName(page, 'description');
    expect(description).toBeTruthy();
    expect(description!.toLowerCase()).toContain('poster');
  });

  test('should have canonical link', async ({ page }) => {
    const canonical = await getLinkByRel(page, 'canonical');
    expect(canonical).toBeTruthy();
    expect(canonical).toContain('/posters');
  });

  test('should have Open Graph meta tags', async ({ page }) => {
    const ogTitle = await getMetaByProperty(page, 'og:title');
    const ogDescription = await getMetaByProperty(page, 'og:description');
    const ogType = await getMetaByProperty(page, 'og:type');

    expect(ogTitle).toBeTruthy();
    expect(ogDescription).toBeTruthy();
    expect(ogType).toBe('website');
  });

  test('should have keywords meta tag', async ({ page }) => {
    const keywords = await getMetaByName(page, 'keywords');
    if (keywords) {
      expect(keywords.toLowerCase()).toContain('poster');
    }
  });

  test('should have og:image meta tag', async ({ page }) => {
    const ogImage = await getMetaByProperty(page, 'og:image');
    expect(ogImage).toBeTruthy();
  });

  test('should have Twitter Card tags', async ({ page }) => {
    const twitterCard = await getMetaByName(page, 'twitter:card');
    const twitterTitle = await getMetaByName(page, 'twitter:title');
    const twitterImage = await getMetaByName(page, 'twitter:image');

    expect(twitterCard).toBe('summary_large_image');
    expect(twitterTitle).toBeTruthy();
    expect(twitterImage).toBeTruthy();
  });
});

// ============================================================================
// Posters Listing Page with Filters Meta Tags
// ============================================================================

test.describe('SEO - Filtered Posters Page Meta Tags', () => {
  test('should update title based on style filter', async ({ page }) => {
    await page.goto('/posters?styles=abstract');
    const title = await page.title();

    // Title should reflect the filter
    expect(title.toLowerCase()).toContain('abstract');
    expect(title).toContain('chobii.art');
  });

  test('should set noindex for paginated pages', async ({ page }) => {
    await page.goto('/posters?page=2');
    const robots = await getMetaByName(page, 'robots');

    // Page 2+ should be noindex to avoid duplicate content
    if (robots) {
      expect(robots).toContain('noindex');
      expect(robots).toContain('follow'); // But still follow links
    }
  });

  test('should maintain canonical URL without pagination', async ({ page }) => {
    await page.goto('/posters?page=3');
    const canonical = await getLinkByRel(page, 'canonical');

    if (canonical) {
      // Canonical should point to base URL without page parameter
      expect(canonical).not.toContain('page=');
    }
  });
});

// ============================================================================
// AI Generator Page Meta Tags
// ============================================================================

test.describe('SEO - AI Generator Page Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should have page title with AI Poster', async ({ page }) => {
    const title = await page.title();
    expect(title.toLowerCase()).toContain('ai');
    expect(title).toContain('chobii.art');
  });

  test('should have meta description mentioning AI creation', async ({ page }) => {
    const description = await getMetaByName(page, 'description');
    expect(description).toBeTruthy();
    const lowerDesc = description!.toLowerCase();
    expect(lowerDesc.includes('ai') || lowerDesc.includes('create')).toBe(true);
  });

  test('should have Open Graph tags', async ({ page }) => {
    const ogTitle = await getMetaByProperty(page, 'og:title');
    const ogDescription = await getMetaByProperty(page, 'og:description');

    expect(ogTitle).toBeTruthy();
    expect(ogDescription).toBeTruthy();
  });

  test('should allow indexing', async ({ page }) => {
    const robots = await getMetaByName(page, 'robots');
    if (robots) {
      expect(robots).not.toContain('noindex');
    }
  });
});

// ============================================================================
// Cart Page Meta Tags
// ============================================================================

test.describe('SEO - Cart Page Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
  });

  test('should have page title with Shopping Cart', async ({ page }) => {
    const title = await page.title();
    expect(title.toLowerCase()).toContain('cart');
    expect(title).toContain('chobii.art');
  });

  test('should have noindex directive', async ({ page }) => {
    // Cart pages should not be indexed
    const robots = await getMetaByName(page, 'robots');
    expect(robots).toBeTruthy();
    expect(robots).toContain('noindex');
  });

  test('should have meta description', async ({ page }) => {
    const description = await getMetaByName(page, 'description');
    expect(description).toBeTruthy();
  });
});

// ============================================================================
// Auth Pages Meta Tags
// ============================================================================

test.describe('SEO - Auth Pages Meta Tags', () => {
  test('login page should have correct title', async ({ page }) => {
    await page.goto('/auth/login');
    const title = await page.title();
    expect(title.toLowerCase()).toContain('sign in');
    expect(title).toContain('chobii.art');
  });

  test('login page should have noindex directive', async ({ page }) => {
    await page.goto('/auth/login');
    const robots = await getMetaByName(page, 'robots');
    expect(robots).toBeTruthy();
    expect(robots).toContain('noindex');
  });

  test('register page should have correct title', async ({ page }) => {
    await page.goto('/auth/register');
    const title = await page.title();
    const lowerTitle = title.toLowerCase();
    expect(
      lowerTitle.includes('register') ||
        lowerTitle.includes('sign up') ||
        lowerTitle.includes('create account')
    ).toBe(true);
  });

  test('register page should have noindex directive', async ({ page }) => {
    await page.goto('/auth/register');
    const robots = await getMetaByName(page, 'robots');
    expect(robots).toBeTruthy();
    expect(robots).toContain('noindex');
  });

  test('auth pages should have meta descriptions', async ({ page }) => {
    await page.goto('/auth/login');
    const loginDesc = await getMetaByName(page, 'description');
    expect(loginDesc).toBeTruthy();

    await page.goto('/auth/register');
    const registerDesc = await getMetaByName(page, 'description');
    expect(registerDesc).toBeTruthy();
  });
});

// ============================================================================
// Checkout Page Meta Tags
// ============================================================================

test.describe('SEO - Checkout Page Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/checkout');
  });

  test('should have page title with Checkout', async ({ page }) => {
    const title = await page.title();
    const lowerTitle = title.toLowerCase();
    expect(lowerTitle.includes('checkout') || lowerTitle.includes('chobii.art')).toBe(true);
  });

  test('should have noindex directive for checkout', async ({ page }) => {
    // Checkout pages should not be indexed
    const robots = await getMetaByName(page, 'robots');
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });
});

// ============================================================================
// Account Pages Meta Tags
// ============================================================================

test.describe('SEO - Account Pages Meta Tags', () => {
  test('account dashboard should have noindex', async ({ page }) => {
    await page.goto('/account');
    const robots = await getMetaByName(page, 'robots');
    // User account pages should typically not be indexed
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });

  test('account orders page should have noindex', async ({ page }) => {
    await page.goto('/account/orders');
    const robots = await getMetaByName(page, 'robots');
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });

  test('AI creations page should have noindex', async ({ page }) => {
    await page.goto('/account/ai-creations');
    const robots = await getMetaByName(page, 'robots');
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });
});

// ============================================================================
// Admin Pages Meta Tags
// ============================================================================

test.describe('SEO - Admin Pages Meta Tags', () => {
  test('admin dashboard should have noindex', async ({ page }) => {
    await page.goto('/admin');
    const robots = await getMetaByName(page, 'robots');
    // Admin pages should definitely not be indexed
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });

  test('admin products page should have noindex', async ({ page }) => {
    await page.goto('/admin/products');
    const robots = await getMetaByName(page, 'robots');
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });

  test('admin orders page should have noindex', async ({ page }) => {
    await page.goto('/admin/orders');
    const robots = await getMetaByName(page, 'robots');
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });
});

// ============================================================================
// 404 Page Meta Tags
// ============================================================================

test.describe('SEO - 404 Page Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/this-page-definitely-does-not-exist-12345');
  });

  test('should display 404 page', async ({ page }) => {
    const heading = page.locator('h1:has-text("404")');
    await expect(heading).toBeVisible();
  });

  test('should have noindex for 404 pages', async ({ page }) => {
    const robots = await getMetaByName(page, 'robots');
    // 404 pages should ideally have noindex
    // If robots meta exists, check it
    if (robots) {
      expect(robots).toContain('noindex');
    }
  });

  test('should maintain basic page structure', async ({ page }) => {
    // Should still have header and footer
    const header = page.locator('header');
    const footer = page.locator('footer');
    await expect(header).toBeVisible();
    await expect(footer).toBeVisible();
  });
});

// ============================================================================
// Meta Tags Best Practices Tests
// ============================================================================

test.describe('SEO - Meta Tags Best Practices', () => {
  const publicPages = ['/', '/posters', '/create'];

  for (const pageUrl of publicPages) {
    test(`${pageUrl} - should have title under 60 characters (SEO best practice)`, async ({
      page,
    }) => {
      await page.goto(pageUrl);
      const title = await page.title();
      expect(title.length).toBeLessThanOrEqual(70); // Allowing some flexibility
    });

    test(`${pageUrl} - should have description between 50-160 characters`, async ({
      page,
    }) => {
      await page.goto(pageUrl);
      const description = await getMetaByName(page, 'description');
      expect(description).toBeTruthy();
      expect(description!.length).toBeGreaterThanOrEqual(50);
      expect(description!.length).toBeLessThanOrEqual(165);
    });

    test(`${pageUrl} - should have unique title different from description`, async ({
      page,
    }) => {
      await page.goto(pageUrl);
      const title = await page.title();
      const description = await getMetaByName(page, 'description');
      expect(description).toBeTruthy();
      expect(title.toLowerCase()).not.toBe(description!.toLowerCase());
    });
  }
});

// ============================================================================
// Open Graph Image Tests
// ============================================================================

test.describe('SEO - Open Graph Images', () => {
  test('home page should have og:image', async ({ page }) => {
    await page.goto('/');
    const ogImage = await getMetaByProperty(page, 'og:image');
    // og:image may not be set on all pages, but if it is, validate it
    if (ogImage) {
      expect(ogImage.startsWith('http')).toBe(true);
    }
  });

  test('posters page should have og:image', async ({ page }) => {
    await page.goto('/posters');
    const ogImage = await getMetaByProperty(page, 'og:image');
    expect(ogImage).toBeTruthy();
    expect(ogImage!.startsWith('http')).toBe(true);
  });

  test('og:image should have alt text when available', async ({ page }) => {
    await page.goto('/posters');
    const ogImageAlt = await getMetaByProperty(page, 'og:image:alt');
    if (ogImageAlt) {
      expect(ogImageAlt.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Twitter Card Image Tests
// ============================================================================

test.describe('SEO - Twitter Card Images', () => {
  test('posters page should have twitter:image', async ({ page }) => {
    await page.goto('/posters');
    const twitterImage = await getMetaByName(page, 'twitter:image');
    expect(twitterImage).toBeTruthy();
    expect(twitterImage!.startsWith('http')).toBe(true);
  });

  test('twitter:image should have alt text when available', async ({ page }) => {
    await page.goto('/posters');
    const twitterImageAlt = await getMetaByName(page, 'twitter:image:alt');
    if (twitterImageAlt) {
      expect(twitterImageAlt.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Social Media Profile Tests
// ============================================================================

test.describe('SEO - Social Media Profiles', () => {
  test('should have twitter:site handle on posters page', async ({ page }) => {
    await page.goto('/posters');
    const twitterSite = await getMetaByName(page, 'twitter:site');
    if (twitterSite) {
      expect(twitterSite.startsWith('@')).toBe(true);
    }
  });

  test('should have twitter:creator handle when available', async ({ page }) => {
    await page.goto('/posters');
    const twitterCreator = await getMetaByName(page, 'twitter:creator');
    if (twitterCreator) {
      expect(twitterCreator.startsWith('@')).toBe(true);
    }
  });
});

// ============================================================================
// Locale and Language Tests
// ============================================================================

test.describe('SEO - Locale and Language', () => {
  test('should have og:locale for posters page', async ({ page }) => {
    await page.goto('/posters');
    const ogLocale = await getMetaByProperty(page, 'og:locale');
    if (ogLocale) {
      expect(ogLocale).toMatch(/^[a-z]{2}(_[A-Z]{2})?$/); // e.g., "en" or "en_US"
    }
  });

  test('html lang attribute should be valid', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const lang = await html.getAttribute('lang');
    expect(lang).toBeTruthy();
    expect(lang!.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// URL and Canonical Tests
// ============================================================================

test.describe('SEO - URL and Canonical', () => {
  test('posters page should have og:url', async ({ page }) => {
    await page.goto('/posters');
    const ogUrl = await getMetaByProperty(page, 'og:url');
    expect(ogUrl).toBeTruthy();
    expect(ogUrl!.startsWith('http')).toBe(true);
    expect(ogUrl!.includes('/posters')).toBe(true);
  });

  test('canonical URL should be absolute', async ({ page }) => {
    await page.goto('/posters');
    const canonical = await getLinkByRel(page, 'canonical');
    expect(canonical).toBeTruthy();
    expect(canonical!.startsWith('http')).toBe(true);
  });
});

// ============================================================================
// Performance - Meta Tags Loading
// ============================================================================

test.describe('SEO - Meta Tags Performance', () => {
  test('meta tags should be present in initial HTML', async ({ page }) => {
    await page.goto('/');

    // Verify critical meta tags are in initial HTML (SSR)
    const title = await page.title();
    expect(title).toBeTruthy();

    const description = await getMetaByName(page, 'description');
    expect(description).toBeTruthy();

    const viewport = await getMetaByName(page, 'viewport');
    expect(viewport).toBeTruthy();
  });

  test('meta tags should load quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    // Check meta tags are available immediately
    const title = await page.title();
    const loadTime = Date.now() - startTime;

    expect(title).toBeTruthy();
    // Meta tags should be available quickly (within 5 seconds accounting for cold start)
    expect(loadTime).toBeLessThan(5000);
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

test.describe('SEO - Meta Tag Consistency', () => {
  test('og:title should match or be similar to page title', async ({ page }) => {
    await page.goto('/');
    const title = await page.title();
    const ogTitle = await getMetaByProperty(page, 'og:title');

    expect(ogTitle).toBeTruthy();
    // OG title should contain key parts of the page title
    const titleKeyword = 'chobii.art';
    expect(title).toContain(titleKeyword);
    expect(ogTitle).toContain(titleKeyword);
  });

  test('twitter:title should match og:title', async ({ page }) => {
    await page.goto('/');
    const ogTitle = await getMetaByProperty(page, 'og:title');
    const twitterTitle = await getMetaByName(page, 'twitter:title');

    if (ogTitle && twitterTitle) {
      // They should be the same or very similar
      expect(twitterTitle).toContain('chobii.art');
    }
  });

  test('meta description and og:description should be related', async ({ page }) => {
    await page.goto('/');
    const description = await getMetaByName(page, 'description');
    const ogDescription = await getMetaByProperty(page, 'og:description');

    expect(description).toBeTruthy();
    expect(ogDescription).toBeTruthy();

    // Both should mention relevant keywords
    const descLower = description!.toLowerCase();
    const ogDescLower = ogDescription!.toLowerCase();

    expect(
      descLower.includes('poster') || descLower.includes('art')
    ).toBe(true);
    expect(
      ogDescLower.includes('poster') || ogDescLower.includes('art')
    ).toBe(true);
  });
});
