/**
 * Unit tests for the StatisticalDetector (Layer 1 -- Z-score detection).
 *
 * Tests cover:
 * - Normal operation below threshold
 * - Anomaly detection above threshold
 * - Per-service threshold overrides
 * - Confidence computation
 * - Edge cases (zero std_dev, negative rates, very large z-scores)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StatisticalDetector } from '../../../src/detection/statistical-detector.js';
import type { BaselineData } from '../../../src/detection/types.js';
import { DetectionLayer } from '../../../src/detection/types.js';

function makeBaseline(overrides: Partial<BaselineData> = {}): BaselineData {
  return {
    service_id: 'svc-001',
    hour_of_day: 14,
    day_of_week: 3,
    mean_rate: 10.0,
    std_dev: 2.0,
    sample_count: 100,
    updated_at: new Date('2026-03-20T12:00:00Z'),
    ...overrides,
  };
}

describe('StatisticalDetector', () => {
  let detector: StatisticalDetector;

  beforeEach(() => {
    detector = new StatisticalDetector();
  });

  describe('evaluate', () => {
    it('should return null when the z-score is below the default threshold', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = (14 - 10) / 2 = 2.0, below default 3.0
      const result = detector.evaluate('svc-001', 14.0, baseline);
      expect(result).toBeNull();
    });

    it('should return null for a rate exactly at the mean', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      const result = detector.evaluate('svc-001', 10.0, baseline);
      expect(result).toBeNull();
    });

    it('should detect an anomaly when z-score exceeds the threshold', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = (17 - 10) / 2 = 3.5, above default 3.0
      const result = detector.evaluate('svc-001', 17.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.service_id).toBe('svc-001');
      expect(result!.detection_layer).toBe(DetectionLayer.STATISTICAL);
      expect(result!.anomaly_score).toBeCloseTo(3.5, 5);
      expect(result!.current_rate).toBe(17.0);
      expect(result!.expected_rate).toBe(10.0);
      expect(result!.threshold).toBe(3.0);
    });

    it('should detect anomalies for negative deviations (rate below mean)', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = |3 - 10| / 2 = 3.5
      const result = detector.evaluate('svc-001', 3.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(3.5, 5);
    });

    it('should use a minimum std_dev floor of 0.5', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 0.0 });
      // effective std_dev = 0.5, z-score = (12 - 10) / 0.5 = 4.0
      const result = detector.evaluate('svc-001', 12.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(4.0, 5);
      expect(result!.std_dev).toBe(0.0); // original std_dev preserved
    });

    it('should return null when z-score equals the threshold exactly', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = (16 - 10) / 2 = 3.0, equal to threshold (not exceeded)
      const result = detector.evaluate('svc-001', 16.0, baseline);
      expect(result).toBeNull();
    });
  });

  describe('per-service threshold overrides', () => {
    it('should use a custom threshold for a specific service', () => {
      const customDetector = new StatisticalDetector({
        thresholds: { 'svc-critical': 2.0 },
      });
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });

      // z-score = (15 - 10) / 2 = 2.5, above custom 2.0
      const result = customDetector.evaluate('svc-critical', 15.0, baseline);
      expect(result).not.toBeNull();
      expect(result!.threshold).toBe(2.0);
    });

    it('should fall back to default threshold for unknown services', () => {
      const customDetector = new StatisticalDetector({
        thresholds: { 'svc-critical': 2.0 },
        defaultThreshold: 3.0,
      });
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });

      // z-score = (15 - 10) / 2 = 2.5, below default 3.0
      const result = customDetector.evaluate('svc-other', 15.0, baseline);
      expect(result).toBeNull();
    });
  });

  describe('confidence computation', () => {
    it('should produce confidence near 0 for z-scores just above threshold', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = (16.1 - 10) / 2 = 3.05, just above 3.0
      const result = detector.evaluate('svc-001', 16.1, baseline);

      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThan(0.1);
    });

    it('should produce confidence near 1 for very high z-scores', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = (30 - 10) / 2 = 10.0, well above 3.0
      const result = detector.evaluate('svc-001', 30.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0.99);
    });

    it('should cap confidence at 1.0', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = (1000 - 10) / 2 = 495, extreme
      const result = detector.evaluate('svc-001', 1000.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('edge cases', () => {
    it('should handle very small std_dev gracefully', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 0.001 });
      // effective std_dev = 0.5 (floor), z-score = (12 - 10) / 0.5 = 4.0
      const result = detector.evaluate('svc-001', 12.0, baseline);
      expect(result).not.toBeNull();
    });

    it('should handle negative current rate', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      // z-score = |-5 - 10| / 2 = 7.5
      const result = detector.evaluate('svc-001', -5.0, baseline);
      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(7.5, 5);
    });

    it('should include an id and timestamp in the detection event', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      const result = detector.evaluate('svc-001', 20.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.id).toBeTruthy();
      expect(result!.timestamp).toBeInstanceOf(Date);
    });

    it('should return empty region_breakdown', () => {
      const baseline = makeBaseline({ mean_rate: 10.0, std_dev: 2.0 });
      const result = detector.evaluate('svc-001', 20.0, baseline);

      expect(result).not.toBeNull();
      expect(result!.region_breakdown).toEqual([]);
    });
  });
});
