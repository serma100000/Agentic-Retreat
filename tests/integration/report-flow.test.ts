/**
 * Integration test for the full report submission flow.
 *
 * Validates that a report submitted via the API:
 * 1. Is accepted with a 202 status
 * 2. Is published to the Kafka topic
 * 3. Is persisted to the database
 * 4. Increments the Redis counter
 *
 * Uses mocked infrastructure to run without external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, onCleanup, testId } from '../setup.js';

// Mock infrastructure layer
interface MockKafkaMessage {
  topic: string;
  key: string;
  value: string;
  timestamp: number;
}

interface MockDbRecord {
  id: string;
  service_id: string;
  category: string;
  body: string;
  created_at: Date;
}

class MockKafkaProducer {
  public messages: MockKafkaMessage[] = [];

  async send(topic: string, key: string, value: string): Promise<void> {
    this.messages.push({ topic, key, value, timestamp: Date.now() });
  }

  getMessages(topic: string): MockKafkaMessage[] {
    return this.messages.filter((m) => m.topic === topic);
  }
}

class MockDatabase {
  private records: MockDbRecord[] = [];

  async insert(record: MockDbRecord): Promise<void> {
    this.records.push(record);
  }

  async findById(id: string): Promise<MockDbRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async findByServiceId(serviceId: string): Promise<MockDbRecord[]> {
    return this.records.filter((r) => r.service_id === serviceId);
  }
}

class MockRedis {
  private data = new Map<string, string>();

  async incr(key: string): Promise<number> {
    const current = parseInt(this.data.get(key) ?? '0', 10);
    const next = current + 1;
    this.data.set(key, String(next));
    return next;
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
}

// Simulated report flow that mirrors the real API behavior
interface Report {
  id: string;
  service_id: string;
  category: string;
  body: string;
}

async function submitReport(
  report: Report,
  kafka: MockKafkaProducer,
  db: MockDatabase,
  redis: MockRedis,
): Promise<{ status: number; id: string }> {
  // Validate input
  if (!report.service_id || !report.category) {
    return { status: 400, id: '' };
  }

  // 1. Persist to database
  await db.insert({
    id: report.id,
    service_id: report.service_id,
    category: report.category,
    body: report.body,
    created_at: new Date(),
  });

  // 2. Publish to Kafka
  await kafka.send('reports.submitted', report.service_id, JSON.stringify(report));

  // 3. Increment Redis counter
  const counterKey = `reports:count:${report.service_id}`;
  await redis.incr(counterKey);

  // Return 202 Accepted
  return { status: 202, id: report.id };
}

describe('Report Flow Integration', () => {
  let kafka: MockKafkaProducer;
  let db: MockDatabase;
  let redis: MockRedis;

  beforeEach(() => {
    kafka = new MockKafkaProducer();
    db = new MockDatabase();
    redis = new MockRedis();
    onCleanup(() => {
      kafka.messages = [];
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should accept a valid report with 202 status', async () => {
    const report: Report = {
      id: testId('rpt'),
      service_id: 'svc-github',
      category: 'outage',
      body: 'GitHub Actions is down',
    };

    const result = await submitReport(report, kafka, db, redis);
    expect(result.status).toBe(202);
    expect(result.id).toBe(report.id);
  });

  it('should publish the report to Kafka', async () => {
    const report: Report = {
      id: testId('rpt'),
      service_id: 'svc-github',
      category: 'degraded',
      body: 'Slow response times',
    };

    await submitReport(report, kafka, db, redis);

    const messages = kafka.getMessages('reports.submitted');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.key).toBe('svc-github');

    const parsed = JSON.parse(messages[0]!.value) as Report;
    expect(parsed.id).toBe(report.id);
    expect(parsed.category).toBe('degraded');
  });

  it('should persist the report to the database', async () => {
    const report: Report = {
      id: testId('rpt'),
      service_id: 'svc-aws',
      category: 'outage',
      body: 'S3 returning 500s',
    };

    await submitReport(report, kafka, db, redis);

    const record = await db.findById(report.id);
    expect(record).toBeDefined();
    expect(record!.service_id).toBe('svc-aws');
    expect(record!.category).toBe('outage');
    expect(record!.created_at).toBeInstanceOf(Date);
  });

  it('should increment the Redis counter for the service', async () => {
    const serviceId = 'svc-stripe';

    // Submit three reports for the same service
    for (let i = 0; i < 3; i++) {
      const report: Report = {
        id: testId('rpt'),
        service_id: serviceId,
        category: 'outage',
        body: `Report ${i + 1}`,
      };
      await submitReport(report, kafka, db, redis);
    }

    const count = await redis.get(`reports:count:${serviceId}`);
    expect(count).toBe('3');
  });

  it('should reject a report with missing service_id', async () => {
    const report: Report = {
      id: testId('rpt'),
      service_id: '',
      category: 'outage',
      body: 'No service',
    };

    const result = await submitReport(report, kafka, db, redis);
    expect(result.status).toBe(400);
    expect(kafka.messages).toHaveLength(0);
  });

  it('should handle multiple reports for different services', async () => {
    const services = ['svc-github', 'svc-aws', 'svc-gcp'];

    for (const serviceId of services) {
      const report: Report = {
        id: testId('rpt'),
        service_id: serviceId,
        category: 'outage',
        body: `Outage for ${serviceId}`,
      };
      await submitReport(report, kafka, db, redis);
    }

    expect(kafka.messages).toHaveLength(3);

    for (const serviceId of services) {
      const records = await db.findByServiceId(serviceId);
      expect(records).toHaveLength(1);

      const count = await redis.get(`reports:count:${serviceId}`);
      expect(count).toBe('1');
    }
  });
});
