/**
 * Test Fixtures - Central Export
 *
 * Import test fixtures from this file for convenience
 *
 * @example
 * ```typescript
 * // For Vitest unit/integration tests
 * import { createProduct, createUser, createOrder } from '@/tests/fixtures';
 *
 * // For Playwright E2E tests
 * import { testUrls, login, selectors } from '@/tests/fixtures';
 *
 * // For database seeding
 * import { generateTestDataSet, quickTestData } from '@/tests/fixtures';
 * ```
 */

// ============================================================================
// Product fixtures
// ============================================================================
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

// ============================================================================
// User fixtures
// ============================================================================
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

// ============================================================================
// Order fixtures
// ============================================================================
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

// ============================================================================
// AI Generation fixtures
// ============================================================================
export {
  createAIGeneration,
  createPendingAIGeneration,
  createProcessingAIGeneration,
  createFailedAIGeneration,
  createPendingModerationAIGeneration,
  createRejectedAIGeneration,
  createAIGenerations,
  createAIParameters,
  stylePresets,
  aspectRatios,
} from './ai';

export type {
  AIGeneration,
  AIGenerationImage,
  AIGenerationParameters,
  AIModel,
  AspectRatio,
  StylePreset,
  AIGenerationStatus,
  ModerationStatus,
} from './ai';

// ============================================================================
// Review fixtures
// ============================================================================
export {
  mockReviews,
  validReviewContent,
  invalidReviewContent,
  generateRandomReview,
  generateRandomReviews,
} from './reviews';

export type {
  Review,
  ReviewAuthor,
  ReviewProduct,
  ReviewStats,
} from './reviews';

// ============================================================================
// Playwright E2E test helpers
// ============================================================================
export {
  testCredentials,
  testUrls,
  viewports,
  waitForNetwork,
  waitForApiResponse,
  fillLoginForm,
  fillRegistrationForm,
  fillShippingForm,
  addToCart,
  navigateAndAddToCart,
  login,
  logout,
  isLoggedIn,
  getCartCount,
  clearCart,
  takeTimestampedScreenshot,
  checkBasicAccessibility,
  mockApiResponse,
  setupAuthenticatedSession,
  generateTestId,
  generateTestEmail,
  assertions,
  selectors,
} from './playwright';

export type {
  TestSeedConfig,
} from './playwright';

// ============================================================================
// Database test helpers
// ============================================================================
export {
  generateTestDataSet,
  toDbInsertFormat,
  resetTestDatabase,
  seedTestDatabase,
  cleanupTestData,
  getTestUserByRole,
  getRandomTestProduct,
  getProductWithVariants,
  testIsolation,
  quickTestData,
} from './database';

export type {
  TestDataSet,
  TestDataConfig,
} from './database';
