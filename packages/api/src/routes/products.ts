/**
 * Products API Routes
 *
 * RESTful API endpoints for product management:
 * - GET /api/products - List products with filtering, sorting, and pagination
 * - GET /api/products/:id - Get a single product by ID
 * - POST /api/products - Create a new product (admin only)
 * - PUT /api/products/:id - Update a product (admin only)
 * - DELETE /api/products/:id - Delete a product (admin only)
 * - GET /api/products/:id/variants - Get product variants
 */

import { Hono } from 'hono';
import { createDatabase } from '../db/index';
import { products, productVariants, frames } from '../db/schema';
import { eq, and, or, ilike, sql, desc, asc, SQL } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth';

const app = new Hono();
const { db } = createDatabase();

/**
 * GET /api/products
 * List products with filtering, sorting, and pagination
 *
 * Query Parameters:
 * - status: Filter by status (draft, active, archived)
 * - orientation: Filter by orientation (square, portrait, landscape, panoramic, round)
 * - style: Filter by style (comma-separated)
 * - subject: Filter by subject (comma-separated)
 * - color: Filter by color (comma-separated)
 * - search: Search in title and description
 * - minPrice: Minimum price filter
 * - maxPrice: Maximum price filter
 * - sort: Sort field (price, createdAt, title, featuredOrder)
 * - order: Sort order (asc, desc)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
app.get('/', async (c) => {
  try {
    const query = c.req.query();

    // Parse query parameters
    const status = query.status as 'draft' | 'active' | 'archived' | undefined;
    const orientation = query.orientation as 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round' | undefined;
    const styles = query.style ? query.style.split(',') : undefined;
    const subjects = query.subject ? query.subject.split(',') : undefined;
    const colors = query.color ? query.color.split(',') : undefined;
    const search = query.search;
    const minPrice = query.minPrice ? parseFloat(query.minPrice) : undefined;
    const maxPrice = query.maxPrice ? parseFloat(query.maxPrice) : undefined;
    const sortField = query.sort || 'createdAt';
    const sortOrder = query.order || 'desc';
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [];

    if (status) {
      conditions.push(eq(products.status, status));
    }

    if (orientation) {
      conditions.push(eq(products.orientation, orientation));
    }

    if (search) {
      conditions.push(
        or(
          ilike(products.title, `%${search}%`),
          ilike(products.description, `%${search}%`),
          ilike(products.sku, `%${search}%`)
        )!
      );
    }

    if (minPrice !== undefined) {
      conditions.push(sql`${products.basePrice}::decimal >= ${minPrice}`);
    }

    if (maxPrice !== undefined) {
      conditions.push(sql`${products.basePrice}::decimal <= ${maxPrice}`);
    }

    // Array filters (styles, subjects, colors)
    if (styles && styles.length > 0) {
      conditions.push(sql`${products.styles}::jsonb ?| array[${sql.join(styles.map(s => sql`${s}`), sql`, `)}]`);
    }

    if (subjects && subjects.length > 0) {
      conditions.push(sql`${products.subjects}::jsonb ?| array[${sql.join(subjects.map(s => sql`${s}`), sql`, `)}]`);
    }

    if (colors && colors.length > 0) {
      conditions.push(sql`${products.colors}::jsonb ?| array[${sql.join(colors.map(c => sql`${c}`), sql`, `)}]`);
    }

    // Build order by clause
    let orderBy: SQL;
    switch (sortField) {
      case 'price':
        orderBy = sortOrder === 'asc' ? asc(products.basePrice) : desc(products.basePrice);
        break;
      case 'title':
        orderBy = sortOrder === 'asc' ? asc(products.title) : desc(products.title);
        break;
      case 'featuredOrder':
        orderBy = sortOrder === 'asc' ? asc(products.featuredOrder) : desc(products.featuredOrder);
        break;
      case 'createdAt':
      default:
        orderBy = sortOrder === 'asc' ? asc(products.createdAt) : desc(products.createdAt);
        break;
    }

    // Execute query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [productsList, countResult] = await Promise.all([
      db
        .select()
        .from(products)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    return c.json({
      data: productsList,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error listing products:', error);
    return c.json({ error: 'Failed to list products' }, 500);
  }
});

/**
 * GET /api/products/:id
 * Get a single product by ID
 */
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product || product.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json(product[0]);
  } catch (error) {
    console.error('Error getting product:', error);
    return c.json({ error: 'Failed to get product' }, 500);
  }
});

/**
 * GET /api/products/:id/variants
 * Get product variants (sizes) for a specific product
 */
app.get('/:id/variants', async (c) => {
  try {
    const id = c.req.param('id');

    // Check if product exists
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product || product.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // Get variants
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id));

    return c.json({ data: variants });
  } catch (error) {
    console.error('Error getting product variants:', error);
    return c.json({ error: 'Failed to get product variants' }, 500);
  }
});

/**
 * POST /api/products
 * Create a new product (admin only)
 *
 * Request Body:
 * {
 *   sku: string,
 *   title: string,
 *   slug: string,
 *   description: string,
 *   basePrice: string,
 *   styles: string[],
 *   subjects: string[],
 *   colors: string[],
 *   orientation: 'square' | 'portrait' | 'landscape' | 'panoramic' | 'round',
 *   images: Array<{ url, alt, width, height, isPrimary }>,
 *   seoTitle: string,
 *   seoDescription: string,
 *   status?: 'draft' | 'active' | 'archived',
 *   featuredOrder?: number,
 *   artistId?: string
 * }
 */
app.post('/', requireAuth, requireRole(['admin']), async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    const requiredFields = [
      'sku', 'title', 'slug', 'description', 'basePrice',
      'styles', 'subjects', 'colors', 'orientation',
      'images', 'seoTitle', 'seoDescription'
    ];

    const missingFields = requiredFields.filter(field => !(field in body));
    if (missingFields.length > 0) {
      return c.json({
        error: 'Missing required fields',
        fields: missingFields,
      }, 400);
    }

    // Check if SKU already exists
    const existingProduct = await db
      .select()
      .from(products)
      .where(eq(products.sku, body.sku))
      .limit(1);

    if (existingProduct.length > 0) {
      return c.json({ error: 'Product with this SKU already exists' }, 409);
    }

    // Check if slug already exists
    const existingSlug = await db
      .select()
      .from(products)
      .where(eq(products.slug, body.slug))
      .limit(1);

    if (existingSlug.length > 0) {
      return c.json({ error: 'Product with this slug already exists' }, 409);
    }

    // Create product
    const newProduct = await db
      .insert(products)
      .values({
        sku: body.sku,
        title: body.title,
        slug: body.slug,
        description: body.description,
        basePrice: body.basePrice,
        styles: body.styles,
        subjects: body.subjects,
        colors: body.colors,
        orientation: body.orientation,
        images: body.images,
        seoTitle: body.seoTitle,
        seoDescription: body.seoDescription,
        status: body.status || 'draft',
        featuredOrder: body.featuredOrder,
        artistId: body.artistId,
      })
      .returning();

    return c.json(newProduct[0], 201);
  } catch (error) {
    console.error('Error creating product:', error);
    return c.json({ error: 'Failed to create product' }, 500);
  }
});

/**
 * PUT /api/products/:id
 * Update a product (admin only)
 *
 * Request Body: Same as POST, all fields optional
 */
app.put('/:id', requireAuth, requireRole(['admin']), async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    // Check if product exists
    const existingProduct = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existingProduct || existingProduct.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // If updating SKU, check uniqueness
    if (body.sku && body.sku !== existingProduct[0].sku) {
      const skuExists = await db
        .select()
        .from(products)
        .where(and(
          eq(products.sku, body.sku),
          sql`${products.id} != ${id}`
        ))
        .limit(1);

      if (skuExists.length > 0) {
        return c.json({ error: 'Product with this SKU already exists' }, 409);
      }
    }

    // If updating slug, check uniqueness
    if (body.slug && body.slug !== existingProduct[0].slug) {
      const slugExists = await db
        .select()
        .from(products)
        .where(and(
          eq(products.slug, body.slug),
          sql`${products.id} != ${id}`
        ))
        .limit(1);

      if (slugExists.length > 0) {
        return c.json({ error: 'Product with this slug already exists' }, 409);
      }
    }

    // Update product
    const updatedProduct = await db
      .update(products)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    return c.json(updatedProduct[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    return c.json({ error: 'Failed to update product' }, 500);
  }
});

/**
 * DELETE /api/products/:id
 * Delete a product (admin only)
 * Note: This will cascade delete variants and frames
 */
app.delete('/:id', requireAuth, requireRole(['admin']), async (c) => {
  try {
    const id = c.req.param('id');

    // Check if product exists
    const existingProduct = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existingProduct || existingProduct.length === 0) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // Delete product (cascade will handle variants)
    await db
      .delete(products)
      .where(eq(products.id, id));

    return c.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    return c.json({ error: 'Failed to delete product' }, 500);
  }
});

export default app;
