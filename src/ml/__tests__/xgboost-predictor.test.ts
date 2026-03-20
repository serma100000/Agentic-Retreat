import { describe, it, expect } from 'vitest';
import { XGBoostPredictor, DecisionTree } from '../xgboost-predictor.js';

describe('DecisionTree', () => {
  it('should train and predict', () => {
    const tree = new DecisionTree(3);
    const data = [
      { features: { x: 1 }, label: 0 },
      { features: { x: 2 }, label: 0 },
      { features: { x: 8 }, label: 1 },
      { features: { x: 9 }, label: 1 },
    ];
    tree.train(data);

    // Low x should predict near 0, high x near 1
    expect(tree.predict({ x: 1.5 })).toBeLessThan(0.5);
    expect(tree.predict({ x: 8.5 })).toBeGreaterThan(0.5);
  });

  it('should handle empty data', () => {
    const tree = new DecisionTree(3);
    tree.train([]);
    expect(tree.predict({ x: 5 })).toBe(0);
  });
});

describe('XGBoostPredictor', () => {
  it('should return probabilities in [0, 1] for untrained model', () => {
    const predictor = new XGBoostPredictor();
    const result = predictor.predict({
      reportRateAcceleration: 1.0,
      probeLatencyTrend: 1.0,
      socialSentimentShift: 0.5,
      dnsResolutionAnomaly: 0.1,
      tlsCertExpiryDays: 180,
      historicalOutagePattern: 0.1,
    });

    expect(result.probability5min).toBeGreaterThanOrEqual(0);
    expect(result.probability5min).toBeLessThanOrEqual(1);
    expect(result.probability15min).toBeGreaterThanOrEqual(0);
    expect(result.probability15min).toBeLessThanOrEqual(1);
    expect(result.probability60min).toBeGreaterThanOrEqual(0);
    expect(result.probability60min).toBeLessThanOrEqual(1);
  });

  it('should return higher probabilities for high-risk features', () => {
    const predictor = new XGBoostPredictor();

    const normalFeatures = {
      reportRateAcceleration: 0.1,
      probeLatencyTrend: 0.2,
      socialSentimentShift: 0.1,
      dnsResolutionAnomaly: 0.0,
      tlsCertExpiryDays: 365,
      historicalOutagePattern: 0.0,
    };

    const highRiskFeatures = {
      reportRateAcceleration: 5.0,
      probeLatencyTrend: 8.0,
      socialSentimentShift: 4.0,
      dnsResolutionAnomaly: 0.9,
      tlsCertExpiryDays: 0.5,
      historicalOutagePattern: 0.8,
    };

    const normalResult = predictor.predict(normalFeatures);
    const highRiskResult = predictor.predict(highRiskFeatures);

    expect(highRiskResult.probability5min).toBeGreaterThan(normalResult.probability5min);
    expect(highRiskResult.probability15min).toBeGreaterThan(normalResult.probability15min);
  });

  it('should return low probabilities for normal features', () => {
    const predictor = new XGBoostPredictor();
    const result = predictor.predict({
      reportRateAcceleration: 0.0,
      probeLatencyTrend: 0.0,
      socialSentimentShift: 0.0,
      dnsResolutionAnomaly: 0.0,
      tlsCertExpiryDays: 365,
      historicalOutagePattern: 0.0,
    });

    expect(result.probability5min).toBeLessThan(0.3);
    expect(result.probability15min).toBeLessThan(0.3);
    expect(result.probability60min).toBeLessThan(0.3);
  });

  it('should train on labeled data and produce predictions in [0, 1]', () => {
    const predictor = new XGBoostPredictor({ numTrees: 5, maxDepth: 2 });

    const trainingData: { features: Record<string, number>; label: boolean }[] = [];

    // Generate normal samples
    for (let i = 0; i < 20; i++) {
      trainingData.push({
        features: {
          reportRateAcceleration: Math.random() * 0.5,
          probeLatencyTrend: Math.random() * 0.5,
          socialSentimentShift: Math.random() * 0.3,
          dnsResolutionAnomaly: Math.random() * 0.1,
        },
        label: false,
      });
    }

    // Generate outage samples
    for (let i = 0; i < 20; i++) {
      trainingData.push({
        features: {
          reportRateAcceleration: 3 + Math.random() * 5,
          probeLatencyTrend: 5 + Math.random() * 5,
          socialSentimentShift: 2 + Math.random() * 3,
          dnsResolutionAnomaly: 0.5 + Math.random() * 0.5,
        },
        label: true,
      });
    }

    predictor.train(trainingData);
    expect(predictor.isTrained()).toBe(true);

    // Test predictions remain in valid range
    const result = predictor.predict({
      reportRateAcceleration: 4.0,
      probeLatencyTrend: 6.0,
      socialSentimentShift: 3.0,
      dnsResolutionAnomaly: 0.8,
    });

    expect(result.probability5min).toBeGreaterThanOrEqual(0);
    expect(result.probability5min).toBeLessThanOrEqual(1);
    expect(result.probability15min).toBeGreaterThanOrEqual(0);
    expect(result.probability15min).toBeLessThanOrEqual(1);
    expect(result.probability60min).toBeGreaterThanOrEqual(0);
    expect(result.probability60min).toBeLessThanOrEqual(1);
  });

  it('should improve predictions after training', () => {
    const predictor = new XGBoostPredictor({ numTrees: 10, maxDepth: 3, learningRate: 0.2 });

    const trainingData: { features: Record<string, number>; label: boolean }[] = [];

    // Clear separation: feature "signal" > 5 means outage
    for (let i = 0; i < 30; i++) {
      trainingData.push({
        features: { signal: Math.random() * 2 },
        label: false,
      });
    }
    for (let i = 0; i < 30; i++) {
      trainingData.push({
        features: { signal: 8 + Math.random() * 2 },
        label: true,
      });
    }

    predictor.train(trainingData);

    const lowSignal = predictor.predict({ signal: 1 });
    const highSignal = predictor.predict({ signal: 9 });

    // After training, high signal should yield higher probability
    expect(highSignal.probability5min).toBeGreaterThan(lowSignal.probability5min);
  });

  it('should include features in prediction result', () => {
    const predictor = new XGBoostPredictor();
    const features = { a: 1, b: 2 };
    const result = predictor.predict(features);
    expect(result.features).toEqual(features);
  });
});
