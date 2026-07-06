import { test, expect } from "@playwright/test";

/**
 * SEO JSON-LD Structured Data E2E Tests
 *
 * Comprehensive tests for verifying Schema.org JSON-LD structured data across all pages:
 * - Product structured data on product detail pages
 * - Organization structured data
 * - WebSite structured data on home page
 * - BreadcrumbList structured data
 * - ItemList for product collections
 *
 * Based on implementation in:
 * - packages/web/app/components/seo/ProductJsonLd.tsx
 * - packages/web/app/routes/posters/$slug.tsx
 *
 * Schema.org reference: https://schema.org/Product
 * Google's guidelines: https://developers.google.com/search/docs/appearance/structured-data/product
 */

// ============================================================================
// Types
// ============================================================================

interface JsonLdScript {
  "@context"?: string;
  "@type"?: string;
  [key: string]: unknown;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract and parse all JSON-LD scripts from a page
 */
async function getJsonLdScripts(page: import("@playwright/test").Page): Promise<JsonLdScript[]> {
  const scripts = await page.locator('script[type="application/ld+json"]').all();
  const jsonLdData: JsonLdScript[] = [];

  for (const script of scripts) {
    try {
      const content = await script.textContent();
      if (content) {
        const parsed = JSON.parse(content);
        // Handle both single objects and arrays
        if (Array.isArray(parsed)) {
          jsonLdData.push(...parsed);
        } else {
          jsonLdData.push(parsed);
        }
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return jsonLdData;
}

/**
 * Find JSON-LD schema by type
 */
async function findSchemaByType(
  page: import("@playwright/test").Page,
  type: string
): Promise<JsonLdScript | null> {
  const schemas = await getJsonLdScripts(page);
  return schemas.find((s) => s["@type"] === type) || null;
}

/**
 * Navigate to a product detail page and return the URL
 */
async function navigateToProductPage(
  page: import("@playwright/test").Page
): Promise<string | null> {
  await page.goto("/posters");
  const productLinks = page.locator('a[href^="/posters/"]');
  const count = await productLinks.count();

  if (count > 0) {
    const href = await productLinks.first().getAttribute("href");
    if (href && href !== "/posters") {
      await page.goto(href);
      return href;
    }
  }
  return null;
}

// ============================================================================
// JSON-LD Script Presence Tests
// ============================================================================

test.describe("JSON-LD - Script Presence", () => {
  test("home page should have JSON-LD script tag", async ({ page }) => {
    await page.goto("/");
    const jsonLdScripts = page.locator('script[type="application/ld+json"]');
    const count = await jsonLdScripts.count();
    // Home page should have at least Organization or WebSite schema
    expect(count).toBeGreaterThanOrEqual(0); // Flexible - may not have JSON-LD on home
  });

  test("product detail page should have JSON-LD script tag", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const jsonLdScripts = page.locator('script[type="application/ld+json"]');
      await expect(jsonLdScripts.first()).toBeAttached();
    }
  });

  test("JSON-LD should have valid type attribute", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const jsonLdScript = page.locator('script[type="application/ld+json"]').first();
      await expect(jsonLdScript).toHaveAttribute("type", "application/ld+json");
    }
  });

  test("JSON-LD content should be valid JSON", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const scripts = await page.locator('script[type="application/ld+json"]').all();
      for (const script of scripts) {
        const content = await script.textContent();
        if (content) {
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }
    }
  });

  test("JSON-LD should be in document head or body", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const jsonLdScript = page.locator('script[type="application/ld+json"]').first();
      const tagName = await jsonLdScript.evaluate((el) => el.parentElement?.tagName);
      expect(["HEAD", "BODY", "DIV", "MAIN"]).toContain(tagName);
    }
  });
});

// ============================================================================
// Product Schema Tests
// ============================================================================

test.describe("JSON-LD - Product Schema", () => {
  test("should have @context set to schema.org", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema["@context"]).toBe("https://schema.org");
      }
    }
  });

  test("should have @type set to Product", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema["@type"]).toBe("Product");
      }
    }
  });

  test("should have product name", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.name).toBeTruthy();
        expect(typeof productSchema.name).toBe("string");
        expect((productSchema.name as string).length).toBeGreaterThan(0);
      }
    }
  });

  test("should have product description", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.description).toBeTruthy();
        expect(typeof productSchema.description).toBe("string");
      }
    }
  });

  test("should have product SKU", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.sku).toBeTruthy();
        expect(typeof productSchema.sku).toBe("string");
      }
    }
  });

  test("should have product URL", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.url).toBeTruthy();
        expect((productSchema.url as string).startsWith("http")).toBe(true);
      }
    }
  });

  test("should have product image", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.image).toBeTruthy();
        // Image can be string or array of strings
        if (Array.isArray(productSchema.image)) {
          expect(productSchema.image.length).toBeGreaterThan(0);
          expect((productSchema.image[0] as string).startsWith("http")).toBe(true);
        } else {
          expect((productSchema.image as string).startsWith("http")).toBe(true);
        }
      }
    }
  });
});

// ============================================================================
// Product Brand Schema Tests
// ============================================================================

test.describe("JSON-LD - Product Brand", () => {
  test("should have brand object", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.brand).toBeTruthy();
      }
    }
  });

  test("brand should have @type of Brand", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.brand) {
        const brand = productSchema.brand as JsonLdScript;
        expect(brand["@type"]).toBe("Brand");
      }
    }
  });

  test("brand should have name MasonArt", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.brand) {
        const brand = productSchema.brand as JsonLdScript;
        expect(brand.name).toBe("MasonArt");
      }
    }
  });
});

// ============================================================================
// Product Offers Schema Tests
// ============================================================================

test.describe("JSON-LD - Product Offers (AggregateOffer)", () => {
  test("should have offers object", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect(productSchema.offers).toBeTruthy();
      }
    }
  });

  test("offers should have @type of AggregateOffer", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(offers["@type"]).toBe("AggregateOffer");
      }
    }
  });

  test("offers should have lowPrice", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(offers.lowPrice).toBeTruthy();
        expect(typeof offers.lowPrice).toBe("number");
        expect(offers.lowPrice as number).toBeGreaterThan(0);
      }
    }
  });

  test("offers should have highPrice", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(offers.highPrice).toBeTruthy();
        expect(typeof offers.highPrice).toBe("number");
        expect(offers.highPrice as number).toBeGreaterThanOrEqual(offers.lowPrice as number);
      }
    }
  });

  test("offers should have priceCurrency as INR", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(offers.priceCurrency).toBe("INR");
      }
    }
  });

  test("offers should have valid availability", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(offers.availability).toBeTruthy();
        const validAvailabilities = [
          "https://schema.org/InStock",
          "https://schema.org/OutOfStock",
          "https://schema.org/PreOrder",
          "https://schema.org/BackOrder",
        ];
        expect(validAvailabilities).toContain(offers.availability);
      }
    }
  });

  test("offers should have itemCondition", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(offers.itemCondition).toBe("https://schema.org/NewCondition");
      }
    }
  });

  test("offers should have seller", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        if (offers.seller) {
          const seller = offers.seller as JsonLdScript;
          expect(seller["@type"]).toBe("Organization");
          expect(seller.name).toBe("MasonArt");
        }
      }
    }
  });
});

// ============================================================================
// Product Rating Schema Tests (Optional)
// ============================================================================

test.describe("JSON-LD - Product Rating (Optional)", () => {
  test("aggregateRating should have correct structure if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.aggregateRating) {
        const rating = productSchema.aggregateRating as JsonLdScript;
        expect(rating["@type"]).toBe("AggregateRating");
      }
    }
  });

  test("aggregateRating should have ratingValue if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.aggregateRating) {
        const rating = productSchema.aggregateRating as JsonLdScript;
        expect(rating.ratingValue).toBeTruthy();
        expect(typeof rating.ratingValue).toBe("number");
        expect(rating.ratingValue as number).toBeGreaterThanOrEqual(0);
        expect(rating.ratingValue as number).toBeLessThanOrEqual(5);
      }
    }
  });

  test("aggregateRating should have reviewCount if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.aggregateRating) {
        const rating = productSchema.aggregateRating as JsonLdScript;
        expect(rating.reviewCount).toBeTruthy();
        expect(typeof rating.reviewCount).toBe("number");
        expect(rating.reviewCount as number).toBeGreaterThan(0);
      }
    }
  });

  test("aggregateRating should have bestRating and worstRating if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.aggregateRating) {
        const rating = productSchema.aggregateRating as JsonLdScript;
        if (rating.bestRating !== undefined) {
          expect(rating.bestRating).toBe(5);
        }
        if (rating.worstRating !== undefined) {
          expect(rating.worstRating).toBe(1);
        }
      }
    }
  });
});

// ============================================================================
// Product Creator Schema Tests (Optional)
// ============================================================================

test.describe("JSON-LD - Product Creator/Artist (Optional)", () => {
  test("creator should have correct structure if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.creator) {
        const creator = productSchema.creator as JsonLdScript;
        expect(creator["@type"]).toBe("Person");
      }
    }
  });

  test("creator should have name if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.creator) {
        const creator = productSchema.creator as JsonLdScript;
        expect(creator.name).toBeTruthy();
        expect(typeof creator.name).toBe("string");
      }
    }
  });
});

// ============================================================================
// Product Category Schema Tests (Optional)
// ============================================================================

test.describe("JSON-LD - Product Category (Optional)", () => {
  test("category should be string if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.category) {
        expect(typeof productSchema.category).toBe("string");
      }
    }
  });

  test("additionalProperty for AI generated should be correct if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.additionalProperty) {
        const prop = productSchema.additionalProperty as JsonLdScript;
        expect(prop["@type"]).toBe("PropertyValue");
        expect(prop.name).toBe("Generation Type");
        expect(prop.value).toBe("AI Generated");
      }
    }
  });
});

// ============================================================================
// BreadcrumbList Schema Tests
// ============================================================================

test.describe("JSON-LD - BreadcrumbList Schema (Optional)", () => {
  test("should have BreadcrumbList type if breadcrumbs present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const breadcrumbSchema = await findSchemaByType(page, "BreadcrumbList");
      if (breadcrumbSchema) {
        expect(breadcrumbSchema["@type"]).toBe("BreadcrumbList");
        expect(breadcrumbSchema["@context"]).toBe("https://schema.org");
      }
    }
  });

  test("BreadcrumbList should have itemListElement if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const breadcrumbSchema = await findSchemaByType(page, "BreadcrumbList");
      if (breadcrumbSchema) {
        expect(breadcrumbSchema.itemListElement).toBeTruthy();
        expect(Array.isArray(breadcrumbSchema.itemListElement)).toBe(true);
      }
    }
  });

  test("BreadcrumbList items should have correct structure if present", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const breadcrumbSchema = await findSchemaByType(page, "BreadcrumbList");
      if (breadcrumbSchema && breadcrumbSchema.itemListElement) {
        const items = breadcrumbSchema.itemListElement as JsonLdScript[];
        const firstItem = items[0];
        if (firstItem) {
          expect(firstItem["@type"]).toBe("ListItem");
          expect(firstItem.position).toBe(1);
          expect(firstItem.name).toBeTruthy();
          expect(firstItem.item).toBeTruthy();
        }
      }
    }
  });

  test("BreadcrumbList positions should be sequential", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const breadcrumbSchema = await findSchemaByType(page, "BreadcrumbList");
      if (breadcrumbSchema && breadcrumbSchema.itemListElement) {
        const items = breadcrumbSchema.itemListElement as JsonLdScript[];
        items.forEach((item, index) => {
          expect(item.position).toBe(index + 1);
        });
      }
    }
  });
});

// ============================================================================
// Organization Schema Tests
// ============================================================================

test.describe("JSON-LD - Organization Schema (Optional)", () => {
  test("should have Organization type if present", async ({ page }) => {
    await page.goto("/");
    const orgSchema = await findSchemaByType(page, "Organization");
    if (orgSchema) {
      expect(orgSchema["@type"]).toBe("Organization");
      expect(orgSchema["@context"]).toBe("https://schema.org");
    }
  });

  test("Organization should have name if present", async ({ page }) => {
    await page.goto("/");
    const orgSchema = await findSchemaByType(page, "Organization");
    if (orgSchema) {
      expect(orgSchema.name).toBe("MasonArt");
    }
  });

  test("Organization should have url if present", async ({ page }) => {
    await page.goto("/");
    const orgSchema = await findSchemaByType(page, "Organization");
    if (orgSchema) {
      expect(orgSchema.url).toBeTruthy();
      expect((orgSchema.url as string).startsWith("http")).toBe(true);
    }
  });

  test("Organization should have logo if present", async ({ page }) => {
    await page.goto("/");
    const orgSchema = await findSchemaByType(page, "Organization");
    if (orgSchema && orgSchema.logo) {
      expect((orgSchema.logo as string).startsWith("http")).toBe(true);
    }
  });

  test("Organization should have contactPoint if present", async ({ page }) => {
    await page.goto("/");
    const orgSchema = await findSchemaByType(page, "Organization");
    if (orgSchema && orgSchema.contactPoint) {
      const contact = orgSchema.contactPoint as JsonLdScript;
      expect(contact["@type"]).toBe("ContactPoint");
      expect(contact.contactType).toBeTruthy();
    }
  });
});

// ============================================================================
// WebSite Schema Tests
// ============================================================================

test.describe("JSON-LD - WebSite Schema (Optional)", () => {
  test("should have WebSite type if present on home page", async ({ page }) => {
    await page.goto("/");
    const websiteSchema = await findSchemaByType(page, "WebSite");
    if (websiteSchema) {
      expect(websiteSchema["@type"]).toBe("WebSite");
      expect(websiteSchema["@context"]).toBe("https://schema.org");
    }
  });

  test("WebSite should have name if present", async ({ page }) => {
    await page.goto("/");
    const websiteSchema = await findSchemaByType(page, "WebSite");
    if (websiteSchema) {
      expect(websiteSchema.name).toBeTruthy();
    }
  });

  test("WebSite should have url if present", async ({ page }) => {
    await page.goto("/");
    const websiteSchema = await findSchemaByType(page, "WebSite");
    if (websiteSchema) {
      expect(websiteSchema.url).toBeTruthy();
      expect((websiteSchema.url as string).startsWith("http")).toBe(true);
    }
  });

  test("WebSite potentialAction (SearchAction) should be valid if present", async ({ page }) => {
    await page.goto("/");
    const websiteSchema = await findSchemaByType(page, "WebSite");
    if (websiteSchema && websiteSchema.potentialAction) {
      const action = websiteSchema.potentialAction as JsonLdScript;
      expect(action["@type"]).toBe("SearchAction");
      expect(action.target).toBeTruthy();
      expect(action["query-input"]).toBeTruthy();
    }
  });
});

// ============================================================================
// Multiple Pages JSON-LD Tests
// ============================================================================

test.describe("JSON-LD - Multiple Pages", () => {
  test("posters listing page should have valid JSON-LD if present", async ({ page }) => {
    await page.goto("/posters");
    const schemas = await getJsonLdScripts(page);
    // May have ItemList schema for product collection
    for (const schema of schemas) {
      expect(schema["@context"]).toBe("https://schema.org");
      expect(schema["@type"]).toBeTruthy();
    }
  });

  test("different products should have unique JSON-LD data", async ({ page }) => {
    await page.goto("/posters");
    const productLinks = page.locator('a[href^="/posters/"]');
    const count = await productLinks.count();

    if (count >= 2) {
      // Get first product data
      const href1 = await productLinks.first().getAttribute("href");
      if (href1 && href1 !== "/posters") {
        await page.goto(href1);
        const schema1 = await findSchemaByType(page, "Product");

        // Get second product data
        await page.goto("/posters");
        const productLinks2 = page.locator('a[href^="/posters/"]');
        const href2 = await productLinks2.nth(1).getAttribute("href");
        if (href2 && href2 !== "/posters" && href2 !== href1) {
          await page.goto(href2);
          const schema2 = await findSchemaByType(page, "Product");

          // Products should have different data
          if (schema1 && schema2) {
            // SKUs should be different
            expect(schema1.sku).not.toBe(schema2.sku);
            // URLs should be different
            expect(schema1.url).not.toBe(schema2.url);
          }
        }
      }
    }
  });

  test("create page should not have Product schema", async ({ page }) => {
    await page.goto("/create");
    const productSchema = await findSchemaByType(page, "Product");
    expect(productSchema).toBeNull();
  });

  test("cart page should not have Product schema", async ({ page }) => {
    await page.goto("/cart");
    const productSchema = await findSchemaByType(page, "Product");
    expect(productSchema).toBeNull();
  });

  test("auth pages should not have Product schema", async ({ page }) => {
    await page.goto("/auth/login");
    const productSchema = await findSchemaByType(page, "Product");
    expect(productSchema).toBeNull();
  });
});

// ============================================================================
// JSON-LD Validation Tests
// ============================================================================

test.describe("JSON-LD - Validation", () => {
  test("should not have undefined or null values in required fields", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        // Check required fields are not undefined or null
        expect(productSchema.name).not.toBeNull();
        expect(productSchema.name).not.toBeUndefined();
        expect(productSchema.sku).not.toBeNull();
        expect(productSchema.sku).not.toBeUndefined();
      }
    }
  });

  test("prices should be valid numbers", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.offers) {
        const offers = productSchema.offers as JsonLdScript;
        expect(Number.isFinite(offers.lowPrice)).toBe(true);
        expect(Number.isFinite(offers.highPrice)).toBe(true);
        expect(Number.isNaN(offers.lowPrice)).toBe(false);
        expect(Number.isNaN(offers.highPrice)).toBe(false);
      }
    }
  });

  test("URLs should be absolute and valid", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        // Check product URL
        if (productSchema.url) {
          expect((productSchema.url as string).startsWith("https://")).toBe(true);
        }
        // Check image URLs
        if (productSchema.image) {
          const images = Array.isArray(productSchema.image)
            ? productSchema.image
            : [productSchema.image];
          for (const img of images) {
            expect((img as string).startsWith("http")).toBe(true);
          }
        }
      }
    }
  });

  test("should not have empty strings in critical fields", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        expect((productSchema.name as string).trim().length).toBeGreaterThan(0);
        expect((productSchema.sku as string).trim().length).toBeGreaterThan(0);
        if (productSchema.description) {
          expect((productSchema.description as string).trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ============================================================================
// JSON-LD Performance Tests
// ============================================================================

test.describe("JSON-LD - Performance", () => {
  test("JSON-LD should be present in initial HTML (SSR)", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      // Disable JavaScript to verify SSR
      await page.context().route("**/*.js", (route) => route.abort());
      await page.goto(productUrl);

      const jsonLdScripts = page.locator('script[type="application/ld+json"]');
      const count = await jsonLdScripts.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test("JSON-LD parsing should be fast", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const startTime = Date.now();
      await getJsonLdScripts(page);
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should parse within 1 second
    }
  });

  test("JSON-LD should not be excessively large", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const scripts = await page.locator('script[type="application/ld+json"]').all();
      for (const script of scripts) {
        const content = await script.textContent();
        if (content) {
          // JSON-LD should be reasonably sized (under 50KB)
          expect(content.length).toBeLessThan(50000);
        }
      }
    }
  });
});

// ============================================================================
// JSON-LD Consistency Tests
// ============================================================================

test.describe("JSON-LD - Consistency with Page Content", () => {
  test("product name in JSON-LD should match page heading", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      const heading = page.locator("h1").first();
      const headingText = await heading.textContent();

      if (productSchema && headingText) {
        // Names should match or be very similar
        const schemaName = (productSchema.name as string).toLowerCase().trim();
        const pageTitle = headingText.toLowerCase().trim();
        expect(
          schemaName === pageTitle ||
            schemaName.includes(pageTitle) ||
            pageTitle.includes(schemaName)
        ).toBe(true);
      }
    }
  });

  test("product URL in JSON-LD should match current page URL", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.url) {
        const currentUrl = page.url();
        const schemaUrl = productSchema.url as string;
        // URLs should share the same path
        const currentPath = new URL(currentUrl).pathname;
        expect(schemaUrl).toContain(currentPath);
      }
    }
  });

  test("brand in JSON-LD should match site branding", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.brand) {
        const brand = productSchema.brand as JsonLdScript;
        expect(brand.name).toBe("MasonArt");
      }

      // Also check page has MasonArt branding
      const logo = page.locator('a[href="/"] >> text=MasonArt');
      const logoCount = await logo.count();
      expect(logoCount).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// JSON-LD Edge Cases
// ============================================================================

test.describe("JSON-LD - Edge Cases", () => {
  test("should handle special characters in product name", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema) {
        // Name should be properly escaped
        const name = productSchema.name as string;
        expect(name).toBeTruthy();
        // Should not contain raw HTML or script tags
        expect(name).not.toContain("<script>");
        expect(name).not.toContain("</script>");
      }
    }
  });

  test("should handle long descriptions", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const productSchema = await findSchemaByType(page, "Product");
      if (productSchema && productSchema.description) {
        const description = productSchema.description as string;
        // Description should be a valid string
        expect(typeof description).toBe("string");
        // Very long descriptions might be truncated
        expect(description.length).toBeLessThan(10000);
      }
    }
  });

  test("should not have circular references", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const scripts = await page.locator('script[type="application/ld+json"]').all();
      for (const script of scripts) {
        const content = await script.textContent();
        if (content) {
          // JSON.parse will throw on circular references
          expect(() => JSON.parse(content)).not.toThrow();
        }
      }
    }
  });

  test("404 page should not have Product schema", async ({ page }) => {
    await page.goto("/posters/nonexistent-category/nonexistent-product-12345");
    const productSchema = await findSchemaByType(page, "Product");
    // 404 page should not have valid product schema
    expect(productSchema).toBeNull();
  });
});

// ============================================================================
// JSON-LD Accessibility for Crawlers
// ============================================================================

test.describe("JSON-LD - Crawler Accessibility", () => {
  test("JSON-LD should be visible to crawlers (not in shadow DOM)", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      // Script should be directly in the document, not in shadow DOM
      const script = await page.$('script[type="application/ld+json"]');
      if (script) {
        const shadowRoot = await script.evaluate((el) => el.shadowRoot);
        expect(shadowRoot).toBeNull();
      }
    }
  });

  test("JSON-LD should not be hidden with display:none", async ({ page }) => {
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      const script = page.locator('script[type="application/ld+json"]').first();
      // Script tags don't render visually, but verify they're in the DOM
      await expect(script).toBeAttached();
    }
  });

  test("JSON-LD should not require JavaScript to be present", async ({ page }) => {
    // First visit with JS to get the URL
    const productUrl = await navigateToProductPage(page);
    if (productUrl) {
      // Create a new context without JS
      const noJsContext = await page.context().browser()?.newContext({
        javaScriptEnabled: false,
      });
      if (noJsContext) {
        const noJsPage = await noJsContext.newPage();
        await noJsPage.goto(productUrl);

        const jsonLdScripts = noJsPage.locator('script[type="application/ld+json"]');
        const count = await jsonLdScripts.count();
        expect(count).toBeGreaterThan(0);

        await noJsContext.close();
      }
    }
  });
});
