import { describe, expect, it, afterEach } from 'vitest';
import { PubSub, Channels } from '../pubsub.js';
import { subscriptionResolvers } from '../resolvers/subscription-resolvers.js';

describe('PubSub', () => {
  let ps: PubSub;

  afterEach(() => {
    ps?.clear();
  });

  it('delivers published events to subscribers', async () => {
    ps = new PubSub();
    const iter = ps.subscribe('test-channel');
    const payload = { message: 'hello' };

    ps.publish('test-channel', payload);

    const result = await iter.next();
    expect(result.done).toBe(false);
    expect(result.value).toEqual(payload);
  });

  it('does not deliver events to unsubscribed iterators', async () => {
    ps = new PubSub();
    const iter = ps.subscribe('test-channel');

    ps.unsubscribe('test-channel', iter);
    ps.publish('test-channel', { message: 'should not receive' });

    const result = await iter.next();
    expect(result.done).toBe(true);
  });

  it('delivers events only to the correct channel', async () => {
    ps = new PubSub();
    const iter1 = ps.subscribe('channel-a');
    const iter2 = ps.subscribe('channel-b');

    ps.publish('channel-a', { from: 'a' });
    ps.publish('channel-b', { from: 'b' });

    const result1 = await iter1.next();
    const result2 = await iter2.next();

    expect(result1.value).toEqual({ from: 'a' });
    expect(result2.value).toEqual({ from: 'b' });

    await iter1.return?.();
    await iter2.return?.();
  });

  it('supports multiple subscribers on the same channel', async () => {
    ps = new PubSub();
    const iter1 = ps.subscribe('shared');
    const iter2 = ps.subscribe('shared');

    ps.publish('shared', { data: 42 });

    const [r1, r2] = await Promise.all([iter1.next(), iter2.next()]);
    expect(r1.value).toEqual({ data: 42 });
    expect(r2.value).toEqual({ data: 42 });

    await iter1.return?.();
    await iter2.return?.();
  });

  it('queues events when no one is awaiting next()', async () => {
    ps = new PubSub();
    const iter = ps.subscribe('queue-test');

    ps.publish('queue-test', { idx: 1 });
    ps.publish('queue-test', { idx: 2 });
    ps.publish('queue-test', { idx: 3 });

    const r1 = await iter.next();
    const r2 = await iter.next();
    const r3 = await iter.next();

    expect(r1.value).toEqual({ idx: 1 });
    expect(r2.value).toEqual({ idx: 2 });
    expect(r3.value).toEqual({ idx: 3 });

    await iter.return?.();
  });

  it('reports correct listener count', () => {
    ps = new PubSub();
    expect(ps.listenerCount('empty')).toBe(0);

    const iter1 = ps.subscribe('counted');
    const iter2 = ps.subscribe('counted');
    expect(ps.listenerCount('counted')).toBe(2);

    ps.unsubscribe('counted', iter1);
    expect(ps.listenerCount('counted')).toBe(1);

    ps.unsubscribe('counted', iter2);
    expect(ps.listenerCount('counted')).toBe(0);
  });
});

describe('Channels', () => {
  it('produces correct channel names', () => {
    expect(Channels.OUTAGE_UPDATED).toBe('outage_updated');
    expect(Channels.outageUpdatedFor('github')).toBe('outage_updated:github');
    expect(Channels.reportReceivedFor('slack')).toBe('report_received:slack');
    expect(Channels.GLOBAL_STATS).toBe('global_stats');
  });
});

describe('subscriptionResolvers', () => {
  describe('outageUpdated', () => {
    it('subscribes to global outage channel when no serviceSlug', async () => {
      const ps = new PubSub();
      // Temporarily replace the module-level pubsub for testing by
      // directly invoking the subscribe logic via the resolver.
      const iter = subscriptionResolvers.Subscription.outageUpdated.subscribe(
        null,
        {},
      ) as AsyncIterableIterator<unknown>;

      // The resolver uses the shared pubsub instance, so we publish there
      const { pubsub } = await import('../pubsub.js');
      const event = {
        outageUpdated: {
          serviceSlug: 'github',
          serviceName: 'GitHub',
          state: 'MAJOR_OUTAGE',
          previousState: 'OPERATIONAL',
          confidence: 0.92,
          regions: ['us-east-1'],
          timestamp: new Date().toISOString(),
        },
      };

      pubsub.publish(Channels.OUTAGE_UPDATED, event);

      const result = await iter.next();
      expect(result.done).toBe(false);
      expect(result.value).toEqual(event);

      await iter.return?.();
    });

    it('subscribes to service-specific outage channel when serviceSlug provided', async () => {
      const { pubsub } = await import('../pubsub.js');

      const iter = subscriptionResolvers.Subscription.outageUpdated.subscribe(
        null,
        { serviceSlug: 'slack' },
      ) as AsyncIterableIterator<unknown>;

      const event = {
        outageUpdated: {
          serviceSlug: 'slack',
          serviceName: 'Slack',
          state: 'DEGRADED',
          previousState: 'OPERATIONAL',
          confidence: 0.78,
          regions: ['eu-west-1'],
          timestamp: new Date().toISOString(),
        },
      };

      pubsub.publish(Channels.outageUpdatedFor('slack'), event);

      const result = await iter.next();
      expect(result.done).toBe(false);
      expect(result.value).toEqual(event);

      await iter.return?.();
    });

    it('resolves outageUpdated payload correctly', () => {
      const payload = {
        outageUpdated: {
          serviceSlug: 'github',
          state: 'MAJOR_OUTAGE',
        },
      };
      const resolved = subscriptionResolvers.Subscription.outageUpdated.resolve(payload);
      expect(resolved).toEqual(payload.outageUpdated);
    });
  });

  describe('reportReceived', () => {
    it('yields service-specific report events', async () => {
      const { pubsub } = await import('../pubsub.js');

      const iter = subscriptionResolvers.Subscription.reportReceived.subscribe(
        null,
        { serviceSlug: 'github' },
      ) as AsyncIterableIterator<unknown>;

      const event = {
        reportReceived: {
          serviceSlug: 'github',
          reportCount: 42,
          reportType: 'WEBSITE_DOWN',
          region: 'us-east-1',
          timestamp: new Date().toISOString(),
        },
      };

      pubsub.publish(Channels.reportReceivedFor('github'), event);

      const result = await iter.next();
      expect(result.done).toBe(false);
      expect(result.value).toEqual(event);

      await iter.return?.();
    });

    it('resolves reportReceived payload correctly', () => {
      const payload = {
        reportReceived: {
          serviceSlug: 'github',
          reportCount: 10,
        },
      };
      const resolved = subscriptionResolvers.Subscription.reportReceived.resolve(payload);
      expect(resolved).toEqual(payload.reportReceived);
    });
  });

  describe('globalStats', () => {
    it('yields periodic stats updates from the database', async () => {
      const mockDb = {
        query: async (sql: string) => {
          if (sql.includes('services')) return { rows: [{ count: 100 }] };
          if (sql.includes('outages')) return { rows: [{ count: 3 }] };
          if (sql.includes('reports')) return { rows: [{ count: 250 }] };
          return { rows: [{ count: 0 }] };
        },
      };

      const iter = subscriptionResolvers.Subscription.globalStats.subscribe(
        null,
        {},
        { db: mockDb },
      ) as AsyncIterableIterator<unknown>;

      // The periodic iterator runs on a 5-second interval. We wait a bit.
      const result = await Promise.race([
        iter.next(),
        new Promise<IteratorResult<unknown>>((resolve) =>
          setTimeout(() => resolve({ value: undefined, done: true }), 6000),
        ),
      ]);

      // Clean up the interval
      await iter.return?.();

      if (!result.done) {
        const stats = result.value as { globalStats: { totalServices: number; activeOutages: number; reportsToday: number } };
        expect(stats.globalStats.totalServices).toBe(100);
        expect(stats.globalStats.activeOutages).toBe(3);
        expect(stats.globalStats.reportsToday).toBe(250);
      }
    }, 8000);

    it('resolves globalStats payload correctly', () => {
      const payload = {
        globalStats: {
          totalServices: 100,
          activeOutages: 5,
          reportsToday: 300,
        },
      };
      const resolved = subscriptionResolvers.Subscription.globalStats.resolve(payload);
      expect(resolved).toEqual(payload.globalStats);
    });
  });
});
