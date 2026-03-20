/**
 * GraphQL subscription resolvers for the OpenPulse API.
 *
 * Provides real-time updates for outage state changes, report
 * submissions, and global statistics using async iterators
 * backed by an in-memory pub/sub system.
 */

import { pubsub, Channels } from '../pubsub.js';

interface OutageUpdatedArgs {
  serviceSlug?: string;
}

interface ReportReceivedArgs {
  serviceSlug: string;
}

/**
 * Creates a filtered async iterator that only yields events matching a predicate.
 */
function withFilter<T>(
  asyncIterator: AsyncIterableIterator<T>,
  filterFn: (value: T) => boolean,
): AsyncIterableIterator<T> {
  return {
    next: async () => {
      while (true) {
        const result = await asyncIterator.next();
        if (result.done) return result;
        if (filterFn(result.value)) return result;
      }
    },
    return: (value?: unknown) => {
      return asyncIterator.return?.(value) ?? Promise.resolve({ value: undefined, done: true as const });
    },
    throw: (error?: unknown) => {
      return asyncIterator.throw?.(error) ?? Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

/**
 * Creates an async iterator that yields values at a fixed interval.
 * Used for periodic global stats updates.
 */
function createPeriodicIterator<T>(
  intervalMs: number,
  producer: () => Promise<T> | T,
): AsyncIterableIterator<T> {
  let timer: ReturnType<typeof setInterval> | null = null;
  let resolve: ((value: IteratorResult<T>) => void) | null = null;
  let done = false;

  timer = setInterval(async () => {
    if (done) return;
    try {
      const value = await producer();
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value, done: false });
      }
    } catch {
      // Swallow errors from the producer
    }
  }, intervalMs);

  return {
    next: () => {
      if (done) return Promise.resolve({ value: undefined as T, done: true as const });
      return new Promise<IteratorResult<T>>((r) => {
        resolve = r;
      });
    },
    return: () => {
      done = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (resolve) {
        resolve({ value: undefined as T, done: true });
        resolve = null;
      }
      return Promise.resolve({ value: undefined as T, done: true as const });
    },
    throw: (error?: unknown) => {
      done = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export const subscriptionResolvers = {
  Subscription: {
    outageUpdated: {
      subscribe(_parent: unknown, args: OutageUpdatedArgs) {
        if (args.serviceSlug) {
          // Subscribe to service-specific channel
          return pubsub.subscribe(Channels.outageUpdatedFor(args.serviceSlug));
        }

        // Subscribe to the global outage channel
        return pubsub.subscribe(Channels.OUTAGE_UPDATED);
      },
      resolve(payload: { outageUpdated: unknown }) {
        return payload.outageUpdated;
      },
    },

    reportReceived: {
      subscribe(_parent: unknown, args: ReportReceivedArgs) {
        return pubsub.subscribe(Channels.reportReceivedFor(args.serviceSlug));
      },
      resolve(payload: { reportReceived: unknown }) {
        return payload.reportReceived;
      },
    },

    globalStats: {
      subscribe(_parent: unknown, _args: unknown, ctx: { db: { query: (sql: string) => Promise<{ rows: unknown[] }> } }) {
        return createPeriodicIterator(5000, async () => {
          const serviceResult = await ctx.db.query(
            'SELECT COUNT(*)::int as count FROM services',
          );
          const outageResult = await ctx.db.query(
            "SELECT COUNT(*)::int as count FROM outages WHERE status != 'RESOLVED'",
          );
          const reportResult = await ctx.db.query(
            "SELECT COUNT(*)::int as count FROM reports WHERE created_at >= CURRENT_DATE",
          );

          return {
            globalStats: {
              totalServices: (serviceResult.rows[0] as { count: number })?.count ?? 0,
              activeOutages: (outageResult.rows[0] as { count: number })?.count ?? 0,
              reportsToday: (reportResult.rows[0] as { count: number })?.count ?? 0,
            },
          };
        });
      },
      resolve(payload: { globalStats: unknown }) {
        return payload.globalStats;
      },
    },
  },
};
