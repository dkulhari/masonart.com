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

// Gift card schemas. A gift card is tender, not a discount — kept in its own
// module rather than beside './promotion' so the two are never conflated.
export * from './gift-card';

// Audit log schemas. Who did what, to what, when — the contract shared by the
// API writer, the read route and the admin viewer.
export * from './audit-log';

// Production QC contracts. The photo shot list is here, not in the API, because
// `production_job_photos.slot` is a text column: `schema/shipping.ts` records
// that a value import from this ESM-only package inside `schema/` breaks
// `drizzle-kit generate`, so the vocabulary cannot live beside the table.
export * from './production-qc';
