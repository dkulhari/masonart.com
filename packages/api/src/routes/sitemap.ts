/**
 * Sitemap XML Generation Route
 *
 * Generates a sitemap.xml for SEO crawlers following the patterns from docs/poster-app-tech-stack.md
 * - GET /sitemap.xml - Generate sitemap XML
 *
 * Includes:
 * - Static pages (home, about, FAQ, contact, etc.)
 * - Product listing page
 * - Individual product pages
 * - AI gallery page
 */

import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";

import { db } from "../database";
import { products } from "../database/schema/products";
import { collections } from "../database/schema/collections";
import { getCached, setCached, CacheKeys } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const SITE_URL = process.env.SITE_URL || "https://chobii.art";
const CACHE_TTL_SITEMAP = 3600; // 1 hour
const CACHE_KEY_SITEMAP = `${CacheKeys.PRODUCT}sitemap`;

// ============================================================================
// Types
// ============================================================================

interface SitemapEntry {
  url: string;
  lastmod?: Date | string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

// ============================================================================
// Sitemap Generator Functions
// ============================================================================

/**
 * Escapes special XML characters in a string
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Formats a date to W3C datetime format (ISO 8601)
 */
function formatW3CDate(date: Date | string): string {
  if (typeof date === "string") {
    return new Date(date).toISOString();
  }
  return date.toISOString();
}

/**
 * Generates XML for a single sitemap entry
 */
function generateUrlEntry(entry: SitemapEntry): string {
  const lines: string[] = ["  <url>"];

  lines.push(`    <loc>${escapeXml(entry.url)}</loc>`);

  if (entry.lastmod) {
    lines.push(`    <lastmod>${formatW3CDate(entry.lastmod)}</lastmod>`);
  }

  if (entry.changefreq) {
    lines.push(`    <changefreq>${entry.changefreq}</changefreq>`);
  }

  if (entry.priority !== undefined) {
    lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
  }

  lines.push("  </url>");

  return lines.join("\n");
}

/**
 * Generates the complete sitemap XML document
 */
function generateSitemapXml(entries: SitemapEntry[]): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

  const footer = "</urlset>";

  const urlEntries = entries.map(generateUrlEntry).join("\n");

  return `${header}\n${urlEntries}\n${footer}`;
}

/**
 * Gets static pages for the sitemap
 */
function getStaticPages(): SitemapEntry[] {
  return [
    // Home page - highest priority
    { url: `${SITE_URL}/`, changefreq: "daily", priority: 1.0 },

    // Main catalog page
    { url: `${SITE_URL}/posters`, changefreq: "daily", priority: 0.9 },

    // AI generation page
    { url: `${SITE_URL}/create`, changefreq: "weekly", priority: 0.8 },

    // AI gallery page
    { url: `${SITE_URL}/gallery`, changefreq: "daily", priority: 0.7 },

    /**
     * Site-wide reviews. Above the informational pages because its content is
     * customer-written and grows with the catalogue, and `daily` for the same
     * reason — a static-page cadence would leave new reviews uncrawled.
     */
    { url: `${SITE_URL}/reviews`, changefreq: "daily", priority: 0.6 },

    // Static informational pages
    { url: `${SITE_URL}/about`, changefreq: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/faq`, changefreq: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, changefreq: "monthly", priority: 0.5 },
  ];
}

// ============================================================================
// Route Handler
// ============================================================================

const sitemapApp = new Hono();

/**
 * GET /sitemap.xml - Generate and return the sitemap
 */
sitemapApp.get("/", async (c) => {
  // Try to get from cache first
  const cached = await getCached<string>(CACHE_KEY_SITEMAP);
  if (cached) {
    return c.text(cached, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-Cached": "true",
    });
  }

  try {
    // Get all active products with their slugs and update dates
    const productList = await db
      .select({
        slug: products.slug,
        updatedAt: products.updatedAt,
        styles: products.styles,
      })
      .from(products)
      .where(eq(products.status, "active"))
      .orderBy(desc(products.updatedAt));

    /**
     * Active collections.
     *
     * A separate query rather than a join: the entries have different shapes
     * and priorities, and joining would tie a collection's presence to its
     * products' — an inactive collection would drag its products out of the
     * sitemap with it.
     *
     * `isActive` is the whole filter. An inactive collection 404s, and a
     * sitemap entry pointing at a 404 is worse than no entry: search engines
     * read it as a quality signal about the site, not about the one URL.
     */
    const collectionList = await db
      .select({
        slug: collections.slug,
        updatedAt: collections.updatedAt,
      })
      .from(collections)
      .where(eq(collections.isActive, true))
      .orderBy(desc(collections.updatedAt));

    // Build sitemap entries
    const entries: SitemapEntry[] = [
      // Static pages first
      ...getStaticPages(),

      /**
       * Collection pages. Above products in priority but below /posters —
       * they are curated entry points into the catalogue, not the catalogue
       * itself.
       */
      ...collectionList.map((collection) => ({
        url: `${SITE_URL}/collections/${collection.slug}`,
        lastmod: collection.updatedAt,
        changefreq: "weekly" as const,
        priority: 0.85,
      })),

      // Product pages
      ...productList.map((product) => {
        // Use the first style as category, or 'all' if no styles
        const category = product.styles?.[0]?.toLowerCase().replace(/\s+/g, "-") || "all";

        return {
          url: `${SITE_URL}/posters/${category}/${product.slug}`,
          lastmod: product.updatedAt,
          changefreq: "weekly" as const,
          priority: 0.8,
        };
      }),
    ];

    // Generate XML
    const sitemapXml = generateSitemapXml(entries);

    // Cache the sitemap
    await setCached(CACHE_KEY_SITEMAP, sitemapXml, CACHE_TTL_SITEMAP);

    return c.text(sitemapXml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    });
  } catch (error) {
    // Log error but return a minimal sitemap with static pages only
    const fallbackEntries = getStaticPages();
    const fallbackXml = generateSitemapXml(fallbackEntries);

    return c.text(fallbackXml, 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300", // Shorter cache on error
      "X-Sitemap-Error": "true",
    });
  }
});

// Export the router
export { sitemapApp };
export default sitemapApp;
