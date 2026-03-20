/**
 * Fastify plugin for Redis (ioredis) connection with reconnect logic.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

async function redisPlugin(fastify: FastifyInstance): Promise<void> {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        fastify.log.error('Redis: max retries reached, giving up');
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      fastify.log.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    lazyConnect: false,
    enableReadyCheck: true,
    reconnectOnError(err: Error): boolean {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
      return targetErrors.some((e) => err.message.includes(e));
    },
  });

  redis.on('connect', () => {
    fastify.log.info('Redis: connected');
  });

  redis.on('ready', () => {
    fastify.log.info('Redis: ready');
  });

  redis.on('error', (err: Error) => {
    fastify.log.error({ err }, 'Redis: connection error');
  });

  redis.on('close', () => {
    fastify.log.warn('Redis: connection closed');
  });

  fastify.decorate('redis', redis);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing Redis connection');
    await redis.quit();
  });

  fastify.log.info('Redis plugin initialized');
}

export default fp(redisPlugin, {
  name: 'redis',
});
