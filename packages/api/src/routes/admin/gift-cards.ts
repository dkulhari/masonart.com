/**
 * Admin Gift Card Routes
 *
 * Issue, inspect, disable and correct gift cards, and answer the one
 * question nobody could answer before: how much does the business owe in
 * unredeemed cards.
 *
 * No response here carries a full code except the one-time issue reply.
 * Only the hash is stored, so a code cannot be looked up or resent — a lost
 * card is replaced by disabling it and issuing another.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §9
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { db } from "../../database";
import { requireAuth, requireAdmin, type AuthVariables } from "../../middleware/auth";
import {
  giftCards,
  giftCardTransactions,
  giftCardStatus,
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
} from "../../database/schema/gift-cards";
import { issueGiftCard, GiftCardError } from "../../services/gift-card";
import {
  hashGiftCardCode,
  normalizeGiftCardCode,
  formatGiftCardCode,
  GIFT_CARD_CODE_LENGTH,
} from "../../lib/gift-card-code";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// ============================================================================
// Validation
// ============================================================================

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  q: z.string().max(32).optional(),
});

const issueSchema = z.object({
  amountPaise: z.number().int().min(GIFT_CARD_MIN_PAISE).max(GIFT_CARD_MAX_PAISE),
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().max(120).optional(),
  senderName: z.string().max(120).optional(),
  message: z.string().max(500).optional(),
  /** Why this card was created. Goes straight onto the opening ledger row. */
  reason: z.string().min(3).max(500),
});

const adjustSchema = z.object({
  /** Signed: negative corrects an over-credit. */
  amountPaise: z.number().int().refine((value) => value !== 0, {
    message: "Adjustment cannot be zero",
  }),
  /** Mandatory — an unexplained balance change is unauditable. */
  reason: z.string().min(3).max(500),
});

// ============================================================================
// Routes
// ============================================================================

const adminGiftCardsApp = new Hono<{ Variables: AuthVariables }>();

adminGiftCardsApp.use("*", requireAuth);
adminGiftCardsApp.use("*", requireAdmin);

/** Shape returned everywhere except the issue reply. Never carries a code. */
function toPublic(card: typeof giftCards.$inferSelect) {
  return {
    id: card.id,
    last4: card.codeLast4,
    balancePaise: card.balancePaise,
    initialBalancePaise: card.initialBalancePaise,
    currency: card.currency,
    status: giftCardStatus(card),
    recipientEmail: card.recipientEmail,
    recipientName: card.recipientName,
    purchaseOrderId: card.purchaseOrderId,
    issuedByUserId: card.issuedByUserId,
    expiresAt: card.expiresAt,
    disabledAt: card.disabledAt,
    sentAt: card.sentAt,
    createdAt: card.createdAt,
  };
}

/**
 * Outstanding liability: what the business owes in unredeemed cards.
 *
 * Disabled cards are excluded because they cannot be spent. Expired ones are
 * not excluded here — nothing expires under G4, and quietly dropping them
 * from the figure would understate the liability the moment a policy changes.
 */
adminGiftCardsApp.get("/liability", async (c) => {
  const [row] = await db
    .select({
      liabilityPaise: sql<number>`COALESCE(SUM(${giftCards.balancePaise}), 0)::int`,
      cardCount: sql<number>`COUNT(*)::int`,
    })
    .from(giftCards)
    .where(isNull(giftCards.disabledAt));

  return c.json({
    liabilityPaise: row?.liabilityPaise ?? 0,
    cardCount: row?.cardCount ?? 0,
  });
});

/** List, with optional search by full code or by last four. */
adminGiftCardsApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { page, pageSize, q } = c.req.valid("query");

  let where: SQL | undefined;
  if (q) {
    const normalized = normalizeGiftCardCode(q);
    where =
      normalized.length === GIFT_CARD_CODE_LENGTH
        ? // A full code is hashed and looked up. It is never echoed back.
          eq(giftCards.codeHash, hashGiftCardCode(normalized))
        : eq(giftCards.codeLast4, normalized.slice(-4));
  }

  const rows = await db.query.giftCards.findMany({
    where,
    orderBy: [desc(giftCards.createdAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const [count] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(giftCards)
    .where(where);

  return c.json({
    giftCards: rows.map(toPublic),
    pagination: {
      page,
      pageSize,
      total: count?.total ?? 0,
    },
  });
});

/** One card, with its full ledger. */
adminGiftCardsApp.get("/:id", async (c) => {
  const card = await db.query.giftCards.findFirst({
    where: eq(giftCards.id, c.req.param("id")),
  });

  if (!card) return c.json({ error: "Gift card not found" }, 404);

  const ledger = await db.query.giftCardTransactions.findMany({
    where: eq(giftCardTransactions.giftCardId, card.id),
    orderBy: [desc(giftCardTransactions.createdAt)],
  });

  return c.json({ giftCard: toPublic(card), ledger });
});

/**
 * Issue a card by hand — support goodwill, compensation, a replacement for a
 * lost one.
 *
 * The plaintext code is in this response and nowhere else, ever. The caller
 * must show it to the admin immediately; there is no way to retrieve it.
 */
adminGiftCardsApp.post("/", zValidator("json", issueSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");

  try {
    const { card, code } = await issueGiftCard({
      amountPaise: input.amountPaise,
      issuedByUserId: user.id,
      recipientEmail: input.recipientEmail ?? null,
      recipientName: input.recipientName ?? null,
      senderName: input.senderName ?? null,
      message: input.message ?? null,
      description: `Issued by admin: ${input.reason}`,
    });

    return c.json({
      giftCard: toPublic(card),
      // Shown once. Not stored, not recoverable, not resendable.
      code: formatGiftCardCode(code),
    });
  } catch (error) {
    console.error("Error issuing gift card:", error);
    return c.json({ error: "Failed to issue gift card" }, 500);
  }
});

/** Disable a card. Rows are never deleted; the balance stays for auditing. */
adminGiftCardsApp.post("/:id/disable", async (c) => {
  const [updated] = await db
    .update(giftCards)
    .set({ disabledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(giftCards.id, c.req.param("id")), isNull(giftCards.disabledAt)))
    .returning();

  if (!updated) {
    return c.json({ error: "Gift card not found or already disabled" }, 404);
  }

  return c.json({ giftCard: toPublic(updated) });
});

adminGiftCardsApp.post("/:id/enable", async (c) => {
  const [updated] = await db
    .update(giftCards)
    .set({ disabledAt: null, updatedAt: new Date() })
    .where(eq(giftCards.id, c.req.param("id")))
    .returning();

  if (!updated) return c.json({ error: "Gift card not found" }, 404);

  return c.json({ giftCard: toPublic(updated) });
});

/**
 * Correct a balance.
 *
 * Mirrors adjustWalletBalance. The reason is required at the schema rather
 * than the UI, because an unexplained balance change cannot be audited later
 * and this is the one endpoint that can create money from nothing.
 */
adminGiftCardsApp.post(
  "/:id/adjust",
  zValidator("json", adjustSchema),
  async (c) => {
    const user = c.get("user");
    const { amountPaise, reason } = c.req.valid("json");
    const id = c.req.param("id");

    try {
      const result = await db.transaction(async (tx) => {
        // Locked, like every other balance change in this feature.
        const locked = await tx.execute<{ balance_paise: number }>(sql`
          SELECT balance_paise FROM gift_card WHERE id = ${id} FOR UPDATE
        `);

        const row = locked[0];
        if (!row) throw new GiftCardError("Gift card not found");

        const balanceAfter = Number(row.balance_paise) + amountPaise;
        if (balanceAfter < 0) {
          throw new GiftCardError("Adjustment would leave a negative balance");
        }

        const [updated] = await tx
          .update(giftCards)
          .set({ balancePaise: balanceAfter, updatedAt: new Date() })
          .where(eq(giftCards.id, id))
          .returning();

        await tx.insert(giftCardTransactions).values({
          giftCardId: id,
          type: "adjustment",
          amountPaise: Math.abs(amountPaise),
          balanceAfterPaise: balanceAfter,
          createdBy: user.id,
          description: `Admin adjustment (${amountPaise > 0 ? "+" : "-"}): ${reason}`,
        });

        return updated!;
      });

      return c.json({ giftCard: toPublic(result) });
    } catch (error) {
      if (error instanceof GiftCardError) {
        return c.json({ error: error.message }, 400);
      }
      console.error("Error adjusting gift card:", error);
      return c.json({ error: "Failed to adjust gift card" }, 500);
    }
  },
);

export { adminGiftCardsApp };
export default adminGiftCardsApp;
