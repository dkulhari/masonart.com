/**
 * Gift Card Database Schema
 *
 * A gift card is TENDER, not a discount. It is bought, carries a balance, is
 * partially consumable, and refunds return to it. It reduces the amount due
 * *after* tax — it never reduces a price, never reaches `resolveSalePrice`,
 * and is never written to a discount column.
 *
 * Money modelling mirrors `wallet.ts` exactly: integer paise, a denormalized
 * balance column, and an append-only ledger carrying a `balanceAfterPaise`
 * snapshot. That file is the precedent; this is not a second style.
 *
 * Design: docs/superpowers/specs/2026-08-06-gift-cards-design.md §4
 */

import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  pgEnum,
  index,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { orders } from "./orders";

// ============================================================================
// Enums
// ============================================================================

export const giftCardTransactionTypeEnum = pgEnum("gift_card_transaction_type", [
  "issue", // card created and funded
  "redeem", // debited towards an order
  "refund", // credited back from a refunded order
  "adjustment", // admin correction, always with a reason
  "void", // held balance released when an order never completed
]);

// ============================================================================
// Tables
// ============================================================================

export const giftCards = pgTable(
  "gift_card",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * sha256(normalized code + server pepper). The plaintext code is never
     * stored: a database dump then leaks nothing spendable, and nobody with
     * database access can spend a customer's balance.
     */
    codeHash: text("code_hash").notNull().unique(),
    /** Display and admin search only: "•••• 7QF3". */
    codeLast4: text("code_last4").notNull(),

    initialBalancePaise: integer("initial_balance_paise").notNull(),
    /** Denormalized, exactly as users.walletBalancePaise is. */
    balancePaise: integer("balance_paise").notNull(),
    currency: text("currency").default("INR").notNull(),

    /** Always null today (G4). The column exists so a policy change is config. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Admin kill switch. Rows are never deleted. */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),

    /** Set for an admin issuance; null when the card was bought. */
    issuedByUserId: text("issued_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Set for a customer purchase; null when an admin issued the card.
     *
     * Unique — see the constraint below. This is not merely a back-reference.
     */
    purchaseOrderId: uuid("purchase_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),

    recipientEmail: text("recipient_email"),
    recipientName: text("recipient_name"),
    senderName: text("sender_name"),
    message: text("message"),

    /** The date the buyer chose, copied here when the card is minted. */
    sendAt: timestamp("send_at", { withTimezone: true }),
    /** When the delivery email actually went out. Record, not guard. */
    sentAt: timestamp("sent_at", { withTimezone: true }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    last4Idx: index("gift_card_last4_idx").on(table.codeLast4),
    /**
     * Unique, not a plain index — this is the idempotency guarantee for
     * minting.
     *
     * A card is created at the moment it is delivered, and two callers can
     * reach that moment for the same order: a payment verification retried by
     * Razorpay or the client, and the scheduled-delivery sweep. Both attempt
     * the insert; the constraint decides, and the loser catches a unique
     * violation. Reading "does a card exist for this order yet" before
     * inserting races in exactly the window it is meant to protect, and a
     * duplicate here is duplicated money.
     */
    purchaseOrderUnique: unique("gift_card_purchase_order_id_unique").on(
      table.purchaseOrderId,
    ),
    sendAtIdx: index("gift_card_send_at_idx").on(table.sendAt),
  }),
);

/**
 * Append-only ledger. Mirrors wallet_transactions: the row is never updated,
 * and every entry snapshots the resulting balance so the denormalized
 * `gift_card.balancePaise` can always be reconciled against history.
 */
export const giftCardTransactions = pgTable(
  "gift_card_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    giftCardId: uuid("gift_card_id")
      .notNull()
      .references(() => giftCards.id, { onDelete: "cascade" }),
    type: giftCardTransactionTypeEnum("type").notNull(),
    /** Positive; `type` carries direction, as wallet_transactions does. */
    amountPaise: integer("amount_paise").notNull(),
    balanceAfterPaise: integer("balance_after_paise").notNull(),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    /** Who redeemed. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Admin, for adjustments. */
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    giftCardIdx: index("gift_card_transaction_gift_card_idx").on(
      table.giftCardId,
    ),
    orderIdx: index("gift_card_transaction_order_idx").on(table.orderId),
    /** Refund capping reads this triple; see the per-order cap in design §8. */
    cardOrderTypeIdx: index("gift_card_transaction_card_order_type_idx").on(
      table.giftCardId,
      table.orderId,
      table.type,
    ),
  }),
);

/**
 * What each card actually paid on an order. Several cards may pay one order.
 *
 * This is the tender record the shared cart schema already calls
 * `appliedGiftCardIds[]`. It is never mutated by a refund — it is the cap a
 * refund is checked against.
 */
export const orderGiftCards = pgTable(
  "order_gift_card",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    giftCardId: uuid("gift_card_id")
      .notNull()
      .references(() => giftCards.id, { onDelete: "restrict" }),
    /** What this card actually paid. Never mutated by a refund. */
    amountPaise: integer("amount_paise").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orderId, table.giftCardId] }),
  }),
);

// ============================================================================
// Relations
// ============================================================================

export const giftCardsRelations = relations(giftCards, ({ many, one }) => ({
  transactions: many(giftCardTransactions),
  purchaseOrder: one(orders, {
    fields: [giftCards.purchaseOrderId],
    references: [orders.id],
  }),
}));

export const giftCardTransactionsRelations = relations(
  giftCardTransactions,
  ({ one }) => ({
    giftCard: one(giftCards, {
      fields: [giftCardTransactions.giftCardId],
      references: [giftCards.id],
    }),
  }),
);

// ============================================================================
// Types and constants
// ============================================================================

export type GiftCard = typeof giftCards.$inferSelect;
export type NewGiftCard = typeof giftCards.$inferInsert;
export type GiftCardTransaction = typeof giftCardTransactions.$inferSelect;
export type NewGiftCardTransaction = typeof giftCardTransactions.$inferInsert;
export type OrderGiftCard = typeof orderGiftCards.$inferSelect;
export type GiftCardTransactionType =
  (typeof giftCardTransactionTypeEnum.enumValues)[number];

/** Bounds on a purchased card. Unbounded amounts are a fraud-testing surface. */
export const GIFT_CARD_MIN_PAISE = 50_000; // Rs 500
export const GIFT_CARD_MAX_PAISE = 5_000_000; // Rs 50,000
/** A send date further out than this is almost always a typo. */
export const GIFT_CARD_MAX_SCHEDULE_DAYS = 365;

export type GiftCardStatus = "active" | "spent" | "disabled" | "expired";

/** Derived, never stored — a status column would drift from the balance. */
export function giftCardStatus(
  card: Pick<GiftCard, "balancePaise" | "disabledAt" | "expiresAt">,
  now = new Date(),
): GiftCardStatus {
  if (card.disabledAt) return "disabled";
  if (card.expiresAt && card.expiresAt <= now) return "expired";
  if (card.balancePaise <= 0) return "spent";
  return "active";
}
