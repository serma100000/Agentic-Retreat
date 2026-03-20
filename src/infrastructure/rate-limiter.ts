/**
 * Distributed rate limiter for OpenPulse.
 *
 * Uses a sliding window algorithm backed by Redis sorted sets.
 * Falls back to in-memory tracking when Redis is unavailable.
 */

import type { RateLimitConfig, RateLimitResult } from './types.js';

export interface RedisLike {
  multi: () => RedisPipeline;
}

export interface RedisPipeline {
  zRemRangeByScore: (key: string, min: number | string, max: number | string) => RedisPipeline;
  zAdd: (key: string, members: { score: number; value: string }[]) => RedisPipeline;
  zCard: (key: string) => RedisPipeline;
  pExpire: (key: string, ms: number) => RedisPipeline;
  exec: () => Promise<(number | null)[]>;
}

interface InMemoryWindow {
  timestamps: number[];
}

export class DistributedRateLimiter {
  private readonly redis: RedisLike | null;
  private readonly inMemoryWindows = new Map<string, InMemoryWindow>();

  constructor(redis: RedisLike | null = null) {
    this.redis = redis;
  }

  async checkLimit(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const fullKey = `${config.keyPrefix}:${key}`;

    if (this.redis) {
      try {
        return await this.checkLimitRedis(fullKey, config);
      } catch {
        // Fall back to in-memory
      }
    }

    return this.checkLimitInMemory(fullKey, config);
  }

  async getRemainingQuota(
    key: string,
    config: RateLimitConfig,
  ): Promise<number> {
    const result = await this.checkLimitInMemory(
      `${config.keyPrefix}:${key}`,
      config,
    );
    return result.remaining;
  }

  async resetLimit(key: string): Promise<void> {
    this.inMemoryWindows.delete(key);

    // Clear from all known prefixes in memory
    for (const windowKey of this.inMemoryWindows.keys()) {
      if (windowKey.endsWith(`:${key}`)) {
        this.inMemoryWindows.delete(windowKey);
      }
    }
  }

  private async checkLimitRedis(
    fullKey: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const uniqueMember = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    const pipeline = this.redis!.multi();
    pipeline
      .zRemRangeByScore(fullKey, 0, windowStart)
      .zAdd(fullKey, [{ score: now, value: uniqueMember }])
      .zCard(fullKey)
      .pExpire(fullKey, config.windowMs);

    const results = await pipeline.exec();
    const currentCount = (results[2] as number) ?? 0;

    const allowed = currentCount <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const resetAt = new Date(now + config.windowMs);

    return { allowed, remaining, resetAt };
  }

  private checkLimitInMemory(
    fullKey: string,
    config: RateLimitConfig,
  ): RateLimitResult {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    let window = this.inMemoryWindows.get(fullKey);
    if (!window) {
      window = { timestamps: [] };
      this.inMemoryWindows.set(fullKey, window);
    }

    // Remove expired timestamps
    window.timestamps = window.timestamps.filter((ts) => ts > windowStart);

    // Add current request
    window.timestamps.push(now);

    const currentCount = window.timestamps.length;
    const allowed = currentCount <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const resetAt = new Date(now + config.windowMs);

    return { allowed, remaining, resetAt };
  }
}

/**
 * Preset rate limit tiers.
 */
export const RateLimitTiers: Record<string, RateLimitConfig> = {
  free: {
    windowMs: 60_000,
    maxRequests: 60,
    keyPrefix: 'rl:free',
  },
  pro: {
    windowMs: 60_000,
    maxRequests: 600,
    keyPrefix: 'rl:pro',
  },
  enterprise: {
    windowMs: 60_000,
    maxRequests: 6_000,
    keyPrefix: 'rl:enterprise',
  },
};
