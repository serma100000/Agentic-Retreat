import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker.js';
import type { CircuitBreakerConfig } from '../types.js';

function makeConfig(overrides: Partial<CircuitBreakerConfig> = {}): CircuitBreakerConfig {
  return {
    failureThreshold: 3,
    resetTimeoutMs: 1000,
    halfOpenMaxCalls: 1,
    ...overrides,
  };
}

describe('CircuitBreaker', () => {
  it('allows calls in closed state', async () => {
    const cb = new CircuitBreaker(makeConfig());
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(cb.getState()).toBe('closed');
  });

  it('opens after consecutive failures reach threshold', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 2 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    await expect(cb.execute(fail)).rejects.toThrow('fail');

    expect(cb.getState()).toBe('open');
  });

  it('rejects immediately when open', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    await expect(cb.execute(async () => 'ok')).rejects.toThrow(CircuitBreakerOpenError);
  });

  it('transitions to half-open after resetTimeout', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1, resetTimeoutMs: 50 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');
  });

  it('closes from half-open on success', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1, resetTimeoutMs: 50 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    await new Promise((r) => setTimeout(r, 60));

    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('closed');
  });

  it('re-opens from half-open on failure', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1, resetTimeoutMs: 50 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    await new Promise((r) => setTimeout(r, 60));

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');
  });

  it('limits calls in half-open state', async () => {
    const cb = new CircuitBreaker(
      makeConfig({ failureThreshold: 1, resetTimeoutMs: 50, halfOpenMaxCalls: 1 }),
    );
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    await new Promise((r) => setTimeout(r, 60));

    // First half-open call: allowed (will fail and re-open)
    await expect(cb.execute(fail)).rejects.toThrow('fail');

    // Now open again; wait for half-open
    await new Promise((r) => setTimeout(r, 60));

    // Use a slow-resolving promise to hold the half-open slot
    let resolveSlowCall: () => void;
    const slowPromise = new Promise<void>((r) => { resolveSlowCall = r; });
    const slowCall = cb.execute(async () => { await slowPromise; });

    // Second concurrent call should be rejected
    await expect(
      cb.execute(async () => 'extra'),
    ).rejects.toThrow(CircuitBreakerOpenError);

    resolveSlowCall!();
    await slowCall;
  });

  it('reset returns to closed state', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow('fail');
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');

    const result = await cb.execute(async () => 'after-reset');
    expect(result).toBe('after-reset');
  });

  it('tracks stats correctly', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 5 }));

    await cb.execute(async () => 'ok');
    await cb.execute(async () => 'ok');
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

    const stats = cb.getStats();
    expect(stats.state).toBe('closed');
    expect(stats.successes).toBe(2);
    expect(stats.failures).toBe(1);
    expect(stats.lastSuccess).toBeInstanceOf(Date);
    expect(stats.lastFailure).toBeInstanceOf(Date);
  });

  it('emits state_changed event', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1 }));
    const handler = vi.fn();
    cb.on('state_changed', handler);

    const fail = async () => { throw new Error('fail'); };
    await expect(cb.execute(fail)).rejects.toThrow('fail');

    expect(handler).toHaveBeenCalledWith({ from: 'closed', to: 'open' });
  });

  it('emits call_rejected event when open', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 1 }));
    const handler = vi.fn();
    cb.on('call_rejected', handler);

    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(cb.execute(async () => 'ok')).rejects.toThrow(CircuitBreakerOpenError);

    expect(handler).toHaveBeenCalledWith({ state: 'open' });
  });

  it('does not open on non-consecutive failures', async () => {
    const cb = new CircuitBreaker(makeConfig({ failureThreshold: 3 }));
    const fail = async () => { throw new Error('fail'); };

    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();
    // Success resets the consecutive failure count
    await cb.execute(async () => 'ok');
    await expect(cb.execute(fail)).rejects.toThrow();
    await expect(cb.execute(fail)).rejects.toThrow();

    // Only 2 consecutive failures, threshold is 3
    expect(cb.getState()).toBe('closed');
  });

  it('starts with null lastFailure and lastSuccess', () => {
    const cb = new CircuitBreaker(makeConfig());
    const stats = cb.getStats();
    expect(stats.lastFailure).toBeNull();
    expect(stats.lastSuccess).toBeNull();
  });
});
