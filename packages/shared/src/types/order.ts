/**
 * Order Types for chobi.art Platform
 *
 * Defines all order-related types including cart, checkout, order items,
 * shipping, payment, and photo approval workflow based on the requirements specification.
 */

import type { Address, PaymentMethodType, CardBrand } from './user';
import type {
  ProductConfiguration,
  ProductPriceBreakdown,
  ProductSize,
  FrameType,
  MatOption,
  GlassOption,
} from './product';

// ============================================================================
// Enums & Literal Types
// ============================================================================

/**
 * Order status types
 */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'awaiting-approval'
  | 'approved'
  | 'production'
  | 'ready-to-ship'
  | 'shipped'
  | 'out-for-delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'on-hold';

/**
 * Payment status types
 */
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'partially-refunded'
  | 'cancelled';

/**
 * Delivery type options
 */
export type DeliveryType =
  | 'standard'
  | 'express'
  | 'scheduled';

/**
 * Photo approval status
 */
export type ApprovalStatus =
  | 'not-required'
  | 'pending-production'
  | 'production-complete'
  | 'pending-approval'
  | 'approved'
  | 'revision-requested'
  | 'rejected';

/**
 * Return/refund reason types
 */
export type ReturnReason =
  | 'damaged'
  | 'wrong-item'
  | 'quality-issue'
  | 'not-as-described'
  | 'changed-mind'
  | 'wrong-size'
  | 'other';

/**
 * Discount type
 */
export type DiscountType = 'percentage' | 'fixed' | 'free-shipping';

// ============================================================================
// Cart Types
// ============================================================================

/**
 * Cart item definition
 */
export interface CartItem {
  /** Unique cart item ID */
  id: string;
  /** Product ID */
  productId: string;
  /** Product title (denormalized) */
  productTitle: string;
  /** Product slug for URL */
  productSlug: string;
  /** Product main image URL */
  productImageUrl: string;
  /** Product SKU */
  productSku: string;
  /** Whether this is an AI-generated product */
  isAIGenerated: boolean;
  /** AI generation ID (if AI-generated) */
  aiGenerationId?: string;
  /** Product configuration (size, frame, etc.) */
  configuration: ProductConfiguration;
  /** Selected size details */
  size: ProductSize;
  /** Selected frame type */
  frameType?: FrameType;
  /** Selected mat option */
  matOption?: MatOption;
  /** Selected glass option */
  glassOption?: GlassOption;
  /** Price breakdown */
  priceBreakdown: ProductPriceBreakdown;
  /** Quantity */
  quantity: number;
  /** Custom instructions from customer */
  customInstructions?: string;
  /** Gift wrapping requested */
  isGiftWrapped: boolean;
  /** Gift message (if gift wrapped) */
  giftMessage?: string;
  /** When the item was added to cart */
  addedAt: Date;
  /** When the item was last updated */
  updatedAt: Date;
}

/**
 * Shopping cart definition
 */
export interface Cart {
  /** Unique cart ID */
  id: string;
  /** User ID (null for guest carts) */
  userId?: string;
  /** Session ID (for guest carts) */
  sessionId?: string;
  /** Cart items */
  items: CartItem[];
  /** Applied coupon code */
  couponCode?: string;
  /** Applied discount details */
  discount?: AppliedDiscount;
  /** Cart subtotal before discounts */
  subtotal: number;
  /** Total discount amount */
  discountAmount: number;
  /** Tax amount */
  taxAmount: number;
  /** Shipping estimate (before address) */
  estimatedShipping?: number;
  /** Cart total */
  total: number;
  /** Currency code */
  currency: string;
  /** Applied gift card IDs */
  appliedGiftCardIds?: string[];
  /** Gift card amount applied */
  giftCardAmount?: number;
  /** When the cart was created */
  createdAt: Date;
  /** When the cart was last updated */
  updatedAt: Date;
  /** When the cart expires */
  expiresAt?: Date;
}

// ============================================================================
// Discount & Coupon Types
// ============================================================================

/**
 * Applied discount details
 */
export interface AppliedDiscount {
  /** Coupon code used */
  code: string;
  /** Discount type */
  type: DiscountType;
  /** Discount value */
  value: number;
  /** Discount description */
  description: string;
  /** Maximum discount amount (for percentage) */
  maxDiscount?: number;
  /** Minimum order value required */
  minOrderValue?: number;
}

/**
 * Coupon definition
 */
export interface Coupon {
  /** Unique identifier */
  id: string;
  /** Coupon code */
  code: string;
  /** Description */
  description: string;
  /** Discount type */
  type: DiscountType;
  /** Discount value */
  value: number;
  /** Maximum discount amount */
  maxDiscount?: number;
  /** Minimum order value */
  minOrderValue?: number;
  /** Valid from date */
  validFrom: Date;
  /** Valid until date */
  validUntil: Date;
  /** Maximum usage count */
  maxUsageCount?: number;
  /** Current usage count */
  usageCount: number;
  /** Per-user usage limit */
  perUserLimit?: number;
  /** Applicable product IDs (empty = all) */
  applicableProductIds?: string[];
  /** Applicable category slugs (empty = all) */
  applicableCategorySlugs?: string[];
  /** First-time customer only */
  firstTimeOnly?: boolean;
  /** Whether the coupon is active */
  isActive: boolean;
  /** When the coupon was created */
  createdAt: Date;
}

// ============================================================================
// Gift Card Types
// ============================================================================

/**
 * Gift card definition
 */
export interface GiftCard {
  /** Unique identifier */
  id: string;
  /** Gift card code */
  code: string;
  /** Original balance */
  originalBalance: number;
  /** Current balance */
  currentBalance: number;
  /** Currency code */
  currency: string;
  /** Purchaser user ID */
  purchasedByUserId?: string;
  /** Recipient email */
  recipientEmail?: string;
  /** Personal message */
  message?: string;
  /** Whether the gift card has been activated */
  isActivated: boolean;
  /** When the gift card was activated */
  activatedAt?: Date;
  /** Expiry date */
  expiresAt?: Date;
  /** When the gift card was created */
  createdAt: Date;
}

// ============================================================================
// Shipping Types
// ============================================================================

/**
 * Shipping rate option
 */
export interface ShippingRate {
  /** Rate ID */
  id: string;
  /** Carrier name */
  carrier: string;
  /** Service name */
  serviceName: string;
  /** Delivery type */
  deliveryType: DeliveryType;
  /** Shipping cost */
  cost: number;
  /** Currency code */
  currency: string;
  /** Estimated delivery days (min) */
  estimatedDaysMin: number;
  /** Estimated delivery days (max) */
  estimatedDaysMax: number;
  /** Estimated delivery date */
  estimatedDeliveryDate?: Date;
  /** Whether tracking is available */
  hasTracking: boolean;
}

/**
 * Shipping details for an order
 */
export interface ShippingDetails {
  /** Shipping address */
  address: Address;
  /** Selected shipping rate */
  shippingRate: ShippingRate;
  /** Actual shipping cost charged */
  shippingCost: number;
  /** Carrier tracking number */
  trackingNumber?: string;
  /** Tracking URL */
  trackingUrl?: string;
  /** Carrier name */
  carrier?: string;
  /** Shipping label URL */
  labelUrl?: string;
  /** Scheduled delivery date (if scheduled) */
  scheduledDeliveryDate?: Date;
  /** Delivery instructions */
  deliveryInstructions?: string;
  /** When the order was shipped */
  shippedAt?: Date;
  /** When the order was delivered */
  deliveredAt?: Date;
}

// ============================================================================
// Payment Types
// ============================================================================

/**
 * Payment details for an order
 */
export interface PaymentDetails {
  /** Payment ID from gateway */
  paymentId: string;
  /** Payment gateway used */
  gateway: 'razorpay' | 'stripe' | 'payu';
  /** Payment method type */
  methodType: PaymentMethodType;
  /** Card brand (if card) */
  cardBrand?: CardBrand;
  /** Last 4 digits (if card) */
  last4?: string;
  /** Bank name (if netbanking/wallet) */
  bankName?: string;
  /** UPI ID (if UPI) */
  upiId?: string;
  /** Payment status */
  status: PaymentStatus;
  /** Amount authorized */
  amountAuthorized: number;
  /** Amount captured */
  amountCaptured: number;
  /** Amount refunded */
  amountRefunded: number;
  /** Currency code */
  currency: string;
  /** Gateway transaction ID */
  gatewayTransactionId?: string;
  /** Gateway order ID */
  gatewayOrderId?: string;
  /** Payment receipt URL */
  receiptUrl?: string;
  /** When the payment was created */
  createdAt: Date;
  /** When the payment was last updated */
  updatedAt: Date;
}

// ============================================================================
// Order Item Types
// ============================================================================

/**
 * Order item with production details
 */
export interface OrderItem {
  /** Unique order item ID */
  id: string;
  /** Order ID this item belongs to */
  orderId: string;
  /** Product ID */
  productId: string;
  /** Product title (snapshot) */
  productTitle: string;
  /** Product slug (snapshot) */
  productSlug: string;
  /** Product SKU (snapshot) */
  productSku: string;
  /** Product image URL (snapshot) */
  productImageUrl: string;
  /** Whether this is an AI-generated product */
  isAIGenerated: boolean;
  /** AI generation ID (if AI-generated) */
  aiGenerationId?: string;
  /** Product configuration */
  configuration: ProductConfiguration;
  /** Selected size details (snapshot) */
  size: ProductSize;
  /** Selected frame type */
  frameType?: FrameType;
  /** Selected mat option */
  matOption?: MatOption;
  /** Selected glass option */
  glassOption?: GlassOption;
  /** Price breakdown (snapshot) */
  priceBreakdown: ProductPriceBreakdown;
  /** Quantity */
  quantity: number;
  /** Unit price at time of order */
  unitPrice: number;
  /** Total price for this item */
  totalPrice: number;
  /** Custom instructions */
  customInstructions?: string;
  /** Gift wrapped */
  isGiftWrapped: boolean;
  /** Gift message */
  giftMessage?: string;
  /** Approval status for made-to-order items */
  approvalStatus: ApprovalStatus;
  /** Production photos/videos */
  productionMedia?: ProductionMedia[];
  /** Customer approval notes */
  approvalNotes?: string;
  /** When customer approved */
  approvedAt?: Date;
}

/**
 * Production media for approval workflow
 */
export interface ProductionMedia {
  /** Media ID */
  id: string;
  /** Media type */
  type: 'photo' | 'video';
  /** Media URL */
  url: string;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Caption/description */
  caption?: string;
  /** When the media was uploaded */
  uploadedAt: Date;
}

// ============================================================================
// Order Types
// ============================================================================

/**
 * Order timeline event
 */
export interface OrderEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: OrderStatus | 'note' | 'payment' | 'approval';
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Who triggered the event */
  actorType: 'system' | 'customer' | 'admin';
  /** Actor user ID (if applicable) */
  actorUserId?: string;
  /** When the event occurred */
  occurredAt: Date;
}

/**
 * Complete order definition
 */
export interface Order {
  /** Unique identifier */
  id: string;
  /** Order number (human-readable) */
  orderNumber: string;
  /** User ID */
  userId: string;
  /** User email (snapshot) */
  userEmail: string;
  /** User name (snapshot) */
  userName: string;
  /** Order status */
  status: OrderStatus;
  /** Order items */
  items: OrderItem[];
  /** Number of items */
  itemCount: number;
  /** Shipping details */
  shipping: ShippingDetails;
  /** Payment details */
  payment?: PaymentDetails;
  /** Billing address (if different from shipping) */
  billingAddress?: Address;
  /** Applied coupon code */
  couponCode?: string;
  /** Discount amount */
  discountAmount: number;
  /** Subtotal before discounts and shipping */
  subtotal: number;
  /** Tax amount */
  taxAmount: number;
  /** Shipping cost */
  shippingCost: number;
  /** Gift card amount applied */
  giftCardAmount: number;
  /** Order total */
  total: number;
  /** Currency code */
  currency: string;
  /** Trade discount applied */
  tradeDiscountAmount?: number;
  /** Whether this is a trade order */
  isTradeOrder: boolean;
  /** Order notes from customer */
  customerNotes?: string;
  /** Internal notes */
  internalNotes?: string;
  /** Order timeline events */
  events: OrderEvent[];
  /** Invoice URL */
  invoiceUrl?: string;
  /** When the order was created */
  createdAt: Date;
  /** When the order was last updated */
  updatedAt: Date;
  /** Estimated delivery date */
  estimatedDeliveryDate?: Date;
}

/**
 * Order for list display (minimal data)
 */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  itemCount: number;
  total: number;
  currency: string;
  firstItemImage: string;
  createdAt: Date;
  estimatedDeliveryDate?: Date;
}

/**
 * Order for admin list (additional details)
 */
export interface AdminOrderListItem extends OrderListItem {
  userId: string;
  userName: string;
  userEmail: string;
  paymentStatus?: PaymentStatus;
  hasApprovalPending: boolean;
  isTradeOrder: boolean;
  shippingCity?: string;
  shippingState?: string;
}

// ============================================================================
// Return & Refund Types
// ============================================================================

/**
 * Return request status
 */
export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'pickup-scheduled'
  | 'picked-up'
  | 'received'
  | 'refund-initiated'
  | 'completed';

/**
 * Return request definition
 */
export interface ReturnRequest {
  /** Unique identifier */
  id: string;
  /** Order ID */
  orderId: string;
  /** Order item IDs being returned */
  orderItemIds: string[];
  /** Return reason */
  reason: ReturnReason;
  /** Detailed reason description */
  reasonDescription?: string;
  /** Customer photos of the issue */
  customerPhotoUrls?: string[];
  /** Return status */
  status: ReturnStatus;
  /** Refund amount requested */
  refundAmountRequested: number;
  /** Refund amount approved */
  refundAmountApproved?: number;
  /** Admin notes */
  adminNotes?: string;
  /** Pickup tracking number */
  pickupTrackingNumber?: string;
  /** When the return was requested */
  requestedAt: Date;
  /** When the return was processed */
  processedAt?: Date;
  /** Who processed the return */
  processedBy?: string;
}

// ============================================================================
// Checkout Types
// ============================================================================

/**
 * Checkout session definition
 */
export interface CheckoutSession {
  /** Session ID */
  id: string;
  /** Cart ID */
  cartId: string;
  /** User ID (if logged in) */
  userId?: string;
  /** Guest email (if guest checkout) */
  guestEmail?: string;
  /** Guest phone (if guest checkout) */
  guestPhone?: string;
  /** Current step */
  currentStep: 'cart' | 'account' | 'shipping' | 'delivery' | 'payment' | 'review';
  /** Shipping address */
  shippingAddress?: Address;
  /** Billing address (if different) */
  billingAddress?: Address;
  /** Same billing as shipping */
  sameBillingAsShipping: boolean;
  /** Selected shipping rate */
  selectedShippingRate?: ShippingRate;
  /** Payment intent ID (from gateway) */
  paymentIntentId?: string;
  /** Session expiry */
  expiresAt: Date;
  /** When the session was created */
  createdAt: Date;
  /** When the session was last updated */
  updatedAt: Date;
}

// ============================================================================
// Filter & Sort Types
// ============================================================================

/**
 * Order filter options
 */
export interface OrderFilters {
  status?: OrderStatus[];
  paymentStatus?: PaymentStatus[];
  startDate?: Date;
  endDate?: Date;
  minTotal?: number;
  maxTotal?: number;
  searchQuery?: string;
  userId?: string;
  isTradeOrder?: boolean;
  hasApprovalPending?: boolean;
}

/**
 * Order sort options
 */
export type OrderSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'total'
  | 'orderNumber'
  | 'status';

export interface OrderSort {
  field: OrderSortField;
  direction: 'asc' | 'desc';
}

/**
 * Paginated orders response
 */
export interface PaginatedOrders {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
