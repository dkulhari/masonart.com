/**
 * TanStack Start App Configuration
 *
 * Note: TanStack Start now uses vite.config.ts as the primary configuration file.
 * This file is kept for backwards compatibility and documentation purposes.
 * The main configuration is in vite.config.ts.
 *
 * @see vite.config.ts for the actual configuration
 * @see https://tanstack.com/start/latest/docs/framework/react/build-from-scratch
 */

// Re-export configuration types for reference
export type { } from '@tanstack/react-start'

// App-level configuration constants
export const appConfig = {
  name: 'chobi.art',
  description: 'Premium Poster & Frame E-Commerce Platform',
  apiUrl: process.env.VITE_API_URL ?? '', // Empty uses same-origin via vite proxy
  cdnUrl: process.env.VITE_CDN_URL ?? 'http://localhost:9000/poster-app-dev',
} as const
