/**
 * Tests for the PredictiveService (Sprint 13).
 * Validates feature computation, alert triggering, and scheduled evaluation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClickHouseClient } from '../clickhouse-client.js';
import { PredictiveService } from '../predictive-service.js';

interface MockFeatureVector {
  reportRate: number;
  probeLatency: number;
  probeSuccessRate: number;
  socialMentionRate: number;
  timestamp: number;
}

function createMockFeatureStore(
  features: Map<string, MockFeatureVector> = new Map(),
  windows: Map<string, MockFeatureVector[]> = new Map(),
) {
  return {
    getFeatures: async (serviceId: string) => features.get(serviceId) ?? null,
    getWindow: async (serviceId: string, _windowSize?: number) => windows.get(serviceId) ?? [],
    getAllServiceFeatures: async () => features,
  };
}

function createMockPredictor(prediction?: {
  probability5min: number;
  probability15min: number;
  probability60min: number;
}) {
  const defaultPrediction = prediction ?? {
    probability5min: 0.3,
    probability15min: 0.2,
    probability60min: 0.1,
  };

  return {
    predict: (features: Record<string, number>) => ({
      ...defaultPrediction,
      features,
    }),
  };
}

function createSlidingWindow(
  baseTime: number,
  count: number,
  reportRateFn: (i: number) => number = () => 1,
  latencyFn: (i: number) => number = () => 50,
): MockFeatureVector[] {
  return Array.from({ length: count }, (_, i) => ({
    reportRate: reportRateFn(i),
    probeLatency: latencyFn(i),
    probeSuccessRate: 0.99,
    socialMentionRate: 0.5,
    timestamp: baseTime + i * 60000,
  }));
}

describe('PredictiveService', () => {
  let client: ClickHouseClient;

  beforeEach(() => {
    client = new ClickHouseClient();
    client.setInMemoryMode(true);
  });

  describe('computeFeatures', () => {
    it('should return all required feature keys', async () => {
      const features = new Map<string, MockFeatureVector>([
        ['svc-001', { reportRate: 5, probeLatency: 100, probeSuccessRate: 0.95, socialMentionRate: 2, timestamp: Date.now() }],
      ]);
      const windows = new Map<string, MockFeatureVector[]>([
        ['svc-001', createSlidingWindow(Date.now() - 1800000, 30)],
      ]);

      const featureStore = createMockFeatureStore(features, windows);
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const result = await service.computeFeatures('svc-001');

      expect(result).toHaveProperty('reportRateAcceleration');
      expect(result).toHaveProperty('probeLatencyTrend');
      expect(result).toHaveProperty('socialSentimentShift');
      expect(result).toHaveProperty('dnsResolutionAnomaly');
      expect(result).toHaveProperty('tlsCertExpiryDays');
      expect(result).toHaveProperty('historicalPattern');
      expect(result).toHaveProperty('categoryBaselineDeviation');
    });

    it('should detect report rate acceleration', async () => {
      const baseTime = Date.now() - 300000;
      // Accelerating report rate
      const window = createSlidingWindow(
        baseTime,
        10,
        (i) => i * 2, // increasing reports
        () => 50,
      );

      const features = new Map<string, MockFeatureVector>([
        ['svc-001', window[window.length - 1]!],
      ]);
      const windows = new Map<string, MockFeatureVector[]>([
        ['svc-001', window],
      ]);

      const featureStore = createMockFeatureStore(features, windows);
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const result = await service.computeFeatures('svc-001');

      // Report rate is increasing, so acceleration should be positive
      expect(result['reportRateAcceleration']).toBeGreaterThan(0);
    });

    it('should detect probe latency trend', async () => {
      const baseTime = Date.now() - 1800000;
      // Increasing latency
      const window = createSlidingWindow(
        baseTime,
        30,
        () => 1,
        (i) => 50 + i * 10, // increasing latency
      );

      const features = new Map<string, MockFeatureVector>([
        ['svc-001', window[window.length - 1]!],
      ]);
      const windows = new Map<string, MockFeatureVector[]>([
        ['svc-001', window],
      ]);

      const featureStore = createMockFeatureStore(features, windows);
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const result = await service.computeFeatures('svc-001');

      expect(result['probeLatencyTrend']).toBeGreaterThan(0);
    });

    it('should return zero features for unknown service', async () => {
      const featureStore = createMockFeatureStore();
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const result = await service.computeFeatures('unknown-service');

      expect(result['reportRateAcceleration']).toBe(0);
      expect(result['probeLatencyTrend']).toBe(0);
    });

    it('should compute historical pattern from outage data', async () => {
      const now = new Date();
      // Insert outages at the current hour and day of week
      await client.insert('outage_events', [
        {
          outage_id: 'hist-001',
          service_id: 'svc-001',
          service_slug: 'github',
          service_name: 'GitHub',
          category: 'devtools',
          state: 'RESOLVED',
          started_at: now.toISOString(),
          duration_ms: 1000,
          mttr: 500,
          mttd: 100,
        },
      ]);

      const features = new Map<string, MockFeatureVector>([
        ['svc-001', { reportRate: 5, probeLatency: 100, probeSuccessRate: 0.95, socialMentionRate: 2, timestamp: Date.now() }],
      ]);
      const featureStore = createMockFeatureStore(features);
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const result = await service.computeFeatures('svc-001');

      // Should have some historical pattern value since outage is at current time
      expect(typeof result['historicalPattern']).toBe('number');
    });
  });

  describe('evaluate', () => {
    it('should return shouldAlert=true when P(15min) > 0.7', async () => {
      const featureStore = createMockFeatureStore(
        new Map([['svc-001', { reportRate: 10, probeLatency: 500, probeSuccessRate: 0.5, socialMentionRate: 20, timestamp: Date.now() }]]),
        new Map([['svc-001', createSlidingWindow(Date.now() - 1800000, 30)]]),
      );

      const predictor = createMockPredictor({
        probability5min: 0.9,
        probability15min: 0.85,
        probability60min: 0.6,
      });

      const service = new PredictiveService(client, featureStore, predictor);
      const result = await service.evaluate('svc-001');

      expect(result.shouldAlert).toBe(true);
      expect(result.predict15min).toBe(0.85);
    });

    it('should return shouldAlert=false when P(15min) <= 0.7', async () => {
      const featureStore = createMockFeatureStore(
        new Map([['svc-001', { reportRate: 1, probeLatency: 50, probeSuccessRate: 0.99, socialMentionRate: 0, timestamp: Date.now() }]]),
        new Map([['svc-001', createSlidingWindow(Date.now() - 1800000, 30)]]),
      );

      const predictor = createMockPredictor({
        probability5min: 0.1,
        probability15min: 0.05,
        probability60min: 0.02,
      });

      const service = new PredictiveService(client, featureStore, predictor);
      const result = await service.evaluate('svc-001');

      expect(result.shouldAlert).toBe(false);
      expect(result.predict5min).toBe(0.1);
    });

    it('should return all prediction horizons', async () => {
      const featureStore = createMockFeatureStore(
        new Map([['svc-001', { reportRate: 5, probeLatency: 100, probeSuccessRate: 0.95, socialMentionRate: 2, timestamp: Date.now() }]]),
        new Map([['svc-001', createSlidingWindow(Date.now() - 1800000, 30)]]),
      );

      const predictor = createMockPredictor({
        probability5min: 0.4,
        probability15min: 0.3,
        probability60min: 0.2,
      });

      const service = new PredictiveService(client, featureStore, predictor);
      const result = await service.evaluate('svc-001');

      expect(result.predict5min).toBe(0.4);
      expect(result.predict15min).toBe(0.3);
      expect(result.predict60min).toBe(0.2);
    });
  });

  describe('runScheduledEvaluation', () => {
    it('should evaluate all monitored services', async () => {
      const features = new Map<string, MockFeatureVector>([
        ['svc-001', { reportRate: 5, probeLatency: 100, probeSuccessRate: 0.95, socialMentionRate: 2, timestamp: Date.now() }],
        ['svc-002', { reportRate: 1, probeLatency: 50, probeSuccessRate: 0.99, socialMentionRate: 0, timestamp: Date.now() }],
        ['svc-003', { reportRate: 10, probeLatency: 500, probeSuccessRate: 0.5, socialMentionRate: 20, timestamp: Date.now() }],
      ]);

      const windows = new Map<string, MockFeatureVector[]>();
      for (const id of features.keys()) {
        windows.set(id, createSlidingWindow(Date.now() - 1800000, 30));
      }

      const featureStore = createMockFeatureStore(features, windows);
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const results = await service.runScheduledEvaluation();

      expect(results).toHaveLength(3);
      expect(results.map(r => r.serviceId).sort()).toEqual(['svc-001', 'svc-002', 'svc-003']);

      for (const result of results) {
        expect(result.predictions).toHaveProperty('predict5min');
        expect(result.predictions).toHaveProperty('predict15min');
        expect(result.predictions).toHaveProperty('predict60min');
        expect(result.predictions).toHaveProperty('shouldAlert');
      }
    });

    it('should return empty array when no services are monitored', async () => {
      const featureStore = createMockFeatureStore();
      const predictor = createMockPredictor();
      const service = new PredictiveService(client, featureStore, predictor);

      const results = await service.runScheduledEvaluation();

      expect(results).toHaveLength(0);
    });

    it('should skip services that fail evaluation', async () => {
      const features = new Map<string, MockFeatureVector>([
        ['svc-001', { reportRate: 5, probeLatency: 100, probeSuccessRate: 0.95, socialMentionRate: 2, timestamp: Date.now() }],
        ['svc-002', { reportRate: 1, probeLatency: 50, probeSuccessRate: 0.99, socialMentionRate: 0, timestamp: Date.now() }],
      ]);

      let callCount = 0;
      const failingPredictor = {
        predict: (f: Record<string, number>) => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Predictor failure');
          }
          return { probability5min: 0.1, probability15min: 0.05, probability60min: 0.02, features: f };
        },
      };

      const featureStore = createMockFeatureStore(features);
      const service = new PredictiveService(client, featureStore, failingPredictor);

      const results = await service.runScheduledEvaluation();

      // Should have at least 1 successful result (the one that doesn't fail)
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});
