/**
 * OpenPulse Active Prober -- entry point.
 *
 * Loads the service catalog from the API, initialises Kafka and Redis
 * connections, registers probes with the scheduler, and runs until
 * a termination signal is received.
 */

import { Kafka, logLevel } from 'kafkajs';
import Redis from 'ioredis';
import pino from 'pino';
import { loadConfig, type ProberConfig } from './config.js';
import { ProbeScheduler } from './probes/probe-scheduler.js';
import type { ProbeConfig, ServiceCatalogEntry, ServiceCatalogResponse } from './probes/types.js';
import { ProbeType } from './probes/types.js';

const logger = pino({ name: 'openpulse-prober' });

/**
 * Fetch the service catalog from the OpenPulse API.
 */
async function fetchServiceCatalog(apiUrl: string): Promise<ServiceCatalogEntry[]> {
  const url = `${apiUrl}/api/v1/services?limit=500`;
  logger.info({ url }, 'Fetching service catalog');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch service catalog: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as ServiceCatalogResponse;
  logger.info({ count: body.data.length, total: body.total }, 'Service catalog loaded');
  return body.data;
}

/**
 * Convert a catalog entry to a probe config.
 */
function catalogEntryToProbeConfig(
  entry: ServiceCatalogEntry,
  defaults: ProberConfig,
): ProbeConfig {
  let probeType = entry.probe_type ?? ProbeType.HTTP;

  // Auto-detect HTTPS from URL
  if (probeType === ProbeType.HTTP && entry.url.startsWith('https://')) {
    probeType = ProbeType.HTTPS;
  }

  return {
    service_id: entry.id,
    service_name: entry.name,
    probe_type: probeType,
    target: entry.url,
    port: entry.port,
    interval_ms: entry.probe_interval_ms ?? defaults.probeIntervalMs,
    timeout_ms: entry.probe_timeout_ms ?? defaults.probeTimeoutMs,
    expected_status: entry.expected_status,
    headers: entry.headers,
    dns_servers: entry.dns_servers,
  };
}

/**
 * Main prober loop.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  logger.info({ region: config.region, concurrency: config.concurrency }, 'Starting OpenPulse Prober');

  // Initialise Kafka
  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 5,
    },
  });

  // Initialise Redis
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  try {
    await redis.connect();
    logger.info('Connected to Redis');
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      'Redis connection failed -- running without adaptive intervals',
    );
  }

  // Create scheduler
  const scheduler = new ProbeScheduler(kafka, redis, config);

  // Load service catalog and register probes
  async function refreshCatalog(): Promise<void> {
    try {
      const entries = await fetchServiceCatalog(config.apiUrl);
      const probeConfigs = entries.map((entry) => catalogEntryToProbeConfig(entry, config));
      scheduler.clearProbes();
      scheduler.registerProbes(probeConfigs);
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to refresh service catalog',
      );
    }
  }

  await refreshCatalog();

  // Periodically refresh the catalog
  const catalogRefreshTimer = setInterval(() => {
    void refreshCatalog();
  }, config.catalogRefreshMs);

  // Start scheduling probes
  await scheduler.start();

  // Graceful shutdown
  let shutdownInProgress = false;
  async function shutdown(signal: string): Promise<void> {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    logger.info({ signal }, 'Shutting down prober');
    clearInterval(catalogRefreshTimer);

    try {
      await scheduler.stop();
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Error stopping scheduler');
    }

    try {
      await redis.quit();
    } catch {
      // Ignore Redis disconnect errors
    }

    logger.info('Prober shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.info('Prober running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  logger.fatal({ error: err instanceof Error ? err.message : String(err) }, 'Prober failed to start');
  process.exit(1);
});
