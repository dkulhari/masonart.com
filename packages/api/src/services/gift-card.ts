/**
 * Gift Card Service
 *
 * A gift card is TENDER, not a discount. Nothing in this service reduces a
 * price, and no value it produces may ever reach `resolveSalePrice` or a
 * discount column on an order. Its money moves against the amount due, after
 * tax.
 *
 * Modelled on `services/wallet.ts`: integer paise throughout, and every
 * balance change accompanied by an append-only ledger row in the same
 * transaction.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §4, §9
 */

import { eq, sql } from "drizzle-orm";

import { db } from "../database";
import {
  giftCards,
  giftCardTransactions,
  orderGiftCards,
  giftCardStatus,
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
  type GiftCard,
} from "../database/schema/gift-cards";
import {
  generateGiftCardCode,
  hashGiftCardCode,
  lastFour,
} from "../lib/gift-card-code";

/**
 * A gift card could not be used.
 *
 * Deliberately one error for every reason — unknown code, disabled, expired,
 * empty. Telling a caller which of those applies turns the endpoint into an
 * oracle for which codes exist.
 */
export class GiftCardError extends Error {
  constructor(message = "This gift card cannot be used") {
    super(message);
    this.name = "GiftCardError";
  }
}

export interface IssueGiftCardInput {
  amountPaise: number;
  /** Set for a customer purchase. */
  purchaseOrderId?: string | null;
  /** Set for an admin issuance. */
  issuedByUserId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  senderName?: string | null;
  message?: string | null;
  sendAt?: Date | null;
  description?: string;
}

/** How many times to regenerate before giving up on a unique code. */
const MAX_CODE_ATTEMPTS = 3;

/** Postgres reports the unique index by name; both shapes are checked. */
function isCodeCollision(error: unknown): boolean {
  const constraint = (error as { constraint_name?: string; constraint?: string })
    ?.constraint_name ??
    (error as { constraint?: string })?.constraint ??
    "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    constraint.includes("gift_card_code_hash") ||
    message.includes("gift_card_code_hash")
  );
}

/**
 * Creates a funded card.
 *
 * The returned `code` is the only time the plaintext exists on our side — it
 * is not stored and cannot be recovered. The caller must deliver it (email
 * for a purchase, one-time display for an admin issuance) or lose it.
 *
 * Two callers, one function:
 *   customer purchase — purchaseOrderId set, issuedByUserId null
 *   admin issuance    — issuedByUserId set, purchaseOrderId null
 */
export async function issueGiftCard(
  input: IssueGiftCardInput,
): Promise<{ card: GiftCard; code: string }> {
  if (!Number.isInteger(input.amountPaise)) {
    throw new Error("Gift card amount must be an integer number of paise");
  }
  if (
    input.amountPaise < GIFT_CARD_MIN_PAISE ||
    input.amountPaise > GIFT_CARD_MAX_PAISE
  ) {
    throw new Error(
      `Gift card amount must be between ${GIFT_CARD_MIN_PAISE} and ${GIFT_CARD_MAX_PAISE} paise`,
    );
  }

  // The unique index on codeHash is the authority. Pre-checking for a
  // collision would race with a concurrent issue; retrying on the violation
  // cannot. At 2^80 this loop effectively never runs twice.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateGiftCardCode();

    try {
      const card = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(giftCards)
          .values({
            codeHash: hashGiftCardCode(code),
            codeLast4: lastFour(code),
            initialBalancePaise: input.amountPaise,
            balancePaise: input.amountPaise,
            purchaseOrderId: input.purchaseOrderId ?? null,
            issuedByUserId: input.issuedByUserId ?? null,
            recipientEmail: input.recipientEmail ?? null,
            recipientName: input.recipientName ?? null,
            senderName: input.senderName ?? null,
            message: input.message ?? null,
            sendAt: input.sendAt ?? null,
            // expiresAt is deliberately never set (G4), and sentAt belongs to
            // the delivery sweep.
          })
          .returning();

        if (!created) throw new Error("Failed to create gift card");

        // Same transaction, always: a balance with no opening ledger entry
        // cannot be audited or reconciled, and finance cannot answer what the
        // business owes in unredeemed cards.
        await tx.insert(giftCardTransactions).values({
          giftCardId: created.id,
          type: "issue",
          amountPaise: input.amountPaise,
          balanceAfterPaise: input.amountPaise,
          orderId: input.purchaseOrderId ?? null,
          createdBy: input.issuedByUserId ?? null,
          description: input.description ?? "Gift card issued",
        });

        return created;
      });

      return { card, code };
    } catch (error) {
      if (!isCodeCollision(error)) throw error;
      // Collision on the unique index — generate a fresh code and retry.
    }
  }

  throw new Error("Failed to generate a unique gift card code");
}

// ============================================================================
// Redemption
// ============================================================================

export interface RedeemedCard {
  giftCardId: string;
  last4: string;
  amountPaise: number;
}

export interface GiftCardQuote {
  giftCardId: string;
  last4: string;
  balancePaise: number;
  applicablePaise: number;
}

/**
 * What a card could pay towards an amount — a quote, debiting nothing.
 *
 * This is what the checkout screen calls while the customer is still
 * deciding. The figure it returns is advisory and may be stale by the time
 * payment starts, which is why `redeemGiftCards` re-clamps under a lock
 * rather than trusting it.
 */
export async function quoteGiftCard(
  code: string,
  amountDuePaise: number,
): Promise<GiftCardQuote> {
  const card = await db.query.giftCards.findFirst({
    where: eq(giftCards.codeHash, hashGiftCardCode(code)),
  });

  if (!card || giftCardStatus(card) !== "active") {
    throw new GiftCardError();
  }

  return {
    giftCardId: card.id,
    last4: card.codeLast4,
    balancePaise: card.balancePaise,
    applicablePaise: Math.min(card.balancePaise, amountDuePaise),
  };
}

/**
 * Debits gift cards towards an order.
 *
 * Takes the caller's transaction rather than opening its own: the debit,
 * `orders.giftCardAmount` and the Razorpay order are one unit of work, and a
 * failure creating the payment must hand the customer their balance back.
 *
 * Two properties matter more than anything else here.
 *
 * The `FOR UPDATE` lock is the entire defence against double-spend. The same
 * code entered in two checkouts must debit once; without the lock both
 * transactions read the same balance, both debit it, and the business gives
 * the money away twice. A read-then-write without the lock is a race that
 * only appears under real traffic, which is exactly when it is expensive.
 *
 * The early return on existing applications is what makes a retry safe.
 * `routes/orders.ts` returns an already-created Razorpay order on a repeat
 * call, so this function genuinely runs twice for a single checkout.
 */
export async function redeemGiftCards(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: string,
  codes: string[],
  amountDuePaise: number,
  userId: string | null,
): Promise<RedeemedCard[]> {
  // Idempotency first, before any lock is taken.
  const existing = await tx
    .select()
    .from(orderGiftCards)
    .where(eq(orderGiftCards.orderId, orderId));

  if (existing.length > 0) {
    const cards = await tx.query.giftCards.findMany({
      where: (card, { inArray }) =>
        inArray(
          card.id,
          existing.map((row) => row.giftCardId),
        ),
    });

    return existing.map((row) => ({
      giftCardId: row.giftCardId,
      last4: cards.find((card) => card.id === row.giftCardId)?.codeLast4 ?? "",
      amountPaise: row.amountPaise,
    }));
  }

  const applied: RedeemedCard[] = [];
  let remaining = amountDuePaise;

  for (const code of codes) {
    if (remaining <= 0) break;

    // Read the row under the lock. A value read before the lock is already
    // stale by the time it is used.
    const locked = await tx.execute<{
      id: string;
      balance_paise: number;
      disabled_at: Date | null;
      expires_at: Date | null;
      code_last4: string;
    }>(sql`
      SELECT id, balance_paise, disabled_at, expires_at, code_last4
      FROM gift_card
      WHERE code_hash = ${hashGiftCardCode(code)}
      FOR UPDATE
    `);

    const row = locked[0];
    if (!row) throw new GiftCardError();

    // Raw SQL bypasses drizzle's column mapping, so timestamps arrive as
    // strings. `giftCardStatus` compares expiry against a Date — handing it a
    // string silently evaluates to "not expired" and lets a dead card pay for
    // an order.
    const balancePaise = Number(row.balance_paise);
    const status = giftCardStatus({
      balancePaise,
      disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    });
    if (status !== "active") throw new GiftCardError();

    // Re-clamp against the live balance: the quote shown at code entry is
    // advisory and may be hours old.
    const amount = Math.min(balancePaise, remaining);
    if (amount <= 0) continue;

    const balanceAfter = balancePaise - amount;

    await tx
      .update(giftCards)
      .set({ balancePaise: balanceAfter, updatedAt: new Date() })
      .where(eq(giftCards.id, row.id));

    await tx.insert(giftCardTransactions).values({
      giftCardId: row.id,
      type: "redeem",
      amountPaise: amount,
      balanceAfterPaise: balanceAfter,
      orderId,
      userId,
      description: "Redeemed towards order",
    });

    await tx.insert(orderGiftCards).values({
      orderId,
      giftCardId: row.id,
      amountPaise: amount,
    });

    applied.push({
      giftCardId: row.id,
      last4: row.code_last4,
      amountPaise: amount,
    });
    remaining -= amount;
  }

  return applied;
}
