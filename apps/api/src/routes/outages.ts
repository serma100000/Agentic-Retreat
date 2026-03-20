/**
 * Outage endpoints.
 * - GET /api/v1/outages/active - all active outages
 * - GET /api/v1/outages/:id - outage detail with timeline events
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { OutageService } from '../services/outage-service.js';

export default async function outageRoutes(fastify: FastifyInstance): Promise<void> {
  const outageService = new OutageService(fastify.db);

  // GET /api/v1/outages/active
  fastify.get('/api/v1/outages/active', async (_request: FastifyRequest, reply: FastifyReply) => {
    const activeOutages = await outageService.listActive();

    return reply.status(200).send({
      data: activeOutages,
      count: activeOutages.length,
    });
  });

  // GET /api/v1/outages/:id
  fastify.get(
    '/api/v1/outages/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      // Basic UUID format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return reply.status(400).send({
          error: 'Invalid ID format',
          message: 'Outage ID must be a valid UUID',
        });
      }

      const outage = await outageService.getById(id);
      if (!outage) {
        return reply.status(404).send({
          error: 'Outage not found',
          message: `No outage found with id: ${id}`,
        });
      }

      return reply.status(200).send({ data: outage });
    },
  );
}
