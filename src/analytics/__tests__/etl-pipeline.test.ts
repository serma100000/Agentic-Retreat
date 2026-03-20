/**
 * Tests for the ETL Pipeline (Sprint 13).
 * Validates event transformation, batch inserts, deduplication,
 * and aggregate computation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClickHouseClient } from '../clickhouse-client.js';
import { ETLPipeline } from '../etl-pipeline.js';
import type { ETLEvent } from '../types.js';

function createOutageEvent(overrides: Partial<Record<string, unknown>> = {}): ETLEvent {
  return {
    type: 'outage',
    data: {
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
      affectedRegions: ['us-east-1', 'eu-west-1'],
      detectionSignals: ['statistical', 'social'],
      mttr: 1800000,
      mttd: 120000,
      ...overrides,
    },
    timestamp: new Date('2025-06-15T10:35:00Z'),
  };
}

describe('ETLPipeline', () => {
  let client: ClickHouseClient;
  let pipeline: ETLPipeline;

  beforeEach(() => {
    client = new ClickHouseClient();
    client.setInMemoryMode(true);
    pipeline = new ETLPipeline(client);
  });

  describe('processOutageEvent', () => {
    it('should transform and insert outage event correctly', async () => {
      const event = createOutageEvent({ outageId: 'outage-001' });

      await pipeline.processOutageEvent(event);
      await pipeline.flush();

      const rows = client.getInMemoryTable('outage_events');
      expect(rows).toHaveLength(1);
      expect(rows[0]!['outage_id']).toBe('outage-001');
      expect(rows[0]!['service_slug']).toBe('github');
      expect(rows[0]!['category']).toBe('devtools');
      expect(rows[0]!['duration_ms']).toBe(1800000);
    });

    it('should map camelCase to snake_case fields', async () => {
      const event = createOutageEvent({
        outageId: 'outage-mapping',
        serviceId: 'svc-map',
        serviceName: 'Mapping Test',
        peakReportsPerMin: 250,
        affectedRegions: ['us-west-2'],
        detectionSignals: ['cusum'],
      });

      await pipeline.processOutageEvent(event);
      await pipeline.flush();

      const rows = client.getInMemoryTable('outage_events');
      expect(rows).toHaveLength(1);
      expect(rows[0]!['service_id']).toBe('svc-map');
      expect(rows[0]!['service_name']).toBe('Mapping Test');
      expect(rows[0]!['peak_reports_per_min']).toBe(250);
    });

    it('should throw if outageId is missing', async () => {
      const event = createOutageEvent();
      delete event.data['outageId'];

      await expect(pipeline.processOutageEvent(event)).rejects.toThrow('missing outageId');
    });
  });

  describe('deduplication', () => {
    it('should prevent duplicate inserts for same outage_id', async () => {
      const event1 = createOutageEvent({ outageId: 'dup-001' });
      const event2 = createOutageEvent({ outageId: 'dup-001' });

      await pipeline.processOutageEvent(event1);
      await pipeline.processOutageEvent(event2);
      await pipeline.flush();

      const rows = client.getInMemoryTable('outage_events');
      expect(rows).toHaveLength(1);
    });

    it('should allow different outage_ids', async () => {
      const event1 = createOutageEvent({ outageId: 'unique-001' });
      const event2 = createOutageEvent({ outageId: 'unique-002' });

      await pipeline.processOutageEvent(event1);
      await pipeline.processOutageEvent(event2);
      await pipeline.flush();

      const rows = client.getInMemoryTable('outage_events');
      expect(rows).toHaveLength(2);
    });

    it('should track processed count', async () => {
      await pipeline.processOutageEvent(createOutageEvent({ outageId: 'cnt-001' }));
      await pipeline.processOutageEvent(createOutageEvent({ outageId: 'cnt-002' }));
      await pipeline.processOutageEvent(createOutageEvent({ outageId: 'cnt-001' })); // dup

      expect(pipeline.getProcessedCount()).toBe(2);
    });
  });

  describe('batch insert', () => {
    it('should buffer events until flush', async () => {
      await pipeline.processOutageEvent(createOutageEvent({ outageId: 'buf-001' }));
      await pipeline.processOutageEvent(createOutageEvent({ outageId: 'buf-002' }));

      // Before flush, in-memory table should be empty
      expect(pipeline.getBufferSize()).toBe(2);

      await pipeline.flush();

      expect(pipeline.getBufferSize()).toBe(0);
      const rows = client.getInMemoryTable('outage_events');
      expect(rows).toHaveLength(2);
    });

    it('should handle empty flush gracefully', async () => {
      await expect(pipeline.flush()).resolves.not.toThrow();
    });
  });

  describe('processReportAggregate', () => {
    it('should transform and insert report aggregate correctly', async () => {
      const event: ETLEvent = {
        type: 'report_aggregate',
        data: {
          serviceId: 'svc-001',
          serviceSlug: 'github',
          reportCount: 42,
          uniqueReporters: 35,
          avgSeverity: 0.8,
          regions: ['us-east-1'],
        },
        timestamp: new Date('2025-06-15T10:05:00Z'),
      };

      await pipeline.processReportAggregate(event);
      await pipeline.flush();

      const rows = client.getInMemoryTable('report_aggregates');
      expect(rows).toHaveLength(1);
      expect(rows[0]!['report_count']).toBe(42);
      expect(rows[0]!['unique_reporters']).toBe(35);
      expect(rows[0]!['avg_severity']).toBe(0.8);
    });
  });

  describe('processProbeAggregate', () => {
    it('should transform and insert probe aggregate correctly', async () => {
      const event: ETLEvent = {
        type: 'probe_aggregate',
        data: {
          serviceId: 'svc-001',
          serviceSlug: 'github',
          region: 'us-east-1',
          probeCount: 60,
          successCount: 55,
          avgLatencyMs: 120.5,
          p95LatencyMs: 250.0,
          p99LatencyMs: 500.0,
          errorCount: 5,
        },
        timestamp: new Date('2025-06-15T10:05:00Z'),
      };

      await pipeline.processProbeAggregate(event);
      await pipeline.flush();

      const rows = client.getInMemoryTable('probe_aggregates');
      expect(rows).toHaveLength(1);
      expect(rows[0]!['probe_count']).toBe(60);
      expect(rows[0]!['success_count']).toBe(55);
      expect(rows[0]!['avg_latency_ms']).toBe(120.5);
      expect(rows[0]!['region']).toBe('us-east-1');
    });
  });

  describe('processSocialAggregate', () => {
    it('should transform and insert social aggregate correctly', async () => {
      const event: ETLEvent = {
        type: 'social_aggregate',
        data: {
          serviceId: 'svc-001',
          serviceSlug: 'github',
          mentionCount: 100,
          complaintCount: 75,
          avgUrgency: 0.85,
          avgSentiment: -0.6,
          platforms: ['twitter', 'reddit'],
        },
        timestamp: new Date('2025-06-15T10:05:00Z'),
      };

      await pipeline.processSocialAggregate(event);
      await pipeline.flush();

      const rows = client.getInMemoryTable('social_aggregates');
      expect(rows).toHaveLength(1);
      expect(rows[0]!['mention_count']).toBe(100);
      expect(rows[0]!['complaint_count']).toBe(75);
      expect(rows[0]!['avg_urgency']).toBe(0.85);
    });
  });

  describe('start and stop', () => {
    it('should start and stop without errors', async () => {
      await pipeline.start();
      expect(pipeline.isRunning()).toBe(true);

      await pipeline.stop();
      expect(pipeline.isRunning()).toBe(false);
    });

    it('should flush remaining buffer on stop', async () => {
      await pipeline.processOutageEvent(createOutageEvent({ outageId: 'stop-001' }));
      await pipeline.start();
      await pipeline.stop();

      const rows = client.getInMemoryTable('outage_events');
      expect(rows).toHaveLength(1);
    });
  });
});
