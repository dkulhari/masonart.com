/**
 * Admin Shipping API Routes
 *
 * Provides admin API endpoints for shipping option management:
 * - GET /api/admin/shipping/options - List all shipping options (including inactive)
 * - POST /api/admin/shipping/options - Create a new shipping option
 * - PATCH /api/admin/shipping/options/:id - Update a shipping option
 * - DELETE /api/admin/shipping/options/:id - Soft delete (deactivate) a shipping option
 *
 * All endpoints require admin authentication.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, asc, desc, sql } from "drizzle-orm";

import { db } from "../../database";
import { shippingOptions } from "../../database/schema/shipping";
import {
  requireAuth,
  requireAdmin,
  type AuthVariables,
} from "../../middleware/auth";
import { deleteCached } from "../../lib/redis";
import { SHIPPING_CACHE_PREFIX } from "../shipping";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Query parameters for listing shipping options
 */
const listShippingOptionsSchema = z.object({
  includeInactive: z.coerce.boolean().default(true),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.enum(["name", "carrier", "baseCost", "sortOrder", "createdAt"]).default("sortOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

/**
 * Schema for creating a new shipping option
 */
const createShippingOptionSchema = z.object({
  name: z.string().min(1).max(100),
  carrier: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  baseCost: z.number().min(0),
  estimatedDaysMin: z.number().int().positive(),
  estimatedDaysMax: z.number().int().positive(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
}).refine((data) => data.estimatedDaysMax >= data.estimatedDaysMin, {
  message: "estimatedDaysMax must be greater than or equal to estimatedDaysMin",
  path: ["estimatedDaysMax"],
});

/**
 * Schema for updating a shipping option
 */
const updateShippingOptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  carrier: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  baseCost: z.number().min(0).optional(),
  estimatedDaysMin: z.number().int().positive().optional(),
  estimatedDaysMax: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminShippingApp = new Hono<{ Variables: AuthVariables }>();

// Apply authentication and admin role requirement to all routes
adminShippingApp.use("*", requireAuth);
adminShippingApp.use("*", requireAdmin);

// ============================================================================
// GET /api/admin/shipping/options - List All Shipping Options
// ============================================================================

adminShippingApp.get(
  "/options",
  zValidator("query", listShippingOptionsSchema),
  async (c) => {
    const { includeInactive, page, pageSize, sortBy, sortOrder: order } = c.req.valid("query");

    try {
      // Build sort order
      const orderFn = order === "asc" ? asc : desc;
      const orderByColumn = {
        name: shippingOptions.name,
        carrier: shippingOptions.carrier,
        baseCost: shippingOptions.baseCost,
        sortOrder: shippingOptions.sortOrder,
        createdAt: shippingOptions.createdAt,
      }[sortBy];

      const offset = (page - 1) * pageSize;

      // Build where condition
      const whereCondition = includeInactive
        ? undefined
        : eq(shippingOptions.isActive, true);

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(shippingOptions)
        .where(whereCondition);

      const total = countResult[0]?.count ?? 0;

      // Get shipping options
      const options = await db
        .select()
        .from(shippingOptions)
        .where(whereCondition)
        .orderBy(orderFn(orderByColumn))
        .limit(pageSize)
        .offset(offset);

      return c.json({
        items: options,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      console.error("Error fetching admin shipping options:", error);
      return c.json({ error: "Failed to fetch shipping options" }, 500);
    }
  }
);

// ============================================================================
// POST /api/admin/shipping/options - Create Shipping Option
// ============================================================================

adminShippingApp.post(
  "/options",
  zValidator("json", createShippingOptionSchema),
  async (c) => {
    const data = c.req.valid("json");

    try {
      // Create the shipping option
      const [newOption] = await db
        .insert(shippingOptions)
        .values({
          name: data.name,
          carrier: data.carrier,
          description: data.description,
          baseCost: data.baseCost.toFixed(2),
          estimatedDaysMin: data.estimatedDaysMin,
          estimatedDaysMax: data.estimatedDaysMax,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        })
        .returning();

      // Invalidate cache
      await deleteCached(`${SHIPPING_CACHE_PREFIX}options:*`);

      return c.json(
        {
          message: "Shipping option created successfully",
          option: newOption,
        },
        201
      );
    } catch (error) {
      console.error("Error creating shipping option:", error);
      return c.json({ error: "Failed to create shipping option" }, 500);
    }
  }
);

// ============================================================================
// GET /api/admin/shipping/options/:id - Get Single Shipping Option
// ============================================================================

adminShippingApp.get("/options/:id", async (c) => {
  const optionId = c.req.param("id");

  // Validate UUID format
  if (!optionId || !/^[0-9a-f-]{36}$/i.test(optionId)) {
    return c.json({ error: "Invalid shipping option ID" }, 400);
  }

  try {
    const result = await db
      .select()
      .from(shippingOptions)
      .where(eq(shippingOptions.id, optionId))
      .limit(1);

    if (!result.length) {
      return c.json({ error: "Shipping option not found" }, 404);
    }

    return c.json({ option: result[0] });
  } catch (error) {
    console.error("Error fetching shipping option:", error);
    return c.json({ error: "Failed to fetch shipping option" }, 500);
  }
});

// ============================================================================
// PATCH /api/admin/shipping/options/:id - Update Shipping Option
// ============================================================================

adminShippingApp.patch(
  "/options/:id",
  zValidator("json", updateShippingOptionSchema),
  async (c) => {
    const optionId = c.req.param("id");
    const updates = c.req.valid("json");

    // Validate UUID format
    if (!optionId || !/^[0-9a-f-]{36}$/i.test(optionId)) {
      return c.json({ error: "Invalid shipping option ID" }, 400);
    }

    // Must provide at least one field to update
    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    try {
      // Check if shipping option exists
      const existing = await db
        .select({ id: shippingOptions.id })
        .from(shippingOptions)
        .where(eq(shippingOptions.id, optionId))
        .limit(1);

      if (!existing.length) {
        return c.json({ error: "Shipping option not found" }, 404);
      }

      // Build update object
      const updateData: Record<string, unknown> = {};
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.carrier !== undefined) updateData.carrier = updates.carrier;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.baseCost !== undefined) updateData.baseCost = updates.baseCost.toFixed(2);
      if (updates.estimatedDaysMin !== undefined) updateData.estimatedDaysMin = updates.estimatedDaysMin;
      if (updates.estimatedDaysMax !== undefined) updateData.estimatedDaysMax = updates.estimatedDaysMax;
      if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;
      if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

      // Update the shipping option
      const [updatedOption] = await db
        .update(shippingOptions)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(shippingOptions.id, optionId))
        .returning();

      // Invalidate cache
      await deleteCached(`${SHIPPING_CACHE_PREFIX}options:*`);
      await deleteCached(`${SHIPPING_CACHE_PREFIX}option:${optionId}`);

      return c.json({
        message: "Shipping option updated successfully",
        option: updatedOption,
      });
    } catch (error) {
      console.error("Error updating shipping option:", error);
      return c.json({ error: "Failed to update shipping option" }, 500);
    }
  }
);

// ============================================================================
// DELETE /api/admin/shipping/options/:id - Soft Delete Shipping Option
// ============================================================================

adminShippingApp.delete("/options/:id", async (c) => {
  const optionId = c.req.param("id");

  // Validate UUID format
  if (!optionId || !/^[0-9a-f-]{36}$/i.test(optionId)) {
    return c.json({ error: "Invalid shipping option ID" }, 400);
  }

  try {
    // Check if shipping option exists
    const existing = await db
      .select({ id: shippingOptions.id, isActive: shippingOptions.isActive })
      .from(shippingOptions)
      .where(eq(shippingOptions.id, optionId))
      .limit(1);

    if (!existing.length) {
      return c.json({ error: "Shipping option not found" }, 404);
    }

    if (!existing[0]?.isActive) {
      return c.json({ error: "Shipping option is already deactivated" }, 400);
    }

    // Soft delete by setting isActive to false
    const [deactivatedOption] = await db
      .update(shippingOptions)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(shippingOptions.id, optionId))
      .returning();

    // Invalidate cache
    await deleteCached(`${SHIPPING_CACHE_PREFIX}options:*`);
    await deleteCached(`${SHIPPING_CACHE_PREFIX}option:${optionId}`);

    return c.json({
      message: "Shipping option deactivated successfully",
      option: deactivatedOption,
    });
  } catch (error) {
    console.error("Error deactivating shipping option:", error);
    return c.json({ error: "Failed to deactivate shipping option" }, 500);
  }
});

// Export the router and schemas
export {
  adminShippingApp,
  listShippingOptionsSchema,
  createShippingOptionSchema,
  updateShippingOptionSchema,
};
export default adminShippingApp;
