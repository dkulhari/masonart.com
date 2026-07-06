/**
 * OrderDetail Component - MasonArt E-commerce Platform
 *
 * Admin order detail view displaying:
 * - Order header with status and actions
 * - Customer information
 * - Order items list
 * - Shipping and payment details
 * - Internal notes and timeline
 *
 * Following patterns from docs/poster-app-tech-stack.md
 */

import { useState } from "react";
import {
  Package,
  User,
  MapPin,
  CreditCard,
  Truck,
  Calendar,
  Clock,
  FileText,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ImageIcon,
  Camera,
} from "lucide-react";
import { cn, formatPrice } from "~/lib/utils";
import type { OrderStatus, PaymentStatus } from "./OrdersTable";

// ============================================================================
// Types
// ============================================================================

export interface OrderItemSnapshot {
  title?: string;
  sku?: string;
  sizeLabel?: string;
  imageUrl?: string;
}

export interface OrderItem {
  id: string;
  snapshot?: OrderItemSnapshot | null;
  unitPrice: string;
  framePrice: string;
  quantity: number;
  lineTotal: string;
  itemDiscount?: string | null;
  isAiGenerated: boolean;
  aiGenerationId?: string | null;
  customizations?: Record<string, unknown> | null;
  isFulfilled: boolean;
  fulfilledAt?: string | null;
  product?: {
    id: string;
    slug: string;
    title: string;
    images?: Array<{ url: string; alt?: string }> | null;
    sku: string;
  } | null;
  variant?: {
    id: string;
    sizeLabel: string;
    widthInches: number;
    heightInches: number;
    price: string;
  } | null;
  frame?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode?: string;
}

export interface ShippingDetails {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  awbNumber?: string;
  shipmentId?: string;
  estimatedDelivery?: string;
}

export interface PaymentDetails {
  method?: string;
  orderId?: string;
  paymentId?: string;
  refundId?: string;
  refundAmount?: number;
  refundedAt?: string;
}

export interface OrderCustomer {
  id?: string;
  name?: string | null;
  email: string;
  phone?: string | null;
}

export type ApprovalStatus =
  | "pending_upload"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "expired";

export interface OrderApproval {
  id: string;
  orderItemId: string;
  status: ApprovalStatus;
  approvalToken: string;
  deadlineAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FullOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  orderType: "regular" | "ai_generated" | "trade";
  customer?: OrderCustomer | null;
  shippingAddress?: ShippingAddress | null;
  shippingDetails?: ShippingDetails | null;
  shippingMethod?: string | null;
  shippingCost: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  couponCode?: string | null;
  couponDiscount?: string | null;
  tradeDiscount?: string | null;
  itemCount: number;
  currency: string;
  customerNotes?: string | null;
  internalNotes?: string | null;
  paymentDetails?: PaymentDetails | null;
  items: OrderItem[];
  approvals?: OrderApproval[];
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
}

export interface OrderDetailProps {
  order: FullOrder;
  onUpdateStatus?: (status: OrderStatus, reason?: string) => Promise<void>;
  onUpdateShipping?: (details: Partial<ShippingDetails>) => Promise<void>;
  onUpdateNotes?: (notes: string) => Promise<void>;
  onInitiateRefund?: (amount?: number, reason?: string) => Promise<void>;
  isUpdating?: boolean;
}

// ============================================================================
// Status Badge Components
// ============================================================================

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const styles: Record<OrderStatus, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    pending_payment: "bg-yellow-100 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-100 text-blue-700 border-blue-200",
    processing: "bg-purple-100 text-purple-700 border-purple-200",
    shipped: "bg-indigo-100 text-indigo-700 border-indigo-200",
    out_for_delivery: "bg-cyan-100 text-cyan-700 border-cyan-200",
    delivered: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-gray-100 text-gray-700 border-gray-200",
    refund_requested: "bg-orange-100 text-orange-700 border-orange-200",
    refunded: "bg-gray-100 text-gray-600 border-gray-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  };

  const labels: Record<OrderStatus, string> = {
    pending: "Pending",
    pending_payment: "Payment Pending",
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Shipped",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    refund_requested: "Refund Requested",
    refunded: "Refunded",
    failed: "Failed",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const styles: Record<ApprovalStatus, string> = {
    pending_upload: "bg-gray-100 text-gray-700 border-gray-200",
    pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
    changes_requested: "bg-orange-100 text-orange-700 border-orange-200",
    approved: "bg-green-100 text-green-700 border-green-200",
    expired: "bg-red-100 text-red-700 border-red-200",
  };

  const labels: Record<ApprovalStatus, string> = {
    pending_upload: "Awaiting Upload",
    pending_approval: "Pending Approval",
    changes_requested: "Changes Requested",
    approved: "Approved",
    expired: "Expired",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const styles: Record<PaymentStatus, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    paid: "bg-green-100 text-green-700 border-green-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    refunded: "bg-gray-100 text-gray-600 border-gray-200",
    partially_refunded: "bg-orange-100 text-orange-700 border-orange-200",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const labels: Record<PaymentStatus, string> = {
    pending: "Pending",
    processing: "Processing",
    paid: "Paid",
    failed: "Failed",
    refunded: "Refunded",
    partially_refunded: "Partial Refund",
    cancelled: "Cancelled",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

// ============================================================================
// Approval Status Section
// ============================================================================

function ApprovalStatusSection({ approvals }: { approvals: OrderApproval[] }) {
  // Compute overall status: show worst status if mixed
  const getOverallStatus = (): ApprovalStatus => {
    const statusPriority: ApprovalStatus[] = [
      "expired",
      "changes_requested",
      "pending_upload",
      "pending_approval",
      "approved",
    ];

    for (const status of statusPriority) {
      if (approvals.some((a) => a.status === status)) {
        return status;
      }
    }
    return "pending_upload";
  };

  const overallStatus = getOverallStatus();
  const pendingCount = approvals.filter(
    (a) => a.status !== "approved" && a.status !== "expired"
  ).length;
  const approvedCount = approvals.filter((a) => a.status === "approved").length;

  // Find first non-approved approval to link to
  const firstPendingApproval = approvals.find(
    (a) => a.status !== "approved" && a.status !== "expired"
  );
  const linkToApprovalId = firstPendingApproval?.id || approvals[0]?.id;

  return (
    <a
      href={`/admin/approvals/${linkToApprovalId}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100"
    >
      <Camera className="h-3.5 w-3.5" />
      <span>Approvals</span>
      <ApprovalStatusBadge status={overallStatus} />
      {pendingCount > 0 && (
        <span className="text-xs text-purple-600">
          ({approvedCount}/{approvals.length})
        </span>
      )}
    </a>
  );
}

// ============================================================================
// Section Components
// ============================================================================

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <h3 className="font-semibold text-foreground">{title}</h3>
    </div>
  );
}

// ============================================================================
// Order Item Component
// ============================================================================

function OrderItemRow({ item }: { item: OrderItem }) {
  const snapshot = item.snapshot;
  const product = item.product;
  const variant = item.variant;
  const frame = item.frame;

  const title = snapshot?.title || product?.title || "Product";
  const imageUrl = snapshot?.imageUrl || product?.images?.[0]?.url || null;
  const sizeLabel = snapshot?.sizeLabel || variant?.sizeLabel || "";

  return (
    <div className="flex gap-4 py-3">
      {/* Image */}
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">
              {sizeLabel}
              {frame && ` • ${frame.name} Frame`}
            </p>
            {item.isAiGenerated && (
              <span className="mt-1 inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                AI Generated
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="font-medium text-foreground">{formatPrice(parseFloat(item.lineTotal))}</p>
            <p className="text-sm text-muted-foreground">
              Qty: {item.quantity} × {formatPrice(parseFloat(item.unitPrice))}
            </p>
          </div>
        </div>

        {/* Fulfillment status */}
        <div className="mt-2">
          {item.isFulfilled ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Fulfilled
              {item.fulfilledAt && ` on ${new Date(item.fulfilledAt).toLocaleDateString("en-IN")}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
              <Clock className="h-3 w-3" />
              Pending Fulfillment
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Status Update Modal
// ============================================================================

interface StatusUpdateModalProps {
  currentStatus: OrderStatus;
  onUpdate: (status: OrderStatus, reason?: string) => void;
  onClose: () => void;
  isUpdating: boolean;
}

function StatusUpdateModal({
  currentStatus,
  onUpdate,
  onClose,
  isUpdating,
}: StatusUpdateModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(currentStatus);
  const [reason, setReason] = useState("");

  const statusOptions: OrderStatus[] = [
    "pending",
    "pending_payment",
    "confirmed",
    "processing",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refund_requested",
    "refunded",
    "failed",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Update Order Status</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">New Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Add a reason for this status change..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onUpdate(selectedStatus, reason || undefined)}
            disabled={isUpdating || selectedStatus === currentStatus}
            className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {isUpdating ? "Updating..." : "Update Status"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Shipping Update Modal
// ============================================================================

interface ShippingUpdateModalProps {
  currentDetails?: ShippingDetails | null;
  onUpdate: (details: Partial<ShippingDetails>) => void;
  onClose: () => void;
  isUpdating: boolean;
}

function ShippingUpdateModal({
  currentDetails,
  onUpdate,
  onClose,
  isUpdating,
}: ShippingUpdateModalProps) {
  const [carrier, setCarrier] = useState(currentDetails?.carrier || "");
  const [trackingNumber, setTrackingNumber] = useState(currentDetails?.trackingNumber || "");
  const [trackingUrl, setTrackingUrl] = useState(currentDetails?.trackingUrl || "");
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    currentDetails?.estimatedDelivery || ""
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">Update Shipping Details</h3>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Carrier</label>
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="e.g., Delhivery, BlueDart"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Tracking Number</label>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Tracking number"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Tracking URL</label>
            <input
              type="url"
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Estimated Delivery</label>
            <input
              type="date"
              value={estimatedDelivery}
              onChange={(e) => setEstimatedDelivery(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdate({
                carrier: carrier || undefined,
                trackingNumber: trackingNumber || undefined,
                trackingUrl: trackingUrl || undefined,
                estimatedDelivery: estimatedDelivery || undefined,
              })
            }
            disabled={isUpdating}
            className="flex-1 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {isUpdating ? "Updating..." : "Update Shipping"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main OrderDetail Component
// ============================================================================

export function OrderDetail({
  order,
  onUpdateStatus,
  onUpdateShipping,
  onUpdateNotes,
  onInitiateRefund,
  isUpdating = false,
}: OrderDetailProps) {
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editedNotes, setEditedNotes] = useState(order.internalNotes || "");

  const handleCopyOrderNumber = () => {
    navigator.clipboard.writeText(order.orderNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStatusUpdate = async (status: OrderStatus, reason?: string) => {
    if (onUpdateStatus) {
      await onUpdateStatus(status, reason);
    }
    setShowStatusModal(false);
  };

  const handleShippingUpdate = async (details: Partial<ShippingDetails>) => {
    if (onUpdateShipping) {
      await onUpdateShipping(details);
    }
    setShowShippingModal(false);
  };

  const handleNotesUpdate = async () => {
    if (onUpdateNotes) {
      await onUpdateNotes(editedNotes);
    }
    setIsEditingNotes(false);
  };

  const handleCancelNotesEdit = () => {
    setEditedNotes(order.internalNotes || "");
    setIsEditingNotes(false);
  };

  const canRefund =
    order.paymentStatus === "paid" && !["refunded", "cancelled"].includes(order.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-foreground">Order {order.orderNumber}</h2>
            <button
              type="button"
              onClick={handleCopyOrderNumber}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              title="Copy order number"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
          {order.approvals && order.approvals.length > 0 && (
            <ApprovalStatusSection approvals={order.approvals} />
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {onUpdateStatus && (
          <button
            type="button"
            onClick={() => setShowStatusModal(true)}
            disabled={isUpdating}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Update Status
          </button>
        )}

        {onUpdateShipping && (
          <button
            type="button"
            onClick={() => setShowShippingModal(true)}
            disabled={isUpdating}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Truck className="h-4 w-4" />
            Update Shipping
          </button>
        )}

        {canRefund && onInitiateRefund && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Are you sure you want to initiate a refund for this order?")) {
                onInitiateRefund(undefined, "Admin initiated refund");
              }
            }}
            disabled={isUpdating}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Initiate Refund
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Order Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="rounded-xl border border-border bg-card p-4">
            <SectionHeader icon={Package} title={`Order Items (${order.itemCount})`} />
            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <OrderItemRow key={item.id} item={item} />
              ))}
            </div>
          </div>

          {/* Customer Notes */}
          {order.customerNotes && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeader icon={FileText} title="Customer Notes" />
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">
                {order.customerNotes}
              </p>
            </div>
          )}

          {/* Internal Notes */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">Internal Notes</h3>
              </div>
              {!isEditingNotes && onUpdateNotes && (
                <button
                  type="button"
                  onClick={() => setIsEditingNotes(true)}
                  className="text-sm text-brand-500 hover:underline"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="mt-3">
              {isEditingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    rows={5}
                    placeholder="Add internal notes..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCancelNotesEdit}
                      disabled={isUpdating}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleNotesUpdate}
                      disabled={isUpdating}
                      className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                    >
                      {isUpdating ? "Saving..." : "Save Notes"}
                    </button>
                  </div>
                </div>
              ) : order.internalNotes ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {order.internalNotes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No internal notes</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="space-y-6">
          {/* Customer */}
          <div className="rounded-xl border border-border bg-card p-4">
            <SectionHeader icon={User} title="Customer" />
            <div className="mt-3 space-y-2 text-sm">
              {order.customer?.name && (
                <p className="font-medium text-foreground">{order.customer.name}</p>
              )}
              <p className="text-muted-foreground">{order.customer?.email}</p>
              {order.customer?.phone && (
                <p className="text-muted-foreground">{order.customer.phone}</p>
              )}
              {!order.customer && <p className="italic text-muted-foreground">Guest checkout</p>}
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeader icon={MapPin} title="Shipping Address" />
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.addressLine1}</p>
                {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                {order.shippingAddress.landmark && <p>Near: {order.shippingAddress.landmark}</p>}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.postalCode}
                </p>
                <p>{order.shippingAddress.phone}</p>
              </div>
            </div>
          )}

          {/* Shipping Details */}
          {order.shippingDetails && (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeader icon={Truck} title="Shipping Details" />
              <div className="mt-3 space-y-2 text-sm">
                {order.shippingDetails.carrier && (
                  <p>
                    <span className="text-muted-foreground">Carrier:</span>{" "}
                    <span className="text-foreground">{order.shippingDetails.carrier}</span>
                  </p>
                )}
                {order.shippingDetails.trackingNumber && (
                  <p>
                    <span className="text-muted-foreground">Tracking:</span>{" "}
                    <span className="font-mono text-foreground">
                      {order.shippingDetails.trackingNumber}
                    </span>
                    {order.shippingDetails.trackingUrl && (
                      <a
                        href={order.shippingDetails.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center text-brand-500 hover:underline"
                      >
                        Track <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    )}
                  </p>
                )}
                {order.shippingDetails.estimatedDelivery && (
                  <p>
                    <span className="text-muted-foreground">Est. Delivery:</span>{" "}
                    <span className="text-foreground">
                      {new Date(order.shippingDetails.estimatedDelivery).toLocaleDateString(
                        "en-IN"
                      )}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Payment Summary */}
          <div className="rounded-xl border border-border bg-card p-4">
            <SectionHeader icon={CreditCard} title="Payment Summary" />
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(parseFloat(order.subtotal))}</span>
              </div>
              {parseFloat(order.discount) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatPrice(parseFloat(order.discount))}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>
                  {parseFloat(order.shippingCost) === 0
                    ? "FREE"
                    : formatPrice(parseFloat(order.shippingCost))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatPrice(parseFloat(order.tax))}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold text-foreground">
                <span>Total</span>
                <span>{formatPrice(parseFloat(order.total))}</span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-border bg-card p-4">
            <SectionHeader icon={Calendar} title="Timeline" />
            <div className="mt-3 space-y-3 text-sm">
              <TimelineItem label="Order Created" date={order.createdAt} isCompleted={true} />
              <TimelineItem
                label="Payment Received"
                date={order.paidAt}
                isCompleted={!!order.paidAt}
              />
              <TimelineItem
                label="Shipped"
                date={order.shippedAt}
                isCompleted={!!order.shippedAt}
              />
              <TimelineItem
                label="Delivered"
                date={order.deliveredAt}
                isCompleted={!!order.deliveredAt}
              />
              {order.cancelledAt && (
                <TimelineItem
                  label="Cancelled"
                  date={order.cancelledAt}
                  isCompleted={true}
                  isError={true}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showStatusModal && (
        <StatusUpdateModal
          currentStatus={order.status}
          onUpdate={handleStatusUpdate}
          onClose={() => setShowStatusModal(false)}
          isUpdating={isUpdating}
        />
      )}

      {showShippingModal && (
        <ShippingUpdateModal
          currentDetails={order.shippingDetails}
          onUpdate={handleShippingUpdate}
          onClose={() => setShowShippingModal(false)}
          isUpdating={isUpdating}
        />
      )}
    </div>
  );
}

// ============================================================================
// Timeline Item Component
// ============================================================================

function TimelineItem({
  label,
  date,
  isCompleted,
  isError = false,
}: {
  label: string;
  date?: string | null;
  isCompleted: boolean;
  isError?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "mt-0.5 h-4 w-4 rounded-full border-2",
          isCompleted
            ? isError
              ? "border-red-500 bg-red-500"
              : "border-green-500 bg-green-500"
            : "border-gray-300 bg-white"
        )}
      >
        {isCompleted && <CheckCircle2 className="h-3 w-3 text-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-medium",
            isCompleted ? (isError ? "text-red-600" : "text-foreground") : "text-muted-foreground"
          )}
        >
          {label}
        </p>
        {date && (
          <p className="text-xs text-muted-foreground">{new Date(date).toLocaleString("en-IN")}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

export function OrderDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-start justify-between">
        <div>
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      </div>

      {/* Actions skeleton */}
      <div className="flex gap-2">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column skeleton */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="mt-4 flex gap-4">
                <div className="h-16 w-16 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1">
                  <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column skeleton */}
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="h-6 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default OrderDetail;
