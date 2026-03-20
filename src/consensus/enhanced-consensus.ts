/**
 * Enhanced multi-signal consensus engine.
 *
 * Integrates Bayesian scoring, geographic analysis, and status page scraping
 * to provide robust outage state management with hysteresis and multi-source
 * confirmation.
 */

import type {
  ActiveOutage,
  BayesianState,
  OutageClassification,
  OutageStateType,
  RegionStatus,
  ServiceFullStatus,
  Signal,
  SignalSourceType,
} from './types.js';
import { GeographicScope, OutageState, SignalSource } from './types.js';
import { BayesianScorer } from './bayesian-scorer.js';
import { GeographicAnalyzer } from './geographic-analyzer.js';
import { StatusPageScraper } from './status-page-scraper.js';
import { getHysteresisDuration, isValidTransition } from './transition-rules.js';

/** Score thresholds for state transition evaluation. */
const SCORE_THRESHOLD_INVESTIGATING = 3.0;
const CONFIDENCE_THRESHOLD_DEGRADED = 0.7;
const CONFIDENCE_THRESHOLD_MAJOR = 0.9;
const SCORE_THRESHOLD_RECOVERING = 2.0;
const SCORE_THRESHOLD_RESOLVED = 1.5;
const SCORE_THRESHOLD_RE_ESCALATE = 3.5;

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface ServiceContext {
  state: OutageStateType;
  confidence: number;
  since: Date;
  signals: Signal[];
  bayesianState: BayesianState | null;
  geographic: OutageClassification | null;
  regionData: RegionStatus[];
  lastSignalTime: Date | null;
  /** When the current state was first entered (for hysteresis). */
  stateEnteredAt: Date;
  /** Timeline of state changes. */
  timeline: Array<{ state: OutageStateType; at: Date }>;
  /** For tracking hysteresis: when transition conditions first became true. */
  pendingTransition: {
    to: OutageStateType;
    conditionsMetAt: Date;
  } | null;
}

type EventHandler = (eventName: string, data: Record<string, unknown>) => void;

export interface ProcessSignalResult {
  stateChanged: boolean;
  newState?: OutageStateType;
  confidence: number;
  classification: OutageClassification | null;
}

export class EnhancedConsensusEngine {
  readonly bayesianScorer: BayesianScorer;
  readonly geographicAnalyzer: GeographicAnalyzer;
  readonly statusPageScraper: StatusPageScraper;

  private readonly services = new Map<string, ServiceContext>();
  private readonly eventHandlers: EventHandler[] = [];
  private readonly signalWindowMs: number;
  private readonly defaultPrior: number;

  constructor(options?: {
    signalWindowMs?: number;
    defaultPrior?: number;
    fetchFn?: typeof globalThis.fetch;
  }) {
    this.signalWindowMs = options?.signalWindowMs ?? FIFTEEN_MINUTES_MS;
    this.defaultPrior = options?.defaultPrior ?? 0.01;
    this.bayesianScorer = new BayesianScorer();
    this.geographicAnalyzer = new GeographicAnalyzer();
    this.statusPageScraper = new StatusPageScraper(options?.fetchFn);
  }

  /**
   * Register an event handler.
   * Events: 'state_changed', 'confidence_updated', 'geographic_change'
   */
  on(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Process a signal from any source. Updates Bayesian state, checks geographic
   * spread, and evaluates state transitions with hysteresis.
   */
  processSignal(signal: Signal): ProcessSignalResult {
    const ctx = this.getOrCreateContext(signal.serviceId);
    const now = signal.timestamp;

    // Store signal and prune old ones
    ctx.signals.push(signal);
    ctx.lastSignalTime = now;
    this.pruneOldSignals(ctx, now);

    // Update Bayesian state
    this.updateBayesianState(ctx, signal);

    // Update geographic classification if we have region data
    const previousGeo = ctx.geographic;
    if (ctx.regionData.length > 0) {
      ctx.geographic = this.geographicAnalyzer.analyzeSpread(signal.serviceId, ctx.regionData);
    }

    // Emit geographic change if scope changed
    if (previousGeo && ctx.geographic && previousGeo.scope !== ctx.geographic.scope) {
      this.emit('geographic_change', {
        serviceId: signal.serviceId,
        previousScope: previousGeo.scope,
        newScope: ctx.geographic.scope,
      });
    }

    // Compute combined confidence
    const { combinedConfidence } = this.bayesianScorer.combineIndependentSignals(ctx.signals);
    const oldConfidence = ctx.confidence;
    ctx.confidence = combinedConfidence;

    if (Math.abs(oldConfidence - combinedConfidence) > 0.05) {
      this.emit('confidence_updated', {
        serviceId: signal.serviceId,
        confidence: combinedConfidence,
      });
    }

    // Evaluate state transitions
    const transitionResult = this.evaluateTransitions(signal.serviceId, ctx, now);

    return {
      stateChanged: transitionResult.changed,
      newState: transitionResult.changed ? ctx.state : undefined,
      confidence: ctx.confidence,
      classification: ctx.geographic,
    };
  }

  /**
   * Update the region data for a service (used for geographic analysis).
   */
  updateRegionData(serviceId: string, regionData: RegionStatus[]): void {
    const ctx = this.getOrCreateContext(serviceId);
    ctx.regionData = regionData;
    ctx.geographic = this.geographicAnalyzer.analyzeSpread(serviceId, regionData);
  }

  /**
   * Check for time-based transitions (e.g., INVESTIGATING -> OPERATIONAL after 10 min silence).
   */
  checkTimeouts(serviceId: string, now: Date = new Date()): ProcessSignalResult {
    const ctx = this.getOrCreateContext(serviceId);
    const transitionResult = this.evaluateTimeBasedTransitions(serviceId, ctx, now);

    return {
      stateChanged: transitionResult.changed,
      newState: transitionResult.changed ? ctx.state : undefined,
      confidence: ctx.confidence,
      classification: ctx.geographic,
    };
  }

  /**
   * Get full status including state, confidence, signals, geographic info,
   * Bayesian state, and timeline.
   */
  getFullStatus(serviceId: string): ServiceFullStatus {
    const ctx = this.getOrCreateContext(serviceId);
    return {
      state: ctx.state,
      confidence: ctx.confidence,
      signals: [...ctx.signals],
      geographic: ctx.geographic,
      bayesian: ctx.bayesianState,
      timeline: [...ctx.timeline],
    };
  }

  /**
   * Get signal history for a service, optionally limited.
   */
  getSignalHistory(serviceId: string, limit?: number): Signal[] {
    const ctx = this.services.get(serviceId);
    if (!ctx) return [];
    const signals = [...ctx.signals];
    if (limit !== undefined && limit > 0) {
      return signals.slice(-limit);
    }
    return signals;
  }

  /**
   * Get all services currently in an outage state (not OPERATIONAL or RESOLVED).
   */
  getActiveOutages(): ActiveOutage[] {
    const outages: ActiveOutage[] = [];
    for (const [serviceId, ctx] of this.services) {
      if (
        ctx.state !== OutageState.OPERATIONAL &&
        ctx.state !== OutageState.RESOLVED
      ) {
        outages.push({
          serviceId,
          state: ctx.state,
          confidence: ctx.confidence,
          since: ctx.since,
          geographic: ctx.geographic,
        });
      }
    }
    return outages;
  }

  // ---- Private ----

  private getOrCreateContext(serviceId: string): ServiceContext {
    let ctx = this.services.get(serviceId);
    if (!ctx) {
      const now = new Date();
      ctx = {
        state: OutageState.OPERATIONAL,
        confidence: 0,
        since: now,
        signals: [],
        bayesianState: null,
        geographic: null,
        regionData: [],
        lastSignalTime: null,
        stateEnteredAt: now,
        timeline: [{ state: OutageState.OPERATIONAL, at: now }],
        pendingTransition: null,
      };
      this.services.set(serviceId, ctx);
    }
    return ctx;
  }

  private updateBayesianState(ctx: ServiceContext, signal: Signal): void {
    if (!ctx.bayesianState) {
      const prior = this.bayesianScorer.computePrior(signal.serviceId, this.defaultPrior);
      const likelihood = this.bayesianScorer.computeLikelihood([signal]);
      const posterior = this.bayesianScorer.computePosterior(prior, likelihood);
      ctx.bayesianState = {
        prior,
        likelihood,
        posterior,
        signals: [signal],
        lastUpdated: signal.timestamp,
      };
    } else {
      ctx.bayesianState = this.bayesianScorer.updatePosterior(ctx.bayesianState, signal);
    }
  }

  private evaluateTransitions(
    serviceId: string,
    ctx: ServiceContext,
    now: Date,
  ): { changed: boolean } {
    const currentState = ctx.state;
    const uniqueSources = this.countUniqueSources(ctx.signals);
    const bayesianConfidence = ctx.bayesianState?.posterior ?? 0;
    const combinedConfidence = ctx.confidence;
    const maxScore = this.computeRecentMaxScore(ctx, now);
    const geoScope = ctx.geographic?.scope ?? GeographicScope.LOCALIZED;

    switch (currentState) {
      case OutageState.OPERATIONAL: {
        if (maxScore > SCORE_THRESHOLD_INVESTIGATING) {
          return this.attemptTransition(serviceId, ctx, OutageState.INVESTIGATING, now);
        }
        break;
      }

      case OutageState.INVESTIGATING: {
        // Check for escalation to DEGRADED
        if (uniqueSources >= 2 && combinedConfidence > CONFIDENCE_THRESHOLD_DEGRADED) {
          return this.attemptTransition(serviceId, ctx, OutageState.DEGRADED, now);
        }
        break;
      }

      case OutageState.DEGRADED: {
        // Check for escalation to MAJOR_OUTAGE
        const meetsSourceReq = uniqueSources >= 3;
        const meetsConfidence = combinedConfidence > CONFIDENCE_THRESHOLD_MAJOR ||
          bayesianConfidence > CONFIDENCE_THRESHOLD_MAJOR;
        const meetsGeo = geoScope === GeographicScope.REGIONAL ||
          geoScope === GeographicScope.GLOBAL;

        if (meetsSourceReq && meetsConfidence && meetsGeo) {
          return this.attemptTransition(serviceId, ctx, OutageState.MAJOR_OUTAGE, now);
        }

        // Check for de-escalation to RECOVERING
        if (maxScore < SCORE_THRESHOLD_RECOVERING) {
          return this.attemptTransition(serviceId, ctx, OutageState.RECOVERING, now);
        }
        break;
      }

      case OutageState.MAJOR_OUTAGE: {
        // Check for RECOVERING: declining signals
        if (maxScore < SCORE_THRESHOLD_RECOVERING) {
          return this.attemptTransition(serviceId, ctx, OutageState.RECOVERING, now);
        }
        break;
      }

      case OutageState.RECOVERING: {
        // Check for RESOLVED: all signals at baseline for duration
        const duration = now.getTime() - ctx.stateEnteredAt.getTime();
        if (maxScore < SCORE_THRESHOLD_RESOLVED && duration >= FIFTEEN_MINUTES_MS) {
          return this.attemptTransition(serviceId, ctx, OutageState.RESOLVED, now);
        }

        // Check for re-escalation to MAJOR_OUTAGE
        if (maxScore > SCORE_THRESHOLD_RE_ESCALATE && uniqueSources >= 2) {
          return this.attemptTransition(serviceId, ctx, OutageState.MAJOR_OUTAGE, now);
        }
        break;
      }

      case OutageState.RESOLVED: {
        // New outage after resolution
        if (maxScore > SCORE_THRESHOLD_INVESTIGATING) {
          return this.attemptTransition(serviceId, ctx, OutageState.INVESTIGATING, now);
        }
        break;
      }
    }

    return { changed: false };
  }

  private evaluateTimeBasedTransitions(
    serviceId: string,
    ctx: ServiceContext,
    now: Date,
  ): { changed: boolean } {
    if (ctx.state === OutageState.INVESTIGATING) {
      if (ctx.lastSignalTime) {
        const silenceDuration = now.getTime() - ctx.lastSignalTime.getTime();
        if (silenceDuration >= TEN_MINUTES_MS) {
          return this.attemptTransition(serviceId, ctx, OutageState.OPERATIONAL, now);
        }
      }
    }
    return { changed: false };
  }

  private attemptTransition(
    serviceId: string,
    ctx: ServiceContext,
    targetState: OutageStateType,
    now: Date,
  ): { changed: boolean } {
    if (!isValidTransition(ctx.state, targetState)) {
      return { changed: false };
    }

    const hysteresis = getHysteresisDuration(ctx.state, targetState);

    if (hysteresis === 0) {
      // Immediate transition
      this.transitionTo(serviceId, ctx, targetState, now);
      return { changed: true };
    }

    // Check if we have a pending transition to this state
    if (ctx.pendingTransition?.to === targetState) {
      const elapsed = now.getTime() - ctx.pendingTransition.conditionsMetAt.getTime();
      if (elapsed >= hysteresis) {
        ctx.pendingTransition = null;
        this.transitionTo(serviceId, ctx, targetState, now);
        return { changed: true };
      }
      // Still waiting for hysteresis
      return { changed: false };
    }

    // Start a new pending transition
    ctx.pendingTransition = {
      to: targetState,
      conditionsMetAt: now,
    };

    // For the enhanced engine, if duration since state entry already exceeds hysteresis,
    // allow immediate transition (conditions were sustained the whole time)
    const timeInCurrentState = now.getTime() - ctx.stateEnteredAt.getTime();
    if (timeInCurrentState >= hysteresis) {
      ctx.pendingTransition = null;
      this.transitionTo(serviceId, ctx, targetState, now);
      return { changed: true };
    }

    return { changed: false };
  }

  private transitionTo(
    serviceId: string,
    ctx: ServiceContext,
    newState: OutageStateType,
    now: Date,
  ): void {
    const previousState = ctx.state;
    ctx.state = newState;
    ctx.since = now;
    ctx.stateEnteredAt = now;
    ctx.pendingTransition = null;
    ctx.timeline.push({ state: newState, at: now });

    this.emit('state_changed', {
      serviceId,
      from: previousState,
      to: newState,
      confidence: ctx.confidence,
      timestamp: now.toISOString(),
    });
  }

  private countUniqueSources(signals: Signal[]): number {
    const sources = new Set<SignalSourceType>();
    for (const s of signals) {
      sources.add(s.source);
    }
    return sources.size;
  }

  /**
   * Compute the effective max score using recency weighting.
   * Recent signals (within 2 minutes) have full weight; older signals decay.
   * This ensures that a low recent score can override older high scores.
   */
  private computeRecentMaxScore(ctx: ServiceContext, now: Date): number {
    if (ctx.signals.length === 0) return 0;

    const RECENT_WINDOW_MS = 2 * 60 * 1000;
    const recentSignals = ctx.signals.filter(
      (s) => now.getTime() - s.timestamp.getTime() <= RECENT_WINDOW_MS,
    );

    if (recentSignals.length > 0) {
      // Use max score from recent signals only
      return recentSignals.reduce((max, s) => Math.max(max, s.score), 0);
    }

    // If no recent signals, use decayed max from all signals
    let maxWeightedScore = 0;
    for (const s of ctx.signals) {
      const ageMs = now.getTime() - s.timestamp.getTime();
      const decay = Math.exp(-ageMs / (5 * 60 * 1000)); // 5-minute half-life
      maxWeightedScore = Math.max(maxWeightedScore, s.score * decay);
    }
    return maxWeightedScore;
  }

  private pruneOldSignals(ctx: ServiceContext, now: Date): void {
    const cutoff = now.getTime() - this.signalWindowMs;
    ctx.signals = ctx.signals.filter((s) => s.timestamp.getTime() >= cutoff);
  }

  private emit(eventName: string, data: Record<string, unknown>): void {
    for (const handler of this.eventHandlers) {
      handler(eventName, data);
    }
  }
}
