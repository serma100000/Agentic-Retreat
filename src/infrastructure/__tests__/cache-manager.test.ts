import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CacheManager } from '../cache-manager.js';
import type { RedisLike } from '../cache-manager.js';
import type { CacheConfig } from '../types.js';

function makeConfig(overrides: Partial<CacheConfig> = {}): CacheConfig {
  return {
    maxSize: 100,
    ttlMs: 60_000,
    strategy: 'lru',
    ...overrides,
  };
}

function makeMockRedis(): RedisLike {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    }),
    set: vi.fn(async (key: string, value: string, options?: { PX?: number }) => {
      const ttl = options?.PX ?? 60_000;
      store.set(key, { value, expiresAt: Date.now() + ttl });
    }),
    del: vi.fn(async (key: string | string[]) => {
      const keys = Array.isArray(key) ? key : [key];
      let deleted = 0;
      for (const k of keys) {
        if (store.delete(k)) deleted++;
      }
      return deleted;
    }),
    scan: vi.fn(async (_cursor: number, options: { MATCH: string; COUNT: number }) => {
      const pattern = options.MATCH.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      const matchedKeys: string[] = [];
      for (const k of store.keys()) {
        if (regex.test(k)) matchedKeys.push(k);
      }
      return { cursor: 0, keys: matchedKeys };
    }),
  };
}

describe('CacheManager', () => {
  it('returns null when both caches miss', async () => {
    const cache = new CacheManager(makeConfig());
    const result = await cache.get<string>('nonexistent');
    expect(result).toBeNull();
  });

  it('returns value from L1 cache', async () => {
    const cache = new CacheManager(makeConfig());
    await cache.set('key1', 'value1');
    const result = await cache.get<string>('key1');
    expect(result).toBe('value1');
  });

  it('returns value from L2 and promotes to L1', async () => {
    const redis = makeMockRedis();
    const cache = new CacheManager(makeConfig(), redis);

    // Manually put a value in Redis
    await redis.set('key2', JSON.stringify('redis-value'));

    const result = await cache.get<string>('key2');
    expect(result).toBe('redis-value');

    // Second fetch should hit L1
    const result2 = await cache.get<string>('key2');
    expect(result2).toBe('redis-value');

    const stats = cache.getStats();
    expect(stats.l2Hits).toBe(1);
    expect(stats.l1Hits).toBe(1);
  });

  it('writes to both L1 and L2', async () => {
    const redis = makeMockRedis();
    const cache = new CacheManager(makeConfig(), redis);

    await cache.set('key3', { data: 'test' });

    expect(redis.set).toHaveBeenCalled();

    const l1Result = await cache.get<{ data: string }>('key3');
    expect(l1Result).toEqual({ data: 'test' });
  });

  it('invalidate removes from both layers', async () => {
    const redis = makeMockRedis();
    const cache = new CacheManager(makeConfig(), redis);

    await cache.set('key4', 'delete-me');
    await cache.invalidate('key4');

    const result = await cache.get<string>('key4');
    expect(result).toBeNull();
    expect(redis.del).toHaveBeenCalledWith('key4');
  });

  it('invalidatePattern removes matching keys from Redis', async () => {
    const redis = makeMockRedis();
    const cache = new CacheManager(makeConfig(), redis);

    await cache.set('user:1', 'a');
    await cache.set('user:2', 'b');
    await cache.set('order:1', 'c');

    await cache.invalidatePattern('user:*');

    expect(redis.scan).toHaveBeenCalled();
  });

  it('respects TTL expiry in L1', async () => {
    const cache = new CacheManager(makeConfig({ ttlMs: 50, maxSize: 100, strategy: 'lru' }));

    await cache.set('ttl-key', 'ephemeral');
    const before = await cache.get<string>('ttl-key');
    expect(before).toBe('ephemeral');

    await new Promise((r) => setTimeout(r, 60));

    const after = await cache.get<string>('ttl-key');
    expect(after).toBeNull();
  });

  it('evicts oldest entry when L1 is full', async () => {
    const cache = new CacheManager(makeConfig({ maxSize: 2, ttlMs: 60_000, strategy: 'lru' }));

    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3); // should evict 'a'

    const a = await cache.get<number>('a');
    const c = await cache.get<number>('c');
    expect(a).toBeNull();
    expect(c).toBe(3);
  });

  it('tracks stats correctly', async () => {
    const redis = makeMockRedis();
    const cache = new CacheManager(makeConfig(), redis);

    await cache.set('s1', 'v1');
    await cache.get<string>('s1'); // L1 hit
    await cache.get<string>('missing'); // L1 miss + L2 miss

    const stats = cache.getStats();
    expect(stats.l1Hits).toBe(1);
    expect(stats.l1Misses).toBe(1);
    expect(stats.l2Misses).toBe(1);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it('handles Redis failure gracefully on get', async () => {
    const redis = makeMockRedis();
    (redis.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection lost'));

    const cache = new CacheManager(makeConfig(), redis);
    const result = await cache.get<string>('broken');
    expect(result).toBeNull();
  });

  it('handles Redis failure gracefully on set', async () => {
    const redis = makeMockRedis();
    (redis.set as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection lost'));

    const cache = new CacheManager(makeConfig(), redis);
    // Should not throw
    await cache.set('key', 'value');

    // L1 should still work
    const result = await cache.get<string>('key');
    expect(result).toBe('value');
  });

  it('custom TTL overrides default', async () => {
    const redis = makeMockRedis();
    const cache = new CacheManager(makeConfig({ ttlMs: 60_000 }), redis);

    await cache.set('custom-ttl', 'data', 5000);

    expect(redis.set).toHaveBeenCalledWith(
      'custom-ttl',
      JSON.stringify('data'),
      { PX: 5000 },
    );
  });
});
