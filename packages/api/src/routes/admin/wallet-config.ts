/**
 * Admin Wallet Configuration Routes
 *
 * Provides admin endpoints for wallet configuration:
 * - GET /api/admin/wallet-config - List all configs
 * - PUT /api/admin/wallet-config/:key - Update config
 * - GET /api/admin/wallet-stats - Usage statistics
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql, and, desc, gte, lte } from "drizzle-orm";

import { db } from "../../database";
import {
  walletPricingConfig,
  walletTransactions,
  users,
  WALLET_CONFIG_KEYS,
  WALLET_CONFIG_DEFAULTS,
} from "../../database/schema";
import { requireAuth, requireAdmin, type AuthVariables } from "../../middleware/auth";
import { deleteCached } from "../../lib/redis";

// ============================================================================
// Validation Schemas
// ============================================================================

const updateConfigSchema = z.object({
  valueInt: z.coerce.number().int(),
  description: z.string().optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
});

const statsQuerySchema = z.object({
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

const adminWalletConfigApp = new Hono<{ Variables: AuthVariables }>();

// All routes require admin access
adminWalletConfigApp.use("*", requireAuth, requireAdmin);

// ============================================================================
// GET /api/admin/wallet-config - List All Configs
// ============================================================================

adminWalletConfigApp.get("/", async (c) => {
  try {
    // Get all current configs
    const configs = await db
      .select()
      .from(walletPricingConfig)
      .where(
        sql`(${walletPricingConfig.effectiveTo} IS NULL OR ${walletPricingConfig.effectiveTo} > NOW())`
      )
      .orderBy(desc(walletPricingConfig.effectiveFrom));

    // Group by key, keeping only the most recent
    const configMap = new Map<string, (typeof configs)[0] & { defaultValue: number }>();

    for (const config of configs) {
      if (!configMap.has(config.key)) {
        configMap.set(config.key, {
          ...config,
          defaultValue:
            WALLET_CONFIG_DEFAULTS[config.key as keyof typeof WALLET_CONFIG_DEFAULTS] ?? 0,
        });
      }
    }

    // Add missing default configs
    for (const [key, defaultValue] of Object.entries(WALLET_CONFIG_DEFAULTS)) {
      if (!configMap.has(key)) {
        configMap.set(key, {
          id: "",
          key,
          valueInt: defaultValue,
          description: getConfigDescription(key),
          effectiveFrom: new Date(),
          effectiveTo: null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          defaultValue,
        });
      }
    }

    const items = Array.from(configMap.values()).map((config) => ({
      key: config.key,
      valueInt: config.valueInt,
      displayValue: formatConfigValue(config.key, config.valueInt),
      description: config.description || getConfigDescription(config.key),
      defaultValue: config.defaultValue,
      effectiveFrom: config.effectiveFrom,
      effectiveTo: config.effectiveTo,
      isDefault: config.id === "",
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    }));

    return c.json({ items });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to get configs: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// PUT /api/admin/wallet-config/:key - Update Config
// ============================================================================

adminWalletConfigApp.put("/:key", zValidator("json", updateConfigSchema), async (c) => {
  const user = c.get("user");
  const { key } = c.req.param();
  const { valueInt, description, effectiveFrom, effectiveTo } = c.req.valid("json");

  // Validate key
  const validKeys = Object.values(WALLET_CONFIG_KEYS);
  if (!validKeys.includes(key as (typeof validKeys)[number])) {
    return c.json({ error: `Invalid config key: ${key}` }, 400);
  }

  try {
    // End any existing config for this key
    await db
      .update(walletPricingConfig)
      .set({
        effectiveTo: effectiveFrom || new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(walletPricingConfig.key, key), sql`${walletPricingConfig.effectiveTo} IS NULL`)
      );

    // Create new config
    const [newConfig] = await db
      .insert(walletPricingConfig)
      .values({
        key,
        valueInt,
        description: description || getConfigDescription(key),
        effectiveFrom: effectiveFrom || new Date(),
        effectiveTo: effectiveTo,
        createdBy: user.id,
      })
      .returning();

    // Invalidate cache
    await deleteCached(`wallet-config:${key}`);

    return c.json({
      message: "Config updated successfully",
      config: {
        key: newConfig?.key,
        valueInt: newConfig?.valueInt,
        displayValue: formatConfigValue(key, valueInt),
        effectiveFrom: newConfig?.effectiveFrom,
        effectiveTo: newConfig?.effectiveTo,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to update config: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// GET /api/admin/wallet-stats - Usage Statistics
// ============================================================================

adminWalletConfigApp.get("/stats", zValidator("query", statsQuerySchema), async (c) => {
  const { fromDate, toDate } = c.req.valid("query");

  // Default to last 30 days
  const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toDate || new Date();

  try {
    // Transaction stats by type
    const transactionStats = await db
      .select({
        type: walletTransactions.type,
        status: walletTransactions.status,
        count: sql<number>`count(*)::int`,
        totalPaise: sql<number>`sum(${walletTransactions.amountPaise})::int`,
      })
      .from(walletTransactions)
      .where(and(gte(walletTransactions.createdAt, from), lte(walletTransactions.createdAt, to)))
      .groupBy(walletTransactions.type, walletTransactions.status);

    // User wallet stats
    const userStats = await db
      .select({
        totalUsers: sql<number>`count(*)::int`,
        usersWithBalance: sql<number>`count(*) filter (where ${users.walletBalancePaise} > 0)::int`,
        usersWithFreeGens: sql<number>`count(*) filter (where ${users.freeGenerationsRemaining} > 0)::int`,
        totalBalancePaise: sql<number>`sum(${users.walletBalancePaise})::int`,
        totalTopUpsPaise: sql<number>`sum(${users.totalWalletTopUpsPaise})::int`,
        totalSpentPaise: sql<number>`sum(${users.totalWalletSpentPaise})::int`,
      })
      .from(users);

    // Daily transaction volume
    const dailyVolume = await db
      .select({
        date: sql<string>`date_trunc('day', ${walletTransactions.createdAt})::date`,
        credits: sql<number>`sum(case when ${walletTransactions.type} = 'credit' then ${walletTransactions.amountPaise} else 0 end)::int`,
        debits: sql<number>`sum(case when ${walletTransactions.type} = 'debit' then ${walletTransactions.amountPaise} else 0 end)::int`,
        refunds: sql<number>`sum(case when ${walletTransactions.type} = 'refund' then ${walletTransactions.amountPaise} else 0 end)::int`,
      })
      .from(walletTransactions)
      .where(
        and(
          gte(walletTransactions.createdAt, from),
          lte(walletTransactions.createdAt, to),
          eq(walletTransactions.status, "completed")
        )
      )
      .groupBy(sql`date_trunc('day', ${walletTransactions.createdAt})`)
      .orderBy(sql`date_trunc('day', ${walletTransactions.createdAt})`);

    // Summary calculations
    const completedStats = transactionStats.filter((s) => s.status === "completed");
    const totalCredits = completedStats.find((s) => s.type === "credit")?.totalPaise ?? 0;
    const totalDebits = completedStats.find((s) => s.type === "debit")?.totalPaise ?? 0;
    const totalRefunds = completedStats.find((s) => s.type === "refund")?.totalPaise ?? 0;

    return c.json({
      period: {
        from,
        to,
      },
      summary: {
        totalCredits: {
          paise: totalCredits,
          rupees: totalCredits / 100,
        },
        totalDebits: {
          paise: totalDebits,
          rupees: totalDebits / 100,
        },
        totalRefunds: {
          paise: totalRefunds,
          rupees: totalRefunds / 100,
        },
        netRevenue: {
          paise: totalDebits - totalRefunds,
          rupees: (totalDebits - totalRefunds) / 100,
        },
      },
      users: {
        total: userStats[0]?.totalUsers ?? 0,
        withBalance: userStats[0]?.usersWithBalance ?? 0,
        withFreeGenerations: userStats[0]?.usersWithFreeGens ?? 0,
        totalHeldBalance: {
          paise: userStats[0]?.totalBalancePaise ?? 0,
          rupees: (userStats[0]?.totalBalancePaise ?? 0) / 100,
        },
        lifetimeTopUps: {
          paise: userStats[0]?.totalTopUpsPaise ?? 0,
          rupees: (userStats[0]?.totalTopUpsPaise ?? 0) / 100,
        },
        lifetimeSpent: {
          paise: userStats[0]?.totalSpentPaise ?? 0,
          rupees: (userStats[0]?.totalSpentPaise ?? 0) / 100,
        },
      },
      transactionsByType: transactionStats,
      dailyVolume: dailyVolume.map((d) => ({
        date: d.date,
        credits: { paise: d.credits, rupees: d.credits / 100 },
        debits: { paise: d.debits, rupees: d.debits / 100 },
        refunds: { paise: d.refunds, rupees: d.refunds / 100 },
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to get stats: ${errorMessage}` }, 500);
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

function getConfigDescription(key: string): string {
  const descriptions: Record<string, string> = {
    [WALLET_CONFIG_KEYS.AI_GENERATION_MARKUP]:
      "Markup percentage on AI generation API cost (basis points: 5000 = 50%)",
    [WALLET_CONFIG_KEYS.FREE_GENERATIONS_NEW_USER]: "Number of free AI generations for new users",
    [WALLET_CONFIG_KEYS.MINIMUM_TOPUP_PAISE]: "Minimum wallet top-up amount in paise",
    [WALLET_CONFIG_KEYS.MAXIMUM_TOPUP_PAISE]: "Maximum wallet top-up amount in paise",
  };
  return descriptions[key] || "";
}

function formatConfigValue(key: string, value: number): string {
  switch (key) {
    case WALLET_CONFIG_KEYS.AI_GENERATION_MARKUP:
      return `${value / 100}%`;
    case WALLET_CONFIG_KEYS.FREE_GENERATIONS_NEW_USER:
      return `${value} generations`;
    case WALLET_CONFIG_KEYS.MINIMUM_TOPUP_PAISE:
    case WALLET_CONFIG_KEYS.MAXIMUM_TOPUP_PAISE:
      return `₹${value / 100}`;
    default:
      return String(value);
  }
}

// Export the router
export { adminWalletConfigApp };
export default adminWalletConfigApp;
