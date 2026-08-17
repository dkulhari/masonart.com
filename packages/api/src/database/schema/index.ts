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

// AI generation moderation reviews
export * from "./ai-generation-reviews";

// Wallet transactions and pricing config
export * from "./wallet";

// Product reviews and ratings
export * from "./reviews";

// Customer photo/video attached to product reviews
export * from "./review-media";

// Shipping options and order shipments
export * from "./shipping";

// Return policies and return requests
export * from "./returns";

// Order tracking notifications and preferences
export * from "./notifications";

// Production photo approvals for made-to-order items
export * from "./approvals";

// Curated collections and their manual membership
export * from "./collections";

// Sale promotions, their product scope and their exclusions
export * from "./promotions";

// Gift cards, their ledger, and what each card paid on an order
export * from "./gift-cards";

// Vendors, contacts, capabilities and rate cards
export * from "./vendors";

// Production jobs, their items, QC reviews and vendor settlements
export * from "./production-jobs";
