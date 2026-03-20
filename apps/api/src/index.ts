/**
 * OpenPulse API - Fastify server entry point.
 * Registers all plugins and route modules, then starts on the configured port.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';

// Plugins
import databasePlugin from './plugins/database.js';
import redisPlugin from './plugins/redis.js';
import kafkaPlugin from './plugins/kafka.js';
import geoipPlugin from './plugins/geoip.js';

// Routes
import healthRoutes from './routes/health.js';
import reportRoutes from './routes/reports.js';
import serviceRoutes from './routes/services.js';
import outageRoutes from './routes/outages.js';

async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
  });

  // --- Security & CORS ---
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Info', 'X-Request-ID'],
    credentials: true,
  });

  // --- Global rate limit ---
  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: 'Rate limit exceeded',
      message: `You have exceeded the ${context.max} requests per minute limit.`,
      statusCode: 429,
    }),
  });

  // --- Swagger / OpenAPI ---
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'OpenPulse API',
        description: 'Real-time service outage detection and reporting API',
        version: '0.1.0',
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'health', description: 'Health check endpoints' },
        { name: 'reports', description: 'Report submission' },
        { name: 'services', description: 'Service queries' },
        { name: 'outages', description: 'Outage queries' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // --- Infrastructure plugins ---
  await fastify.register(databasePlugin);
  await fastify.register(redisPlugin);
  await fastify.register(kafkaPlugin);
  await fastify.register(geoipPlugin);

  // --- Routes ---
  await fastify.register(healthRoutes);
  await fastify.register(reportRoutes);
  await fastify.register(serviceRoutes);
  await fastify.register(outageRoutes);

  return fastify;
}

async function start(): Promise<void> {
  const fastify = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, () => {
      fastify.log.info({ signal }, 'Received shutdown signal');
      fastify
        .close()
        .then(() => {
          fastify.log.info('Server closed gracefully');
          process.exit(0);
        })
        .catch((err) => {
          fastify.log.error({ err }, 'Error during graceful shutdown');
          process.exit(1);
        });
    });
  }

  try {
    const address = await fastify.listen({
      port: config.port,
      host: config.host,
    });
    fastify.log.info(`OpenPulse API listening at ${address}`);
    fastify.log.info(`Swagger UI available at ${address}/docs`);
  } catch (err) {
    fastify.log.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

export { buildApp };
