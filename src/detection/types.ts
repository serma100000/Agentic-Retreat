/**
 * Types for the OpenPulse anomaly detection engine.
 *
 * Covers detection layers, events, baseline data,
 * CUSUM state, outage state machine, and consensus results.
 */

export const DetectionLayer = {
  STATISTICAL: 'statistical',
  CUSUM: 'cusum',
  LSTM: 'lstm',
  XGBOOST: 'xgboost',
} as const;

export type DetectionLayerType = (typeof DetectionLayer)[keyof typeof DetectionLayer];

export interface RegionBreakdown {
  region: string;
  rate: number;
  deviation: number;
}

export interface DetectionEvent {
  id: string;
  service_id: string;
  detection_layer: DetectionLayerType;
  anomaly_score: number;
  current_rate: number;
  expected_rate: number;
  std_dev: number;
  threshold: number;
  confidence: number;
  region_breakdown: RegionBreakdown[];
  timestamp: Date;
}

export interface BaselineData {
  service_id: string;
  hour_of_day: number;
  day_of_week: number;
  mean_rate: number;
  std_dev: number;
  sample_count: number;
  updated_at: Date;
}

export interface CusumState {
  service_id: string;
  cumulative_sum_high: number;
  cumulative_sum_low: number;
  target_mean: number;
  allowance: number;
  threshold: number;
  last_reset: Date;
}

export const OutageState = {
  OPERATIONAL: 'OPERATIONAL',
  INVESTIGATING: 'INVESTIGATING',
  DEGRADED: 'DEGRADED',
  MAJOR_OUTAGE: 'MAJOR_OUTAGE',
  RECOVERING: 'RECOVERING',
  RESOLVED: 'RESOLVED',
} as const;

export type OutageStateType = (typeof OutageState)[keyof typeof OutageState];

export interface StateTransition {
  from: OutageStateType;
  to: OutageStateType;
  required_duration_ms: number;
  required_score_threshold: number;
  description: string;
}

export interface ConsensusResult {
  service_id: string;
  state: OutageStateType;
  confidence: number;
  signals: DetectionEvent[];
  timestamp: Date;
}

export interface ServiceStateInfo {
  state: OutageStateType;
  confidence: number;
  since: Date;
}

export interface ProbeResult {
  service_id: string;
  success: boolean;
  latency_ms: number;
  status_code: number;
  timestamp: Date;
}

export interface ReportHistoryEntry {
  timestamp: Date;
  count: number;
}
