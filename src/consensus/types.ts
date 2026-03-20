/**
 * Types for the OpenPulse enhanced multi-signal consensus engine.
 *
 * Covers signal sources, Bayesian state, geographic analysis,
 * status page aggregation, and outage classification.
 */

export const SignalSource = {
  REPORT: 'report',
  PROBE: 'probe',
  SOCIAL: 'social',
  STATUSPAGE: 'statuspage',
  ML_AUTOENCODER: 'ml_autoencoder',
  ML_PREDICTIVE: 'ml_predictive',
} as const;

export type SignalSourceType = (typeof SignalSource)[keyof typeof SignalSource];

export interface Signal {
  source: SignalSourceType;
  serviceId: string;
  score: number;
  confidence: number;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export const GeographicScope = {
  LOCALIZED: 'localized',
  REGIONAL: 'regional',
  GLOBAL: 'global',
} as const;

export type GeographicScopeType = (typeof GeographicScope)[keyof typeof GeographicScope];

export interface RegionStatus {
  regionCode: string;
  reportCount: number;
  probeSuccessRate: number;
  socialMentions: number;
  status: string;
}

export interface BayesianState {
  prior: number;
  likelihood: number;
  posterior: number;
  signals: Signal[];
  lastUpdated: Date;
}

export interface HysteresisConfig {
  /** Duration in ms that a state must be sustained before transitioning. */
  [transitionKey: string]: number;
}

export interface ConsensusConfig {
  signalWeights: Record<SignalSourceType, number>;
  transitionThresholds: Record<string, number>;
  hysteresisConfig: HysteresisConfig;
  geographicThresholds: {
    localizedMax: number;
    regionalMax: number;
    anomalyScoreThreshold: number;
  };
}

export interface StatusPageUpdate {
  serviceId: string;
  providerStatus: string;
  source: string;
  normalizedStatus: string;
  rawData: unknown;
  scrapedAt: Date;
}

export interface OutageClassification {
  scope: GeographicScopeType;
  affectedRegions: string[];
  primaryRegion: string | null;
  spreadRate: number;
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

export interface TransitionRule {
  from: OutageStateType;
  to: OutageStateType;
  requiredSources: number;
  minConfidence: number;
  minDuration: number;
  geographicRequirement?: GeographicScopeType;
  description: string;
}

export interface ServiceFullStatus {
  state: OutageStateType;
  confidence: number;
  signals: Signal[];
  geographic: OutageClassification | null;
  bayesian: BayesianState | null;
  timeline: Array<{ state: OutageStateType; at: Date }>;
}

export interface ActiveOutage {
  serviceId: string;
  state: OutageStateType;
  confidence: number;
  since: Date;
  geographic: OutageClassification | null;
}
