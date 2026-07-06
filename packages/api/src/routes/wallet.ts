/**
 * Wallet API Routes
 *
 * Provides API endpoints for wallet management:
 * - GET /api/wallet - Get balance and stats
 * - GET /api/wallet/transactions - Transaction history
 * - POST /api/wallet/topup - Create top-up order
 * - POST /api/wallet/topup/verify - Verify payment
 * - GET /api/wallet/estimate-cost - Estimate AI generation cost
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  getWalletBalance,
  getTransactionHistory,
  calculateGenerationCost,
  createPendingTopUp,
  completePendingTopUp,
} from "../services/wallet";
import { getExchangeRateInfo } from "../services/exchange-rate";
import {
  createRazorpayOrder,
  verifyPaymentSignature,
  getRazorpayKeyId,
  isRazorpayConfigured,
} from "../lib/razorpay";
import { aiModelProviderEnum, aiStylePresetEnum } from "../database/schema/ai-generations";
import type { FalModelType } from "../ai/generator";
import { WALLET_CONFIG_KEYS, WALLET_CONFIG_DEFAULTS } from "../database/schema/wallet";

// ============================================================================
// Constants
// ============================================================================

/** Top-up amount presets in paise */
const TOPUP_PRESETS = [
  { amountPaise: 10000, label: "₹100" },
  { amountPaise: 20000, label: "₹200" },
  { amountPaise: 50000, label: "₹500" },
  { amountPaise: 100000, label: "₹1,000" },
];

// ============================================================================
// Validation Schemas
// ============================================================================

const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(50).optional().default(20),
  type: z.enum(["credit", "debit", "refund", "bonus", "adjustment"]).optional(),
  status: z.enum(["pending", "completed", "failed", "reversed"]).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

const createTopUpSchema = z.object({
  amountPaise: z.coerce
    .number()
    .int()
    .min(WALLET_CONFIG_DEFAULTS[WALLET_CONFIG_KEYS.MINIMUM_TOPUP_PAISE])
    .max(WALLET_CONFIG_DEFAULTS[WALLET_CONFIG_KEYS.MAXIMUM_TOPUP_PAISE]),
});

const verifyTopUpSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

const estimateCostQuerySchema = z.object({
  provider: z.enum(aiModelProviderEnum.enumValues).optional(),
  variationCount: z.coerce.number().int().min(1).max(8).optional().default(4),
  falModel: z.string().optional(),
  stylePreset: z.enum(aiStylePresetEnum.enumValues).optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const walletApp = new Hono<{ Variables: AuthVariables }>();

// ============================================================================
// GET /api/wallet - Get Balance and Stats
// ============================================================================

walletApp.get("/", requireAuth, async (c) => {
  const user = c.get("user");

  try {
    const balance = await getWalletBalance(user.id);
    const exchangeInfo = await getExchangeRateInfo();

    return c.json({
      balance: {
        paise: balance.balancePaise,
        rupees: balance.balanceRupees,
        formatted: `₹${balance.balanceRupees.toFixed(2)}`,
      },
      freeGenerationsRemaining: balance.freeGenerationsRemaining,
      stats: {
        totalTopUpsPaise: balance.totalTopUpsPaise,
        totalTopUpsRupees: balance.totalTopUpsPaise / 100,
        totalSpentPaise: balance.totalSpentPaise,
        totalSpentRupees: balance.totalSpentPaise / 100,
      },
      exchangeRate: {
        usdToInr: exchangeInfo.rate,
        source: exchangeInfo.source,
        fetchedAt: exchangeInfo.fetchedAt,
      },
      topUpPresets: TOPUP_PRESETS,
      razorpayKeyId: getRazorpayKeyId(),
      isPaymentConfigured: isRazorpayConfigured(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to get wallet: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/wallet/transactions - Transaction History
// ============================================================================

walletApp.get(
  "/transactions",
  requireAuth,
  zValidator("query", transactionsQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { page, pageSize, type, status, fromDate, toDate } = c.req.valid("query");

    try {
      const result = await getTransactionHistory(
        user.id,
        { type, status, fromDate, toDate },
        page,
        pageSize
      );

      // Format transactions for response
      const items = result.items.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: {
          paise: tx.amountPaise,
          rupees: tx.amountPaise / 100,
          formatted:
            (tx.type === "credit" || tx.type === "refund" || tx.type === "bonus" ? "+" : "-") +
            `₹${(tx.amountPaise / 100).toFixed(2)}`,
        },
        balanceAfter: {
          paise: tx.balanceAfterPaise,
          rupees: tx.balanceAfterPaise / 100,
        },
        description: tx.description,
        metadata: tx.metadata,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt,
      }));

      return c.json({
        items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to get transactions: ${errorMessage}` }, 500);
    }
  }
);

// ============================================================================
// POST /api/wallet/topup - Create Top-Up Order
// ============================================================================

walletApp.post("/topup", requireAuth, zValidator("json", createTopUpSchema), async (c) => {
  const user = c.get("user");
  const { amountPaise } = c.req.valid("json");

  if (!isRazorpayConfigured()) {
    return c.json({ error: "Payment gateway not configured" }, 503);
  }

  try {
    // Create Razorpay order
    const receipt = `wallet_${user.id}_${Date.now()}`;
    const razorpayOrder = await createRazorpayOrder({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        userId: user.id,
        type: "wallet_topup",
      },
    });

    // Create pending transaction
    await createPendingTopUp(user.id, amountPaise, razorpayOrder.id);

    return c.json(
      {
        orderId: razorpayOrder.id,
        amount: {
          paise: amountPaise,
          rupees: amountPaise / 100,
          formatted: `₹${(amountPaise / 100).toFixed(2)}`,
        },
        currency: "INR",
        keyId: getRazorpayKeyId(),
        prefill: {
          name: user.name,
          email: user.email,
          contact: user.phone || undefined,
        },
        notes: {
          userId: user.id,
          type: "wallet_topup",
        },
      },
      201
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to create top-up: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// POST /api/wallet/topup/verify - Verify Payment
// ============================================================================

walletApp.post("/topup/verify", requireAuth, zValidator("json", verifyTopUpSchema), async (c) => {
  const user = c.get("user");
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = c.req.valid("json");

  try {
    // Verify signature
    const isValid = verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      return c.json({ error: "Invalid payment signature" }, 400);
    }

    // Complete the pending transaction
    const transaction = await completePendingTopUp(razorpayOrderId, razorpayPaymentId);

    // Get updated balance
    const balance = await getWalletBalance(user.id);

    return c.json({
      message: "Payment verified successfully",
      transaction: {
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        amount: {
          paise: transaction.amountPaise,
          rupees: transaction.amountPaise / 100,
          formatted: `₹${(transaction.amountPaise / 100).toFixed(2)}`,
        },
      },
      balance: {
        paise: balance.balancePaise,
        rupees: balance.balanceRupees,
        formatted: `₹${balance.balanceRupees.toFixed(2)}`,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to verify payment: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/wallet/estimate-cost - Estimate AI Generation Cost
// ============================================================================

walletApp.get(
  "/estimate-cost",
  requireAuth,
  zValidator("query", estimateCostQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { provider, variationCount, falModel } = c.req.valid("query");

    try {
      const cost = await calculateGenerationCost(
        provider || "stable-diffusion",
        variationCount,
        falModel as FalModelType | undefined,
        user.id
      );

      return c.json({
        cost: {
          apiCostPaise: cost.apiCostPaise,
          apiCostRupees: cost.apiCostPaise / 100,
          markupPercentage: cost.markupPercentage / 100, // Convert from basis points
          userPricePaise: cost.userPricePaise,
          userPriceRupees: cost.userPriceRupees,
          formatted: `₹${cost.userPriceRupees.toFixed(2)}`,
        },
        exchangeRate: cost.exchangeRate,
        canUseFreeGeneration: cost.canUseFreeGeneration,
        provider: provider || "stable-diffusion",
        variationCount,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: `Failed to estimate cost: ${errorMessage}` }, 500);
    }
  }
);

// Export the router
export { walletApp };
export default walletApp;
