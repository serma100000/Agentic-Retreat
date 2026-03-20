/**
 * Kafka consumer for raw reports.
 * Reads from reports.raw, persists to TimescaleDB, increments Redis counters,
 * and publishes enriched reports to reports.enriched.
 *
 * Runs as a separate process: `pnpm run consumer`
 */

import { Kafka, logLevel } from 'kafkajs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Redis } from 'ioredis';
import { reports } from '@openpulse/db/schema';
import { loadConfig } from '../config.js';
import pino from 'pino';

const config = loadConfig();
const logger = pino({
  level: config.logLevel,
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

interface RawReportMessage {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceSlug: string;
  readonly reportType: string;
  readonly source: string;
  readonly fingerprint: string;
  readonly ipHash: string;
  readonly geo: {
    readonly country: string | null;
    readonly region: string | null;
    readonly city: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
  };
  readonly timestamp: string;
}

async function main(): Promise<void> {
  logger.info('Starting report consumer');

  const pgClient = postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 30,
  });
  const db = drizzle(pgClient);

  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
  });

  const kafka = new Kafka({
    clientId: 'openpulse-report-consumer',
    brokers: config.kafkaBrokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  });

  const consumer = kafka.consumer({
    groupId: 'report-processor',
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  const producer = kafka.producer({
    allowAutoTopicCreation: false,
  });

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: 'reports.raw', fromBeginning: false });

  logger.info('Report consumer connected and subscribed');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        logger.warn({ topic, partition }, 'Received empty message');
        return;
      }

      let report: RawReportMessage;
      try {
        report = JSON.parse(message.value.toString()) as RawReportMessage;
      } catch (err) {
        logger.error({ err, topic, partition }, 'Failed to parse message');
        return;
      }

      try {
        // 1. Persist to TimescaleDB
        await db.insert(reports).values({
          id: report.id,
          serviceId: report.serviceId,
          reportType: report.reportType,
          regionCode: report.geo.region,
          city: report.geo.city,
          latitude: report.geo.latitude?.toString() ?? null,
          longitude: report.geo.longitude?.toString() ?? null,
          deviceFingerprintHash: report.fingerprint,
          source: report.source,
        });

        // 2. Increment Redis counters
        const minuteBucket = Math.floor(Date.now() / 60000);
        const counterKey = `report_count:${report.serviceId}:${minuteBucket}`;
        const pipeline = redis.pipeline();
        pipeline.incr(counterKey);
        pipeline.expire(counterKey, 86400);
        await pipeline.exec();

        // 3. Publish enriched report
        const enrichedReport = {
          ...report,
          processedAt: new Date().toISOString(),
          persisted: true,
        };

        await producer.send({
          topic: 'reports.enriched',
          messages: [
            {
              key: report.serviceId,
              value: JSON.stringify(enrichedReport),
              headers: {
                source: report.source,
                report_type: report.reportType,
                service_slug: report.serviceSlug,
              },
            },
          ],
        });

        logger.debug(
          { reportId: report.id, serviceSlug: report.serviceSlug },
          'Report processed successfully',
        );
      } catch (err) {
        logger.error(
          { err, reportId: report.id },
          'Failed to process report',
        );
      }
    },
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down report consumer');
    await consumer.disconnect();
    await producer.disconnect();
    await redis.quit();
    await pgClient.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Report consumer failed to start');
  process.exit(1);
});
