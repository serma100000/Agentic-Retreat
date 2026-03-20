/**
 * High-level ML anomaly detection orchestrator.
 * Integrates the LSTM Autoencoder (Layer 3) and XGBoost predictor (Layer 4).
 */

import { LSTMAutoencoder } from './autoencoder.js';
import { XGBoostPredictor } from './xgboost-predictor.js';
import type {
  AnomalyResult,
  AutoencoderConfig,
  ModelWeights,
  SlidingWindow,
  XGBoostPrediction,
} from './types.js';

interface ModelEntry {
  autoencoder: LSTMAutoencoder;
  predictor: XGBoostPredictor;
  lastTraining: Date;
}

interface CombinedScore {
  score: number;
  confidence: number;
}

export class MLAnomalyDetector {
  /** Models cached per service category */
  private readonly models: Map<string, ModelEntry> = new Map();

  /** Default autoencoder config */
  private readonly autoencoderConfig: Partial<AutoencoderConfig>;

  /** Weight for autoencoder score in combined score (vs XGBoost) */
  private readonly autoencoderWeight: number;
  private readonly xgboostWeight: number;

  constructor(config?: {
    autoencoderConfig?: Partial<AutoencoderConfig>;
    autoencoderWeight?: number;
    xgboostWeight?: number;
  }) {
    this.autoencoderConfig = config?.autoencoderConfig ?? {};
    this.autoencoderWeight = config?.autoencoderWeight ?? 0.6;
    this.xgboostWeight = config?.xgboostWeight ?? 0.4;
  }

  /**
   * Run the LSTM autoencoder on a sliding window (Layer 3).
   * Target latency: < 200ms.
   */
  evaluateAutoencoder(serviceId: string, window: SlidingWindow): AnomalyResult {
    const category = this.getCategoryForService(serviceId);
    const entry = this.getOrCreateModel(category);
    return entry.autoencoder.detect(window);
  }

  /**
   * Run the XGBoost predictor (Layer 4).
   * Target latency: < 500ms.
   */
  evaluatePredictive(
    serviceId: string,
    features: Record<string, number>,
  ): XGBoostPrediction {
    const category = this.getCategoryForService(serviceId);
    const entry = this.getOrCreateModel(category);
    return entry.predictor.predict(features);
  }

  /**
   * Combine autoencoder anomaly result with XGBoost prediction
   * into a single risk score.
   */
  getCombinedScore(
    autoencoderResult: AnomalyResult,
    xgboostResult: XGBoostPrediction,
  ): CombinedScore {
    // Autoencoder score: reconstruction error normalized by threshold
    const aeScore = Math.min(
      1,
      autoencoderResult.reconstructionError / autoencoderResult.threshold,
    );

    // XGBoost score: use the 5-minute prediction as the most immediate risk
    const xgScore = xgboostResult.probability5min;

    // Weighted combination
    const score = this.autoencoderWeight * aeScore + this.xgboostWeight * xgScore;

    // Confidence is the average of individual confidences
    const aeConfidence = autoencoderResult.confidence;
    const xgConfidence = Math.max(
      xgboostResult.probability5min,
      xgboostResult.probability15min,
      xgboostResult.probability60min,
    );
    const confidence =
      (this.autoencoderWeight * aeConfidence + this.xgboostWeight * xgConfidence) /
      (this.autoencoderWeight + this.xgboostWeight);

    return {
      score: Math.min(1, Math.max(0, score)),
      confidence: Math.min(1, Math.max(0, confidence)),
    };
  }

  /**
   * Load or initialize models for a service category.
   */
  loadModels(category: string, weights?: ModelWeights): void {
    const entry = this.getOrCreateModel(category);
    if (weights) {
      entry.autoencoder.loadWeights(weights);
    }
  }

  /**
   * Train models for a category on normal operation data.
   */
  trainModels(
    category: string,
    normalWindows: SlidingWindow[],
    labeledData?: { features: Record<string, number>; label: boolean }[],
  ): void {
    const entry = this.getOrCreateModel(category);

    // Train autoencoder on normal windows
    if (normalWindows.length > 0) {
      entry.autoencoder.trainFast(normalWindows, {
        epochs: 20,
        lr: 0.001,
        validationSplit: 0.2,
      });
    }

    // Train XGBoost on labeled data
    if (labeledData && labeledData.length > 0) {
      entry.predictor.train(labeledData);
    }

    entry.lastTraining = new Date();
    this.models.set(category, entry);
  }

  /**
   * Get status of loaded models.
   */
  getModelStatus(): {
    loaded: string[];
    lastTraining: Record<string, Date>;
  } {
    const loaded: string[] = [];
    const lastTraining: Record<string, Date> = {};

    this.models.forEach((entry, category) => {
      loaded.push(category);
      lastTraining[category] = entry.lastTraining;
    });

    return { loaded, lastTraining };
  }

  /**
   * Remove a model from the cache.
   */
  unloadModel(category: string): void {
    this.models.delete(category);
  }

  /**
   * Save weights for a category.
   */
  saveWeights(category: string): ModelWeights | null {
    const entry = this.models.get(category);
    if (!entry) return null;
    return entry.autoencoder.saveWeights();
  }

  /**
   * Map a serviceId to a model category.
   * Services in the same category share a model (e.g., "cdn", "api", "database").
   */
  private getCategoryForService(serviceId: string): string {
    // Simple categorization by prefix
    const parts = serviceId.split('-');
    return parts[0] ?? 'default';
  }

  /**
   * Get or create a model entry for a category.
   */
  private getOrCreateModel(category: string): ModelEntry {
    let entry = this.models.get(category);
    if (!entry) {
      entry = {
        autoencoder: new LSTMAutoencoder(this.autoencoderConfig),
        predictor: new XGBoostPredictor(),
        lastTraining: new Date(0),
      };
      this.models.set(category, entry);
    }
    return entry;
  }
}
