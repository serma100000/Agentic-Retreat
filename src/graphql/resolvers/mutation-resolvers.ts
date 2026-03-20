/**
 * GraphQL mutation resolvers for the OpenPulse API.
 *
 * Handles report submission, notification preference updates,
 * and API key management (creation and revocation).
 */

import type { GraphQLContext, ReportInput, NotificationPreferenceInput, ApiKeyInput } from '../types.js';
import { pubsub, Channels } from '../pubsub.js';

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${random}`;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = 'op_';
  let key = prefix;
  for (let i = 0; i < 40; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

function hashApiKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

const VALID_REPORT_TYPES = [
  'WEBSITE_DOWN', 'APP_NOT_WORKING', 'SLOW_PERFORMANCE',
  'LOGIN_ISSUES', 'PARTIAL_OUTAGE', 'API_ERRORS', 'OTHER',
];

export const mutationResolvers = {
  Mutation: {
    async submitReport(
      _parent: unknown,
      args: { input: ReportInput },
      ctx: GraphQLContext,
    ): Promise<{ success: boolean; reportId: string | null; message: string }> {
      const { serviceSlug, type, description, region } = args.input;

      if (!serviceSlug || serviceSlug.trim().length === 0) {
        return { success: false, reportId: null, message: 'serviceSlug is required' };
      }

      if (!VALID_REPORT_TYPES.includes(type)) {
        return {
          success: false,
          reportId: null,
          message: `Invalid report type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}`,
        };
      }

      const serviceResult = await ctx.db.query(
        'SELECT id, slug, name FROM services WHERE slug = $1',
        [serviceSlug],
      );
      if (serviceResult.rows.length === 0) {
        return { success: false, reportId: null, message: `Service "${serviceSlug}" not found` };
      }

      const service = serviceResult.rows[0] as { id: string; slug: string; name: string };
      const reportId = generateId();

      await ctx.db.query(
        `INSERT INTO reports (id, service_id, type, description, region, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [reportId, service.id, type, description ?? null, region ?? null],
      );

      // Increment report counter in Redis
      const counterKey = `reports:count:24h:${serviceSlug}`;
      await ctx.redis.incr(counterKey);

      // Publish report event for subscriptions
      const countStr = await ctx.redis.get(counterKey);
      const reportCount = parseInt(countStr ?? '1', 10);

      pubsub.publish(Channels.reportReceivedFor(serviceSlug), {
        reportReceived: {
          serviceSlug,
          reportCount,
          reportType: type,
          region: region ?? 'unknown',
          timestamp: new Date().toISOString(),
        },
      });

      return { success: true, reportId, message: 'Report submitted successfully' };
    },

    async updateNotificationPreferences(
      _parent: unknown,
      args: { input: NotificationPreferenceInput },
      ctx: GraphQLContext,
    ): Promise<{
      id: string;
      userId: string;
      channel: string;
      enabled: boolean;
      serviceFilters: string[] | null;
      minSeverity: string | null;
    }> {
      const userId = ctx.userId;
      if (!userId) {
        throw new Error('Authentication required to update notification preferences');
      }

      const { channel, enabled, serviceFilters, minSeverity } = args.input;
      const prefId = generateId();

      const existing = await ctx.db.query(
        'SELECT id FROM notification_preferences WHERE user_id = $1 AND channel = $2',
        [userId, channel],
      );

      if (existing.rows.length > 0) {
        const existingId = (existing.rows[0] as { id: string }).id;
        await ctx.db.query(
          `UPDATE notification_preferences
           SET enabled = $1, service_filters = $2, min_severity = $3, updated_at = NOW()
           WHERE id = $4`,
          [enabled, serviceFilters ?? null, minSeverity ?? null, existingId],
        );
        return {
          id: existingId,
          userId,
          channel,
          enabled,
          serviceFilters: serviceFilters ?? null,
          minSeverity: minSeverity ?? null,
        };
      }

      await ctx.db.query(
        `INSERT INTO notification_preferences (id, user_id, channel, enabled, service_filters, min_severity, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [prefId, userId, channel, enabled, serviceFilters ?? null, minSeverity ?? null],
      );

      return {
        id: prefId,
        userId,
        channel,
        enabled,
        serviceFilters: serviceFilters ?? null,
        minSeverity: minSeverity ?? null,
      };
    },

    async createApiKey(
      _parent: unknown,
      args: { input: ApiKeyInput },
      ctx: GraphQLContext,
    ): Promise<{
      id: string;
      key: string;
      name: string;
      tier: string;
      createdAt: string;
      expiresAt: string | null;
    }> {
      const userId = ctx.userId;
      if (!userId) {
        throw new Error('Authentication required to create API keys');
      }

      const { name, tier, expiresInDays } = args.input;
      const keyId = generateId();
      const rawKey = generateApiKey();
      const hashedKey = hashApiKey(rawKey);
      const keyTier = tier ?? 'free';

      const now = new Date();
      let expiresAt: Date | null = null;
      if (expiresInDays && expiresInDays > 0) {
        expiresAt = new Date(now.getTime() + expiresInDays * 86400000);
      }

      await ctx.db.query(
        `INSERT INTO api_keys (id, user_id, name, key_hash, tier, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [keyId, userId, name, hashedKey, keyTier, now, expiresAt],
      );

      return {
        id: keyId,
        key: rawKey,
        name,
        tier: keyTier,
        createdAt: now.toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
      };
    },

    async revokeApiKey(
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ): Promise<boolean> {
      const userId = ctx.userId;
      if (!userId) {
        throw new Error('Authentication required to revoke API keys');
      }

      const result = await ctx.db.query(
        'UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
        [args.id, userId],
      );

      // Check if any row was updated by querying the key
      const check = await ctx.db.query(
        'SELECT revoked_at FROM api_keys WHERE id = $1 AND user_id = $2',
        [args.id, userId],
      );

      if (check.rows.length === 0) {
        throw new Error('API key not found');
      }

      return true;
    },
  },
};
