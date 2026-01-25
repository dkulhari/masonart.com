/**
 * Wallet Middleware
 *
 * Provides Hono middleware for wallet-related checks:
 * - requireSufficientFunds: Ensures user has enough balance or free generations
 */

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "./auth";
import { hasSufficientFunds, calculateGenerationCost } from "../services/wallet";
import type { AIModelProvider } from "../database/schema/ai-generations";
import type { FalModelType } from "../ai/generator";

// ============================================================================
// Types
// ============================================================================

/**
 * Variables added by wallet middleware
 */
export interface WalletVariables {
  /** Calculated cost for the generation */
  generationCost: {
    apiCostPaise: number;
    markupPercentage: number;
    userPricePaise: number;
    userPriceRupees: number;
    exchangeRate: number;
    canUseFreeGeneration: boolean;
  };
  /** Whether user will use free generation */
  willUseFreeGeneration: boolean;
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Create a 402 Payment Required error
 */
function createPaymentRequiredError(
  message: string,
  details?: {
    requiredPaise?: number;
    currentBalance?: number;
    freeGenerationsRemaining?: number;
  }
): HTTPException {
  return new HTTPException(402, {
    message,
    res: new Response(
      JSON.stringify({
        error: "Payment Required",
        message,
        code: "INSUFFICIENT_FUNDS",
        ...details,
      }),
      {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }
    ),
  });
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Require sufficient funds for AI generation
 *
 * Checks if user has free generations available OR sufficient wallet balance.
 * Must be used after requireAuth middleware.
 *
 * @param getParams - Function to extract generation params from request
 *
 * @example
 * ```typescript
 * app.post('/api/ai/generate',
 *   requireAuth,
 *   requireSufficientFunds((c) => ({
 *     provider: c.req.valid('json').modelProvider,
 *     variationCount: c.req.valid('json').variationCount,
 *   })),
 *   async (c) => {
 *     const { generationCost, willUseFreeGeneration } = c.var;
 *     // ... process generation
 *   }
 * );
 * ```
 */
export function requireSufficientFunds(
  getParams: (c: {
    req: { valid: (type: "json") => unknown };
    get: (key: "user") => AuthVariables["user"];
  }) => {
    provider?: AIModelProvider;
    variationCount?: number;
    falModel?: FalModelType;
  }
) {
  return createMiddleware<{
    Variables: AuthVariables & WalletVariables;
  }>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    // Get generation params from request
    const params = getParams(c as Parameters<typeof getParams>[0]);
    const provider = params.provider || "stable-diffusion";
    const variationCount = params.variationCount || 4;
    const falModel = params.falModel;

    // Calculate cost
    const cost = await calculateGenerationCost(
      provider,
      variationCount,
      falModel,
      user.id
    );

    // Check funds
    const fundsCheck = await hasSufficientFunds(user.id, cost.userPricePaise);

    if (!fundsCheck.sufficient) {
      throw createPaymentRequiredError(
        `Insufficient funds. Required: ₹${(cost.userPricePaise / 100).toFixed(2)}, Available: ₹${(fundsCheck.currentBalance / 100).toFixed(2)}`,
        {
          requiredPaise: cost.userPricePaise,
          currentBalance: fundsCheck.currentBalance,
          freeGenerationsRemaining: fundsCheck.freeGenerationsRemaining,
        }
      );
    }

    // Set variables for downstream handlers
    c.set("generationCost", cost);
    c.set("willUseFreeGeneration", fundsCheck.canUseFreeGeneration);

    await next();
  });
}

/**
 * Simple balance check middleware
 *
 * Just checks if user has any balance or free generations.
 * Useful for pages that need to know wallet status without specific amount.
 */
export const checkWalletStatus = createMiddleware<{
  Variables: AuthVariables & {
    walletStatus: {
      hasBalance: boolean;
      hasFreeGenerations: boolean;
      balancePaise: number;
      freeGenerationsRemaining: number;
    };
  };
}>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    c.set("walletStatus", {
      hasBalance: false,
      hasFreeGenerations: false,
      balancePaise: 0,
      freeGenerationsRemaining: 0,
    });
  } else {
    const fundsCheck = await hasSufficientFunds(user.id, 0);
    c.set("walletStatus", {
      hasBalance: fundsCheck.currentBalance > 0,
      hasFreeGenerations: fundsCheck.freeGenerationsRemaining > 0,
      balancePaise: fundsCheck.currentBalance,
      freeGenerationsRemaining: fundsCheck.freeGenerationsRemaining,
    });
  }

  await next();
});
