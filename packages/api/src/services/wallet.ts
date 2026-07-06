/**
 * Wallet Service
 *
 * Core wallet functionality for AI generation payments:
 * - Balance management
 * - Cost calculation with markup
 * - Transaction recording
 * - Refund processing
 */

import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { db } from "../database";
import {
  users,
  walletTransactions,
  walletPricingConfig,
  type WalletTransaction,
  type WalletTransactionMetadata,
  WALLET_CONFIG_KEYS,
  WALLET_CONFIG_DEFAULTS,
} from "../database/schema";
import { estimateGenerationCost, type FalModelType } from "../ai/generator";
import type { AIModelProvider } from "../database/schema/ai-generations";
import { convertUsdCentsToInrPaise } from "./exchange-rate";
import { getCached, setCached } from "../lib/redis";

// ============================================================================
// Types
// ============================================================================

/**
 * Wallet balance and status
 */
export interface WalletBalance {
  balancePaise: number;
  balanceRupees: number;
  freeGenerationsRemaining: number;
  totalTopUpsPaise: number;
  totalSpentPaise: number;
}

/**
 * Cost calculation result
 */
export interface GenerationCostEstimate {
  /** API cost in paise (converted from USD) */
  apiCostPaise: number;
  /** Markup percentage (basis points, e.g., 5000 = 50%) */
  markupPercentage: number;
  /** Final user price in paise */
  userPricePaise: number;
  /** Final user price in rupees (for display) */
  userPriceRupees: number;
  /** Exchange rate used */
  exchangeRate: number;
  /** Whether user can use free generation */
  canUseFreeGeneration: boolean;
}

/**
 * Transaction history filters
 */
export interface TransactionFilters {
  type?: "credit" | "debit" | "refund" | "bonus" | "adjustment";
  status?: "pending" | "completed" | "failed" | "reversed";
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Paginated transaction history
 */
export interface PaginatedTransactions {
  items: WalletTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ============================================================================
// Balance Functions
// ============================================================================

/**
 * Get user's wallet balance and stats
 */
export async function getWalletBalance(userId: string): Promise<WalletBalance> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      walletBalancePaise: true,
      freeGenerationsRemaining: true,
      totalWalletTopUpsPaise: true,
      totalWalletSpentPaise: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  return {
    balancePaise: user.walletBalancePaise,
    balanceRupees: user.walletBalancePaise / 100,
    freeGenerationsRemaining: user.freeGenerationsRemaining,
    totalTopUpsPaise: user.totalWalletTopUpsPaise,
    totalSpentPaise: user.totalWalletSpentPaise,
  };
}

/**
 * Check if user has sufficient funds for a generation
 */
export async function hasSufficientFunds(
  userId: string,
  requiredPaise: number
): Promise<{
  sufficient: boolean;
  canUseFreeGeneration: boolean;
  currentBalance: number;
  freeGenerationsRemaining: number;
}> {
  const balance = await getWalletBalance(userId);

  const canUseFreeGeneration = balance.freeGenerationsRemaining > 0;
  const sufficient = canUseFreeGeneration || balance.balancePaise >= requiredPaise;

  return {
    sufficient,
    canUseFreeGeneration,
    currentBalance: balance.balancePaise,
    freeGenerationsRemaining: balance.freeGenerationsRemaining,
  };
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Get pricing config value with caching
 */
async function getPricingConfig(key: string): Promise<number> {
  const cacheKey = `wallet-config:${key}`;
  const cached = await getCached<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const config = await db.query.walletPricingConfig.findFirst({
    where: and(
      eq(walletPricingConfig.key, key),
      lte(walletPricingConfig.effectiveFrom, new Date()),
      sql`(${walletPricingConfig.effectiveTo} IS NULL OR ${walletPricingConfig.effectiveTo} > NOW())`
    ),
    orderBy: desc(walletPricingConfig.effectiveFrom),
  });

  const value =
    config?.valueInt ?? WALLET_CONFIG_DEFAULTS[key as keyof typeof WALLET_CONFIG_DEFAULTS] ?? 0;

  // Cache for 5 minutes
  await setCached(cacheKey, value, 300);

  return value;
}

/**
 * Calculate generation cost with markup
 *
 * Flow:
 * 1. Get API cost in USD cents from estimateGenerationCost()
 * 2. Convert to INR paise using live exchange rate
 * 3. Apply configurable markup percentage
 */
export async function calculateGenerationCost(
  provider: AIModelProvider,
  variationCount: number,
  falModel?: FalModelType,
  userId?: string
): Promise<GenerationCostEstimate> {
  // Get API cost in USD cents
  const apiCostUsdCents = estimateGenerationCost(provider, variationCount, falModel);

  // Convert to INR paise
  const { paise: apiCostPaise, exchangeRate } = await convertUsdCentsToInrPaise(apiCostUsdCents);

  // Get markup percentage from config
  const markupPercentage = await getPricingConfig(WALLET_CONFIG_KEYS.AI_GENERATION_MARKUP);

  // Apply markup: price = apiCost * (1 + markup/10000)
  // markup is in basis points (5000 = 50%)
  const userPricePaise = Math.round(apiCostPaise * (1 + markupPercentage / 10000));

  // Check if user can use free generation
  let canUseFreeGeneration = false;
  if (userId) {
    const balance = await getWalletBalance(userId);
    canUseFreeGeneration = balance.freeGenerationsRemaining > 0;
  }

  return {
    apiCostPaise,
    markupPercentage,
    userPricePaise,
    userPriceRupees: userPricePaise / 100,
    exchangeRate,
    canUseFreeGeneration,
  };
}

// ============================================================================
// Transaction Functions
// ============================================================================

/**
 * Deduct from wallet for AI generation
 *
 * Uses database transaction with row locking to prevent race conditions.
 * If user has free generations, uses those instead of wallet balance.
 *
 * @returns Transaction record and whether free generation was used
 */
export async function deductFromWallet(
  userId: string,
  amountPaise: number,
  generationId: string,
  metadata: WalletTransactionMetadata
): Promise<{
  transaction: WalletTransaction | null;
  usedFreeGeneration: boolean;
  newBalance: number;
}> {
  return await db.transaction(async (tx) => {
    // Lock user row for update
    const [user] = await tx
      .select({
        walletBalancePaise: users.walletBalancePaise,
        freeGenerationsRemaining: users.freeGenerationsRemaining,
        totalWalletSpentPaise: users.totalWalletSpentPaise,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!user) {
      throw new Error("User not found");
    }

    // Check if user can use free generation
    if (user.freeGenerationsRemaining > 0) {
      // Use free generation
      const [updatedUser] = await tx
        .update(users)
        .set({
          freeGenerationsRemaining: user.freeGenerationsRemaining - 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({ walletBalancePaise: users.walletBalancePaise });

      return {
        transaction: null,
        usedFreeGeneration: true,
        newBalance: updatedUser?.walletBalancePaise ?? user.walletBalancePaise,
      };
    }

    // Check sufficient balance
    if (user.walletBalancePaise < amountPaise) {
      throw new Error(
        `Insufficient wallet balance. Required: ${amountPaise}, Available: ${user.walletBalancePaise}`
      );
    }

    // Deduct from wallet
    const newBalance = user.walletBalancePaise - amountPaise;

    await tx
      .update(users)
      .set({
        walletBalancePaise: newBalance,
        totalWalletSpentPaise: user.totalWalletSpentPaise + amountPaise,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Create transaction record
    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        userId,
        type: "debit",
        status: "completed",
        amountPaise,
        balanceAfterPaise: newBalance,
        description: `AI Generation - ${metadata.stylePreset || "Image"}`,
        metadata,
        aiGenerationId: generationId,
        completedAt: new Date(),
      })
      .returning();

    return {
      transaction: transaction ?? null,
      usedFreeGeneration: false,
      newBalance,
    };
  });
}

/**
 * Refund to wallet for failed generation
 */
export async function refundToWallet(
  userId: string,
  amountPaise: number,
  reason: string,
  originalTransactionId?: string,
  generationId?: string
): Promise<WalletTransaction> {
  return await db.transaction(async (tx) => {
    // Lock user row
    const [user] = await tx
      .select({
        walletBalancePaise: users.walletBalancePaise,
        totalWalletSpentPaise: users.totalWalletSpentPaise,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!user) {
      throw new Error("User not found");
    }

    // Add refund to wallet
    const newBalance = user.walletBalancePaise + amountPaise;

    await tx
      .update(users)
      .set({
        walletBalancePaise: newBalance,
        // Don't decrease totalWalletSpentPaise as we track gross spending
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Create refund transaction
    const metadata: WalletTransactionMetadata = {
      refundReason: reason,
      originalTransactionId,
    };

    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        userId,
        type: "refund",
        status: "completed",
        amountPaise,
        balanceAfterPaise: newBalance,
        description: `Refund: ${reason}`,
        metadata,
        aiGenerationId: generationId,
        completedAt: new Date(),
      })
      .returning();

    if (!transaction) {
      throw new Error("Failed to create refund transaction");
    }

    return transaction;
  });
}

/**
 * Credit wallet from Razorpay payment
 */
export async function creditWallet(
  userId: string,
  amountPaise: number,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  description: string = "Wallet Top-up"
): Promise<WalletTransaction> {
  return await db.transaction(async (tx) => {
    // Lock user row
    const [user] = await tx
      .select({
        walletBalancePaise: users.walletBalancePaise,
        totalWalletTopUpsPaise: users.totalWalletTopUpsPaise,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!user) {
      throw new Error("User not found");
    }

    // Add to wallet
    const newBalance = user.walletBalancePaise + amountPaise;

    await tx
      .update(users)
      .set({
        walletBalancePaise: newBalance,
        totalWalletTopUpsPaise: user.totalWalletTopUpsPaise + amountPaise,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Create credit transaction
    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        userId,
        type: "credit",
        status: "completed",
        amountPaise,
        balanceAfterPaise: newBalance,
        description,
        razorpayOrderId,
        razorpayPaymentId,
        completedAt: new Date(),
      })
      .returning();

    if (!transaction) {
      throw new Error("Failed to create credit transaction");
    }

    return transaction;
  });
}

/**
 * Create pending transaction for top-up (before payment confirmation)
 */
export async function createPendingTopUp(
  userId: string,
  amountPaise: number,
  razorpayOrderId: string
): Promise<WalletTransaction> {
  // Get current balance for snapshot
  const balance = await getWalletBalance(userId);

  const [transaction] = await db
    .insert(walletTransactions)
    .values({
      userId,
      type: "credit",
      status: "pending",
      amountPaise,
      balanceAfterPaise: balance.balancePaise, // Will be updated on completion
      description: "Wallet Top-up (Pending)",
      razorpayOrderId,
    })
    .returning();

  if (!transaction) {
    throw new Error("Failed to create pending transaction");
  }

  return transaction;
}

/**
 * Complete pending top-up transaction
 */
export async function completePendingTopUp(
  razorpayOrderId: string,
  razorpayPaymentId: string
): Promise<WalletTransaction> {
  // Find the pending transaction
  const pendingTx = await db.query.walletTransactions.findFirst({
    where: and(
      eq(walletTransactions.razorpayOrderId, razorpayOrderId),
      eq(walletTransactions.status, "pending"),
      eq(walletTransactions.type, "credit")
    ),
  });

  if (!pendingTx) {
    throw new Error("Pending transaction not found");
  }

  // Credit the wallet
  return await creditWallet(
    pendingTx.userId,
    pendingTx.amountPaise,
    razorpayOrderId,
    razorpayPaymentId,
    "Wallet Top-up"
  );
}

/**
 * Mark pending transaction as failed
 */
export async function failPendingTopUp(
  razorpayOrderId: string,
  errorMessage?: string
): Promise<void> {
  await db
    .update(walletTransactions)
    .set({
      status: "failed",
      metadata: errorMessage ? { refundReason: errorMessage } : undefined,
    })
    .where(
      and(
        eq(walletTransactions.razorpayOrderId, razorpayOrderId),
        eq(walletTransactions.status, "pending")
      )
    );
}

// ============================================================================
// Transaction History
// ============================================================================

/**
 * Get transaction history with pagination and filters
 */
export async function getTransactionHistory(
  userId: string,
  filters: TransactionFilters = {},
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedTransactions> {
  // Build conditions
  const conditions = [eq(walletTransactions.userId, userId)];

  if (filters.type) {
    conditions.push(eq(walletTransactions.type, filters.type));
  }
  if (filters.status) {
    conditions.push(eq(walletTransactions.status, filters.status));
  }
  if (filters.fromDate) {
    conditions.push(gte(walletTransactions.createdAt, filters.fromDate));
  }
  if (filters.toDate) {
    conditions.push(lte(walletTransactions.createdAt, filters.toDate));
  }

  const offset = (page - 1) * pageSize;

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(walletTransactions)
    .where(and(...conditions));

  const total = countResult[0]?.count ?? 0;

  // Get transactions
  const items = await db
    .select()
    .from(walletTransactions)
    .where(and(...conditions))
    .orderBy(desc(walletTransactions.createdAt))
    .limit(pageSize)
    .offset(offset);

  const totalPages = Math.ceil(total / pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Add bonus credits to user wallet (admin only)
 */
export async function addBonusCredits(
  userId: string,
  amountPaise: number,
  reason: string,
  adminId: string
): Promise<WalletTransaction> {
  return await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ walletBalancePaise: users.walletBalancePaise })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!user) {
      throw new Error("User not found");
    }

    const newBalance = user.walletBalancePaise + amountPaise;

    await tx
      .update(users)
      .set({
        walletBalancePaise: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        userId,
        type: "bonus",
        status: "completed",
        amountPaise,
        balanceAfterPaise: newBalance,
        description: `Bonus Credits: ${reason}`,
        metadata: {
          bonusAmount: amountPaise,
          adjustmentNotes: `Added by admin ${adminId}: ${reason}`,
        },
        completedAt: new Date(),
      })
      .returning();

    if (!transaction) {
      throw new Error("Failed to create bonus transaction");
    }

    return transaction;
  });
}

/**
 * Adjust wallet balance (admin only)
 */
export async function adjustWalletBalance(
  userId: string,
  adjustmentPaise: number, // Can be positive or negative
  reason: string,
  adminId: string
): Promise<WalletTransaction> {
  return await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ walletBalancePaise: users.walletBalancePaise })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!user) {
      throw new Error("User not found");
    }

    const newBalance = user.walletBalancePaise + adjustmentPaise;

    if (newBalance < 0) {
      throw new Error("Adjustment would result in negative balance");
    }

    await tx
      .update(users)
      .set({
        walletBalancePaise: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [transaction] = await tx
      .insert(walletTransactions)
      .values({
        userId,
        type: "adjustment",
        status: "completed",
        amountPaise: Math.abs(adjustmentPaise),
        balanceAfterPaise: newBalance,
        description: `Balance Adjustment: ${reason}`,
        metadata: {
          adjustmentNotes: `Adjusted by admin ${adminId}: ${reason} (${adjustmentPaise > 0 ? "+" : ""}${adjustmentPaise} paise)`,
        },
        completedAt: new Date(),
      })
      .returning();

    if (!transaction) {
      throw new Error("Failed to create adjustment transaction");
    }

    return transaction;
  });
}
