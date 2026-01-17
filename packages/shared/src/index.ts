/**
 * @masonart/shared - Shared types, schemas, and constants for MasonArt platform
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

// Constants
export * from './constants/sizes';
export * from './constants/frames';
export * from './constants/styles';
