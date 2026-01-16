import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

/**
 * MasonArt API Server
 *
 * Main Hono application server for the MasonArt e-commerce platform.
 * Provides REST API endpoints for products, orders, cart, authentication, and AI generation.
 */

// Create the main Hono app instance
export const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.VITE_WEB_URL || 'http://localhost:3001',
  credentials: true,
}));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'masonart-api',
    version: '1.0.0',
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({
    message: 'MasonArt API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
    },
  });
});

// API routes group
const api = new Hono();

api.get('/', (c) => {
  return c.json({
    message: 'MasonArt API v1',
    endpoints: {
      products: '/api/products',
      cart: '/api/cart',
      orders: '/api/orders',
      auth: '/api/auth',
      ai: '/api/ai',
      admin: '/api/admin',
    },
  });
});

// Mount API routes
app.route('/api', api);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
  }, 500);
});

// Export for testing
export default app;

// Server instance (only created when not in test mode)
let server: any;

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  const port = parseInt(process.env.PORT || '3000', 10);

  console.log(`🚀 MasonArt API server starting on port ${port}...`);

  server = Bun.serve({
    port,
    fetch: app.fetch,
  });

  console.log(`✅ Server running at http://localhost:${port}`);
}

export { server };
