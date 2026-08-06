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

import { db } from "../database";
import {
  giftCards,
  giftCardTransactions,
  GIFT_CARD_MIN_PAISE,
  GIFT_CARD_MAX_PAISE,
  type GiftCard,
} from "../database/schema/gift-cards";
import {
  generateGiftCardCode,
  hashGiftCardCode,
  lastFour,
} from "../lib/gift-card-code";

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
