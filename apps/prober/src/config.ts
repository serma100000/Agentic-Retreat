/**
 * Prober configuration.
 *
 * Reads from environment variables with sensible defaults
 * for local development.
 */

export interface ProberConfig {
  /** OpenPulse API base URL for fetching the service catalog. */
  apiUrl: string;
  /** Comma-separated Kafka broker addresses. */
  kafkaBrokers: string[];
  /** Redis connection URL. */
  redisUrl: string;
  /** Default probe interval in milliseconds. */
  probeIntervalMs: number;
  /** Region identifier for this prober instance. */
  region: string;
  /** Maximum number of concurrent probes. */
  concurrency: number;
  /** Kafka topic for publishing probe results. */
  kafkaTopic: string;
  /** Kafka client ID. */
  kafkaClientId: string;
  /** HTTP request timeout for probes in milliseconds. */
  probeTimeoutMs: number;
  /** Interval to refresh the service catalog in milliseconds. */
  catalogRefreshMs: number;
  /** Adaptive probe interval during suspected outages (ms). */
  outageIntervalMs: number;
  /** Redis key prefix for outage flags. */
  redisOutagePrefix: string;
}

export function loadConfig(): ProberConfig {
  const kafkaBrokersRaw = process.env['KAFKA_BROKERS'] ?? 'localhost:9092';

  return {
    apiUrl: process.env['API_URL'] ?? 'http://localhost:3001',
    kafkaBrokers: kafkaBrokersRaw.split(',').map((b) => b.trim()),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    probeIntervalMs: parseInt(process.env['PROBE_INTERVAL_MS'] ?? '30000', 10),
    region: process.env['REGION'] ?? 'us-east',
    concurrency: parseInt(process.env['CONCURRENCY'] ?? '50', 10),
    kafkaTopic: process.env['KAFKA_TOPIC'] ?? 'probes.results',
    kafkaClientId: process.env['KAFKA_CLIENT_ID'] ?? 'openpulse-prober',
    probeTimeoutMs: parseInt(process.env['PROBE_TIMEOUT_MS'] ?? '10000', 10),
    catalogRefreshMs: parseInt(process.env['CATALOG_REFRESH_MS'] ?? '60000', 10),
    outageIntervalMs: parseInt(process.env['OUTAGE_INTERVAL_MS'] ?? '10000', 10),
    redisOutagePrefix: process.env['REDIS_OUTAGE_PREFIX'] ?? 'outage:suspected:',
  };
}
