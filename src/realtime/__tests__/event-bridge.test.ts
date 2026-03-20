import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { EventBridge } from '../event-bridge.js';
import { ChannelManager } from '../channel-manager.js';
import type { ClientConnection, WebSocketLike, GlobalStats } from '../types.js';
import { MessageType } from '../types.js';

function createMockClient(id: string): ClientConnection & { sent: string[] } {
  const sent: string[] = [];
  const socket: WebSocketLike = {
    readyState: 1,
    send(data: string) {
      sent.push(data);
    },
    close() {
      (this as WebSocketLike).readyState = 3;
    },
  };

  return {
    id,
    socket,
    subscriptions: new Set<string>(),
    lastPingAt: new Date(),
    sent,
  };
}

function parseSent(client: ReturnType<typeof createMockClient>): unknown[] {
  return client.sent.map((s) => JSON.parse(s));
}

describe('EventBridge', () => {
  let channelManager: ChannelManager;
  let bridge: EventBridge;

  beforeEach(() => {
    channelManager = new ChannelManager();
    bridge = new EventBridge(channelManager, {
      maxMapEventsPerSecond: 10,
      statsBroadcastIntervalMs: 5000,
    });
  });

  afterEach(() => {
    bridge.stopStatsBroadcast();
  });

  describe('onOutageStateChange', () => {
    it('broadcasts to the specific outage channel', () => {
      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'outages:github');

      bridge.onOutageStateChange({
        serviceId: 'svc-1',
        slug: 'github',
        name: 'GitHub',
        state: 'DEGRADED',
        prevState: 'OPERATIONAL',
        confidence: 0.85,
        regions: ['us-east', 'eu-west'],
      });

      expect(client.sent.length).toBe(1);
      const msg = JSON.parse(client.sent[0]!) as Record<string, unknown>;
      expect(msg.type).toBe('data');
      expect(msg.channel).toBe('outages:github');
      const payload = msg.payload as Record<string, unknown>;
      expect(payload.serviceSlug).toBe('github');
      expect(payload.state).toBe('DEGRADED');
      expect(payload.previousState).toBe('OPERATIONAL');
      expect(payload.confidence).toBe(0.85);
      expect(payload.affectedRegions).toEqual(['us-east', 'eu-west']);
    });

    it('broadcasts to wildcard outages:* subscribers', () => {
      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'outages:*');

      bridge.onOutageStateChange({
        serviceId: 'svc-2',
        slug: 'aws',
        name: 'AWS',
        state: 'MAJOR_OUTAGE',
        prevState: 'DEGRADED',
        confidence: 0.95,
        regions: ['us-west'],
      });

      expect(client.sent.length).toBe(1);
      const msg = JSON.parse(client.sent[0]!) as Record<string, unknown>;
      expect(msg.type).toBe('data');
    });

    it('reaches both wildcard and specific subscribers', () => {
      const c1 = createMockClient('c1');
      const c2 = createMockClient('c2');
      channelManager.registerConnection(c1);
      channelManager.registerConnection(c2);
      channelManager.subscribe('c1', 'outages:*');
      channelManager.subscribe('c2', 'outages:github');

      bridge.onOutageStateChange({
        serviceId: 'svc-1',
        slug: 'github',
        name: 'GitHub',
        state: 'DEGRADED',
        prevState: 'OPERATIONAL',
        confidence: 0.85,
        regions: [],
      });

      // c1 gets from wildcard, c2 gets from specific channel
      expect(c1.sent.length).toBe(1);
      expect(c2.sent.length).toBe(1);
    });
  });

  describe('onReportReceived', () => {
    it('broadcasts to the service-specific reports channel', () => {
      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'reports:github');

      bridge.onReportReceived({
        serviceId: 'svc-1',
        slug: 'github',
        type: 'downtime',
        region: 'us-east',
        count: 42,
      });

      expect(client.sent.length).toBe(1);
      const msg = JSON.parse(client.sent[0]!) as Record<string, unknown>;
      expect(msg.type).toBe('data');
      expect(msg.channel).toBe('reports:github');
      const payload = msg.payload as Record<string, unknown>;
      expect(payload.reportCount).toBe(42);
      expect(payload.reportType).toBe('downtime');
    });

    it('does not send to unrelated report channels', () => {
      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'reports:aws');

      bridge.onReportReceived({
        serviceId: 'svc-1',
        slug: 'github',
        type: 'downtime',
        region: 'us-east',
        count: 5,
      });

      expect(client.sent.length).toBe(0);
    });
  });

  describe('onMapReport — throttled broadcast', () => {
    it('broadcasts map report events to map:reports', () => {
      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'map:reports');

      bridge.onMapReport({
        lat: 40.7128,
        lon: -74.006,
        slug: 'github',
        name: 'GitHub',
        type: 'downtime',
        region: 'us-east',
      });

      expect(client.sent.length).toBe(1);
      const msg = JSON.parse(client.sent[0]!) as Record<string, unknown>;
      expect(msg.type).toBe('data');
      expect(msg.channel).toBe('map:reports');
      const payload = msg.payload as Record<string, unknown>;
      expect(payload.latitude).toBe(40.7128);
      expect(payload.longitude).toBe(-74.006);
    });

    it('rate limits to max events per second', () => {
      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'map:reports');

      // With maxMapEventsPerSecond=10, sending 15 should drop some
      for (let i = 0; i < 15; i++) {
        bridge.onMapReport({
          lat: 40.0 + i * 0.01,
          lon: -74.0,
          slug: 'github',
          name: 'GitHub',
          type: 'downtime',
          region: 'us-east',
        });
      }

      // Should have sent at most 10 (the bucket starts full at 10)
      expect(client.sent.length).toBeLessThanOrEqual(10);
      expect(bridge.getDroppedMapEventCount()).toBeGreaterThan(0);
    });

    it('refills tokens over time allowing new events', () => {
      // Use a bridge with 2 events/sec for easy testing
      const restrictiveBridge = new EventBridge(channelManager, {
        maxMapEventsPerSecond: 2,
      });

      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'map:reports');

      const makeEvent = () => ({
        lat: 40.0,
        lon: -74.0,
        slug: 'github',
        name: 'GitHub',
        type: 'downtime' as const,
        region: 'us-east',
      });

      // Exhaust the bucket (2 tokens)
      restrictiveBridge.onMapReport(makeEvent());
      restrictiveBridge.onMapReport(makeEvent());
      expect(client.sent.length).toBe(2);

      // Third should be dropped
      restrictiveBridge.onMapReport(makeEvent());
      expect(client.sent.length).toBe(2);
      expect(restrictiveBridge.getDroppedMapEventCount()).toBe(1);
    });
  });

  describe('onStatsUpdate — periodic broadcast', () => {
    it('broadcasts stats on interval', () => {
      vi.useFakeTimers();

      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'stats:global');

      const stats: GlobalStats = {
        totalServices: 100,
        activeOutages: 3,
        reportsToday: 1500,
        reportsThisHour: 200,
      };

      bridge.onStatsUpdate(stats);
      bridge.startStatsBroadcast();

      // No broadcast yet (not enough time has passed)
      expect(client.sent.length).toBe(0);

      // Advance by the interval
      vi.advanceTimersByTime(5000);

      expect(client.sent.length).toBe(1);
      const msg = JSON.parse(client.sent[0]!) as Record<string, unknown>;
      expect(msg.type).toBe('data');
      expect(msg.channel).toBe('stats:global');
      const payload = msg.payload as Record<string, unknown>;
      expect(payload.totalServices).toBe(100);
      expect(payload.activeOutages).toBe(3);

      // Another interval
      vi.advanceTimersByTime(5000);
      expect(client.sent.length).toBe(2);

      bridge.stopStatsBroadcast();
      vi.useRealTimers();
    });

    it('does not broadcast if no stats have been set', () => {
      vi.useFakeTimers();

      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'stats:global');

      bridge.startStatsBroadcast();
      vi.advanceTimersByTime(5000);

      // No stats were set, so nothing broadcast
      expect(client.sent.length).toBe(0);

      bridge.stopStatsBroadcast();
      vi.useRealTimers();
    });

    it('updates stats between intervals', () => {
      vi.useFakeTimers();

      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'stats:global');

      bridge.onStatsUpdate({
        totalServices: 50,
        activeOutages: 1,
        reportsToday: 500,
        reportsThisHour: 100,
      });

      bridge.startStatsBroadcast();
      vi.advanceTimersByTime(5000);

      const first = JSON.parse(client.sent[0]!) as Record<string, unknown>;
      expect((first.payload as Record<string, unknown>).totalServices).toBe(50);

      // Update stats
      bridge.onStatsUpdate({
        totalServices: 55,
        activeOutages: 2,
        reportsToday: 600,
        reportsThisHour: 120,
      });

      vi.advanceTimersByTime(5000);

      const second = JSON.parse(client.sent[1]!) as Record<string, unknown>;
      expect((second.payload as Record<string, unknown>).totalServices).toBe(55);
      expect((second.payload as Record<string, unknown>).activeOutages).toBe(2);

      bridge.stopStatsBroadcast();
      vi.useRealTimers();
    });
  });

  describe('rate limiting prevents flood', () => {
    it('tracks dropped events accurately', () => {
      const tightBridge = new EventBridge(channelManager, {
        maxMapEventsPerSecond: 3,
      });

      const client = createMockClient('c1');
      channelManager.registerConnection(client);
      channelManager.subscribe('c1', 'map:reports');

      const makeEvent = () => ({
        lat: 40.0,
        lon: -74.0,
        slug: 'github',
        name: 'GitHub',
        type: 'downtime' as const,
        region: 'us-east',
      });

      // Send 10 events with a bucket of 3
      for (let i = 0; i < 10; i++) {
        tightBridge.onMapReport(makeEvent());
      }

      const delivered = client.sent.length;
      const dropped = tightBridge.getDroppedMapEventCount();
      expect(delivered + dropped).toBe(10);
      expect(delivered).toBeLessThanOrEqual(3);
      expect(dropped).toBeGreaterThanOrEqual(7);
    });

    it('resetCounters clears dropped count', () => {
      bridge.onMapReport({
        lat: 0,
        lon: 0,
        slug: 'x',
        name: 'X',
        type: 't',
        region: 'r',
      });

      bridge.resetCounters();
      expect(bridge.getDroppedMapEventCount()).toBe(0);
    });
  });
});
