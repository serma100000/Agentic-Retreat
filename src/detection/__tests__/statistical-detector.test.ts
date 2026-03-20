import { describe, expect, it } from 'vitest';
import { StatisticalDetector } from '../statistical-detector.js';
import type { BaselineData } from '../types.js';
import { DetectionLayer } from '../types.js';

function makeBaseline(overrides: Partial<BaselineData> = {}): BaselineData {
  return {
    service_id: 'svc-1',
    hour_of_day: 14,
    day_of_week: 3,
    mean_rate: 100,
    std_dev: 10,
    sample_count: 50,
    updated_at: new Date(),
    ...overrides,
  };
}

describe('StatisticalDetector', () => {
  const detector = new StatisticalDetector();

  describe('normal traffic (below threshold)', () => {
    it('returns null when current rate equals expected rate', () => {
      const result = detector.evaluate('svc-1', 100, makeBaseline());
      expect(result).toBeNull();
    });

    it('returns null when z-score is below threshold', () => {
      // z = (120 - 100) / 10 = 2.0, below default 3.0
      const result = detector.evaluate('svc-1', 120, makeBaseline());
      expect(result).toBeNull();
    });

    it('returns null for slight decrease', () => {
      // z = |80 - 100| / 10 = 2.0
      const result = detector.evaluate('svc-1', 80, makeBaseline());
      expect(result).toBeNull();
    });
  });

  describe('spike detection', () => {
    it('detects spike when z-score exceeds 3.0', () => {
      // z = (140 - 100) / 10 = 4.0
      const result = detector.evaluate('svc-1', 140, makeBaseline());
      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(4.0);
      expect(result!.detection_layer).toBe(DetectionLayer.STATISTICAL);
      expect(result!.service_id).toBe('svc-1');
      expect(result!.current_rate).toBe(140);
      expect(result!.expected_rate).toBe(100);
    });

    it('detects a drop (negative z-score) when magnitude exceeds threshold', () => {
      // z = |50 - 100| / 10 = 5.0
      const result = detector.evaluate('svc-1', 50, makeBaseline());
      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(5.0);
    });

    it('returns confidence > 0 for detected anomaly', () => {
      const result = detector.evaluate('svc-1', 140, makeBaseline());
      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1.0);
    });

    it('higher z-score produces higher confidence', () => {
      const moderate = detector.evaluate('svc-1', 140, makeBaseline()); // z=4
      const severe = detector.evaluate('svc-1', 180, makeBaseline());   // z=8
      expect(moderate).not.toBeNull();
      expect(severe).not.toBeNull();
      expect(severe!.confidence).toBeGreaterThan(moderate!.confidence);
    });
  });

  describe('gradual increase detection', () => {
    it('does not trigger for incremental changes below threshold', () => {
      // Simulate gradual increase: 100, 105, 110, 115, 120
      const rates = [100, 105, 110, 115, 120];
      const results = rates.map((r) => detector.evaluate('svc-1', r, makeBaseline()));
      // All below z=3.0 (max is z=2.0)
      expect(results.every((r) => r === null)).toBe(true);
    });

    it('triggers once rate exceeds threshold', () => {
      const result = detector.evaluate('svc-1', 131, makeBaseline());
      // z = 31/10 = 3.1 > 3.0
      expect(result).not.toBeNull();
    });
  });

  describe('cold-start with minimum floor', () => {
    it('uses MIN_FLOOR when std_dev is 0', () => {
      const baseline = makeBaseline({ std_dev: 0 });
      // z = (105 - 100) / 0.5 = 10.0
      const result = detector.evaluate('svc-1', 105, baseline);
      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(10.0);
    });

    it('uses MIN_FLOOR when std_dev is very small', () => {
      const baseline = makeBaseline({ std_dev: 0.1 });
      // effective std_dev = max(0.1, 0.5) = 0.5
      // z = (102 - 100) / 0.5 = 4.0
      const result = detector.evaluate('svc-1', 102, baseline);
      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(4.0);
    });
  });

  describe('edge cases', () => {
    it('handles negative current rate', () => {
      // z = |-10 - 100| / 10 = 11.0
      const result = detector.evaluate('svc-1', -10, makeBaseline());
      expect(result).not.toBeNull();
      expect(result!.anomaly_score).toBeCloseTo(11.0);
    });

    it('returns null at exact threshold boundary', () => {
      // z = (130 - 100) / 10 = 3.0 exactly, threshold is 3.0 (<=, not <)
      const result = detector.evaluate('svc-1', 130, makeBaseline());
      expect(result).toBeNull();
    });

    it('returns event just above threshold', () => {
      // z = 30.1 / 10 = 3.01
      const result = detector.evaluate('svc-1', 130.1, makeBaseline());
      expect(result).not.toBeNull();
    });

    it('generates unique IDs for each event', () => {
      const r1 = detector.evaluate('svc-1', 200, makeBaseline());
      const r2 = detector.evaluate('svc-1', 200, makeBaseline());
      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.id).not.toBe(r2!.id);
    });
  });

  describe('per-service threshold configuration', () => {
    it('uses custom threshold when configured', () => {
      const customDetector = new StatisticalDetector({
        thresholds: { 'svc-critical': 2.0 },
      });
      // z = (125 - 100) / 10 = 2.5, above custom 2.0 but below default 3.0
      const result = customDetector.evaluate('svc-critical', 125, makeBaseline());
      expect(result).not.toBeNull();
      expect(result!.threshold).toBe(2.0);
    });

    it('falls back to default threshold for unconfigured services', () => {
      const customDetector = new StatisticalDetector({
        thresholds: { 'svc-critical': 2.0 },
      });
      // z = 2.5, below default 3.0
      const result = customDetector.evaluate('svc-other', 125, makeBaseline());
      expect(result).toBeNull();
    });
  });

  describe('performance', () => {
    it('completes evaluation in under 10ms', () => {
      const baseline = makeBaseline();
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        detector.evaluate('svc-1', 140, baseline);
      }
      const elapsed = performance.now() - start;
      // Average per evaluation should be well under 10ms
      expect(elapsed / 1000).toBeLessThan(10);
    });
  });
});
