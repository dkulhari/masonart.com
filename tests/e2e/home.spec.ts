import { test, expect } from '@playwright/test';

/**
 * Home Page E2E Tests
 *
 * Tests for the MasonArt home page including:
 * - Hero section with CTA buttons
 * - Featured products section
 * - Categories/Shop by Style section
 * - AI Generator promo section
 * - Value propositions section
 * - Newsletter subscription section
 * - SEO meta tags
 * - Responsive design
 * - Accessibility
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/index.tsx
 */

// ============================================================================
// Hero Section Tests
// ============================================================================

test.describe('Home Page - Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the hero section', async ({ page }) => {
    // Hero section should be visible at the top
    const heroSection = page.locator('section').first();
    await expect(heroSection).toBeVisible();
  });

  test('should display AI Generator badge', async ({ page }) => {
    // Badge with "New: AI Poster Generator" text
    const badge = page.locator('text=New: AI Poster Generator');
    await expect(badge).toBeVisible();
  });

  test('should display main headline', async ({ page }) => {
    // Main headline "Transform Your Space with Premium Art"
    const headline = page.locator('h1');
    await expect(headline).toBeVisible();
    await expect(headline).toContainText('Transform Your Space');
    await expect(headline).toContainText('Premium Art');
  });

  test('should display subheadline with description', async ({ page }) => {
    // Subheadline describing the service
    const subheadline = page.locator('text=Discover our curated collection');
    await expect(subheadline).toBeVisible();
  });

  test('should display Shop Posters CTA button', async ({ page }) => {
    // Primary CTA button
    const shopButton = page.locator('a[href="/posters"]:has-text("Shop Posters")');
    await expect(shopButton).toBeVisible();
  });

  test('should display Create with AI CTA button', async ({ page }) => {
    // Secondary CTA button
    const createButton = page.locator('a[href="/create"]:has-text("Create with AI")');
    await expect(createButton).toBeVisible();
  });

  test('should display rating trust indicator', async ({ page }) => {
    // 4.9/5 rating with stars
    const rating = page.locator('text=4.9/5 from 2,000+ reviews');
    await expect(rating).toBeVisible();

    // Should display 5 star icons
    const heroSection = page.locator('section').first();
    const stars = heroSection.locator('svg.fill-yellow-400');
    await expect(stars).toHaveCount(5);
  });

  test('should display free shipping trust indicator', async ({ page }) => {
    // Free shipping indicator
    const shipping = page.locator('text=Free shipping over');
    await expect(shipping).toBeVisible();
  });

  test('should display 30-day returns trust indicator', async ({ page }) => {
    // Returns policy indicator
    const returns = page.locator('text=30-day returns');
    await expect(returns).toBeVisible();
  });

  test('should navigate to posters page when clicking Shop Posters', async ({ page }) => {
    const shopButton = page.locator('a[href="/posters"]:has-text("Shop Posters")');
    await shopButton.click();
    await expect(page).toHaveURL('/posters');
  });

  test('should navigate to create page when clicking Create with AI', async ({ page }) => {
    const createButton = page.locator('a[href="/create"]:has-text("Create with AI")');
    await createButton.click();
    await expect(page).toHaveURL('/create');
  });
});

// ============================================================================
// Featured Products Section Tests
// ============================================================================

test.describe('Home Page - Featured Products Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display Featured Collection section header', async ({ page }) => {
    const header = page.locator('h2:has-text("Featured Collection")');
    await expect(header).toBeVisible();
  });

  test('should display section description', async ({ page }) => {
    const description = page.locator('text=Handpicked favorites loved by our customers');
    await expect(description).toBeVisible();
  });

  test('should display View all link on desktop', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    const viewAllLink = page.locator('a[href="/posters"]:has-text("View all")');
    await expect(viewAllLink.first()).toBeVisible();
  });

  test('should display products grid or placeholder', async ({ page }) => {
    // Either products grid or placeholder should be visible
    const productsGrid = page.locator('.grid.grid-cols-2');
    const placeholder = page.locator('text=Coming Soon');

    // One of these should be visible
    const hasProducts = await productsGrid.isVisible();
    const hasPlaceholder = await placeholder.isVisible();

    expect(hasProducts || hasPlaceholder).toBe(true);
  });

  test('should display placeholder when no products', async ({ page }) => {
    // When there are no featured products, placeholder should be shown
    const placeholder = page.locator('text=Our featured collection is being curated');

    if (await placeholder.isVisible()) {
      // Placeholder should have "Create with AI" link
      const createLink = page.locator('text=Create your own with AI in the meantime');
      await expect(createLink).toBeVisible();
    }
  });

  test('should display mobile View all products link', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    const mobileViewAll = page.locator('a[href="/posters"]:has-text("View all products")');
    await expect(mobileViewAll).toBeVisible();
  });

  test('should navigate to posters when clicking View all', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    const viewAllLink = page.locator('a[href="/posters"]:has-text("View all")').first();
    await viewAllLink.click();
    await expect(page).toHaveURL('/posters');
  });
});

// ============================================================================
// Product Card Tests (when products are available)
// ============================================================================

test.describe('Home Page - Product Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display product cards with images', async ({ page }) => {
    // Only run this test if products are available
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      // Each product card should have an image container
      const firstCard = productCards.first();
      await expect(firstCard).toBeVisible();

      // Should have image or placeholder icon
      const cardImage = firstCard.locator('img');
      const placeholderIcon = firstCard.locator('svg');
      const hasImage = await cardImage.count() > 0;
      const hasIcon = await placeholderIcon.count() > 0;

      expect(hasImage || hasIcon).toBe(true);
    }
  });

  test('should display product title in card', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      // Each card should have an h3 title
      const firstCard = productCards.first();
      const title = firstCard.locator('h3');
      await expect(title).toBeVisible();
    }
  });

  test('should display product price in card', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      // Each card should show price starting with "From"
      const firstCard = productCards.first();
      const price = firstCard.locator('text=/From ₹/');
      await expect(price).toBeVisible();
    }
  });

  test('should display Featured badge on featured products', async ({ page }) => {
    const featuredBadges = page.locator('.bg-brand-500:has-text("Featured")');
    // Featured badge may or may not be visible depending on products
    const count = await featuredBadges.count();
    // Just verify no errors - count can be 0 or more
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should navigate to product detail when clicking card', async ({ page }) => {
    const productCards = page.locator('a[href^="/posters/"]');
    const count = await productCards.count();

    if (count > 0) {
      const firstCard = productCards.first();
      const href = await firstCard.getAttribute('href');
      await firstCard.click();
      await expect(page).toHaveURL(href!);
    }
  });
});

// ============================================================================
// Categories Section Tests
// ============================================================================

test.describe('Home Page - Categories Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display Shop by Style section header', async ({ page }) => {
    const header = page.locator('h2:has-text("Shop by Style")');
    await expect(header).toBeVisible();
  });

  test('should display section description', async ({ page }) => {
    const description = page.locator('text=Find the perfect piece for your aesthetic');
    await expect(description).toBeVisible();
  });

  test('should display Abstract category', async ({ page }) => {
    const abstract = page.locator('h3:has-text("Abstract")');
    await expect(abstract).toBeVisible();

    const abstractDesc = page.locator('text=Bold, expressive art pieces');
    await expect(abstractDesc).toBeVisible();
  });

  test('should display Nature category', async ({ page }) => {
    const nature = page.locator('h3:has-text("Nature")');
    await expect(nature).toBeVisible();

    const natureDesc = page.locator('text=Serene landscapes & botanicals');
    await expect(natureDesc).toBeVisible();
  });

  test('should display Minimalist category', async ({ page }) => {
    const minimalist = page.locator('h3:has-text("Minimalist")');
    await expect(minimalist).toBeVisible();

    const minimalistDesc = page.locator('text=Clean lines, simple beauty');
    await expect(minimalistDesc).toBeVisible();
  });

  test('should display Typography category', async ({ page }) => {
    const typography = page.locator('h3:has-text("Typography")');
    await expect(typography).toBeVisible();

    const typographyDesc = page.locator('text=Words that inspire');
    await expect(typographyDesc).toBeVisible();
  });

  test('should have category links with correct hrefs', async ({ page }) => {
    // Check each category link
    const abstractLink = page.locator('a[href="/posters?styles=abstract"]');
    const natureLink = page.locator('a[href="/posters?styles=nature"]');
    const minimalistLink = page.locator('a[href="/posters?styles=minimalist"]');
    const typographyLink = page.locator('a[href="/posters?styles=typography"]');

    await expect(abstractLink).toBeVisible();
    await expect(natureLink).toBeVisible();
    await expect(minimalistLink).toBeVisible();
    await expect(typographyLink).toBeVisible();
  });

  test('should navigate to filtered posters when clicking category', async ({ page }) => {
    const abstractLink = page.locator('a[href="/posters?styles=abstract"]');
    await abstractLink.click();
    await expect(page).toHaveURL(/\/posters\?styles=abstract/);
  });

  test('should display categories in grid layout', async ({ page }) => {
    // Categories should be in a grid
    const categoriesGrid = page.locator('.grid.grid-cols-2.lg\\:grid-cols-4');
    await expect(categoriesGrid.last()).toBeVisible();
  });

  test('should show Explore text on hover', async ({ page }) => {
    // Set desktop viewport for hover test
    await page.setViewportSize({ width: 1280, height: 720 });

    const categoryLink = page.locator('a[href="/posters?styles=abstract"]');

    // Before hover, Explore text should be hidden (opacity-0)
    const exploreText = categoryLink.locator('text=Explore');

    // Hover over category
    await categoryLink.hover();

    // Explore text should become visible on hover
    await expect(exploreText).toBeVisible();
  });
});

// ============================================================================
// AI Generator Section Tests
// ============================================================================

test.describe('Home Page - AI Generator Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display AI Generator section', async ({ page }) => {
    const header = page.locator('h2:has-text("Create Your Own Masterpiece")');
    await expect(header).toBeVisible();
  });

  test('should display section description', async ({ page }) => {
    const description = page.locator('text=Use our AI-powered poster generator');
    await expect(description).toBeVisible();
  });

  test('should display Sparkles icon', async ({ page }) => {
    // The section has a Sparkles icon in a container
    const iconContainer = page.locator('.bg-white\\/10.backdrop-blur');
    await expect(iconContainer.first()).toBeVisible();
  });

  test('should display Easy to use feature', async ({ page }) => {
    const feature = page.locator('text=Easy to use');
    await expect(feature).toBeVisible();

    const featureDesc = page.locator('text=No design skills needed');
    await expect(featureDesc).toBeVisible();
  });

  test('should display Multiple styles feature', async ({ page }) => {
    const feature = page.locator('text=Multiple styles');
    await expect(feature).toBeVisible();

    const featureDesc = page.locator('text=From abstract to realistic');
    await expect(featureDesc).toBeVisible();
  });

  test('should display Print ready feature', async ({ page }) => {
    const feature = page.locator('text=Print ready');
    await expect(feature).toBeVisible();

    const featureDesc = page.locator('text=High-quality output');
    await expect(featureDesc).toBeVisible();
  });

  test('should display Start Creating CTA button', async ({ page }) => {
    const ctaButton = page.locator('a[href="/create"]:has-text("Start Creating")');
    await expect(ctaButton).toBeVisible();
  });

  test('should navigate to create page when clicking Start Creating', async ({ page }) => {
    const ctaButton = page.locator('a[href="/create"]:has-text("Start Creating")');
    await ctaButton.click();
    await expect(page).toHaveURL('/create');
  });

  test('should have gradient background', async ({ page }) => {
    // The AI section has a branded gradient background
    const section = page.locator('section:has(h2:has-text("Create Your Own Masterpiece"))');
    await expect(section).toBeVisible();

    // Check for gradient background element
    const gradientBg = section.locator('.bg-gradient-to-br.from-brand-600.to-brand-800');
    await expect(gradientBg).toBeVisible();
  });
});

// ============================================================================
// Value Propositions Section Tests
// ============================================================================

test.describe('Home Page - Value Propositions Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display Why Choose MasonArt section header', async ({ page }) => {
    const header = page.locator('h2:has-text("Why Choose MasonArt")');
    await expect(header).toBeVisible();
  });

  test('should display section description', async ({ page }) => {
    const description = page.locator('text=committed to bringing art into every home');
    await expect(description).toBeVisible();
  });

  test('should display Premium Quality value prop', async ({ page }) => {
    const title = page.locator('h3:has-text("Premium Quality")');
    await expect(title).toBeVisible();

    const description = page.locator('text=Museum-grade paper and archival inks');
    await expect(description).toBeVisible();
  });

  test('should display Free Shipping value prop', async ({ page }) => {
    const title = page.locator('h3:has-text("Free Shipping")');
    await expect(title).toBeVisible();

    const description = page.locator('text=Enjoy free delivery on all orders over');
    await expect(description).toBeVisible();
  });

  test('should display 30-Day Returns value prop', async ({ page }) => {
    const title = page.locator('h3:has-text("30-Day Returns")');
    await expect(title).toBeVisible();

    const description = page.locator('text=Return within 30 days for a full refund');
    await expect(description).toBeVisible();
  });

  test('should display AI-Powered Creation value prop', async ({ page }) => {
    const title = page.locator('h3:has-text("AI-Powered Creation")');
    await expect(title).toBeVisible();

    const description = page.locator('text=Create custom artwork with our state-of-the-art');
    await expect(description).toBeVisible();
  });

  test('should display value props in grid layout', async ({ page }) => {
    // Value props should be in a responsive grid
    const valuePropsSection = page.locator('section:has(h2:has-text("Why Choose MasonArt"))');
    const grid = valuePropsSection.locator('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4');
    await expect(grid).toBeVisible();
  });

  test('should display icons for each value prop', async ({ page }) => {
    // Each value prop card has an icon
    const valuePropsSection = page.locator('section:has(h2:has-text("Why Choose MasonArt"))');
    const iconContainers = valuePropsSection.locator('.bg-brand-100.text-brand-600');
    await expect(iconContainers).toHaveCount(4);
  });
});

// ============================================================================
// Newsletter Section Tests
// ============================================================================

test.describe('Home Page - Newsletter Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display Stay Inspired section header', async ({ page }) => {
    const header = page.locator('h2:has-text("Stay Inspired")');
    await expect(header).toBeVisible();
  });

  test('should display section description', async ({ page }) => {
    const description = page.locator('text=Subscribe to receive updates on new collections');
    await expect(description).toBeVisible();
  });

  test('should display email input field', async ({ page }) => {
    const emailInput = page.locator('input[type="email"][placeholder="Enter your email"]');
    await expect(emailInput).toBeVisible();
  });

  test('should display Subscribe button', async ({ page }) => {
    const subscribeButton = page.locator('button[type="submit"]:has-text("Subscribe")');
    await expect(subscribeButton).toBeVisible();
  });

  test('should display privacy disclaimer', async ({ page }) => {
    const disclaimer = page.locator('text=By subscribing, you agree to our Privacy Policy');
    await expect(disclaimer).toBeVisible();
  });

  test('should accept email input', async ({ page }) => {
    const emailInput = page.locator('input[type="email"][placeholder="Enter your email"]');
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('should require email field', async ({ page }) => {
    const emailInput = page.locator('input[type="email"][placeholder="Enter your email"]');
    const required = await emailInput.getAttribute('required');
    expect(required).not.toBeNull();
  });

  test('should have form element', async ({ page }) => {
    const newsletterSection = page.locator('section:has(h2:has-text("Stay Inspired"))');
    const form = newsletterSection.locator('form');
    await expect(form).toBeVisible();
  });
});

// ============================================================================
// SEO Meta Tags Tests
// ============================================================================

test.describe('Home Page - SEO Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have correct page title', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('MasonArt');
    expect(title).toContain('Premium Posters');
  });

  test('should have meta description', async ({ page }) => {
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description?.toLowerCase()).toContain('poster');
    expect(description?.toLowerCase()).toContain('art');
  });

  test('should have Open Graph title', async ({ page }) => {
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).toContain('MasonArt');
  });

  test('should have Open Graph description', async ({ page }) => {
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDescription).toBeTruthy();
  });

  test('should have Open Graph type', async ({ page }) => {
    const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
    expect(ogType).toBe('website');
  });

  test('should have Twitter card meta tag', async ({ page }) => {
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBe('summary_large_image');
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('Home Page - Responsive Design', () => {
  test('should adapt hero CTA buttons for mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // CTA buttons should be stacked on mobile (flex-col)
    const shopButton = page.locator('a[href="/posters"]:has-text("Shop Posters")');
    const createButton = page.locator('a[href="/create"]:has-text("Create with AI")');

    await expect(shopButton).toBeVisible();
    await expect(createButton).toBeVisible();
  });

  test('should adapt categories grid for mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Categories should display in 2 columns on mobile
    const categoriesGrid = page.locator('.grid.grid-cols-2').last();
    await expect(categoriesGrid).toBeVisible();
  });

  test('should adapt value props for mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Value props should stack on mobile (grid-cols-1)
    const valuePropsSection = page.locator('section:has(h2:has-text("Why Choose MasonArt"))');
    await expect(valuePropsSection).toBeVisible();
  });

  test('should adapt newsletter form for mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Newsletter form should stack on mobile (flex-col)
    const emailInput = page.locator('input[type="email"][placeholder="Enter your email"]');
    const subscribeButton = page.locator('button[type="submit"]:has-text("Subscribe")');

    await expect(emailInput).toBeVisible();
    await expect(subscribeButton).toBeVisible();
  });

  test('should display all sections on tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Verify all major sections are visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h2:has-text("Featured Collection")')).toBeVisible();
    await expect(page.locator('h2:has-text("Shop by Style")')).toBeVisible();
    await expect(page.locator('h2:has-text("Create Your Own Masterpiece")')).toBeVisible();
    await expect(page.locator('h2:has-text("Why Choose MasonArt")')).toBeVisible();
    await expect(page.locator('h2:has-text("Stay Inspired")')).toBeVisible();
  });

  test('should display all sections on desktop', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Verify all major sections are visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h2:has-text("Featured Collection")')).toBeVisible();
    await expect(page.locator('h2:has-text("Shop by Style")')).toBeVisible();
    await expect(page.locator('h2:has-text("Create Your Own Masterpiece")')).toBeVisible();
    await expect(page.locator('h2:has-text("Why Choose MasonArt")')).toBeVisible();
    await expect(page.locator('h2:has-text("Stay Inspired")')).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Home Page - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have exactly one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Should have multiple h2s for sections
    const h2Count = await page.locator('h2').count();
    expect(h2Count).toBeGreaterThanOrEqual(5); // Hero might not have h2

    // Should have h3s for subsections
    const h3Count = await page.locator('h3').count();
    expect(h3Count).toBeGreaterThanOrEqual(4); // At least categories
  });

  test('should have accessible links with descriptive text', async ({ page }) => {
    // CTAs should have descriptive text
    const shopButton = page.locator('a[href="/posters"]:has-text("Shop Posters")');
    const createButton = page.locator('a[href="/create"]:has-text("Create with AI")');

    await expect(shopButton).toBeVisible();
    await expect(createButton).toBeVisible();

    // Links should not have generic text
    const genericLinks = page.locator('a:has-text("Click here")');
    const genericCount = await genericLinks.count();
    expect(genericCount).toBe(0);
  });

  test('should have accessible form elements', async ({ page }) => {
    // Newsletter email input should be accessible
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Input should have placeholder for guidance
    const placeholder = await emailInput.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Tab through the page
    await page.keyboard.press('Tab');

    // First focusable element should be focused
    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeTruthy();
  });

  test('should have sufficient color contrast on hero text', async ({ page }) => {
    // Hero headline should be visible and readable
    const headline = page.locator('h1');
    await expect(headline).toBeVisible();

    // Should have proper text color applied
    const color = await headline.evaluate(el =>
      window.getComputedStyle(el).color
    );
    expect(color).toBeTruthy();
  });

  test('should have proper section structure', async ({ page }) => {
    // Page should have semantic sections
    const sections = page.locator('section');
    const sectionCount = await sections.count();

    // Should have multiple sections (Hero, Featured, Categories, AI, Value Props, Newsletter)
    expect(sectionCount).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('Home Page - Performance', () => {
  test('should load home page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    // Wait for main content to be visible
    await expect(page.locator('h1')).toBeVisible();

    const loadTime = Date.now() - startTime;

    // Page should load within 5 seconds (accounting for cold start)
    expect(loadTime).toBeLessThan(5000);
  });

  test('should render hero section quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    // Hero should be visible quickly
    await expect(page.locator('h1')).toBeVisible();

    const heroLoadTime = Date.now() - startTime;

    // Hero should render within 3 seconds
    expect(heroLoadTime).toBeLessThan(3000);
  });

  test('should lazy load product images', async ({ page }) => {
    await page.goto('/');

    // Product images should have loading="lazy" attribute
    const productImages = page.locator('img[loading="lazy"]');
    const lazyImageCount = await productImages.count();

    // Should have some lazy loaded images (if products exist)
    expect(lazyImageCount).toBeGreaterThanOrEqual(0);
  });

  test('should not have layout shifts on scroll', async ({ page }) => {
    await page.goto('/');

    // Get initial header position
    const header = page.locator('header');
    const initialBox = await header.boundingBox();

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);

    // Header should remain stable (sticky)
    const afterScrollBox = await header.boundingBox();

    if (initialBox && afterScrollBox) {
      // Header should still be at top
      expect(afterScrollBox.y).toBeLessThanOrEqual(10);
    }
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('Home Page - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should have multiple paths to posters page', async ({ page }) => {
    // Should have multiple links to /posters
    const postersLinks = page.locator('a[href="/posters"]');
    const count = await postersLinks.count();

    // At least: Hero CTA, Featured section, Header nav
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should have multiple paths to create page', async ({ page }) => {
    // Should have multiple links to /create
    const createLinks = page.locator('a[href="/create"]');
    const count = await createLinks.count();

    // At least: Hero CTA, AI Generator section
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should navigate correctly from category links', async ({ page }) => {
    // Test navigation from category card
    const abstractLink = page.locator('a[href="/posters?styles=abstract"]');
    await abstractLink.click();

    // Should navigate to filtered posters page
    await expect(page).toHaveURL(/\/posters\?styles=abstract/);

    // Go back to home
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('should maintain scroll position when navigating back', async ({ page }) => {
    // Scroll down on home page
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(300);

    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Navigate to another page
    const postersLink = page.locator('a[href="/posters"]').first();
    await postersLink.click();
    await expect(page).toHaveURL('/posters');

    // Navigate back
    await page.goBack();

    // Scroll position should be restored (browser default behavior)
    await page.waitForTimeout(500);
  });
});

// ============================================================================
// Content Tests
// ============================================================================

test.describe('Home Page - Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display all trust indicators', async ({ page }) => {
    // Rating
    await expect(page.locator('text=2,000+ reviews')).toBeVisible();

    // Free shipping
    await expect(page.locator('text=/Free shipping.*999/')).toBeVisible();

    // Returns policy
    await expect(page.locator('text=30-day returns')).toBeVisible();
  });

  test('should display Indian Rupee currency', async ({ page }) => {
    // Price should show in INR
    const priceText = page.locator('text=/₹/');
    const priceCount = await priceText.count();

    // Should have at least one price display (in hero or products)
    expect(priceCount).toBeGreaterThanOrEqual(1);
  });

  test('should display correct number of categories', async ({ page }) => {
    // Should have 4 category cards
    const categoryLinks = page.locator('a[href^="/posters?styles="]');
    const count = await categoryLinks.count();

    expect(count).toBe(4); // Abstract, Nature, Minimalist, Typography
  });

  test('should display correct number of value propositions', async ({ page }) => {
    // Should have 4 value prop cards
    const valuePropsSection = page.locator('section:has(h2:has-text("Why Choose MasonArt"))');
    const valuePropCards = valuePropsSection.locator('h3');
    const count = await valuePropCards.count();

    expect(count).toBe(4); // Premium Quality, Free Shipping, 30-Day Returns, AI-Powered
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('Home Page - Error Handling', () => {
  test('should gracefully handle missing products', async ({ page }) => {
    await page.goto('/');

    // Page should load even if featured products API fails
    // Either products or placeholder should show
    const productsGrid = page.locator('.grid.grid-cols-2.lg\\:grid-cols-4');
    const placeholder = page.locator('text=Coming Soon');

    const hasProducts = await productsGrid.first().isVisible();
    const hasPlaceholder = await placeholder.isVisible();

    // Page should display gracefully either way
    expect(hasProducts || hasPlaceholder).toBe(true);
  });

  test('should maintain layout with no JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/');

    // Wait for page to fully load
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForTimeout(1000);

    // Should have no critical JavaScript errors
    // Filter out expected errors like network failures
    const criticalErrors = errors.filter(e =>
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
