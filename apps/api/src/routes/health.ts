/**
 * Health check endpoint.
 * GET /health - returns status, version, uptime, and dependency checks.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sql } from 'drizzle-orm';

interface HealthCheck {
  readonly status: 'ok' | 'error';
  readonly latencyMs?: number;
  readonly error?: string;
}

interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly version: string;
  readonly uptime: number;
  readonly timestamp: string;
  readonly checks: {
    readonly db: HealthCheck;
    readonly redis: HealthCheck;
    readonly kafka: HealthCheck;
  };
}

async function checkDb(fastify: FastifyInstance): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await fastify.db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkRedis(fastify: FastifyInstance): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await fastify.redis.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkKafka(fastify: FastifyInstance): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Producer metadata fetch is a lightweight liveness check
    const admin = fastify.kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export default async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const [db, redis, kafka] = await Promise.all([
      checkDb(fastify),
      checkRedis(fastify),
      checkKafka(fastify),
    ]);

    const allOk = db.status === 'ok' && redis.status === 'ok' && kafka.status === 'ok';

    const response: HealthResponse = {
      status: allOk ? 'ok' : 'degraded',
      version: process.env['npm_package_version'] ?? '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { db, redis, kafka },
    };

    const statusCode = allOk ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
}
