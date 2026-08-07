/**
 * Shipping API Routes
 *
 * Provides public API endpoints for shipping options:
 * - GET /api/shipping/options - List active shipping options
 * - GET /api/shipping/options/:id - Get a single shipping option
 * - GET /api/shipping/estimate - Estimate shipping cost for cart
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";

import { db } from "../database";
import { shippingOptions, type ShippingOption } from "../database/schema/shipping";
import { optionalAuth, type OptionalAuthVariables } from "../middleware/auth";
import { getCached, setCached } from "../lib/redis";
import { getFreeShippingThreshold } from "../lib/shipping-config";
import { qualifiesForFreeShipping } from "@chobii/shared";

// ============================================================================
// Constants
// ============================================================================

const CACHE_TTL_SHIPPING_OPTIONS = 3600; // 1 hour
const SHIPPING_CACHE_PREFIX = "shipping:";

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for shipping cost estimation
 */
const estimateShippingSchema = z.object({
  cartTotal: z.coerce.number().min(0),
  zipCode: z.string().max(20).optional(),
});

// ============================================================================
// Route Handlers
// ============================================================================

const shippingApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth for potential future personalized shipping options
shippingApp.use("*", optionalAuth);

/**
 * GET /api/shipping/options - List active shipping options
 * Returns shipping options sorted by sortOrder, cached for 1 hour
 */
shippingApp.get("/options", async (c) => {
  const cacheKey = `${SHIPPING_CACHE_PREFIX}options:active`;

  // Try cache first
  const cached = await getCached<ShippingOption[]>(cacheKey);
  if (cached) {
    return c.json({
      options: cached,
      fromCache: true,
    });
  }

  try {
    // Get active shipping options sorted by sortOrder
    const options = await db
      .select({
        id: shippingOptions.id,
        name: shippingOptions.name,
        carrier: shippingOptions.carrier,
        description: shippingOptions.description,
        baseCost: shippingOptions.baseCost,
        estimatedDaysMin: shippingOptions.estimatedDaysMin,
        estimatedDaysMax: shippingOptions.estimatedDaysMax,
        sortOrder: shippingOptions.sortOrder,
      })
      .from(shippingOptions)
      .where(eq(shippingOptions.isActive, true))
      .orderBy(asc(shippingOptions.sortOrder), asc(shippingOptions.baseCost));

    // Cache the result
    await setCached(cacheKey, options, CACHE_TTL_SHIPPING_OPTIONS);

    return c.json({
      options,
      fromCache: false,
    });
  } catch (error) {
    console.error("Error fetching shipping options:", error);
    return c.json({ error: "Failed to fetch shipping options" }, 500);
  }
});

/**
 * GET /api/shipping/options/:id - Get a single shipping option
 */
shippingApp.get("/options/:id", async (c) => {
  const optionId = c.req.param("id");

  // Validate UUID format
  if (!optionId || !/^[0-9a-f-]{36}$/i.test(optionId)) {
    return c.json({ error: "Invalid shipping option ID" }, 400);
  }

  const cacheKey = `${SHIPPING_CACHE_PREFIX}option:${optionId}`;

  // Try cache first
  const cached = await getCached<ShippingOption>(cacheKey);
  if (cached) {
    // Only return if active
    if (cached.isActive) {
      return c.json({ option: cached, fromCache: true });
    }
    return c.json({ error: "Shipping option not found" }, 404);
  }

  try {
    const result = await db
      .select({
        id: shippingOptions.id,
        name: shippingOptions.name,
        carrier: shippingOptions.carrier,
        description: shippingOptions.description,
        baseCost: shippingOptions.baseCost,
        estimatedDaysMin: shippingOptions.estimatedDaysMin,
        estimatedDaysMax: shippingOptions.estimatedDaysMax,
        isActive: shippingOptions.isActive,
        sortOrder: shippingOptions.sortOrder,
      })
      .from(shippingOptions)
      .where(
        and(eq(shippingOptions.id, optionId), eq(shippingOptions.isActive, true))
      )
      .limit(1);

    if (!result.length) {
      return c.json({ error: "Shipping option not found" }, 404);
    }

    // Cache the result
    await setCached(cacheKey, result[0], CACHE_TTL_SHIPPING_OPTIONS);

    return c.json({
      option: result[0],
      fromCache: false,
    });
  } catch (error) {
    console.error("Error fetching shipping option:", error);
    return c.json({ error: "Failed to fetch shipping option" }, 500);
  }
});

/**
 * GET /api/shipping/config - The shipping money rules the storefront prints.
 *
 * The storefront says "Free shipping on orders over ₹999" on ten surfaces, and
 * since #569 that number is an admin setting rather than something the bundle
 * knows. This is where the client learns it: the root route calls this once per
 * document, before the first paint, and every surface renders what it returned.
 *
 * Deliberately unauthenticated and deliberately tiny. It is public copy, it is
 * read on every page load, and `getFreeShippingThreshold` already answers it
 * from Redis and never throws — a failed read returns the same constant the
 * storefront would have bundled, so the copy and the charge still agree.
 */
shippingApp.get("/config", async (c) => {
  const freeShippingThreshold = await getFreeShippingThreshold();
  return c.json({ freeShippingThreshold });
});

/**
 * GET /api/shipping/estimate - Estimate shipping cost for cart
 * Returns available shipping options with calculated costs
 */
shippingApp.get(
  "/estimate",
  zValidator("query", estimateShippingSchema),
  async (c) => {
    const { cartTotal, zipCode } = c.req.valid("query");

    try {
      // Read once per request, not once per option: it is the same figure for
      // every row, and it both decides `isFree` below and is reported to the
      // client as `freeShippingThreshold`. Those two must be the same number —
      // quoting one threshold while charging by another is the gap commit
      // 70bfa9dd closed, and it would fit inside a single response body.
      const freeShippingThreshold = await getFreeShippingThreshold();

      // Get active shipping options
      const options = await db
        .select({
          id: shippingOptions.id,
          name: shippingOptions.name,
          carrier: shippingOptions.carrier,
          description: shippingOptions.description,
          baseCost: shippingOptions.baseCost,
          estimatedDaysMin: shippingOptions.estimatedDaysMin,
          estimatedDaysMax: shippingOptions.estimatedDaysMax,
        })
        .from(shippingOptions)
        .where(eq(shippingOptions.isActive, true))
        .orderBy(asc(shippingOptions.sortOrder), asc(shippingOptions.baseCost));

      // Calculate costs for each option
      // For now, using simple base cost calculation
      // Future: could integrate with carrier APIs for real-time rates
      const estimates = options.map((option) => {
        const baseCostNum = parseFloat(option.baseCost);

        // Simple shipping calculation logic
        // Could be enhanced with weight-based, distance-based, or API-based calculations
        let calculatedCost = baseCostNum;

        // Free shipping over the one threshold every surface reads — now the
        // admin setting (`shipping_config`), falling back to the shared
        // constant. `cartTotal` is the caller's post-discount figure.
        if (
          qualifiesForFreeShipping(cartTotal, freeShippingThreshold) &&
          option.carrier !== "Express"
        ) {
          calculatedCost = 0;
        }

        // Calculate estimated delivery date range
        const today = new Date();
        const minDelivery = new Date(today);
        minDelivery.setDate(minDelivery.getDate() + option.estimatedDaysMin);
        const maxDelivery = new Date(today);
        maxDelivery.setDate(maxDelivery.getDate() + option.estimatedDaysMax);

        return {
          id: option.id,
          name: option.name,
          carrier: option.carrier,
          description: option.description,
          baseCost: option.baseCost,
          calculatedCost: calculatedCost.toFixed(2),
          isFree: calculatedCost === 0,
          estimatedDaysMin: option.estimatedDaysMin,
          estimatedDaysMax: option.estimatedDaysMax,
          estimatedDeliveryMin: minDelivery.toISOString().split("T")[0],
          estimatedDeliveryMax: maxDelivery.toISOString().split("T")[0],
        };
      });

      return c.json({
        cartTotal,
        zipCode: zipCode || null,
        freeShippingThreshold,
        options: estimates,
      });
    } catch (error) {
      console.error("Error estimating shipping:", error);
      return c.json({ error: "Failed to estimate shipping" }, 500);
    }
  }
);

// Export the router and schemas
export {
  shippingApp,
  estimateShippingSchema,
  SHIPPING_CACHE_PREFIX,
  CACHE_TTL_SHIPPING_OPTIONS,
};
export default shippingApp;
