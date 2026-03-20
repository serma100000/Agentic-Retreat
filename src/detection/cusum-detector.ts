/**
 * Layer 2 -- CUSUM (Cumulative Sum) change-point detection.
 *
 * Tracks cumulative deviations from the target mean in both the
 * positive and negative directions. When either cumulative sum
 * exceeds its threshold the detector signals a change-point.
 *
 * Parameters (derived from baseline):
 *   target_mean = baseline mean rate
 *   allowance  k = std_dev / 2
 *   threshold  h = 4 * std_dev
 *
 * Latency target: < 50 ms per evaluation.
 */

import { randomUUID } from 'node:crypto';
import type { CusumState, DetectionEvent } from './types.js';
import { DetectionLayer } from './types.js';

export interface CusumEvaluationResult {
  event: DetectionEvent | null;
  newState: CusumState;
}

export class CusumDetector {
  /**
   * Create a fresh CUSUM state for a service from baseline parameters.
   */
  static initState(
    serviceId: string,
    targetMean: number,
    stdDev: number,
  ): CusumState {
    return {
      service_id: serviceId,
      cumulative_sum_high: 0,
      cumulative_sum_low: 0,
      target_mean: targetMean,
      allowance: stdDev / 2,
      threshold: 4 * stdDev,
      last_reset: new Date(),
    };
  }

  /**
   * Evaluate one observation against the running CUSUM state.
   *
   * @returns The detection event (or null) and the updated CUSUM state.
   */
  evaluate(
    serviceId: string,
    currentRate: number,
    cusumState: CusumState,
  ): CusumEvaluationResult {
    const { target_mean, allowance, threshold } = cusumState;

    // Update cumulative sums
    const newHigh = Math.max(
      0,
      cusumState.cumulative_sum_high + (currentRate - target_mean - allowance),
    );
    const newLow = Math.max(
      0,
      cusumState.cumulative_sum_low + (target_mean - allowance - currentRate),
    );

    const highTriggered = newHigh > threshold;
    const lowTriggered = newLow > threshold;
    const triggered = highTriggered || lowTriggered;

    let event: DetectionEvent | null = null;

    if (triggered) {
      const anomalyScore = Math.max(newHigh, newLow) / Math.max(threshold, 1);
      const confidence = this.computeConfidence(anomalyScore);

      event = {
        id: randomUUID(),
        service_id: serviceId,
        detection_layer: DetectionLayer.CUSUM,
        anomaly_score: anomalyScore,
        current_rate: currentRate,
        expected_rate: target_mean,
        std_dev: allowance * 2, // recover original std_dev from allowance
        threshold: anomalyScore, // normalized threshold
        confidence,
        region_breakdown: [],
        timestamp: new Date(),
      };
    }

    const newState: CusumState = {
      ...cusumState,
      cumulative_sum_high: triggered ? 0 : newHigh,
      cumulative_sum_low: triggered ? 0 : newLow,
      last_reset: triggered ? new Date() : cusumState.last_reset,
    };

    return { event, newState };
  }

  /**
   * Confidence based on how far the normalized score exceeds 1.0.
   */
  private computeConfidence(normalizedScore: number): number {
    if (normalizedScore <= 1) return 0.5;
    return Math.min(1.0, 0.5 + 0.5 * (1 - Math.exp(-(normalizedScore - 1))));
  }
}
