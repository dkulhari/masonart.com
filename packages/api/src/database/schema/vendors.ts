/**
 * Vendor Directory Schema
 *
 * Third-party print shops and framers, their contacts, what they can make,
 * and what they charge. Sub-project 1 of the fulfilment decomposition.
 *
 * Money is decimal(10,2) INR, matching orders and products — NOT
 * walletPricingConfig's paise and NOT shipping_config's whole rupees. Vendor
 * money is transactional, so it follows orders.
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  pgEnum,
  index,
  boolean,
  integer,
  decimal,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'

export const vendorStatusEnum = pgEnum('vendor_status', ['active', 'inactive', 'suspended'])

/** A capability, and a rate, is either for printing or for framing. */
export const vendorCapabilityKindEnum = pgEnum('vendor_capability_kind', ['print', 'frame'])

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: vendorStatusEnum('status').default('active').notNull(),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country').default('IN'),
    /**
     * The nickname of a pickup address as registered in Shiprocket's own
     * dashboard — pasted by an admin, never derived from the address columns
     * above. A vendor can have a complete address here while Shiprocket has no
     * pickup location for it, or has one filed under a name nobody would
     * guess, so deriving would produce a value that is well-formed and wrong
     * and would fail at dispatch rather than at the screen where it was set.
     *
     * Nullable because most vendors will never have one. NOT NULL with a
     * placeholder would make "unset" and "set to something meaningless"
     * indistinguishable, and only one of those should stop a dispatch.
     */
    shiprocketPickupLocation: text('shiprocket_pickup_location'),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    statusIdx: index('vendors_status_idx').on(table.status),
    nameIdx: index('vendors_name_idx').on(table.name),
  })
)

/**
 * A child table rather than loose columns on `vendors`: a shop has an owner
 * and a production contact, and this is the seam the portal invite needs.
 */
export const vendorContacts = pgTable(
  'vendor_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .references(() => vendors.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    contactRole: text('contact_role'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    vendorIdIdx: index('vendor_contacts_vendor_id_idx').on(table.vendorId),
  })
)

/**
 * One row per capability, so "prints up to 24x36, frames up to 40x60" is two
 * rows and neither constrains the other. Drives the assignment filter.
 */
export const vendorCapabilities = pgTable(
  'vendor_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .references(() => vendors.id, { onDelete: 'cascade' })
      .notNull(),
    kind: vendorCapabilityKindEnum('kind').notNull(),
    maxWidthInches: integer('max_width_inches'),
    maxHeightInches: integer('max_height_inches'),
    finishes: text('finishes').array(),
    statedTurnaroundDays: integer('stated_turnaround_days'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    vendorIdIdx: index('vendor_capabilities_vendor_id_idx').on(table.vendorId),
    kindIdx: index('vendor_capabilities_kind_idx').on(table.kind),
  })
)

/**
 * Rate bands match on the item's LONGEST EDGE in inches. Ranges are
 * inclusive-min, exclusive-max, and must not overlap for a given
 * (vendorId, kind, finish) at any instant — enforced on write, in the
 * validation helper, not by a constraint here.
 *
 * Effective-dated following the shipping_config precedent: a vendor
 * announcing a price rise from the 1st is the ordinary case.
 */
export const vendorRates = pgTable(
  'vendor_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id')
      .references(() => vendors.id, { onDelete: 'cascade' })
      .notNull(),
    kind: vendorCapabilityKindEnum('kind').notNull(),
    longestEdgeMinInches: integer('longest_edge_min_inches').notNull(),
    longestEdgeMaxInches: integer('longest_edge_max_inches').notNull(),
    finish: text('finish'),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    effectiveFrom: timestamp('effective_from').defaultNow().notNull(),
    effectiveTo: timestamp('effective_to'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    vendorIdIdx: index('vendor_rates_vendor_id_idx').on(table.vendorId),
    lookupIdx: index('vendor_rates_lookup_idx').on(table.vendorId, table.kind, table.effectiveFrom),
  })
)

export const vendorsRelations = relations(vendors, ({ many, one }) => ({
  contacts: many(vendorContacts),
  capabilities: many(vendorCapabilities),
  rates: many(vendorRates),
  creator: one(users, { fields: [vendors.createdBy], references: [users.id] }),
}))

export const vendorContactsRelations = relations(vendorContacts, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorContacts.vendorId], references: [vendors.id] }),
}))

export const vendorCapabilitiesRelations = relations(vendorCapabilities, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorCapabilities.vendorId], references: [vendors.id] }),
}))

export const vendorRatesRelations = relations(vendorRates, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorRates.vendorId], references: [vendors.id] }),
}))

export type Vendor = typeof vendors.$inferSelect
export type NewVendor = typeof vendors.$inferInsert
export type VendorContact = typeof vendorContacts.$inferSelect
export type NewVendorContact = typeof vendorContacts.$inferInsert
export type VendorCapability = typeof vendorCapabilities.$inferSelect
export type NewVendorCapability = typeof vendorCapabilities.$inferInsert
export type VendorRate = typeof vendorRates.$inferSelect
export type NewVendorRate = typeof vendorRates.$inferInsert
export type VendorStatus = (typeof vendorStatusEnum.enumValues)[number]
export type VendorCapabilityKind = (typeof vendorCapabilityKindEnum.enumValues)[number]
