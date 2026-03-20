import {
  pgTable,
  serial,
  varchar,
  uuid,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    emailHash: varchar('email_hash', { length: 64 }).unique(),
    displayName: varchar('display_name', { length: 100 }),
    authProvider: varchar('auth_provider', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_email_hash_idx').on(table.emailHash),
  ],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    scopes: jsonb('scopes').default([]).notNull(),
    rateLimitTier: varchar('rate_limit_tier', { length: 20 }).default('free').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_user_id_idx').on(table.userId),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    channel: varchar('channel', { length: 20 }).notNull(),
    config: jsonb('config').default({}).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
  },
  (table) => [
    index('notification_preferences_user_id_idx').on(table.userId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  notificationPreferences: many(notificationPreferences),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));
