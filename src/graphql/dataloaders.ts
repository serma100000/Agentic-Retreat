/**
 * DataLoader factories for N+1 query prevention in GraphQL resolvers.
 *
 * Each loader batches individual lookups into a single SQL/Redis call.
 * Loaders are created per-request to prevent stale cached data.
 */

import type {
  DatabaseLike,
  RedisLike,
  ServiceRow,
  OutageRow,
  TimelineEntry,
  ProbeStatusRow,
  DataLoaderLike,
  DataLoaders,
} from './types.js';

/**
 * Generic DataLoader that batches individual load() calls into a single
 * batch function invocation within the same event loop tick.
 */
class BatchLoader<K, V> implements DataLoaderLike<K, V> {
  private cache = new Map<string, V>();
  private batch: { key: K; resolve: (v: V) => void; reject: (e: Error) => void }[] = [];
  private scheduled = false;

  constructor(
    private batchFn: (keys: K[]) => Promise<Map<string, V>>,
    private keyFn: (key: K) => string = (k) => String(k),
  ) {}

  async load(key: K): Promise<V> {
    const cacheKey = this.keyFn(key);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    return new Promise<V>((resolve, reject) => {
      this.batch.push({ key, resolve, reject });
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => this.dispatch());
      }
    });
  }

  async loadMany(keys: K[]): Promise<V[]> {
    return Promise.all(keys.map((k) => this.load(k)));
  }

  clear(key: K): void {
    this.cache.delete(this.keyFn(key));
  }

  clearAll(): void {
    this.cache.clear();
  }

  private async dispatch(): Promise<void> {
    const currentBatch = this.batch;
    this.batch = [];
    this.scheduled = false;

    const keys = currentBatch.map((b) => b.key);
    try {
      const results = await this.batchFn(keys);
      for (const entry of currentBatch) {
        const cacheKey = this.keyFn(entry.key);
        const value = results.get(cacheKey);
        if (value !== undefined) {
          this.cache.set(cacheKey, value);
          entry.resolve(value);
        } else {
          // For missing entries, resolve with undefined cast as V.
          // Callers should handle null/undefined for optional lookups.
          entry.resolve(undefined as V);
        }
      }
    } catch (error) {
      for (const entry of currentBatch) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

export function createServiceLoader(db: DatabaseLike): DataLoaderLike<string, ServiceRow | null> {
  return new BatchLoader<string, ServiceRow | null>(async (ids: string[]) => {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `SELECT * FROM services WHERE id IN (${placeholders})`,
      ids,
    );
    const result = new Map<string, ServiceRow | null>();
    for (const row of rows as ServiceRow[]) {
      result.set(row.id, row);
    }
    for (const id of ids) {
      if (!result.has(id)) {
        result.set(id, null);
      }
    }
    return result;
  });
}

export function createOutageLoader(db: DatabaseLike): DataLoaderLike<string, OutageRow[]> {
  return new BatchLoader<string, OutageRow[]>(async (serviceIds: string[]) => {
    const placeholders = serviceIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `SELECT * FROM outages WHERE service_id IN (${placeholders}) ORDER BY started_at DESC`,
      serviceIds,
    );
    const result = new Map<string, OutageRow[]>();
    for (const id of serviceIds) {
      result.set(id, []);
    }
    for (const row of rows as OutageRow[]) {
      const list = result.get(row.service_id);
      if (list) {
        list.push(row);
      }
    }
    return result;
  });
}

export function createTimelineLoader(db: DatabaseLike): DataLoaderLike<string, TimelineEntry[]> {
  return new BatchLoader<string, TimelineEntry[]>(async (outageIds: string[]) => {
    const placeholders = outageIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `SELECT * FROM outage_timeline WHERE outage_id IN (${placeholders}) ORDER BY created_at ASC`,
      outageIds,
    );
    const result = new Map<string, TimelineEntry[]>();
    for (const id of outageIds) {
      result.set(id, []);
    }
    for (const row of rows as TimelineEntry[]) {
      const list = result.get(row.outage_id);
      if (list) {
        list.push(row);
      }
    }
    return result;
  });
}

export function createProbeStatusLoader(
  db: DatabaseLike,
  _redis: RedisLike,
): DataLoaderLike<string, ProbeStatusRow | null> {
  return new BatchLoader<string, ProbeStatusRow | null>(async (serviceIds: string[]) => {
    const placeholders = serviceIds.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `SELECT DISTINCT ON (service_id) * FROM probe_results
       WHERE service_id IN (${placeholders})
       ORDER BY service_id, checked_at DESC`,
      serviceIds,
    );
    const result = new Map<string, ProbeStatusRow | null>();
    for (const id of serviceIds) {
      result.set(id, null);
    }
    for (const row of rows as ProbeStatusRow[]) {
      result.set(row.service_id, row);
    }
    return result;
  });
}

export function createReportCountLoader(redis: RedisLike): DataLoaderLike<string, number> {
  return new BatchLoader<string, number>(async (serviceSlugs: string[]) => {
    const keys = serviceSlugs.map((slug) => `reports:count:24h:${slug}`);
    const values = await redis.mget(...keys);
    const result = new Map<string, number>();
    for (let i = 0; i < serviceSlugs.length; i++) {
      result.set(serviceSlugs[i]!, parseInt(values[i] ?? '0', 10));
    }
    return result;
  });
}

/**
 * Creates all DataLoaders for a single request context.
 * Each request gets fresh loaders to prevent stale data across requests.
 */
export function createLoaders(db: DatabaseLike, redis: RedisLike): DataLoaders {
  return {
    serviceLoader: createServiceLoader(db),
    outageLoader: createOutageLoader(db),
    timelineLoader: createTimelineLoader(db),
    probeStatusLoader: createProbeStatusLoader(db, redis),
    reportCountLoader: createReportCountLoader(redis),
  };
}
