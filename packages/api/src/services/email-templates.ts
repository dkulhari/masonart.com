/**
 * Email Templates for Order Notifications
 *
 * Responsive HTML email templates for order-related notifications.
 * All templates include chobii.art branding and are mobile-friendly.
 */

import type { Order } from "../database/schema/orders";
import type { ProductionApproval, ApprovalPhoto } from "../database/schema/approvals";

// ============================================================================
// Types
// ============================================================================

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// ============================================================================
// Template Helpers
// ============================================================================

const BRAND_COLOR = "#1a1a1a";
const ACCENT_COLOR = "#d4a574";
const LIGHT_BG = "#f8f8f8";

/**
 * Base HTML wrapper for all email templates
 */
function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>chobii.art</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: ${LIGHT_BG};
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: ${BRAND_COLOR};
      padding: 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 300;
      letter-spacing: 4px;
    }
    .content {
      padding: 32px 24px;
    }
    .content h2 {
      color: ${BRAND_COLOR};
      font-size: 24px;
      margin: 0 0 16px 0;
    }
    .content p {
      margin: 0 0 16px 0;
      color: #555;
    }
    .order-box {
      background-color: ${LIGHT_BG};
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .order-box h3 {
      margin: 0 0 12px 0;
      color: ${BRAND_COLOR};
      font-size: 16px;
    }
    .order-detail {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .order-detail:last-child {
      border-bottom: none;
    }
    .order-detail .label {
      color: #777;
    }
    .order-detail .value {
      font-weight: 600;
      color: ${BRAND_COLOR};
    }
    .button {
      display: inline-block;
      background-color: ${BRAND_COLOR};
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 4px;
      font-weight: 500;
      margin: 16px 0;
    }
    .button:hover {
      background-color: #333;
    }
    .tracking-box {
      background-color: ${ACCENT_COLOR}15;
      border-left: 4px solid ${ACCENT_COLOR};
      padding: 16px;
      margin: 24px 0;
    }
    .tracking-box h3 {
      margin: 0 0 8px 0;
      color: ${BRAND_COLOR};
    }
    .footer {
      background-color: ${LIGHT_BG};
      padding: 24px;
      text-align: center;
      font-size: 14px;
      color: #777;
    }
    .footer a {
      color: ${BRAND_COLOR};
      text-decoration: none;
    }
    .social-links {
      margin: 16px 0;
    }
    .social-links a {
      margin: 0 8px;
      color: #555;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 24px 16px;
      }
      .header h1 {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CHOBII.ART</h1>
    </div>
    ${content}
    <div class="footer">
      <p>Thank you for choosing chobii.art</p>
      <div class="social-links">
        <a href="https://chobii.art">Website</a> |
        <a href="https://instagram.com/chobiiart">Instagram</a> |
        <a href="mailto:support@chobii.art">Support</a>
      </div>
      <p style="font-size: 12px; color: #999; margin-top: 16px;">
        &copy; ${new Date().getFullYear()} chobii.art. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format currency (INR)
 */
function formatCurrency(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Format date
 */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Get shipping address as string
 */
function formatShippingAddress(order: Order): string {
  const addr = order.shippingAddress;
  if (!addr) return "Address not available";

  const parts = [
    addr.fullName,
    addr.addressLine1,
    addr.addressLine2,
    addr.landmark,
    `${addr.city}, ${addr.state} ${addr.postalCode}`,
  ].filter(Boolean);

  return parts.join("<br>");
}

// ============================================================================
// Email Templates
// ============================================================================

/**
 * Order Confirmation Email Template
 */
export function getOrderConfirmationTemplate(order: Order): EmailTemplate {
  const content = `
    <div class="content">
      <h2>Order Confirmed!</h2>
      <p>Hi ${order.shippingAddress?.fullName || "there"},</p>
      <p>Thank you for your order! We're excited to get your art on its way to you.</p>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Order Date</span>
          <span class="value">${formatDate(order.createdAt)}</span>
        </div>
        <div class="order-detail">
          <span class="label">Items</span>
          <span class="value">${order.itemCount} item${order.itemCount > 1 ? "s" : ""}</span>
        </div>
        <div class="order-detail">
          <span class="label">Total</span>
          <span class="value">${formatCurrency(order.total)}</span>
        </div>
      </div>

      <div class="order-box">
        <h3>Shipping To</h3>
        <p style="margin: 0;">${formatShippingAddress(order)}</p>
      </div>

      <p>We'll send you another email when your order ships with tracking information.</p>

      <center>
        <a href="https://chobii.art/orders/${order.orderNumber}" class="button">View Order</a>
      </center>
    </div>
  `;

  const text = `
Order Confirmed!

Hi ${order.shippingAddress?.fullName || "there"},

Thank you for your order! We're excited to get your art on its way to you.

Order Details:
- Order Number: ${order.orderNumber}
- Order Date: ${formatDate(order.createdAt)}
- Items: ${order.itemCount}
- Total: ${formatCurrency(order.total)}

We'll send you another email when your order ships.

View your order: https://chobii.art/orders/${order.orderNumber}

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Order Confirmed - ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * Order Shipped Email Template
 */
export function getShippedTemplate(order: Order): EmailTemplate {
  const trackingUrl =
    order.shippingDetails?.trackingUrl ||
    `https://chobii.art/track/${order.orderNumber}`;
  const carrier = order.shippingDetails?.carrier || "our carrier partner";
  const trackingNumber = order.shippingDetails?.trackingNumber || "";
  const estimatedDelivery = order.shippingDetails?.estimatedDelivery;

  const content = `
    <div class="content">
      <h2>Your Order Has Shipped!</h2>
      <p>Hi ${order.shippingAddress?.fullName || "there"},</p>
      <p>Great news! Your order is on its way to you.</p>

      <div class="tracking-box">
        <h3>Tracking Information</h3>
        <p style="margin: 0;">
          <strong>Carrier:</strong> ${carrier}<br>
          ${trackingNumber ? `<strong>Tracking Number:</strong> ${trackingNumber}<br>` : ""}
          ${estimatedDelivery ? `<strong>Estimated Delivery:</strong> ${formatDate(estimatedDelivery)}` : ""}
        </p>
      </div>

      <center>
        <a href="${trackingUrl}" class="button">Track Your Order</a>
      </center>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Items</span>
          <span class="value">${order.itemCount} item${order.itemCount > 1 ? "s" : ""}</span>
        </div>
      </div>

      <div class="order-box">
        <h3>Shipping To</h3>
        <p style="margin: 0;">${formatShippingAddress(order)}</p>
      </div>
    </div>
  `;

  const text = `
Your Order Has Shipped!

Hi ${order.shippingAddress?.fullName || "there"},

Great news! Your order is on its way to you.

Tracking Information:
- Carrier: ${carrier}
${trackingNumber ? `- Tracking Number: ${trackingNumber}` : ""}
${estimatedDelivery ? `- Estimated Delivery: ${formatDate(estimatedDelivery)}` : ""}

Track your order: ${trackingUrl}

Order Number: ${order.orderNumber}

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Your Order Has Shipped - ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * Out for Delivery Email Template
 */
export function getOutForDeliveryTemplate(order: Order): EmailTemplate {
  const trackingUrl =
    order.shippingDetails?.trackingUrl ||
    `https://chobii.art/track/${order.orderNumber}`;

  const content = `
    <div class="content">
      <h2>Out for Delivery Today!</h2>
      <p>Hi ${order.shippingAddress?.fullName || "there"},</p>
      <p>Exciting news! Your order is out for delivery and should arrive today.</p>

      <div class="tracking-box">
        <h3>Delivery Today</h3>
        <p style="margin: 0;">
          Please ensure someone is available to receive the package at the delivery address.
        </p>
      </div>

      <center>
        <a href="${trackingUrl}" class="button">Track Delivery</a>
      </center>

      <div class="order-box">
        <h3>Delivering To</h3>
        <p style="margin: 0;">${formatShippingAddress(order)}</p>
      </div>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
      </div>
    </div>
  `;

  const text = `
Out for Delivery Today!

Hi ${order.shippingAddress?.fullName || "there"},

Exciting news! Your order is out for delivery and should arrive today.

Please ensure someone is available to receive the package.

Track delivery: ${trackingUrl}

Order Number: ${order.orderNumber}

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Out for Delivery Today - ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * Order Delivered Email Template
 */
export function getDeliveredTemplate(order: Order): EmailTemplate {
  const content = `
    <div class="content">
      <h2>Your Order Has Been Delivered!</h2>
      <p>Hi ${order.shippingAddress?.fullName || "there"},</p>
      <p>Your art has arrived! We hope you love it as much as we loved creating it for you.</p>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Delivered On</span>
          <span class="value">${formatDate(new Date())}</span>
        </div>
      </div>

      <p>If you have any questions about your order or need assistance, our support team is here to help.</p>

      <center>
        <a href="https://chobii.art/reviews/new?order=${order.orderNumber}" class="button">Leave a Review</a>
      </center>

      <p style="text-align: center; color: #777; font-size: 14px; margin-top: 24px;">
        Love your art? Share it on Instagram and tag us <strong>@chobiiart</strong>!
      </p>
    </div>
  `;

  const text = `
Your Order Has Been Delivered!

Hi ${order.shippingAddress?.fullName || "there"},

Your art has arrived! We hope you love it as much as we loved creating it for you.

Order Number: ${order.orderNumber}
Delivered On: ${formatDate(new Date())}

Leave a review: https://chobii.art/reviews/new?order=${order.orderNumber}

Love your art? Share it on Instagram and tag us @chobiiart!

If you have any questions, contact us at support@chobii.art

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Delivered! Your Order ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

// ============================================================================
// Production Approval Email Templates
// ============================================================================

/**
 * Approval context for email templates
 */
export interface ApprovalEmailContext {
  approval: ProductionApproval;
  order: {
    orderNumber: string;
    shippingAddress?: {
      fullName?: string;
    };
  };
  orderItem: {
    snapshot: {
      title?: string;
      sizeLabel?: string;
    };
  };
  photos?: ApprovalPhoto[];
  approvalUrl: string;
}

/**
 * Photo Ready for Review Email Template
 * Sent when admin uploads production photos for customer review
 */
export function getPhotoReadyForReviewTemplate(
  context: ApprovalEmailContext
): EmailTemplate {
  const { approval, order, orderItem, photos, approvalUrl } = context;
  const customerName = order.shippingAddress?.fullName || "there";
  const productTitle = orderItem.snapshot?.title || "your custom item";
  const photoCount = photos?.length || 0;

  const content = `
    <div class="content">
      <h2>Your Production Photos Are Ready!</h2>
      <p>Hi ${customerName},</p>
      <p>Great news! We've completed production of <strong>${productTitle}</strong> and have taken photos for your review.</p>

      <div class="tracking-box">
        <h3>Action Required</h3>
        <p style="margin: 0;">
          Please review the ${photoCount} production photo${photoCount !== 1 ? "s" : ""} and either approve for shipping or request any adjustments.
        </p>
      </div>

      <center>
        <a href="${approvalUrl}" class="button">Review Photos</a>
      </center>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Item</span>
          <span class="value">${productTitle}</span>
        </div>
        ${orderItem.snapshot?.sizeLabel ? `
        <div class="order-detail">
          <span class="label">Size</span>
          <span class="value">${orderItem.snapshot.sizeLabel}</span>
        </div>
        ` : ""}
        <div class="order-detail">
          <span class="label">Review Deadline</span>
          <span class="value">${approval.deadlineAt ? formatDate(approval.deadlineAt) : "7 days from now"}</span>
        </div>
      </div>

      <p style="color: #777; font-size: 14px;">
        <strong>Note:</strong> If we don't hear from you by the deadline, we'll proceed with shipping based on the current production.
      </p>
    </div>
  `;

  const text = `
Your Production Photos Are Ready!

Hi ${customerName},

Great news! We've completed production of ${productTitle} and have taken photos for your review.

Please review the photos and either approve for shipping or request any adjustments.

Review Photos: ${approvalUrl}

Order Details:
- Order Number: ${order.orderNumber}
- Item: ${productTitle}
${orderItem.snapshot?.sizeLabel ? `- Size: ${orderItem.snapshot.sizeLabel}` : ""}
- Review Deadline: ${approval.deadlineAt ? formatDate(approval.deadlineAt) : "7 days from now"}

Note: If we don't hear from you by the deadline, we'll proceed with shipping based on the current production.

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Review Your Production Photos - ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * Changes Requested Response Email Template
 * Sent when admin responds to customer's change request with new photos
 */
export function getChangesRequestedResponseTemplate(
  context: ApprovalEmailContext
): EmailTemplate {
  const { order, orderItem, photos, approvalUrl } = context;
  const customerName = order.shippingAddress?.fullName || "there";
  const productTitle = orderItem.snapshot?.title || "your custom item";
  const photoCount = photos?.length || 0;

  const content = `
    <div class="content">
      <h2>We've Made the Changes You Requested</h2>
      <p>Hi ${customerName},</p>
      <p>Thank you for your feedback! We've addressed your concerns and uploaded ${photoCount} new photo${photoCount !== 1 ? "s" : ""} of <strong>${productTitle}</strong> for your review.</p>

      <div class="tracking-box">
        <h3>Ready for Your Review</h3>
        <p style="margin: 0;">
          Please take a look at the updated production photos and let us know if everything looks good.
        </p>
      </div>

      <center>
        <a href="${approvalUrl}" class="button">Review Updated Photos</a>
      </center>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Item</span>
          <span class="value">${productTitle}</span>
        </div>
      </div>

      <p>We're committed to making sure you're 100% happy with your order!</p>
    </div>
  `;

  const text = `
We've Made the Changes You Requested

Hi ${customerName},

Thank you for your feedback! We've addressed your concerns and uploaded new photos of ${productTitle} for your review.

Please take a look at the updated production photos and let us know if everything looks good.

Review Updated Photos: ${approvalUrl}

Order Details:
- Order Number: ${order.orderNumber}
- Item: ${productTitle}

We're committed to making sure you're 100% happy with your order!

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Updated Photos Ready for Review - ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * Approval Confirmed Email Template
 * Sent when customer approves production for shipping
 */
export function getApprovalConfirmedTemplate(
  context: ApprovalEmailContext
): EmailTemplate {
  const { order, orderItem } = context;
  const customerName = order.shippingAddress?.fullName || "there";
  const productTitle = orderItem.snapshot?.title || "your custom item";

  const content = `
    <div class="content">
      <h2>Thank You for Your Approval!</h2>
      <p>Hi ${customerName},</p>
      <p>You've approved <strong>${productTitle}</strong> for shipping. We're now preparing your order for dispatch.</p>

      <div class="tracking-box">
        <h3>What's Next?</h3>
        <p style="margin: 0;">
          Your order will be carefully packaged and shipped. You'll receive another email with tracking information once it's on its way.
        </p>
      </div>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Item</span>
          <span class="value">${productTitle}</span>
        </div>
        <div class="order-detail">
          <span class="label">Status</span>
          <span class="value" style="color: #22c55e;">Approved ✓</span>
        </div>
      </div>

      <center>
        <a href="https://chobii.art/orders/${order.orderNumber}" class="button">View Order</a>
      </center>

      <p style="text-align: center; color: #777;">
        Thank you for trusting us with your custom art!
      </p>
    </div>
  `;

  const text = `
Thank You for Your Approval!

Hi ${customerName},

You've approved ${productTitle} for shipping. We're now preparing your order for dispatch.

What's Next?
Your order will be carefully packaged and shipped. You'll receive another email with tracking information once it's on its way.

Order Details:
- Order Number: ${order.orderNumber}
- Item: ${productTitle}
- Status: Approved ✓

View your order: https://chobii.art/orders/${order.orderNumber}

Thank you for trusting us with your custom art!

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Approved for Shipping - ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * Approval Deadline Reminder Email Template
 * Sent when approval deadline is approaching
 */
export function getApprovalDeadlineReminderTemplate(
  context: ApprovalEmailContext
): EmailTemplate {
  const { approval, order, orderItem, approvalUrl } = context;
  const customerName = order.shippingAddress?.fullName || "there";
  const productTitle = orderItem.snapshot?.title || "your custom item";

  const content = `
    <div class="content">
      <h2>Reminder: Review Your Production Photos</h2>
      <p>Hi ${customerName},</p>
      <p>We noticed you haven't reviewed the production photos for <strong>${productTitle}</strong> yet.</p>

      <div class="tracking-box" style="background-color: #fef3c7; border-color: #f59e0b;">
        <h3 style="color: #92400e;">Deadline Approaching</h3>
        <p style="margin: 0; color: #92400e;">
          Please review and approve by <strong>${approval.deadlineAt ? formatDate(approval.deadlineAt) : "the deadline"}</strong> to avoid any delays.
        </p>
      </div>

      <center>
        <a href="${approvalUrl}" class="button">Review Photos Now</a>
      </center>

      <div class="order-box">
        <h3>Order Details</h3>
        <div class="order-detail">
          <span class="label">Order Number</span>
          <span class="value">${order.orderNumber}</span>
        </div>
        <div class="order-detail">
          <span class="label">Item</span>
          <span class="value">${productTitle}</span>
        </div>
      </div>

      <p style="color: #777; font-size: 14px;">
        If you've already reviewed and approved, please disregard this email. If you have any questions, feel free to reply to this email or contact our support team.
      </p>
    </div>
  `;

  const text = `
Reminder: Review Your Production Photos

Hi ${customerName},

We noticed you haven't reviewed the production photos for ${productTitle} yet.

DEADLINE APPROACHING
Please review and approve by ${approval.deadlineAt ? formatDate(approval.deadlineAt) : "the deadline"} to avoid any delays.

Review Photos Now: ${approvalUrl}

Order Details:
- Order Number: ${order.orderNumber}
- Item: ${productTitle}

If you've already reviewed and approved, please disregard this email.

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Reminder: Review Photos for ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}

// ============================================================================
// AI Generation Moderation Email Templates
// ============================================================================

export interface AIModerationEmailContext {
  userName: string;
  userEmail: string;
  generationId: string;
  promptText: string;
  stylePreset: string;
  imageUrl?: string | null;
}

/**
 * AI Generation Approved Email Template
 * Sent when an AI-generated image passes moderation
 */
export function getAIGenerationApprovedTemplate(
  context: AIModerationEmailContext
): EmailTemplate {
  const { userName, generationId, promptText, stylePreset, imageUrl } = context;
  const displayName = userName || "there";
  const truncatedPrompt = promptText.length > 100
    ? promptText.substring(0, 100) + "..."
    : promptText;

  const content = `
    <div class="content">
      <h2>Your AI Creation is Approved! ✨</h2>
      <p>Hi ${displayName},</p>
      <p>Great news! Your AI-generated artwork has been reviewed and approved. You can now add it to your cart and share it in the gallery.</p>

      ${imageUrl ? `
      <div style="text-align: center; margin: 24px 0;">
        <img src="${imageUrl}" alt="Your AI Creation" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
      </div>
      ` : ''}

      <div class="order-box">
        <h3>Creation Details</h3>
        <div class="order-detail">
          <span class="label">Style</span>
          <span class="value">${stylePreset.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
        </div>
        <div class="order-detail">
          <span class="label">Prompt</span>
          <span class="value">${truncatedPrompt}</span>
        </div>
        <div class="order-detail">
          <span class="label">Status</span>
          <span class="value" style="color: #22c55e;">Approved ✓</span>
        </div>
      </div>

      <center>
        <a href="https://chobii.art/account/ai-creations/${generationId}" class="button">View Your Creation</a>
      </center>

      <p style="text-align: center; color: #777; margin-top: 24px;">
        Ready to bring your art to life? Add it to your cart and we'll print it beautifully!
      </p>
    </div>
  `;

  const text = `
Your AI Creation is Approved! ✨

Hi ${displayName},

Great news! Your AI-generated artwork has been reviewed and approved. You can now add it to your cart and share it in the gallery.

Creation Details:
- Style: ${stylePreset.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
- Prompt: ${truncatedPrompt}
- Status: Approved ✓

View your creation: https://chobii.art/account/ai-creations/${generationId}

Ready to bring your art to life? Add it to your cart and we'll print it beautifully!

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `Your AI Creation is Approved! ✨`,
    html: baseTemplate(content),
    text,
  };
}

/**
 * AI Generation Rejected Email Template
 * Sent when an AI-generated image is rejected by moderation
 */
export function getAIGenerationRejectedTemplate(
  context: AIModerationEmailContext & {
    rejectionReason: string;
    rejectionCategory?: string;
  }
): EmailTemplate {
  const { userName, promptText, stylePreset, rejectionReason, rejectionCategory } = context;
  const displayName = userName || "there";
  const truncatedPrompt = promptText.length > 100
    ? promptText.substring(0, 100) + "..."
    : promptText;

  const categoryDisplay = rejectionCategory
    ? rejectionCategory.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Content Policy';

  const content = `
    <div class="content">
      <h2>AI Creation Review Update</h2>
      <p>Hi ${displayName},</p>
      <p>Thank you for using chobii.art's AI art generator. Unfortunately, your recent creation could not be approved for printing or gallery sharing.</p>

      <div class="tracking-box" style="background-color: #fef2f2; border-left: 4px solid #ef4444;">
        <h3 style="color: #dc2626;">Reason: ${categoryDisplay}</h3>
        <p style="margin: 0; color: #991b1b;">
          ${rejectionReason}
        </p>
      </div>

      <div class="order-box">
        <h3>Creation Details</h3>
        <div class="order-detail">
          <span class="label">Style</span>
          <span class="value">${stylePreset.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
        </div>
        <div class="order-detail">
          <span class="label">Prompt</span>
          <span class="value">${truncatedPrompt}</span>
        </div>
        <div class="order-detail">
          <span class="label">Status</span>
          <span class="value" style="color: #ef4444;">Not Approved</span>
        </div>
      </div>

      <p>You're welcome to create a new artwork with a different prompt. Our content guidelines ensure all artwork is appropriate for printing and display.</p>

      <center>
        <a href="https://chobii.art/create" class="button">Create New Artwork</a>
      </center>

      <p style="text-align: center; color: #777; margin-top: 24px;">
        Questions? Contact our support team and we'll be happy to help.
      </p>
    </div>
  `;

  const text = `
AI Creation Review Update

Hi ${displayName},

Thank you for using chobii.art's AI art generator. Unfortunately, your recent creation could not be approved for printing or gallery sharing.

Reason: ${categoryDisplay}
${rejectionReason}

Creation Details:
- Style: ${stylePreset.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
- Prompt: ${truncatedPrompt}
- Status: Not Approved

You're welcome to create a new artwork with a different prompt. Our content guidelines ensure all artwork is appropriate for printing and display.

Create new artwork: https://chobii.art/create

Questions? Contact our support team and we'll be happy to help.

Thank you for choosing chobii.art!
  `.trim();

  return {
    subject: `AI Creation Review Update`,
    html: baseTemplate(content),
    text,
  };
}

// ============================================================================
// Auth Emails (#342 verification, #242 password reset)
// ============================================================================

/**
 * Escape user-controlled values before HTML interpolation. Signup names are
 * attacker-controlled — without this, a name like "<img onerror=...>" would
 * inject markup into the email body.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Email Verification Template
 *
 * Sent by Better Auth's sendVerificationEmail hook on sign-up. The URL is
 * Better Auth's /api/auth/verify-email link (24h expiry configured in
 * auth/index.ts).
 */
export function getVerificationEmailTemplate(params: {
  name: string;
  url: string;
}): EmailTemplate {
  const name = escapeHtml(params.name || "");
  const url = escapeHtml(params.url);
  const content = `
    <div class="content">
      <h2>Verify your email</h2>
      <p>Hi ${name || "there"},</p>
      <p>Welcome to chobii.art! Please confirm your email address to finish
      setting up your account.</p>
      <div style="text-align: center;">
        <a href="${url}" class="button">Verify Email</a>
      </div>
      <p>This link expires in 24 hours. If the button doesn't work, copy and
      paste this URL into your browser:</p>
      <p style="word-break: break-all;"><a href="${url}">${url}</a></p>
      <p>If you didn't create a chobii.art account, you can safely ignore
      this email.</p>
    </div>
  `.trim();

  const text = `Hi ${name || "there"},

Welcome to chobii.art! Verify your email address to finish setting up your account:

${url}

This link expires in 24 hours. If you didn't create a chobii.art account, ignore this email.`;

  return {
    subject: "Verify your chobii.art email",
    html: baseTemplate(content),
    text,
  };
}

/**
 * Password Reset Template
 *
 * Sent by Better Auth's sendResetPassword hook when a user requests a
 * password reset (#242). The URL carries the one-time reset token.
 */
export function getPasswordResetTemplate(params: {
  name: string;
  url: string;
}): EmailTemplate {
  const name = escapeHtml(params.name || "");
  const url = escapeHtml(params.url);
  const content = `
    <div class="content">
      <h2>Reset your password</h2>
      <p>Hi ${name || "there"},</p>
      <p>We received a request to reset the password for your chobii.art
      account. Click the button below to choose a new password.</p>
      <div style="text-align: center;">
        <a href="${url}" class="button">Reset Password</a>
      </div>
      <p>If the button doesn't work, copy and paste this URL into your
      browser:</p>
      <p style="word-break: break-all;"><a href="${url}">${url}</a></p>
      <p>If you didn't request a password reset, you can safely ignore this
      email — your password will not change.</p>
    </div>
  `.trim();

  const text = `Hi ${name || "there"},

We received a request to reset your chobii.art password. Choose a new password here:

${url}

If you didn't request this, ignore this email — your password will not change.`;

  return {
    subject: "Reset your chobii.art password",
    html: baseTemplate(content),
    text,
  };
}
