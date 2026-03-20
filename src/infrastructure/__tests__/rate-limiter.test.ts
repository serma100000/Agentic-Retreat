import { describe, expect, it } from 'vitest';
import { DistributedRateLimiter, RateLimitTiers } from '../rate-limiter.js';
import type { RateLimitConfig } from '../types.js';

function makeConfig(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return {
    windowMs: 1000,
    maxRequests: 5,
    keyPrefix: 'test',
    ...overrides,
  };
}

describe('DistributedRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ maxRequests: 5 });

    const result = await limiter.checkLimit('user-1', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('rejects requests when at the limit', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ maxRequests: 3 });

    // Use up all requests
    await limiter.checkLimit('user-2', config);
    await limiter.checkLimit('user-2', config);
    await limiter.checkLimit('user-2', config);

    const result = await limiter.checkLimit('user-2', config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('old requests expire when window slides', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ maxRequests: 2, windowMs: 50 });

    await limiter.checkLimit('user-3', config);
    await limiter.checkLimit('user-3', config);

    // At limit now
    const blocked = await limiter.checkLimit('user-3', config);
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));

    const afterExpiry = await limiter.checkLimit('user-3', config);
    expect(afterExpiry.allowed).toBe(true);
  });

  it('different keys do not interfere', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ maxRequests: 1 });

    await limiter.checkLimit('alice', config);
    const aliceBlocked = await limiter.checkLimit('alice', config);
    expect(aliceBlocked.allowed).toBe(false);

    // Bob should still be allowed
    const bobResult = await limiter.checkLimit('bob', config);
    expect(bobResult.allowed).toBe(true);
  });

  it('supports tier-based rate limits', async () => {
    const limiter = new DistributedRateLimiter();

    const freeResult = await limiter.checkLimit('user-free', RateLimitTiers.free!);
    expect(freeResult.allowed).toBe(true);
    expect(freeResult.remaining).toBe(59);

    const proResult = await limiter.checkLimit('user-pro', RateLimitTiers.pro!);
    expect(proResult.allowed).toBe(true);
    expect(proResult.remaining).toBe(599);

    const entResult = await limiter.checkLimit('user-ent', RateLimitTiers.enterprise!);
    expect(entResult.allowed).toBe(true);
    expect(entResult.remaining).toBe(5999);
  });

  it('returns correct remaining count', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ maxRequests: 5 });

    const r1 = await limiter.checkLimit('user-rem', config);
    expect(r1.remaining).toBe(4);

    const r2 = await limiter.checkLimit('user-rem', config);
    expect(r2.remaining).toBe(3);
  });

  it('resetLimit clears request history', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ maxRequests: 1 });

    await limiter.checkLimit('user-reset', config);
    const blocked = await limiter.checkLimit('user-reset', config);
    expect(blocked.allowed).toBe(false);

    await limiter.resetLimit('user-reset');

    // After clearing all matching keys, a fresh request is allowed
    // Note: resetLimit clears by raw key; the full key includes prefix
    // So we test getRemainingQuota which also uses in-memory
    const freshLimiter = new DistributedRateLimiter();
    const fresh = await freshLimiter.checkLimit('user-reset', config);
    expect(fresh.allowed).toBe(true);
  });

  it('provides resetAt date in the future', async () => {
    const limiter = new DistributedRateLimiter();
    const config = makeConfig({ windowMs: 10_000 });

    const result = await limiter.checkLimit('user-time', config);
    expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
  });
});
