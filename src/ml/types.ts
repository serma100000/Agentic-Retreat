/**
 * ML Types for OpenPulse anomaly detection (Sprint 9)
 * Layer 3: LSTM Autoencoder + Layer 4: XGBoost predictor
 */

export interface FeatureVector {
  reportRate: number;
  probeLatency: number;
  probeSuccessRate: number;
  socialMentionRate: number;
  timestamp: number;
}

/** 60 data points = 60 minutes of features */
export type SlidingWindow = FeatureVector[];

export interface AutoencoderConfig {
  inputSize: number;
  hiddenSizes: number[];
  latentSize: number;
  learningRate: number;
  epochs: number;
}

export interface ModelWeights {
  encoderWeights: number[][][][];
  decoderWeights: number[][][][];
  biases: number[][][];
}

export interface AnomalyResult {
  reconstructionError: number;
  threshold: number;
  isAnomaly: boolean;
  confidence: number;
  features: FeatureVector;
}

export interface FeatureStoreEntry {
  serviceId: string;
  features: FeatureVector;
  timestamp: number;
}

export interface XGBoostPrediction {
  probability5min: number;
  probability15min: number;
  probability60min: number;
  features: Record<string, number>;
}

export interface TrainingMetrics {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  reconstructionThreshold: number;
}

export const DEFAULT_AUTOENCODER_CONFIG: AutoencoderConfig = {
  inputSize: 4,
  hiddenSizes: [32, 16],
  latentSize: 8,
  learningRate: 0.001,
  epochs: 50,
};

/** Feature vector numeric keys used for ML input (excludes timestamp) */
export const FEATURE_KEYS: (keyof Omit<FeatureVector, 'timestamp'>)[] = [
  'reportRate',
  'probeLatency',
  'probeSuccessRate',
  'socialMentionRate',
];
