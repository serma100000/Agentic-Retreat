import { describe, expect, it } from 'vitest';
import { CusumDetector } from '../cusum-detector.js';
import type { CusumState } from '../types.js';
import { DetectionLayer } from '../types.js';

function makeState(overrides: Partial<CusumState> = {}): CusumState {
  return {
    service_id: 'svc-1',
    cumulative_sum_high: 0,
    cumulative_sum_low: 0,
    target_mean: 100,
    allowance: 5, // std_dev/2 where std_dev=10
    threshold: 40, // 4 * std_dev where std_dev=10
    last_reset: new Date(),
    ...overrides,
  };
}

describe('CusumDetector', () => {
  const detector = new CusumDetector();

  describe('initState', () => {
    it('creates initial CUSUM state from baseline parameters', () => {
      const state = CusumDetector.initState('svc-1', 100, 10);
      expect(state.service_id).toBe('svc-1');
      expect(state.target_mean).toBe(100);
      expect(state.allowance).toBe(5);
      expect(state.threshold).toBe(40);
      expect(state.cumulative_sum_high).toBe(0);
      expect(state.cumulative_sum_low).toBe(0);
    });
  });

  describe('normal fluctuations', () => {
    it('does not trigger on small deviations', () => {
      let state = makeState();
      // Observations close to target: 102, 98, 103, 97
      const observations = [102, 98, 103, 97, 101, 99];
      for (const obs of observations) {
        const result = detector.evaluate('svc-1', obs, state);
        expect(result.event).toBeNull();
        state = result.newState;
      }
    });

    it('cumulative sums stay near zero for centered data', () => {
      let state = makeState();
      const observations = [100, 100, 100, 100];
      for (const obs of observations) {
        const result = detector.evaluate('svc-1', obs, state);
        state = result.newState;
      }
      // S_high = max(0, 0 + (100 - 100 - 5)) = max(0, -5) = 0
      expect(state.cumulative_sum_high).toBe(0);
      expect(state.cumulative_sum_low).toBe(0);
    });
  });

  describe('abrupt mean shift', () => {
    it('detects a large upward shift', () => {
      let state = makeState();
      let detected = false;

      // Sudden jump to 160 (60 above target)
      // Each step: S_high += (160 - 100 - 5) = 55
      // After 1 step: S_high = 55 > 40 = threshold -> detected!
      const result = detector.evaluate('svc-1', 160, state);
      expect(result.event).not.toBeNull();
      expect(result.event!.detection_layer).toBe(DetectionLayer.CUSUM);
      expect(result.event!.anomaly_score).toBeGreaterThan(1.0);
      detected = true;

      expect(detected).toBe(true);
    });

    it('detects a large downward shift', () => {
      let state = makeState();
      // Sudden drop to 40 (60 below target)
      // S_low += (100 - 5 - 40) = 55 > 40 -> detected
      const result = detector.evaluate('svc-1', 40, state);
      expect(result.event).not.toBeNull();
    });
  });

  describe('gradual sustained increase', () => {
    it('detects gradual shift that accumulates past threshold', () => {
      let state = makeState();
      let detected = false;
      let steps = 0;

      // Sustained moderate increase: target + 15 each step
      // S_high per step: (115 - 100 - 5) = 10
      // After 5 steps: S_high = 50 > 40 -> detected
      for (let i = 0; i < 20; i++) {
        const result = detector.evaluate('svc-1', 115, state);
        state = result.newState;
        steps++;
        if (result.event) {
          detected = true;
          break;
        }
      }

      expect(detected).toBe(true);
      expect(steps).toBe(5); // 5 * 10 = 50 > 40
    });
  });

  describe('reset after detection', () => {
    it('resets cumulative sums after a detection', () => {
      let state = makeState();
      // Trigger detection
      const result = detector.evaluate('svc-1', 160, state);
      expect(result.event).not.toBeNull();

      // After detection, sums should be reset
      expect(result.newState.cumulative_sum_high).toBe(0);
      expect(result.newState.cumulative_sum_low).toBe(0);
    });

    it('last_reset timestamp is updated on detection', () => {
      const oldReset = new Date('2024-01-01');
      let state = makeState({ last_reset: oldReset });

      const result = detector.evaluate('svc-1', 160, state);
      expect(result.event).not.toBeNull();
      expect(result.newState.last_reset.getTime()).toBeGreaterThan(oldReset.getTime());
    });
  });

  describe('state persistence between evaluations', () => {
    it('accumulates across multiple evaluations', () => {
      let state = makeState();

      // Step 1: rate 110 -> S_high = max(0, 0 + (110 - 100 - 5)) = 5
      let result = detector.evaluate('svc-1', 110, state);
      expect(result.event).toBeNull();
      state = result.newState;
      expect(state.cumulative_sum_high).toBeCloseTo(5);

      // Step 2: rate 110 -> S_high = max(0, 5 + 5) = 10
      result = detector.evaluate('svc-1', 110, state);
      expect(result.event).toBeNull();
      state = result.newState;
      expect(state.cumulative_sum_high).toBeCloseTo(10);

      // Step 3: back to normal -> S_high = max(0, 10 + (100-100-5)) = max(0, 5) = 5
      result = detector.evaluate('svc-1', 100, state);
      state = result.newState;
      expect(state.cumulative_sum_high).toBeCloseTo(5);
    });

    it('preserves service_id through state transitions', () => {
      const state = makeState({ service_id: 'svc-42' });
      const result = detector.evaluate('svc-42', 110, state);
      expect(result.newState.service_id).toBe('svc-42');
    });
  });

  describe('edge cases', () => {
    it('handles zero threshold gracefully', () => {
      const state = makeState({ threshold: 0 });
      // Any non-zero deviation should trigger
      const result = detector.evaluate('svc-1', 106, state);
      // S_high = (106 - 100 - 5) = 1 > 0
      expect(result.event).not.toBeNull();
    });

    it('handles observation equal to target', () => {
      const state = makeState();
      const result = detector.evaluate('svc-1', 100, state);
      expect(result.event).toBeNull();
      expect(result.newState.cumulative_sum_high).toBe(0);
    });
  });
});
