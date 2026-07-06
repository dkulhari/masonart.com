/**
 * Test Fixtures for Orders
 *
 * Provides reusable test data for order-related tests
 */

import type { Address } from "./users";
import { createAddress } from "./users";

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  frameId?: string;
  productTitle: string;
  productSku: string;
  sizeLabel: string;
  frameType?: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  imageUrl: string;
  customizations?: {
    matOption?: string;
    glassType?: string;
    signaturePlacement?: string;
    specialInstructions?: string;
  };
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status:
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refunded";
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress?: Address;
  paymentMethod: "razorpay" | "stripe" | "cod" | "upi";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentId?: string;
  subtotal: string;
  shippingCost: string;
  tax: string;
  discount: string;
  total: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  estimatedDelivery?: Date;
  notes?: string;
  internalNotes?: string;
  photoApproval?: {
    required: boolean;
    status: "pending" | "sent" | "approved" | "changes_requested";
    photoUrls?: string[];
    approvedAt?: Date;
    feedback?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  cancelledAt?: Date;
  deliveredAt?: Date;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  frameId?: string;
  quantity: number;
  addedAt: Date;
}

/**
 * Create a test order item with optional overrides
 */
export function createOrderItem(overrides?: Partial<OrderItem>): OrderItem {
  return {
    id: "item_1234567890",
    orderId: "order_1234567890",
    productId: "prod_1234567890",
    variantId: "variant_1234567890",
    frameId: "frame_001",
    productTitle: "Ocean Waves Abstract Poster",
    productSku: "TX234",
    sizeLabel: "24x32 inches",
    frameType: "Black Frame",
    quantity: 1,
    unitPrice: "3499.00",
    subtotal: "3499.00",
    imageUrl: "https://cdn.example.com/products/tx234-main.jpg",
    customizations: {
      matOption: "white",
      glassType: "standard",
      signaturePlacement: "bottom-right",
    },
    ...overrides,
  };
}

/**
 * Create a test order with optional overrides
 */
export function createOrder(overrides?: Partial<Order>): Order {
  const now = new Date();
  const estimatedDelivery = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  return {
    id: "order_1234567890",
    orderNumber: "ORD-" + Date.now().toString().slice(-8).toUpperCase(),
    userId: "user_1234567890",
    status: "confirmed",
    items: [createOrderItem()],
    shippingAddress: createAddress({
      fullName: "John Doe",
      phone: "+919876543210",
      addressLine1: "123 MG Road",
      city: "Bangalore",
      state: "Karnataka",
      pincode: "560001",
    }),
    paymentMethod: "razorpay",
    paymentStatus: "paid",
    paymentId: "pay_" + Math.random().toString(36).substring(2, 15),
    subtotal: "3499.00",
    shippingCost: "0.00",
    tax: "629.82",
    discount: "0.00",
    total: "4128.82",
    trackingNumber: undefined,
    shippingCarrier: undefined,
    estimatedDelivery,
    notes: undefined,
    internalNotes: undefined,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a pending order (just placed)
 */
export function createPendingOrder(overrides?: Partial<Order>): Order {
  return createOrder({
    status: "pending",
    paymentStatus: "pending",
    paymentId: undefined,
    trackingNumber: undefined,
    ...overrides,
  });
}

/**
 * Create a shipped order
 */
export function createShippedOrder(overrides?: Partial<Order>): Order {
  return createOrder({
    status: "shipped",
    paymentStatus: "paid",
    trackingNumber: "TRK" + Date.now().toString().slice(-10).toUpperCase(),
    shippingCarrier: "Delhivery",
    ...overrides,
  });
}

/**
 * Create a delivered order
 */
export function createDeliveredOrder(overrides?: Partial<Order>): Order {
  const now = new Date();
  const deliveredAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

  return createOrder({
    status: "delivered",
    paymentStatus: "paid",
    trackingNumber: "TRK" + Date.now().toString().slice(-10).toUpperCase(),
    shippingCarrier: "Delhivery",
    deliveredAt,
    ...overrides,
  });
}

/**
 * Create a cancelled order
 */
export function createCancelledOrder(overrides?: Partial<Order>): Order {
  const now = new Date();
  const cancelledAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

  return createOrder({
    status: "cancelled",
    paymentStatus: "refunded",
    cancelledAt,
    notes: "Customer requested cancellation",
    ...overrides,
  });
}

/**
 * Create an order with photo approval workflow
 */
export function createOrderWithPhotoApproval(overrides?: Partial<Order>): Order {
  return createOrder({
    status: "processing",
    photoApproval: {
      required: true,
      status: "pending",
      photoUrls: [],
    },
    items: [
      createOrderItem({
        productSku: "AI-" + Date.now().toString().slice(-6),
        productTitle: "AI Generated Abstract Art",
      }),
    ],
    ...overrides,
  });
}

/**
 * Create multiple order items
 */
export function createOrderItems(orderId: string, count: number = 3): OrderItem[] {
  const items: OrderItem[] = [];

  const templates = [
    {
      productTitle: "Ocean Waves Abstract Poster",
      productSku: "TX234",
      sizeLabel: "24x32 inches",
      unitPrice: "3499.00",
    },
    {
      productTitle: "Mountain Peaks Minimalist",
      productSku: "TX235",
      sizeLabel: "18x24 inches",
      unitPrice: "2299.00",
    },
    {
      productTitle: "Botanical Line Art",
      productSku: "TX236",
      sizeLabel: "24x24 inches",
      unitPrice: "2899.00",
    },
  ];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const quantity = 1 + (i % 2);
    const unitPrice = parseFloat(template.unitPrice);
    const subtotal = (unitPrice * quantity).toFixed(2);

    items.push(
      createOrderItem({
        id: `item_${orderId}_${i}`,
        orderId,
        productId: `prod_${i.toString().padStart(10, "0")}`,
        variantId: `variant_${i.toString().padStart(10, "0")}`,
        ...template,
        quantity,
        subtotal,
        imageUrl: `https://cdn.example.com/products/${template.productSku.toLowerCase()}-main.jpg`,
      })
    );
  }

  return items;
}

/**
 * Create multiple test orders
 */
export function createOrders(userId: string, count: number = 5): Order[] {
  const orders: Order[] = [];
  const now = new Date();

  const statuses: Order["status"][] = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
  ];
  const paymentStatuses: Order["paymentStatus"][] = ["pending", "paid", "paid", "paid", "paid"];

  for (let i = 0; i < count; i++) {
    const status = statuses[i % statuses.length];
    const paymentStatus = paymentStatuses[i % paymentStatuses.length];
    const createdAt = new Date(now.getTime() - (count - i) * 24 * 60 * 60 * 1000);

    const items = createOrderItems(`order_${i}`, 1 + (i % 3));
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    orders.push(
      createOrder({
        id: `order_${i.toString().padStart(10, "0")}`,
        orderNumber: `ORD-${(100000 + i).toString()}`,
        userId,
        status,
        paymentStatus,
        items,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        total: total.toFixed(2),
        createdAt,
        updatedAt: createdAt,
      })
    );
  }

  return orders;
}

/**
 * Create a cart item
 */
export function createCartItem(overrides?: Partial<CartItem>): CartItem {
  return {
    id: "cart_item_" + Date.now(),
    productId: "prod_1234567890",
    variantId: "variant_1234567890",
    frameId: "frame_001",
    quantity: 1,
    addedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create multiple cart items
 */
export function createCartItems(count: number = 3): CartItem[] {
  const items: CartItem[] = [];

  for (let i = 0; i < count; i++) {
    items.push(
      createCartItem({
        id: `cart_item_${i}`,
        productId: `prod_${i.toString().padStart(10, "0")}`,
        variantId: `variant_${i.toString().padStart(10, "0")}`,
        frameId: i % 2 === 0 ? `frame_00${(i % 3) + 1}` : undefined,
        quantity: 1 + (i % 2),
        addedAt: new Date(Date.now() - i * 60 * 60 * 1000),
      })
    );
  }

  return items;
}

/**
 * Calculate order totals
 */
export function calculateOrderTotals(
  items: OrderItem[],
  shippingCost: number = 0,
  discountAmount: number = 0
): {
  subtotal: string;
  shippingCost: string;
  tax: string;
  discount: string;
  total: string;
} {
  const subtotal = items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
  const discount = discountAmount;
  const subtotalAfterDiscount = subtotal - discount;
  const tax = subtotalAfterDiscount * 0.18; // 18% GST
  const total = subtotalAfterDiscount + tax + shippingCost;

  return {
    subtotal: subtotal.toFixed(2),
    shippingCost: shippingCost.toFixed(2),
    tax: tax.toFixed(2),
    discount: discount.toFixed(2),
    total: total.toFixed(2),
  };
}
