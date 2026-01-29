/**
 * Email Templates for Order Notifications
 *
 * Responsive HTML email templates for order-related notifications.
 * All templates include MasonArt branding and are mobile-friendly.
 */

import type { Order } from "../database/schema/orders";

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
  <title>MasonArt</title>
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
      <h1>MASONART</h1>
    </div>
    ${content}
    <div class="footer">
      <p>Thank you for choosing MasonArt</p>
      <div class="social-links">
        <a href="https://masonart.com">Website</a> |
        <a href="https://instagram.com/masonart">Instagram</a> |
        <a href="mailto:support@masonart.com">Support</a>
      </div>
      <p style="font-size: 12px; color: #999; margin-top: 16px;">
        &copy; ${new Date().getFullYear()} MasonArt. All rights reserved.
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
        <a href="https://masonart.com/orders/${order.orderNumber}" class="button">View Order</a>
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

View your order: https://masonart.com/orders/${order.orderNumber}

Thank you for choosing MasonArt!
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
    `https://masonart.com/track/${order.orderNumber}`;
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

Thank you for choosing MasonArt!
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
    `https://masonart.com/track/${order.orderNumber}`;

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

Thank you for choosing MasonArt!
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
        <a href="https://masonart.com/reviews/new?order=${order.orderNumber}" class="button">Leave a Review</a>
      </center>

      <p style="text-align: center; color: #777; font-size: 14px; margin-top: 24px;">
        Love your art? Share it on Instagram and tag us <strong>@masonart</strong>!
      </p>
    </div>
  `;

  const text = `
Your Order Has Been Delivered!

Hi ${order.shippingAddress?.fullName || "there"},

Your art has arrived! We hope you love it as much as we loved creating it for you.

Order Number: ${order.orderNumber}
Delivered On: ${formatDate(new Date())}

Leave a review: https://masonart.com/reviews/new?order=${order.orderNumber}

Love your art? Share it on Instagram and tag us @masonart!

If you have any questions, contact us at support@masonart.com

Thank you for choosing MasonArt!
  `.trim();

  return {
    subject: `Delivered! Your Order ${order.orderNumber}`,
    html: baseTemplate(content),
    text,
  };
}
