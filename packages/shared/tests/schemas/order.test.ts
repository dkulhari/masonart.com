/**
 * Order Schema Tests
 *
 * Comprehensive tests for order-related Zod schemas including:
 * - Address validation
 * - Order validation
 * - Order item validation
 * - Cart item validation
 * - Photo approval validation
 */

import { describe, it, expect } from 'vitest';
import {
  AddressSchema,
  AddressCreateSchema,
  AddressUpdateSchema,
  AddressTypeSchema,
  OrderSchema,
  OrderCreateSchema,
  OrderUpdateSchema,
  OrderStatusSchema,
  PaymentStatusSchema,
  PaymentMethodSchema,
  OrderItemSchema,
  OrderItemCreateSchema,
  OrderItemCustomizationsSchema,
  PhotoApprovalSchema,
  PhotoApprovalStatusSchema,
  CartItemSchema,
  CartItemCreateSchema,
  CartItemUpdateSchema,
  OrderFilterSchema,
} from '../../src/schemas/order.js';

describe('Address Type Schema', () => {
  it('should accept valid address types', () => {
    expect(AddressTypeSchema.safeParse('home').success).toBe(true);
    expect(AddressTypeSchema.safeParse('office').success).toBe(true);
    expect(AddressTypeSchema.safeParse('other').success).toBe(true);
  });

  it('should reject invalid address types', () => {
    expect(AddressTypeSchema.safeParse('residential').success).toBe(false);
    expect(AddressTypeSchema.safeParse('work').success).toBe(false);
    expect(AddressTypeSchema.safeParse('').success).toBe(false);
  });
});

describe('Address Schema', () => {
  const validAddress = {
    id: 'addr_1234567890',
    fullName: 'John Doe',
    phone: '+919876543210',
    addressLine1: '123 MG Road, Koramangala',
    addressLine2: 'Near Metro Station',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560034',
    country: 'India',
    isDefault: true,
    type: 'home' as const,
  };

  it('should validate a complete valid address', () => {
    const result = AddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
  });

  it('should validate address without optional address line 2', () => {
    const { addressLine2, ...address } = validAddress;
    const result = AddressSchema.safeParse(address);
    expect(result.success).toBe(true);
  });

  describe('Full name validation', () => {
    it('should accept names with 2-100 characters', () => {
      expect(AddressSchema.safeParse({ ...validAddress, fullName: 'Jo' }).success).toBe(true);
      expect(AddressSchema.safeParse({ ...validAddress, fullName: 'A'.repeat(100) }).success).toBe(true);
    });

    it('should reject names under 2 characters', () => {
      const result = AddressSchema.safeParse({ ...validAddress, fullName: 'J' });
      expect(result.success).toBe(false);
    });

    it('should reject names over 100 characters', () => {
      const result = AddressSchema.safeParse({ ...validAddress, fullName: 'A'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const result = AddressSchema.safeParse({ ...validAddress, fullName: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('Phone validation', () => {
    it('should accept valid E.164 phone numbers', () => {
      const validPhones = [
        '+919876543210',
        '+14155552671',
        '+442071838750',
        '+861082222222',
      ];
      validPhones.forEach(phone => {
        const result = AddressSchema.safeParse({ ...validAddress, phone });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid phone numbers', () => {
      const invalidPhones = [
        '9876543210', // Missing +91
        '+91 98765 43210', // Spaces
        '+91-9876543210', // Hyphens
        '091-9876543210', // Leading zero
        'phone',
      ];
      invalidPhones.forEach(phone => {
        const result = AddressSchema.safeParse({ ...validAddress, phone });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Address line validation', () => {
    it('should accept address line 1 with 5-200 characters', () => {
      expect(AddressSchema.safeParse({ ...validAddress, addressLine1: '12345' }).success).toBe(true);
      expect(AddressSchema.safeParse({ ...validAddress, addressLine1: 'A'.repeat(200) }).success).toBe(true);
    });

    it('should reject address line 1 under 5 characters', () => {
      const result = AddressSchema.safeParse({ ...validAddress, addressLine1: '1234' });
      expect(result.success).toBe(false);
    });

    it('should reject address line 1 over 200 characters', () => {
      const result = AddressSchema.safeParse({ ...validAddress, addressLine1: 'A'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('should accept optional address line 2 up to 200 characters', () => {
      expect(AddressSchema.safeParse({ ...validAddress, addressLine2: 'A'.repeat(200) }).success).toBe(true);
    });

    it('should reject address line 2 over 200 characters', () => {
      const result = AddressSchema.safeParse({ ...validAddress, addressLine2: 'A'.repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe('City and state validation', () => {
    it('should accept city and state with 2-100 characters', () => {
      expect(AddressSchema.safeParse({ ...validAddress, city: 'AB', state: 'CD' }).success).toBe(true);
      expect(AddressSchema.safeParse({ ...validAddress, city: 'A'.repeat(100), state: 'B'.repeat(100) }).success).toBe(true);
    });

    it('should reject city under 2 characters', () => {
      expect(AddressSchema.safeParse({ ...validAddress, city: 'A' }).success).toBe(false);
    });

    it('should reject state over 100 characters', () => {
      expect(AddressSchema.safeParse({ ...validAddress, state: 'A'.repeat(101) }).success).toBe(false);
    });
  });

  describe('Pincode validation', () => {
    it('should accept 6-digit Indian pincode', () => {
      const validPincodes = ['560001', '110001', '400001', '600001'];
      validPincodes.forEach(pincode => {
        const result = AddressSchema.safeParse({ ...validAddress, pincode });
        expect(result.success).toBe(true);
      });
    });

    it('should accept US 5-digit ZIP code', () => {
      const result = AddressSchema.safeParse({ ...validAddress, pincode: '94102' });
      expect(result.success).toBe(true);
    });

    it('should accept US ZIP+4 code', () => {
      const result = AddressSchema.safeParse({ ...validAddress, pincode: '94102-1234' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid pincodes', () => {
      const invalidPincodes = [
        '1234567', // 7 digits
        'ABC123', // Letters
        '560 034', // Spaces
        '12345-', // Incomplete ZIP+4
      ];
      invalidPincodes.forEach(pincode => {
        const result = AddressSchema.safeParse({ ...validAddress, pincode });
        expect(result.success).toBe(false);
      });
    });
  });
});

describe('Address Create Schema', () => {
  it('should accept address data without id', () => {
    const addressCreate = {
      fullName: 'John Doe',
      phone: '+919876543210',
      addressLine1: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560034',
      country: 'India',
      isDefault: true,
      type: 'home' as const,
    };

    const result = AddressCreateSchema.safeParse(addressCreate);
    expect(result.success).toBe(true);
  });

  it('should reject if id is present', () => {
    const invalid = {
      id: 'addr_123',
      fullName: 'John Doe',
      phone: '+919876543210',
      addressLine1: '123 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560034',
      country: 'India',
      isDefault: true,
      type: 'home' as const,
    };

    const result = AddressCreateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('Order Status Schema', () => {
  it('should accept valid order statuses', () => {
    const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    statuses.forEach(status => {
      expect(OrderStatusSchema.safeParse(status).success).toBe(true);
    });
  });

  it('should reject invalid order statuses', () => {
    expect(OrderStatusSchema.safeParse('completed').success).toBe(false);
    expect(OrderStatusSchema.safeParse('dispatched').success).toBe(false);
    expect(OrderStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('Payment Status Schema', () => {
  it('should accept valid payment statuses', () => {
    expect(PaymentStatusSchema.safeParse('pending').success).toBe(true);
    expect(PaymentStatusSchema.safeParse('paid').success).toBe(true);
    expect(PaymentStatusSchema.safeParse('failed').success).toBe(true);
    expect(PaymentStatusSchema.safeParse('refunded').success).toBe(true);
  });

  it('should reject invalid payment statuses', () => {
    expect(PaymentStatusSchema.safeParse('success').success).toBe(false);
    expect(PaymentStatusSchema.safeParse('processing').success).toBe(false);
    expect(PaymentStatusSchema.safeParse('').success).toBe(false);
  });
});

describe('Payment Method Schema', () => {
  it('should accept valid payment methods', () => {
    expect(PaymentMethodSchema.safeParse('razorpay').success).toBe(true);
    expect(PaymentMethodSchema.safeParse('stripe').success).toBe(true);
    expect(PaymentMethodSchema.safeParse('cod').success).toBe(true);
    expect(PaymentMethodSchema.safeParse('upi').success).toBe(true);
  });

  it('should reject invalid payment methods', () => {
    expect(PaymentMethodSchema.safeParse('paypal').success).toBe(false);
    expect(PaymentMethodSchema.safeParse('credit-card').success).toBe(false);
    expect(PaymentMethodSchema.safeParse('').success).toBe(false);
  });
});

describe('Order Item Customizations Schema', () => {
  it('should validate valid customizations', () => {
    const customizations = {
      matOption: 'white',
      glassType: 'standard',
      signaturePlacement: 'bottom-right',
      specialInstructions: 'Please handle with care',
    };

    const result = OrderItemCustomizationsSchema.safeParse(customizations);
    expect(result.success).toBe(true);
  });

  it('should accept empty customizations', () => {
    const result = OrderItemCustomizationsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject special instructions over 500 characters', () => {
    const customizations = {
      specialInstructions: 'A'.repeat(501),
    };

    const result = OrderItemCustomizationsSchema.safeParse(customizations);
    expect(result.success).toBe(false);
  });
});

describe('Order Item Schema', () => {
  const validOrderItem = {
    id: 'item_1234567890',
    orderId: 'order_1234567890',
    productId: 'prod_1234567890',
    variantId: 'variant_1234567890',
    frameId: 'frame_001',
    productTitle: 'Ocean Waves Abstract Poster',
    productSku: 'TX234',
    sizeLabel: '24x32 inches',
    frameType: 'Black Frame',
    quantity: 2,
    unitPrice: '1499.00',
    subtotal: '2998.00',
    imageUrl: 'https://cdn.example.com/products/tx234-main.jpg',
    customizations: {
      matOption: 'white',
      glassType: 'standard',
    },
  };

  it('should validate a complete valid order item', () => {
    const result = OrderItemSchema.safeParse(validOrderItem);
    expect(result.success).toBe(true);
  });

  it('should validate order item without optional fields', () => {
    const { frameId, frameType, customizations, ...item } = validOrderItem;
    const result = OrderItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  describe('Quantity validation', () => {
    it('should accept positive quantities', () => {
      expect(OrderItemSchema.safeParse({ ...validOrderItem, quantity: 1 }).success).toBe(true);
      expect(OrderItemSchema.safeParse({ ...validOrderItem, quantity: 10 }).success).toBe(true);
    });

    it('should reject zero quantity', () => {
      expect(OrderItemSchema.safeParse({ ...validOrderItem, quantity: 0 }).success).toBe(false);
    });

    it('should reject negative quantity', () => {
      expect(OrderItemSchema.safeParse({ ...validOrderItem, quantity: -1 }).success).toBe(false);
    });

    it('should reject non-integer quantity', () => {
      expect(OrderItemSchema.safeParse({ ...validOrderItem, quantity: 1.5 }).success).toBe(false);
    });
  });

  describe('Price validation', () => {
    it('should accept valid price formats', () => {
      const validPrices = ['0.00', '10.99', '1499.00', '9999.99'];
      validPrices.forEach(price => {
        expect(OrderItemSchema.safeParse({ ...validOrderItem, unitPrice: price }).success).toBe(true);
        expect(OrderItemSchema.safeParse({ ...validOrderItem, subtotal: price }).success).toBe(true);
      });
    });

    it('should reject invalid price formats', () => {
      const invalidPrices = ['1499', '1499.0', '1499.000', '$1499.00'];
      invalidPrices.forEach(price => {
        expect(OrderItemSchema.safeParse({ ...validOrderItem, unitPrice: price }).success).toBe(false);
        expect(OrderItemSchema.safeParse({ ...validOrderItem, subtotal: price }).success).toBe(false);
      });
    });
  });

  describe('Image URL validation', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'https://cdn.example.com/image.jpg',
        'http://example.com/image.png',
        'https://example.com/path/to/image.webp',
      ];
      validUrls.forEach(imageUrl => {
        expect(OrderItemSchema.safeParse({ ...validOrderItem, imageUrl }).success).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      expect(OrderItemSchema.safeParse({ ...validOrderItem, imageUrl: 'not-a-url' }).success).toBe(false);
    });
  });
});

describe('Photo Approval Schema', () => {
  it('should validate valid photo approval', () => {
    const photoApproval = {
      required: true,
      status: 'pending' as const,
      photoUrls: ['https://cdn.example.com/photo1.jpg'],
      approvedAt: new Date(),
      feedback: 'Looks great!',
    };

    const result = PhotoApprovalSchema.safeParse(photoApproval);
    expect(result.success).toBe(true);
  });

  it('should validate minimal photo approval', () => {
    const photoApproval = {
      required: false,
      status: 'pending' as const,
    };

    const result = PhotoApprovalSchema.safeParse(photoApproval);
    expect(result.success).toBe(true);
  });

  describe('Photo approval status validation', () => {
    it('should accept valid statuses', () => {
      const statuses = ['pending', 'sent', 'approved', 'changes_requested'];
      statuses.forEach(status => {
        expect(PhotoApprovalStatusSchema.safeParse(status).success).toBe(true);
      });
    });

    it('should reject invalid statuses', () => {
      expect(PhotoApprovalStatusSchema.safeParse('rejected').success).toBe(false);
      expect(PhotoApprovalStatusSchema.safeParse('').success).toBe(false);
    });
  });

  it('should reject feedback over 1000 characters', () => {
    const photoApproval = {
      required: true,
      status: 'changes_requested' as const,
      feedback: 'A'.repeat(1001),
    };

    const result = PhotoApprovalSchema.safeParse(photoApproval);
    expect(result.success).toBe(false);
  });
});

describe('Order Schema', () => {
  const validAddress = {
    id: 'addr_1234567890',
    fullName: 'John Doe',
    phone: '+919876543210',
    addressLine1: '123 MG Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560034',
    country: 'India',
    isDefault: true,
    type: 'home' as const,
  };

  const validOrderItem = {
    id: 'item_1234567890',
    orderId: 'order_1234567890',
    productId: 'prod_1234567890',
    variantId: 'variant_1234567890',
    productTitle: 'Ocean Waves Poster',
    productSku: 'TX234',
    sizeLabel: '24x32 inches',
    quantity: 1,
    unitPrice: '1499.00',
    subtotal: '1499.00',
    imageUrl: 'https://cdn.example.com/image.jpg',
  };

  const validOrder = {
    id: 'order_1234567890',
    orderNumber: 'ORD-2024-001',
    userId: 'user_1234567890',
    status: 'pending' as const,
    items: [validOrderItem],
    shippingAddress: validAddress,
    paymentMethod: 'razorpay' as const,
    paymentStatus: 'pending' as const,
    subtotal: '1499.00',
    shippingCost: '100.00',
    tax: '269.82',
    discount: '0.00',
    total: '1868.82',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should validate a complete valid order', () => {
    const result = OrderSchema.safeParse(validOrder);
    expect(result.success).toBe(true);
  });

  it('should validate order without optional fields', () => {
    const result = OrderSchema.safeParse(validOrder);
    expect(result.success).toBe(true);
  });

  describe('Order number validation', () => {
    it('should accept valid order number formats', () => {
      const validNumbers = ['ORD-2024-001', 'ORDER123', 'INV-2024-12-001'];
      validNumbers.forEach(orderNumber => {
        expect(OrderSchema.safeParse({ ...validOrder, orderNumber }).success).toBe(true);
      });
    });

    it('should reject order number with lowercase', () => {
      expect(OrderSchema.safeParse({ ...validOrder, orderNumber: 'ord-2024-001' }).success).toBe(false);
    });

    it('should reject order number with spaces', () => {
      expect(OrderSchema.safeParse({ ...validOrder, orderNumber: 'ORD 2024 001' }).success).toBe(false);
    });

    it('should reject empty order number', () => {
      expect(OrderSchema.safeParse({ ...validOrder, orderNumber: '' }).success).toBe(false);
    });
  });

  describe('Order items validation', () => {
    it('should require at least one item', () => {
      expect(OrderSchema.safeParse({ ...validOrder, items: [] }).success).toBe(false);
    });

    it('should accept up to 50 items', () => {
      const items = Array(50).fill(validOrderItem);
      expect(OrderSchema.safeParse({ ...validOrder, items }).success).toBe(true);
    });

    it('should reject more than 50 items', () => {
      const items = Array(51).fill(validOrderItem);
      expect(OrderSchema.safeParse({ ...validOrder, items }).success).toBe(false);
    });
  });

  describe('Price fields validation', () => {
    it('should accept valid price formats for all fields', () => {
      const order = {
        ...validOrder,
        subtotal: '1499.00',
        shippingCost: '100.00',
        tax: '269.82',
        discount: '50.00',
        total: '1818.82',
      };
      expect(OrderSchema.safeParse(order).success).toBe(true);
    });

    it('should reject invalid price formats', () => {
      expect(OrderSchema.safeParse({ ...validOrder, subtotal: '1499' }).success).toBe(false);
      expect(OrderSchema.safeParse({ ...validOrder, shippingCost: '$100.00' }).success).toBe(false);
      expect(OrderSchema.safeParse({ ...validOrder, tax: '269.8' }).success).toBe(false);
      expect(OrderSchema.safeParse({ ...validOrder, total: '1818.820' }).success).toBe(false);
    });
  });

  describe('Notes validation', () => {
    it('should accept notes up to 1000 characters', () => {
      const order = { ...validOrder, notes: 'A'.repeat(1000) };
      expect(OrderSchema.safeParse(order).success).toBe(true);
    });

    it('should reject notes over 1000 characters', () => {
      const order = { ...validOrder, notes: 'A'.repeat(1001) };
      expect(OrderSchema.safeParse(order).success).toBe(false);
    });

    it('should accept internal notes up to 2000 characters', () => {
      const order = { ...validOrder, internalNotes: 'A'.repeat(2000) };
      expect(OrderSchema.safeParse(order).success).toBe(true);
    });

    it('should reject internal notes over 2000 characters', () => {
      const order = { ...validOrder, internalNotes: 'A'.repeat(2001) };
      expect(OrderSchema.safeParse(order).success).toBe(false);
    });
  });
});

describe('Order Create Schema', () => {
  const validAddress = {
    id: 'addr_1234567890',
    fullName: 'John Doe',
    phone: '+919876543210',
    addressLine1: '123 MG Road',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560034',
    country: 'India',
    isDefault: true,
    type: 'home' as const,
  };

  const validOrderItem = {
    productId: 'prod_1234567890',
    variantId: 'variant_1234567890',
    productTitle: 'Ocean Waves Poster',
    productSku: 'TX234',
    sizeLabel: '24x32 inches',
    quantity: 1,
    unitPrice: '1499.00',
    subtotal: '1499.00',
    imageUrl: 'https://cdn.example.com/image.jpg',
  };

  it('should accept order data without auto-generated fields', () => {
    const orderCreate = {
      userId: 'user_1234567890',
      status: 'pending' as const,
      items: [validOrderItem],
      shippingAddress: validAddress,
      paymentMethod: 'razorpay' as const,
      paymentStatus: 'pending' as const,
      subtotal: '1499.00',
      shippingCost: '100.00',
      tax: '269.82',
      discount: '0.00',
      total: '1868.82',
    };

    const result = OrderCreateSchema.safeParse(orderCreate);
    expect(result.success).toBe(true);
  });
});

describe('Cart Item Schema', () => {
  const validCartItem = {
    id: 'cart_1234567890',
    userId: 'user_1234567890',
    productId: 'prod_1234567890',
    variantId: 'variant_1234567890',
    frameId: 'frame_001',
    quantity: 2,
    addedAt: new Date(),
  };

  it('should validate a complete valid cart item', () => {
    const result = CartItemSchema.safeParse(validCartItem);
    expect(result.success).toBe(true);
  });

  it('should validate cart item without optional frameId', () => {
    const { frameId, ...item } = validCartItem;
    const result = CartItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  describe('Quantity validation', () => {
    it('should accept quantities between 1 and 99', () => {
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: 1 }).success).toBe(true);
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: 50 }).success).toBe(true);
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: 99 }).success).toBe(true);
    });

    it('should reject quantity of 0', () => {
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: 0 }).success).toBe(false);
    });

    it('should reject quantity over 99', () => {
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: 100 }).success).toBe(false);
    });

    it('should reject negative quantity', () => {
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: -1 }).success).toBe(false);
    });

    it('should reject non-integer quantity', () => {
      expect(CartItemSchema.safeParse({ ...validCartItem, quantity: 1.5 }).success).toBe(false);
    });
  });
});

describe('Cart Item Create Schema', () => {
  it('should accept cart item data without id and addedAt', () => {
    const cartItemCreate = {
      userId: 'user_1234567890',
      productId: 'prod_1234567890',
      variantId: 'variant_1234567890',
      quantity: 1,
    };

    const result = CartItemCreateSchema.safeParse(cartItemCreate);
    expect(result.success).toBe(true);
  });
});

describe('Order Filter Schema', () => {
  it('should accept empty filter', () => {
    const result = OrderFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept partial filters', () => {
    const filters = [
      { userId: 'user_123' },
      { status: 'pending' },
      { paymentStatus: 'paid' },
      { paymentMethod: 'razorpay' },
      { dateFrom: new Date() },
      { dateTo: new Date() },
      { search: 'ORD-2024' },
      { limit: 20 },
      { offset: 40 },
    ];

    filters.forEach(filter => {
      const result = OrderFilterSchema.safeParse(filter);
      expect(result.success).toBe(true);
    });
  });

  it('should accept combined filters', () => {
    const filter = {
      userId: 'user_123',
      status: 'confirmed' as const,
      paymentStatus: 'paid' as const,
      dateFrom: new Date('2024-01-01'),
      dateTo: new Date('2024-12-31'),
      search: 'John Doe',
      limit: 50,
      offset: 0,
    };

    const result = OrderFilterSchema.safeParse(filter);
    expect(result.success).toBe(true);
  });

  describe('Pagination validation', () => {
    it('should accept valid limit values', () => {
      expect(OrderFilterSchema.safeParse({ limit: 1 }).success).toBe(true);
      expect(OrderFilterSchema.safeParse({ limit: 50 }).success).toBe(true);
      expect(OrderFilterSchema.safeParse({ limit: 100 }).success).toBe(true);
    });

    it('should reject limit over 100', () => {
      expect(OrderFilterSchema.safeParse({ limit: 101 }).success).toBe(false);
    });

    it('should reject zero or negative limit', () => {
      expect(OrderFilterSchema.safeParse({ limit: 0 }).success).toBe(false);
      expect(OrderFilterSchema.safeParse({ limit: -1 }).success).toBe(false);
    });

    it('should accept zero offset', () => {
      expect(OrderFilterSchema.safeParse({ offset: 0 }).success).toBe(true);
    });

    it('should reject negative offset', () => {
      expect(OrderFilterSchema.safeParse({ offset: -1 }).success).toBe(false);
    });
  });
});
