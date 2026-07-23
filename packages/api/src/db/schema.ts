/**
 * Database Schema Definitions
 *
 * Drizzle ORM schema definitions for all chobii.art database tables.
 * This file defines the structure of all tables used in the application.
 */

import { pgTable, uuid, varchar, text, decimal, integer, boolean, timestamp, json, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Enums
 */
export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived']);
export const productOrientationEnum = pgEnum('product_orientation', ['square', 'portrait', 'landscape', 'panoramic', 'round']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'customer', 'trade']);
export const tradeAccountStatusEnum = pgEnum('trade_account_status', ['pending', 'approved', 'rejected']);
export const orderStatusEnum = pgEnum('order_status', ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded']);
export const paymentMethodEnum = pgEnum('payment_method', ['razorpay', 'stripe', 'cod', 'upi']);
export const photoApprovalStatusEnum = pgEnum('photo_approval_status', ['pending', 'sent', 'approved', 'changes_requested']);
export const addressTypeEnum = pgEnum('address_type', ['home', 'office', 'other']);
export const aiGenerationStatusEnum = pgEnum('ai_generation_status', ['pending', 'processing', 'completed', 'failed', 'cancelled']);
export const aiModelEnum = pgEnum('ai_model', ['sdxl', 'sd-2-1', 'dalle-3', 'midjourney', 'stable-diffusion-xl-lightning']);
export const aspectRatioEnum = pgEnum('aspect_ratio', ['1:1', '4:5', '3:4', '2:3', '4:3', '16:9', '21:9']);
export const stylePresetEnum = pgEnum('style_preset', ['wabi-sabi', 'abstract-expression', 'botanical', 'vintage-poster', 'minimalist', 'geometric', 'watercolor', 'line-art', 'pop-art', 'surrealism']);
export const moderationStatusEnum = pgEnum('moderation_status', ['pending', 'approved', 'rejected', 'flagged']);

/**
 * Products Table
 */
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: varchar('sku', { length: 100 }).notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 250 }).notNull().unique(),
  description: text('description').notNull(),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  styles: json('styles').$type<string[]>().notNull(),
  subjects: json('subjects').$type<string[]>().notNull(),
  colors: json('colors').$type<string[]>().notNull(),
  orientation: productOrientationEnum('orientation').notNull(),
  artistId: uuid('artist_id'),
  images: json('images').$type<Array<{
    url: string;
    alt: string;
    width: number;
    height: number;
    isPrimary: boolean;
  }>>().notNull(),
  seoTitle: varchar('seo_title', { length: 70 }).notNull(),
  seoDescription: varchar('seo_description', { length: 160 }).notNull(),
  status: productStatusEnum('status').notNull().default('draft'),
  featuredOrder: integer('featured_order'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Product Variants Table (Sizes)
 */
export const productVariants = pgTable('product_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sizeLabel: varchar('size_label', { length: 50 }).notNull(),
  widthInches: decimal('width_inches', { precision: 6, scale: 2 }).notNull(),
  heightInches: decimal('height_inches', { precision: 6, scale: 2 }).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Frames Table
 */
export const frames = pgTable('frames', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  material: varchar('material', { length: 100 }).notNull(),
  priceModifier: decimal('price_modifier', { precision: 5, scale: 2 }).notNull(),
  imageUrl: text('image_url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

/**
 * Users Table
 * Note: Using text ID to accommodate Better Auth's ID generation
 */
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: userRoleEnum('role').notNull().default('customer'),
  emailVerified: boolean('email_verified').notNull().default(false),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  avatarUrl: text('avatar_url'),
  preferences: json('preferences').$type<{
    emailNotifications: boolean;
    smsNotifications: boolean;
    marketingEmails: boolean;
    orderUpdates: boolean;
    aiGenerationNotifications: boolean;
  }>().notNull().default({
    emailNotifications: true,
    smsNotifications: false,
    marketingEmails: true,
    orderUpdates: true,
    aiGenerationNotifications: true,
  }),
  tradeAccountStatus: tradeAccountStatusEnum('trade_account_status'),
  tradeBusiness: json('trade_business').$type<{
    businessName: string;
    gstNumber?: string;
    businessType: string;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Addresses Table
 */
export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  addressLine1: varchar('address_line1', { length: 200 }).notNull(),
  addressLine2: varchar('address_line2', { length: 200 }),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  pincode: varchar('pincode', { length: 20 }).notNull(),
  country: varchar('country', { length: 100 }).notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  type: addressTypeEnum('type').notNull().default('home'),
});

/**
 * Sessions Table
 * Note: Using varchar ID to accommodate Better Auth's ID generation
 * Better Auth tracks IP address and user agent for security
 */
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 max length
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Accounts Table (for OAuth/Social login and password-based auth)
 * Note: Using varchar ID to accommodate Better Auth's ID generation
 * Schema based on Better Auth requirements
 *
 * Note: provider and providerAccountId are nullable to support credential-based auth
 * where these fields aren't used (Better Auth uses defaults)
 */
export const accounts = pgTable('accounts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  accountId: varchar('accountId', { length: 255 }).notNull().unique(),
  providerId: varchar('providerId', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 100 }),
  providerAccountId: varchar('provider_account_id', { length: 255 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  tokenType: varchar('token_type', { length: 50 }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Orders Table
 */
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  shippingAddress: json('shipping_address').$type<{
    id: string;
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    isDefault: boolean;
    type: string;
  }>().notNull(),
  billingAddress: json('billing_address').$type<{
    id: string;
    fullName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    isDefault: boolean;
    type: string;
  }>(),
  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  paymentId: varchar('payment_id', { length: 255 }),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  shippingCost: decimal('shipping_cost', { precision: 10, scale: 2 }).notNull(),
  tax: decimal('tax', { precision: 10, scale: 2 }).notNull(),
  discount: decimal('discount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  trackingNumber: varchar('tracking_number', { length: 100 }),
  shippingCarrier: varchar('shipping_carrier', { length: 100 }),
  estimatedDelivery: timestamp('estimated_delivery'),
  notes: text('notes'),
  internalNotes: text('internal_notes'),
  photoApproval: json('photo_approval').$type<{
    required: boolean;
    status: string;
    photoUrls?: string[];
    approvedAt?: Date;
    feedback?: string;
  }>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at'),
  deliveredAt: timestamp('delivered_at'),
});

/**
 * Order Items Table
 */
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id),
  frameId: uuid('frame_id').references(() => frames.id),
  productTitle: varchar('product_title', { length: 200 }).notNull(),
  productSku: varchar('product_sku', { length: 100 }).notNull(),
  sizeLabel: varchar('size_label', { length: 50 }).notNull(),
  frameType: varchar('frame_type', { length: 50 }),
  quantity: integer('quantity').notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  imageUrl: text('image_url').notNull(),
  customizations: json('customizations').$type<{
    matOption?: string;
    glassType?: string;
    signaturePlacement?: string;
    specialInstructions?: string;
  }>(),
});

/**
 * Cart Items Table
 */
export const cartItems = pgTable('cart_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id),
  frameId: uuid('frame_id').references(() => frames.id),
  quantity: integer('quantity').notNull(),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

/**
 * AI Generations Table
 */
export const aiGenerations = pgTable('ai_generations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  prompt: text('prompt').notNull(),
  enhancedPrompt: text('enhanced_prompt'),
  stylePreset: stylePresetEnum('style_preset').notNull(),
  aspectRatio: aspectRatioEnum('aspect_ratio').notNull(),
  model: aiModelEnum('model').notNull().default('sdxl'),
  parameters: json('parameters').$type<{
    cfgScale?: number;
    steps?: number;
    sampler?: string;
    seed?: number;
    negativePrompt?: string;
  }>(),
  status: aiGenerationStatusEnum('status').notNull().default('pending'),
  images: json('images').$type<Array<{
    url: string;
    width: number;
    height: number;
    isSelected: boolean;
    thumbnailUrl?: string;
  }>>().notNull().default([]),
  selectedImageId: varchar('selected_image_id', { length: 255 }),
  moderationStatus: moderationStatusEnum('moderation_status').notNull().default('pending'),
  moderationNotes: text('moderation_notes'),
  moderatedBy: uuid('moderated_by').references(() => users.id),
  moderatedAt: timestamp('moderated_at'),
  errorMessage: text('error_message'),
  processingTimeMs: integer('processing_time_ms'),
  creditsUsed: integer('credits_used'),
  isPublic: boolean('is_public').notNull().default(false),
  likes: integer('likes').notNull().default(0),
  views: integer('views').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

/**
 * Relations
 */

// Product relations
export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  addresses: many(addresses),
  sessions: many(sessions),
  orders: many(orders),
  cartItems: many(cartItems),
  aiGenerations: many(aiGenerations),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, {
    fields: [addresses.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Order relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  frame: one(frames, {
    fields: [orderItems.frameId],
    references: [frames.id],
  }),
}));

// Cart relations
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, {
    fields: [cartItems.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
  frame: one(frames, {
    fields: [cartItems.frameId],
    references: [frames.id],
  }),
}));

// AI Generation relations
export const aiGenerationsRelations = relations(aiGenerations, ({ one }) => ({
  user: one(users, {
    fields: [aiGenerations.userId],
    references: [users.id],
  }),
  moderator: one(users, {
    fields: [aiGenerations.moderatedBy],
    references: [users.id],
  }),
}));

/**
 * Type exports
 */
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type Frame = typeof frames.$inferSelect;
export type NewFrame = typeof frames.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
export type AIGeneration = typeof aiGenerations.$inferSelect;
export type NewAIGeneration = typeof aiGenerations.$inferInsert;
