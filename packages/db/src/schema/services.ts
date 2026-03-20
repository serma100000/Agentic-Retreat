import {
  pgTable,
  serial,
  varchar,
  text,
  uuid,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    icon: varchar('icon', { length: 50 }).notNull(),
  },
  (table) => [
    uniqueIndex('service_categories_slug_idx').on(table.slug),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 200 }).notNull().unique(),
    name: varchar('name', { length: 200 }).notNull(),
    categoryId: serial('category_id')
      .notNull()
      .references(() => serviceCategories.id),
    url: text('url').notNull(),
    iconUrl: text('icon_url'),
    description: text('description'),
    statusPageUrl: text('status_page_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('services_slug_idx').on(table.slug),
    index('services_category_id_idx').on(table.categoryId),
  ],
);

export const serviceRegions = pgTable(
  'service_regions',
  {
    id: serial('id').primaryKey(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    regionCode: varchar('region_code', { length: 10 }).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
  },
  (table) => [
    index('service_regions_service_id_idx').on(table.serviceId),
    index('service_regions_region_code_idx').on(table.regionCode),
  ],
);

export const serviceCategoriesRelations = relations(serviceCategories, ({ many }) => ({
  services: many(services),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  category: one(serviceCategories, {
    fields: [services.categoryId],
    references: [serviceCategories.id],
  }),
  regions: many(serviceRegions),
}));

export const serviceRegionsRelations = relations(serviceRegions, ({ one }) => ({
  service: one(services, {
    fields: [serviceRegions.serviceId],
    references: [services.id],
  }),
}));
