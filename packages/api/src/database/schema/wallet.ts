/**
 * Wallet Database Schema
 *
 * Provides wallet functionality for AI generation payments:
 * - wallet_transactions: Tracks all wallet credits, debits, and refunds
 * - wallet_pricing_config: Configurable pricing parameters
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  pgEnum,
  index,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { aiGenerations } from "./ai-generations";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Wallet transaction metadata for AI generation payments
 */
export interface WalletTransactionMetadata {
  /** AI provider used (e.g., 'fal-ai', 'stable-diffusion') */
  provider?: string;
  /** FAL model type */
  falModel?: string;
  /** Style preset used */
  stylePreset?: string;
  /** Number of variations generated */
  variationCount?: number;
  /** API cost in USD cents */
  apiCostUsdCents?: number;
  /** Exchange rate used for conversion */
  exchangeRate?: number;
  /** Markup percentage applied (e.g., 5000 = 50%) */
  markupPercentage?: number;
  /** Reference to original transaction for refunds */
  originalTransactionId?: string;
  /** Refund reason */
  refundReason?: string;
  /** Top-up amount preset used */
  topUpPreset?: string;
  /** Bonus credits awarded */
  bonusAmount?: number;
  /** Admin adjustment notes */
  adjustmentNotes?: string;
}

// ============================================================================
// Enums
// ============================================================================

/**
 * Wallet transaction type enum
 */
export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "credit", // Money added to wallet (top-up)
  "debit", // Money spent (AI generation)
  "refund", // Refund for failed generation
  "bonus", // Promotional bonus credits
  "adjustment", // Admin adjustment
]);

/**
 * Wallet transaction status enum
 */
export const walletTransactionStatusEnum = pgEnum("wallet_transaction_status", [
  "pending", // Payment initiated but not confirmed
  "completed", // Transaction completed successfully
  "failed", // Transaction failed
  "reversed", // Transaction reversed (e.g., chargeback)
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Wallet transactions table - Tracks all wallet operations
 */
export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // User reference
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Transaction type and status
    type: walletTransactionTypeEnum("type").notNull(),
    status: walletTransactionStatusEnum("status").default("pending").notNull(),

    // Amount in paise (100 paise = 1 INR)
    amountPaise: integer("amount_paise").notNull(),
    // Balance snapshot after transaction
    balanceAfterPaise: integer("balance_after_paise").notNull(),

    // Transaction description
    description: text("description").notNull(),

    // Flexible metadata for provider details, generation info, etc.
    metadata: jsonb("metadata").$type<WalletTransactionMetadata>(),

    // Razorpay references (for top-ups)
    razorpayOrderId: text("razorpay_order_id"),
    razorpayPaymentId: text("razorpay_payment_id"),

    // AI generation reference (for debits/refunds)
    aiGenerationId: uuid("ai_generation_id").references(() => aiGenerations.id, {
      onDelete: "set null",
    }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    userIdIdx: index("wallet_transactions_user_id_idx").on(table.userId),
    typeIdx: index("wallet_transactions_type_idx").on(table.type),
    statusIdx: index("wallet_transactions_status_idx").on(table.status),
    razorpayOrderIdx: index("wallet_transactions_razorpay_order_idx").on(table.razorpayOrderId),
    razorpayPaymentIdx: index("wallet_transactions_razorpay_payment_idx").on(
      table.razorpayPaymentId
    ),
    aiGenerationIdx: index("wallet_transactions_ai_generation_idx").on(table.aiGenerationId),
    createdAtIdx: index("wallet_transactions_created_at_idx").on(table.createdAt),
    userTypeStatusIdx: index("wallet_transactions_user_type_status_idx").on(
      table.userId,
      table.type,
      table.status
    ),
  })
);

/**
 * Wallet pricing configuration table
 *
 * Stores configurable pricing parameters that can be changed
 * without code deployments.
 */
export const walletPricingConfig = pgTable(
  "wallet_pricing_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Configuration key (unique identifier)
    key: text("key").notNull(),

    // Integer value (percentages stored as basis points: 5000 = 50%)
    valueInt: integer("value_int").notNull(),

    // Description of the config
    description: text("description"),

    // Effective dates for time-based pricing
    effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
    effectiveTo: timestamp("effective_to"),

    // Who created this config
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    keyIdx: index("wallet_pricing_config_key_idx").on(table.key),
    effectiveIdx: index("wallet_pricing_config_effective_idx").on(
      table.effectiveFrom,
      table.effectiveTo
    ),
    uniqueKeyEffective: unique("wallet_pricing_config_unique_key_effective").on(
      table.key,
      table.effectiveFrom
    ),
  })
);

// ============================================================================
// Relations
// ============================================================================

/**
 * Wallet transactions relations
 */
export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  user: one(users, {
    fields: [walletTransactions.userId],
    references: [users.id],
  }),
  aiGeneration: one(aiGenerations, {
    fields: [walletTransactions.aiGenerationId],
    references: [aiGenerations.id],
  }),
}));

/**
 * Wallet pricing config relations
 */
export const walletPricingConfigRelations = relations(walletPricingConfig, ({ one }) => ({
  creator: one(users, {
    fields: [walletPricingConfig.createdBy],
    references: [users.id],
  }),
}));

// ============================================================================
// Type Exports (inferred from schema)
// ============================================================================

export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;

export type WalletPricingConfig = typeof walletPricingConfig.$inferSelect;
export type NewWalletPricingConfig = typeof walletPricingConfig.$inferInsert;

export type WalletTransactionType = (typeof walletTransactionTypeEnum.enumValues)[number];
export type WalletTransactionStatus = (typeof walletTransactionStatusEnum.enumValues)[number];

// ============================================================================
// Constants
// ============================================================================

/**
 * Pricing config keys
 */
export const WALLET_CONFIG_KEYS = {
  /** AI generation markup percentage (basis points: 5000 = 50%) */
  AI_GENERATION_MARKUP: "ai_generation_markup",
  /** Free generations for new users */
  FREE_GENERATIONS_NEW_USER: "free_generations_new_user",
  /** Minimum top-up amount in paise */
  MINIMUM_TOPUP_PAISE: "minimum_topup_paise",
  /** Maximum top-up amount in paise */
  MAXIMUM_TOPUP_PAISE: "maximum_topup_paise",
} as const;

/**
 * Default config values
 */
export const WALLET_CONFIG_DEFAULTS = {
  [WALLET_CONFIG_KEYS.AI_GENERATION_MARKUP]: 5000, // 50% markup
  [WALLET_CONFIG_KEYS.FREE_GENERATIONS_NEW_USER]: 3,
  [WALLET_CONFIG_KEYS.MINIMUM_TOPUP_PAISE]: 10000, // Rs 100
  [WALLET_CONFIG_KEYS.MAXIMUM_TOPUP_PAISE]: 10000000, // Rs 100,000
} as const;
