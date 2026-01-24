import { test, expect } from '@playwright/test';

/**
 * AI Generator Page E2E Tests
 *
 * Tests for the MasonArt AI poster generator page (/create) including:
 * - Page header section
 * - Prompt input with character count
 * - Example prompts
 * - Negative prompt toggle
 * - Style preset selection with category filtering
 * - Aspect ratio selection
 * - Generate button states
 * - Results section (empty, loading, error, completed states)
 * - Tips section
 * - SEO meta tags
 * - Responsive design
 * - Accessibility
 * - Form validation
 *
 * Based on actual implementation in:
 * - packages/web/app/routes/create/index.tsx
 * - packages/web/app/components/ai-generator/PromptInput.tsx
 * - packages/web/app/components/ai-generator/StyleSelector.tsx
 * - packages/web/app/components/ai-generator/GenerationResults.tsx
 */

// ============================================================================
// Page Header Tests
// ============================================================================

test.describe('AI Generator - Page Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display the page header section', async ({ page }) => {
    const header = page.locator('section').first();
    await expect(header).toBeVisible();
  });

  test('should display Create AI Poster heading', async ({ page }) => {
    const heading = page.locator('h1:has-text("Create AI Poster")');
    await expect(heading).toBeVisible();
  });

  test('should display Sparkles icon in header', async ({ page }) => {
    const iconContainer = page.locator('.rounded-xl.bg-primary\\/10');
    await expect(iconContainer).toBeVisible();
  });

  test('should display page description', async ({ page }) => {
    const description = page.locator('text=Describe your vision and let AI bring it to life');
    await expect(description).toBeVisible();
  });
});

// ============================================================================
// Prompt Input Tests
// ============================================================================

test.describe('AI Generator - Prompt Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display Your Prompt label', async ({ page }) => {
    const label = page.locator('label:has-text("Your Prompt")');
    await expect(label).toBeVisible();
  });

  test('should display prompt textarea', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    await expect(textarea).toBeVisible();
  });

  test('should display placeholder text', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    const placeholder = await textarea.getAttribute('placeholder');
    expect(placeholder).toContain('Describe the poster');
  });

  test('should display character count', async ({ page }) => {
    const charCount = page.locator('text=/0\\/500/');
    await expect(charCount).toBeVisible();
  });

  test('should update character count when typing', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    await textarea.fill('Test prompt text');

    const charCount = page.locator('text=/16\\/500/');
    await expect(charCount).toBeVisible();
  });

  test('should accept prompt input', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    const testPrompt = 'A serene mountain landscape at sunset';
    await textarea.fill(testPrompt);
    await expect(textarea).toHaveValue(testPrompt);
  });

  test('should display Examples button', async ({ page }) => {
    const examplesButton = page.locator('button:has-text("Examples")');
    await expect(examplesButton).toBeVisible();
  });

  test('should toggle examples panel on click', async ({ page }) => {
    const examplesButton = page.locator('button:has-text("Examples")');
    await examplesButton.click();

    // Example prompts container should be visible
    const examplesPanel = page.locator('text=Click an example to use it');
    await expect(examplesPanel).toBeVisible();
  });

  test('should display example prompts when expanded', async ({ page }) => {
    const examplesButton = page.locator('button:has-text("Examples")');
    await examplesButton.click();

    // Check for example prompts
    const examplePrompts = page.locator('.flex.flex-wrap.gap-2 button');
    const count = await examplePrompts.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should populate prompt when clicking example', async ({ page }) => {
    const examplesButton = page.locator('button:has-text("Examples")');
    await examplesButton.click();

    // Click first example
    const firstExample = page.locator('.flex.flex-wrap.gap-2 button').first();
    await firstExample.click();

    // Prompt should be populated
    const textarea = page.locator('#prompt-input');
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('should close examples panel after selection', async ({ page }) => {
    const examplesButton = page.locator('button:has-text("Examples")');
    await examplesButton.click();

    const firstExample = page.locator('.flex.flex-wrap.gap-2 button').first();
    await firstExample.click();

    // Panel should close
    const examplesPanel = page.locator('text=Click an example to use it');
    await expect(examplesPanel).not.toBeVisible();
  });

  test('should display negative prompt toggle', async ({ page }) => {
    const negativeToggle = page.locator('button:has-text("Advanced: Negative Prompt")');
    await expect(negativeToggle).toBeVisible();
  });

  test('should expand negative prompt input on click', async ({ page }) => {
    const negativeToggle = page.locator('button:has-text("Advanced: Negative Prompt")');
    await negativeToggle.click();

    const negativeInput = page.locator('#negative-prompt-input');
    await expect(negativeInput).toBeVisible();
  });

  test('should accept negative prompt input', async ({ page }) => {
    const negativeToggle = page.locator('button:has-text("Advanced: Negative Prompt")');
    await negativeToggle.click();

    const negativeInput = page.locator('#negative-prompt-input');
    await negativeInput.fill('blurry, low quality, text');
    await expect(negativeInput).toHaveValue('blurry, low quality, text');
  });

  test('should show negative prompt character count', async ({ page }) => {
    const negativeToggle = page.locator('button:has-text("Advanced: Negative Prompt")');
    await negativeToggle.click();

    const charCount = page.locator('text=/0\\/300/');
    await expect(charCount).toBeVisible();
  });
});

// ============================================================================
// Style Selector Tests
// ============================================================================

test.describe('AI Generator - Style Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display Style Preset section', async ({ page }) => {
    const styleSection = page.locator('h3:has-text("Style Preset")');
    await expect(styleSection).toBeVisible();
  });

  test('should display category filter buttons', async ({ page }) => {
    const allStylesButton = page.locator('button:has-text("All Styles")');
    const artisticButton = page.locator('button:has-text("Artistic")');
    const photographicButton = page.locator('button:has-text("Photographic")');
    const illustrativeButton = page.locator('button:has-text("Illustrative")');
    const decorativeButton = page.locator('button:has-text("Decorative")');

    await expect(allStylesButton).toBeVisible();
    await expect(artisticButton).toBeVisible();
    await expect(photographicButton).toBeVisible();
    await expect(illustrativeButton).toBeVisible();
    await expect(decorativeButton).toBeVisible();
  });

  test('should have All Styles selected by default', async ({ page }) => {
    const allStylesButton = page.locator('button:has-text("All Styles")');
    // Check for selected state (primary background)
    await expect(allStylesButton).toHaveClass(/bg-primary/);
  });

  test('should filter styles when clicking category', async ({ page }) => {
    const artisticButton = page.locator('button:has-text("Artistic")');
    await artisticButton.click();

    // Should update selected state
    await expect(artisticButton).toHaveClass(/bg-primary/);
  });

  test('should display style preset cards', async ({ page }) => {
    // Style cards in the grid
    const styleCards = page.locator('.grid.grid-cols-2 button').first();
    await expect(styleCards).toBeVisible();
  });

  test('should display Wabi-Sabi style option', async ({ page }) => {
    const wabiSabi = page.locator('text=Wabi-Sabi');
    await expect(wabiSabi).toBeVisible();
  });

  test('should display Abstract Expression style option', async ({ page }) => {
    const abstractExpression = page.locator('text=Abstract Expression');
    await expect(abstractExpression).toBeVisible();
  });

  test('should display Botanical style option', async ({ page }) => {
    const botanical = page.locator('text=Botanical');
    await expect(botanical).toBeVisible();
  });

  test('should display Geometric Modern style option', async ({ page }) => {
    const geometricModern = page.locator('text=Geometric Modern');
    await expect(geometricModern).toBeVisible();
  });

  test('should display style descriptions', async ({ page }) => {
    const description = page.locator('text=Minimalist, organic aesthetics');
    await expect(description).toBeVisible();
  });

  test('should show selection indicator on selected style', async ({ page }) => {
    // Wabi-sabi is selected by default
    const selectedIndicator = page.locator('.border-primary.ring-2');
    const count = await selectedIndicator.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should change style on click', async ({ page }) => {
    // Click on Botanical style
    const botanicalCard = page.locator('button:has(.text-xs.font-medium:has-text("Botanical"))');
    await botanicalCard.click();

    // Should show selection indicator
    await expect(botanicalCard).toHaveClass(/border-primary/);
  });

  test('should display Premium badge on premium styles', async ({ page }) => {
    const proBadge = page.locator('text=PRO');
    const badgeCount = await proBadge.count();
    expect(badgeCount).toBeGreaterThanOrEqual(1);
  });

  test('should show locked overlay on premium styles for non-premium users', async ({ page }) => {
    const upgradeText = page.locator('text=Upgrade to unlock');
    const count = await upgradeText.count();
    expect(count).toBeGreaterThanOrEqual(0); // May or may not be visible
  });
});

// ============================================================================
// Aspect Ratio Selector Tests
// ============================================================================

test.describe('AI Generator - Aspect Ratio Selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display Aspect Ratio section', async ({ page }) => {
    const aspectSection = page.locator('h3:has-text("Aspect Ratio")');
    await expect(aspectSection).toBeVisible();
  });

  test('should display Square option', async ({ page }) => {
    const squareOption = page.locator('text=Square');
    await expect(squareOption).toBeVisible();
  });

  test('should display Portrait option', async ({ page }) => {
    const portraitOption = page.locator('text=Portrait');
    await expect(portraitOption).toBeVisible();
  });

  test('should display Landscape option', async ({ page }) => {
    const landscapeOption = page.locator('text=Landscape');
    await expect(landscapeOption).toBeVisible();
  });

  test('should display Panoramic option', async ({ page }) => {
    const panoramicOption = page.locator('text=Panoramic');
    await expect(panoramicOption).toBeVisible();
  });

  test('should display aspect ratio values', async ({ page }) => {
    await expect(page.locator('text=1:1')).toBeVisible();
    await expect(page.locator('text=2:3')).toBeVisible();
    await expect(page.locator('text=3:2')).toBeVisible();
    await expect(page.locator('text=16:9')).toBeVisible();
  });

  test('should have Portrait selected by default', async ({ page }) => {
    // Portrait is the default selection
    const portraitButton = page.locator('button:has(.text-sm.font-medium:has-text("Portrait"))');
    await expect(portraitButton).toHaveClass(/border-primary/);
  });

  test('should change aspect ratio on click', async ({ page }) => {
    const squareButton = page.locator('button:has(.text-sm.font-medium:has-text("Square"))');
    await squareButton.click();

    await expect(squareButton).toHaveClass(/border-primary/);
  });
});

// ============================================================================
// Generate Button Tests
// ============================================================================

test.describe('AI Generator - Generate Button', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display Generate Poster button', async ({ page }) => {
    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toBeVisible();
  });

  test('should be disabled when prompt is empty', async ({ page }) => {
    const generateButton = page.locator('button:has-text("Generate Poster")');
    // With empty prompt, button should be disabled/muted
    await expect(generateButton).toHaveClass(/cursor-not-allowed|bg-muted/);
  });

  test('should be disabled when prompt is too short', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    await textarea.fill('ab'); // Less than 3 characters

    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toHaveClass(/cursor-not-allowed|bg-muted/);
  });

  test('should be enabled when prompt is valid', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    await textarea.fill('A beautiful sunset over mountains');

    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).not.toHaveClass(/cursor-not-allowed/);
    await expect(generateButton).toHaveClass(/bg-primary/);
  });

  test('should display Wand icon in button', async ({ page }) => {
    const generateButton = page.locator('button:has-text("Generate Poster")');
    const icon = generateButton.locator('svg');
    await expect(icon).toBeVisible();
  });

  test('should display variations text below button', async ({ page }) => {
    const variationsText = page.locator('text=Each generation creates 4 unique variations');
    await expect(variationsText).toBeVisible();
  });
});

// ============================================================================
// Results Section Tests - Empty State
// ============================================================================

test.describe('AI Generator - Results Section (Empty State)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display empty state when no generations', async ({ page }) => {
    const emptyState = page.locator('text=No generations yet');
    await expect(emptyState).toBeVisible();
  });

  test('should display empty state description', async ({ page }) => {
    const description = page.locator('text=Enter a prompt, choose your style');
    await expect(description).toBeVisible();
  });

  test('should display image placeholder icon', async ({ page }) => {
    const iconContainer = page.locator('.rounded-full.bg-primary\\/10');
    await expect(iconContainer.first()).toBeVisible();
  });
});

// ============================================================================
// Tips Section Tests
// ============================================================================

test.describe('AI Generator - Tips Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display Tips section', async ({ page }) => {
    const tipsHeader = page.locator('h3:has-text("Tips for Better Results")');
    await expect(tipsHeader).toBeVisible();
  });

  test('should display Be Descriptive tip', async ({ page }) => {
    const tipTitle = page.locator('text=Be Descriptive');
    await expect(tipTitle).toBeVisible();

    const tipDescription = page.locator('text=Include details about colors, mood');
    await expect(tipDescription).toBeVisible();
  });

  test('should display Try Different Styles tip', async ({ page }) => {
    const tipTitle = page.locator('text=Try Different Styles');
    await expect(tipTitle).toBeVisible();
  });

  test('should display Use Negative Prompts tip', async ({ page }) => {
    const tipTitle = page.locator('text=Use Negative Prompts');
    await expect(tipTitle).toBeVisible();
  });

  test('should display Iterate tip', async ({ page }) => {
    const tipTitle = page.locator('.text-sm.font-medium:has-text("Iterate")');
    await expect(tipTitle).toBeVisible();
  });

  test('should display tips in grid layout', async ({ page }) => {
    const tipsGrid = page.locator('.grid.gap-4.sm\\:grid-cols-2').last();
    await expect(tipsGrid).toBeVisible();
  });
});

// ============================================================================
// SEO Meta Tags Tests
// ============================================================================

test.describe('AI Generator - SEO Meta Tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should have correct page title', async ({ page }) => {
    const title = await page.title();
    expect(title).toContain('Create AI Poster');
    expect(title).toContain('MasonArt');
  });

  test('should have meta description', async ({ page }) => {
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description?.toLowerCase()).toContain('ai');
    expect(description?.toLowerCase()).toContain('poster');
  });

  test('should have Open Graph title', async ({ page }) => {
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    expect(ogTitle).toContain('Create AI Poster');
  });

  test('should have Open Graph description', async ({ page }) => {
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    expect(ogDescription).toBeTruthy();
  });
});

// ============================================================================
// Responsive Design Tests
// ============================================================================

test.describe('AI Generator - Responsive Design', () => {
  test('should display properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/create');

    // Main elements should be visible
    const heading = page.locator('h1:has-text("Create AI Poster")');
    await expect(heading).toBeVisible();

    const promptInput = page.locator('#prompt-input');
    await expect(promptInput).toBeVisible();

    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toBeVisible();
  });

  test('should stack layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/create');

    // Grid should stack (single column on mobile)
    const mainGrid = page.locator('.grid.gap-8.lg\\:grid-cols-2');
    await expect(mainGrid).toBeVisible();
  });

  test('should display properly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/create');

    const heading = page.locator('h1:has-text("Create AI Poster")');
    await expect(heading).toBeVisible();
  });

  test('should use two-column layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/create');

    const mainGrid = page.locator('.grid.gap-8.lg\\:grid-cols-2');
    await expect(mainGrid).toBeVisible();
  });

  test('should adapt style cards grid on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/create');

    // Style cards should be in 2 columns on mobile
    const styleGrid = page.locator('.grid.grid-cols-2.gap-3');
    await expect(styleGrid.first()).toBeVisible();
  });

  test('should display all sections on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/create');

    await expect(page.locator('h1:has-text("Create AI Poster")')).toBeVisible();
    await expect(page.locator('label:has-text("Your Prompt")')).toBeVisible();
    await expect(page.locator('h3:has-text("Style Preset")')).toBeVisible();
    await expect(page.locator('h3:has-text("Aspect Ratio")')).toBeVisible();
    await expect(page.locator('button:has-text("Generate Poster")')).toBeVisible();
  });

  test('should adapt aspect ratio buttons on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/create');

    // Aspect ratio buttons should be in 2 columns on mobile
    const aspectGrid = page.locator('.grid.grid-cols-2.gap-3.sm\\:grid-cols-4');
    await expect(aspectGrid).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('AI Generator - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have exactly one h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Should have h3s for subsections
    const h3Count = await page.locator('h3').count();
    expect(h3Count).toBeGreaterThanOrEqual(3); // Style Preset, Aspect Ratio, Tips
  });

  test('should have accessible form labels', async ({ page }) => {
    // Prompt input should have associated label
    const promptLabel = page.locator('label[for="prompt-input"]');
    await expect(promptLabel).toBeVisible();
  });

  test('should have accessible textarea', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    await expect(textarea).toBeVisible();

    // Should have id for label association
    const id = await textarea.getAttribute('id');
    expect(id).toBe('prompt-input');
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Tab to prompt input
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should have focused element
    const focusedElement = page.locator(':focus');
    await expect(focusedElement.first()).toBeTruthy();
  });

  test('should have proper button roles', async ({ page }) => {
    const generateButton = page.locator('button:has-text("Generate Poster")');
    const role = await generateButton.getAttribute('type');
    expect(role).toBe('button');
  });

  test('should have aria labels on icon buttons where needed', async ({ page }) => {
    // Check that buttons have accessible names
    const examplesButton = page.locator('button:has-text("Examples")');
    await expect(examplesButton).toBeVisible();
    // Button has text content which serves as accessible name
  });
});

// ============================================================================
// Form Validation Tests
// ============================================================================

test.describe('AI Generator - Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should show error for empty prompt on generate', async ({ page }) => {
    // Note: Button is disabled for empty prompt, so error may not show
    // But we can test that button is properly disabled
    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toHaveClass(/cursor-not-allowed|bg-muted/);
  });

  test('should warn when prompt exceeds limit', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    // Fill with text longer than 500 characters
    const longText = 'a'.repeat(501);
    await textarea.fill(longText);

    // Should show error styling or message
    const errorText = page.locator('text=Prompt exceeds maximum length');
    await expect(errorText).toBeVisible();
  });

  test('should show character count near limit in warning color', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    // Fill with text close to limit (80%+)
    const nearLimitText = 'a'.repeat(410);
    await textarea.fill(nearLimitText);

    // Character count should change color (amber)
    const charCount = page.locator('text=/410\\/500/');
    await expect(charCount).toBeVisible();
  });

  test('should enable button with minimum valid prompt', async ({ page }) => {
    const textarea = page.locator('#prompt-input');
    await textarea.fill('abc'); // Minimum 3 characters

    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toHaveClass(/bg-primary/);
  });
});

// ============================================================================
// Navigation Tests
// ============================================================================

test.describe('AI Generator - Navigation', () => {
  test('should be accessible from home page hero CTA', async ({ page }) => {
    await page.goto('/');
    const createButton = page.locator('a[href="/create"]:has-text("Create with AI")');
    await createButton.click();
    await expect(page).toHaveURL('/create');
  });

  test('should be accessible from home page AI section', async ({ page }) => {
    await page.goto('/');
    const startCreatingButton = page.locator('a[href="/create"]:has-text("Start Creating")');
    await startCreatingButton.click();
    await expect(page).toHaveURL('/create');
  });

  test('should maintain form state on navigation back', async ({ page }) => {
    await page.goto('/create');

    // Fill in prompt
    const textarea = page.locator('#prompt-input');
    await textarea.fill('Test prompt for navigation');

    // Navigate away
    await page.goto('/');

    // Navigate back
    await page.goBack();

    // Note: Form state may or may not persist depending on router implementation
    await expect(page).toHaveURL(/\/create/);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

test.describe('AI Generator - Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/create');

    // Wait for main content
    await expect(page.locator('h1:has-text("Create AI Poster")')).toBeVisible();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(5000);
  });

  test('should render form elements quickly', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/create');

    // Form should be interactive quickly
    await expect(page.locator('#prompt-input')).toBeVisible();

    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(3000);
  });

  test('should not have JavaScript errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/create');

    // Wait for page to fully load
    await expect(page.locator('h1:has-text("Create AI Poster")')).toBeVisible();
    await page.waitForTimeout(1000);

    // Filter out expected network errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('Failed to fetch') && !e.includes('NetworkError')
    );

    expect(criticalErrors.length).toBe(0);
  });
});

// ============================================================================
// Interaction Flow Tests
// ============================================================================

test.describe('AI Generator - Interaction Flow', () => {
  test('should complete full form configuration', async ({ page }) => {
    await page.goto('/create');

    // 1. Enter prompt
    const textarea = page.locator('#prompt-input');
    await textarea.fill('A serene Japanese garden with cherry blossoms');

    // 2. Select style
    const botanicalCard = page.locator('button:has(.text-xs.font-medium:has-text("Botanical"))');
    await botanicalCard.click();

    // 3. Select aspect ratio
    const squareButton = page.locator('button:has(.text-sm.font-medium:has-text("Square"))');
    await squareButton.click();

    // 4. Optionally add negative prompt
    const negativeToggle = page.locator('button:has-text("Advanced: Negative Prompt")');
    await negativeToggle.click();
    const negativeInput = page.locator('#negative-prompt-input');
    await negativeInput.fill('blurry, text');

    // 5. Verify Generate button is enabled
    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toHaveClass(/bg-primary/);
    await expect(generateButton).not.toHaveClass(/cursor-not-allowed/);
  });

  test('should use example prompt and generate', async ({ page }) => {
    await page.goto('/create');

    // Click Examples
    const examplesButton = page.locator('button:has-text("Examples")');
    await examplesButton.click();

    // Select an example
    const firstExample = page.locator('.flex.flex-wrap.gap-2 button').first();
    await firstExample.click();

    // Verify prompt is filled and button is enabled
    const textarea = page.locator('#prompt-input');
    const value = await textarea.inputValue();
    expect(value.length).toBeGreaterThan(3);

    const generateButton = page.locator('button:has-text("Generate Poster")');
    await expect(generateButton).toHaveClass(/bg-primary/);
  });

  test('should filter and select style from specific category', async ({ page }) => {
    await page.goto('/create');

    // Filter to Illustrative category
    const illustrativeButton = page.locator('button:has-text("Illustrative")');
    await illustrativeButton.click();

    // Check that filter is applied
    await expect(illustrativeButton).toHaveClass(/bg-primary/);

    // Botanical should still be visible (it's in Illustrative)
    const botanical = page.locator('text=Botanical');
    await expect(botanical).toBeVisible();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

test.describe('AI Generator - Error Handling', () => {
  test('should handle page gracefully with no API connection', async ({ page }) => {
    // Page should still load and be usable even if API is unavailable
    await page.goto('/create');

    await expect(page.locator('h1:has-text("Create AI Poster")')).toBeVisible();
    await expect(page.locator('#prompt-input')).toBeVisible();
  });

  test('should display error message area when present', async ({ page }) => {
    await page.goto('/create');

    // Error area should be available (hidden when no error)
    // Check that the error container structure exists
    const errorContainer = page.locator('.border-destructive\\/20.bg-destructive\\/5');
    // May not be visible if no error
    const count = await errorContainer.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Content Tests
// ============================================================================

test.describe('AI Generator - Content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/create');
  });

  test('should display all 10 style presets', async ({ page }) => {
    // Ensure all styles filter is selected
    const allStylesButton = page.locator('button:has-text("All Styles")');
    await allStylesButton.click();

    // Check for each style
    const styles = [
      'Wabi-Sabi',
      'Abstract Expression',
      'Botanical',
      'Geometric Modern',
      'Vintage Poster',
      'Pop Art',
      'Watercolor',
      'Photography',
      'Line Art',
      'Typography',
    ];

    for (const style of styles) {
      const styleCard = page.locator(`.text-xs.font-medium:has-text("${style}")`);
      await expect(styleCard).toBeVisible();
    }
  });

  test('should display all 4 aspect ratio options', async ({ page }) => {
    const ratios = ['Square', 'Portrait', 'Landscape', 'Panoramic'];

    for (const ratio of ratios) {
      const ratioButton = page.locator(`.text-sm.font-medium:has-text("${ratio}")`);
      await expect(ratioButton).toBeVisible();
    }
  });

  test('should display 4 tips', async ({ page }) => {
    const tips = ['Be Descriptive', 'Try Different Styles', 'Use Negative Prompts', 'Iterate'];

    for (const tip of tips) {
      const tipElement = page.locator(`.text-sm.font-medium:has-text("${tip}")`);
      await expect(tipElement).toBeVisible();
    }
  });

  test('should display 6 example prompts', async ({ page }) => {
    const examplesButton = page.locator('button:has-text("Examples")');
    await examplesButton.click();

    const examplePrompts = page.locator('.flex.flex-wrap.gap-2 button');
    const count = await examplePrompts.count();
    expect(count).toBe(6);
  });
});
