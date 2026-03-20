/**
 * Global test setup for OpenPulse.
 *
 * Provides shared configuration, mock factories, and cleanup
 * utilities used across unit, integration, and e2e tests.
 */

export const TEST_CONFIG = {
  /** Test database URL (SQLite in-memory for unit tests). */
  databaseUrl: process.env['TEST_DATABASE_URL'] ?? 'postgresql://test:test@localhost:5432/openpulse_test',
  /** Test Redis URL. */
  redisUrl: process.env['TEST_REDIS_URL'] ?? 'redis://localhost:6379/1',
  /** Test Kafka brokers. */
  kafkaBrokers: (process.env['TEST_KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
  /** Test API base URL. */
  apiUrl: process.env['TEST_API_URL'] ?? 'http://localhost:3001',
  /** Default test timeout in ms. */
  defaultTimeoutMs: 30_000,
} as const;

/**
 * Create a unique test identifier to isolate test runs.
 */
export function testId(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Sleep utility for tests that need to wait for async operations.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collect items from an async iterable with a timeout.
 */
export async function collectWithTimeout<T>(
  iterable: AsyncIterable<T>,
  maxItems: number,
  timeoutMs: number,
): Promise<T[]> {
  const items: T[] = [];
  const deadline = Date.now() + timeoutMs;

  for await (const item of iterable) {
    items.push(item);
    if (items.length >= maxItems || Date.now() >= deadline) break;
  }

  return items;
}

/**
 * Registry for cleanup callbacks. Call `cleanup()` in afterAll/afterEach.
 */
const cleanupCallbacks: Array<() => Promise<void> | void> = [];

export function onCleanup(fn: () => Promise<void> | void): void {
  cleanupCallbacks.push(fn);
}

export async function cleanup(): Promise<void> {
  const callbacks = cleanupCallbacks.splice(0);
  for (const fn of callbacks.reverse()) {
    try {
      await fn();
    } catch {
      // Swallow cleanup errors in tests
    }
  }
}

/**
 * Create a mock Kafka message for testing consumers.
 */
export function mockKafkaMessage(
  topic: string,
  key: string,
  value: unknown,
): {
  topic: string;
  partition: number;
  message: {
    key: Buffer;
    value: Buffer;
    timestamp: string;
    offset: string;
    headers: Record<string, Buffer>;
  };
} {
  return {
    topic,
    partition: 0,
    message: {
      key: Buffer.from(key),
      value: Buffer.from(JSON.stringify(value)),
      timestamp: Date.now().toString(),
      offset: '0',
      headers: {},
    },
  };
}

/**
 * Wait for a condition to become true, with polling.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  pollMs = 100,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(pollMs);
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
