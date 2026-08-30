import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { compress } from "hono/compress";
import { checkDatabaseConnection } from "./database";
import { isRedisConnected } from "./lib/redis";
import redis from "./lib/redis";
import { authRateLimit, signUpRateLimit, otpRateLimit, forgotPasswordRateLimit } from "./middleware/rate-limit";
import { requestContext, REQUEST_ID_HEADER } from "./middleware/request-context";
import { auditRequests } from "./middleware/audit";
import { initSentry, captureException } from "./lib/sentry";
import { logger } from "./lib/logger";
import { alertCritical } from "./lib/alerts";

// Initialize Sentry early, before any routes are handled
initSentry();

import { auth } from "./auth";
import { productsApp } from "./routes/products";
import { collectionsApp } from "./routes/collections";
import { adminCollectionsApp } from "./routes/admin/collections";
import { adminFramesApp } from "./routes/admin/frames";
import { promotionsApp } from "./routes/promotions";
import { cartApp } from "./routes/cart";
import { ordersApp } from "./routes/orders";
import { aiApp } from "./routes/ai";
import { walletApp } from "./routes/wallet";
import { giftCardsApp } from "./routes/gift-cards";
import { phoneAuthApp } from "./routes/phone-auth";
import { razorpayWebhooksApp } from "./routes/webhooks/razorpay";
import { walletWebhookApp } from "./routes/webhooks/wallet";
import { adminProductsApp } from "./routes/admin/products";
import { adminOrdersApp } from "./routes/admin/orders";
import { adminGiftCardsApp } from "./routes/admin/gift-cards";
import { adminCustomersApp } from "./routes/admin/customers";
import { adminPromotionsApp } from "./routes/admin/promotions";
import { adminWalletConfigApp } from "./routes/admin/wallet-config";
import { adminReviewsApp } from "./routes/admin/reviews";
import { adminShippingApp } from "./routes/admin/shipping";
import { adminShippingConfigApp } from "./routes/admin/shipping-config";
import {
  adminShipmentsApp,
  adminOrderShipmentsApp,
} from "./routes/admin/shipments";
import { adminReturnsApp } from "./routes/admin/returns";
import { adminNotificationsApp } from "./routes/admin/notifications";
import { adminApprovalsApp } from "./routes/admin/approvals";
import { adminModerationApp } from "./routes/admin/ai-moderation";
import { adminAuditLogApp } from "./routes/admin/audit-log";
import { adminVendorsApp } from "./routes/admin/vendors";
import { adminVendorRatesApp } from "./routes/admin/vendor-rates";
import { adminVendorPayablesApp } from "./routes/admin/vendor-payables";
import { adminVendorInviteApp } from "./routes/admin/vendor-invite";
import { adminProductionApp } from "./routes/admin/production-jobs";
import { adminTransfersApp } from "./routes/admin/transfers";
import { vendorApp } from "./routes/vendor";
import { sitemapApp } from "./routes/sitemap";
import { shippingApp } from "./routes/shipping";
import { shipmentsApp } from "./routes/shipments";
import { returnsApp, returnPoliciesApp } from "./routes/returns";
import { trackingApp } from "./routes/tracking";
import { notificationPreferencesApp } from "./routes/notification-preferences";
import { addressesApp } from "./routes/addresses";
import wishlistApp from "./routes/wishlist";
import { galleryApp } from "./routes/gallery";
import { approvalsApp } from "./routes/approvals";
import {
  productReviewsApp,
  reviewsApp,
  protectedReviewsApp,
} from "./routes/reviews";
import reviewMediaApp from "./routes/review-media";
import {
  startReviewMediaWorker,
  closeReviewMediaQueue,
} from "./queues/review-media";
import { startBackgroundWorkers, type BackgroundWorkers } from "./background";

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
//
// requestContext runs FIRST and owns the request-completion log line. Every
// downstream line and every audit row carries the same requestId, so a support
// ticket quoting the x-request-id header resolves to one request's whole story.
app.use("*", requestContext());
app.use("*", secureHeaders());
app.use("*", compress());
app.use(
  "*",
  cors({
    origin: corsOrigins.length === 1 ? (corsOrigins[0] ?? "http://localhost:3001") : corsOrigins,
    credentials: true,
    // Without this the browser hides the correlation id from client code, so a
    // web-side error report cannot quote the id the API already logged.
    exposeHeaders: [REQUEST_ID_HEADER],
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

// Collections API - the Discover rail and the collection pages behind it
app.route("/api/collections", collectionsApp);

// Promotions API - the running sale and this visitor's countdown deadline
app.route("/api/promotions", promotionsApp);

// Cart API - get, add item, update, remove
app.route("/api/cart", cartApp);

// Orders API - create, get, list user orders
app.route("/api/orders", ordersApp);

// AI API - generate, list generations, gallery
app.route("/api/ai", aiApp);

// Wallet API - balance, transactions, top-up
app.route("/api/wallet", walletApp);

// Gift Cards API - purchase a card (tender, not a discount)
app.route("/api/gift-cards", giftCardsApp);

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
// POST /api/reviews/:reviewId/media/presign|complete - direct-to-R2 uploads.
// Separate router: uploads are a different concern from reading/moderating,
// and routes/reviews.ts is already past 600 lines.
app.route("/api/reviews", reviewMediaApp);

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

// Gallery API - authenticated, idempotent membership opt-in
app.route("/api/gallery", galleryApp);

// Approvals API - public production photo approval access
app.route("/api/approvals", approvalsApp);

// ============================================================================
// Admin API Routes (Protected with role-based access)
// ============================================================================

// The audit floor. Mounted BEFORE every admin and vendor router so that any
// mutating request through either tree lands a row, whether or not its handler
// remembered to call recordAudit. Handlers that do call it claim the request and
// this middleware stays quiet — see middleware/audit.ts.
//
// Deliberately mounted here rather than inside each router: the gap this closes
// is a route nobody instrumented, and per-router opt-in reproduces exactly that
// failure mode.
app.use("/api/admin/*", auditRequests());
app.use("/api/vendor/*", auditRequests());

// Admin Products API - CRUD for products
app.route("/api/admin/products", adminProductsApp);

// Admin Collections API - curated collection CRUD
app.route("/api/admin/collections", adminCollectionsApp);

// Admin Frames API - frame catalogue and pricing CRUD
app.route("/api/admin/frames", adminFramesApp);

// Admin Orders API - order management
app.route("/api/admin/orders", adminOrdersApp);

// Admin Gift Cards API - issue, inspect, disable, adjust, liability
app.route("/api/admin/gift-cards", adminGiftCardsApp);

// Admin Customers API - user list and role assignment
app.route("/api/admin/customers", adminCustomersApp);

// Admin Promotions API - sale promotion CRUD
app.route("/api/admin/promotions", adminPromotionsApp);

// Admin Wallet Config API - pricing and stats
app.route("/api/admin/wallet-config", adminWalletConfigApp);

// Admin Reviews API - moderation
app.route("/api/admin/reviews", adminReviewsApp);

// Admin Shipping API - shipping option management
app.route("/api/admin/shipping", adminShippingApp);

// Admin Shipping Config API - the free-shipping threshold every surface prints.
// A separate mount from /api/admin/shipping, which owns shipping *options*:
// this is one money rule, effective-dated, and the storefront reads it too.
app.route("/api/admin/shipping-config", adminShippingConfigApp);

// Admin Shipments API - shipment management
app.route("/api/admin/shipments", adminShipmentsApp);
// POST /api/admin/orders/:orderId/ship only. Mounting the whole shipments
// router here instead also mounted its `GET /:id`, and `GET /api/admin/:id`
// answered every single-segment admin list route registered below it with
// `400 Invalid shipment ID` — the vendor directory and the production queue
// were both dead. See the comment on adminOrderShipmentsApp.
app.route("/api/admin", adminOrderShipmentsApp);

// Admin Returns API - return request management
app.route("/api/admin/returns", adminReturnsApp);

// Admin Notifications API - notification management and triggers
app.route("/api/admin", adminNotificationsApp);

// Admin Approvals API - production photo approval management
app.route("/api/admin/approvals", adminApprovalsApp);

// Admin AI Moderation API - AI generation review queue
app.route("/api/admin/ai-moderation", adminModerationApp);

// Admin Audit Log API - who did what, to what, when. Admin-only, unlike the
// catalogue routers: rows carry customer emails and every domain's actions.
app.route("/api/admin/audit-log", adminAuditLogApp);

// Admin Vendors API - vendor directory, contacts and capabilities.
// Admin-only, unlike the catalogue routers above: the list carries what we owe
// each vendor and the detail view carries what we buy at.
app.route("/api/admin/vendors", adminVendorsApp);

// Admin Vendor Rate Cards - effective-dated bands, mounted on the same prefix.
// Hono merges routes additively, so this composes with adminVendorsApp above.
app.route("/api/admin/vendors", adminVendorRatesApp);

// Payables, settlements and the vendor account invite. Separate routers on the
// same prefix — Hono merges them additively, and keeping them apart keeps the
// money paths reviewable on their own.
app.route("/api/admin/vendors", adminVendorPayablesApp);
app.route("/api/admin/vendors", adminVendorInviteApp);

// Admin Production API - job queue, assignment pricing and QC reviews.
// Admin-only: assignment writes what we will owe the vendor.
app.route("/api/admin/production", adminProductionApp);

// Admin Transfers API - inter-vendor legs, and declaring a parcel lost.
// A separate router from the production queue above, on its own prefix: this is
// the one route in the tree that creates work nobody has been paid for yet.
// Admin-only and unreachable from /api/vendor by construction — a vendor
// declaring a parcel lost is a vendor deciding who eats that cost.
app.route("/api/admin/transfers", adminTransfersApp);

// Vendor Portal API - a supplier's own jobs, rates and payments. Every read is
// row-scoped in lib/vendor-scope, not by role: this tree carries no admin grant.
app.route("/api/vendor", vendorApp);

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
  const requestId = c.get("requestId" as never) as string | undefined;

  captureException(err, {
    url: c.req.url,
    method: c.req.method,
    ...(requestId ? { requestId } : {}),
  });
  logger.error(
    { err, url: c.req.url, method: c.req.method, requestId },
    "Unhandled error"
  );
  alertCritical(
    "Unhandled API Error",
    `\`${c.req.method} ${c.req.path}\` threw an unhandled error:\n\`\`\`${err instanceof Error ? err.message : String(err)}\`\`\``,
    { url: c.req.url, method: c.req.method, requestId: requestId ?? "unknown" }
  );
  // The id goes in the body as well as the header: a user reporting a failure
  // pastes what they can see, and a screenshot has no headers in it.
  return c.json(
    {
      error: "Internal Server Error",
      message: "An unexpected error occurred",
      requestId: requestId ?? null,
    },
    500
  );
});

// ============================================================================
// Background Workers
// ============================================================================

// The AI generation worker starts itself at import time (queues/ai-generation,
// pulled in by routes/ai). Review media transcoding is started explicitly here
// instead: it shells out to ffmpeg, so it must not spin up inside test runs or
// one-off scripts that merely import this module.
let backgroundWorkers: BackgroundWorkers | undefined;

if (process.env.NODE_ENV !== "test") {
  startReviewMediaWorker();

  // Periodic sweeps: scheduled gift card delivery and approval deadlines.
  // See src/background.ts for why every instance runs them and how to opt out.
  backgroundWorkers = startBackgroundWorkers();

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    // Registering a handler overrides the default terminate behaviour, so this
    // path owns the exit — without it Ctrl-C in dev would no longer stop the
    // server.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Shutting down: stopping background workers");
    backgroundWorkers?.stop();

    logger.info({ signal }, "Shutting down: closing review media queue");
    try {
      await closeReviewMediaQueue();
    } catch (err) {
      logger.error({ err }, "Failed to close review media queue cleanly");
    }
    process.exit(0);
  };

  process.once("SIGTERM", (signal) => void shutdown(signal));
  process.once("SIGINT", (signal) => void shutdown(signal));
}

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
