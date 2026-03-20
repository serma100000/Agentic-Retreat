/**
 * Multi-layer caching system for OpenPulse.
 *
 * L1: In-memory LRU cache (fast, limited size per instance).
 * L2: Redis cache (shared across all instances).
 */

import type { CacheConfig, CacheStats } from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface RedisLike {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { PX?: number }) => Promise<unknown>;
  del: (key: string | string[]) => Promise<number>;
  scan: (cursor: number, options: { MATCH: string; COUNT: number }) => Promise<{ cursor: number; keys: string[] }>;
}

/**
 * Simple LRU cache backed by a Map (insertion order).
 */
class LruCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // If already present, remove to reset order
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export class CacheManager {
  private readonly l1: LruCache<unknown>;
  private readonly redis: RedisLike | null;
  private readonly defaultTtlMs: number;
  private stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    hitRate: 0,
  };

  constructor(
    config: CacheConfig,
    redis: RedisLike | null = null,
  ) {
    this.l1 = new LruCache(config.maxSize);
    this.redis = redis;
    this.defaultTtlMs = config.ttlMs;
  }

  async get<T>(key: string): Promise<T | null> {
    // Check L1
    const l1Value = this.l1.get(key);
    if (l1Value !== null) {
      this.stats.l1Hits++;
      this.updateHitRate();
      return l1Value as T;
    }
    this.stats.l1Misses++;

    // Check L2
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as T;
          // Promote to L1
          this.l1.set(key, parsed, this.defaultTtlMs);
          this.stats.l2Hits++;
          this.updateHitRate();
          return parsed;
        }
      } catch {
        // Redis failure is non-fatal; treat as miss
      }
      this.stats.l2Misses++;
    }

    this.updateHitRate();
    return null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;

    // Write to L1
    this.l1.set(key, value, ttl);

    // Write to L2
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), { PX: ttl });
      } catch {
        // Redis failure is non-fatal
      }
    }
  }

  async invalidate(key: string): Promise<void> {
    this.l1.delete(key);

    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Redis failure is non-fatal
      }
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.redis) return;

    try {
      let cursor = 0;
      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = result.cursor;

        if (result.keys.length > 0) {
          await this.redis.del(result.keys);
          for (const key of result.keys) {
            this.l1.delete(key);
          }
        }
      } while (cursor !== 0);
    } catch {
      // Redis failure is non-fatal
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private updateHitRate(): void {
    const totalRequests =
      this.stats.l1Hits + this.stats.l1Misses;
    const totalHits = this.stats.l1Hits + this.stats.l2Hits;

    this.stats.hitRate = totalRequests > 0
      ? Math.round((totalHits / totalRequests) * 10_000) / 10_000
      : 0;
  }
}
