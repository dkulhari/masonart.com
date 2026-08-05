/**
 * @chobii/shared - Shared types, schemas, and constants for chobii.art platform
 *
 * This package contains:
 * - TypeScript interfaces and types (./types/)
 * - Zod validation schemas (./schemas/)
 * - Business constants - sizes, frames, styles (./constants/)
 */

// Re-export Zod for convenience
export { z } from 'zod';
export type { ZodSchema, ZodType, ZodError } from 'zod';

// Types
export * from './types/product';
export * from './types/order';
export * from './types/user';
export * from './types/ai';

// Schemas
export * from './schemas/product';
export * from './schemas/checkout';
export * from './schemas/ai-generation';
// Curated collections. Listed here explicitly because this barrel enumerates
// schema modules rather than re-exporting ./schemas/index.ts — adding a module
// there alone leaves it unreachable through the package entry point.
export * from './schemas/collection';
// Promotions. Same reason as collections above: this barrel enumerates schema
// modules, so `./schemas/index.ts` alone does not make these reachable through
// `@chobii/shared`.
export * from './schemas/promotion';

// Constants
export * from './constants/brand';
export * from './constants/sizes';
export * from './constants/frames';
export * from './constants/facets';
export * from './constants/styles';
