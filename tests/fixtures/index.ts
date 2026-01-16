/**
 * Test Fixtures - Central Export
 *
 * Import test fixtures from this file for convenience
 *
 * @example
 * ```typescript
 * import { createProduct, createUser, createOrder } from '@/tests/fixtures';
 * ```
 */

// Product fixtures
export {
  createProduct,
  createProductVariant,
  createFrame,
  createProducts,
  createProductVariants,
  createFrames,
  createAIGeneratedProduct,
} from './products';

export type {
  Product,
  ProductVariant,
  ProductImage,
  Frame,
} from './products';

// User fixtures
export {
  createUser,
  createAddress,
  createUserPreferences,
  createAdminUser,
  createTradeUser,
  createGuestUser,
  createUsers,
  createAddresses,
  createSession,
  createCompleteUser,
} from './users';

export type {
  User,
  Address,
  UserPreferences,
  Session,
} from './users';

// Order fixtures
export {
  createOrder,
  createOrderItem,
  createPendingOrder,
  createShippedOrder,
  createDeliveredOrder,
  createCancelledOrder,
  createOrderWithPhotoApproval,
  createOrderItems,
  createOrders,
  createCartItem,
  createCartItems,
  calculateOrderTotals,
} from './orders';

export type {
  Order,
  OrderItem,
  CartItem,
} from './orders';
