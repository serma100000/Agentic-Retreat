/**
 * Fastify-compatible API route definitions for OpenPulse analytics.
 *
 * Defines typed route handlers for outage history, reliability metrics,
 * correlation analysis, category summaries, trends, and leaderboards.
 */

import type { AnalyticsService } from './analytics-service.js';

interface FastifyInstance {
  get(path: string, opts: RouteOptions, handler: RouteHandler): void;
}

interface FastifyRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
}

interface FastifyReply {
  code(statusCode: number): FastifyReply;
  send(payload: unknown): void;
}

type RouteHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

interface RouteOptions {
  schema: {
    description: string;
    querystring?: Record<string, unknown>;
    params?: Record<string, unknown>;
    response: Record<number, unknown>;
  };
}

const stringParam = { type: 'string' };
const intParam = { type: 'integer' };

/**
 * Register all analytics API routes on a Fastify instance.
 */
export function registerAnalyticsRoutes(
  app: FastifyInstance,
  analyticsService: AnalyticsService,
): void {
  // GET /api/v1/analytics/services/:slug/history
  app.get(
    '/api/v1/analytics/services/:slug/history',
    {
      schema: {
        description: 'Get outage history for a service with optional filters',
        params: {
          type: 'object',
          properties: { slug: stringParam },
          required: ['slug'],
        },
        querystring: {
          type: 'object',
          properties: {
            category: stringParam,
            startDate: stringParam,
            endDate: stringParam,
            limit: intParam,
            offset: intParam,
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              total: intParam,
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { slug } = request.params;
        const { category, startDate, endDate, limit, offset } = request.query;

        const results = await analyticsService.getOutageHistory({
          serviceSlug: slug,
          category,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        reply.send({ data: results, total: results.length });
      } catch (err) {
        reply.code(500).send({
          error: 'Failed to fetch outage history',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/analytics/services/:slug/reliability
  app.get(
    '/api/v1/analytics/services/:slug/reliability',
    {
      schema: {
        description: 'Get reliability metrics for a service (uptime, MTTR, MTTD)',
        params: {
          type: 'object',
          properties: { slug: stringParam },
          required: ['slug'],
        },
        querystring: {
          type: 'object',
          properties: { category: stringParam },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              reliability: { type: 'object' },
              mttr: { type: 'object' },
              mttd: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { slug } = request.params;

        const [reliabilities, mttr, mttd] = await Promise.all([
          analyticsService.getServiceReliability(undefined, 1000),
          analyticsService.getMTTR(slug!),
          analyticsService.getMTTD(slug!),
        ]);

        const reliability = reliabilities.find(r => r.serviceSlug === slug) ?? null;

        reply.send({ reliability, mttr, mttd });
      } catch (err) {
        reply.code(500).send({
          error: 'Failed to fetch reliability metrics',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/analytics/services/:slug/correlations
  app.get(
    '/api/v1/analytics/services/:slug/correlations',
    {
      schema: {
        description: 'Find services with correlated outage patterns',
        params: {
          type: 'object',
          properties: { slug: stringParam },
          required: ['slug'],
        },
        querystring: {
          type: 'object',
          properties: {
            timeWindowMs: intParam,
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { slug } = request.params;
        const { timeWindowMs } = request.query;

        const results = await analyticsService.getCorrelations(
          slug!,
          timeWindowMs ? parseInt(timeWindowMs, 10) : undefined,
        );

        reply.send({ data: results });
      } catch (err) {
        reply.code(500).send({
          error: 'Failed to fetch correlations',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/analytics/categories/:category/summary
  app.get(
    '/api/v1/analytics/categories/:category/summary',
    {
      schema: {
        description: 'Get summary statistics for a service category',
        params: {
          type: 'object',
          properties: { category: stringParam },
          required: ['category'],
        },
        querystring: {
          type: 'object',
          properties: {
            startDate: stringParam,
            endDate: stringParam,
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              summary: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { category } = request.params;
        const { startDate, endDate } = request.query;

        const summary = await analyticsService.getCategorySummary(
          category!,
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined,
        );

        reply.send({ summary });
      } catch (err) {
        reply.code(500).send({
          error: 'Failed to fetch category summary',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/analytics/trends
  app.get(
    '/api/v1/analytics/trends',
    {
      schema: {
        description: 'Get platform-wide outage trends over time',
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['weekly', 'monthly', 'quarterly'] },
            months: intParam,
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { period, months } = request.query;

        const validPeriod = (period as 'weekly' | 'monthly' | 'quarterly') ?? 'monthly';
        const trends = await analyticsService.getTrends(
          validPeriod,
          months ? parseInt(months, 10) : undefined,
        );

        reply.send({ data: trends });
      } catch (err) {
        reply.code(500).send({
          error: 'Failed to fetch trends',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/analytics/leaderboard
  app.get(
    '/api/v1/analytics/leaderboard',
    {
      schema: {
        description: 'Get service reliability ranking (leaderboard)',
        querystring: {
          type: 'object',
          properties: {
            category: stringParam,
            limit: intParam,
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { category, limit } = request.query;

        const results = await analyticsService.getServiceReliability(
          category,
          limit ? parseInt(limit, 10) : undefined,
        );

        reply.send({ data: results });
      } catch (err) {
        reply.code(500).send({
          error: 'Failed to fetch leaderboard',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );
}
