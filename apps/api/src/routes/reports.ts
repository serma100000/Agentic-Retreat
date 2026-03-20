/**
 * Report ingestion route.
 * POST /api/v1/reports - accepts outage reports from users.
 *
 * Flow:
 * 1. Validate body with Zod
 * 2. Rate limit: 10/min per IP via Redis
 * 3. Verify service_slug exists
 * 4. Generate device fingerprint
 * 5. Dedup check: same device + service + type within 5 min
 * 6. Geo-enrich from IP (MaxMind)
 * 7. Produce to Kafka topic reports.raw
 * 8. Return 202 Accepted
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { ReportSubmissionSchema } from '../middleware/validation.js';
import { generateDeviceFingerprint } from '../middleware/fingerprint.js';
import { ServiceService } from '../services/service-service.js';
import { ZodError } from 'zod';

const REPORT_RATE_LIMIT = 10;
const REPORT_RATE_WINDOW_SECONDS = 60;
const DEDUP_WINDOW_SECONDS = 300; // 5 minutes

export default async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  const serviceService = new ServiceService(fastify.db, fastify.redis);

  fastify.post('/api/v1/reports', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Validate body
    let body;
    try {
      body = ReportSubmissionSchema.parse(request.body);
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

    // 2. Rate limit: 10/min per IP using Redis
    const clientIp = request.ip;
    const rateLimitKey = `ratelimit:report:${clientIp}`;

    try {
      const currentCount = await fastify.redis.incr(rateLimitKey);
      if (currentCount === 1) {
        await fastify.redis.expire(rateLimitKey, REPORT_RATE_WINDOW_SECONDS);
      }

      if (currentCount > REPORT_RATE_LIMIT) {
        const ttl = await fastify.redis.ttl(rateLimitKey);
        reply.header('Retry-After', String(ttl > 0 ? ttl : REPORT_RATE_WINDOW_SECONDS));
        reply.header('X-RateLimit-Limit', String(REPORT_RATE_LIMIT));
        reply.header('X-RateLimit-Remaining', '0');
        return reply.status(429).send({
          error: 'Too many reports',
          message: `Rate limit exceeded. Maximum ${REPORT_RATE_LIMIT} reports per minute.`,
          retryAfter: ttl > 0 ? ttl : REPORT_RATE_WINDOW_SECONDS,
        });
      }

      reply.header('X-RateLimit-Limit', String(REPORT_RATE_LIMIT));
      reply.header('X-RateLimit-Remaining', String(REPORT_RATE_LIMIT - currentCount));
    } catch (err) {
      // If Redis is down, allow the request through but log it
      fastify.log.warn({ err }, 'Rate limit check failed, allowing request');
    }

    // 3. Check service_slug exists
    const serviceId = await serviceService.slugExists(body.service_slug);
    if (!serviceId) {
      return reply.status(404).send({
        error: 'Service not found',
        message: `No service found with slug: ${body.service_slug}`,
      });
    }

    // 4. Generate device fingerprint
    const fingerprint = generateDeviceFingerprint(
      request.headers['user-agent'],
      request.headers['accept-language'],
      request.headers['x-device-info'] as string | undefined,
    );

    // 5. Dedup check: same device + service + type within 5 min
    const dedupKey = `dedup:report:${fingerprint}:${body.service_slug}:${body.report_type}`;
    try {
      const exists = await fastify.redis.exists(dedupKey);
      if (exists) {
        return reply.status(409).send({
          error: 'Duplicate report',
          message:
            'A report with the same fingerprint, service, and type was submitted recently. Please wait before submitting again.',
        });
      }
      await fastify.redis.setex(dedupKey, DEDUP_WINDOW_SECONDS, '1');
    } catch (err) {
      fastify.log.warn({ err }, 'Dedup check failed, allowing request');
    }

    // 6. Geo-enrich from IP
    const geo = fastify.geoip(clientIp);

    // 7. Produce to Kafka
    const reportId = uuidv4();
    const timestamp = new Date().toISOString();

    const kafkaMessage = {
      id: reportId,
      serviceId,
      serviceSlug: body.service_slug,
      reportType: body.report_type,
      source: body.source,
      fingerprint,
      ipHash: generateDeviceFingerprint(clientIp, undefined, undefined),
      geo: {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        latitude: body.latitude ?? geo.latitude,
        longitude: body.longitude ?? geo.longitude,
      },
      timestamp,
    };

    try {
      await fastify.kafkaProducer.send({
        topic: 'reports.raw',
        messages: [
          {
            key: serviceId,
            value: JSON.stringify(kafkaMessage),
            headers: {
              source: body.source,
              report_type: body.report_type,
            },
          },
        ],
      });
    } catch (err) {
      fastify.log.error({ err }, 'Failed to produce report to Kafka');
      return reply.status(503).send({
        error: 'Service unavailable',
        message: 'Failed to process report. Please try again later.',
      });
    }

    // 8. Return 202 Accepted
    return reply.status(202).send({
      id: reportId,
      service_slug: body.service_slug,
      status: 'accepted',
      timestamp,
    });
  });
}
