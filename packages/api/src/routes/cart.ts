import { Hono } from 'hono';
import { createDatabase } from '../db/index';
import { cartItems, products, productVariants, frames } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Cart Management Routes
 *
 * Provides endpoints for managing shopping cart:
 * - GET /api/cart - Get cart items for authenticated user
 * - POST /api/cart - Add item to cart
 * - PUT /api/cart/:id - Update cart item
 * - DELETE /api/cart/:id - Remove cart item
 * - DELETE /api/cart - Clear entire cart
 */

const cartRouter = new Hono();
const { db } = createDatabase();

/**
 * Middleware to require authentication
 */
const requireAuth = async (c: any, next: any) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
};

// Apply authentication to all cart routes
cartRouter.use('*', requireAuth);

/**
 * GET /api/cart
 * Get all cart items for authenticated user with product details
 */
cartRouter.get('/', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    // Get cart items with product, variant, and frame details
    const items = await db
      .select({
        id: cartItems.id,
        userId: cartItems.userId,
        productId: cartItems.productId,
        variantId: cartItems.variantId,
        frameId: cartItems.frameId,
        quantity: cartItems.quantity,
        addedAt: cartItems.addedAt,
        product: products,
        variant: productVariants,
        frame: frames,
      })
      .from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .leftJoin(frames, eq(cartItems.frameId, frames.id))
      .where(eq(cartItems.userId, userId));

    // Calculate subtotal
    let subtotal = 0;
    for (const item of items) {
      if (item.variant) {
        const variantPrice = parseFloat(item.variant.price);
        const framePrice = item.frame ? parseFloat(item.frame.priceModifier) : 0;
        subtotal += (variantPrice + framePrice) * item.quantity;
      }
    }

    return c.json({
      items,
      total: items.length,
      subtotal: subtotal.toFixed(2),
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    return c.json({ error: 'Failed to fetch cart' }, 500);
  }
});

/**
 * POST /api/cart
 * Add item to cart or update quantity if item already exists
 */
cartRouter.post('/', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;
    const body = await c.req.json();

    const { productId, variantId, frameId, quantity } = body;

    // Validate required fields
    if (!productId) {
      return c.json({ error: 'productId is required' }, 400);
    }
    if (!variantId) {
      return c.json({ error: 'variantId is required' }, 400);
    }
    if (!quantity || quantity < 1) {
      return c.json({ error: 'quantity must be greater than 0' }, 400);
    }

    // Verify product exists
    const product = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product.length) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // Verify variant exists
    const variant = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    if (!variant.length) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    // Verify frame exists if provided
    if (frameId) {
      const frame = await db.select().from(frames).where(eq(frames.id, frameId)).limit(1);
      if (!frame.length) {
        return c.json({ error: 'Frame not found' }, 404);
      }
    }

    // Check if item already exists in cart
    const existingItem = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.userId, userId),
          eq(cartItems.productId, productId),
          eq(cartItems.variantId, variantId),
          frameId ? eq(cartItems.frameId, frameId) : eq(cartItems.frameId, null)
        )
      )
      .limit(1);

    if (existingItem.length > 0) {
      // Update existing item quantity
      const updatedItem = await db
        .update(cartItems)
        .set({
          quantity: existingItem[0].quantity + quantity,
        })
        .where(eq(cartItems.id, existingItem[0].id))
        .returning();

      return c.json(updatedItem[0], 200);
    } else {
      // Create new cart item
      const newItem = await db
        .insert(cartItems)
        .values({
          userId,
          productId,
          variantId,
          frameId: frameId || null,
          quantity,
        })
        .returning();

      return c.json(newItem[0], 201);
    }
  } catch (error) {
    console.error('Error adding to cart:', error);
    return c.json({ error: 'Failed to add item to cart' }, 500);
  }
});

/**
 * PUT /api/cart/:id
 * Update cart item quantity or frame
 */
cartRouter.put('/:id', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;
    const itemId = c.req.param('id');
    const body = await c.req.json();

    const { quantity, frameId } = body;

    // Validate quantity if provided
    if (quantity !== undefined && quantity < 1) {
      return c.json({ error: 'quantity must be greater than 0' }, 400);
    }

    // Check if cart item exists and belongs to user
    const existingItem = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.id, itemId))
      .limit(1);

    if (!existingItem.length) {
      return c.json({ error: 'Cart item not found' }, 404);
    }

    if (existingItem[0].userId !== userId) {
      return c.json({ error: 'You do not have permission to update this cart item' }, 403);
    }

    // Build update object
    const updateData: any = {};
    if (quantity !== undefined) {
      updateData.quantity = quantity;
    }
    if (frameId !== undefined) {
      updateData.frameId = frameId;
    }

    // Update cart item
    const updatedItem = await db
      .update(cartItems)
      .set(updateData)
      .where(eq(cartItems.id, itemId))
      .returning();

    return c.json(updatedItem[0]);
  } catch (error) {
    console.error('Error updating cart item:', error);
    return c.json({ error: 'Failed to update cart item' }, 500);
  }
});

/**
 * DELETE /api/cart/:id
 * Remove item from cart
 */
cartRouter.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;
    const itemId = c.req.param('id');

    // Check if cart item exists and belongs to user
    const existingItem = await db
      .select()
      .from(cartItems)
      .where(eq(cartItems.id, itemId))
      .limit(1);

    if (!existingItem.length) {
      return c.json({ error: 'Cart item not found' }, 404);
    }

    if (existingItem[0].userId !== userId) {
      return c.json({ error: 'You do not have permission to delete this cart item' }, 403);
    }

    // Delete cart item
    await db.delete(cartItems).where(eq(cartItems.id, itemId));

    return c.json({ message: 'Cart item removed successfully' });
  } catch (error) {
    console.error('Error deleting cart item:', error);
    return c.json({ error: 'Failed to delete cart item' }, 500);
  }
});

/**
 * DELETE /api/cart
 * Clear all cart items for user
 */
cartRouter.delete('/', async (c) => {
  try {
    const user = c.get('user');
    const userId = user.id;

    // Delete all cart items for user
    await db.delete(cartItems).where(eq(cartItems.userId, userId));

    return c.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Error clearing cart:', error);
    return c.json({ error: 'Failed to clear cart' }, 500);
  }
});

export default cartRouter;
