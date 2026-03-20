/**
 * Nested field resolvers for GraphQL types.
 *
 * Resolves computed and relationship fields on Service and Outage types
 * using DataLoaders for efficient batched data fetching.
 */

import type { GraphQLContext, ServiceRow, OutageRow, TimelineEntry } from '../types.js';

interface Signal {
  source: string;
  score: number;
  confidence: number;
  timestamp: string;
}

export const fieldResolvers = {
  Service: {
    async status(parent: ServiceRow, _args: unknown, ctx: GraphQLContext): Promise<string> {
      const outages = await ctx.loaders.outageLoader.load(parent.id);
      const activeOutage = outages.find(
        (o) => o.status !== 'RESOLVED',
      );
      if (activeOutage) {
        return activeOutage.status === 'MAJOR_OUTAGE'
          ? 'MAJOR_OUTAGE'
          : activeOutage.status === 'DEGRADED'
            ? 'DEGRADED'
            : activeOutage.status === 'RECOVERING'
              ? 'RECOVERING'
              : 'INVESTIGATING';
      }
      return 'OPERATIONAL';
    },

    async confidence(parent: ServiceRow, _args: unknown, ctx: GraphQLContext): Promise<number> {
      const outages = await ctx.loaders.outageLoader.load(parent.id);
      const activeOutage = outages.find((o) => o.status !== 'RESOLVED');
      return activeOutage?.confidence ?? 1.0;
    },

    async reportCount24h(parent: ServiceRow, _args: unknown, ctx: GraphQLContext): Promise<number> {
      return ctx.loaders.reportCountLoader.load(parent.slug);
    },

    async probeStatus(
      parent: ServiceRow,
      _args: unknown,
      ctx: GraphQLContext,
    ): Promise<{
      success: boolean;
      latencyMs: number;
      statusCode: number;
      checkedAt: string;
    } | null> {
      const probe = await ctx.loaders.probeStatusLoader.load(parent.id);
      if (!probe) return null;
      return {
        success: probe.success,
        latencyMs: probe.latency_ms,
        statusCode: probe.status_code,
        checkedAt: probe.checked_at instanceof Date
          ? probe.checked_at.toISOString()
          : String(probe.checked_at),
      };
    },

    async outages(
      parent: ServiceRow,
      args: { limit?: number; offset?: number },
      ctx: GraphQLContext,
    ): Promise<OutageRow[]> {
      const allOutages = await ctx.loaders.outageLoader.load(parent.id);
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 10;
      return allOutages.slice(offset, offset + limit);
    },

    async recentReports(
      parent: ServiceRow,
      args: { limit?: number },
      ctx: GraphQLContext,
    ): Promise<unknown[]> {
      const limit = args.limit ?? 10;
      const result = await ctx.db.query(
        `SELECT id, s.slug as "serviceSlug", r.type, r.description, r.region,
                r.created_at as "createdAt"
         FROM reports r JOIN services s ON r.service_id = s.id
         WHERE r.service_id = $1
         ORDER BY r.created_at DESC LIMIT $2`,
        [parent.id, limit],
      );
      return result.rows;
    },
  },

  Outage: {
    async service(parent: OutageRow, _args: unknown, ctx: GraphQLContext): Promise<ServiceRow | null> {
      return ctx.loaders.serviceLoader.load(parent.service_id);
    },

    startedAt(parent: OutageRow): string {
      return parent.started_at instanceof Date
        ? parent.started_at.toISOString()
        : String(parent.started_at);
    },

    resolvedAt(parent: OutageRow): string | null {
      if (!parent.resolved_at) return null;
      return parent.resolved_at instanceof Date
        ? parent.resolved_at.toISOString()
        : String(parent.resolved_at);
    },

    duration(parent: OutageRow): number | null {
      if (!parent.started_at) return null;
      const start = parent.started_at instanceof Date
        ? parent.started_at.getTime()
        : new Date(parent.started_at).getTime();
      const end = parent.resolved_at
        ? (parent.resolved_at instanceof Date
          ? parent.resolved_at.getTime()
          : new Date(parent.resolved_at).getTime())
        : Date.now();
      return Math.floor((end - start) / 1000);
    },

    affectedRegions(parent: OutageRow): string[] {
      if (Array.isArray(parent.affected_regions)) {
        return parent.affected_regions;
      }
      if (typeof parent.affected_regions === 'string') {
        try {
          return JSON.parse(parent.affected_regions);
        } catch {
          return [];
        }
      }
      return [];
    },

    signals(parent: OutageRow): Signal[] {
      if (!parent.detection_signals) return [];
      if (typeof parent.detection_signals === 'string') {
        try {
          const parsed = JSON.parse(parent.detection_signals);
          if (Array.isArray(parsed)) {
            return parsed.map((s: Record<string, unknown>) => ({
              source: String(s['source'] ?? 'unknown'),
              score: Number(s['score'] ?? 0),
              confidence: Number(s['confidence'] ?? 0),
              timestamp: String(s['timestamp'] ?? new Date().toISOString()),
            }));
          }
        } catch {
          return [];
        }
      }
      return [];
    },

    async timeline(parent: OutageRow, _args: unknown, ctx: GraphQLContext): Promise<Array<{
      id: string;
      state: string;
      confidence: number;
      createdAt: string;
      message?: string;
    }>> {
      const entries = await ctx.loaders.timelineLoader.load(parent.id);
      return entries.map((entry: TimelineEntry) => ({
        id: entry.id,
        state: entry.state,
        confidence: entry.confidence,
        createdAt: entry.created_at instanceof Date
          ? entry.created_at.toISOString()
          : String(entry.created_at),
        message: entry.message,
      }));
    },
  },
};
