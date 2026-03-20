/**
 * Fastify plugin that initializes a Drizzle ORM database connection
 * and decorates the Fastify instance with it.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@openpulse/db/schema';
import { config } from '../config.js';

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
    pgClient: postgres.Sql;
  }
}

async function databasePlugin(fastify: FastifyInstance): Promise<void> {
  const pgClient = postgres(config.databaseUrl, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
  });

  const db = drizzle(pgClient, { schema });

  fastify.decorate('db', db);
  fastify.decorate('pgClient', pgClient);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing database connection');
    await pgClient.end();
  });

  fastify.log.info('Database plugin initialized');
}

export default fp(databasePlugin, {
  name: 'database',
});
