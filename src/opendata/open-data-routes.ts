/**
 * Fastify-compatible API route definitions for OpenPulse Open Data (Sprint 19).
 *
 * All routes serve anonymized, aggregated data under CC-BY-4.0 license.
 * Responses include X-Data-License header. Rate limits apply per tier:
 * - Free: 1000 requests/day
 * - Registered: 10000 requests/day
 */

import type { OpenDataService } from './open-data-service.js';
import type { ExportFormat } from './types.js';
import { DATA_LICENSE, LICENSE_INFO } from './types.js';

interface FastifyInstance {
  get(path: string, opts: RouteOptions, handler: RouteHandler): void;
}

interface FastifyRequest {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
}

interface FastifyReply {
  code(statusCode: number): FastifyReply;
  header(name: string, value: string): FastifyReply;
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
 * Attach the X-Data-License header to a reply.
 */
function addLicenseHeader(reply: FastifyReply): FastifyReply {
  return reply.header('X-Data-License', DATA_LICENSE);
}

/**
 * Extract the API key from request headers for rate limiting.
 */
function getApiKey(request: FastifyRequest): string {
  return request.headers['x-api-key'] ?? 'anonymous';
}

/**
 * Register all Open Data API routes on a Fastify instance.
 */
export function registerOpenDataRoutes(
  app: FastifyInstance,
  openDataService: OpenDataService,
): void {
  // GET /api/v1/open/outages
  app.get(
    '/api/v1/open/outages',
    {
      schema: {
        description: 'Get anonymized historical outages with filters and pagination',
        querystring: {
          type: 'object',
          properties: {
            serviceSlug: stringParam,
            category: stringParam,
            city: stringParam,
            region: stringParam,
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
              limit: intParam,
              offset: intParam,
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const apiKey = getApiKey(request);
        if (!openDataService.trackRequest(apiKey)) {
          addLicenseHeader(reply);
          reply.code(429).send({
            error: 'Rate limit exceeded',
            message: 'Daily request quota exhausted. Register for a higher tier.',
          });
          return;
        }

        const { serviceSlug, category, city, region, startDate, endDate, limit, offset } =
          request.query;

        const results = await openDataService.getOutages({
          serviceSlug,
          category,
          city,
          region,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        });

        addLicenseHeader(reply);
        reply.send(results);
      } catch (err) {
        addLicenseHeader(reply);
        reply.code(500).send({
          error: 'Failed to fetch outages',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/open/services/:slug/reliability
  app.get(
    '/api/v1/open/services/:slug/reliability',
    {
      schema: {
        description: 'Get reliability metrics for a specific service',
        params: {
          type: 'object',
          properties: { slug: stringParam },
          required: ['slug'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              reliability: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const apiKey = getApiKey(request);
        if (!openDataService.trackRequest(apiKey)) {
          addLicenseHeader(reply);
          reply.code(429).send({
            error: 'Rate limit exceeded',
            message: 'Daily request quota exhausted.',
          });
          return;
        }

        const { slug } = request.params;
        const reliability = await openDataService.getServiceReliability(slug!);

        addLicenseHeader(reply);
        reply.send({ reliability });
      } catch (err) {
        addLicenseHeader(reply);
        reply.code(500).send({
          error: 'Failed to fetch reliability metrics',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/open/trends
  app.get(
    '/api/v1/open/trends',
    {
      schema: {
        description: 'Get platform-wide outage trends',
        querystring: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
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
        const apiKey = getApiKey(request);
        if (!openDataService.trackRequest(apiKey)) {
          addLicenseHeader(reply);
          reply.code(429).send({
            error: 'Rate limit exceeded',
            message: 'Daily request quota exhausted.',
          });
          return;
        }

        const { period } = request.query;
        const validPeriod =
          (period as 'daily' | 'weekly' | 'monthly') ?? 'monthly';

        const trends = await openDataService.getTrends(validPeriod);

        addLicenseHeader(reply);
        reply.send({ data: trends });
      } catch (err) {
        addLicenseHeader(reply);
        reply.code(500).send({
          error: 'Failed to fetch trends',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/open/export
  app.get(
    '/api/v1/open/export',
    {
      schema: {
        description: 'Bulk export anonymized outage data in JSON, CSV, or Parquet',
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'csv', 'parquet'] },
            serviceSlug: stringParam,
            category: stringParam,
            startDate: stringParam,
            endDate: stringParam,
            limit: intParam,
          },
        },
        response: {
          200: {
            type: 'string',
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const apiKey = getApiKey(request);
        if (!openDataService.trackRequest(apiKey)) {
          addLicenseHeader(reply);
          reply.code(429).send({
            error: 'Rate limit exceeded',
            message: 'Daily request quota exhausted.',
          });
          return;
        }

        const { format, serviceSlug, category, startDate, endDate, limit } =
          request.query;

        const exportFormat: ExportFormat = (format as ExportFormat) ?? 'json';
        const contentTypes: Record<ExportFormat, string> = {
          json: 'application/json',
          csv: 'text/csv',
          parquet: 'application/octet-stream',
        };

        const result = await openDataService.getExport(exportFormat, {
          serviceSlug,
          category,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
        });

        addLicenseHeader(reply);
        reply.header('Content-Type', contentTypes[exportFormat]);
        reply.send(result);
      } catch (err) {
        addLicenseHeader(reply);
        reply.code(500).send({
          error: 'Failed to generate export',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
  );

  // GET /api/v1/open/license
  app.get(
    '/api/v1/open/license',
    {
      schema: {
        description: 'Get data license information',
        response: {
          200: {
            type: 'object',
            properties: {
              license: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      addLicenseHeader(reply);
      reply.send({
        license: LICENSE_INFO,
      });
    },
  );
}
