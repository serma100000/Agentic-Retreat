/**
 * Detection pipeline orchestrator.
 *
 * Runs Layer 1 (statistical) and Layer 2 (CUSUM) in sequence,
 * feeds results into the consensus engine, and returns the
 * current consensus state for a service.
 */

import { randomUUID } from 'node:crypto';
import type { BaselineComputer } from './baseline-computer.js';
import type { ConsensusEngine } from './consensus-engine.js';
import type { CusumDetector } from './cusum-detector.js';
import type { StatisticalDetector } from './statistical-detector.js';
import type {
  BaselineData,
  ConsensusResult,
  CusumState,
  DetectionEvent,
  ProbeResult,
} from './types.js';
import { DetectionLayer, OutageState } from './types.js';

export class DetectionPipeline {
  private readonly cusumStates = new Map<string, CusumState>();
  private readonly baselines = new Map<string, BaselineData[]>();

  constructor(
    private readonly statisticalDetector: StatisticalDetector,
    private readonly cusumDetector: CusumDetector,
    private readonly consensusEngine: ConsensusEngine,
    private readonly baselineComputer: BaselineComputer,
  ) {}

  /**
   * Set baselines for a service (call after baseline computation).
   */
  setBaselines(serviceId: string, baselines: BaselineData[]): void {
    this.baselines.set(serviceId, baselines);
  }

  /**
   * Set or update CUSUM state for a service.
   */
  setCusumState(serviceId: string, state: CusumState): void {
    this.cusumStates.set(serviceId, state);
  }

  /**
   * Process a single report rate observation through the full pipeline.
   *
   * 1. Look up baseline for the current hour/day
   * 2. Run Layer 1 (statistical z-score)
   * 3. Run Layer 2 (CUSUM change-point)
   * 4. Feed any detection events into the consensus engine
   * 5. Return the consensus result
   */
  processReport(
    serviceId: string,
    reportRate: number,
    timestamp: Date,
  ): ConsensusResult {
    const signals: DetectionEvent[] = [];

    // 1. Get baseline
    const serviceBaselines = this.baselines.get(serviceId);
    const { expected_rate, std_dev } = serviceBaselines
      ? this.baselineComputer.getExpectedRate(serviceId, timestamp, serviceBaselines)
      : { expected_rate: 10, std_dev: 5 };

    const baseline: BaselineData = {
      service_id: serviceId,
      hour_of_day: timestamp.getUTCHours(),
      day_of_week: timestamp.getUTCDay(),
      mean_rate: expected_rate,
      std_dev,
      sample_count: 1,
      updated_at: timestamp,
    };

    // 2. Layer 1: Statistical detection
    const statEvent = this.statisticalDetector.evaluate(
      serviceId,
      reportRate,
      baseline,
    );
    if (statEvent) {
      statEvent.timestamp = timestamp;
      signals.push(statEvent);
    }

    // 3. Layer 2: CUSUM detection
    let cusumState = this.cusumStates.get(serviceId);
    if (!cusumState) {
      cusumState = {
        service_id: serviceId,
        cumulative_sum_high: 0,
        cumulative_sum_low: 0,
        target_mean: expected_rate,
        allowance: std_dev / 2,
        threshold: 4 * std_dev,
        last_reset: timestamp,
      };
    }

    const cusumResult = this.cusumDetector.evaluate(
      serviceId,
      reportRate,
      cusumState,
    );
    this.cusumStates.set(serviceId, cusumResult.newState);

    if (cusumResult.event) {
      cusumResult.event.timestamp = timestamp;
      signals.push(cusumResult.event);
    }

    // 4. Feed into consensus engine
    if (signals.length > 0) {
      return this.consensusEngine.processMultiSignalConsensus(serviceId, signals);
    }

    // No detection events -- check for time-based transitions
    this.consensusEngine.checkTimeouts(serviceId, timestamp);

    const stateInfo = this.consensusEngine.getState(serviceId);
    return {
      service_id: serviceId,
      state: stateInfo.state,
      confidence: stateInfo.confidence,
      signals: [],
      timestamp,
    };
  }

  /**
   * Integrate a probe result as an additional signal.
   *
   * Probe failures generate a synthetic detection event that
   * feeds into the consensus engine.
   */
  processProbeResult(serviceId: string, probeResult: ProbeResult): void {
    if (probeResult.success) {
      return;
    }

    // Probe failure = synthetic detection event
    const syntheticEvent: DetectionEvent = {
      id: randomUUID(),
      service_id: serviceId,
      detection_layer: DetectionLayer.STATISTICAL,
      anomaly_score: 4.0, // probe failure is a strong signal
      current_rate: 0,
      expected_rate: 1,
      std_dev: 0,
      threshold: 3.0,
      confidence: 0.8,
      region_breakdown: [],
      timestamp: probeResult.timestamp,
    };

    this.consensusEngine.processDetectionEvent(serviceId, syntheticEvent);
  }
}
