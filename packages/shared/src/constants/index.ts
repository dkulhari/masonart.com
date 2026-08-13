/**
 * Shared constants for chobii.art platform
 *
 * This module exports:
 * - Size constants (poster dimensions)
 * - Frame type constants (frame materials and types)
 * - Style preset constants (AI art styles)
 * - Business rules constants
 */

// Export brand identity constants (single source of truth for the rebrand)
export * from './brand.js';

// Export all size-related constants and helpers
export * from './sizes.js';

// Export all frame-related constants and helpers
export * from './frames.js';

// Export all style-related constants and helpers
export * from './styles.js';

// Export the free-shipping threshold — read by the API and the storefront alike
export * from './shipping.js';

// Constants version
export const CONSTANTS_VERSION = '1.0.0';
export * from './facets.js';
export * from './orientation.js';
