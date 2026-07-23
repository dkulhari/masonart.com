# chobii.art Roles and Capabilities

A comprehensive guide to user roles, permissions, and access control in the chobii.art platform.

**Last Updated:** 2026-01-27

---

## Table of Contents

1. [Role Overview](#role-overview)
2. [Guest (Unauthenticated)](#guest-unauthenticated)
3. [Customer](#customer)
4. [Trade](#trade)
5. [Admin](#admin)
6. [Super-Admin](#super-admin)
7. [Role Comparison Matrix](#role-comparison-matrix)
8. [Middleware Reference](#middleware-reference)
9. [Test Coverage](#test-coverage)
10. [Future Considerations](#future-considerations)

---

## Role Overview

chobii.art uses a role-based access control (RBAC) system with five distinct user types:

| Role | Database Value | Description |
|------|----------------|-------------|
| Guest | N/A (no user record) | Unauthenticated visitors |
| Customer | `customer` | Regular registered users |
| Trade | `trade` | Trade program members (wholesale) |
| Admin | `admin` | Platform administrators |
| Super-Admin | `super-admin` | System-level administrators |

**Role Hierarchy:**
```
super-admin
    └── admin
        └── trade
            └── customer
                └── guest
```

Higher roles inherit capabilities from lower roles (with some exceptions).

---

## Guest (Unauthenticated)

Visitors who have not logged in or created an account.

### Capabilities

| Feature | Access | Notes |
|---------|--------|-------|
| Browse products | ✅ Yes | Full catalog access |
| View product details | ✅ Yes | Including pricing |
| Add to cart | ✅ Yes | Cart stored in localStorage |
| View cart | ✅ Yes | |
| Checkout | ✅ Yes | Guest checkout supported |
| Create account | ✅ Yes | Registration page |
| Login | ✅ Yes | Login page |
| AI Generator | ⚠️ Limited | Can view page, must login to generate |
| View AI Gallery | ✅ Yes | Public gallery |
| Account dashboard | ❌ No | Redirects to login |
| Order history | ❌ No | Requires authentication |
| Wallet | ❌ No | Requires authentication |
| Admin panel | ❌ No | Redirects to login |

### Routes

```
Public routes (no auth required):
- / (home)
- /posters (product listing)
- /posters/:slug (product detail)
- /cart
- /checkout (guest checkout)
- /create (AI generator - view only)
- /gallery (public AI gallery)
- /about, /contact, /faq, /shipping, /returns
- /auth/login, /auth/register, /auth/forgot-password
```

### Middleware

No authentication middleware applied to public routes.

---

## Customer

Registered users with a verified account. This is the default role for new registrations.

### Capabilities

| Feature | Access | Notes |
|---------|--------|-------|
| All guest capabilities | ✅ Yes | Inherited |
| Account dashboard | ✅ Yes | Personal dashboard |
| Order history | ✅ Yes | View past orders |
| Order tracking | ✅ Yes | Track shipments |
| Saved addresses | ✅ Yes | Manage shipping/billing addresses |
| Wishlist | ✅ Yes | Save favorite products |
| AI Generation | ✅ Yes | 3 free generations, then wallet |
| AI History | ✅ Yes | View past generations |
| Wallet | ✅ Yes | Top-up and manage balance |
| Profile settings | ✅ Yes | Update name, email, password |
| Notification preferences | ✅ Yes | Email/SMS settings |
| Trade program application | ✅ Yes | Apply for trade status |
| Admin panel | ❌ No | Access denied |

### Default Limits

| Resource | Default Value |
|----------|---------------|
| Free AI generations | 3 |
| Wallet balance | ₹0 |
| AI subscription tier | `free` |
| Max addresses | 10 |

### Routes

```
Customer routes (requireAuth):
- /account (dashboard)
- /account/orders (order history)
- /account/orders/:id (order detail)
- /account/addresses (address management)
- /account/wallet (wallet management)
- /account/settings (profile settings)
- /account/wishlist (saved items)
- /ai/history (AI generation history)
```

### Middleware

```typescript
requireAuth // Ensures user is logged in
```

---

## Trade

Trade program members who have been approved for wholesale access. Typically interior designers, architects, staging companies, etc.

### Capabilities

| Feature | Access | Notes |
|---------|--------|-------|
| All customer capabilities | ✅ Yes | Inherited |
| Wholesale pricing | ✅ Yes | Discounted prices |
| Bulk ordering | ✅ Yes | Higher quantity limits |
| Trade dashboard | ✅ Yes | Trade-specific features |
| Net payment terms | ✅ Yes | If approved |
| Priority support | ✅ Yes | Dedicated support channel |
| Admin panel | ❌ No | Access denied |

### Trade Account Types

```typescript
type TradeAccountType =
  | "interior-designer"
  | "architect"
  | "staging-company"
  | "hospitality"
  | "office-designer"
  | "art-consultant"
  | "other";
```

### Trade Status Flow

```
none → pending → approved/rejected
                     ↓
                 suspended
```

| Status | Description |
|--------|-------------|
| `none` | Not applied for trade program |
| `pending` | Application submitted, awaiting review |
| `approved` | Full trade access granted |
| `rejected` | Application denied |
| `suspended` | Trade access temporarily revoked |

### Routes

```
Trade routes (requireTrade):
- /trade/dashboard (trade dashboard)
- /trade/pricing (wholesale pricing)
- /trade/orders (bulk orders)
- /api/trade/* (trade API endpoints)
```

### Middleware

```typescript
requireTrade // Checks for trade role OR approved tradeStatus
```

**Note:** The `requireTrade` middleware also allows `admin` and `super-admin` roles.

---

## Admin

Platform administrators with access to the admin panel for managing products, orders, and customers.

### Capabilities

| Feature | Access | Notes |
|---------|--------|-------|
| All customer capabilities | ✅ Yes | Inherited |
| All trade capabilities | ✅ Yes | Inherited |
| Admin dashboard | ✅ Yes | Overview and analytics |
| Product management | ✅ Yes | Create, edit, delete products |
| Order management | ✅ Yes | View, update status, refunds |
| Customer management | ✅ Yes | View customer details |
| AI generation oversight | ✅ Yes | View all generations |
| Trade application review | ✅ Yes | Approve/reject applications |
| Content management | ✅ Yes | Banners, featured products |
| Reports & analytics | ✅ Yes | Sales, traffic reports |
| User role management | ❌ No | Reserved for super-admin |
| System settings | ❌ No | Reserved for super-admin |

### Admin Panel Sections

| Section | Description |
|---------|-------------|
| Dashboard | Overview, KPIs, recent activity |
| Products | Product CRUD, inventory, variants |
| Orders | Order list, status updates, fulfillment |
| Customers | Customer list, details, order history |
| AI Generations | All user generations, moderation |
| Trade Applications | Review and process applications |
| Reports | Sales, revenue, analytics |

### Routes

```
Admin routes (requireAdmin):
- /admin (dashboard)
- /admin/products (product management)
- /admin/products/new (create product)
- /admin/products/:id (edit product)
- /admin/orders (order management)
- /admin/orders/:id (order detail)
- /admin/customers (customer list)
- /admin/ai (AI oversight)
- /admin/trade (trade applications)
- /admin/reports (analytics)
```

### API Routes

```
Admin API (requireAdmin):
- GET/POST/PUT/DELETE /api/admin/products
- GET/PUT /api/admin/orders
- GET /api/admin/customers
- GET/PUT /api/admin/trade-applications
- GET /api/admin/reports/*
```

### Middleware

```typescript
requireAdmin // Accepts 'admin' OR 'super-admin' role
```

---

## Super-Admin

System-level administrators with the highest level of access. Intended for platform owners and senior technical staff.

### Current State

**Important:** As of 2026-01-27, super-admin has **no additional capabilities** beyond admin. The role exists in the schema but is not yet differentiated in the application.

### Capabilities (Current)

| Feature | Access | Notes |
|---------|--------|-------|
| All admin capabilities | ✅ Yes | Identical to admin |

### Planned Capabilities (Future)

| Feature | Planned | Notes |
|---------|---------|-------|
| User role management | 🔮 Future | Promote/demote users |
| Admin account management | 🔮 Future | Create/delete admin accounts |
| System configuration | 🔮 Future | Platform settings |
| Audit logs | 🔮 Future | View all system activity |
| Database operations | 🔮 Future | Backup, restore, migrations |
| Feature flags | 🔮 Future | Enable/disable features |
| API keys management | 🔮 Future | Third-party integrations |

### Default Values

When created via `init-super-admin.ts`:

| Field | Value |
|-------|-------|
| `aiCreditsRemaining` | 999 |
| `aiSubscriptionTier` | `unlimited` |
| `emailVerified` | `true` |
| `status` | `active` |

### Creating Super-Admin

```bash
# Using the initialization script
bun run packages/api/src/database/init-super-admin.ts

# Environment variables (optional)
SUPER_ADMIN_EMAIL=admin@chobii.art
SUPER_ADMIN_PASSWORD=SuperAdmin123!
```

### Middleware

```typescript
// Currently uses same middleware as admin
requireAdmin // Accepts 'admin' OR 'super-admin' role

// Future: dedicated middleware
requireSuperAdmin // Would accept only 'super-admin' role
```

---

## Role Comparison Matrix

### Feature Access by Role

| Feature | Guest | Customer | Trade | Admin | Super-Admin |
|---------|-------|----------|-------|-------|-------------|
| Browse products | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add to cart | ✅ | ✅ | ✅ | ✅ | ✅ |
| Checkout | ✅ | ✅ | ✅ | ✅ | ✅ |
| Account dashboard | ❌ | ✅ | ✅ | ✅ | ✅ |
| Order history | ❌ | ✅ | ✅ | ✅ | ✅ |
| AI generation | ❌ | ✅ | ✅ | ✅ | ✅ |
| Wallet | ❌ | ✅ | ✅ | ✅ | ✅ |
| Wholesale pricing | ❌ | ❌ | ✅ | ✅ | ✅ |
| Trade dashboard | ❌ | ❌ | ✅ | ✅ | ✅ |
| Admin panel | ❌ | ❌ | ❌ | ✅ | ✅ |
| Product management | ❌ | ❌ | ❌ | ✅ | ✅ |
| Order management | ❌ | ❌ | ❌ | ✅ | ✅ |
| User management | ❌ | ❌ | ❌ | ❌ | 🔮 |
| System settings | ❌ | ❌ | ❌ | ❌ | 🔮 |

**Legend:** ✅ = Available, ❌ = Not available, 🔮 = Planned

### API Access by Role

| Endpoint Pattern | Guest | Customer | Trade | Admin |
|-----------------|-------|----------|-------|-------|
| `GET /api/products` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/cart` | ✅ | ✅ | ✅ | ✅ |
| `POST /api/orders` | ✅ | ✅ | ✅ | ✅ |
| `GET /api/account/*` | ❌ | ✅ | ✅ | ✅ |
| `POST /api/ai/generate` | ❌ | ✅ | ✅ | ✅ |
| `GET /api/wallet` | ❌ | ✅ | ✅ | ✅ |
| `GET /api/trade/*` | ❌ | ❌ | ✅ | ✅ |
| `* /api/admin/*` | ❌ | ❌ | ❌ | ✅ |

---

## Middleware Reference

### Available Middleware

```typescript
// packages/api/src/middleware/auth.ts

// Basic authentication
requireAuth          // User must be logged in

// Role-based
requireRole(roles)   // User must have one of specified roles
requireAdmin         // Shorthand for requireRole(['admin', 'super-admin'])
requireTrade         // Trade, admin, or super-admin role

// Feature-specific
requireVerified      // Email must be verified
requireAICredits(n)  // Must have n AI credits available
```

### Usage Examples

```typescript
// Public route - no middleware
app.get('/api/products', handler);

// Authenticated route
app.get('/api/account', requireAuth, handler);

// Admin route
app.get('/api/admin/dashboard', requireAuth, requireAdmin, handler);

// Trade route
app.get('/api/trade/pricing', requireAuth, requireTrade, handler);

// Custom role check
app.get('/api/special', requireAuth, requireRole(['trade', 'admin']), handler);
```

### Helper Functions

```typescript
// Check if user has specific role
hasRole(user, 'admin')           // boolean

// Check if user has any of the roles
hasAnyRole(user, ['admin', 'super-admin'])  // boolean

// Check if user is admin (admin or super-admin)
isAdmin(user)                    // boolean

// Check if user can access resource (owner or admin)
canAccess(user, resourceOwnerId) // boolean
```

---

## Test Coverage

### Current E2E Test Coverage by Role

| Role | Auth Setup | Test Files | Status |
|------|------------|------------|--------|
| Guest | N/A | Multiple (unauthenticated sections) | ✅ Covered |
| Customer | `customer.json` | account, wallet, ai-generator, ai-history | ✅ Covered |
| Trade | `trade.json` | trade.spec.ts | ✅ Covered |
| Admin | `admin.json` | admin-auth, admin-dashboard, admin-orders, admin-products | ✅ Covered |
| Super-Admin | ❌ None | ❌ None | ⚠️ **Not needed yet** |

### Test Files by Role

**Guest/Unauthenticated:**
- `tests/e2e/home.spec.ts`
- `tests/e2e/product-listing.spec.ts`
- `tests/e2e/product-detail.spec.ts`
- `tests/e2e/cart.spec.ts`
- `tests/e2e/account.spec.ts` (Unauthenticated section)
- `tests/e2e/wallet.spec.ts` (Unauthenticated section)
- `tests/e2e/admin-auth.spec.ts` (Unauthenticated Access section)

**Customer:**
- `tests/e2e/account.spec.ts`
- `tests/e2e/wallet.spec.ts`
- `tests/e2e/ai-generator.spec.ts`
- `tests/e2e/ai-history.spec.ts`
- `tests/e2e/checkout.spec.ts` (authenticated checkout)
- `tests/e2e/admin-auth.spec.ts` (verifies customer cannot access admin)

**Trade:**
- `tests/e2e/trade.spec.ts` - Tests trade user access to:
  - Customer features (account, wallet, AI generator, shopping)
  - Admin restriction (verifies trade cannot access admin)
  - Placeholder tests for future trade-specific features (skipped)

**Admin:**
- `tests/e2e/admin-auth.spec.ts`
- `tests/e2e/admin-dashboard.spec.ts`
- `tests/e2e/admin-products.spec.ts`
- `tests/e2e/admin-orders.spec.ts`
- `tests/e2e/flows/admin.spec.ts`

### Recommended Future Tests

**Trade Role (when features are implemented):**
- ~~Trade application submission~~ (placeholder test exists)
- ~~Trade application approval flow~~ (placeholder test exists)
- ~~Wholesale pricing display~~ (placeholder test exists)
- ~~Trade dashboard access~~ (placeholder test exists)
- ~~Bulk ordering features~~ (placeholder test exists)

Note: `trade.spec.ts` contains skipped placeholder tests for all trade-specific
features. Remove `.skip` when implementing each feature.

**Super-Admin Role (when differentiated):**
- User role management
- Admin account creation
- System settings access

---

## Future Considerations

### Planned Role Enhancements

1. **Super-Admin Differentiation**
   - Create `requireSuperAdmin` middleware
   - Add user management routes
   - Add system configuration routes
   - Add audit logging

2. **Trade Role Features**
   - Automated approval workflow
   - Tiered discount levels
   - Credit limit management
   - Purchase order support

3. **Permission Granularity**
   - Resource-level permissions
   - Custom admin roles (e.g., "order-manager", "content-editor")
   - Permission groups

4. **Security Enhancements**
   - Two-factor authentication for admins
   - Session management
   - IP allowlisting for admin access
   - Audit trail for sensitive operations

### Database Schema Reference

```typescript
// packages/api/src/database/schema/users.ts

export const userRoleEnum = pgEnum("user_role", [
  "customer",
  "trade",
  "admin",
  "super-admin",
]);

export const tradeStatusEnum = pgEnum("trade_status", [
  "none",
  "pending",
  "approved",
  "rejected",
  "suspended",
]);
```

---

## Related Documentation

- [Test Maintenance Guide](./test-maintenance.md)
- [Test Coverage Report](./TEST-COVERAGE.md)
- [API Documentation](./manual-tests/auth-routes.md)
- [Admin API Documentation](./manual-tests/admin-api.md)
