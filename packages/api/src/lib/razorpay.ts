/**
 * Razorpay Payment Integration Module
 *
 * Provides utilities for creating orders, verifying payments, and processing
 * webhooks with Razorpay payment gateway.
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import crypto from "crypto";

// ============================================================================
// Configuration
// ============================================================================

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const RAZORPAY_API_URL = "https://api.razorpay.com/v1";

/**
 * Check if Razorpay is properly configured
 */
export function isRazorpayConfigured(): boolean {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

// ============================================================================
// Types
// ============================================================================

/**
 * Razorpay order creation input
 */
export interface CreateRazorpayOrderInput {
  amount: number; // Amount in paise (smallest currency unit)
  currency?: string;
  receipt: string; // Our order ID for reference
  notes?: Record<string, string>;
}

/**
 * Razorpay order response
 */
export interface RazorpayOrder {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

/**
 * Payment verification input
 */
export interface PaymentVerificationInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Razorpay payment details
 */
export interface RazorpayPayment {
  id: string;
  entity: "payment";
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string;
  invoice_id: string | null;
  method: string; // card, upi, netbanking, wallet
  description: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null; // UPI VPA
  email: string;
  contact: string;
  notes: Record<string, string>;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  captured: boolean;
  card_id: string | null;
  card: RazorpayCard | null;
  created_at: number;
}

/**
 * Razorpay card details
 */
export interface RazorpayCard {
  id: string;
  entity: "card";
  name: string;
  last4: string;
  network: string; // Visa, Mastercard, etc.
  type: "credit" | "debit" | "prepaid";
  issuer: string | null;
}

/**
 * Razorpay refund input
 */
export interface CreateRefundInput {
  paymentId: string;
  amount?: number; // Partial refund amount in paise (optional, full refund if not specified)
  notes?: Record<string, string>;
  speed?: "normal" | "optimum";
}

/**
 * Razorpay refund response
 */
export interface RazorpayRefund {
  id: string;
  entity: "refund";
  amount: number;
  currency: string;
  payment_id: string;
  notes: Record<string, string>;
  receipt: string | null;
  acquirer_data: {
    arn: string | null;
  };
  created_at: number;
  speed_processed: "normal" | "instant";
  speed_requested: "normal" | "optimum";
  status: "pending" | "processed" | "failed";
}

/**
 * Webhook event types we handle
 */
export type RazorpayWebhookEvent =
  | "payment.authorized"
  | "payment.captured"
  | "payment.failed"
  | "refund.created"
  | "refund.processed"
  | "refund.failed"
  | "order.paid";

/**
 * Webhook payload structure
 */
export interface RazorpayWebhookPayload {
  entity: "event";
  account_id: string;
  event: RazorpayWebhookEvent;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPayment;
    };
    refund?: {
      entity: RazorpayRefund;
    };
    order?: {
      entity: RazorpayOrder;
    };
  };
  created_at: number;
}

// ============================================================================
// API Helper
// ============================================================================

/**
 * Make authenticated request to Razorpay API
 */
async function razorpayRequest<T>(
  method: "GET" | "POST",
  endpoint: string,
  body?: unknown
): Promise<T> {
  const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString(
    "base64"
  );

  const response = await fetch(`${RAZORPAY_API_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new RazorpayError(
      `Razorpay API error: ${response.status}`,
      response.status,
      error
    );
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for Razorpay-related errors
 */
export class RazorpayError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

// ============================================================================
// Order Functions
// ============================================================================

/**
 * Create a Razorpay order
 */
export async function createRazorpayOrder(
  input: CreateRazorpayOrderInput
): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  return razorpayRequest<RazorpayOrder>("POST", "/orders", {
    amount: input.amount,
    currency: input.currency || "INR",
    receipt: input.receipt,
    notes: input.notes || {},
  });
}

/**
 * Get a Razorpay order by ID
 */
export async function getRazorpayOrder(orderId: string): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  return razorpayRequest<RazorpayOrder>("GET", `/orders/${orderId}`);
}

// ============================================================================
// Payment Functions
// ============================================================================

/**
 * Get payment details by payment ID
 */
export async function getRazorpayPayment(
  paymentId: string
): Promise<RazorpayPayment> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  return razorpayRequest<RazorpayPayment>("GET", `/payments/${paymentId}`);
}

/**
 * Capture an authorized payment
 * Only needed if auto-capture is disabled
 */
export async function capturePayment(
  paymentId: string,
  amount: number,
  currency: string = "INR"
): Promise<RazorpayPayment> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  return razorpayRequest<RazorpayPayment>(
    "POST",
    `/payments/${paymentId}/capture`,
    { amount, currency }
  );
}

// ============================================================================
// Refund Functions
// ============================================================================

/**
 * Create a refund for a payment
 */
export async function createRefund(
  input: CreateRefundInput
): Promise<RazorpayRefund> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  const body: Record<string, unknown> = {};

  if (input.amount !== undefined) {
    body.amount = input.amount;
  }
  if (input.notes) {
    body.notes = input.notes;
  }
  if (input.speed) {
    body.speed = input.speed;
  }

  return razorpayRequest<RazorpayRefund>(
    "POST",
    `/payments/${input.paymentId}/refund`,
    body
  );
}

/**
 * Get refund details
 */
export async function getRefund(
  paymentId: string,
  refundId: string
): Promise<RazorpayRefund> {
  if (!isRazorpayConfigured()) {
    throw new RazorpayError("Razorpay is not configured");
  }

  return razorpayRequest<RazorpayRefund>(
    "GET",
    `/payments/${paymentId}/refunds/${refundId}`
  );
}

// ============================================================================
// Verification Functions
// ============================================================================

/**
 * Verify payment signature after checkout
 * This should be called when the frontend sends back the payment result
 */
export function verifyPaymentSignature(input: PaymentVerificationInput): boolean {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = input;

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(razorpaySignature)
  );
}

/**
 * Verify webhook signature
 * This should be called when receiving webhook events
 */
export function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    throw new RazorpayError("Webhook secret is not configured");
  }

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert amount to paise (Razorpay uses smallest currency unit)
 */
export function toPaise(amountInRupees: number | string): number {
  const amount = typeof amountInRupees === "string"
    ? parseFloat(amountInRupees)
    : amountInRupees;
  return Math.round(amount * 100);
}

/**
 * Convert paise to rupees
 */
export function toRupees(amountInPaise: number): number {
  return amountInPaise / 100;
}

/**
 * Get Razorpay key ID for frontend (safe to expose)
 */
export function getRazorpayKeyId(): string {
  return RAZORPAY_KEY_ID;
}

/**
 * Extract payment method details for storage
 */
export function extractPaymentDetails(payment: RazorpayPayment): {
  provider: "razorpay";
  transactionId: string;
  paymentId: string;
  orderId: string;
  method: string;
  lastFourDigits?: string;
  bankName?: string;
  walletName?: string;
  capturedAt: string;
} {
  return {
    provider: "razorpay",
    transactionId: payment.id,
    paymentId: payment.id,
    orderId: payment.order_id,
    method: payment.method,
    lastFourDigits: payment.card?.last4,
    bankName: payment.bank || undefined,
    walletName: payment.wallet || undefined,
    capturedAt: new Date(payment.created_at * 1000).toISOString(),
  };
}

// ============================================================================
// Constants
// ============================================================================

export const RAZORPAY_CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

export const RAZORPAY_CURRENCIES = [
  "INR", "USD", "EUR", "GBP", "SGD", "AED", "AUD", "CAD", "CNY", "JPY", "MYR"
] as const;

export type RazorpayCurrency = typeof RAZORPAY_CURRENCIES[number];
