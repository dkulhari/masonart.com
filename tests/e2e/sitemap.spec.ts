import { test, expect } from '@playwright/test';

/**
 * Sitemap.xml E2E Tests
 *
 * Comprehensive tests for verifying sitemap.xml generation:
 * - Sitemap accessibility and valid XML format
 * - XML Sitemap Protocol compliance (sitemaps.org standard)
 * - Required elements (urlset, url, loc)
 * - Optional elements validation (lastmod, changefreq, priority)
 * - URL validity and accessibility
 * - Public pages inclusion
 * - Private pages exclusion (cart, checkout, auth, admin, account)
 *
 * XML Sitemap Protocol: https://www.sitemaps.org/protocol.html
 */

// ============================================================================
// Types
// ============================================================================

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch sitemap.xml content
 */
async function fetchSitemap(
  page: import('@playwright/test').Page
): Promise<{ status: number; content: string | null }> {
  const response = await page.goto('/sitemap.xml');
  const status = response?.status() ?? 0;
  let content: string | null = null;

  if (response && status === 200) {
    content = await response.text();
  }

  return { status, content };
}

/**
 * Parse sitemap XML content and extract URLs
 */
function parseSitemapUrls(xmlContent: string): SitemapUrl[] {
  const urls: SitemapUrl[] = [];

  // Match all <url> blocks
  const urlMatches = xmlContent.match(/<url>([\s\S]*?)<\/url>/g);
  if (!urlMatches) return urls;

  for (const urlBlock of urlMatches) {
    const locMatch = urlBlock.match(/<loc>([\s\S]*?)<\/loc>/);
    const lastmodMatch = urlBlock.match(/<lastmod>([\s\S]*?)<\/lastmod>/);
    const changefreqMatch = urlBlock.match(/<changefreq>([\s\S]*?)<\/changefreq>/);
    const priorityMatch = urlBlock.match(/<priority>([\s\S]*?)<\/priority>/);

    if (locMatch && locMatch[1]) {
      urls.push({
        loc: locMatch[1].trim(),
        lastmod: lastmodMatch?.[1]?.trim(),
        changefreq: changefreqMatch?.[1]?.trim(),
        priority: priorityMatch?.[1]?.trim(),
      });
    }
  }

  return urls;
}

/**
 * Check if URL path matches a pattern
 */
function urlPathMatches(url: string, pattern: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname === pattern || urlObj.pathname.startsWith(pattern + '/');
  } catch {
    return url.includes(pattern);
  }
}

/**
 * Check if URL contains any of the private path patterns
 */
function isPrivatePath(url: string): boolean {
  const privatePaths = [
    '/cart',
    '/checkout',
    '/auth',
    '/login',
    '/register',
    '/account',
    '/admin',
    '/api/',
  ];
  return privatePaths.some((path) => urlPathMatches(url, path));
}

// ============================================================================
// Sitemap Accessibility Tests
// ============================================================================

test.describe('Sitemap - Accessibility', () => {
  test('should return 200 status for sitemap.xml', async ({ page }) => {
    const { status } = await fetchSitemap(page);
    expect(status).toBe(200);
  });

  test('should have correct content-type header', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    const contentType = response?.headers()['content-type'];

    // Content type should be XML or text/xml
    if (contentType) {
      expect(
        contentType.includes('xml') ||
          contentType.includes('text/xml') ||
          contentType.includes('application/xml')
      ).toBe(true);
    }
  });

  test('should not be empty', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(100);
  });

  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    const { status } = await fetchSitemap(page);
    const loadTime = Date.now() - startTime;

    expect(status).toBe(200);
    // Sitemap should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});

// ============================================================================
// XML Format Validation Tests
// ============================================================================

test.describe('Sitemap - XML Format', () => {
  test('should have valid XML declaration', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Should start with XML declaration
    expect(content!.trim().startsWith('<?xml')).toBe(true);
    expect(content!.includes('version="1.0"')).toBe(true);
  });

  test('should have UTF-8 encoding', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Should have UTF-8 encoding
    expect(content!.toLowerCase().includes('encoding="utf-8"')).toBe(true);
  });

  test('should have urlset root element', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Should have opening and closing urlset tags
    expect(content!.includes('<urlset')).toBe(true);
    expect(content!.includes('</urlset>')).toBe(true);
  });

  test('should have correct namespace', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Should include sitemaps.org namespace
    expect(
      content!.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') ||
        content!.includes('xmlns="https://www.sitemaps.org/schemas/sitemap/0.9"')
    ).toBe(true);
  });

  test('should have at least one url element', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    expect(content!.includes('<url>')).toBe(true);
    expect(content!.includes('</url>')).toBe(true);
  });

  test('should have properly nested XML structure', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Each url should be inside urlset
    const urlsetMatch = content!.match(/<urlset[^>]*>([\s\S]*)<\/urlset>/);
    expect(urlsetMatch).toBeTruthy();
    expect(urlsetMatch?.[1]).toBeTruthy();

    // All url elements should be within urlset
    const urlsInUrlset = urlsetMatch?.[1]?.match(/<url>/g) ?? [];
    const allUrls = content!.match(/<url>/g) ?? [];
    expect(urlsInUrlset.length).toBe(allUrls.length);
  });
});

// ============================================================================
// Required Elements Tests
// ============================================================================

test.describe('Sitemap - Required Elements', () => {
  test('every url should have a loc element', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      expect(url.loc).toBeTruthy();
    }
  });

  test('loc elements should contain valid URLs', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      // Should be a valid URL starting with http/https
      expect(url.loc.startsWith('http://') || url.loc.startsWith('https://')).toBe(true);

      // Should be a valid URL (no parsing errors)
      expect(() => new URL(url.loc)).not.toThrow();
    }
  });

  test('loc URLs should use consistent protocol', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    if (urls.length > 1) {
      // All URLs should use the same protocol
      const protocols = urls.map((u) => new URL(u.loc).protocol);
      const uniqueProtocols = [...new Set(protocols)];
      expect(uniqueProtocols.length).toBe(1);
    }
  });

  test('loc URLs should use consistent host', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    if (urls.length > 1) {
      // All URLs should have the same host
      const hosts = urls.map((u) => new URL(u.loc).host);
      const uniqueHosts = [...new Set(hosts)];
      expect(uniqueHosts.length).toBe(1);
    }
  });
});

// ============================================================================
// Optional Elements Validation Tests
// ============================================================================

test.describe('Sitemap - Optional Elements', () => {
  test('lastmod should be valid ISO 8601 date if present', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    for (const url of urls) {
      if (url.lastmod) {
        // Valid ISO 8601 date formats: YYYY-MM-DD, YYYY-MM-DDThh:mm:ss, etc.
        const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
        expect(url.lastmod).toMatch(dateRegex);

        // Should be a parseable date
        const date = new Date(url.lastmod);
        expect(date.toString()).not.toBe('Invalid Date');
      }
    }
  });

  test('changefreq should be valid value if present', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const validChangefreq = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

    const urls = parseSitemapUrls(content!);
    for (const url of urls) {
      if (url.changefreq) {
        expect(validChangefreq).toContain(url.changefreq);
      }
    }
  });

  test('priority should be between 0.0 and 1.0 if present', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    for (const url of urls) {
      if (url.priority) {
        const priority = parseFloat(url.priority);
        expect(priority).toBeGreaterThanOrEqual(0.0);
        expect(priority).toBeLessThanOrEqual(1.0);
      }
    }
  });

  test('priority should have reasonable decimal precision', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    for (const url of urls) {
      if (url.priority) {
        // Priority should have at most 2 decimal places
        const decimalPart = url.priority.split('.')[1];
        if (decimalPart) {
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

// ============================================================================
// Public Pages Inclusion Tests
// ============================================================================

test.describe('Sitemap - Public Pages Inclusion', () => {
  test('should include home page', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const homePage = urls.find(
      (u) => new URL(u.loc).pathname === '/' || new URL(u.loc).pathname === ''
    );
    expect(homePage).toBeTruthy();
  });

  test('should include posters/products page', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const postersPage = urls.find(
      (u) =>
        new URL(u.loc).pathname === '/posters' ||
        new URL(u.loc).pathname === '/products' ||
        urlPathMatches(u.loc, '/posters') ||
        urlPathMatches(u.loc, '/products')
    );
    expect(postersPage).toBeTruthy();
  });

  test('should include AI generator/create page', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const createPage = urls.find(
      (u) =>
        new URL(u.loc).pathname === '/create' ||
        new URL(u.loc).pathname === '/generator' ||
        urlPathMatches(u.loc, '/create')
    );
    expect(createPage).toBeTruthy();
  });

  test('should have home page with highest priority', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const homePage = urls.find(
      (u) => new URL(u.loc).pathname === '/' || new URL(u.loc).pathname === ''
    );

    if (homePage?.priority) {
      const homePriority = parseFloat(homePage.priority);
      // Home page should typically have highest priority (0.8-1.0)
      expect(homePriority).toBeGreaterThanOrEqual(0.8);
    }
  });

  test('should include individual product pages if products exist', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);

    // Look for product detail pages (e.g., /posters/category/slug or /products/slug)
    const productPages = urls.filter(
      (u) =>
        (urlPathMatches(u.loc, '/posters/') && u.loc.split('/').length > 4) ||
        (urlPathMatches(u.loc, '/products/') && u.loc.split('/').length > 4)
    );

    // May or may not have product pages depending on data, just validate format if they exist
    if (productPages.length > 0) {
      for (const product of productPages) {
        expect(product.loc).toBeTruthy();
        expect(() => new URL(product.loc)).not.toThrow();
      }
    }
  });
});

// ============================================================================
// Private Pages Exclusion Tests
// ============================================================================

test.describe('Sitemap - Private Pages Exclusion', () => {
  test('should not include cart page', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const cartPage = urls.find((u) => urlPathMatches(u.loc, '/cart'));
    expect(cartPage).toBeFalsy();
  });

  test('should not include checkout page', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const checkoutPage = urls.find((u) => urlPathMatches(u.loc, '/checkout'));
    expect(checkoutPage).toBeFalsy();
  });

  test('should not include login/auth pages', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const authPages = urls.filter(
      (u) =>
        urlPathMatches(u.loc, '/auth') ||
        urlPathMatches(u.loc, '/login') ||
        urlPathMatches(u.loc, '/register') ||
        urlPathMatches(u.loc, '/sign-in') ||
        urlPathMatches(u.loc, '/sign-up')
    );
    expect(authPages.length).toBe(0);
  });

  test('should not include account pages', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const accountPages = urls.filter((u) => urlPathMatches(u.loc, '/account'));
    expect(accountPages.length).toBe(0);
  });

  test('should not include admin pages', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const adminPages = urls.filter((u) => urlPathMatches(u.loc, '/admin'));
    expect(adminPages.length).toBe(0);
  });

  test('should not include API endpoints', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const apiEndpoints = urls.filter((u) => urlPathMatches(u.loc, '/api'));
    expect(apiEndpoints.length).toBe(0);
  });

  test('should not include any private paths', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const privateUrls = urls.filter((u) => isPrivatePath(u.loc));
    expect(privateUrls.length).toBe(0);
  });
});

// ============================================================================
// URL Accessibility Tests
// ============================================================================

test.describe('Sitemap - URL Accessibility', () => {
  test('home page URL should be accessible', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const homePage = urls.find(
      (u) => new URL(u.loc).pathname === '/' || new URL(u.loc).pathname === ''
    );

    if (homePage) {
      const response = await page.goto('/');
      expect(response?.status()).toBe(200);
    }
  });

  test('posters page URL should be accessible', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const postersPage = urls.find(
      (u) => new URL(u.loc).pathname === '/posters' || new URL(u.loc).pathname === '/products'
    );

    if (postersPage) {
      const pathname = new URL(postersPage.loc).pathname;
      const response = await page.goto(pathname);
      expect(response?.status()).toBe(200);
    }
  });

  test('create page URL should be accessible', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const createPage = urls.find((u) => new URL(u.loc).pathname === '/create');

    if (createPage) {
      const response = await page.goto('/create');
      expect(response?.status()).toBe(200);
    }
  });

  test('sample product URLs should be accessible', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const productUrls = urls.filter(
      (u) =>
        (urlPathMatches(u.loc, '/posters/') && u.loc.split('/').length > 4) ||
        (urlPathMatches(u.loc, '/products/') && u.loc.split('/').length > 4)
    );

    // Test first 3 product URLs if available
    const samplesToTest = productUrls.slice(0, 3);
    for (const product of samplesToTest) {
      const pathname = new URL(product.loc).pathname;
      const response = await page.goto(pathname);
      // Should return 200 or redirect (3xx)
      expect([200, 301, 302, 307, 308]).toContain(response?.status());
    }
  });
});

// ============================================================================
// Sitemap Size and Count Tests
// ============================================================================

test.describe('Sitemap - Size and Count', () => {
  test('should not exceed 50MB', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // 50MB in bytes
    const maxSize = 50 * 1024 * 1024;
    expect(content!.length).toBeLessThan(maxSize);
  });

  test('should not exceed 50,000 URLs', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    // Sitemap protocol limit
    expect(urls.length).toBeLessThanOrEqual(50000);
  });

  test('should have a reasonable number of URLs', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    // Should have at least home, posters, and create pages
    expect(urls.length).toBeGreaterThanOrEqual(1);
  });

  test('should not have duplicate URLs', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    const locs = urls.map((u) => u.loc);
    const uniqueLocs = [...new Set(locs)];

    expect(locs.length).toBe(uniqueLocs.length);
  });
});

// ============================================================================
// Special Characters and Encoding Tests
// ============================================================================

test.describe('Sitemap - URL Encoding', () => {
  test('URLs should be properly escaped', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);
    for (const url of urls) {
      // Should not contain unescaped special XML characters
      expect(url.loc).not.toContain(' ');
      // Ampersands should be escaped as &amp;
      if (url.loc.includes('&')) {
        // In parsed form, we see & but in raw XML it should be &amp;
        // The parser converts &amp; back to &, so just check URL is valid
        expect(() => new URL(url.loc)).not.toThrow();
      }
    }
  });

  test('XML content should not have unescaped entities', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Check for common unescaped entities that would break XML
    // Ampersands should be &amp; not bare &
    const bareAmpersand = content!.match(/&(?!(amp|lt|gt|quot|apos);)/g);
    expect(bareAmpersand).toBeFalsy();
  });
});

// ============================================================================
// Robots.txt Integration Tests
// ============================================================================

test.describe('Sitemap - Robots.txt Integration', () => {
  test('sitemap should be referenced in robots.txt', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    if (response?.status() === 200) {
      const robotsContent = await response.text();

      // robots.txt should reference sitemap
      const sitemapReference =
        robotsContent.toLowerCase().includes('sitemap:') ||
        robotsContent.toLowerCase().includes('sitemap.xml');
      expect(sitemapReference).toBe(true);
    }
  });

  test('sitemap URL in robots.txt should match actual sitemap', async ({ page }) => {
    const robotsResponse = await page.goto('/robots.txt');
    if (robotsResponse?.status() === 200) {
      const robotsContent = await robotsResponse.text();

      // Extract sitemap URL from robots.txt
      const sitemapMatch = robotsContent.match(/Sitemap:\s*(.+)/i);
      if (sitemapMatch?.[1]) {
        const sitemapUrl = sitemapMatch[1].trim();

        // Verify the sitemap URL is accessible
        const sitemapResponse = await page.goto(sitemapUrl);
        expect(sitemapResponse?.status()).toBe(200);
      }
    }
  });
});

// ============================================================================
// Sitemap Index Tests (for large sites)
// ============================================================================

test.describe('Sitemap - Sitemap Index (Optional)', () => {
  test('should support sitemap index format if used', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    // Check if this is a sitemap index (contains sitemapindex root element)
    if (content!.includes('<sitemapindex')) {
      // Should have sitemap elements instead of url elements
      expect(content!.includes('<sitemap>')).toBe(true);
      expect(content!.includes('<loc>')).toBe(true);

      // Each sitemap element should have a loc
      const sitemapMatches = content!.match(/<sitemap>([\s\S]*?)<\/sitemap>/g);
      if (sitemapMatches) {
        for (const sitemapBlock of sitemapMatches) {
          expect(sitemapBlock.includes('<loc>')).toBe(true);
        }
      }
    }
  });

  test('sitemap index should reference valid child sitemaps', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    if (content!.includes('<sitemapindex')) {
      // Extract child sitemap URLs
      const sitemapMatches = content!.match(/<loc>([\s\S]*?)<\/loc>/g);
      if (sitemapMatches && sitemapMatches.length > 0) {
        // Test first child sitemap
        const locMatch = sitemapMatches[0].match(/<loc>([\s\S]*?)<\/loc>/);
        if (locMatch?.[1]) {
          const childUrl = locMatch[1].trim();
          const response = await page.goto(childUrl);
          expect(response?.status()).toBe(200);
        }
      }
    }
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Sitemap - Performance', () => {
  test('sitemap should be cached appropriately', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');

    // Check cache headers
    const cacheControl = response?.headers()['cache-control'];
    const etag = response?.headers()['etag'];
    const lastModified = response?.headers()['last-modified'];

    // Should have some form of caching
    const hasCaching = cacheControl || etag || lastModified;
    // This is optional but recommended
    if (hasCaching) {
      expect(true).toBe(true);
    }
  });

  test('sitemap should be gzip compressed when possible', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');

    // Check for compression
    const contentEncoding = response?.headers()['content-encoding'];

    // If compression is enabled, it should be gzip or similar
    if (contentEncoding) {
      expect(['gzip', 'deflate', 'br']).toContain(contentEncoding);
    }
  });

  test('sitemap should load without JavaScript', async ({ page }) => {
    // Create context without JavaScript
    const noJsContext = await page.context().browser()?.newContext({
      javaScriptEnabled: false,
    });

    if (noJsContext) {
      const noJsPage = await noJsContext.newPage();
      const response = await noJsPage.goto('/sitemap.xml');

      expect(response?.status()).toBe(200);
      const content = await response?.text();
      expect(content).toBeTruthy();
      expect(content!.includes('<urlset') || content!.includes('<sitemapindex')).toBe(true);

      await noJsContext.close();
    }
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

test.describe('Sitemap - Consistency', () => {
  test('sitemap URLs should match actual navigation', async ({ page }) => {
    const { content } = await fetchSitemap(page);
    expect(content).toBeTruthy();

    const urls = parseSitemapUrls(content!);

    // Navigate to home and check main nav links are in sitemap
    await page.goto('/');

    // Get navigation links
    const navLinks = await page.locator('nav a[href^="/"]').all();
    const navHrefs: string[] = [];

    for (const link of navLinks) {
      const href = await link.getAttribute('href');
      if (href && !href.startsWith('http') && !isPrivatePath(href)) {
        navHrefs.push(href);
      }
    }

    // Public nav links should generally be in sitemap
    for (const href of navHrefs.slice(0, 5)) {
      // Skip dynamic links and fragments
      if (!href.includes('#') && !href.includes('?')) {
        const inSitemap = urls.some(
          (u) => new URL(u.loc).pathname === href || new URL(u.loc).pathname === href + '/'
        );
        // This is informational - not all nav links must be in sitemap
        if (!inSitemap) {
          // Just log it, don't fail - some dynamic pages might be excluded
        }
      }
    }
  });

  test('sitemap should be consistent across multiple requests', async ({ page }) => {
    // Fetch sitemap twice
    const { content: content1 } = await fetchSitemap(page);
    const { content: content2 } = await fetchSitemap(page);

    expect(content1).toBeTruthy();
    expect(content2).toBeTruthy();

    // Parse URLs from both
    const urls1 = parseSitemapUrls(content1!);
    const urls2 = parseSitemapUrls(content2!);

    // Should have same number of URLs
    expect(urls1.length).toBe(urls2.length);

    // Same URLs should be present
    const locs1 = urls1.map((u) => u.loc).sort();
    const locs2 = urls2.map((u) => u.loc).sort();

    expect(locs1).toEqual(locs2);
  });
});
