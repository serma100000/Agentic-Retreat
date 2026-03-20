import {
  pgTable,
  varchar,
  uuid,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { services } from './services.js';

export const outages = pgTable(
  'outages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    status: varchar('status', { length: 20 }).notNull(),
    confidenceScore: numeric('confidence_score').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    peakReportsPerMin: integer('peak_reports_per_min').default(0).notNull(),
    affectedRegions: jsonb('affected_regions').default([]).notNull(),
    detectionSignals: jsonb('detection_signals').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('outages_service_id_status_idx').on(table.serviceId, table.status),
  ],
);

export const outageTimeline = pgTable(
  'outage_timeline',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    outageId: uuid('outage_id')
      .notNull()
      .references(() => outages.id),
    eventType: varchar('event_type', { length: 30 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('outage_timeline_outage_id_created_at_idx').on(table.outageId, table.createdAt),
  ],
);

export const outagesRelations = relations(outages, ({ one, many }) => ({
  service: one(services, {
    fields: [outages.serviceId],
    references: [services.id],
  }),
  timeline: many(outageTimeline),
}));

export const outageTimelineRelations = relations(outageTimeline, ({ one }) => ({
  outage: one(outages, {
    fields: [outageTimeline.outageId],
    references: [outages.id],
  }),
}));
