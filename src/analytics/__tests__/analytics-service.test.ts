/**
 * Tests for the AnalyticsService (Sprint 13).
 * Validates outage history queries, category summaries, trend analysis,
 * service reliability, correlation detection, and percentile computations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClickHouseClient } from '../clickhouse-client.js';
import { AnalyticsService } from '../analytics-service.js';

function createOutageRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    outage_id: `outage-${Math.random().toString(36).slice(2, 8)}`,
    service_id: 'svc-001',
    service_slug: 'github',
    service_name: 'GitHub',
    category: 'devtools',
    state: 'RESOLVED',
    confidence: 0.95,
    started_at: new Date('2025-06-15T10:00:00Z').toISOString(),
    resolved_at: new Date('2025-06-15T10:30:00Z').toISOString(),
    duration_ms: 1800000,
    peak_reports_per_min: 150,
    affected_regions: ['us-east-1', 'eu-west-1'],
    detection_signals: ['statistical', 'social'],
    mttr: 1800000,
    mttd: 120000,
    ...overrides,
  };
}

describe('AnalyticsService', () => {
  let client: ClickHouseClient;
  let service: AnalyticsService;

  beforeEach(() => {
    client = new ClickHouseClient();
    client.setInMemoryMode(true);
    service = new AnalyticsService(client);
  });

  describe('getOutageHistory', () => {
    it('should return filtered results by service slug', async () => {
      await client.insert('outage_events', [
        createOutageRow({ service_slug: 'github', outage_id: 'o1' }),
        createOutageRow({ service_slug: 'aws', outage_id: 'o2' }),
        createOutageRow({ service_slug: 'github', outage_id: 'o3' }),
      ]);

      const results = await service.getOutageHistory({ serviceSlug: 'github' });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.serviceSlug === 'github')).toBe(true);
    });

    it('should return filtered results by category', async () => {
      await client.insert('outage_events', [
        createOutageRow({ category: 'devtools', outage_id: 'o1' }),
        createOutageRow({ category: 'cloud', outage_id: 'o2' }),
        createOutageRow({ category: 'devtools', outage_id: 'o3' }),
      ]);

      const results = await service.getOutageHistory({ category: 'devtools' });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.category === 'devtools')).toBe(true);
    });

    it('should return paginated results with limit and offset', async () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        createOutageRow({ outage_id: `o-${i}`, started_at: new Date(2025, 5, 15 + i).toISOString() }),
      );
      await client.insert('outage_events', rows);

      const page1 = await service.getOutageHistory({ limit: 3, offset: 0 });
      const page2 = await service.getOutageHistory({ limit: 3, offset: 3 });

      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
    });

    it('should filter by date range', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', started_at: '2025-01-15T10:00:00Z' }),
        createOutageRow({ outage_id: 'o2', started_at: '2025-06-15T10:00:00Z' }),
        createOutageRow({ outage_id: 'o3', started_at: '2025-12-15T10:00:00Z' }),
      ]);

      const results = await service.getOutageHistory({
        startDate: new Date('2025-05-01T00:00:00Z'),
        endDate: new Date('2025-08-01T00:00:00Z'),
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.outageId).toBe('o2');
    });

    it('should return empty array when no matches', async () => {
      const results = await service.getOutageHistory({ serviceSlug: 'nonexistent' });
      expect(results).toHaveLength(0);
    });

    it('should map all fields correctly', async () => {
      await client.insert('outage_events', [
        createOutageRow({
          outage_id: 'o-mapped',
          service_id: 'svc-test',
          service_slug: 'test-svc',
          service_name: 'Test Service',
          category: 'cloud',
          state: 'MAJOR_OUTAGE',
          confidence: 0.88,
          duration_ms: 5400000,
          peak_reports_per_min: 300,
          affected_regions: ['ap-southeast-1'],
          detection_signals: ['lstm'],
          mttr: 3600000,
          mttd: 60000,
        }),
      ]);

      const results = await service.getOutageHistory({ serviceSlug: 'test-svc' });

      expect(results).toHaveLength(1);
      const r = results[0]!;
      expect(r.outageId).toBe('o-mapped');
      expect(r.serviceId).toBe('svc-test');
      expect(r.serviceName).toBe('Test Service');
      expect(r.category).toBe('cloud');
      expect(r.state).toBe('MAJOR_OUTAGE');
      expect(r.confidence).toBe(0.88);
      expect(r.durationMs).toBe(5400000);
      expect(r.peakReportsPerMin).toBe(300);
      expect(r.mttr).toBe(3600000);
      expect(r.mttd).toBe(60000);
    });
  });

  describe('getCategorySummary', () => {
    it('should compute correct aggregate statistics', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', category: 'cloud', duration_ms: 1000, mttr: 500, mttd: 100, service_slug: 'aws' }),
        createOutageRow({ outage_id: 'o2', category: 'cloud', duration_ms: 3000, mttr: 1500, mttd: 300, service_slug: 'gcp' }),
        createOutageRow({ outage_id: 'o3', category: 'cloud', duration_ms: 2000, mttr: 1000, mttd: 200, service_slug: 'aws' }),
      ]);

      const summary = await service.getCategorySummary('cloud');

      expect(summary.category).toBe('cloud');
      expect(summary.totalOutages).toBe(3);
      expect(summary.avgDurationMs).toBe(2000);
      expect(summary.avgMttr).toBe(1000);
      expect(summary.avgMttd).toBe(200);
    });

    it('should identify top affected services', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', category: 'cloud', service_slug: 'aws', service_name: 'AWS' }),
        createOutageRow({ outage_id: 'o2', category: 'cloud', service_slug: 'aws', service_name: 'AWS' }),
        createOutageRow({ outage_id: 'o3', category: 'cloud', service_slug: 'gcp', service_name: 'GCP' }),
      ]);

      const summary = await service.getCategorySummary('cloud');

      expect(summary.topAffectedServices).toHaveLength(2);
      expect(summary.topAffectedServices[0]!.serviceSlug).toBe('aws');
      expect(summary.topAffectedServices[0]!.outageCount).toBe(2);
    });

    it('should compute monthly breakdown', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', category: 'cloud', started_at: '2025-01-15T10:00:00Z' }),
        createOutageRow({ outage_id: 'o2', category: 'cloud', started_at: '2025-01-20T10:00:00Z' }),
        createOutageRow({ outage_id: 'o3', category: 'cloud', started_at: '2025-03-10T10:00:00Z' }),
      ]);

      const summary = await service.getCategorySummary('cloud');

      expect(summary.outagesByMonth).toHaveLength(2);
      const jan = summary.outagesByMonth.find(m => m.month === '2025-01');
      const mar = summary.outagesByMonth.find(m => m.month === '2025-03');
      expect(jan?.count).toBe(2);
      expect(mar?.count).toBe(1);
    });

    it('should return empty summary for unknown category', async () => {
      const summary = await service.getCategorySummary('nonexistent');

      expect(summary.totalOutages).toBe(0);
      expect(summary.avgDurationMs).toBe(0);
      expect(summary.topAffectedServices).toHaveLength(0);
      expect(summary.outagesByMonth).toHaveLength(0);
    });
  });

  describe('getTrends', () => {
    it('should compute monthly trends correctly', async () => {
      const now = new Date();
      const twoMonthsAgo = new Date(now);
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      await client.insert('outage_events', [
        createOutageRow({
          outage_id: 'o1',
          started_at: twoMonthsAgo.toISOString(),
          category: 'cloud',
          state: 'RESOLVED',
          duration_ms: 1000,
        }),
        createOutageRow({
          outage_id: 'o2',
          started_at: oneMonthAgo.toISOString(),
          category: 'devtools',
          state: 'RESOLVED',
          duration_ms: 2000,
        }),
        createOutageRow({
          outage_id: 'o3',
          started_at: oneMonthAgo.toISOString(),
          category: 'cloud',
          state: 'MAJOR_OUTAGE',
          duration_ms: 3000,
        }),
      ]);

      const trends = await service.getTrends('monthly', 6);

      expect(trends.length).toBeGreaterThanOrEqual(1);
      // Verify structure
      for (const trend of trends) {
        expect(trend).toHaveProperty('period');
        expect(trend).toHaveProperty('totalOutages');
        expect(trend).toHaveProperty('avgDuration');
        expect(trend).toHaveProperty('serviceCount');
        expect(trend).toHaveProperty('byCategory');
        expect(trend).toHaveProperty('bySeverity');
      }
    });

    it('should return quarterly breakdown', async () => {
      const q1Date = new Date();
      q1Date.setMonth(q1Date.getMonth() - 3);

      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', started_at: q1Date.toISOString(), duration_ms: 1000 }),
        createOutageRow({ outage_id: 'o2', started_at: new Date().toISOString(), duration_ms: 2000 }),
      ]);

      const trends = await service.getTrends('quarterly', 12);

      expect(trends.length).toBeGreaterThanOrEqual(1);
      expect(trends[0]!.period).toMatch(/^\d{4}-Q\d$/);
    });

    it('should return empty array when no data', async () => {
      const trends = await service.getTrends('monthly', 1);
      expect(trends).toHaveLength(0);
    });
  });

  describe('getServiceReliability', () => {
    it('should rank services by uptime within category', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', category: 'cloud', service_slug: 'aws', service_name: 'AWS', duration_ms: 100000 }),
        createOutageRow({ outage_id: 'o2', category: 'cloud', service_slug: 'aws', service_name: 'AWS', duration_ms: 200000 }),
        createOutageRow({ outage_id: 'o3', category: 'cloud', service_slug: 'gcp', service_name: 'GCP', duration_ms: 50000 }),
      ]);

      const results = await service.getServiceReliability('cloud');

      expect(results).toHaveLength(2);
      // GCP should rank higher (less total downtime)
      expect(results[0]!.serviceSlug).toBe('gcp');
      expect(results[0]!.rank).toBe(1);
      expect(results[1]!.serviceSlug).toBe('aws');
      expect(results[1]!.rank).toBe(2);
    });

    it('should compute uptime percentage correctly', async () => {
      // 1 hour of downtime in a 30-day window
      const durationMs = 3600000;
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'test', service_name: 'Test', duration_ms: durationMs }),
      ]);

      const results = await service.getServiceReliability();

      expect(results).toHaveLength(1);
      const uptime = results[0]!.uptimePercent;
      // 1 hour out of 30 days = ~99.86%
      expect(uptime).toBeGreaterThan(99.8);
      expect(uptime).toBeLessThan(100);
    });

    it('should respect limit parameter', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'svc1', service_name: 'Service 1' }),
        createOutageRow({ outage_id: 'o2', service_slug: 'svc2', service_name: 'Service 2' }),
        createOutageRow({ outage_id: 'o3', service_slug: 'svc3', service_name: 'Service 3' }),
      ]);

      const results = await service.getServiceReliability(undefined, 2);

      expect(results).toHaveLength(2);
    });
  });

  describe('getCorrelations', () => {
    it('should find co-occurring outages within time window', async () => {
      const baseTime = new Date('2025-06-15T10:00:00Z');
      const nearTime = new Date('2025-06-15T10:10:00Z');
      const farTime = new Date('2025-06-15T18:00:00Z');

      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'github', started_at: baseTime.toISOString() }),
        createOutageRow({ outage_id: 'o2', service_slug: 'aws', started_at: nearTime.toISOString() }),
        createOutageRow({ outage_id: 'o3', service_slug: 'gcp', started_at: farTime.toISOString() }),
      ]);

      const correlations = await service.getCorrelations('github', 30 * 60 * 1000);

      expect(correlations.length).toBeGreaterThanOrEqual(1);
      const awsCorr = correlations.find(c => c.serviceB === 'aws');
      expect(awsCorr).toBeDefined();
      expect(awsCorr!.coOccurrences).toBe(1);
      expect(awsCorr!.correlationScore).toBeGreaterThan(0);

      // GCP should not correlate (too far apart)
      const gcpCorr = correlations.find(c => c.serviceB === 'gcp');
      expect(gcpCorr).toBeUndefined();
    });

    it('should return empty array when no outages found', async () => {
      const correlations = await service.getCorrelations('nonexistent');
      expect(correlations).toHaveLength(0);
    });

    it('should score higher for more co-occurrences', async () => {
      const t1 = new Date('2025-06-15T10:00:00Z');
      const t2 = new Date('2025-06-15T14:00:00Z');

      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'github', started_at: t1.toISOString() }),
        createOutageRow({ outage_id: 'o2', service_slug: 'github', started_at: t2.toISOString() }),
        createOutageRow({ outage_id: 'o3', service_slug: 'aws', started_at: new Date(t1.getTime() + 60000).toISOString() }),
        createOutageRow({ outage_id: 'o4', service_slug: 'aws', started_at: new Date(t2.getTime() + 60000).toISOString() }),
        createOutageRow({ outage_id: 'o5', service_slug: 'gcp', started_at: new Date(t1.getTime() + 60000).toISOString() }),
      ]);

      const correlations = await service.getCorrelations('github', 30 * 60 * 1000);

      const awsCorr = correlations.find(c => c.serviceB === 'aws');
      const gcpCorr = correlations.find(c => c.serviceB === 'gcp');

      expect(awsCorr).toBeDefined();
      expect(gcpCorr).toBeDefined();
      expect(awsCorr!.coOccurrences).toBe(2);
      expect(gcpCorr!.coOccurrences).toBe(1);
    });
  });

  describe('getMTTR', () => {
    it('should compute percentile metrics correctly', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'github', mttr: 1000 }),
        createOutageRow({ outage_id: 'o2', service_slug: 'github', mttr: 2000 }),
        createOutageRow({ outage_id: 'o3', service_slug: 'github', mttr: 3000 }),
        createOutageRow({ outage_id: 'o4', service_slug: 'github', mttr: 4000 }),
        createOutageRow({ outage_id: 'o5', service_slug: 'github', mttr: 10000 }),
      ]);

      const metrics = await service.getMTTR('github');

      expect(metrics.avg).toBe(4000);
      expect(metrics.p50).toBe(3000);
      expect(metrics.p95).toBeGreaterThanOrEqual(8000);
      expect(metrics.p99).toBeGreaterThanOrEqual(9000);
    });

    it('should return zeros for unknown service', async () => {
      const metrics = await service.getMTTR('nonexistent');

      expect(metrics.avg).toBe(0);
      expect(metrics.p50).toBe(0);
      expect(metrics.p95).toBe(0);
      expect(metrics.p99).toBe(0);
    });
  });

  describe('getMTTD', () => {
    it('should compute percentile metrics correctly', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'github', mttd: 500 }),
        createOutageRow({ outage_id: 'o2', service_slug: 'github', mttd: 1000 }),
        createOutageRow({ outage_id: 'o3', service_slug: 'github', mttd: 1500 }),
        createOutageRow({ outage_id: 'o4', service_slug: 'github', mttd: 2000 }),
      ]);

      const metrics = await service.getMTTD('github');

      expect(metrics.avg).toBe(1250);
      expect(metrics.p50).toBe(1250);
      expect(metrics.p95).toBeGreaterThan(1800);
    });

    it('should handle single data point', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'github', mttd: 42000 }),
      ]);

      const metrics = await service.getMTTD('github');

      expect(metrics.avg).toBe(42000);
      expect(metrics.p50).toBe(42000);
      expect(metrics.p95).toBe(42000);
      expect(metrics.p99).toBe(42000);
    });

    it('should exclude zero MTTD values from percentile calculation', async () => {
      await client.insert('outage_events', [
        createOutageRow({ outage_id: 'o1', service_slug: 'github', mttd: 0 }),
        createOutageRow({ outage_id: 'o2', service_slug: 'github', mttd: 1000 }),
        createOutageRow({ outage_id: 'o3', service_slug: 'github', mttd: 2000 }),
      ]);

      const metrics = await service.getMTTD('github');

      // Should only use the non-zero values
      expect(metrics.avg).toBe(1500);
    });
  });
});
