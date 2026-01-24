/**
 * Database Test Helpers
 *
 * Provides utilities for database operations in tests
 * These helpers support both Vitest unit tests and Playwright E2E tests
 */

import {
  createProduct,
  createProducts,
  createProductVariants,
  createFrames,
  type Product,
  type ProductVariant,
  type Frame,
} from './products';

import {
  createUser,
  createAdminUser,
  createTradeUser,
  createAddress,
  type User,
  type Address,
} from './users';

import {
  createOrder,
  createOrderItems,
  createCartItem,
  type Order,
  type OrderItem,
  type CartItem,
} from './orders';

import {
  createAIGeneration,
  createAIGenerations,
  type AIGeneration,
} from './ai';

/**
 * Complete test data set for seeding
 */
export interface TestDataSet {
  products: Product[];
  productVariants: Map<string, ProductVariant[]>;
  frames: Frame[];
  users: User[];
  addresses: Map<string, Address[]>;
  orders: Order[];
  cartItems: CartItem[];
  aiGenerations: AIGeneration[];
}

/**
 * Test data configuration
 */
export interface TestDataConfig {
  productCount?: number;
  userCount?: number;
  ordersPerUser?: number;
  cartItemsPerUser?: number;
  aiGenerationsPerUser?: number;
  includeAdmin?: boolean;
  includeTradeUser?: boolean;
}

const defaultConfig: Required<TestDataConfig> = {
  productCount: 5,
  userCount: 3,
  ordersPerUser: 2,
  cartItemsPerUser: 2,
  aiGenerationsPerUser: 3,
  includeAdmin: true,
  includeTradeUser: true,
};

/**
 * Generate a complete test data set
 */
export function generateTestDataSet(config: TestDataConfig = {}): TestDataSet {
  const mergedConfig = { ...defaultConfig, ...config };

  // Create products
  const products = createProducts(mergedConfig.productCount);
  const productVariants = new Map<string, ProductVariant[]>();

  for (const product of products) {
    productVariants.set(product.id, createProductVariants(product.id));
  }

  // Create frames
  const frames = createFrames();

  // Create users
  const users: User[] = [];
  const addresses = new Map<string, Address[]>();

  // Add regular users
  for (let i = 0; i < mergedConfig.userCount; i++) {
    const user = createUser({
      id: `user_${i.toString().padStart(10, '0')}`,
      email: `user${i}@example.com`,
      name: `Test User ${i}`,
      phone: `+9198765432${10 + i}`,
    });
    users.push(user);
    addresses.set(user.id, [
      createAddress({
        id: `addr_${user.id}_0`,
        fullName: user.name,
        isDefault: true,
      }),
    ]);
  }

  // Add admin user
  if (mergedConfig.includeAdmin) {
    const admin = createAdminUser({
      id: 'user_admin_001',
    });
    users.push(admin);
    addresses.set(admin.id, [
      createAddress({
        id: `addr_${admin.id}_0`,
        fullName: admin.name,
        isDefault: true,
      }),
    ]);
  }

  // Add trade user
  if (mergedConfig.includeTradeUser) {
    const trade = createTradeUser({
      id: 'user_trade_001',
    });
    users.push(trade);
    addresses.set(trade.id, [
      createAddress({
        id: `addr_${trade.id}_0`,
        fullName: trade.name,
        isDefault: true,
      }),
    ]);
  }

  // Create orders for each user
  const orders: Order[] = [];
  for (const user of users.filter(u => u.role === 'customer')) {
    for (let i = 0; i < mergedConfig.ordersPerUser; i++) {
      const orderItems = createOrderItems(`order_${user.id}_${i}`, 2);
      const order = createOrder({
        id: `order_${user.id}_${i}`,
        orderNumber: `ORD-${Date.now()}-${i}`,
        userId: user.id,
        items: orderItems,
      });
      orders.push(order);
    }
  }

  // Create cart items for each user
  const cartItems: CartItem[] = [];
  for (const user of users.filter(u => u.role === 'customer')) {
    for (let i = 0; i < mergedConfig.cartItemsPerUser; i++) {
      const product = products[i % products.length];
      const variants = productVariants.get(product.id) || [];
      const variant = variants[i % variants.length];

      cartItems.push(createCartItem({
        id: `cart_${user.id}_${i}`,
        productId: product.id,
        variantId: variant?.id || 'variant_default',
        frameId: frames[i % frames.length]?.id,
        quantity: 1 + (i % 2),
      }));
    }
  }

  // Create AI generations for each user
  const aiGenerations: AIGeneration[] = [];
  for (const user of users.filter(u => u.role === 'customer')) {
    aiGenerations.push(...createAIGenerations(user.id, mergedConfig.aiGenerationsPerUser));
  }

  return {
    products,
    productVariants,
    frames,
    users,
    addresses,
    orders,
    cartItems,
    aiGenerations,
  };
}

/**
 * Convert test data to database insert format
 * This can be used with Drizzle ORM for actual database seeding
 */
export function toDbInsertFormat(dataSet: TestDataSet): {
  products: Array<{
    id: string;
    sku: string;
    title: string;
    slug: string;
    description: string;
    basePrice: string;
    styles: string[];
    subjects: string[];
    colors: string[];
    orientation: string;
    artistId?: string;
    images: Array<{ url: string; alt: string; width: number; height: number; isPrimary: boolean }>;
    seoTitle: string;
    seoDescription: string;
    status: string;
    featuredOrder?: number;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    phone?: string;
    role: string;
    emailVerified: boolean;
    phoneVerified: boolean;
    avatarUrl?: string;
    preferences: {
      emailNotifications: boolean;
      smsNotifications: boolean;
      marketingEmails: boolean;
      orderUpdates: boolean;
      aiGenerationNotifications: boolean;
    };
    tradeAccountStatus?: string;
    tradeBusiness?: { businessName: string; gstNumber?: string; businessType: string };
  }>;
} {
  return {
    products: dataSet.products.map((p) => ({
      id: p.id,
      sku: p.sku,
      title: p.title,
      slug: p.slug,
      description: p.description,
      basePrice: p.basePrice,
      styles: p.styles,
      subjects: p.subjects,
      colors: p.colors,
      orientation: p.orientation,
      artistId: p.artistId,
      images: p.images,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      status: p.status,
      featuredOrder: p.featuredOrder,
    })),
    users: dataSet.users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      emailVerified: u.emailVerified,
      phoneVerified: u.phoneVerified,
      avatarUrl: u.avatarUrl,
      preferences: u.preferences,
      tradeAccountStatus: u.tradeAccountStatus,
      tradeBusiness: u.tradeBusiness,
    })),
  };
}

/**
 * Reset test database helper
 * Use this in beforeEach/afterEach hooks
 */
export async function resetTestDatabase(db: unknown): Promise<void> {
  // This is a placeholder - actual implementation depends on your DB client
  // Example with Drizzle:
  // await db.delete(orders);
  // await db.delete(users);
  // await db.delete(products);
  throw new Error('resetTestDatabase must be implemented with your database client');
}

/**
 * Seed test database helper
 * Use this in beforeAll hooks
 */
export async function seedTestDatabase(db: unknown, dataSet: TestDataSet): Promise<void> {
  // This is a placeholder - actual implementation depends on your DB client
  // Example with Drizzle:
  // await db.insert(products).values(dataSet.products);
  // await db.insert(users).values(dataSet.users);
  throw new Error('seedTestDatabase must be implemented with your database client');
}

/**
 * Test data cleanup helper
 * Removes all test data created during tests
 */
export async function cleanupTestData(db: unknown): Promise<void> {
  // This is a placeholder - actual implementation depends on your DB client
  throw new Error('cleanupTestData must be implemented with your database client');
}

/**
 * Get test user by role
 */
export function getTestUserByRole(dataSet: TestDataSet, role: 'admin' | 'customer' | 'trade'): User | undefined {
  return dataSet.users.find((u) => u.role === role);
}

/**
 * Get random test product
 */
export function getRandomTestProduct(dataSet: TestDataSet): Product {
  const index = Math.floor(Math.random() * dataSet.products.length);
  return dataSet.products[index];
}

/**
 * Get product with variants
 */
export function getProductWithVariants(dataSet: TestDataSet, productId: string): {
  product: Product | undefined;
  variants: ProductVariant[];
} {
  const product = dataSet.products.find((p) => p.id === productId);
  const variants = dataSet.productVariants.get(productId) || [];
  return { product, variants };
}

/**
 * Test isolation utilities
 */
export const testIsolation = {
  /**
   * Generate unique identifier for test isolation
   */
  uniqueId: () => `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,

  /**
   * Generate unique email for test isolation
   */
  uniqueEmail: () => `test_${Date.now()}_${Math.random().toString(36).substring(7)}@test.example.com`,

  /**
   * Generate unique order number
   */
  uniqueOrderNumber: () => `ORD-TEST-${Date.now().toString().slice(-8)}`,

  /**
   * Generate unique SKU
   */
  uniqueSku: () => `SKU-TEST-${Date.now().toString().slice(-6)}`,
};

/**
 * Export convenience function for quick data generation
 */
export function quickTestData(): TestDataSet {
  return generateTestDataSet({
    productCount: 3,
    userCount: 2,
    ordersPerUser: 1,
    cartItemsPerUser: 1,
    aiGenerationsPerUser: 2,
    includeAdmin: true,
    includeTradeUser: false,
  });
}
