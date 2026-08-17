/**
 * Vendor / User Linkage
 *
 * One user belongs to one vendor. The UNIQUE on user_id is load-bearing:
 * it is what lets `requireVendor` resolve a caller to a single vendorId as a
 * lookup rather than a choice, and it makes "which vendor is this?" a question
 * with exactly one answer at the database level.
 *
 * The `vendor` role by itself grants nothing. Every other role in this system
 * is a blanket grant, so requireRole is a complete check for them; a vendor
 * sees only their own rows, which requireRole cannot express. See
 * `lib/vendor-scope.ts` for where that is actually enforced.
 */

import { pgTable, text, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { vendors } from './vendors'

export const vendorUsers = pgTable(
  'vendor_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .references(() => vendors.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    vendorIdIdx: index('vendor_users_vendor_id_idx').on(table.vendorId),
    userUnique: unique('vendor_users_user_id_unique').on(table.userId),
  })
)

export const vendorUsersRelations = relations(vendorUsers, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorUsers.vendorId], references: [vendors.id] }),
  user: one(users, { fields: [vendorUsers.userId], references: [users.id] }),
}))

export type VendorUser = typeof vendorUsers.$inferSelect
export type NewVendorUser = typeof vendorUsers.$inferInsert
