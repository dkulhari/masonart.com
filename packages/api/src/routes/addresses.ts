/**
 * Addresses API Routes
 *
 * Provides CRUD endpoints for managing user saved addresses:
 * - GET /api/addresses - List user's saved addresses
 * - POST /api/addresses - Create a new address
 * - PATCH /api/addresses/:id - Update an address
 * - DELETE /api/addresses/:id - Delete an address
 * - PATCH /api/addresses/:id/default - Set address as default
 *
 * Requires authentication for all endpoints.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";

import { db } from "../database";
import { addresses, users } from "../database/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/auth";

// ============================================================================
// Validation Schemas
// ============================================================================

const createAddressSchema = z.object({
  type: z.enum(["shipping", "billing", "both"]).default("both"),
  fullName: z.string().min(2).max(100),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid phone number"),
  addressLine1: z.string().min(5).max(200),
  addressLine2: z.string().max(200).optional().nullable(),
  landmark: z.string().max(200).optional().nullable(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  postalCode: z.string().regex(/^\d{6}$/, "Postal code must be 6 digits"),
  countryCode: z.string().length(2).default("IN"),
  isDefault: z.boolean().default(false),
});

const updateAddressSchema = createAddressSchema.partial();

// ============================================================================
// Constants
// ============================================================================

const MAX_ADDRESSES_PER_USER = 10;

// ============================================================================
// Router
// ============================================================================

const addressesApp = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
addressesApp.use("*", requireAuth);

/**
 * GET /api/addresses
 * List all addresses for the authenticated user
 */
addressesApp.get("/", async (c) => {
  const user = c.get("user");

  try {
    const userAddresses = await db.query.addresses.findMany({
      where: eq(addresses.userId, user.id),
      orderBy: [desc(addresses.isDefault), desc(addresses.createdAt)],
    });

    return c.json({ addresses: userAddresses });
  } catch (error) {
    console.error("[Addresses] Error listing addresses:", error);
    return c.json(
      { error: "Failed to list addresses", code: "LIST_ERROR" },
      500
    );
  }
});

/**
 * POST /api/addresses
 * Create a new address for the authenticated user
 */
addressesApp.post(
  "/",
  zValidator("json", createAddressSchema),
  async (c) => {
    const user = c.get("user");
    const data = c.req.valid("json");

    try {
      // Check address limit
      const [result] = await db
        .select({ total: count() })
        .from(addresses)
        .where(eq(addresses.userId, user.id));

      if (result && result.total >= MAX_ADDRESSES_PER_USER) {
        return c.json(
          {
            error: `Maximum ${MAX_ADDRESSES_PER_USER} addresses allowed`,
            code: "LIMIT_EXCEEDED",
          },
          400
        );
      }

      const isFirstAddress = result?.total === 0;

      // If setting as default or first address, unset existing default
      if (data.isDefault || isFirstAddress) {
        await db
          .update(addresses)
          .set({ isDefault: false })
          .where(
            and(
              eq(addresses.userId, user.id),
              eq(addresses.isDefault, true)
            )
          );
      }

      const [created] = await db
        .insert(addresses)
        .values({
          userId: user.id,
          type: data.type,
          fullName: data.fullName,
          phone: data.phone,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2 ?? null,
          landmark: data.landmark ?? null,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          countryCode: data.countryCode,
          isDefault: data.isDefault || isFirstAddress,
        })
        .returning();

      // Update user's defaultAddressId if this is the default
      if (created && (data.isDefault || isFirstAddress)) {
        await db
          .update(users)
          .set({ defaultAddressId: created.id })
          .where(eq(users.id, user.id));
      }

      return c.json(
        { address: created, message: "Address created" },
        201
      );
    } catch (error) {
      console.error("[Addresses] Error creating address:", error);
      return c.json(
        { error: "Failed to create address", code: "CREATE_ERROR" },
        500
      );
    }
  }
);

/**
 * PATCH /api/addresses/:id
 * Update an existing address
 */
addressesApp.patch(
  "/:id",
  zValidator("json", updateAddressSchema),
  async (c) => {
    const user = c.get("user");
    const addressId = c.req.param("id");
    const data = c.req.valid("json");

    if (Object.keys(data).length === 0) {
      return c.json(
        { error: "No fields to update", code: "NO_UPDATES" },
        400
      );
    }

    try {
      // Verify ownership
      const existing = await db.query.addresses.findFirst({
        where: and(
          eq(addresses.id, addressId),
          eq(addresses.userId, user.id)
        ),
      });

      if (!existing) {
        return c.json(
          { error: "Address not found", code: "NOT_FOUND" },
          404
        );
      }

      const [updated] = await db
        .update(addresses)
        .set(data)
        .where(
          and(
            eq(addresses.id, addressId),
            eq(addresses.userId, user.id)
          )
        )
        .returning();

      return c.json({ address: updated, message: "Address updated" });
    } catch (error) {
      console.error("[Addresses] Error updating address:", error);
      return c.json(
        { error: "Failed to update address", code: "UPDATE_ERROR" },
        500
      );
    }
  }
);

/**
 * DELETE /api/addresses/:id
 * Delete an address
 */
addressesApp.delete("/:id", async (c) => {
  const user = c.get("user");
  const addressId = c.req.param("id");

  try {
    // Verify ownership
    const existing = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.id, addressId),
        eq(addresses.userId, user.id)
      ),
    });

    if (!existing) {
      return c.json(
        { error: "Address not found", code: "NOT_FOUND" },
        404
      );
    }

    await db
      .delete(addresses)
      .where(
        and(
          eq(addresses.id, addressId),
          eq(addresses.userId, user.id)
        )
      );

    // If deleted address was default, clear user's defaultAddressId
    // and promote the next most recent address
    if (existing.isDefault) {
      const nextDefault = await db.query.addresses.findFirst({
        where: eq(addresses.userId, user.id),
        orderBy: [desc(addresses.createdAt)],
      });

      if (nextDefault) {
        await db
          .update(addresses)
          .set({ isDefault: true })
          .where(eq(addresses.id, nextDefault.id));
        await db
          .update(users)
          .set({ defaultAddressId: nextDefault.id })
          .where(eq(users.id, user.id));
      } else {
        await db
          .update(users)
          .set({ defaultAddressId: null })
          .where(eq(users.id, user.id));
      }
    }

    return c.json({ message: "Address deleted" });
  } catch (error) {
    console.error("[Addresses] Error deleting address:", error);
    return c.json(
      { error: "Failed to delete address", code: "DELETE_ERROR" },
      500
    );
  }
});

/**
 * PATCH /api/addresses/:id/default
 * Set an address as the default
 */
addressesApp.patch("/:id/default", async (c) => {
  const user = c.get("user");
  const addressId = c.req.param("id");

  try {
    // Verify ownership
    const existing = await db.query.addresses.findFirst({
      where: and(
        eq(addresses.id, addressId),
        eq(addresses.userId, user.id)
      ),
    });

    if (!existing) {
      return c.json(
        { error: "Address not found", code: "NOT_FOUND" },
        404
      );
    }

    if (existing.isDefault) {
      return c.json({ address: existing, message: "Already the default address" });
    }

    // Unset previous default
    await db
      .update(addresses)
      .set({ isDefault: false })
      .where(
        and(
          eq(addresses.userId, user.id),
          eq(addresses.isDefault, true)
        )
      );

    // Set new default
    const [updated] = await db
      .update(addresses)
      .set({ isDefault: true })
      .where(eq(addresses.id, addressId))
      .returning();

    // Update user's defaultAddressId
    await db
      .update(users)
      .set({ defaultAddressId: addressId })
      .where(eq(users.id, user.id));

    return c.json({ address: updated, message: "Default address updated" });
  } catch (error) {
    console.error("[Addresses] Error setting default address:", error);
    return c.json(
      { error: "Failed to set default address", code: "DEFAULT_ERROR" },
      500
    );
  }
});

export { addressesApp };
