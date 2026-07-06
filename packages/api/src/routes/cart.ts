/**
 * Cart API Routes
 *
 * Provides API endpoints for shopping cart management:
 * - GET /api/cart - Get current cart with items
 * - POST /api/cart/items - Add item to cart
 * - PATCH /api/cart/items/:id - Update cart item (quantity)
 * - DELETE /api/cart/items/:id - Remove item from cart
 * - DELETE /api/cart - Clear entire cart
 * - POST /api/cart/merge - Merge guest cart into user cart (after login)
 *
 * Supports both authenticated users and guest sessions.
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { getCookie, setCookie } from "hono/cookie";

import { db } from "../database";
import {
  carts,
  cartItems,
  type CartItemCustomizations,
  type CartItemAIDetails,
} from "../database/schema/cart";
import { products, productVariants, frames } from "../database/schema/products";
import { aiGenerations } from "../database/schema/ai-generations";
import { optionalAuth, type OptionalAuthVariables } from "../middleware/auth";
import { getCached, setCached, deleteCached, CacheKeys } from "../lib/redis";

// ============================================================================
// Constants
// ============================================================================

const GUEST_CART_COOKIE = "cart_session";
const GUEST_CART_EXPIRY_DAYS = 30;
const CACHE_TTL_CART = 300; // 5 minutes

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for adding an item to cart
 */
const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid(),
  frameId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive().max(99).default(1),
  customizations: z
    .object({
      matWidth: z.number().nonnegative().optional(),
      matColor: z.string().optional(),
      mountingStyle: z.string().optional(),
      glazingType: z.string().optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  // For AI-generated posters
  isAiGenerated: z.boolean().optional().default(false),
  aiGenerationId: z.string().uuid().optional(),
  aiDetails: z
    .object({
      generationId: z.string(),
      prompt: z.string(),
      stylePreset: z.string().optional(),
      thumbnailUrl: z.string().url().optional(),
    })
    .optional(),
});

/**
 * Schema for updating a cart item
 */
const updateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(99).optional(),
  frameId: z.string().uuid().optional().nullable(),
  customizations: z
    .object({
      matWidth: z.number().nonnegative().optional(),
      matColor: z.string().optional(),
      mountingStyle: z.string().optional(),
      glazingType: z.string().optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  isSavedForLater: z.boolean().optional(),
});

/**
 * Schema for merging guest cart
 */
const mergeCartSchema = z.object({
  guestSessionId: z.string().min(1),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique guest session ID
 */
function generateSessionId(): string {
  return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get or create cart for user/guest
 */
async function getOrCreateCart(
  userId: string | null,
  sessionId: string | null
): Promise<typeof carts.$inferSelect> {
  // Try to find existing cart
  let cart = null;

  if (userId) {
    // Look for user's active cart
    const userCarts = await db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.isActive, true)))
      .limit(1);
    cart = userCarts[0];
  } else if (sessionId) {
    // Look for guest cart
    const guestCarts = await db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.isActive, true)))
      .limit(1);
    cart = guestCarts[0];
  }

  // Create new cart if none exists
  if (!cart) {
    const expiresAt = userId
      ? null
      : new Date(Date.now() + GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const newCarts = await db
      .insert(carts)
      .values({
        userId: userId || null,
        sessionId: userId ? null : sessionId,
        isActive: true,
        expiresAt,
      })
      .returning();

    cart = newCarts[0];
  }

  return cart!;
}

/**
 * Calculate and update cart totals
 */
async function updateCartTotals(cartId: string): Promise<void> {
  // Calculate totals from cart items (excluding saved for later)
  const result = await db
    .select({
      itemCount: sql<number>`COALESCE(SUM(${cartItems.quantity})::int, 0)`,
      subtotal: sql<string>`COALESCE(SUM(${cartItems.lineTotal}::numeric), 0)::text`,
    })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.isSavedForLater, false)));

  const totals = result[0];

  // Update cart with new totals
  await db
    .update(carts)
    .set({
      itemCount: totals?.itemCount ?? 0,
      subtotal: totals?.subtotal ?? "0.00",
      lastActivityAt: new Date(),
    })
    .where(eq(carts.id, cartId));

  // Invalidate cart cache
  await deleteCached(`${CacheKeys.CART}${cartId}`);
}

/**
 * Calculate line total for a cart item
 */
function calculateLineTotal(unitPrice: string, framePrice: string, quantity: number): string {
  const unit = parseFloat(unitPrice) || 0;
  const frame = parseFloat(framePrice) || 0;
  return ((unit + frame) * quantity).toFixed(2);
}

/**
 * Get cart with items and related data
 */
async function getCartWithItems(cartId: string) {
  // Get cart with items using relations
  const cart = await db.query.carts.findFirst({
    where: eq(carts.id, cartId),
    with: {
      items: {
        with: {
          product: {
            columns: {
              id: true,
              sku: true,
              title: true,
              slug: true,
              images: true,
              status: true,
            },
          },
          variant: {
            columns: {
              id: true,
              sizeLabel: true,
              widthInches: true,
              heightInches: true,
              price: true,
              isInStock: true,
              stockQuantity: true,
            },
          },
          frame: {
            columns: {
              id: true,
              name: true,
              type: true,
              priceModifier: true,
              priceAddition: true,
              thumbnailUrl: true,
            },
          },
        },
      },
    },
  });

  return cart;
}

// ============================================================================
// Route Handler
// ============================================================================

const cartApp = new Hono<{ Variables: OptionalAuthVariables }>();

// Apply optional auth to all routes
cartApp.use("*", optionalAuth);

// ============================================================================
// GET /api/cart - Get Cart
// ============================================================================

cartApp.get("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id || null;

  // Get or create guest session ID
  let sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
  if (!userId && !sessionId) {
    sessionId = generateSessionId();
    setCookie(c, GUEST_CART_COOKIE, sessionId, {
      maxAge: GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
    });
  }

  try {
    const cart = await getOrCreateCart(userId, sessionId);

    // Check cache
    const cacheKey = `${CacheKeys.CART}${cart.id}`;
    const cached = await getCached<object>(cacheKey);
    if (cached) {
      return c.json({ ...cached, fromCache: true });
    }

    // Get cart with items
    const cartWithItems = await getCartWithItems(cart.id);

    if (!cartWithItems) {
      return c.json({ error: "Cart not found" }, 404);
    }

    // Separate active items and saved for later
    const activeItems = cartWithItems.items.filter((i) => !i.isSavedForLater);
    const savedItems = cartWithItems.items.filter((i) => i.isSavedForLater);

    const result = {
      id: cartWithItems.id,
      userId: cartWithItems.userId,
      itemCount: cartWithItems.itemCount,
      subtotal: cartWithItems.subtotal,
      couponCode: cartWithItems.couponCode,
      couponDiscount: cartWithItems.couponDiscount,
      currency: cartWithItems.currency,
      items: activeItems,
      savedForLater: savedItems,
      createdAt: cartWithItems.createdAt,
      updatedAt: cartWithItems.updatedAt,
    };

    // Cache the result
    await setCached(cacheKey, result, CACHE_TTL_CART);

    return c.json(result);
  } catch (error) {
    console.error("Error fetching cart:", error);
    return c.json({ error: "Failed to fetch cart" }, 500);
  }
});

// ============================================================================
// POST /api/cart/items - Add Item to Cart
// ============================================================================

cartApp.post("/items", zValidator("json", addCartItemSchema), async (c) => {
  const user = c.get("user");
  const userId = user?.id || null;
  const input = c.req.valid("json");

  // Get or create guest session ID
  let sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
  if (!userId && !sessionId) {
    sessionId = generateSessionId();
    setCookie(c, GUEST_CART_COOKIE, sessionId, {
      maxAge: GUEST_CART_EXPIRY_DAYS * 24 * 60 * 60,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      path: "/",
    });
  }

  try {
    // Validate product exists and is active
    const product = await db
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);

    if (!product[0] || product[0].status !== "active") {
      return c.json({ error: "Product not found or unavailable" }, 404);
    }

    // Validate variant exists and belongs to product
    const variant = await db
      .select({
        id: productVariants.id,
        price: productVariants.price,
        isInStock: productVariants.isInStock,
        stockQuantity: productVariants.stockQuantity,
      })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, input.variantId),
          eq(productVariants.productId, input.productId),
          eq(productVariants.isActive, true)
        )
      )
      .limit(1);

    if (!variant[0]) {
      return c.json({ error: "Product variant not found" }, 404);
    }

    // Check stock availability
    if (!variant[0].isInStock) {
      return c.json({ error: "Product variant is out of stock" }, 400);
    }

    // Validate frame if provided
    let framePrice = "0.00";
    if (input.frameId) {
      const frame = await db
        .select({
          id: frames.id,
          priceAddition: frames.priceAddition,
          isActive: frames.isActive,
        })
        .from(frames)
        .where(eq(frames.id, input.frameId))
        .limit(1);

      if (!frame[0] || !frame[0].isActive) {
        return c.json({ error: "Frame not found or unavailable" }, 404);
      }

      framePrice = frame[0].priceAddition || "0.00";
    }

    // Check AI generation moderation status if adding AI-generated content
    if (input.aiGenerationId) {
      const generation = await db
        .select({
          id: aiGenerations.id,
          moderationStatus: aiGenerations.moderationStatus,
        })
        .from(aiGenerations)
        .where(eq(aiGenerations.id, input.aiGenerationId))
        .limit(1);

      if (!generation[0]) {
        return c.json({ error: "AI generation not found" }, 404);
      }

      if (generation[0].moderationStatus !== "approved") {
        return c.json(
          {
            error: "This AI creation is pending review and cannot be added to cart yet",
            moderationStatus: generation[0].moderationStatus,
          },
          403
        );
      }
    }

    // Get or create cart
    const cart = await getOrCreateCart(userId, sessionId);

    // Check if same item already exists in cart (same product + variant + frame)
    const existingItems = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.productId, input.productId),
          eq(cartItems.variantId, input.variantId),
          input.frameId ? eq(cartItems.frameId, input.frameId) : sql`${cartItems.frameId} IS NULL`,
          eq(cartItems.isSavedForLater, false)
        )
      )
      .limit(1);

    let cartItem;

    if (existingItems[0]) {
      // Update quantity of existing item
      const newQuantity = existingItems[0].quantity + input.quantity;
      const lineTotal = calculateLineTotal(variant[0].price, framePrice, newQuantity);

      const updated = await db
        .update(cartItems)
        .set({
          quantity: newQuantity,
          lineTotal,
          customizations: (input.customizations as CartItemCustomizations) || null,
        })
        .where(eq(cartItems.id, existingItems[0].id))
        .returning();

      cartItem = updated[0];
    } else {
      // Create new cart item
      const lineTotal = calculateLineTotal(variant[0].price, framePrice, input.quantity);

      const inserted = await db
        .insert(cartItems)
        .values({
          cartId: cart.id,
          productId: input.productId,
          variantId: input.variantId,
          frameId: input.frameId || null,
          quantity: input.quantity,
          unitPrice: variant[0].price,
          framePrice,
          lineTotal,
          isAiGenerated: input.isAiGenerated,
          aiGenerationId: input.aiGenerationId || null,
          aiDetails: (input.aiDetails as CartItemAIDetails) || null,
          customizations: (input.customizations as CartItemCustomizations) || null,
        })
        .returning();

      cartItem = inserted[0];
    }

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json(
      {
        message: "Item added to cart",
        item: cartItem,
      },
      201
    );
  } catch (error) {
    console.error("Error adding item to cart:", error);
    return c.json({ error: "Failed to add item to cart" }, 500);
  }
});

// ============================================================================
// PATCH /api/cart/items/:id - Update Cart Item
// ============================================================================

cartApp.patch("/items/:id", zValidator("json", updateCartItemSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const userId = user?.id || null;
  const sessionId = getCookie(c, GUEST_CART_COOKIE) || null;
  const input = c.req.valid("json");

  // Validate UUID format
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return c.json({ error: "Invalid item ID format" }, 400);
  }

  try {
    // Get the cart item with cart info
    const items = await db
      .select({
        cartItem: cartItems,
        cart: carts,
      })
      .from(cartItems)
      .innerJoin(carts, eq(cartItems.cartId, carts.id))
      .where(eq(cartItems.id, id))
      .limit(1);

    if (!items[0]) {
      return c.json({ error: "Cart item not found" }, 404);
    }

    const { cartItem, cart } = items[0];

    // Verify cart ownership
    const isOwner = userId ? cart.userId === userId : cart.sessionId === sessionId;

    if (!isOwner) {
      return c.json({ error: "Cart item not found" }, 404);
    }

    // Build update object
    const updates: Partial<typeof cartItems.$inferInsert> = {};

    if (input.quantity !== undefined) {
      updates.quantity = input.quantity;
    }

    if (input.isSavedForLater !== undefined) {
      updates.isSavedForLater = input.isSavedForLater;
    }

    if (input.customizations !== undefined) {
      updates.customizations = input.customizations as CartItemCustomizations;
    }

    // Handle frame update
    let newFramePrice = cartItem.framePrice;
    if (input.frameId !== undefined) {
      if (input.frameId === null) {
        updates.frameId = null;
        newFramePrice = "0.00";
      } else {
        // Validate new frame
        const frame = await db
          .select({
            id: frames.id,
            priceAddition: frames.priceAddition,
            isActive: frames.isActive,
          })
          .from(frames)
          .where(eq(frames.id, input.frameId))
          .limit(1);

        if (!frame[0] || !frame[0].isActive) {
          return c.json({ error: "Frame not found or unavailable" }, 404);
        }

        updates.frameId = input.frameId;
        newFramePrice = frame[0].priceAddition || "0.00";
      }
      updates.framePrice = newFramePrice;
    }

    // Recalculate line total if quantity or frame changed
    if (input.quantity !== undefined || input.frameId !== undefined) {
      const quantity = input.quantity ?? cartItem.quantity;
      updates.lineTotal = calculateLineTotal(cartItem.unitPrice, newFramePrice, quantity);
    }

    // Update the cart item
    const updated = await db.update(cartItems).set(updates).where(eq(cartItems.id, id)).returning();

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json({
      message: "Cart item updated",
      item: updated[0],
    });
  } catch (error) {
    console.error("Error updating cart item:", error);
    return c.json({ error: "Failed to update cart item" }, 500);
  }
});

// ============================================================================
// DELETE /api/cart/items/:id - Remove Cart Item
// ============================================================================

cartApp.delete("/items/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const userId = user?.id || null;
  const sessionId = getCookie(c, GUEST_CART_COOKIE) || null;

  // Validate UUID format
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return c.json({ error: "Invalid item ID format" }, 400);
  }

  try {
    // Get the cart item with cart info
    const items = await db
      .select({
        cartItem: cartItems,
        cart: carts,
      })
      .from(cartItems)
      .innerJoin(carts, eq(cartItems.cartId, carts.id))
      .where(eq(cartItems.id, id))
      .limit(1);

    if (!items[0]) {
      return c.json({ error: "Cart item not found" }, 404);
    }

    const { cart } = items[0];

    // Verify cart ownership
    const isOwner = userId ? cart.userId === userId : cart.sessionId === sessionId;

    if (!isOwner) {
      return c.json({ error: "Cart item not found" }, 404);
    }

    // Delete the cart item
    await db.delete(cartItems).where(eq(cartItems.id, id));

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json({
      message: "Cart item removed",
    });
  } catch (error) {
    console.error("Error removing cart item:", error);
    return c.json({ error: "Failed to remove cart item" }, 500);
  }
});

// ============================================================================
// DELETE /api/cart - Clear Cart
// ============================================================================

cartApp.delete("/", async (c) => {
  const user = c.get("user");
  const userId = user?.id || null;
  const sessionId = getCookie(c, GUEST_CART_COOKIE) || null;

  if (!userId && !sessionId) {
    return c.json({ error: "No cart found" }, 404);
  }

  try {
    // Find the active cart
    let cart = null;

    if (userId) {
      const userCarts = await db
        .select()
        .from(carts)
        .where(and(eq(carts.userId, userId), eq(carts.isActive, true)))
        .limit(1);
      cart = userCarts[0];
    } else if (sessionId) {
      const guestCarts = await db
        .select()
        .from(carts)
        .where(and(eq(carts.sessionId, sessionId), eq(carts.isActive, true)))
        .limit(1);
      cart = guestCarts[0];
    }

    if (!cart) {
      return c.json({ error: "No cart found" }, 404);
    }

    // Delete all cart items (not saved for later)
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.isSavedForLater, false)));

    // Update cart totals
    await updateCartTotals(cart.id);

    return c.json({
      message: "Cart cleared",
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return c.json({ error: "Failed to clear cart" }, 500);
  }
});

// ============================================================================
// POST /api/cart/merge - Merge Guest Cart into User Cart
// ============================================================================

cartApp.post("/merge", zValidator("json", mergeCartSchema), async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const { guestSessionId } = c.req.valid("json");

  try {
    // Find guest cart
    const guestCarts = await db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, guestSessionId), eq(carts.isActive, true)))
      .limit(1);

    if (!guestCarts[0]) {
      return c.json({ message: "No guest cart to merge" });
    }

    const guestCart = guestCarts[0];

    // Get or create user's cart
    const userCart = await getOrCreateCart(user.id, null);

    // Get all items from guest cart
    const guestItems = await db.select().from(cartItems).where(eq(cartItems.cartId, guestCart.id));

    // Merge items into user cart
    for (const item of guestItems) {
      // Check if same item exists in user cart
      const existingItems = await db
        .select()
        .from(cartItems)
        .where(
          and(
            eq(cartItems.cartId, userCart.id),
            eq(cartItems.productId, item.productId),
            eq(cartItems.variantId, item.variantId),
            item.frameId ? eq(cartItems.frameId, item.frameId) : sql`${cartItems.frameId} IS NULL`,
            eq(cartItems.isSavedForLater, item.isSavedForLater)
          )
        )
        .limit(1);

      if (existingItems[0]) {
        // Update quantity
        const newQuantity = existingItems[0].quantity + item.quantity;
        const lineTotal = calculateLineTotal(item.unitPrice, item.framePrice, newQuantity);

        await db
          .update(cartItems)
          .set({ quantity: newQuantity, lineTotal })
          .where(eq(cartItems.id, existingItems[0].id));
      } else {
        // Move item to user cart
        await db.update(cartItems).set({ cartId: userCart.id }).where(eq(cartItems.id, item.id));
      }
    }

    // Deactivate guest cart
    await db.update(carts).set({ isActive: false }).where(eq(carts.id, guestCart.id));

    // Update user cart totals
    await updateCartTotals(userCart.id);

    // Clear the guest cart cache
    await deleteCached(`${CacheKeys.CART}${guestCart.id}`);

    return c.json({
      message: "Cart merged successfully",
      cartId: userCart.id,
    });
  } catch (error) {
    console.error("Error merging carts:", error);
    return c.json({ error: "Failed to merge carts" }, 500);
  }
});

// Export the router
export { cartApp };
export default cartApp;
