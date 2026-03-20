/**
 * Fastify plugin for KafkaJS producer.
 * Creates required topics on startup if they do not exist.
 */

import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Kafka, type Producer, type Admin, logLevel } from 'kafkajs';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    kafka: Kafka;
    kafkaProducer: Producer;
  }
}

interface TopicSpec {
  readonly topic: string;
  readonly numPartitions: number;
  readonly replicationFactor: number;
}

const REQUIRED_TOPICS: readonly TopicSpec[] = [
  { topic: 'reports.raw', numPartitions: 32, replicationFactor: 1 },
  { topic: 'reports.enriched', numPartitions: 32, replicationFactor: 1 },
  { topic: 'detections.raw', numPartitions: 16, replicationFactor: 1 },
  { topic: 'notifications.outage_state_change', numPartitions: 8, replicationFactor: 1 },
];

async function ensureTopics(admin: Admin, logger: FastifyInstance['log']): Promise<void> {
  const existingTopics = await admin.listTopics();
  const missingTopics = REQUIRED_TOPICS.filter((t) => !existingTopics.includes(t.topic));

  if (missingTopics.length > 0) {
    logger.info({ topics: missingTopics.map((t) => t.topic) }, 'Creating missing Kafka topics');
    await admin.createTopics({
      waitForLeaders: true,
      topics: missingTopics.map((t) => ({
        topic: t.topic,
        numPartitions: t.numPartitions,
        replicationFactor: t.replicationFactor,
      })),
    });
    logger.info('Kafka topics created');
  } else {
    logger.info('All required Kafka topics already exist');
  }
}

async function kafkaPlugin(fastify: FastifyInstance): Promise<void> {
  const kafka = new Kafka({
    clientId: 'openpulse-api',
    brokers: config.kafkaBrokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  });

  const producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: true,
    maxInFlightRequests: 5,
  });

  const admin = kafka.admin();

  try {
    await admin.connect();
    await ensureTopics(admin, fastify.log);
    await admin.disconnect();
  } catch (err) {
    fastify.log.warn({ err }, 'Kafka: failed to ensure topics (non-fatal, will retry on produce)');
  }

  await producer.connect();
  fastify.log.info('Kafka producer connected');

  fastify.decorate('kafka', kafka);
  fastify.decorate('kafkaProducer', producer);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting Kafka producer');
    await producer.disconnect();
  });

  fastify.log.info('Kafka plugin initialized');
}

export default fp(kafkaPlugin, {
  name: 'kafka',
});
