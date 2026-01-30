// Database schema exports
// This file exports all table definitions for use in Drizzle ORM

// Products, variants, and frames
export * from "./products";

// Users, sessions, accounts, addresses, and trade applications
export * from "./users";

// Orders and order items
export * from "./orders";

// Shopping cart and cart items
export * from "./cart";

// AI generations, likes, banned prompts, and usage tracking
export * from "./ai-generations";

// Wallet transactions and pricing config
export * from "./wallet";

// Product reviews and ratings
export * from "./reviews";

// Shipping options and order shipments
export * from "./shipping";

// Return policies and return requests
export * from "./returns";

// Order tracking notifications and preferences
export * from "./notifications";

// Production photo approvals for made-to-order items
export * from "./approvals";
