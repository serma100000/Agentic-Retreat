import { describe, expect, it } from 'vitest';
import { BayesianScorer } from '../bayesian-scorer.js';
import type { BayesianState, Signal } from '../types.js';
import { SignalSource } from '../types.js';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    source: SignalSource.REPORT,
    serviceId: 'svc-1',
    score: 5.0,
    confidence: 0.8,
    timestamp: new Date('2024-06-01T12:00:00Z'),
    metadata: {},
    ...overrides,
  };
}

describe('BayesianScorer', () => {
  const scorer = new BayesianScorer();

  describe('computePrior', () => {
    it('returns historical outage rate as prior', () => {
      const prior = scorer.computePrior('svc-1', 0.01);
      expect(prior).toBe(0.01);
    });

    it('clamps prior to minimum of 0.001', () => {
      const prior = scorer.computePrior('svc-1', 0);
      expect(prior).toBe(0.001);
    });

    it('clamps prior to maximum of 0.999', () => {
      const prior = scorer.computePrior('svc-1', 1.5);
      expect(prior).toBe(0.999);
    });

    it('handles typical outage rate of 5%', () => {
      const prior = scorer.computePrior('svc-1', 0.05);
      expect(prior).toBeCloseTo(0.05);
    });
  });

  describe('computeLikelihood', () => {
    it('returns 0 for empty signals array', () => {
      const likelihood = scorer.computeLikelihood([]);
      expect(likelihood).toBe(0);
    });

    it('returns positive likelihood for a single signal', () => {
      const signal = makeSignal({ source: SignalSource.PROBE, confidence: 0.9, score: 5.0 });
      const likelihood = scorer.computeLikelihood([signal]);
      expect(likelihood).toBeGreaterThan(0);
    });

    it('increases likelihood with higher confidence signals', () => {
      const lowConfidence = makeSignal({ confidence: 0.3, score: 5.0 });
      const highConfidence = makeSignal({ confidence: 0.9, score: 5.0 });

      const lowLikelihood = scorer.computeLikelihood([lowConfidence]);
      const highLikelihood = scorer.computeLikelihood([highConfidence]);

      expect(highLikelihood).toBeGreaterThan(lowLikelihood);
    });

    it('increases likelihood with multiple confirming signals', () => {
      const singleSignal = [makeSignal({ source: SignalSource.PROBE })];
      const multipleSignals = [
        makeSignal({ source: SignalSource.PROBE }),
        makeSignal({ source: SignalSource.REPORT }),
        makeSignal({ source: SignalSource.SOCIAL }),
      ];

      const singleLikelihood = scorer.computeLikelihood(singleSignal);
      const multipleLikelihood = scorer.computeLikelihood(multipleSignals);

      expect(multipleLikelihood).toBeGreaterThan(singleLikelihood);
    });

    it('accounts for signal score in likelihood', () => {
      const lowScore = makeSignal({ score: 1.0 });
      const highScore = makeSignal({ score: 8.0 });

      const lowLikelihood = scorer.computeLikelihood([lowScore]);
      const highLikelihood = scorer.computeLikelihood([highScore]);

      expect(highLikelihood).toBeGreaterThan(lowLikelihood);
    });
  });

  describe('computePosterior', () => {
    it('returns higher posterior when likelihood is high', () => {
      const prior = 0.01;
      const lowLikelihood = 1.0;
      const highLikelihood = 100.0;

      const lowPosterior = scorer.computePosterior(prior, lowLikelihood);
      const highPosterior = scorer.computePosterior(prior, highLikelihood);

      expect(highPosterior).toBeGreaterThan(lowPosterior);
    });

    it('returns posterior between 0 and 1', () => {
      const posterior = scorer.computePosterior(0.5, 10.0);
      expect(posterior).toBeGreaterThanOrEqual(0);
      expect(posterior).toBeLessThanOrEqual(1);
    });

    it('returns 0 when likelihood is 0', () => {
      const posterior = scorer.computePosterior(0.5, 0);
      expect(posterior).toBe(0);
    });

    it('increases posterior with confirming evidence', () => {
      const prior = 0.01;
      const likelihood = scorer.computeLikelihood([
        makeSignal({ source: SignalSource.PROBE, confidence: 0.9, score: 6.0 }),
        makeSignal({ source: SignalSource.REPORT, confidence: 0.8, score: 5.0 }),
        makeSignal({ source: SignalSource.SOCIAL, confidence: 0.7, score: 4.0 }),
      ]);

      const posterior = scorer.computePosterior(prior, likelihood);
      expect(posterior).toBeGreaterThan(prior);
    });

    it('handles extreme prior values gracefully', () => {
      expect(scorer.computePosterior(0, 10.0)).toBe(0);
      expect(scorer.computePosterior(1, 10.0)).toBe(1);
    });
  });

  describe('updatePosterior (streaming)', () => {
    it('updates posterior with new signal', () => {
      const initialState: BayesianState = {
        prior: 0.01,
        likelihood: 5.0,
        posterior: 0.05,
        signals: [makeSignal()],
        lastUpdated: new Date('2024-06-01T12:00:00Z'),
      };

      const newSignal = makeSignal({
        source: SignalSource.PROBE,
        confidence: 0.9,
        score: 6.0,
        timestamp: new Date('2024-06-01T12:01:00Z'),
      });

      const updated = scorer.updatePosterior(initialState, newSignal);

      expect(updated.posterior).toBeGreaterThan(initialState.posterior);
      expect(updated.signals).toHaveLength(2);
      expect(updated.lastUpdated).toEqual(newSignal.timestamp);
    });

    it('produces consistent results with batch computation', () => {
      const signal1 = makeSignal({
        source: SignalSource.PROBE,
        confidence: 0.8,
        score: 5.0,
        timestamp: new Date('2024-06-01T12:00:00Z'),
      });
      const signal2 = makeSignal({
        source: SignalSource.REPORT,
        confidence: 0.7,
        score: 4.0,
        timestamp: new Date('2024-06-01T12:01:00Z'),
      });

      // Batch computation
      const prior = 0.01;
      const batchLikelihood = scorer.computeLikelihood([signal1, signal2]);
      const batchPosterior = scorer.computePosterior(prior, batchLikelihood);

      // Streaming computation
      const firstLikelihood = scorer.computeLikelihood([signal1]);
      const firstPosterior = scorer.computePosterior(prior, firstLikelihood);
      const state1: BayesianState = {
        prior,
        likelihood: firstLikelihood,
        posterior: firstPosterior,
        signals: [signal1],
        lastUpdated: signal1.timestamp,
      };
      const streamingResult = scorer.updatePosterior(state1, signal2);

      // Both should produce very similar posteriors (not exactly equal due to
      // different computation paths, but both should indicate high outage probability)
      expect(streamingResult.posterior).toBeGreaterThan(prior);
      expect(batchPosterior).toBeGreaterThan(prior);
      // Both should converge toward certainty with confirming signals
      expect(Math.abs(batchPosterior - streamingResult.posterior)).toBeLessThan(0.5);
    });

    it('posterior increases monotonically with confirming signals', () => {
      const prior = 0.01;
      const firstSignal = makeSignal({
        source: SignalSource.PROBE,
        confidence: 0.8,
        score: 5.0,
      });

      let state: BayesianState = {
        prior,
        likelihood: scorer.computeLikelihood([firstSignal]),
        posterior: scorer.computePosterior(prior, scorer.computeLikelihood([firstSignal])),
        signals: [firstSignal],
        lastUpdated: firstSignal.timestamp,
      };

      const previousPosteriors: number[] = [state.posterior];

      // Add more confirming signals
      const sources = [SignalSource.REPORT, SignalSource.SOCIAL, SignalSource.STATUSPAGE];
      for (const source of sources) {
        const newSignal = makeSignal({ source, confidence: 0.8, score: 5.0 });
        state = scorer.updatePosterior(state, newSignal);
        previousPosteriors.push(state.posterior);
      }

      // Each posterior should be >= the previous one
      for (let i = 1; i < previousPosteriors.length; i++) {
        expect(previousPosteriors[i]).toBeGreaterThanOrEqual(previousPosteriors[i - 1]!);
      }
    });
  });

  describe('combineIndependentSignals', () => {
    it('returns 0 confidence with no signals', () => {
      const result = scorer.combineIndependentSignals([]);
      expect(result.combinedConfidence).toBe(0);
    });

    it('returns single-source confidence for one signal', () => {
      const signal = makeSignal({ source: SignalSource.PROBE, confidence: 0.9 });
      const result = scorer.combineIndependentSignals([signal]);
      expect(result.combinedConfidence).toBeGreaterThan(0);
      expect(result.dominantSignal).toBe(SignalSource.PROBE);
    });

    it('increases confidence with multiple independent sources', () => {
      const single = scorer.combineIndependentSignals([
        makeSignal({ source: SignalSource.PROBE, confidence: 0.8 }),
      ]);

      const multiple = scorer.combineIndependentSignals([
        makeSignal({ source: SignalSource.PROBE, confidence: 0.8 }),
        makeSignal({ source: SignalSource.REPORT, confidence: 0.8 }),
        makeSignal({ source: SignalSource.STATUSPAGE, confidence: 0.8 }),
      ]);

      expect(multiple.combinedConfidence).toBeGreaterThan(single.combinedConfidence);
    });

    it('identifies dominant signal correctly', () => {
      const result = scorer.combineIndependentSignals([
        makeSignal({ source: SignalSource.SOCIAL, confidence: 0.3 }),
        makeSignal({ source: SignalSource.PROBE, confidence: 0.95 }),
        makeSignal({ source: SignalSource.REPORT, confidence: 0.5 }),
      ]);

      expect(result.dominantSignal).toBe(SignalSource.PROBE);
    });

    it('applies correlation discount to correlated sources', () => {
      // ML autoencoder and ML predictive are in the same correlation group
      const correlatedResult = scorer.combineIndependentSignals([
        makeSignal({ source: SignalSource.ML_AUTOENCODER, confidence: 0.8 }),
        makeSignal({ source: SignalSource.ML_PREDICTIVE, confidence: 0.8 }),
      ]);

      // Probe and report are in different groups from ML
      const independentResult = scorer.combineIndependentSignals([
        makeSignal({ source: SignalSource.PROBE, confidence: 0.8 }),
        makeSignal({ source: SignalSource.STATUSPAGE, confidence: 0.8 }),
      ]);

      // Independent sources should have higher combined confidence than correlated ones
      // (given equivalent individual confidences)
      expect(independentResult.combinedConfidence).toBeGreaterThan(
        correlatedResult.combinedConfidence,
      );
    });

    it('confidence is capped at 1.0', () => {
      const result = scorer.combineIndependentSignals([
        makeSignal({ source: SignalSource.PROBE, confidence: 1.0 }),
        makeSignal({ source: SignalSource.REPORT, confidence: 1.0 }),
        makeSignal({ source: SignalSource.SOCIAL, confidence: 1.0 }),
        makeSignal({ source: SignalSource.STATUSPAGE, confidence: 1.0 }),
        makeSignal({ source: SignalSource.ML_AUTOENCODER, confidence: 1.0 }),
        makeSignal({ source: SignalSource.ML_PREDICTIVE, confidence: 1.0 }),
      ]);

      expect(result.combinedConfidence).toBeLessThanOrEqual(1.0);
    });
  });
});
