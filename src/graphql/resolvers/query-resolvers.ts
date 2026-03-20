/**
 * GraphQL query resolvers for the OpenPulse API.
 *
 * Handles services, outages, and analytics queries with
 * pagination, filtering, and computed field delegation.
 */

import type {
  GraphQLContext,
  ServiceRow,
  OutageRow,
  PageInfo,
  ServiceConnection,
  OutageConnection,
} from '../types.js';

interface ServicesArgs {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface OutagesArgs {
  status?: string;
  limit?: number;
  offset?: number;
}

interface AnalyticsArgs {
  serviceSlug?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}

function buildPageInfo(
  totalCount: number,
  limit: number,
  offset: number,
): PageInfo {
  return {
    hasNextPage: offset + limit < totalCount,
    hasPreviousPage: offset > 0,
    startCursor: totalCount > 0 ? String(offset) : null,
    endCursor: totalCount > 0 ? String(Math.min(offset + limit - 1, totalCount - 1)) : null,
  };
}

export const queryResolvers = {
  Query: {
    async services(
      _parent: unknown,
      args: ServicesArgs,
      ctx: GraphQLContext,
    ): Promise<ServiceConnection> {
      const limit = Math.min(args.limit ?? 20, 100);
      const offset = args.offset ?? 0;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (args.category) {
        conditions.push(`category = $${paramIdx++}`);
        params.push(args.category);
      }
      if (args.search) {
        conditions.push(`(name ILIKE $${paramIdx} OR slug ILIKE $${paramIdx})`);
        params.push(`%${args.search}%`);
        paramIdx++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await ctx.db.query(
        `SELECT COUNT(*)::int as count FROM services ${whereClause}`,
        params,
      );
      const totalCount = (countResult.rows[0] as { count: number })?.count ?? 0;

      const dataParams = [...params, limit, offset];
      const dataResult = await ctx.db.query(
        `SELECT * FROM services ${whereClause} ORDER BY name ASC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        dataParams,
      );

      return {
        nodes: dataResult.rows as ServiceRow[],
        totalCount,
        pageInfo: buildPageInfo(totalCount, limit, offset),
      };
    },

    async service(
      _parent: unknown,
      args: { slug: string },
      ctx: GraphQLContext,
    ): Promise<ServiceRow | null> {
      const result = await ctx.db.query(
        'SELECT * FROM services WHERE slug = $1',
        [args.slug],
      );
      return (result.rows[0] as ServiceRow) ?? null;
    },

    async outages(
      _parent: unknown,
      args: OutagesArgs,
      ctx: GraphQLContext,
    ): Promise<OutageConnection> {
      const limit = Math.min(args.limit ?? 20, 100);
      const offset = args.offset ?? 0;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (args.status) {
        conditions.push(`status = $${paramIdx++}`);
        params.push(args.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await ctx.db.query(
        `SELECT COUNT(*)::int as count FROM outages ${whereClause}`,
        params,
      );
      const totalCount = (countResult.rows[0] as { count: number })?.count ?? 0;

      const dataParams = [...params, limit, offset];
      const dataResult = await ctx.db.query(
        `SELECT * FROM outages ${whereClause} ORDER BY started_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        dataParams,
      );

      return {
        nodes: dataResult.rows as OutageRow[],
        totalCount,
        pageInfo: buildPageInfo(totalCount, limit, offset),
      };
    },

    async outage(
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ): Promise<OutageRow | null> {
      const result = await ctx.db.query(
        'SELECT * FROM outages WHERE id = $1',
        [args.id],
      );
      return (result.rows[0] as OutageRow) ?? null;
    },

    async analytics(
      _parent: unknown,
      args: AnalyticsArgs,
      ctx: GraphQLContext,
    ): Promise<{
      outageHistory: unknown[];
      categorySummary: unknown[];
      trends: unknown[];
      reliability: unknown[];
    }> {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (args.serviceSlug) {
        conditions.push(`o.service_id = (SELECT id FROM services WHERE slug = $${paramIdx++})`);
        params.push(args.serviceSlug);
      }
      if (args.category) {
        conditions.push(`s.category = $${paramIdx++}`);
        params.push(args.category);
      }
      if (args.startDate) {
        conditions.push(`o.started_at >= $${paramIdx++}::timestamptz`);
        params.push(args.startDate);
      }
      if (args.endDate) {
        conditions.push(`o.started_at <= $${paramIdx++}::timestamptz`);
        params.push(args.endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const historyResult = await ctx.db.query(
        `SELECT o.id as "outageId", s.slug as "serviceSlug", s.name as "serviceName",
                o.status as state, o.confidence, o.started_at as "startedAt",
                o.resolved_at as "resolvedAt",
                EXTRACT(EPOCH FROM COALESCE(o.resolved_at, NOW()) - o.started_at)::int * 1000 as "durationMs",
                o.affected_regions as "affectedRegions"
         FROM outages o JOIN services s ON o.service_id = s.id
         ${whereClause}
         ORDER BY o.started_at DESC LIMIT 100`,
        params,
      );

      const categoryResult = await ctx.db.query(
        `SELECT s.category, COUNT(*)::int as "totalOutages",
                AVG(EXTRACT(EPOCH FROM COALESCE(o.resolved_at, NOW()) - o.started_at)::int * 1000)::int as "avgDurationMs",
                0 as "avgMttd", 0 as "avgMttr"
         FROM outages o JOIN services s ON o.service_id = s.id
         ${whereClause}
         GROUP BY s.category`,
        params,
      );

      const trendResult = await ctx.db.query(
        `SELECT to_char(o.started_at, 'YYYY-MM') as period,
                COUNT(*)::int as "totalOutages",
                AVG(EXTRACT(EPOCH FROM COALESCE(o.resolved_at, NOW()) - o.started_at))::int as "avgDuration",
                COUNT(DISTINCT o.service_id)::int as "serviceCount"
         FROM outages o JOIN services s ON o.service_id = s.id
         ${whereClause}
         GROUP BY period ORDER BY period DESC LIMIT 12`,
        params,
      );

      const reliabilityResult = await ctx.db.query(
        `SELECT s.slug as "serviceSlug", s.name as "serviceName",
                100.0 - (COUNT(o.id)::float / GREATEST(1, EXTRACT(EPOCH FROM NOW() - MIN(s.created_at)) / 86400) * 100) as "uptimePercent",
                COUNT(o.id)::int as "totalOutages",
                AVG(EXTRACT(EPOCH FROM COALESCE(o.resolved_at, NOW()) - o.started_at))::int as "avgDuration",
                0 as mttr, 0 as mttd,
                ROW_NUMBER() OVER (ORDER BY COUNT(o.id) ASC)::int as rank
         FROM services s LEFT JOIN outages o ON s.id = o.service_id
         GROUP BY s.id, s.slug, s.name
         ORDER BY "uptimePercent" DESC LIMIT 50`,
        [],
      );

      return {
        outageHistory: historyResult.rows,
        categorySummary: categoryResult.rows,
        trends: trendResult.rows,
        reliability: reliabilityResult.rows,
      };
    },
  },
};
