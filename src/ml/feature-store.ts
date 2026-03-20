/**
 * Feature Store for real-time ML features.
 * Uses an in-memory Map as cache/fallback when Redis is unavailable.
 * Designed for Redis integration via a simple interface.
 */

import type { FeatureVector, FeatureStoreEntry } from './types.js';

const DEFAULT_WINDOW_SIZE = 60;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RedisClient {
  hSet(key: string, field: string, value: string): Promise<void>;
  hGetAll(key: string): Promise<Record<string, string>>;
  zAdd(key: string, score: number, member: string): Promise<void>;
  zRangeByScore(key: string, min: number, max: number): Promise<string[]>;
  zRemRangeByScore(key: string, min: number, max: number): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

export class FeatureStore {
  private readonly redis: RedisClient | null;

  /** In-memory cache: serviceId -> latest features */
  private readonly cache: Map<string, FeatureVector> = new Map();

  /** In-memory sliding windows: serviceId -> sorted array of entries */
  private readonly windows: Map<string, FeatureStoreEntry[]> = new Map();

  private readonly ttlMs: number;

  constructor(redis?: RedisClient | null, ttlMs = DEFAULT_TTL_MS) {
    this.redis = redis ?? null;
    this.ttlMs = ttlMs;
  }

  /**
   * Update features for a service. Merges partial features with existing.
   */
  async updateFeatures(serviceId: string, features: Partial<FeatureVector>): Promise<void> {
    const now = Date.now();
    const existing = await this.getFeatures(serviceId);

    const merged: FeatureVector = {
      reportRate: features.reportRate ?? existing?.reportRate ?? 0,
      probeLatency: features.probeLatency ?? existing?.probeLatency ?? 0,
      probeSuccessRate: features.probeSuccessRate ?? existing?.probeSuccessRate ?? 1,
      socialMentionRate: features.socialMentionRate ?? existing?.socialMentionRate ?? 0,
      timestamp: features.timestamp ?? now,
    };

    // Update latest features
    this.cache.set(serviceId, merged);

    // Add to sliding window
    const entry: FeatureStoreEntry = { serviceId, features: merged, timestamp: merged.timestamp };

    if (!this.windows.has(serviceId)) {
      this.windows.set(serviceId, []);
    }
    const window = this.windows.get(serviceId)!;
    window.push(entry);

    // Prune old entries beyond TTL
    const cutoff = now - this.ttlMs;
    const pruned = window.filter(e => e.timestamp > cutoff);
    this.windows.set(serviceId, pruned);

    // If Redis is available, also persist there
    if (this.redis) {
      try {
        const hashKey = `features:${serviceId}`;
        const windowKey = `features:window:${serviceId}`;
        const ttlSeconds = Math.ceil(this.ttlMs / 1000);

        await this.redis.hSet(hashKey, 'reportRate', String(merged.reportRate));
        await this.redis.hSet(hashKey, 'probeLatency', String(merged.probeLatency));
        await this.redis.hSet(hashKey, 'probeSuccessRate', String(merged.probeSuccessRate));
        await this.redis.hSet(hashKey, 'socialMentionRate', String(merged.socialMentionRate));
        await this.redis.hSet(hashKey, 'timestamp', String(merged.timestamp));
        await this.redis.expire(hashKey, ttlSeconds);

        await this.redis.zAdd(windowKey, merged.timestamp, JSON.stringify(merged));
        await this.redis.expire(windowKey, ttlSeconds);

        // Prune old window entries in Redis
        await this.redis.zRemRangeByScore(windowKey, 0, cutoff);
      } catch {
        // Redis failure is non-fatal; cache is still valid
      }
    }
  }

  /**
   * Retrieve the latest features for a service.
   */
  async getFeatures(serviceId: string): Promise<FeatureVector | null> {
    // Try cache first
    const cached = this.cache.get(serviceId);
    if (cached) return cached;

    // Try Redis
    if (this.redis) {
      try {
        const hashKey = `features:${serviceId}`;
        const data = await this.redis.hGetAll(hashKey);
        if (data && Object.keys(data).length > 0) {
          const features: FeatureVector = {
            reportRate: parseFloat(data['reportRate'] ?? '0'),
            probeLatency: parseFloat(data['probeLatency'] ?? '0'),
            probeSuccessRate: parseFloat(data['probeSuccessRate'] ?? '1'),
            socialMentionRate: parseFloat(data['socialMentionRate'] ?? '0'),
            timestamp: parseInt(data['timestamp'] ?? '0', 10),
          };
          this.cache.set(serviceId, features);
          return features;
        }
      } catch {
        // Redis failure; return null
      }
    }

    return null;
  }

  /**
   * Get the sliding window of features for a service.
   * @param windowSize Number of most recent entries (default 60)
   */
  async getWindow(serviceId: string, windowSize = DEFAULT_WINDOW_SIZE): Promise<FeatureVector[]> {
    // Try in-memory first
    const memWindow = this.windows.get(serviceId);
    if (memWindow && memWindow.length > 0) {
      const sorted = [...memWindow].sort((a, b) => a.timestamp - b.timestamp);
      const sliced = sorted.slice(-windowSize);
      return sliced.map(e => e.features);
    }

    // Try Redis
    if (this.redis) {
      try {
        const windowKey = `features:window:${serviceId}`;
        const members = await this.redis.zRangeByScore(windowKey, 0, Date.now());
        if (members.length > 0) {
          const features = members
            .map(m => JSON.parse(m) as FeatureVector)
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-windowSize);
          return features;
        }
      } catch {
        // Redis failure
      }
    }

    return [];
  }

  /**
   * Get the latest features for all tracked services.
   */
  async getAllServiceFeatures(): Promise<Map<string, FeatureVector>> {
    // If Redis available, try to fetch keys
    if (this.redis) {
      try {
        const keys = await this.redis.keys('features:*');
        const serviceIds = keys
          .filter(k => !k.includes(':window:'))
          .map(k => k.replace('features:', ''));
        for (const sid of serviceIds) {
          if (!this.cache.has(sid)) {
            await this.getFeatures(sid);
          }
        }
      } catch {
        // Fall through to cache
      }
    }

    return new Map(this.cache);
  }

  /**
   * Remove all features for a service.
   */
  async deleteService(serviceId: string): Promise<void> {
    this.cache.delete(serviceId);
    this.windows.delete(serviceId);

    if (this.redis) {
      try {
        await this.redis.del(`features:${serviceId}`);
        await this.redis.del(`features:window:${serviceId}`);
      } catch {
        // Non-fatal
      }
    }
  }

  /**
   * Clear all in-memory data.
   */
  clear(): void {
    this.cache.clear();
    this.windows.clear();
  }
}
