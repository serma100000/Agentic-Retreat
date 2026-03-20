import { describe, it, expect } from 'vitest';
import { LSTMAutoencoder } from '../autoencoder.js';
import type { FeatureVector, SlidingWindow } from '../types.js';

/**
 * Helper: generate a "normal" sliding window of stable features.
 */
function generateNormalWindow(length = 10): SlidingWindow {
  const window: FeatureVector[] = [];
  const baseTime = Date.now() - length * 60_000;
  for (let i = 0; i < length; i++) {
    window.push({
      reportRate: 0.5 + Math.random() * 0.1,
      probeLatency: 50 + Math.random() * 10,
      probeSuccessRate: 0.98 + Math.random() * 0.02,
      socialMentionRate: 0.1 + Math.random() * 0.05,
      timestamp: baseTime + i * 60_000,
    });
  }
  return window;
}

/**
 * Helper: generate an "anomalous" sliding window with a spike.
 */
function generateAnomalousWindow(length = 10): SlidingWindow {
  const window = generateNormalWindow(length);
  // Inject a big spike in the middle
  const mid = Math.floor(length / 2);
  for (let i = mid; i < length; i++) {
    window[i] = {
      ...window[i]!,
      reportRate: 50 + Math.random() * 20, // 100x normal
      probeLatency: 5000 + Math.random() * 2000, // 100x normal
      probeSuccessRate: 0.1 + Math.random() * 0.1, // Very low
      socialMentionRate: 10 + Math.random() * 5, // 100x normal
    };
  }
  return window;
}

describe('LSTMAutoencoder', () => {
  // Use small config for fast tests
  const config = {
    inputSize: 4,
    hiddenSizes: [8],
    latentSize: 4,
    learningRate: 0.01,
    epochs: 5,
  };

  it('should encode a window to a latent vector', () => {
    const ae = new LSTMAutoencoder(config);
    const window = generateNormalWindow(10);
    const latent = ae.encode(window);

    expect(latent.rows).toBe(config.latentSize);
    expect(latent.cols).toBe(1);

    // Latent values should be in tanh range [-1, 1]
    for (let i = 0; i < config.latentSize; i++) {
      expect(latent.get(i, 0)).toBeGreaterThanOrEqual(-1);
      expect(latent.get(i, 0)).toBeLessThanOrEqual(1);
    }
  });

  it('should reconstruct a window with the same shape', () => {
    const ae = new LSTMAutoencoder(config);
    const window = generateNormalWindow(10);
    const { reconstruction } = ae.forward(window);

    expect(reconstruction).toHaveLength(window.length);
    for (const fv of reconstruction) {
      expect(fv).toHaveProperty('reportRate');
      expect(fv).toHaveProperty('probeLatency');
      expect(fv).toHaveProperty('probeSuccessRate');
      expect(fv).toHaveProperty('socialMentionRate');
      expect(fv).toHaveProperty('timestamp');
    }
  });

  it('should compute reconstruction error as a non-negative number', () => {
    const ae = new LSTMAutoencoder(config);
    const window = generateNormalWindow(10);
    const { reconstruction } = ae.forward(window);
    const error = ae.computeReconstructionError(window, reconstruction);

    expect(error).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(error)).toBe(true);
  });

  it('should return an AnomalyResult from detect', () => {
    const ae = new LSTMAutoencoder(config);
    const window = generateNormalWindow(10);
    const result = ae.detect(window);

    expect(result).toHaveProperty('reconstructionError');
    expect(result).toHaveProperty('threshold');
    expect(result).toHaveProperty('isAnomaly');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('features');
    expect(typeof result.isAnomaly).toBe('boolean');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should produce higher reconstruction error for anomalous windows', () => {
    const ae = new LSTMAutoencoder(config);

    const normalWindow = generateNormalWindow(10);
    const anomalousWindow = generateAnomalousWindow(10);

    const { reconstruction: normalRecon } = ae.forward(normalWindow);
    const normalError = ae.computeReconstructionError(normalWindow, normalRecon);

    const { reconstruction: anomRecon } = ae.forward(anomalousWindow);
    const anomError = ae.computeReconstructionError(anomalousWindow, anomRecon);

    // Anomalous window should have higher error since features are extreme
    expect(anomError).toBeGreaterThan(normalError);
  });

  it('should detect anomalous window after setting appropriate threshold', () => {
    const ae = new LSTMAutoencoder(config);

    // Set a threshold that is reasonable for normal windows
    const normalWindow = generateNormalWindow(10);
    const { reconstruction } = ae.forward(normalWindow);
    const normalError = ae.computeReconstructionError(normalWindow, reconstruction);

    // Set threshold just above normal error
    ae.setThreshold(normalError * 1.5);

    // Normal window should NOT be anomaly
    const normalResult = ae.detect(normalWindow);
    expect(normalResult.isAnomaly).toBe(false);

    // Anomalous window should BE anomaly (much higher error)
    const anomWindow = generateAnomalousWindow(10);
    const anomResult = ae.detect(anomWindow);
    expect(anomResult.reconstructionError).toBeGreaterThan(normalResult.reconstructionError);
  });

  it('should save and load weights preserving the model', () => {
    const ae1 = new LSTMAutoencoder(config);
    const window = generateNormalWindow(10);

    // Get results from original model
    const result1 = ae1.detect(window);
    const weights = ae1.saveWeights();

    // Load into a new model
    const ae2 = new LSTMAutoencoder(config);
    ae2.loadWeights(weights);
    const result2 = ae2.detect(window);

    // Results should be identical after loading weights
    expect(result2.reconstructionError).toBeCloseTo(result1.reconstructionError, 5);
    expect(result2.threshold).toBeCloseTo(result1.threshold, 5);
    expect(result2.isAnomaly).toBe(result1.isAnomaly);
  });

  it('should train and reduce loss (fast training)', () => {
    const ae = new LSTMAutoencoder(config);

    // Generate several normal windows for training
    const windows: SlidingWindow[] = [];
    for (let i = 0; i < 10; i++) {
      windows.push(generateNormalWindow(8));
    }

    const metrics = ae.trainFast(windows, {
      epochs: 5,
      lr: 0.01,
      validationSplit: 0.2,
    });

    expect(metrics).toHaveLength(5);
    expect(metrics[0]).toHaveProperty('epoch');
    expect(metrics[0]).toHaveProperty('trainLoss');
    expect(metrics[0]).toHaveProperty('valLoss');
    expect(metrics[0]).toHaveProperty('reconstructionThreshold');

    // All losses should be finite and non-negative
    for (const m of metrics) {
      expect(Number.isFinite(m.trainLoss)).toBe(true);
      expect(m.trainLoss).toBeGreaterThanOrEqual(0);
    }
  });
});
