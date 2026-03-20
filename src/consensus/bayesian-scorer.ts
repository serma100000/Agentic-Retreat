/**
 * Bayesian confidence scoring for multi-signal outage detection.
 *
 * Uses Bayes' theorem in odds form for numerical stability.
 * Supports streaming updates and correlation-discounted signal combination.
 */

import type { BayesianState, Signal, SignalSourceType } from './types.js';
import { SignalSource } from './types.js';

/** Default per-source weights for confidence combination. */
const DEFAULT_SIGNAL_WEIGHTS: Record<SignalSourceType, number> = {
  [SignalSource.REPORT]: 0.25,
  [SignalSource.PROBE]: 0.30,
  [SignalSource.SOCIAL]: 0.15,
  [SignalSource.STATUSPAGE]: 0.10,
  [SignalSource.ML_AUTOENCODER]: 0.12,
  [SignalSource.ML_PREDICTIVE]: 0.08,
};

/**
 * Learned likelihood ratios: P(signal | outage) / P(signal | no outage).
 * Higher values mean the signal is more indicative of a real outage.
 */
const LIKELIHOOD_RATIOS: Record<SignalSourceType, number> = {
  [SignalSource.PROBE]: 15.0,
  [SignalSource.REPORT]: 8.0,
  [SignalSource.ML_AUTOENCODER]: 6.0,
  [SignalSource.ML_PREDICTIVE]: 5.0,
  [SignalSource.SOCIAL]: 4.0,
  [SignalSource.STATUSPAGE]: 12.0,
};

/**
 * Correlation groups: sources in the same group share underlying causes
 * and receive a discount when combined.
 */
const CORRELATION_GROUPS: SignalSourceType[][] = [
  [SignalSource.ML_AUTOENCODER, SignalSource.ML_PREDICTIVE],
  [SignalSource.REPORT, SignalSource.SOCIAL],
];

const CORRELATION_DISCOUNT = 0.6;

export class BayesianScorer {
  private readonly signalWeights: Record<SignalSourceType, number>;

  constructor(signalWeights?: Record<SignalSourceType, number>) {
    this.signalWeights = signalWeights ?? { ...DEFAULT_SIGNAL_WEIGHTS };
  }

  /**
   * Compute prior probability of outage from historical rate.
   * E.g., 0.01 means the service is in outage 1% of the time.
   */
  computePrior(serviceId: string, historicalOutageRate: number): number {
    // Clamp to valid probability range
    return Math.max(0.001, Math.min(0.999, historicalOutageRate));
  }

  /**
   * Compute likelihood P(signals | outage) using per-signal likelihood ratios.
   * Product of individual signal likelihoods, scaled by signal confidence and score.
   */
  computeLikelihood(signals: Signal[]): number {
    if (signals.length === 0) return 0;

    let logLikelihood = 0;

    for (const signal of signals) {
      const baseRatio = LIKELIHOOD_RATIOS[signal.source] ?? 5.0;
      // Scale likelihood by signal confidence and normalized score
      const scoreMultiplier = Math.min(signal.score / 5.0, 2.0);
      const effectiveRatio = baseRatio * signal.confidence * scoreMultiplier;
      // Use log space for numerical stability
      logLikelihood += Math.log(Math.max(effectiveRatio, 0.01));
    }

    return Math.exp(logLikelihood);
  }

  /**
   * Compute posterior using Bayes' theorem in odds form for numerical stability.
   *
   * Odds form:  posterior_odds = likelihood_ratio * prior_odds
   * Then convert back: posterior = posterior_odds / (1 + posterior_odds)
   */
  computePosterior(prior: number, likelihood: number): number {
    if (prior <= 0 || prior >= 1) {
      return Math.max(0, Math.min(1, prior));
    }
    if (likelihood <= 0) return 0;

    const priorOdds = prior / (1 - prior);
    const posteriorOdds = likelihood * priorOdds;

    // Convert back from odds to probability
    const posterior = posteriorOdds / (1 + posteriorOdds);

    return Math.max(0, Math.min(1, posterior));
  }

  /**
   * Streaming Bayesian update: incorporate a new signal without recomputing from scratch.
   * Uses the current posterior as the new prior and updates with the single new signal.
   */
  updatePosterior(currentState: BayesianState, newSignal: Signal): BayesianState {
    const newPrior = currentState.posterior;
    const singleLikelihood = this.computeLikelihood([newSignal]);
    const newPosterior = this.computePosterior(newPrior, singleLikelihood);

    return {
      prior: newPrior,
      likelihood: singleLikelihood,
      posterior: newPosterior,
      signals: [...currentState.signals, newSignal],
      lastUpdated: newSignal.timestamp,
    };
  }

  /**
   * Combine independent signals into a single confidence score.
   * Applies correlation discount when signals share underlying causes.
   */
  combineIndependentSignals(signals: Signal[]): {
    combinedConfidence: number;
    dominantSignal: SignalSourceType;
  } {
    if (signals.length === 0) {
      return { combinedConfidence: 0, dominantSignal: SignalSource.REPORT };
    }

    // Group signals by source
    const bySource = new Map<SignalSourceType, Signal[]>();
    for (const signal of signals) {
      const existing = bySource.get(signal.source);
      if (existing) {
        existing.push(signal);
      } else {
        bySource.set(signal.source, [signal]);
      }
    }

    // Compute per-source contribution (best signal per source)
    const sourceContributions = new Map<SignalSourceType, number>();
    for (const [source, sourceSignals] of bySource) {
      const bestConfidence = Math.max(...sourceSignals.map((s) => s.confidence));
      const weight = this.signalWeights[source] ?? 0.1;
      sourceContributions.set(source, bestConfidence * weight);
    }

    // Apply correlation discount
    const adjustedContributions = new Map(sourceContributions);
    for (const group of CORRELATION_GROUPS) {
      const presentInGroup = group.filter((s) => adjustedContributions.has(s));
      if (presentInGroup.length > 1) {
        // Keep the strongest signal at full weight, discount others
        const sorted = presentInGroup.sort(
          (a, b) => (adjustedContributions.get(b) ?? 0) - (adjustedContributions.get(a) ?? 0),
        );
        for (let i = 1; i < sorted.length; i++) {
          const current = adjustedContributions.get(sorted[i]!) ?? 0;
          adjustedContributions.set(sorted[i]!, current * CORRELATION_DISCOUNT);
        }
      }
    }

    // Sum weighted contributions
    let totalWeightedConfidence = 0;
    let totalWeight = 0;
    for (const [source, contribution] of adjustedContributions) {
      totalWeightedConfidence += contribution;
      totalWeight += this.signalWeights[source] ?? 0.1;
    }

    // Base confidence from weighted average
    const baseConfidence = totalWeight > 0
      ? totalWeightedConfidence / totalWeight
      : 0;

    // Independence boost: more independent sources increase confidence.
    // Each additional source beyond the first adds a small multiplier.
    const uniqueSourceCount = bySource.size;
    const independenceBoost = 1.0 + (uniqueSourceCount - 1) * 0.05;

    const combinedConfidence = Math.min(1.0, baseConfidence * independenceBoost);

    // Find dominant signal (highest raw contribution)
    let dominantSignal: SignalSourceType = SignalSource.REPORT;
    let maxContribution = -1;
    for (const [source, contribution] of sourceContributions) {
      if (contribution > maxContribution) {
        maxContribution = contribution;
        dominantSignal = source;
      }
    }

    return { combinedConfidence, dominantSignal };
  }
}
