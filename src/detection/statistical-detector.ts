/**
 * Layer 1 -- Z-score based statistical threshold detection.
 *
 * Compares current error rate against the baseline for the given
 * service and time bucket, producing a DetectionEvent when the
 * z-score exceeds a configurable threshold.
 *
 * Latency target: < 10 ms per evaluation.
 */

import { randomUUID } from 'node:crypto';
import type { BaselineData, DetectionEvent } from './types.js';
import { DetectionLayer } from './types.js';

const DEFAULT_THRESHOLD = 3.0;
const MIN_FLOOR = 0.5;

export interface StatisticalDetectorConfig {
  /** Per-service-tier threshold overrides keyed by service ID. */
  thresholds?: Record<string, number>;
  /** Global default z-score threshold (default 3.0). */
  defaultThreshold?: number;
}

export class StatisticalDetector {
  private readonly thresholds: Record<string, number>;
  private readonly defaultThreshold: number;

  constructor(config: StatisticalDetectorConfig = {}) {
    this.thresholds = config.thresholds ?? {};
    this.defaultThreshold = config.defaultThreshold ?? DEFAULT_THRESHOLD;
  }

  /**
   * Evaluate a single observation against the baseline.
   *
   * @returns A DetectionEvent if the z-score exceeds the threshold, otherwise null.
   */
  evaluate(
    serviceId: string,
    currentRate: number,
    baseline: BaselineData,
  ): DetectionEvent | null {
    const effectiveStdDev = Math.max(baseline.std_dev, MIN_FLOOR);
    const zScore = (currentRate - baseline.mean_rate) / effectiveStdDev;
    const absZScore = Math.abs(zScore);

    const threshold = this.thresholds[serviceId] ?? this.defaultThreshold;

    if (absZScore <= threshold) {
      return null;
    }

    const confidence = this.computeConfidence(absZScore, threshold);

    return {
      id: randomUUID(),
      service_id: serviceId,
      detection_layer: DetectionLayer.STATISTICAL,
      anomaly_score: absZScore,
      current_rate: currentRate,
      expected_rate: baseline.mean_rate,
      std_dev: baseline.std_dev,
      threshold,
      confidence,
      region_breakdown: [],
      timestamp: new Date(),
    };
  }

  /**
   * Confidence rises from 0 at the threshold to 1.0 asymptotically.
   * Uses a sigmoid-like mapping: 1 - exp(-(score - threshold)).
   */
  private computeConfidence(score: number, threshold: number): number {
    const excess = score - threshold;
    if (excess <= 0) return 0;
    return Math.min(1.0, 1 - Math.exp(-excess));
  }
}
