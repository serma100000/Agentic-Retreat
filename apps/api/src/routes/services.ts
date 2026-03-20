/**
 * Service endpoints.
 * - GET /api/v1/services - list with pagination, category filter, search
 * - GET /api/v1/services/:slug - service detail
 * - GET /api/v1/services/:slug/status - current outage status with confidence
 * - GET /api/v1/services/:slug/reports - time-series report data
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  ServiceQuerySchema,
  TimeSeriesQuerySchema,
} from '../middleware/validation.js';
import { ServiceService } from '../services/service-service.js';
import { ReportService } from '../services/report-service.js';
import { ZodError } from 'zod';

export default async function serviceRoutes(fastify: FastifyInstance): Promise<void> {
  const serviceService = new ServiceService(fastify.db, fastify.redis);
  const reportService = new ReportService(fastify.db, fastify.redis);

  // GET /api/v1/services
  fastify.get('/api/v1/services', async (request: FastifyRequest, reply: FastifyReply) => {
    let query;
    try {
      query = ServiceQuerySchema.parse(request.query);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      throw err;
    }

    const result = await serviceService.list(query.page, query.limit, query.category, query.search);

    return reply.status(200).send({
      data: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  });

  // GET /api/v1/services/:slug
  fastify.get(
    '/api/v1/services/:slug',
    async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const { slug } = request.params;

      const service = await serviceService.getBySlug(slug);
      if (!service) {
        return reply.status(404).send({
          error: 'Service not found',
          message: `No service found with slug: ${slug}`,
        });
      }

      return reply.status(200).send({ data: service });
    },
  );

  // GET /api/v1/services/:slug/status
  fastify.get(
    '/api/v1/services/:slug/status',
    async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const { slug } = request.params;

      const status = await serviceService.getStatus(slug);
      if (!status) {
        return reply.status(404).send({
          error: 'Service not found',
          message: `No service found with slug: ${slug}`,
        });
      }

      return reply.status(200).send({ data: status });
    },
  );

  // GET /api/v1/services/:slug/reports
  fastify.get(
    '/api/v1/services/:slug/reports',
    async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const { slug } = request.params;

      // Validate query
      let query;
      try {
        query = TimeSeriesQuerySchema.parse(request.query);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({
            error: 'Validation failed',
            details: err.errors.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          });
        }
        throw err;
      }

      // Resolve service
      const serviceId = await serviceService.slugExists(slug);
      if (!serviceId) {
        return reply.status(404).send({
          error: 'Service not found',
          message: `No service found with slug: ${slug}`,
        });
      }

      // Default time range: last 24 hours
      const end = query.end ? new Date(query.end) : new Date();
      const start = query.start ? new Date(query.start) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

      const timeSeries = await reportService.getTimeSeries(serviceId, query.interval, start, end);

      return reply.status(200).send({
        data: {
          serviceId,
          slug,
          interval: query.interval,
          start: start.toISOString(),
          end: end.toISOString(),
          points: timeSeries,
        },
      });
    },
  );
}
