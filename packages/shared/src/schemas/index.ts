/**
 * Shared Zod schemas for chobii.art platform
 *
 * This module contains:
 * - Product schemas
 * - Order schemas
 * - User schemas
 * - AI generation schemas
 */

export const SCHEMAS_VERSION = '1.0.0';

// Product schemas
export * from './product';

// Curated collection schemas.
//
// Exported AFTER './product' on purpose: the deprecated `collectionSchema`
// there and `curatedCollectionSchema` here are different types with similar
// names, and only the latter can express an admin-authored collection.
export * from './collection';

// Order schemas
export * from './order';

// User schemas
export * from './user';

// AI generation schemas
export * from './ai';

// Promotion schemas
export * from './promotion';
