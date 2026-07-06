/**
 * Order Schemas for MasonArt Platform
 *
 * Zod schemas for validating order-related data including:
 * - Orders
 * - Order items
 * - Cart items
 * - Addresses
 */

import { z } from "zod";

/**
 * Order status enum
 */
export const OrderStatusSchema = z.enum([
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/**
 * Payment status enum
 */
export const PaymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/**
 * Payment method enum
 */
export const PaymentMethodSchema = z.enum(["razorpay", "stripe", "cod", "upi"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/**
 * Photo approval status enum
 */
export const PhotoApprovalStatusSchema = z.enum([
  "pending",
  "sent",
  "approved",
  "changes_requested",
]);
export type PhotoApprovalStatus = z.infer<typeof PhotoApprovalStatusSchema>;

/**
 * Address type enum
 */
export const AddressTypeSchema = z.enum(["home", "office", "other"]);
export type AddressType = z.infer<typeof AddressTypeSchema>;

/**
 * Address Schema (used in orders and user profiles)
 */
export const AddressSchema = z.object({
  id: z.string().min(1, "Address ID is required"),
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be 100 characters or less"),
  phone: z
    .string()
    .regex(
      /^\+[1-9]\d{1,14}$/,
      "Phone number must be in E.164 format with + prefix (e.g., +919876543210)"
    ),
  addressLine1: z
    .string()
    .min(5, "Address line 1 must be at least 5 characters")
    .max(200, "Address line 1 must be 200 characters or less"),
  addressLine2: z.string().max(200, "Address line 2 must be 200 characters or less").optional(),
  city: z
    .string()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must be 100 characters or less"),
  state: z
    .string()
    .min(2, "State must be at least 2 characters")
    .max(100, "State must be 100 characters or less"),
  pincode: z
    .string()
    .regex(
      /^(\d{6}|\d{5}(-\d{4})?)$/,
      "Pincode must be 6 digits (India) or 5 digits (US) or ZIP+4 format"
    ),
  country: z.string().min(2, "Country is required").max(100),
  isDefault: z.boolean(),
  type: AddressTypeSchema,
});
export type Address = z.infer<typeof AddressSchema>;

/**
 * Address Create Schema
 */
export const AddressCreateSchema = AddressSchema.omit({ id: true }).strict();
export type AddressCreate = z.infer<typeof AddressCreateSchema>;

/**
 * Address Update Schema
 */
export const AddressUpdateSchema = AddressSchema.partial().required({ id: true });
export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;

/**
 * Saved Address Type Schema - matches DB enum for address purpose
 */
export const SavedAddressTypeSchema = z.enum(["shipping", "billing", "both"]);
export type SavedAddressType = z.infer<typeof SavedAddressTypeSchema>;

/**
 * Saved Address Schema - matches the `address` DB table columns exactly.
 * Used for the address management API (CRUD operations).
 * Separate from AddressSchema which uses pincode/country for order snapshots.
 */
export const SavedAddressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  type: SavedAddressTypeSchema,
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be 100 characters or less"),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +919876543210)"),
  addressLine1: z
    .string()
    .min(5, "Address line 1 must be at least 5 characters")
    .max(200, "Address line 1 must be 200 characters or less"),
  addressLine2: z
    .string()
    .max(200, "Address line 2 must be 200 characters or less")
    .optional()
    .nullable(),
  landmark: z.string().max(200, "Landmark must be 200 characters or less").optional().nullable(),
  city: z
    .string()
    .min(2, "City must be at least 2 characters")
    .max(100, "City must be 100 characters or less"),
  state: z
    .string()
    .min(2, "State must be at least 2 characters")
    .max(100, "State must be 100 characters or less"),
  postalCode: z.string().regex(/^\d{6}$/, "Postal code must be 6 digits"),
  countryCode: z.string().length(2, "Country code must be 2 characters").default("IN"),
  isDefault: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type SavedAddress = z.infer<typeof SavedAddressSchema>;

/**
 * Saved Address Create Schema - for POST /api/addresses
 */
export const SavedAddressCreateSchema = z.object({
  type: SavedAddressTypeSchema.default("both"),
  fullName: SavedAddressSchema.shape.fullName,
  phone: SavedAddressSchema.shape.phone,
  addressLine1: SavedAddressSchema.shape.addressLine1,
  addressLine2: SavedAddressSchema.shape.addressLine2,
  landmark: SavedAddressSchema.shape.landmark,
  city: SavedAddressSchema.shape.city,
  state: SavedAddressSchema.shape.state,
  postalCode: SavedAddressSchema.shape.postalCode,
  countryCode: SavedAddressSchema.shape.countryCode,
  isDefault: z.boolean().default(false),
});
export type SavedAddressCreate = z.infer<typeof SavedAddressCreateSchema>;

/**
 * Saved Address Update Schema - for PATCH /api/addresses/:id
 */
export const SavedAddressUpdateSchema = SavedAddressCreateSchema.partial();
export type SavedAddressUpdate = z.infer<typeof SavedAddressUpdateSchema>;

/**
 * Order Item Customizations
 */
export const OrderItemCustomizationsSchema = z.object({
  matOption: z.string().optional(),
  glassType: z.string().optional(),
  signaturePlacement: z.string().optional(),
  specialInstructions: z.string().max(500).optional(),
});
export type OrderItemCustomizations = z.infer<typeof OrderItemCustomizationsSchema>;

/**
 * Order Item Schema
 */
export const OrderItemSchema = z.object({
  id: z.string().min(1, "Order item ID is required"),
  orderId: z.string().min(1, "Order ID is required"),
  productId: z.string().min(1, "Product ID is required"),
  variantId: z.string().min(1, "Variant ID is required"),
  frameId: z.string().optional(),
  productTitle: z.string().min(1, "Product title is required").max(200),
  productSku: z.string().min(1, "Product SKU is required"),
  sizeLabel: z.string().min(1, "Size label is required"),
  frameType: z.string().optional(),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  unitPrice: z.string().regex(/^\d+\.\d{2}$/, "Unit price must be in format: 0000.00"),
  subtotal: z.string().regex(/^\d+\.\d{2}$/, "Subtotal must be in format: 0000.00"),
  imageUrl: z.string().url("Image URL must be a valid URL"),
  customizations: OrderItemCustomizationsSchema.optional(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Order Item Create Schema
 */
export const OrderItemCreateSchema = OrderItemSchema.omit({ id: true, orderId: true });
export type OrderItemCreate = z.infer<typeof OrderItemCreateSchema>;

/**
 * Photo Approval Schema
 */
export const PhotoApprovalSchema = z.object({
  required: z.boolean(),
  status: PhotoApprovalStatusSchema,
  photoUrls: z.array(z.string().url()).optional(),
  approvedAt: z.date().optional(),
  feedback: z.string().max(1000).optional(),
});
export type PhotoApproval = z.infer<typeof PhotoApprovalSchema>;

/**
 * Order Schema
 */
export const OrderSchema = z.object({
  id: z.string().min(1, "Order ID is required"),
  orderNumber: z
    .string()
    .min(1, "Order number is required")
    .regex(
      /^[A-Z0-9-]+$/,
      "Order number must contain only uppercase letters, numbers, and hyphens"
    ),
  userId: z.string().min(1, "User ID is required"),
  status: OrderStatusSchema,
  items: z
    .array(OrderItemSchema)
    .min(1, "Order must contain at least one item")
    .max(50, "Order cannot contain more than 50 items"),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  paymentMethod: PaymentMethodSchema,
  paymentStatus: PaymentStatusSchema,
  paymentId: z.string().optional(),
  subtotal: z.string().regex(/^\d+\.\d{2}$/, "Subtotal must be in format: 0000.00"),
  shippingCost: z.string().regex(/^\d+\.\d{2}$/, "Shipping cost must be in format: 0000.00"),
  tax: z.string().regex(/^\d+\.\d{2}$/, "Tax must be in format: 0000.00"),
  discount: z.string().regex(/^\d+\.\d{2}$/, "Discount must be in format: 0000.00"),
  total: z.string().regex(/^\d+\.\d{2}$/, "Total must be in format: 0000.00"),
  trackingNumber: z.string().optional(),
  shippingCarrier: z.string().optional(),
  estimatedDelivery: z.date().optional(),
  notes: z.string().max(1000).optional(),
  internalNotes: z.string().max(2000).optional(),
  photoApproval: PhotoApprovalSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  cancelledAt: z.date().optional(),
  deliveredAt: z.date().optional(),
});
export type Order = z.infer<typeof OrderSchema>;

/**
 * Order Create Schema (for creating new orders)
 * Omits auto-generated fields (id, orderNumber, createdAt, updatedAt)
 */
export const OrderCreateSchema = OrderSchema.omit({
  id: true,
  orderNumber: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
  deliveredAt: true,
})
  .extend({
    items: z
      .array(OrderItemCreateSchema)
      .min(1, "Order must contain at least one item")
      .max(50, "Order cannot contain more than 50 items"),
  })
  .strict();
export type OrderCreate = z.infer<typeof OrderCreateSchema>;

/**
 * Order Update Schema (for updating existing orders)
 * All fields are optional except id
 */
export const OrderUpdateSchema = OrderSchema.partial().required({ id: true });
export type OrderUpdate = z.infer<typeof OrderUpdateSchema>;

/**
 * Cart Item Schema
 */
export const CartItemSchema = z.object({
  id: z.string().min(1, "Cart item ID is required"),
  userId: z.string().min(1, "User ID is required"),
  productId: z.string().min(1, "Product ID is required"),
  variantId: z.string().min(1, "Variant ID is required"),
  frameId: z.string().optional(),
  quantity: z.number().int().positive("Quantity must be a positive integer").max(99),
  addedAt: z.date(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

/**
 * Cart Item Create Schema
 */
export const CartItemCreateSchema = CartItemSchema.omit({ id: true, addedAt: true });
export type CartItemCreate = z.infer<typeof CartItemCreateSchema>;

/**
 * Cart Item Update Schema
 */
export const CartItemUpdateSchema = CartItemSchema.partial().required({ id: true });
export type CartItemUpdate = z.infer<typeof CartItemUpdateSchema>;

/**
 * Order Filter Schema (for API queries)
 */
export const OrderFilterSchema = z.object({
  userId: z.string().optional(),
  status: OrderStatusSchema.optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  search: z.string().optional(), // Search by order number, customer name, email
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type OrderFilter = z.infer<typeof OrderFilterSchema>;
