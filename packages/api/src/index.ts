import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "./auth";
import { productsApp } from "./routes/products";
import { cartApp } from "./routes/cart";
import { ordersApp } from "./routes/orders";
import { aiApp } from "./routes/ai";
import { walletApp } from "./routes/wallet";
import { phoneAuthApp } from "./routes/phone-auth";
import { razorpayWebhooksApp } from "./routes/webhooks/razorpay";
import { walletWebhookApp } from "./routes/webhooks/wallet";
import { adminProductsApp } from "./routes/admin/products";
import { adminOrdersApp } from "./routes/admin/orders";
import { adminWalletConfigApp } from "./routes/admin/wallet-config";
import { adminReviewsApp } from "./routes/admin/reviews";
import { adminShippingApp } from "./routes/admin/shipping";
import { adminShipmentsApp } from "./routes/admin/shipments";
import { adminReturnsApp } from "./routes/admin/returns";
import { sitemapApp } from "./routes/sitemap";
import { shippingApp } from "./routes/shipping";
import { shipmentsApp } from "./routes/shipments";
import { returnsApp, returnPoliciesApp } from "./routes/returns";
import {
  productReviewsApp,
  createReviewApp,
  reviewsApp,
  protectedReviewsApp,
} from "./routes/reviews";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
    credentials: true,
  })
);

// ============================================================================
// Auth Routes (Better Auth)
// ============================================================================
// Mount Better Auth handler for all auth endpoints
// Handles: /api/auth/sign-in, /api/auth/sign-up, /api/auth/sign-out,
//          /api/auth/session, /api/auth/callback/:provider, etc.
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// ============================================================================
// API Routes
// ============================================================================

// Products API - list, search, get by slug
app.route("/api/products", productsApp);

// Cart API - get, add item, update, remove
app.route("/api/cart", cartApp);

// Orders API - create, get, list user orders
app.route("/api/orders", ordersApp);

// AI API - generate, list generations, gallery
app.route("/api/ai", aiApp);

// Wallet API - balance, transactions, top-up
app.route("/api/wallet", walletApp);

// Phone Auth API - SMS OTP login
app.route("/api/phone-auth", phoneAuthApp);

// Reviews API - product reviews (public read, auth for write)
// Note: Reviews use nested paths under products and separate /api/reviews
app.route("/api/products/:productId/reviews", productReviewsApp);
app.route("/api/products/:productId/reviews", createReviewApp);
app.route("/api/reviews", reviewsApp);
app.route("/api/reviews", protectedReviewsApp);

// Shipping API - shipping options and cost estimation
app.route("/api/shipping", shippingApp);

// Returns API - return requests and policies
// Note: returnPoliciesApp must be registered before the catch-all /api routes
// to avoid shipmentsApp/returnsApp middleware intercepting requests
app.route("/api/return-policies", returnPoliciesApp);

// Shipments API - order tracking for customers
// Mounted at /api to handle /api/orders/:orderId/shipments and /api/shipments/:id/track
app.route("/api", shipmentsApp);

// Returns API - protected return routes
// Mounted at /api to handle /api/orders/:orderId/returns and /api/returns/:id
app.route("/api", returnsApp);

// ============================================================================
// Admin API Routes (Protected with role-based access)
// ============================================================================

// Admin Products API - CRUD for products
app.route("/api/admin/products", adminProductsApp);

// Admin Orders API - order management
app.route("/api/admin/orders", adminOrdersApp);

// Admin Wallet Config API - pricing and stats
app.route("/api/admin/wallet-config", adminWalletConfigApp);

// Admin Reviews API - moderation
app.route("/api/admin/reviews", adminReviewsApp);

// Admin Shipping API - shipping option management
app.route("/api/admin/shipping", adminShippingApp);

// Admin Shipments API - shipment management
app.route("/api/admin/shipments", adminShipmentsApp);
app.route("/api/admin", adminShipmentsApp);

// Admin Returns API - return request management
app.route("/api/admin/returns", adminReturnsApp);

// ============================================================================
// Webhook Routes (External Service Callbacks)
// ============================================================================

// Razorpay payment webhooks
app.route("/api/webhooks/razorpay", razorpayWebhooksApp);

// Wallet top-up webhooks
app.route("/api/webhooks/wallet", walletWebhookApp);

// ============================================================================
// SEO Routes
// ============================================================================

// Sitemap XML generation for SEO crawlers
app.route("/sitemap.xml", sitemapApp);

// ============================================================================
// Health & Status Endpoints
// ============================================================================

// Health check endpoints
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// API health check (for API prefix consistency)
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "masonart-api",
    timestamp: new Date().toISOString(),
  });
});

// API root
app.get("/", (c) => {
  return c.json({
    name: "MasonArt API",
    version: "0.0.1",
    documentation: "/docs",
  });
});

// Export app for testing and type inference
export { app };
export type AppType = typeof app;

// Start server
const port = parseInt(process.env.PORT || "3000", 10);

export default {
  port,
  hostname: "0.0.0.0", // Listen on all network interfaces for LAN access
  fetch: app.fetch,
};
