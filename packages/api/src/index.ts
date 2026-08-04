import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { compress } from "hono/compress";
import { checkDatabaseConnection } from "./database";
import { isRedisConnected } from "./lib/redis";
import redis from "./lib/redis";
import { authRateLimit, signUpRateLimit, otpRateLimit, forgotPasswordRateLimit } from "./middleware/rate-limit";
import { initSentry, captureException } from "./lib/sentry";
import { logger } from "./lib/logger";
import { alertCritical } from "./lib/alerts";

// Initialize Sentry early, before any routes are handled
initSentry();

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
import { adminCustomersApp } from "./routes/admin/customers";
import { adminWalletConfigApp } from "./routes/admin/wallet-config";
import { adminReviewsApp } from "./routes/admin/reviews";
import { adminShippingApp } from "./routes/admin/shipping";
import { adminShipmentsApp } from "./routes/admin/shipments";
import { adminReturnsApp } from "./routes/admin/returns";
import { adminNotificationsApp } from "./routes/admin/notifications";
import { adminApprovalsApp } from "./routes/admin/approvals";
import { adminModerationApp } from "./routes/admin/ai-moderation";
import { sitemapApp } from "./routes/sitemap";
import { shippingApp } from "./routes/shipping";
import { shipmentsApp } from "./routes/shipments";
import { returnsApp, returnPoliciesApp } from "./routes/returns";
import { trackingApp } from "./routes/tracking";
import { notificationPreferencesApp } from "./routes/notification-preferences";
import { addressesApp } from "./routes/addresses";
import wishlistApp from "./routes/wishlist";
import { approvalsApp } from "./routes/approvals";
import {
  productReviewsApp,
  reviewsApp,
  protectedReviewsApp,
} from "./routes/reviews";

const app = new Hono();

// Validate critical env vars in production
if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGIN) {
  throw new Error(
    "CORS_ORIGIN environment variable is required in production. " +
    "Set it to your production domain (e.g., https://chobii.art). " +
    "Multiple origins can be comma-separated."
  );
}

// Parse CORS origins (supports comma-separated list)
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:3001")
  .split(",")
  .map((o) => o.trim());

// Global middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  logger.info(
    { method: c.req.method, url: c.req.path, status: c.res.status, duration },
    `${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`
  );
});
app.use("*", secureHeaders());
app.use("*", compress());
app.use(
  "*",
  cors({
    origin: corsOrigins.length === 1 ? (corsOrigins[0] ?? "http://localhost:3001") : corsOrigins,
    credentials: true,
  })
);

// ============================================================================
// Auth Routes (Better Auth)
// ============================================================================
// Mount Better Auth handler for all auth endpoints
// Handles: /api/auth/sign-in, /api/auth/sign-up, /api/auth/sign-out,
//          /api/auth/session, /api/auth/callback/:provider, etc.

// Rate limit sensitive auth endpoints
app.post("/api/auth/sign-in/*", authRateLimit); // 5/min
app.post("/api/auth/sign-up/*", signUpRateLimit); // 3/min
app.post("/api/auth/forgot-password", forgotPasswordRateLimit); // 3/min

// General auth rate limit on all auth POST requests
app.post("/api/auth/*", authRateLimit); // 5/min

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  // Clone the request to ensure body is available for Better Auth
  // This is needed because middleware may have already read the body
  const req = c.req.raw.clone();
  return auth.handler(req as unknown as Request);
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

// Phone Auth API - SMS OTP login (rate limited)
app.post("/api/phone-auth/*", otpRateLimit); // 5/min
app.route("/api/phone-auth", phoneAuthApp);

// Reviews API - product reviews (public read)
// Note: Review creation is now only via order items endpoint
// GET /api/products/:productId/reviews - list reviews for a product
// GET/PATCH/DELETE /api/reviews/:reviewId - individual review operations
app.route("/api/products/:productId/reviews", productReviewsApp);
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

// Order Tracking API - public guest order lookup
app.route("/api/tracking", trackingApp);

// Notification Preferences API - user notification settings
app.route("/api/notification-preferences", notificationPreferencesApp);

// Addresses API - saved address management
app.route("/api/addresses", addressesApp);

// Wishlist API - saved products, over the existing users.wishlist_product_ids column
app.route("/api/wishlist", wishlistApp);

// Approvals API - public production photo approval access
app.route("/api/approvals", approvalsApp);

// ============================================================================
// Admin API Routes (Protected with role-based access)
// ============================================================================

// Admin Products API - CRUD for products
app.route("/api/admin/products", adminProductsApp);

// Admin Orders API - order management
app.route("/api/admin/orders", adminOrdersApp);

// Admin Customers API - user list and role assignment
app.route("/api/admin/customers", adminCustomersApp);

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

// Admin Notifications API - notification management and triggers
app.route("/api/admin", adminNotificationsApp);

// Admin Approvals API - production photo approval management
app.route("/api/admin/approvals", adminApprovalsApp);

// Admin AI Moderation API - AI generation review queue
app.route("/api/admin/ai-moderation", adminModerationApp);

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
app.get("/health", async (c) => {
  const startTime = process.hrtime.bigint();

  // Check database
  let dbStatus: "healthy" | "unhealthy" = "unhealthy";
  let dbLatency = 0;
  try {
    const dbStart = Date.now();
    const dbOk = await checkDatabaseConnection();
    dbLatency = Date.now() - dbStart;
    dbStatus = dbOk ? "healthy" : "unhealthy";
  } catch {
    dbStatus = "unhealthy";
  }

  // Check Redis
  let redisStatus: "healthy" | "unhealthy" = "unhealthy";
  let redisLatency = 0;
  try {
    const redisStart = Date.now();
    if (isRedisConnected()) {
      await redis.ping();
      redisLatency = Date.now() - redisStart;
      redisStatus = "healthy";
    }
  } catch {
    redisStatus = "unhealthy";
  }

  const overallStatus = dbStatus === "healthy" && redisStatus === "healthy"
    ? "healthy"
    : "unhealthy";

  const totalLatency = Number(process.hrtime.bigint() - startTime) / 1e6;

  const body = {
    status: overallStatus,
    service: "chobii-api",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    latency_ms: Math.round(totalLatency),
    components: {
      database: { status: dbStatus, latency_ms: dbLatency },
      redis: { status: redisStatus, latency_ms: redisLatency },
    },
  };

  return c.json(body, overallStatus === "healthy" ? 200 : 503);
});

// API health check (alias with /api prefix)
app.get("/api/health", async (c) => {
  // Forward to /health handler
  const res = await app.request("/health");
  const body = await res.json();
  return c.json(body, res.status as 200 | 503);
});

// API root
app.get("/", (c) => {
  return c.json({
    name: "chobii.art API",
    version: "0.0.1",
    health: "/api/health",
  });
});

// Global error handler — captures to Sentry and returns 500
app.onError((err, c) => {
  // Expected HTTP errors (401/403/404 thrown by middleware as
  // HTTPException) keep their status and response — they are not
  // incidents and must not page Sentry/Slack or collapse into 500s.
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  captureException(err, {
    url: c.req.url,
    method: c.req.method,
  });
  logger.error({ err, url: c.req.url, method: c.req.method }, "Unhandled error");
  alertCritical(
    "Unhandled API Error",
    `\`${c.req.method} ${c.req.path}\` threw an unhandled error:\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``,
    { url: c.req.url, method: c.req.method }
  );
  return c.json(
    { error: "Internal Server Error", message: "An unexpected error occurred" },
    500
  );
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
