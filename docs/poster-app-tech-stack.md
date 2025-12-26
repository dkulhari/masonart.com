# Poster & Frame E-Commerce Platform - Technical Stack Document

## 1. Overview

This document defines the complete technology stack for the Poster & Frame E-Commerce Platform, including the backend API, frontend application (with SSR for SEO), admin panel, AI generation pipeline, and supporting infrastructure.

### 1.1 Stack Philosophy

- **Type Safety**: End-to-end TypeScript with Zod validation
- **Modern Runtime**: Bun for performance and DX
- **SEO-First**: Server-side rendering for all public pages
- **Scalability**: Separation of concerns for independent scaling
- **Simplicity**: Minimal dependencies, maximum clarity

### 1.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      TanStack Start App                          │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │     Public Storefront    │  │       Admin Panel           │   │
│  │        (SSR/SEO)         │  │     (/admin/* routes)       │   │
│  │                          │  │                             │   │
│  │  - Home, Collections     │  │  - Dashboard                │   │
│  │  - Product Pages         │  │  - Products CRUD            │   │
│  │  - AI Generator          │  │  - Orders Management        │   │
│  │  - Cart, Checkout        │  │  - AI Moderation            │   │
│  │  - User Account          │  │  - Content Management       │   │
│  └──────────────────────────┘  └─────────────────────────────┘   │
│                          │                                       │
│                          │  Server Functions                     │
│                          │  (Auth, Cart, Simple mutations)       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Hono API Server                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Core APIs                                                │   │
│  │  /api/products, /api/orders, /api/users, /api/reviews     │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  AI Pipeline                                              │   │
│  │  /api/ai/generate, /api/ai/upscale, /api/ai/gallery       │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Integrations                                             │   │
│  │  /api/webhooks/razorpay, /api/webhooks/shiprocket         │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Admin APIs                                               │   │
│  │  /api/admin/*, (protected with role-based access)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │PostgreSQL│     │  Redis   │     │  S3/R2   │
   │          │     │          │     │          │
   │ Products │     │  Cache   │     │  Images  │
   │ Orders   │     │  Queue   │     │  AI Gen  │
   │ Users    │     │ Sessions │     │  Uploads │
   └──────────┘     └──────────┘     └──────────┘
```

---

## 2. Backend Stack

### 2.1 Runtime & Package Manager

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | **Bun** | ^1.1.x | JavaScript/TypeScript runtime, package manager, bundler |

**Why Bun?**
- 🚀 Fast startup and execution
- 📦 Built-in package manager (no npm/yarn)
- 🔧 Native TypeScript support
- 🧪 Built-in test runner
- ⚡ Excellent for long-running API servers

### 2.2 Web Framework

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | **Hono** | ^4.x | Fast, lightweight web framework |

**Why Hono?**
- ⚡ Extremely fast (EdgeRouter-based)
- 🪶 Lightweight (~14KB)
- 📝 First-class TypeScript support
- 🔄 Similar middleware pattern to Express
- 🌐 Works with Bun, Deno, Node.js, Edge
- 🔗 Type-safe RPC client for frontend

**Hono Features to Use:**
```typescript
// Core features
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { logger } from 'hono/logger';
import { zValidator } from '@hono/zod-validator';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { rateLimiter } from 'hono-rate-limiter';
```

### 2.3 Database Layer

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Database | **PostgreSQL** | 16.x | Primary database |
| ORM | **Drizzle ORM** | ^0.44.x | Type-safe ORM |
| Migrations | **Drizzle Kit** | ^0.31.x | Migration management |
| Driver | **postgres** | ^3.x | Native Postgres driver for Bun |

**Why PostgreSQL?**
- 🏢 Industry standard for production apps
- 📊 Excellent support for JSON, full-text search
- 🔒 ACID compliance
- 📈 Horizontal scaling with read replicas
- 🔍 Full-text search for product catalog

**Why Drizzle?**
- 📝 Type inference from schema
- 🚀 Minimal runtime overhead
- 🔧 Excellent migration tooling
- 🎯 SQL-like syntax, no magic

**Database Schema Example:**
```typescript
// packages/api/src/database/schema/products.ts
import { pgTable, text, integer, timestamp, uuid, decimal, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const orientationEnum = pgEnum('orientation', ['square', 'portrait', 'landscape', 'panoramic', 'round']);
export const productStatusEnum = pgEnum('product_status', ['draft', 'active', 'archived']);

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: text('sku').unique().notNull(),
  title: text('title').notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
  
  // Taxonomy
  styles: text('styles').array(),
  subjects: text('subjects').array(),
  colors: text('colors').array(),
  orientation: orientationEnum('orientation').notNull(),
  
  // Relations
  artistId: uuid('artist_id').references(() => artists.id),
  
  // Images (stored as JSON array)
  images: jsonb('images').$type<ProductImage[]>().default([]),
  
  // SEO
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  
  // Status
  status: productStatusEnum('status').default('draft'),
  featuredOrder: integer('featured_order'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  
  // Size info
  sizeLabel: text('size_label').notNull(), // "24x24 inches"
  widthInches: integer('width_inches').notNull(),
  heightInches: integer('height_inches').notNull(),
  
  // Pricing
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  
  // Inventory
  stockQuantity: integer('stock_quantity').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
});

export const frames = pgTable('frames', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'black', 'white', 'wood', 'gold', 'silver'
  material: text('material'),
  priceModifier: decimal('price_modifier', { precision: 5, scale: 2 }).notNull(), // e.g., 1.40 for 40% increase
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true),
});
```

### 2.4 Caching & Queue

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Cache/Queue | **Redis** | 7.x | Caching, sessions, job queues |
| Queue Library | **BullMQ** | ^5.x | Background job processing |

**Why Redis + BullMQ?**
- 🚀 Fast in-memory caching
- 📬 Reliable job queues for AI generation
- 🔄 Session storage for auth
- 📊 Rate limiting storage

**Queue Usage:**
```typescript
// packages/api/src/queues/ai-generation.ts
import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis';

export const aiGenerationQueue = new Queue('ai-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// Worker processes AI generation jobs
const worker = new Worker('ai-generation', async (job) => {
  const { prompt, stylePreset, aspectRatio, userId } = job.data;
  
  // 1. Call AI API (Stable Diffusion / DALL-E)
  const images = await generateImages(prompt, stylePreset, aspectRatio);
  
  // 2. Upload to S3/R2
  const uploadedUrls = await uploadToStorage(images);
  
  // 3. Save to database
  await saveGeneration(userId, uploadedUrls, job.data);
  
  // 4. Notify user (websocket/push)
  await notifyUser(userId, uploadedUrls);
  
  return { success: true, images: uploadedUrls };
}, { connection: redis });
```

### 2.5 Validation

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Validation | **Zod** | ^3.x | Schema validation |
| Drizzle Zod | **drizzle-zod** | ^0.8.x | Auto-generate Zod from Drizzle |

**Validation Architecture:**
```typescript
// Generate Zod schemas from database tables
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { products } from './schema';

export const insertProductSchema = createInsertSchema(products, {
  title: z.string().min(3).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  basePrice: z.string().regex(/^\d+(\.\d{2})?$/),
});

export const selectProductSchema = createSelectSchema(products);

// Validate in routes
app.post('/products', zValidator('json', insertProductSchema), async (c) => {
  const data = c.req.valid('json');
  // data is fully typed
});
```

### 2.6 Authentication

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Auth Library | **Better Auth** | ^1.x | Complete auth solution |
| RBAC Plugin | **better-auth/plugins** | ^1.x | Role-based access control |

**Why Better Auth?**
- 🔐 Built-in RBAC for admin/customer roles
- 📝 TypeScript-first with full type inference
- 🍪 Supports both cookies (web) and bearer tokens
- 💾 Stores all data in your PostgreSQL database
- 📚 Library, not a separate service to deploy
- 🔗 Social login (Google, Facebook) built-in

**Auth Configuration:**
```typescript
// packages/api/src/auth/index.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { rbac } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    rbac({
      roles: {
        admin: { permissions: ["*"] },
        customer: { 
          permissions: [
            "order:read:own", 
            "order:create", 
            "review:create",
            "ai:generate",
          ] 
        },
        trade: { 
          permissions: [
            "order:read:own", 
            "order:create", 
            "review:create",
            "ai:generate",
            "trade:access",
          ] 
        },
      },
    }),
  ],
});
```

**Hono Integration:**
```typescript
// Mount auth routes
app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

// Auth middleware
export const requireAuth = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

// Role-based middleware
export const requireRole = (role: string) => createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user?.role || user.role !== role) {
    return c.json({ error: "Forbidden" }, 403);
  }
  await next();
});
```

### 2.7 File Storage

| Component | Technology | Purpose |
|-----------|------------|---------|
| Storage | **Cloudflare R2** / **AWS S3** | Product images, AI generations |
| CDN | **Cloudflare** | Image delivery, caching |
| Image Processing | **Sharp** | Resize, optimize images |

**Storage Pattern:**
```typescript
// packages/api/src/lib/storage.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

export async function uploadImage(
  buffer: Buffer, 
  key: string,
  contentType: string
): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  
  return `${process.env.CDN_URL}/${key}`;
}
```

### 2.8 API Documentation

| Component | Technology | Purpose |
|-----------|------------|---------|
| OpenAPI | **@hono/zod-openapi** | Auto-generate OpenAPI spec |
| Swagger UI | **@hono/swagger-ui** | Interactive API docs |

---

## 3. Frontend Stack (TanStack Start)

### 3.1 Framework

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Framework | **TanStack Start** | ^1.x | Full-stack React framework with SSR |
| Build Tool | **Vinxi** | ^0.x | Build system (used by TanStack Start) |
| Runtime | **Bun** | ^1.1.x | Dev server, package management |

**Why TanStack Start?**
- 🔍 **SSR for SEO** - Critical for e-commerce product pages
- 📝 **Type-safe routing** - Built on TanStack Router
- ⚡ **Server Functions** - Like Next.js Server Actions
- 🔄 **Streaming SSR** - Fast Time to First Byte
- 🎯 **TanStack ecosystem** - Query, Form, Table all integrate seamlessly

**TanStack Start Configuration:**
```typescript
// app.config.ts
import { defineConfig } from '@tanstack/start/config';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: {
    plugins: [viteTsConfigPaths()],
  },
  server: {
    preset: 'bun', // Deploy target
  },
});
```

### 3.2 Routing

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Router | **TanStack Router** | ^1.x | Type-safe file-based routing |

**Why TanStack Router?**
- 📝 100% type-safe routes and params
- 🔍 Built-in search params handling (for filters!)
- 📁 File-based route generation
- 🔄 First-class loader support for SSR data
- 🛡️ Auth guards built-in

**Route Structure:**
```
app/
├── routes/
│   ├── __root.tsx              # Root layout
│   ├── index.tsx               # Home page (/)
│   ├── posters/
│   │   ├── index.tsx           # /posters (catalog)
│   │   ├── $category.tsx       # /posters/abstract
│   │   └── $category.$slug.tsx # /posters/abstract/ocean-waves-tx234
│   ├── create/
│   │   └── index.tsx           # /create (AI generator)
│   ├── gallery/
│   │   └── index.tsx           # /gallery (AI community)
│   ├── cart/
│   │   └── index.tsx           # /cart
│   ├── checkout/
│   │   └── index.tsx           # /checkout
│   ├── account/
│   │   ├── index.tsx           # /account
│   │   ├── orders.tsx          # /account/orders
│   │   └── ai-creations.tsx    # /account/ai-creations
│   ├── admin/
│   │   ├── __layout.tsx        # Admin layout (protected)
│   │   ├── index.tsx           # /admin (dashboard)
│   │   ├── products/
│   │   │   ├── index.tsx       # /admin/products
│   │   │   ├── new.tsx         # /admin/products/new
│   │   │   └── $id.tsx         # /admin/products/:id
│   │   ├── orders/
│   │   │   ├── index.tsx       # /admin/orders
│   │   │   └── $id.tsx         # /admin/orders/:id
│   │   └── ai/
│   │       ├── index.tsx       # /admin/ai (usage stats)
│   │       └── moderation.tsx  # /admin/ai/moderation
│   └── _public/
│       ├── about.tsx           # /about
│       ├── faq.tsx             # /faq
│       └── contact.tsx         # /contact
```

**Route Example with SSR Loader:**
```typescript
// app/routes/posters/$category.$slug.tsx
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/start';
import { api } from '~/lib/api';

// Server function for SSR data loading
const getProduct = createServerFn('GET', async (slug: string) => {
  const product = await api.products.getBySlug(slug);
  if (!product) throw new Error('Product not found');
  return product;
});

export const Route = createFileRoute('/posters/$category/$slug')({
  loader: async ({ params }) => {
    return getProduct(params.slug);
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.seoTitle || loaderData.title },
      { name: 'description', content: loaderData.seoDescription },
      { property: 'og:title', content: loaderData.title },
      { property: 'og:image', content: loaderData.images[0]?.url },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const product = Route.useLoaderData();
  // Render product page with SSR data
}
```

### 3.3 Data Fetching

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Query | **TanStack Query** | ^5.x | Server state management |
| API Client | **Hono Client** | ^4.x | Type-safe API calls |

**Why TanStack Query?**
- 🔄 Automatic caching and refetching
- 📝 TypeScript inference
- ⚡ Optimistic updates (great for cart)
- 🛡️ Error boundaries
- 🔗 SSR hydration support

**API Client Setup:**
```typescript
// packages/web/src/lib/api.ts
import { hc } from 'hono/client';
import type { AppType } from '@poster-app/api';

const client = hc<AppType>(import.meta.env.VITE_API_URL);

export const api = {
  products: {
    list: (params?: ProductFilters) => 
      client.api.products.$get({ query: params }),
    getBySlug: (slug: string) => 
      client.api.products[':slug'].$get({ param: { slug } }),
  },
  cart: {
    get: () => client.api.cart.$get(),
    addItem: (data: CartItemInput) => 
      client.api.cart.items.$post({ json: data }),
    updateItem: (id: string, data: CartItemUpdate) => 
      client.api.cart.items[':id'].$patch({ param: { id }, json: data }),
    removeItem: (id: string) => 
      client.api.cart.items[':id'].$delete({ param: { id } }),
  },
  orders: {
    create: (data: OrderInput) => 
      client.api.orders.$post({ json: data }),
    get: (id: string) => 
      client.api.orders[':id'].$get({ param: { id } }),
  },
  ai: {
    generate: (data: AIGenerationInput) => 
      client.api.ai.generate.$post({ json: data }),
    getGenerations: () => 
      client.api.ai.generations.$get(),
  },
};
```

**Query Hooks:**
```typescript
// packages/web/src/hooks/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~/lib/api';

export function useProducts(filters?: ProductFilters) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => api.products.list(filters),
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: () => api.products.getBySlug(slug),
  });
}

// Cart with optimistic updates
export function useAddToCart() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.cart.addItem,
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: ['cart'] });
      const previous = queryClient.getQueryData(['cart']);
      
      // Optimistic update
      queryClient.setQueryData(['cart'], (old: Cart) => ({
        ...old,
        items: [...old.items, { ...newItem, id: 'temp' }],
      }));
      
      return { previous };
    },
    onError: (err, newItem, context) => {
      queryClient.setQueryData(['cart'], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}
```

### 3.4 Forms

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Forms | **TanStack Form** | ^0.x | Form state management |
| Validation | **Zod** | ^3.x | Schema validation |

**Form Pattern:**
```typescript
// Checkout form example
import { useForm } from '@tanstack/react-form';
import { zodValidator } from '@tanstack/zod-form-adapter';
import { checkoutSchema } from '@poster-app/shared/schemas';

function CheckoutForm() {
  const form = useForm({
    defaultValues: {
      email: '',
      shippingAddress: {
        fullName: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        pincode: '',
      },
      paymentMethod: 'razorpay',
    },
    validatorAdapter: zodValidator(),
    validators: {
      onChange: checkoutSchema,
    },
    onSubmit: async ({ value }) => {
      await createOrder(value);
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      {/* Form fields */}
    </form>
  );
}
```

### 3.5 Styling

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| CSS Framework | **Tailwind CSS** | ^3.x | Utility-first CSS |
| Components | **shadcn/ui** | latest | Pre-built accessible components |
| Icons | **lucide-react** | ^0.x | Icon library |
| Animations | **Framer Motion** | ^11.x | Animations and transitions |

**Why shadcn/ui?**
- 📝 Copy-paste components (no dependency lock-in)
- ♿ Accessible by default (Radix primitives)
- 🎨 Fully customizable with Tailwind
- 🔧 Great for admin panels with tables, forms, dialogs

### 3.6 State Management

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Server State | **TanStack Query** | ^5.x | All API data |
| Client State | **Zustand** | ^5.x | UI state, cart (local) |

**State Pattern:**
```typescript
// packages/web/src/stores/cart.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  total: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => set((state) => {
        const existing = state.items.find(i => 
          i.productId === item.productId && 
          i.variantId === item.variantId &&
          i.frameId === item.frameId
        );
        if (existing) {
          return {
            items: state.items.map(i => 
              i.id === existing.id 
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
          };
        }
        return { items: [...state.items, item] };
      }),
      updateQuantity: (id, quantity) => set((state) => ({
        items: state.items.map(i => i.id === id ? { ...i, quantity } : i),
      })),
      removeItem: (id) => set((state) => ({
        items: state.items.filter(i => i.id !== id),
      })),
      clearCart: () => set({ items: [] }),
      total: () => get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    }),
    { name: 'cart-storage' }
  )
);
```

### 3.7 Tables (Admin)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Tables | **TanStack Table** | ^8.x | Data tables for admin |

**Admin Table Pattern:**
```typescript
// Admin products table
import { useReactTable, getCoreRowModel, getPaginationRowModel } from '@tanstack/react-table';

const columns = [
  { accessorKey: 'sku', header: 'SKU' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'basePrice', header: 'Price', cell: (info) => `₹${info.getValue()}` },
  { accessorKey: 'status', header: 'Status' },
  { 
    id: 'actions', 
    cell: ({ row }) => <ProductActions product={row.original} /> 
  },
];

function ProductsTable({ products }) {
  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  // Render table
}
```

---

## 4. AI Generation Pipeline

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Generation Flow                        │
│                                                                  │
│  User Input                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Prompt: "Serene mountain landscape at sunset"           │    │
│  │ Style: Wabi-Sabi                                        │    │
│  │ Aspect: Square (1:1)                                    │    │
│  │ Colors: Earth tones                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Hono API: /api/ai/generate                  │    │
│  │  - Validate input                                        │    │
│  │  - Check user credits/limits                             │    │
│  │  - Content moderation (banned prompts)                   │    │
│  │  - Add to BullMQ queue                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    BullMQ Worker                         │    │
│  │  - Construct enhanced prompt with style modifiers        │    │
│  │  - Call AI API (Replicate / OpenAI / Self-hosted)        │    │
│  │  - Generate 4 variations                                 │    │
│  │  - Upload to R2/S3                                       │    │
│  │  - Save generation record                                │    │
│  │  - Notify via WebSocket                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   User Selection                         │    │
│  │  - View 4 variations                                     │    │
│  │  - Select favorite                                       │    │
│  │  - Regenerate / Refine                                   │    │
│  │  - Add to cart                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 AI Service Options

| Provider | Pros | Cons | Cost |
|----------|------|------|------|
| **Replicate (SDXL)** | Easy API, pay-per-use, many models | Slower, depends on availability | ~$0.01-0.05/image |
| **OpenAI DALL-E 3** | High quality, consistent | Expensive, less control | ~$0.04-0.12/image |
| **Self-hosted (ComfyUI)** | Full control, no per-image cost | Requires GPU infrastructure | Fixed infra cost |
| **FAL.ai** | Fast, affordable | Newer service | ~$0.01-0.03/image |

**Recommended: Replicate (SDXL) for MVP, migrate to self-hosted for scale**

### 4.3 Style Preset System

```typescript
// packages/api/src/ai/style-presets.ts
export const stylePresets = {
  'wabi-sabi': {
    promptModifiers: 'minimalist, imperfect, natural textures, muted earth tones, japanese aesthetic, subtle, serene',
    negativePrompt: 'saturated colors, perfect symmetry, glossy, artificial',
    cfg_scale: 7,
    sampler: 'DPM++ 2M Karras',
  },
  'abstract-expression': {
    promptModifiers: 'abstract expressionism, bold brushstrokes, emotional, dynamic, gestural, action painting',
    negativePrompt: 'realistic, photographic, precise lines',
    cfg_scale: 8,
    sampler: 'Euler a',
  },
  'botanical': {
    promptModifiers: 'botanical illustration, soft watercolor, delicate details, nature, organic forms',
    negativePrompt: 'digital art, 3d render, harsh lighting',
    cfg_scale: 7.5,
    sampler: 'DPM++ SDE Karras',
  },
  'vintage-poster': {
    promptModifiers: 'vintage poster art, retro, nostalgic, film grain, warm tones, classic design',
    negativePrompt: 'modern, minimalist, digital',
    cfg_scale: 7,
    sampler: 'DPM++ 2M',
  },
  // ... more presets
};

export function constructPrompt(userPrompt: string, preset: keyof typeof stylePresets): string {
  const { promptModifiers } = stylePresets[preset];
  return `${userPrompt}, ${promptModifiers}`;
}
```

---

## 5. Integrations

### 5.1 Payment Gateway

| Provider | Purpose |
|----------|---------|
| **Razorpay** (Primary) | UPI, Cards, NetBanking, Wallets |
| **Stripe** (International) | International cards |

**Razorpay Integration:**
```typescript
// packages/api/src/routes/payments.ts
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

app.post('/api/orders/:id/payment', requireAuth, async (c) => {
  const { id } = c.req.param();
  const order = await getOrder(id);
  
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(order.total * 100), // paise
    currency: 'INR',
    receipt: order.id,
  });
  
  return c.json({ orderId: razorpayOrder.id, amount: razorpayOrder.amount });
});

// Webhook handler
app.post('/api/webhooks/razorpay', async (c) => {
  const signature = c.req.header('x-razorpay-signature');
  const body = await c.req.text();
  
  const isValid = Razorpay.validateWebhookSignature(
    body,
    signature!,
    process.env.RAZORPAY_WEBHOOK_SECRET!
  );
  
  if (!isValid) return c.json({ error: 'Invalid signature' }, 400);
  
  const event = JSON.parse(body);
  // Handle payment.captured, payment.failed, etc.
});
```

### 5.2 Shipping

| Provider | Purpose |
|----------|---------|
| **Shiprocket** | Multi-carrier aggregator |
| **Delhivery** | Direct integration backup |

### 5.3 Email & SMS

| Service | Purpose |
|---------|---------|
| **Resend** | Transactional emails |
| **MSG91** | SMS notifications |

### 5.4 Analytics

| Service | Purpose |
|---------|---------|
| **Google Analytics 4** | Traffic, conversions |
| **Mixpanel** / **PostHog** | Product analytics |
| **Google Search Console** | SEO monitoring |

---

## 6. Project Structure (Monorepo)

```
poster-app/
├── package.json                 # Root package.json (workspaces)
├── bun.lockb
├── turbo.json                   # Turborepo config
├── .env.example
│
├── packages/
│   ├── api/                     # Hono API server
│   │   ├── src/
│   │   │   ├── index.ts         # Entry point
│   │   │   ├── routes/
│   │   │   │   ├── products.ts
│   │   │   │   ├── orders.ts
│   │   │   │   ├── cart.ts
│   │   │   │   ├── ai.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── admin/
│   │   │   │   │   ├── products.ts
│   │   │   │   │   ├── orders.ts
│   │   │   │   │   └── users.ts
│   │   │   │   └── webhooks/
│   │   │   │       ├── razorpay.ts
│   │   │   │       └── shiprocket.ts
│   │   │   ├── database/
│   │   │   │   ├── index.ts     # Drizzle client
│   │   │   │   ├── schema/      # Table definitions
│   │   │   │   └── migrations/
│   │   │   ├── auth/
│   │   │   │   └── index.ts     # Better Auth config
│   │   │   ├── ai/
│   │   │   │   ├── generator.ts
│   │   │   │   ├── style-presets.ts
│   │   │   │   └── moderation.ts
│   │   │   ├── queues/
│   │   │   │   └── ai-generation.ts
│   │   │   ├── lib/
│   │   │   │   ├── storage.ts   # S3/R2 client
│   │   │   │   ├── redis.ts
│   │   │   │   └── email.ts
│   │   │   └── middleware/
│   │   │       ├── auth.ts
│   │   │       └── rate-limit.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── web/                     # TanStack Start app
│   │   ├── app/
│   │   │   ├── routes/          # File-based routes
│   │   │   │   ├── __root.tsx
│   │   │   │   ├── index.tsx
│   │   │   │   ├── posters/
│   │   │   │   ├── create/
│   │   │   │   ├── cart/
│   │   │   │   ├── checkout/
│   │   │   │   ├── account/
│   │   │   │   └── admin/
│   │   │   ├── components/
│   │   │   │   ├── ui/          # shadcn components
│   │   │   │   ├── layout/
│   │   │   │   ├── product/
│   │   │   │   ├── cart/
│   │   │   │   ├── ai-generator/
│   │   │   │   └── admin/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   │   ├── api.ts       # Hono client
│   │   │   │   └── utils.ts
│   │   │   └── stores/
│   │   │       ├── cart.ts
│   │   │       └── ui.ts
│   │   ├── public/
│   │   ├── app.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── shared/                  # Shared types & schemas
│       ├── src/
│       │   ├── types/
│       │   │   ├── product.ts
│       │   │   ├── order.ts
│       │   │   ├── user.ts
│       │   │   └── ai.ts
│       │   ├── schemas/
│       │   │   ├── product.ts
│       │   │   ├── checkout.ts
│       │   │   └── ai-generation.ts
│       │   └── constants/
│       │       ├── sizes.ts
│       │       ├── frames.ts
│       │       └── styles.ts
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml       # Local dev services
│   ├── docker-compose.prod.yml
│   └── Dockerfile.api
│
└── docs/
    ├── API.md
    ├── DEPLOYMENT.md
    └── AI_PIPELINE.md
```

---

## 7. Infrastructure

### 7.1 Development Environment

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: poster_app
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: poster_app_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 7.2 Production Deployment

| Component | Service | Purpose |
|-----------|---------|---------|
| API | **Railway** / **Fly.io** | Container hosting |
| Web (SSR) | **Railway** / **Fly.io** | TanStack Start needs server |
| Database | **Neon** / **Supabase** | Managed PostgreSQL |
| Redis | **Upstash** | Managed Redis |
| Storage | **Cloudflare R2** | S3-compatible storage |
| CDN | **Cloudflare** | Static assets, images |
| Domain/DNS | **Cloudflare** | DNS, SSL, protection |

### 7.3 Environment Variables

```bash
# API Server
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://user:pass@host:6379
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY=xxx
R2_SECRET_KEY=xxx
R2_BUCKET=poster-app-prod
CDN_URL=https://cdn.yourstore.com

# Auth
BETTER_AUTH_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Payments
RAZORPAY_KEY_ID=xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# AI
REPLICATE_API_TOKEN=xxx

# Email
RESEND_API_KEY=xxx

# Web App
VITE_API_URL=https://api.yourstore.com
VITE_CDN_URL=https://cdn.yourstore.com
```

---

## 8. Security Measures

### 8.1 Backend Security

| Measure | Implementation |
|---------|---------------|
| CORS | Hono cors middleware, whitelist origins |
| Headers | hono/secure-headers (HSTS, CSP, etc.) |
| Rate Limiting | hono-rate-limiter + Redis |
| SQL Injection | Drizzle parameterized queries |
| Input Validation | Zod on all routes |
| File Upload | Type validation, size limits |
| AI Prompts | Content moderation, banned words |

### 8.2 Frontend Security

| Measure | Implementation |
|---------|---------------|
| XSS | React auto-escaping |
| CSRF | SameSite cookies |
| Secrets | Environment variables only |
| CSP | Strict Content-Security-Policy |

### 8.3 Payment Security

- PCI DSS compliance via Razorpay (no card data on our servers)
- Webhook signature verification
- Order amount verification before capture

---

## 9. SEO Implementation

### 9.1 SSR Strategy

| Page Type | Strategy | Cache |
|-----------|----------|-------|
| Home | SSR | 1 hour |
| Collection pages | SSR | 5 minutes |
| Product pages | SSR | 5 minutes |
| Static pages | SSG | Build time |
| Account pages | CSR | No cache |
| Admin pages | CSR | No cache |

### 9.2 Meta Tags (TanStack Start)

```typescript
// app/routes/posters/$category.$slug.tsx
export const Route = createFileRoute('/posters/$category/$slug')({
  head: ({ loaderData: product }) => ({
    meta: [
      { title: `${product.title} | Your Store` },
      { name: 'description', content: product.seoDescription },
      { property: 'og:title', content: product.title },
      { property: 'og:description', content: product.seoDescription },
      { property: 'og:image', content: product.images[0]?.url },
      { property: 'og:type', content: 'product' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'canonical', href: `https://yourstore.com/posters/${product.category}/${product.slug}` },
    ],
  }),
});
```

### 9.3 Structured Data

```typescript
// Product JSON-LD component
function ProductJsonLd({ product, variants }: Props) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: product.images.map(i => i.url),
    description: product.description,
    sku: product.sku,
    brand: { '@type': 'Brand', name: 'Your Store' },
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: Math.min(...variants.map(v => v.price)),
      highPrice: Math.max(...variants.map(v => v.price)),
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
```

### 9.4 Sitemap Generation

```typescript
// packages/api/src/routes/sitemap.ts
app.get('/sitemap.xml', async (c) => {
  const products = await db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products);
  const collections = await db.select({ slug: collections.slug }).from(collections);
  
  const xml = generateSitemapXml([
    { url: '/', changefreq: 'daily', priority: 1.0 },
    { url: '/posters', changefreq: 'daily', priority: 0.9 },
    ...products.map(p => ({
      url: `/posters/${p.category}/${p.slug}`,
      lastmod: p.updatedAt,
      changefreq: 'weekly',
      priority: 0.8,
    })),
    ...collections.map(c => ({
      url: `/posters/${c.slug}`,
      changefreq: 'daily',
      priority: 0.8,
    })),
  ]);
  
  return c.text(xml, 200, { 'Content-Type': 'application/xml' });
});
```

---

## 10. Version Summary

| Category | Technology | Version |
|----------|------------|---------|
| **Runtime** | Bun | ^1.1.x |
| **Backend Framework** | Hono | ^4.x |
| **Database** | PostgreSQL | 16.x |
| **ORM** | Drizzle ORM | ^0.44.x |
| **Cache/Queue** | Redis + BullMQ | 7.x / ^5.x |
| **Authentication** | Better Auth | ^1.x |
| **Validation** | Zod | ^3.x |
| **Frontend Framework** | TanStack Start | ^1.x |
| **Routing** | TanStack Router | ^1.x |
| **Data Fetching** | TanStack Query | ^5.x |
| **Forms** | TanStack Form | ^0.x |
| **Tables** | TanStack Table | ^8.x |
| **Styling** | Tailwind CSS | ^3.x |
| **Components** | shadcn/ui | latest |
| **Icons** | lucide-react | ^0.x |
| **State** | Zustand | ^5.x |
| **Animations** | Framer Motion | ^11.x |

---

## 11. Development Commands

```bash
# Root level (Turborepo)
bun install                    # Install all dependencies
bun run dev                    # Start all services (api + web)
bun run build                  # Build all packages
bun run lint                   # Lint all packages
bun run typecheck              # TypeScript check all packages

# API (packages/api)
bun run dev                    # Start API server (port 3000)
bun run db:generate            # Generate migrations
bun run db:migrate             # Run migrations
bun run db:studio              # Open Drizzle Studio
bun run db:seed                # Seed database
bun run test                   # Run tests

# Web (packages/web)
bun run dev                    # Start TanStack Start (port 3001)
bun run build                  # Production build
bun run start                  # Start production server
bun run lint                   # Run ESLint

# Docker
docker compose up -d           # Start Postgres, Redis, Minio
docker compose down            # Stop services
```

---

## 12. Quick Start Checklist

### Phase 1: Setup
- [ ] Initialize monorepo with Turborepo + Bun
- [ ] Set up PostgreSQL, Redis locally (Docker)
- [ ] Create `packages/api` with Hono
- [ ] Create `packages/web` with TanStack Start
- [ ] Create `packages/shared` for types/schemas
- [ ] Configure Drizzle with PostgreSQL

### Phase 2: Core Backend
- [ ] Define database schema (products, orders, users, etc.)
- [ ] Set up Better Auth with RBAC
- [ ] Create product CRUD APIs
- [ ] Create cart and order APIs
- [ ] Set up Razorpay integration
- [ ] Set up R2/S3 for file uploads

### Phase 3: Core Frontend
- [ ] Set up TanStack Router with file-based routes
- [ ] Create Hono API client
- [ ] Build product listing with filters
- [ ] Build product detail page
- [ ] Build cart and checkout flow
- [ ] Set up shadcn/ui components

### Phase 4: AI Generator
- [ ] Set up BullMQ for job processing
- [ ] Integrate Replicate / SDXL API
- [ ] Create AI generation interface
- [ ] Build generation history/gallery
- [ ] Implement usage limits

### Phase 5: Admin Panel
- [ ] Create admin layout and routes
- [ ] Build products management
- [ ] Build orders management
- [ ] Build AI moderation tools
- [ ] Build analytics dashboard

### Phase 6: SEO & Polish
- [ ] Implement SSR for all public pages
- [ ] Add structured data (JSON-LD)
- [ ] Generate sitemap
- [ ] Optimize Core Web Vitals
- [ ] Add meta tags management

### Phase 7: Launch
- [ ] Deploy API to Railway/Fly.io
- [ ] Deploy Web to Railway/Fly.io
- [ ] Set up Neon/Supabase for production DB
- [ ] Configure Cloudflare CDN
- [ ] Set up monitoring (Sentry)
- [ ] Load testing
- [ ] Launch! 🚀
