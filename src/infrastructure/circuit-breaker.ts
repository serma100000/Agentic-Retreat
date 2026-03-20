/**
 * Circuit breaker pattern implementation for OpenPulse.
 *
 * Protects downstream services by failing fast when a dependency
 * is experiencing issues, then gradually allowing traffic through
 * once the issue may have resolved.
 */

import type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStats } from './types.js';

type EventHandler = (data: { from: CircuitBreakerState; to: CircuitBreakerState }) => void;
type RejectHandler = (data: { state: CircuitBreakerState }) => void;

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private consecutiveFailures = 0;
  private totalSuccesses = 0;
  private halfOpenCalls = 0;
  private lastFailure: Date | null = null;
  private lastSuccess: Date | null = null;
  private openedAt: number | null = null;

  private readonly config: CircuitBreakerConfig;
  private readonly stateChangedHandlers: EventHandler[] = [];
  private readonly callRejectedHandlers: RejectHandler[] = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldTransitionToHalfOpen()) {
        this.transition('half-open');
      } else {
        this.emitCallRejected();
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open, call rejected`,
        );
      }
    }

    if (this.state === 'half-open' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      this.emitCallRejected();
      throw new CircuitBreakerOpenError(
        `Circuit breaker is half-open, max probe calls reached`,
      );
    }

    if (this.state === 'half-open') {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitBreakerState {
    if (this.state === 'open' && this.shouldTransitionToHalfOpen()) {
      this.transition('half-open');
    }
    return this.state;
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.halfOpenCalls = 0;
    this.openedAt = null;
    if (this.state !== 'closed') {
      this.transition('closed');
    }
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.consecutiveFailures,
      successes: this.totalSuccesses,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
    };
  }

  on(event: 'state_changed', handler: EventHandler): void;
  on(event: 'call_rejected', handler: RejectHandler): void;
  on(event: string, handler: (...args: unknown[]) => void): void {
    if (event === 'state_changed') {
      this.stateChangedHandlers.push(handler as EventHandler);
    } else if (event === 'call_rejected') {
      this.callRejectedHandlers.push(handler as RejectHandler);
    }
  }

  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccess = new Date();

    if (this.state === 'half-open') {
      this.consecutiveFailures = 0;
      this.halfOpenCalls = 0;
      this.openedAt = null;
      this.transition('closed');
    } else {
      this.consecutiveFailures = 0;
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailure = new Date();

    if (this.state === 'half-open') {
      this.halfOpenCalls = 0;
      this.openedAt = Date.now();
      this.transition('open');
    } else if (
      this.state === 'closed' &&
      this.consecutiveFailures >= this.config.failureThreshold
    ) {
      this.openedAt = Date.now();
      this.transition('open');
    }
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (this.openedAt === null) return false;
    return Date.now() - this.openedAt >= this.config.resetTimeoutMs;
  }

  private transition(to: CircuitBreakerState): void {
    const from = this.state;
    this.state = to;
    if (to === 'half-open') {
      this.halfOpenCalls = 0;
    }
    for (const handler of this.stateChangedHandlers) {
      handler({ from, to });
    }
  }

  private emitCallRejected(): void {
    for (const handler of this.callRejectedHandlers) {
      handler({ state: this.state });
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
