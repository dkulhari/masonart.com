import { Hono } from 'hono';
import { createDatabase } from '../db/index';
import {
  orders,
  orderItems,
  cartItems,
  products,
  productVariants,
  frames
} from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

/**
 * Orders API Routes
 *
 * Handles order management for the MasonArt e-commerce platform:
 * - GET /api/orders - List all orders for authenticated user (with pagination and filtering)
 * - GET /api/orders/:id - Get single order with details
 * - POST /api/orders - Create order from cart
 * - PUT /api/orders/:id - Update order (admin only - for status/tracking updates)
 * - PUT /api/orders/:id/cancel - Cancel order (user or admin)
 */

type Variables = {
  user: {
    id: string;
    email: string;
    role: 'admin' | 'customer' | 'trade';
  };
};

const app = new Hono<{ Variables: Variables }>();
const { db } = createDatabase();

// Middleware to require authentication
app.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
});

/**
 * GET /api/orders
 * List all orders for authenticated user with pagination and filtering
 */
app.get('/', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');
  const status = c.req.query('status'); // Filter by order status

  const offset = (page - 1) * limit;

  try {
    // Build query conditions
    const conditions = [eq(orders.userId, user.id)];
    if (status) {
      conditions.push(eq(orders.status, status as any));
    }

    // Get orders with pagination
    const ordersResult = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalResult = await db
      .select()
      .from(orders)
      .where(and(...conditions));
    const total = totalResult.length;

    return c.json({
      data: ordersResult,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return c.json({ error: 'Failed to fetch orders' }, 500);
  }
});

/**
 * GET /api/orders/:id
 * Get single order with details (including order items)
 */
app.get('/:id', async (c) => {
  const user = c.get('user');
  const orderId = c.req.param('id');

  try {
    // Get order
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (orderResult.length === 0) {
      return c.json({ error: 'Order not found' }, 404);
    }

    const order = orderResult[0];

    // Check permission (user can only view their own orders, admins can view all)
    if (order.userId !== user.id && user.role !== 'admin') {
      return c.json({ error: 'You do not have permission to view this order' }, 403);
    }

    // Get order items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    return c.json({
      ...order,
      items,
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    return c.json({ error: 'Failed to fetch order' }, 500);
  }
});

/**
 * POST /api/orders
 * Create order from cart items
 */
app.post('/', async (c) => {
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const { shippingAddress, billingAddress, paymentMethod } = body;

    // Validate required fields
    if (!shippingAddress) {
      return c.json({ error: 'shippingAddress is required' }, 400);
    }
    if (!paymentMethod) {
      return c.json({ error: 'paymentMethod is required' }, 400);
    }

    // Validate payment method
    const validPaymentMethods = ['razorpay', 'stripe', 'cod', 'upi'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return c.json({ error: 'Invalid paymentMethod' }, 400);
    }

    // Get cart items with product and variant details
    const cartItemsResult = await db
      .select({
        cartItem: cartItems,
        product: products,
        variant: productVariants,
        frame: frames,
      })
      .from(cartItems)
      .leftJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .leftJoin(frames, eq(cartItems.frameId, frames.id))
      .where(eq(cartItems.userId, user.id));

    if (cartItemsResult.length === 0) {
      return c.json({ error: 'Cart is empty' }, 400);
    }

    // Calculate order totals
    let subtotal = 0;
    const items = cartItemsResult.map((item) => {
      const variantPrice = parseFloat(item.variant?.price || '0');
      const framePrice = item.frame ? parseFloat(item.frame.priceModifier) : 0;
      const unitPrice = variantPrice + framePrice;
      const itemSubtotal = unitPrice * item.cartItem.quantity;
      subtotal += itemSubtotal;

      return {
        productId: item.cartItem.productId,
        variantId: item.cartItem.variantId,
        frameId: item.cartItem.frameId,
        productTitle: item.product?.title || '',
        productSku: item.product?.sku || '',
        sizeLabel: item.variant?.sizeLabel || '',
        frameType: item.frame?.name,
        quantity: item.cartItem.quantity,
        unitPrice: unitPrice.toFixed(2),
        subtotal: itemSubtotal.toFixed(2),
        imageUrl: item.product?.images?.[0]?.url || '',
      };
    });

    const shippingCost = 0; // Free shipping
    const tax = subtotal * 0.18; // 18% GST
    const discount = 0;
    const total = subtotal + shippingCost + tax - discount;

    // Generate unique order number
    const orderNumber = 'ORD-' + Date.now().toString().slice(-8).toUpperCase();

    // Create order
    const newOrder = await db.insert(orders).values({
      orderNumber,
      userId: user.id,
      status: 'pending',
      shippingAddress,
      billingAddress,
      paymentMethod,
      paymentStatus: 'pending',
      subtotal: subtotal.toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      tax: tax.toFixed(2),
      discount: discount.toFixed(2),
      total: total.toFixed(2),
    }).returning();

    const order = newOrder[0];

    // Create order items
    const orderItemsData = items.map((item) => ({
      orderId: order.id,
      ...item,
    }));

    const createdItems = await db.insert(orderItems).values(orderItemsData).returning();

    // Clear cart
    await db.delete(cartItems).where(eq(cartItems.userId, user.id));

    return c.json(
      {
        ...order,
        items: createdItems,
      },
      201
    );
  } catch (error) {
    console.error('Error creating order:', error);
    return c.json({ error: 'Failed to create order' }, 500);
  }
});

/**
 * PUT /api/orders/:id
 * Update order (admin only - for status/tracking updates)
 */
app.put('/:id', async (c) => {
  const user = c.get('user');
  const orderId = c.req.param('id');

  // Only admins can update orders
  if (user.role !== 'admin') {
    return c.json({ error: 'Only admins can update orders' }, 403);
  }

  try {
    const body = await c.req.json();
    const { status, trackingNumber, shippingCarrier, paymentStatus, paymentId, internalNotes } = body;

    // Validate status if provided
    if (status) {
      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
      if (!validStatuses.includes(status)) {
        return c.json({ error: 'Invalid status' }, 400);
      }
    }

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status !== undefined) updateData.status = status;
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier !== undefined) updateData.shippingCarrier = shippingCarrier;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (paymentId !== undefined) updateData.paymentId = paymentId;
    if (internalNotes !== undefined) updateData.internalNotes = internalNotes;

    // Set deliveredAt timestamp if status is delivered
    if (status === 'delivered') {
      updateData.deliveredAt = new Date();
    }

    // Update order
    const updatedOrder = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId))
      .returning();

    if (updatedOrder.length === 0) {
      return c.json({ error: 'Order not found' }, 404);
    }

    return c.json(updatedOrder[0]);
  } catch (error) {
    console.error('Error updating order:', error);
    return c.json({ error: 'Failed to update order' }, 500);
  }
});

/**
 * PUT /api/orders/:id/cancel
 * Cancel order (user or admin)
 */
app.put('/:id/cancel', async (c) => {
  const user = c.get('user');
  const orderId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { reason } = body;

    // Get order
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (orderResult.length === 0) {
      return c.json({ error: 'Order not found' }, 404);
    }

    const order = orderResult[0];

    // Check permission (user can cancel their own orders, admins can cancel any)
    if (order.userId !== user.id && user.role !== 'admin') {
      return c.json({ error: 'You do not have permission to cancel this order' }, 403);
    }

    // Check if order can be cancelled
    if (order.status === 'cancelled') {
      return c.json({ error: 'Order is already cancelled' }, 400);
    }
    if (order.status === 'delivered') {
      return c.json({ error: 'Delivered orders cannot be cancelled' }, 400);
    }

    // Update order
    const updatedOrder = await db
      .update(orders)
      .set({
        status: 'cancelled',
        paymentStatus: 'refunded',
        cancelledAt: new Date(),
        notes: reason || 'Order cancelled by user',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();

    return c.json(updatedOrder[0]);
  } catch (error) {
    console.error('Error cancelling order:', error);
    return c.json({ error: 'Failed to cancel order' }, 500);
  }
});

export default app;
