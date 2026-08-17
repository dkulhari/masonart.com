// Users and sessions database schema for Better Auth
// Following the patterns defined in docs/poster-app-tech-stack.md

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  boolean,
  pgEnum,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Notification preferences structure stored as JSONB
 */
export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  push: boolean;
  whatsapp: boolean;
  enabledCategories: string[];
  followedArtistIds: string[];
}

/**
 * Default notification preferences for new users
 */
export const defaultNotificationPreferences: NotificationPreferences = {
  email: true,
  sms: false,
  push: true,
  whatsapp: false,
  enabledCategories: ["order-updates", "new-arrivals"],
  followedArtistIds: [],
};

// ============================================================================
// Enums
// ============================================================================

/**
 * User role enum for RBAC
 * - customer: Regular customer with basic permissions
 * - trade: Trade program member with wholesale access
 * - admin: Admin with full access to admin panel
 * - super-admin: Super admin with system-level access
 */
export const userRoleEnum = pgEnum("user_role", [
  "customer",
  "trade",
  "content-manager",
  "admin",
  "super-admin",
  // Appended last on purpose: Postgres enum values are ordered and drizzle-kit
  // emits ALTER TYPE ... ADD VALUE. Inserting mid-list rewrites the type for
  // no benefit. A vendor is NOT a weaker admin — the role grants nothing on
  // its own; access comes from the vendor_users link plus row scoping.
  "vendor",
]);

/**
 * User account status enum
 */
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "inactive",
  "suspended",
  "pending-verification",
]);

/**
 * Trade program status enum
 */
export const tradeStatusEnum = pgEnum("trade_status", [
  "none",
  "pending",
  "approved",
  "rejected",
  "suspended",
]);

/**
 * Trade account type enum
 */
export const tradeAccountTypeEnum = pgEnum("trade_account_type", [
  "interior-designer",
  "architect",
  "staging-company",
  "hospitality",
  "office-designer",
  "art-consultant",
  "other",
]);

/**
 * AI subscription tier enum
 */
export const aiSubscriptionTierEnum = pgEnum("ai_subscription_tier", [
  "free",
  "premium",
  "unlimited",
]);

// ============================================================================
// Core Better Auth Tables
// ============================================================================

/**
 * Users table - Core user data for Better Auth
 * Extended with chobii.art-specific fields
 */
export const users = pgTable(
  "user",
  {
    // Better Auth required fields
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    banned: boolean("banned").default(false),
    banReason: text("ban_reason"),
    banExpires: timestamp("ban_expires"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    // chobii.art custom fields
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    phoneVerified: boolean("phone_verified").default(false).notNull(),

    // Role and status
    role: userRoleEnum("role").default("customer").notNull(),
    status: userStatusEnum("status").default("active").notNull(),

    // Trade program
    tradeStatus: tradeStatusEnum("trade_status").default("none").notNull(),

    // AI generation credits (legacy - use wallet for new payments)
    aiCreditsRemaining: integer("ai_credits_remaining").default(5).notNull(),
    aiSubscriptionTier: aiSubscriptionTierEnum("ai_subscription_tier").default(
      "free"
    ),

    // Wallet system
    walletBalancePaise: integer("wallet_balance_paise").default(0).notNull(),
    freeGenerationsRemaining: integer("free_generations_remaining")
      .default(3)
      .notNull(),
    totalWalletTopUpsPaise: integer("total_wallet_top_ups_paise")
      .default(0)
      .notNull(),
    totalWalletSpentPaise: integer("total_wallet_spent_paise")
      .default(0)
      .notNull(),

    // Notification preferences (stored as JSONB)
    notificationPreferences: jsonb("notification_preferences")
      .$type<NotificationPreferences>()
      .default(defaultNotificationPreferences),

    // Wishlist (array of product IDs)
    wishlistProductIds: text("wishlist_product_ids").array().default([]),

    // Default address and payment method references
    defaultAddressId: uuid("default_address_id"),
    defaultPaymentMethodId: uuid("default_payment_method_id"),

    // Gallery membership
    /**
     * "The gallery" — an explicit opt-in, not a synonym for having an account.
     * Defaults false for every existing customer: they see the same join
     * prompt as anyone else, because we were never granted their consent.
     */
    galleryMember: boolean("gallery_member").default(false).notNull(),
    galleryJoinedAt: timestamp("gallery_joined_at", { withTimezone: true }),
    /** A timestamp, not a boolean — a date is what has to be produced if the
     *  consent is ever questioned. */
    marketingConsentAt: timestamp("marketing_consent_at", {
      withTimezone: true,
    }),
    /** banner | rail | cart | registration | sale-page */
    joinSource: text("join_source"),

    // Last login tracking
    lastLoginAt: timestamp("last_login_at"),
  },
  (table) => ({
    emailIdx: index("user_email_idx").on(table.email),
    roleIdx: index("user_role_idx").on(table.role),
    statusIdx: index("user_status_idx").on(table.status),
    tradeStatusIdx: index("user_trade_status_idx").on(table.tradeStatus),
    createdAtIdx: index("user_created_at_idx").on(table.createdAt),
  })
);

/**
 * Sessions table - Better Auth session management
 */
export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),
    tokenIdx: index("session_token_idx").on(table.token),
    expiresAtIdx: index("session_expires_at_idx").on(table.expiresAt),
  })
);

/**
 * Accounts table - OAuth/social login accounts for Better Auth
 */
export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId),
    providerIdx: index("account_provider_idx").on(
      table.providerId,
      table.accountId
    ),
  })
);

/**
 * Verification table - Email verification and password reset tokens
 */
export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  })
);

// ============================================================================
// Additional chobii.art Tables
// ============================================================================

/**
 * User addresses table - Shipping and billing addresses
 */
export const addresses = pgTable(
  "address",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["shipping", "billing", "both"] })
      .default("both")
      .notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    addressLine1: text("address_line_1").notNull(),
    addressLine2: text("address_line_2"),
    landmark: text("landmark"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    countryCode: text("country_code").default("IN").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("address_user_id_idx").on(table.userId),
    defaultIdx: index("address_default_idx").on(table.userId, table.isDefault),
  })
);

/**
 * Trade applications table - Trade program membership requests
 */
export const tradeApplications = pgTable(
  "trade_application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    businessType: tradeAccountTypeEnum("business_type").notNull(),
    website: text("website"),
    taxId: text("tax_id"),
    registrationNumber: text("registration_number"),
    portfolioUrls: text("portfolio_urls").array(),
    yearsInBusiness: integer("years_in_business"),
    estimatedMonthlyVolume: text("estimated_monthly_volume"),
    notes: text("notes"),
    status: tradeStatusEnum("status").default("pending").notNull(),
    discountPercentage: integer("discount_percentage"),
    paymentTerms: text("payment_terms"),
    reviewerNotes: text("reviewer_notes"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => users.id),
  },
  (table) => ({
    userIdIdx: index("trade_application_user_id_idx").on(table.userId),
    statusIdx: index("trade_application_status_idx").on(table.status),
    submittedAtIdx: index("trade_application_submitted_at_idx").on(
      table.submittedAt
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Users relations
 */
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  addresses: many(addresses),
  tradeApplications: many(tradeApplications),
}));

/**
 * Sessions relations
 */
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

/**
 * Accounts relations
 */
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

/**
 * Addresses relations
 */
export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, {
    fields: [addresses.userId],
    references: [users.id],
  }),
}));

/**
 * Trade applications relations
 */
export const tradeApplicationsRelations = relations(
  tradeApplications,
  ({ one }) => ({
    user: one(users, {
      fields: [tradeApplications.userId],
      references: [users.id],
    }),
    reviewer: one(users, {
      fields: [tradeApplications.reviewedBy],
      references: [users.id],
    }),
  })
);

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;

export type TradeApplication = typeof tradeApplications.$inferSelect;
export type NewTradeApplication = typeof tradeApplications.$inferInsert;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type UserStatus = (typeof userStatusEnum.enumValues)[number];
export type TradeStatus = (typeof tradeStatusEnum.enumValues)[number];
export type TradeAccountType = (typeof tradeAccountTypeEnum.enumValues)[number];
export type AISubscriptionTier =
  (typeof aiSubscriptionTierEnum.enumValues)[number];
