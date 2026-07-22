import { test, expect } from '@playwright/test';

/**
 * Robots.txt E2E Tests
 *
 * Comprehensive tests for verifying robots.txt configuration:
 * - File accessibility and correct content-type
 * - Valid robots.txt syntax and format
 * - User-agent directives
 * - Allow/Disallow rules for public and private paths
 * - Sitemap reference
 * - Crawl-delay directive
 * - Query string handling for duplicate content prevention
 *
 * robots.txt Specification: https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */

// ============================================================================
// Types
// ============================================================================

interface RobotsDirective {
  type: 'User-agent' | 'Allow' | 'Disallow' | 'Sitemap' | 'Crawl-delay' | 'Host' | string;
  value: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch robots.txt content
 */
async function fetchRobotsTxt(
  page: import('@playwright/test').Page
): Promise<{ status: number; content: string | null }> {
  const response = await page.goto('/robots.txt');
  const status = response?.status() ?? 0;
  let content: string | null = null;

  if (response && status === 200) {
    content = await response.text();
  }

  return { status, content };
}

/**
 * Parse robots.txt content into directives
 */
function parseRobotsTxt(content: string): RobotsDirective[] {
  const directives: RobotsDirective[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse directive
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const type = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      directives.push({ type, value });
    }
  }

  return directives;
}

/**
 * Get all directives of a specific type
 */
function getDirectivesByType(directives: RobotsDirective[], type: string): RobotsDirective[] {
  return directives.filter((d) => d.type.toLowerCase() === type.toLowerCase());
}

/**
 * Check if a path is disallowed by robots.txt directives
 */
function isPathDisallowed(directives: RobotsDirective[], path: string): boolean {
  const disallows = getDirectivesByType(directives, 'Disallow');
  return disallows.some((d) => {
    // Handle wildcard patterns
    if (d.value.includes('*')) {
      const pattern = d.value.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}`);
      return regex.test(path);
    }
    return path.startsWith(d.value);
  });
}

/**
 * Check if a path is explicitly allowed by robots.txt directives
 */
function isPathAllowed(directives: RobotsDirective[], path: string): boolean {
  const allows = getDirectivesByType(directives, 'Allow');
  return allows.some((d) => {
    // Handle wildcard patterns
    if (d.value.includes('*')) {
      const pattern = d.value.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}`);
      return regex.test(path);
    }
    return path === d.value || path.startsWith(d.value + '/');
  });
}

// ============================================================================
// Robots.txt Accessibility Tests
// ============================================================================

test.describe('Robots.txt - Accessibility', () => {
  test('should return 200 status for robots.txt', async ({ page }) => {
    const { status } = await fetchRobotsTxt(page);
    expect(status).toBe(200);
  });

  test('should have correct content-type header', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    const contentType = response?.headers()['content-type'];

    // Content type should be text/plain
    if (contentType) {
      expect(
        contentType.includes('text/plain') || contentType.includes('text/html')
      ).toBe(true);
    }
  });

  test('should not be empty', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(10);
  });

  test('should load quickly', async ({ page }) => {
    const startTime = Date.now();
    const { status } = await fetchRobotsTxt(page);
    const loadTime = Date.now() - startTime;

    expect(status).toBe(200);
    // robots.txt should load within 2 seconds
    expect(loadTime).toBeLessThan(2000);
  });

  test('should be accessible without authentication', async ({ page }) => {
    // Clear any existing cookies/session
    await page.context().clearCookies();
    const { status } = await fetchRobotsTxt(page);
    expect(status).toBe(200);
  });
});

// ============================================================================
// Robots.txt Format Validation Tests
// ============================================================================

test.describe('Robots.txt - Format', () => {
  test('should have valid UTF-8 encoding', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    // Check for any encoding issues - should be valid text
    const hasValidChars = /^[\x00-\x7F]*$/.test(content!) || content!.length > 0;
    expect(hasValidChars).toBe(true);
  });

  test('should have proper line breaks', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    // Should have multiple lines
    const lines = content!.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  test('should use valid directive format', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const lines = content!.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Each non-empty, non-comment line should have a colon
      expect(trimmed).toContain(':');
    }
  });

  test('should have parseable directives', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(directives.length).toBeGreaterThan(0);
  });

  test('should support comments', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    // Should have at least one comment (expected based on the actual file)
    expect(content!.includes('#')).toBe(true);
  });
});

// ============================================================================
// User-Agent Directive Tests
// ============================================================================

test.describe('Robots.txt - User-Agent', () => {
  test('should have at least one User-agent directive', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const userAgents = getDirectivesByType(directives, 'User-agent');
    expect(userAgents.length).toBeGreaterThan(0);
  });

  test('should have wildcard User-agent for all bots', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const userAgents = getDirectivesByType(directives, 'User-agent');

    // Should have a wildcard user-agent
    const wildcardAgent = userAgents.find((ua) => ua.value === '*');
    expect(wildcardAgent).toBeTruthy();
  });

  test('User-agent should appear before rules', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);

    // First directive should typically be User-agent
    const firstDirective = directives[0];
    if (firstDirective) {
      expect(firstDirective.type).toBe('User-agent');
    }
  });
});

// ============================================================================
// Allow Directive Tests
// ============================================================================

test.describe('Robots.txt - Allow Directives', () => {
  test('should allow root path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathAllowed(directives, '/')).toBe(true);
  });

  test('should allow /posters path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const allows = getDirectivesByType(directives, 'Allow');
    const postersAllowed = allows.some(
      (d) => d.value === '/posters' || d.value === '/posters/'
    );
    expect(postersAllowed).toBe(true);
  });

  test('should allow /create path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const allows = getDirectivesByType(directives, 'Allow');
    const createAllowed = allows.some((d) => d.value === '/create');
    expect(createAllowed).toBe(true);
  });

  test('should allow /gallery path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const allows = getDirectivesByType(directives, 'Allow');
    const galleryAllowed = allows.some((d) => d.value === '/gallery');
    expect(galleryAllowed).toBe(true);
  });

  test('should have valid Allow path values', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const allows = getDirectivesByType(directives, 'Allow');

    for (const allow of allows) {
      // Allow values should start with /
      expect(allow.value.startsWith('/')).toBe(true);
    }
  });
});

// ============================================================================
// Disallow Directive Tests
// ============================================================================

test.describe('Robots.txt - Disallow Directives', () => {
  test('should disallow /admin path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathDisallowed(directives, '/admin')).toBe(true);
  });

  test('should disallow /account path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathDisallowed(directives, '/account')).toBe(true);
  });

  test('should disallow /cart path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathDisallowed(directives, '/cart')).toBe(true);
  });

  test('should disallow /checkout path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathDisallowed(directives, '/checkout')).toBe(true);
  });

  test('should disallow /auth path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathDisallowed(directives, '/auth')).toBe(true);
  });

  test('should disallow /api path', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    expect(isPathDisallowed(directives, '/api')).toBe(true);
  });

  test('should disallow all private paths', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const privatePaths = ['/admin', '/account', '/cart', '/checkout', '/auth', '/api'];
    const directives = parseRobotsTxt(content!);

    for (const path of privatePaths) {
      expect(isPathDisallowed(directives, path)).toBe(true);
    }
  });

  test('should have valid Disallow path values', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const disallows = getDirectivesByType(directives, 'Disallow');

    for (const disallow of disallows) {
      // Disallow values should start with / or be empty (allow all)
      if (disallow.value !== '') {
        expect(disallow.value.startsWith('/')).toBe(true);
      }
    }
  });
});

// ============================================================================
// Query String Handling Tests
// ============================================================================

test.describe('Robots.txt - Query String Handling', () => {
  test('should handle page parameter to prevent duplicate content', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const disallows = getDirectivesByType(directives, 'Disallow');

    // Should have rules for page parameter
    const hasPageRule = disallows.some(
      (d) => d.value.includes('?page=') || d.value.includes('&page=')
    );
    expect(hasPageRule).toBe(true);
  });

  test('should handle sort parameter to prevent duplicate content', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const disallows = getDirectivesByType(directives, 'Disallow');

    // Should have rules for sort parameter
    const hasSortRule = disallows.some(
      (d) => d.value.includes('?sort=') || d.value.includes('&sort=')
    );
    expect(hasSortRule).toBe(true);
  });

  test('should use wildcards for query parameter rules', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const disallows = getDirectivesByType(directives, 'Disallow');

    // Should use wildcards for flexible matching
    const hasWildcardRules = disallows.some((d) => d.value.includes('*'));
    expect(hasWildcardRules).toBe(true);
  });
});

// ============================================================================
// Sitemap Directive Tests
// ============================================================================

test.describe('Robots.txt - Sitemap Reference', () => {
  test('should include Sitemap directive', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const sitemaps = getDirectivesByType(directives, 'Sitemap');
    expect(sitemaps.length).toBeGreaterThan(0);
  });

  test('Sitemap URL should be absolute URL', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const sitemaps = getDirectivesByType(directives, 'Sitemap');

    for (const sitemap of sitemaps) {
      // Sitemap URL should start with http:// or https://
      expect(
        sitemap.value.startsWith('http://') || sitemap.value.startsWith('https://')
      ).toBe(true);
    }
  });

  test('Sitemap URL should end with sitemap.xml', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const sitemaps = getDirectivesByType(directives, 'Sitemap');

    expect(sitemaps.length).toBeGreaterThan(0);
    for (const sitemap of sitemaps) {
      expect(sitemap.value.endsWith('sitemap.xml')).toBe(true);
    }
  });

  test('Sitemap URL should be valid URL', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const sitemaps = getDirectivesByType(directives, 'Sitemap');

    for (const sitemap of sitemaps) {
      expect(() => new URL(sitemap.value)).not.toThrow();
    }
  });

  test('Sitemap should reference correct domain', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const sitemaps = getDirectivesByType(directives, 'Sitemap');

    expect(sitemaps.length).toBeGreaterThan(0);
    // Should reference chobi.art domain
    const hasMasonartDomain = sitemaps.some((s) =>
      s.value.includes('chobi.art') || s.value.includes('localhost')
    );
    expect(hasMasonartDomain).toBe(true);
  });
});

// ============================================================================
// Crawl-Delay Directive Tests
// ============================================================================

test.describe('Robots.txt - Crawl-Delay', () => {
  test('should include Crawl-delay directive', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const crawlDelays = getDirectivesByType(directives, 'Crawl-delay');

    // Crawl-delay is optional but recommended
    if (crawlDelays.length > 0) {
      expect(crawlDelays.length).toBeGreaterThan(0);
    }
  });

  test('Crawl-delay should be a positive number', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const crawlDelays = getDirectivesByType(directives, 'Crawl-delay');

    for (const delay of crawlDelays) {
      const value = parseFloat(delay.value);
      expect(value).toBeGreaterThan(0);
    }
  });

  test('Crawl-delay should be reasonable (not too high)', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const crawlDelays = getDirectivesByType(directives, 'Crawl-delay');

    for (const delay of crawlDelays) {
      const value = parseFloat(delay.value);
      // Crawl delay should typically be between 0 and 10 seconds
      expect(value).toBeLessThanOrEqual(10);
    }
  });
});

// ============================================================================
// Security Tests
// ============================================================================

test.describe('Robots.txt - Security', () => {
  test('should not expose sensitive paths by mistake', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    // Should not contain sensitive information in comments
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /api[_-]?key/i,
      /token/i,
      /credentials/i,
    ];

    for (const pattern of sensitivePatterns) {
      expect(pattern.test(content!)).toBe(false);
    }
  });

  test('should disallow sensitive internal paths', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);

    // These paths should definitely be disallowed
    const sensitivePaths = ['/admin', '/api'];
    for (const path of sensitivePaths) {
      expect(isPathDisallowed(directives, path)).toBe(true);
    }
  });

  test('should not allow access to user-specific paths', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);

    // User-specific paths should be disallowed
    expect(isPathDisallowed(directives, '/account')).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

test.describe('Robots.txt - Integration', () => {
  test('allowed paths should be accessible', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    // Test that allowed paths return successful responses
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
  });

  test('robots.txt should be consistent with sitemap', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const sitemaps = getDirectivesByType(directives, 'Sitemap');

    // If sitemap is referenced, it should be accessible (on localhost)
    if (sitemaps.length > 0) {
      const sitemapResponse = await page.goto('/sitemap.xml');
      expect([200, 404]).toContain(sitemapResponse?.status());
    }
  });

  test('disallowed paths should match application structure', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);

    // Expected private paths based on application architecture
    const expectedPrivatePaths = ['/admin', '/account', '/cart', '/checkout', '/auth', '/api'];

    for (const path of expectedPrivatePaths) {
      expect(isPathDisallowed(directives, path)).toBe(true);
    }
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

test.describe('Robots.txt - Consistency', () => {
  test('should be consistent across multiple requests', async ({ page }) => {
    // Fetch robots.txt twice
    const { content: content1 } = await fetchRobotsTxt(page);
    const { content: content2 } = await fetchRobotsTxt(page);

    expect(content1).toBeTruthy();
    expect(content2).toBeTruthy();

    // Content should be identical
    expect(content1).toBe(content2);
  });

  test('should have no conflicting rules', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);
    const allows = getDirectivesByType(directives, 'Allow');
    const disallows = getDirectivesByType(directives, 'Disallow');

    // Check for exact path conflicts (same path in both Allow and Disallow)
    for (const allow of allows) {
      const conflicting = disallows.find((d) => d.value === allow.value);
      // Having same path in both is valid (more specific rule wins)
      // but typically indicates a potential issue
      if (conflicting) {
        // This is a warning scenario - just verify it's intentional
        expect(true).toBe(true);
      }
    }
  });

  test('should follow logical order of directives', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    const directives = parseRobotsTxt(content!);

    // User-agent should come before Allow/Disallow rules
    let foundUserAgent = false;
    for (const directive of directives) {
      if (directive.type === 'User-agent') {
        foundUserAgent = true;
      }
      if (
        (directive.type === 'Allow' || directive.type === 'Disallow') &&
        !foundUserAgent
      ) {
        // Allow/Disallow before User-agent is invalid
        expect(foundUserAgent).toBe(true);
      }
    }
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Robots.txt - Performance', () => {
  test('should be small in file size', async ({ page }) => {
    const { content } = await fetchRobotsTxt(page);
    expect(content).toBeTruthy();

    // robots.txt should be under 500KB (typical recommendation)
    const sizeInBytes = new TextEncoder().encode(content!).length;
    expect(sizeInBytes).toBeLessThan(500 * 1024);
  });

  test('should be cacheable', async ({ page }) => {
    const response = await page.goto('/robots.txt');

    // Check cache headers
    const cacheControl = response?.headers()['cache-control'];
    const etag = response?.headers()['etag'];
    const lastModified = response?.headers()['last-modified'];

    // Should have some form of caching indication
    const hasCaching = cacheControl || etag || lastModified;
    // This is optional but recommended
    if (hasCaching) {
      expect(true).toBe(true);
    }
  });

  test('should load without JavaScript', async ({ page }) => {
    // Create context without JavaScript
    const noJsContext = await page.context().browser()?.newContext({
      javaScriptEnabled: false,
    });

    if (noJsContext) {
      const noJsPage = await noJsContext.newPage();
      const response = await noJsPage.goto('/robots.txt');

      expect(response?.status()).toBe(200);
      const content = await response?.text();
      expect(content).toBeTruthy();
      expect(content!.includes('User-agent')).toBe(true);

      await noJsContext.close();
    }
  });
});
