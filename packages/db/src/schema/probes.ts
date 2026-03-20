import {
  pgTable,
  varchar,
  text,
  uuid,
  timestamp,
  numeric,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { services } from './services.js';

export const probeResults = pgTable(
  'probe_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    regionCode: varchar('region_code', { length: 10 }).notNull(),
    probeType: varchar('probe_type', { length: 10 }).notNull(),
    statusCode: integer('status_code'),
    latencyMs: numeric('latency_ms').notNull(),
    isSuccess: boolean('is_success').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('probe_results_service_id_idx').on(table.serviceId),
    index('probe_results_created_at_idx').on(table.createdAt),
    index('probe_results_probe_type_idx').on(table.probeType),
  ],
);

export const probeResultsRelations = relations(probeResults, ({ one }) => ({
  service: one(services, {
    fields: [probeResults.serviceId],
    references: [services.id],
  }),
}));
