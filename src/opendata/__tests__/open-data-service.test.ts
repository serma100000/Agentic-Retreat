/**
 * Tests for the OpenDataService (Sprint 19).
 * Validates filtered/paginated outage queries, reliability stats computation,
 * trend aggregation, export generation, and rate limit tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenDataService, InMemoryOutageStore } from '../open-data-service.js';
import type { RawOutageRecord, DeveloperKey } from '../types.js';

function createRawOutage(overrides: Partial<RawOutageRecord> = {}): RawOutageRecord {
  return {
    outageId: `outage-${Math.random().toString(36).slice(2, 8)}`,
    serviceId: 'svc-001',
    serviceSlug: 'github',
    serviceName: 'GitHub',
    category: 'devtools',
    state: 'RESOLVED',
    confidence: 0.95,
    startedAt: new Date('2025-06-15T10:00:00Z'),
    resolvedAt: new Date('2025-06-15T10:30:00Z'),
    durationMs: 1800000,
    peakReportsPerMin: 150,
    city: 'New York',
    region: 'NY',
    country: 'US',
    detectionSignals: ['statistical', 'social'],
    ...overrides,
  };
}

describe('OpenDataService', () => {
  let store: InMemoryOutageStore;
  let service: OpenDataService;

  beforeEach(() => {
    store = new InMemoryOutageStore();
    service = new OpenDataService(store);
  });

  describe('getOutages', () => {
    it('should return anonymized outages with pagination metadata', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1' }),
        createRawOutage({ outageId: 'o2' }),
        createRawOutage({ outageId: 'o3' }),
      ]);

      const result = await service.getOutages({ limit: 2, offset: 0 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(0);
    });

    it('should filter outages by service slug', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1', serviceSlug: 'github' }),
        createRawOutage({ outageId: 'o2', serviceSlug: 'aws' }),
        createRawOutage({ outageId: 'o3', serviceSlug: 'github' }),
      ]);

      const result = await service.getOutages({ serviceSlug: 'github' });

      expect(result.data).toHaveLength(2);
      expect(result.data.every(o => o.serviceSlug === 'github')).toBe(true);
    });

    it('should filter outages by category', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1', category: 'devtools' }),
        createRawOutage({ outageId: 'o2', category: 'cloud' }),
      ]);

      const result = await service.getOutages({ category: 'cloud' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.category).toBe('cloud');
    });

    it('should filter outages by date range', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1', startedAt: new Date('2025-06-10T10:00:00Z') }),
        createRawOutage({ outageId: 'o2', startedAt: new Date('2025-06-15T10:00:00Z') }),
        createRawOutage({ outageId: 'o3', startedAt: new Date('2025-06-20T10:00:00Z') }),
      ]);

      const result = await service.getOutages({
        startDate: new Date('2025-06-12T00:00:00Z'),
        endDate: new Date('2025-06-18T00:00:00Z'),
      });

      expect(result.data).toHaveLength(1);
    });

    it('should return anonymized data without PII fields', async () => {
      store.insert([
        createRawOutage({
          outageId: 'o1',
          reporterEmail: 'secret@corp.com',
          reporterIp: '10.0.0.5',
          deviceId: 'device-abc',
        }),
      ]);

      const result = await service.getOutages({});
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('secret@corp.com');
      expect(serialized).not.toContain('10.0.0.5');
      expect(serialized).not.toContain('device-abc');
    });

    it('should handle pagination with offset', async () => {
      store.insert(
        Array.from({ length: 10 }, (_, i) =>
          createRawOutage({
            outageId: `o-${i}`,
            startedAt: new Date(2025, 5, 15 + i),
          }),
        ),
      );

      const page1 = await service.getOutages({ limit: 3, offset: 0 });
      const page2 = await service.getOutages({ limit: 3, offset: 3 });

      expect(page1.data).toHaveLength(3);
      expect(page2.data).toHaveLength(3);
      // Ensure different records
      const ids1 = new Set(page1.data.map(d => d.id));
      const ids2 = new Set(page2.data.map(d => d.id));
      for (const id of ids2) {
        expect(ids1.has(id)).toBe(false);
      }
    });
  });

  describe('getServiceReliability', () => {
    it('should return 100% uptime for a service with no outages', async () => {
      const reliability = await service.getServiceReliability('no-outages');

      expect(reliability.uptimePercent).toBe(100);
      expect(reliability.totalOutages).toBe(0);
      expect(reliability.mttrMs).toBe(0);
    });

    it('should compute correct uptime percentage', async () => {
      // 1 outage of 30 minutes in a 24-hour period
      const start = new Date('2025-06-15T00:00:00Z');
      const end = new Date('2025-06-16T00:00:00Z');
      store.insert([
        createRawOutage({
          outageId: 'o1',
          serviceSlug: 'test-svc',
          startedAt: start,
          resolvedAt: end,
          durationMs: 1800000, // 30 minutes
        }),
      ]);

      const reliability = await service.getServiceReliability('test-svc');

      expect(reliability.totalOutages).toBe(1);
      expect(reliability.uptimePercent).toBeLessThan(100);
    });

    it('should compute mean time to resolve', async () => {
      store.insert([
        createRawOutage({
          outageId: 'o1',
          serviceSlug: 'svc',
          durationMs: 600000,
          resolvedAt: new Date('2025-06-15T10:10:00Z'),
        }),
        createRawOutage({
          outageId: 'o2',
          serviceSlug: 'svc',
          durationMs: 1200000,
          startedAt: new Date('2025-06-16T10:00:00Z'),
          resolvedAt: new Date('2025-06-16T10:20:00Z'),
        }),
      ]);

      const reliability = await service.getServiceReliability('svc');

      expect(reliability.mttrMs).toBe(900000); // avg of 600k and 1200k
    });

    it('should compute outages per month', async () => {
      const baseDate = new Date('2025-01-15T10:00:00Z');
      store.insert(
        Array.from({ length: 6 }, (_, i) =>
          createRawOutage({
            outageId: `o-${i}`,
            serviceSlug: 'monthly-svc',
            startedAt: new Date(baseDate.getTime() + i * 30 * 24 * 60 * 60 * 1000),
            resolvedAt: new Date(baseDate.getTime() + i * 30 * 24 * 60 * 60 * 1000 + 3600000),
            durationMs: 3600000,
          }),
        ),
      );

      const reliability = await service.getServiceReliability('monthly-svc');

      expect(reliability.totalOutages).toBe(6);
      expect(reliability.outagesPerMonth).toBeGreaterThan(0);
    });
  });

  describe('getTrends', () => {
    it('should aggregate outages into monthly trends', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1', startedAt: new Date('2025-06-10T10:00:00Z') }),
        createRawOutage({ outageId: 'o2', startedAt: new Date('2025-06-20T10:00:00Z') }),
        createRawOutage({ outageId: 'o3', startedAt: new Date('2025-07-15T10:00:00Z') }),
      ]);

      const trends = await service.getTrends('monthly');

      expect(trends.length).toBeGreaterThanOrEqual(2);
      const juneTrend = trends.find(t => t.period === '2025-06');
      expect(juneTrend).toBeDefined();
      expect(juneTrend!.totalOutages).toBe(2);
    });

    it('should aggregate outages into daily trends', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1', startedAt: new Date('2025-06-15T10:00:00Z') }),
        createRawOutage({ outageId: 'o2', startedAt: new Date('2025-06-15T14:00:00Z') }),
        createRawOutage({ outageId: 'o3', startedAt: new Date('2025-06-16T10:00:00Z') }),
      ]);

      const trends = await service.getTrends('daily');

      const june15 = trends.find(t => t.period === '2025-06-15');
      expect(june15).toBeDefined();
      expect(june15!.totalOutages).toBe(2);
    });

    it('should include category breakdown in trends', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1', category: 'devtools' }),
        createRawOutage({ outageId: 'o2', category: 'cloud' }),
        createRawOutage({ outageId: 'o3', category: 'devtools' }),
      ]);

      const trends = await service.getTrends('monthly');

      expect(trends.length).toBeGreaterThanOrEqual(1);
      expect(trends[0]!.byCategory['devtools']).toBe(2);
      expect(trends[0]!.byCategory['cloud']).toBe(1);
    });

    it('should return empty array for no data', async () => {
      const trends = await service.getTrends('monthly');
      expect(trends).toEqual([]);
    });
  });

  describe('getExport', () => {
    it('should generate JSON export with license', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1' }),
      ]);

      const result = await service.getExport('json', {});
      const parsed = JSON.parse(result);

      expect(parsed.license.identifier).toBe('CC-BY-4.0');
      expect(parsed.data).toHaveLength(1);
    });

    it('should generate CSV export with headers', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1' }),
      ]);

      const result = await service.getExport('csv', {});
      const lines = result.split('\n');

      expect(lines[0]).toContain('License: CC-BY-4.0');
      expect(lines[1]).toContain('id,serviceSlug');
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('should generate Parquet export with columnar structure', async () => {
      store.insert([
        createRawOutage({ outageId: 'o1' }),
      ]);

      const result = await service.getExport('parquet', {});
      const parsed = JSON.parse(result);

      expect(parsed.format).toBe('columnar');
      expect(parsed.columns).toBeDefined();
      expect(parsed.rowCount).toBe(1);
    });
  });

  describe('getDailyQuotaUsage', () => {
    it('should return zero usage for new key', () => {
      const usage = service.getDailyQuotaUsage('new-key');

      expect(usage.used).toBe(0);
      expect(usage.tier).toBe('free');
      expect(usage.limit).toBe(1000);
      expect(usage.remaining).toBe(1000);
    });

    it('should track requests and decrement remaining', () => {
      service.trackRequest('test-key');
      service.trackRequest('test-key');
      service.trackRequest('test-key');

      const usage = service.getDailyQuotaUsage('test-key');

      expect(usage.used).toBe(3);
      expect(usage.remaining).toBe(997);
    });

    it('should apply registered tier limits for registered keys', () => {
      const devKey: DeveloperKey = {
        key: 'reg-key',
        name: 'Test Developer',
        tier: 'registered',
        createdAt: new Date(),
        lastUsedAt: null,
        dailyUsage: 0,
        isActive: true,
      };
      service.registerKey(devKey);

      const usage = service.getDailyQuotaUsage('reg-key');

      expect(usage.tier).toBe('registered');
      expect(usage.limit).toBe(10000);
    });

    it('should reject requests when quota is exhausted', () => {
      // Fill up free tier quota
      for (let i = 0; i < 1000; i++) {
        service.trackRequest('exhausted-key');
      }

      const allowed = service.trackRequest('exhausted-key');
      expect(allowed).toBe(false);

      const usage = service.getDailyQuotaUsage('exhausted-key');
      expect(usage.remaining).toBe(0);
    });
  });
});
