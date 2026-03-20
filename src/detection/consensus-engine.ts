/**
 * Multi-signal consensus state machine.
 *
 * Maintains per-service outage state and applies transition rules
 * with hysteresis to prevent flapping. Combines detection signals
 * from multiple layers using Bayesian confidence weighting.
 */

import type {
  ConsensusResult,
  DetectionEvent,
  ServiceStateInfo,
  StateTransition,
} from './types.js';
import { DetectionLayer, type DetectionLayerType, OutageState, type OutageStateType } from './types.js';

/** Layer weights for Bayesian confidence combination. */
const LAYER_WEIGHTS: Record<DetectionLayerType, number> = {
  [DetectionLayer.STATISTICAL]: 0.3,
  [DetectionLayer.CUSUM]: 0.3,
  [DetectionLayer.LSTM]: 0.25,
  [DetectionLayer.XGBOOST]: 0.15,
};

/** Timing constants in milliseconds. */
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THREE_MINUTES_MS = 3 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

interface ServiceContext {
  state: OutageStateType;
  confidence: number;
  since: Date;
  lastEventTime: Date | null;
  /** Time we first entered INVESTIGATING. */
  investigatingSince: Date | null;
  /** Time we first entered DEGRADED. */
  degradedSince: Date | null;
  /** Recent detection events for multi-signal analysis. */
  recentEvents: DetectionEvent[];
  /** Time we started recovering (score below recovery threshold). */
  recoveringSince: Date | null;
}

export type StateChangeHandler = (
  serviceId: string,
  transition: StateTransition,
) => void;

export class ConsensusEngine {
  private readonly services = new Map<string, ServiceContext>();
  private readonly stateChangeHandlers: StateChangeHandler[] = [];
  /** Window for keeping recent events (used for multi-signal). */
  private readonly eventWindowMs: number;

  constructor(eventWindowMs = FIFTEEN_MINUTES_MS) {
    this.eventWindowMs = eventWindowMs;
  }

  /**
   * Register a handler that fires on every state transition.
   */
  onStateChange(handler: StateChangeHandler): void {
    this.stateChangeHandlers.push(handler);
  }

  /**
   * Get the current state info for a service.
   */
  getState(serviceId: string): ServiceStateInfo {
    const ctx = this.getOrCreateContext(serviceId);
    return {
      state: ctx.state,
      confidence: ctx.confidence,
      since: ctx.since,
    };
  }

  /**
   * Process a single detection event and potentially transition state.
   */
  processDetectionEvent(
    serviceId: string,
    event: DetectionEvent,
  ): StateTransition | null {
    const ctx = this.getOrCreateContext(serviceId);
    const now = event.timestamp;

    // Store event in recent window
    ctx.recentEvents.push(event);
    this.pruneOldEvents(ctx, now);
    ctx.lastEventTime = now;

    return this.evaluateTransitions(serviceId, ctx, event.anomaly_score, event.confidence, now);
  }

  /**
   * Process multiple signals together for a consensus result.
   */
  processMultiSignalConsensus(
    serviceId: string,
    signals: DetectionEvent[],
  ): ConsensusResult {
    const ctx = this.getOrCreateContext(serviceId);
    const now = signals.length > 0 ? signals[signals.length - 1]!.timestamp : new Date();

    // Add all signals
    for (const signal of signals) {
      ctx.recentEvents.push(signal);
      ctx.lastEventTime = signal.timestamp;
    }
    this.pruneOldEvents(ctx, now);

    // Bayesian confidence combination
    const combinedConfidence = this.computeBayesianConfidence(signals);
    const maxScore = signals.reduce((max, s) => Math.max(max, s.anomaly_score), 0);

    // Evaluate transitions with the combined score/confidence
    this.evaluateTransitions(serviceId, ctx, maxScore, combinedConfidence, now);

    ctx.confidence = combinedConfidence;

    return {
      service_id: serviceId,
      state: ctx.state,
      confidence: combinedConfidence,
      signals: [...ctx.recentEvents],
      timestamp: now,
    };
  }

  /**
   * Tick-based check for time-dependent transitions (e.g., INVESTIGATING -> OPERATIONAL).
   * Should be called periodically.
   */
  checkTimeouts(serviceId: string, now: Date = new Date()): StateTransition | null {
    const ctx = this.getOrCreateContext(serviceId);
    return this.evaluateTimeBasedTransitions(serviceId, ctx, now);
  }

  // ---- Private ----

  private getOrCreateContext(serviceId: string): ServiceContext {
    let ctx = this.services.get(serviceId);
    if (!ctx) {
      ctx = {
        state: OutageState.OPERATIONAL,
        confidence: 0,
        since: new Date(),
        lastEventTime: null,
        investigatingSince: null,
        degradedSince: null,
        recentEvents: [],
        recoveringSince: null,
      };
      this.services.set(serviceId, ctx);
    }
    return ctx;
  }

  private evaluateTransitions(
    serviceId: string,
    ctx: ServiceContext,
    score: number,
    confidence: number,
    now: Date,
  ): StateTransition | null {
    const currentState = ctx.state;

    switch (currentState) {
      case OutageState.OPERATIONAL: {
        if (score > 3.0) {
          return this.transitionTo(serviceId, ctx, OutageState.INVESTIGATING, now, {
            required_duration_ms: 0,
            required_score_threshold: 3.0,
            description: 'Anomaly score exceeds 3.0, beginning investigation',
          });
        }
        break;
      }

      case OutageState.INVESTIGATING: {
        if (!ctx.investigatingSince) {
          ctx.investigatingSince = now;
        }
        const investigatingDuration = now.getTime() - ctx.investigatingSince.getTime();

        if (investigatingDuration >= FIVE_MINUTES_MS && confidence > 0.7) {
          return this.transitionTo(serviceId, ctx, OutageState.DEGRADED, now, {
            required_duration_ms: FIVE_MINUTES_MS,
            required_score_threshold: 3.0,
            description: 'Detection sustained 5+ minutes with confidence > 0.7',
          });
        }
        break;
      }

      case OutageState.DEGRADED: {
        if (!ctx.degradedSince) {
          ctx.degradedSince = now;
        }
        const degradedDuration = now.getTime() - ctx.degradedSince.getTime();
        const independentLayers = this.countIndependentLayers(ctx.recentEvents);

        if (
          (score > 5.0 && degradedDuration >= THREE_MINUTES_MS) ||
          independentLayers >= 3
        ) {
          return this.transitionTo(serviceId, ctx, OutageState.MAJOR_OUTAGE, now, {
            required_duration_ms: THREE_MINUTES_MS,
            required_score_threshold: 5.0,
            description:
              'Score > 5.0 sustained 3+ minutes or 3+ independent detection signals',
          });
        }

        if (score < 2.0) {
          return this.transitionTo(serviceId, ctx, OutageState.RECOVERING, now, {
            required_duration_ms: 0,
            required_score_threshold: 2.0,
            description: 'Score dropped below 2.0, service may be recovering',
          });
        }
        break;
      }

      case OutageState.MAJOR_OUTAGE: {
        if (score < 3.0) {
          return this.transitionTo(serviceId, ctx, OutageState.RECOVERING, now, {
            required_duration_ms: 0,
            required_score_threshold: 3.0,
            description: 'Score dropped below 3.0, entering recovery',
          });
        }
        break;
      }

      case OutageState.RECOVERING: {
        if (!ctx.recoveringSince) {
          ctx.recoveringSince = now;
        }
        const recoveringDuration = now.getTime() - ctx.recoveringSince.getTime();

        if (score < 1.5 && recoveringDuration >= FIFTEEN_MINUTES_MS) {
          return this.transitionTo(serviceId, ctx, OutageState.RESOLVED, now, {
            required_duration_ms: FIFTEEN_MINUTES_MS,
            required_score_threshold: 1.5,
            description: 'Score below 1.5 for 15+ minutes, incident resolved',
          });
        }

        // If score rises again, go back to DEGRADED
        if (score > 3.0) {
          return this.transitionTo(serviceId, ctx, OutageState.DEGRADED, now, {
            required_duration_ms: 0,
            required_score_threshold: 3.0,
            description: 'Score rose above 3.0 during recovery, returning to degraded',
          });
        }
        break;
      }

      case OutageState.RESOLVED: {
        // RESOLVED -> OPERATIONAL happens immediately (or on next cycle)
        if (score > 3.0) {
          return this.transitionTo(serviceId, ctx, OutageState.INVESTIGATING, now, {
            required_duration_ms: 0,
            required_score_threshold: 3.0,
            description: 'New anomaly detected after resolution',
          });
        }
        break;
      }
    }

    return null;
  }

  private evaluateTimeBasedTransitions(
    serviceId: string,
    ctx: ServiceContext,
    now: Date,
  ): StateTransition | null {
    if (ctx.state === OutageState.INVESTIGATING) {
      const lastEvent = ctx.lastEventTime;
      if (lastEvent && now.getTime() - lastEvent.getTime() >= TEN_MINUTES_MS) {
        return this.transitionTo(serviceId, ctx, OutageState.OPERATIONAL, now, {
          required_duration_ms: TEN_MINUTES_MS,
          required_score_threshold: 0,
          description: 'No detection events for 10 minutes, returning to operational',
        });
      }
    }
    return null;
  }

  private transitionTo(
    serviceId: string,
    ctx: ServiceContext,
    newState: OutageStateType,
    now: Date,
    meta: { required_duration_ms: number; required_score_threshold: number; description: string },
  ): StateTransition {
    const transition: StateTransition = {
      from: ctx.state,
      to: newState,
      required_duration_ms: meta.required_duration_ms,
      required_score_threshold: meta.required_score_threshold,
      description: meta.description,
    };

    ctx.state = newState;
    ctx.since = now;

    // Reset context tracking fields as appropriate
    if (newState !== OutageState.INVESTIGATING) {
      ctx.investigatingSince = null;
    }
    if (newState !== OutageState.DEGRADED) {
      ctx.degradedSince = null;
    }
    if (newState !== OutageState.RECOVERING) {
      ctx.recoveringSince = null;
    }
    if (newState === OutageState.INVESTIGATING) {
      ctx.investigatingSince = now;
    }
    if (newState === OutageState.DEGRADED) {
      ctx.degradedSince = now;
    }
    if (newState === OutageState.RECOVERING) {
      ctx.recoveringSince = now;
    }

    // Emit event
    for (const handler of this.stateChangeHandlers) {
      handler(serviceId, transition);
    }

    return transition;
  }

  private computeBayesianConfidence(signals: DetectionEvent[]): number {
    if (signals.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = LAYER_WEIGHTS[signal.detection_layer] ?? 0.1;
      weightedSum += signal.confidence * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return 0;
    return Math.min(1.0, weightedSum / totalWeight);
  }

  private countIndependentLayers(events: DetectionEvent[]): number {
    const layers = new Set<DetectionLayerType>();
    for (const e of events) {
      layers.add(e.detection_layer);
    }
    return layers.size;
  }

  private pruneOldEvents(ctx: ServiceContext, now: Date): void {
    const cutoff = now.getTime() - this.eventWindowMs;
    ctx.recentEvents = ctx.recentEvents.filter(
      (e) => e.timestamp.getTime() >= cutoff,
    );
  }
}
