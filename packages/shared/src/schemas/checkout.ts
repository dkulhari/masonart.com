/**
 * Checkout & Order Zod Schemas for MasonArt Platform
 *
 * Provides runtime validation for checkout, cart, order, and user-related data.
 * These schemas match the types defined in ../types/order.ts and ../types/user.ts
 */

import { z } from 'zod';
import {
  productConfigurationSchema,
  productPriceBreakdownSchema,
  productSizeSchema,
  frameTypeSchema,
  matOptionSchema,
  glassOptionSchema,
} from './product';

// ============================================================================
// User-Related Enum Schemas
// ============================================================================

export const userRoleSchema = z.enum(['customer', 'trade', 'admin', 'super-admin']);

export const authProviderSchema = z.enum(['email', 'google', 'facebook', 'apple', 'phone']);

export const userStatusSchema = z.enum(['active', 'inactive', 'suspended', 'pending-verification']);

export const tradeStatusSchema = z.enum(['none', 'pending', 'approved', 'rejected', 'suspended']);

export const tradeAccountTypeSchema = z.enum([
  'interior-designer',
  'architect',
  'staging-company',
  'hospitality',
  'office-designer',
  'art-consultant',
  'other',
]);

export const notificationChannelSchema = z.enum(['email', 'sms', 'push', 'whatsapp']);

export const addressTypeSchema = z.enum(['shipping', 'billing', 'both']);

export const paymentMethodTypeSchema = z.enum(['card', 'upi', 'netbanking', 'wallet']);

export const cardBrandSchema = z.enum(['visa', 'mastercard', 'amex', 'rupay', 'other']);

// ============================================================================
// Order-Related Enum Schemas
// ============================================================================

export const orderStatusSchema = z.enum([
  'pending',
  'confirmed',
  'processing',
  'awaiting-approval',
  'approved',
  'production',
  'ready-to-ship',
  'shipped',
  'out-for-delivery',
  'delivered',
  'cancelled',
  'refunded',
  'on-hold',
]);

export const paymentStatusSchema = z.enum([
  'pending',
  'authorized',
  'captured',
  'failed',
  'refunded',
  'partially-refunded',
  'cancelled',
]);

export const deliveryTypeSchema = z.enum(['standard', 'express', 'scheduled']);

export const approvalStatusSchema = z.enum([
  'not-required',
  'pending-production',
  'production-complete',
  'pending-approval',
  'approved',
  'revision-requested',
  'rejected',
]);

export const returnReasonSchema = z.enum([
  'damaged',
  'wrong-item',
  'quality-issue',
  'not-as-described',
  'changed-mind',
  'wrong-size',
  'other',
]);

export const discountTypeSchema = z.enum(['percentage', 'fixed', 'free-shipping']);

export const returnStatusSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'pickup-scheduled',
  'picked-up',
  'received',
  'refund-initiated',
  'completed',
]);

// ============================================================================
// Address Schemas
// ============================================================================

export const addressSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: addressTypeSchema,
  fullName: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  landmark: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(4).max(12),
  countryCode: z.string().length(2),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const addressInputSchema = z.object({
  type: addressTypeSchema,
  fullName: z.string().min(1).max(100),
  phone: z.string().min(10).max(15),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  landmark: z.string().max(100).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(4).max(12),
  countryCode: z.string().length(2),
  isDefault: z.boolean().optional(),
});

// ============================================================================
// Cart Schemas
// ============================================================================

export const cartItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  productTitle: z.string().min(1),
  productSlug: z.string().min(1),
  productImageUrl: z.string().url(),
  productSku: z.string().min(1),
  isAIGenerated: z.boolean(),
  aiGenerationId: z.string().optional(),
  configuration: productConfigurationSchema,
  size: productSizeSchema,
  frameType: frameTypeSchema.optional(),
  matOption: matOptionSchema.optional(),
  glassOption: glassOptionSchema.optional(),
  priceBreakdown: productPriceBreakdownSchema,
  quantity: z.number().int().positive(),
  customInstructions: z.string().max(1000).optional(),
  isGiftWrapped: z.boolean(),
  giftMessage: z.string().max(500).optional(),
  addedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const appliedDiscountSchema = z.object({
  code: z.string().min(1),
  type: discountTypeSchema,
  value: z.number().nonnegative(),
  description: z.string(),
  maxDiscount: z.number().positive().optional(),
  minOrderValue: z.number().nonnegative().optional(),
});

export const cartSchema = z.object({
  id: z.string().min(1),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  items: z.array(cartItemSchema),
  couponCode: z.string().optional(),
  discount: appliedDiscountSchema.optional(),
  subtotal: z.number().int().nonnegative(),
  discountAmount: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  estimatedShipping: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  appliedGiftCardIds: z.array(z.string()).optional(),
  giftCardAmount: z.number().int().nonnegative().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
});

// ============================================================================
// Cart Input Schemas
// ============================================================================

export const addToCartInputSchema = z.object({
  productId: z.string().min(1),
  configuration: productConfigurationSchema,
  quantity: z.number().int().positive().default(1),
  customInstructions: z.string().max(1000).optional(),
  isGiftWrapped: z.boolean().default(false),
  giftMessage: z.string().max(500).optional(),
  aiGenerationId: z.string().optional(),
});

export const updateCartItemInputSchema = z.object({
  cartItemId: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  configuration: productConfigurationSchema.optional(),
  customInstructions: z.string().max(1000).optional(),
  isGiftWrapped: z.boolean().optional(),
  giftMessage: z.string().max(500).optional(),
});

export const applyCouponInputSchema = z.object({
  couponCode: z.string().min(1).max(50),
});

// ============================================================================
// Shipping Schemas
// ============================================================================

export const shippingRateSchema = z.object({
  id: z.string().min(1),
  carrier: z.string().min(1),
  serviceName: z.string().min(1),
  deliveryType: deliveryTypeSchema,
  cost: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  estimatedDaysMin: z.number().int().positive(),
  estimatedDaysMax: z.number().int().positive(),
  estimatedDeliveryDate: z.coerce.date().optional(),
  hasTracking: z.boolean(),
});

export const shippingDetailsSchema = z.object({
  address: addressSchema,
  shippingRate: shippingRateSchema,
  shippingCost: z.number().int().nonnegative(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().url().optional(),
  carrier: z.string().optional(),
  labelUrl: z.string().url().optional(),
  scheduledDeliveryDate: z.coerce.date().optional(),
  deliveryInstructions: z.string().max(500).optional(),
  shippedAt: z.coerce.date().optional(),
  deliveredAt: z.coerce.date().optional(),
});

// ============================================================================
// Payment Schemas
// ============================================================================

export const paymentDetailsSchema = z.object({
  paymentId: z.string().min(1),
  gateway: z.enum(['razorpay', 'stripe', 'payu']),
  methodType: paymentMethodTypeSchema,
  cardBrand: cardBrandSchema.optional(),
  last4: z.string().length(4).optional(),
  bankName: z.string().optional(),
  upiId: z.string().optional(),
  status: paymentStatusSchema,
  amountAuthorized: z.number().int().nonnegative(),
  amountCaptured: z.number().int().nonnegative(),
  amountRefunded: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  gatewayTransactionId: z.string().optional(),
  gatewayOrderId: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Order Item Schemas
// ============================================================================

export const productionMediaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['photo', 'video']),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  caption: z.string().max(500).optional(),
  uploadedAt: z.coerce.date(),
});

export const orderItemSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  productId: z.string().min(1),
  productTitle: z.string().min(1),
  productSlug: z.string().min(1),
  productSku: z.string().min(1),
  productImageUrl: z.string().url(),
  isAIGenerated: z.boolean(),
  aiGenerationId: z.string().optional(),
  configuration: productConfigurationSchema,
  size: productSizeSchema,
  frameType: frameTypeSchema.optional(),
  matOption: matOptionSchema.optional(),
  glassOption: glassOptionSchema.optional(),
  priceBreakdown: productPriceBreakdownSchema,
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  totalPrice: z.number().int().nonnegative(),
  customInstructions: z.string().max(1000).optional(),
  isGiftWrapped: z.boolean(),
  giftMessage: z.string().max(500).optional(),
  approvalStatus: approvalStatusSchema,
  productionMedia: z.array(productionMediaSchema).optional(),
  approvalNotes: z.string().max(1000).optional(),
  approvedAt: z.coerce.date().optional(),
});

// ============================================================================
// Order Schemas
// ============================================================================

export const orderEventSchema = z.object({
  id: z.string().min(1),
  type: z.union([orderStatusSchema, z.enum(['note', 'payment', 'approval'])]),
  title: z.string().min(1),
  description: z.string().optional(),
  actorType: z.enum(['system', 'customer', 'admin']),
  actorUserId: z.string().optional(),
  occurredAt: z.coerce.date(),
});

export const orderSchema = z.object({
  id: z.string().min(1),
  orderNumber: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().email(),
  userName: z.string().min(1),
  status: orderStatusSchema,
  items: z.array(orderItemSchema).min(1),
  itemCount: z.number().int().positive(),
  shipping: shippingDetailsSchema,
  payment: paymentDetailsSchema.optional(),
  billingAddress: addressSchema.optional(),
  couponCode: z.string().optional(),
  discountAmount: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
  taxAmount: z.number().int().nonnegative(),
  shippingCost: z.number().int().nonnegative(),
  giftCardAmount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  tradeDiscountAmount: z.number().int().nonnegative().optional(),
  isTradeOrder: z.boolean(),
  customerNotes: z.string().max(1000).optional(),
  internalNotes: z.string().max(2000).optional(),
  events: z.array(orderEventSchema),
  invoiceUrl: z.string().url().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  estimatedDeliveryDate: z.coerce.date().optional(),
});

export const orderListItemSchema = z.object({
  id: z.string().min(1),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  itemCount: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  firstItemImage: z.string().url(),
  createdAt: z.coerce.date(),
  estimatedDeliveryDate: z.coerce.date().optional(),
});

export const adminOrderListItemSchema = orderListItemSchema.extend({
  userId: z.string().min(1),
  userName: z.string().min(1),
  userEmail: z.string().email(),
  paymentStatus: paymentStatusSchema.optional(),
  hasApprovalPending: z.boolean(),
  isTradeOrder: z.boolean(),
  shippingCity: z.string().optional(),
  shippingState: z.string().optional(),
});

// ============================================================================
// Checkout Session Schemas
// ============================================================================

export const checkoutSessionSchema = z.object({
  id: z.string().min(1),
  cartId: z.string().min(1),
  userId: z.string().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().min(10).max(15).optional(),
  currentStep: z.enum(['cart', 'account', 'shipping', 'delivery', 'payment', 'review']),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  sameBillingAsShipping: z.boolean(),
  selectedShippingRate: shippingRateSchema.optional(),
  paymentIntentId: z.string().optional(),
  expiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Checkout Input Schemas
// ============================================================================

export const guestCheckoutInputSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(10).max(15).optional(),
  name: z.string().min(1).max(100),
});

export const setShippingAddressInputSchema = z.object({
  addressId: z.string().optional(),
  address: addressInputSchema.optional(),
}).refine(
  (data) => data.addressId || data.address,
  { message: 'Either addressId or address must be provided' }
);

export const selectShippingRateInputSchema = z.object({
  shippingRateId: z.string().min(1),
});

export const setDeliveryOptionsInputSchema = z.object({
  shippingRateId: z.string().min(1),
  scheduledDeliveryDate: z.coerce.date().optional(),
  deliveryInstructions: z.string().max(500).optional(),
});

export const initiatePaymentInputSchema = z.object({
  paymentMethodType: paymentMethodTypeSchema,
  savedPaymentMethodId: z.string().optional(),
  sameBillingAsShipping: z.boolean().default(true),
  billingAddress: addressInputSchema.optional(),
});

export const confirmOrderInputSchema = z.object({
  paymentId: z.string().min(1),
  gatewaySignature: z.string().optional(),
  customerNotes: z.string().max(1000).optional(),
});

// ============================================================================
// Return Request Schemas
// ============================================================================

export const returnRequestSchema = z.object({
  id: z.string().min(1),
  orderId: z.string().min(1),
  orderItemIds: z.array(z.string()).min(1),
  reason: returnReasonSchema,
  reasonDescription: z.string().max(1000).optional(),
  customerPhotoUrls: z.array(z.string().url()).optional(),
  status: returnStatusSchema,
  refundAmountRequested: z.number().int().nonnegative(),
  refundAmountApproved: z.number().int().nonnegative().optional(),
  adminNotes: z.string().max(2000).optional(),
  pickupTrackingNumber: z.string().optional(),
  requestedAt: z.coerce.date(),
  processedAt: z.coerce.date().optional(),
  processedBy: z.string().optional(),
});

export const createReturnRequestInputSchema = z.object({
  orderId: z.string().min(1),
  orderItemIds: z.array(z.string()).min(1),
  reason: returnReasonSchema,
  reasonDescription: z.string().max(1000).optional(),
  customerPhotoUrls: z.array(z.string().url()).max(5).optional(),
});

// ============================================================================
// Photo Approval Schemas
// ============================================================================

export const submitApprovalInputSchema = z.object({
  orderItemId: z.string().min(1),
  isApproved: z.boolean(),
  notes: z.string().max(1000).optional(),
});

export const uploadProductionMediaInputSchema = z.object({
  orderItemId: z.string().min(1),
  type: z.enum(['photo', 'video']),
  caption: z.string().max(500).optional(),
});

// ============================================================================
// Order Filter & Sort Schemas
// ============================================================================

export const orderFiltersSchema = z.object({
  status: z.array(orderStatusSchema).optional(),
  paymentStatus: z.array(paymentStatusSchema).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  minTotal: z.number().int().nonnegative().optional(),
  maxTotal: z.number().int().nonnegative().optional(),
  searchQuery: z.string().optional(),
  userId: z.string().optional(),
  isTradeOrder: z.boolean().optional(),
  hasApprovalPending: z.boolean().optional(),
});

export const orderSortFieldSchema = z.enum([
  'createdAt',
  'updatedAt',
  'total',
  'orderNumber',
  'status',
]);

export const orderSortSchema = z.object({
  field: orderSortFieldSchema,
  direction: z.enum(['asc', 'desc']),
});

export const paginatedOrdersSchema = z.object({
  items: z.array(orderListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type UserRoleSchema = z.infer<typeof userRoleSchema>;
export type AuthProviderSchema = z.infer<typeof authProviderSchema>;
export type UserStatusSchema = z.infer<typeof userStatusSchema>;
export type TradeStatusSchema = z.infer<typeof tradeStatusSchema>;
export type TradeAccountTypeSchema = z.infer<typeof tradeAccountTypeSchema>;
export type AddressTypeSchema = z.infer<typeof addressTypeSchema>;
export type PaymentMethodTypeSchema = z.infer<typeof paymentMethodTypeSchema>;
export type CardBrandSchema = z.infer<typeof cardBrandSchema>;
export type OrderStatusSchema = z.infer<typeof orderStatusSchema>;
export type PaymentStatusSchema = z.infer<typeof paymentStatusSchema>;
export type DeliveryTypeSchema = z.infer<typeof deliveryTypeSchema>;
export type ApprovalStatusSchema = z.infer<typeof approvalStatusSchema>;
export type ReturnReasonSchema = z.infer<typeof returnReasonSchema>;
export type DiscountTypeSchema = z.infer<typeof discountTypeSchema>;
export type ReturnStatusSchema = z.infer<typeof returnStatusSchema>;

export type AddressSchema = z.infer<typeof addressSchema>;
export type AddressInputSchema = z.infer<typeof addressInputSchema>;
export type CartItemSchema = z.infer<typeof cartItemSchema>;
export type AppliedDiscountSchema = z.infer<typeof appliedDiscountSchema>;
export type CartSchema = z.infer<typeof cartSchema>;
export type AddToCartInputSchema = z.infer<typeof addToCartInputSchema>;
export type UpdateCartItemInputSchema = z.infer<typeof updateCartItemInputSchema>;
export type ApplyCouponInputSchema = z.infer<typeof applyCouponInputSchema>;
export type ShippingRateSchema = z.infer<typeof shippingRateSchema>;
export type ShippingDetailsSchema = z.infer<typeof shippingDetailsSchema>;
export type PaymentDetailsSchema = z.infer<typeof paymentDetailsSchema>;
export type ProductionMediaSchema = z.infer<typeof productionMediaSchema>;
export type OrderItemSchema = z.infer<typeof orderItemSchema>;
export type OrderEventSchema = z.infer<typeof orderEventSchema>;
export type OrderSchema = z.infer<typeof orderSchema>;
export type OrderListItemSchema = z.infer<typeof orderListItemSchema>;
export type AdminOrderListItemSchema = z.infer<typeof adminOrderListItemSchema>;
export type CheckoutSessionSchema = z.infer<typeof checkoutSessionSchema>;
export type GuestCheckoutInputSchema = z.infer<typeof guestCheckoutInputSchema>;
export type SetShippingAddressInputSchema = z.infer<typeof setShippingAddressInputSchema>;
export type SelectShippingRateInputSchema = z.infer<typeof selectShippingRateInputSchema>;
export type SetDeliveryOptionsInputSchema = z.infer<typeof setDeliveryOptionsInputSchema>;
export type InitiatePaymentInputSchema = z.infer<typeof initiatePaymentInputSchema>;
export type ConfirmOrderInputSchema = z.infer<typeof confirmOrderInputSchema>;
export type ReturnRequestSchema = z.infer<typeof returnRequestSchema>;
export type CreateReturnRequestInputSchema = z.infer<typeof createReturnRequestInputSchema>;
export type SubmitApprovalInputSchema = z.infer<typeof submitApprovalInputSchema>;
export type UploadProductionMediaInputSchema = z.infer<typeof uploadProductionMediaInputSchema>;
export type OrderFiltersSchema = z.infer<typeof orderFiltersSchema>;
export type OrderSortSchema = z.infer<typeof orderSortSchema>;
export type PaginatedOrdersSchema = z.infer<typeof paginatedOrdersSchema>;
