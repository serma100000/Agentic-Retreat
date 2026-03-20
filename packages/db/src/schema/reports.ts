import {
  pgTable,
  varchar,
  uuid,
  timestamp,
  numeric,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { services } from './services.js';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    reportType: varchar('report_type', { length: 20 }).notNull(),
    regionCode: varchar('region_code', { length: 10 }),
    city: varchar('city', { length: 100 }),
    latitude: numeric('latitude'),
    longitude: numeric('longitude'),
    deviceFingerprintHash: varchar('device_fingerprint_hash', { length: 64 }),
    source: varchar('source', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('reports_service_id_idx').on(table.serviceId),
    index('reports_created_at_idx').on(table.createdAt),
    index('reports_report_type_idx').on(table.reportType),
  ],
);

export const reportsRelations = relations(reports, ({ one }) => ({
  service: one(services, {
    fields: [reports.serviceId],
    references: [services.id],
  }),
}));
