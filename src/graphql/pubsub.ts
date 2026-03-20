/**
 * In-memory pub/sub for GraphQL subscriptions.
 *
 * Provides publish/subscribe semantics using async iterators.
 * Designed as a singleton that can be swapped for a Redis-backed
 * implementation in production.
 */

type Listener = (data: unknown) => void;

export class PubSub {
  private channels: Map<string, Set<Listener>> = new Map();

  publish(channel: string, data: unknown): void {
    const listeners = this.channels.get(channel);
    if (listeners) {
      for (const listener of listeners) {
        listener(data);
      }
    }
  }

  subscribe(channel: string): AsyncIterableIterator<unknown> {
    const queue: unknown[] = [];
    let resolve: ((value: IteratorResult<unknown>) => void) | null = null;
    let done = false;

    const listener: Listener = (data: unknown) => {
      if (done) return;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value: data, done: false });
      } else {
        queue.push(data);
      }
    };

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(listener);

    const iterator: AsyncIterableIterator<unknown> = {
      next: () => {
        if (done) {
          return Promise.resolve({ value: undefined, done: true });
        }
        if (queue.length > 0) {
          return Promise.resolve({ value: queue.shift()!, done: false });
        }
        return new Promise<IteratorResult<unknown>>((r) => {
          resolve = r;
        });
      },
      return: () => {
        done = true;
        const listeners = this.channels.get(channel);
        if (listeners) {
          listeners.delete(listener);
          if (listeners.size === 0) {
            this.channels.delete(channel);
          }
        }
        if (resolve) {
          resolve({ value: undefined, done: true });
          resolve = null;
        }
        return Promise.resolve({ value: undefined, done: true });
      },
      throw: (error: unknown) => {
        done = true;
        const listeners = this.channels.get(channel);
        if (listeners) {
          listeners.delete(listener);
          if (listeners.size === 0) {
            this.channels.delete(channel);
          }
        }
        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    return iterator;
  }

  unsubscribe(channel: string, iterator: AsyncIterableIterator<unknown>): void {
    iterator.return?.(undefined);
  }

  /** Returns the number of listeners on a given channel (for diagnostics). */
  listenerCount(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }

  /** Removes all listeners from all channels. */
  clear(): void {
    this.channels.clear();
  }
}

/** Singleton PubSub instance shared across the application. */
export const pubsub = new PubSub();

/** Well-known channel names for subscription topics. */
export const Channels = {
  OUTAGE_UPDATED: 'outage_updated',
  outageUpdatedFor: (slug: string) => `outage_updated:${slug}`,
  reportReceivedFor: (slug: string) => `report_received:${slug}`,
  GLOBAL_STATS: 'global_stats',
} as const;
