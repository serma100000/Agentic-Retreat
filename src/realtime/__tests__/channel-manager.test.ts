import { describe, expect, it, beforeEach } from 'vitest';
import { ChannelManager } from '../channel-manager.js';
import type { ClientConnection, WebSocketLike } from '../types.js';
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

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe('subscribe / unsubscribe', () => {
    it('adds a client to a channel', () => {
      manager.subscribe('client-1', 'outages:github');

      const subs = manager.getSubscribers('outages:github');
      expect(subs).toContain('client-1');
    });

    it('removes a client from a channel', () => {
      manager.subscribe('client-1', 'outages:github');
      manager.unsubscribe('client-1', 'outages:github');

      const subs = manager.getSubscribers('outages:github');
      expect(subs).not.toContain('client-1');
    });

    it('returns empty array for channel with no subscribers', () => {
      expect(manager.getSubscribers('outages:unknown')).toEqual([]);
    });

    it('does not fail when unsubscribing from a non-existent channel', () => {
      expect(() => manager.unsubscribe('client-1', 'nonexistent')).not.toThrow();
    });

    it('tracks channels per client', () => {
      manager.subscribe('client-1', 'outages:github');
      manager.subscribe('client-1', 'stats:global');

      const channels = manager.getClientChannels('client-1');
      expect(channels).toContain('outages:github');
      expect(channels).toContain('stats:global');
    });
  });

  describe('unsubscribeAll', () => {
    it('removes a client from all channels', () => {
      manager.subscribe('client-1', 'outages:github');
      manager.subscribe('client-1', 'stats:global');
      manager.subscribe('client-1', 'map:reports');

      manager.unsubscribeAll('client-1');

      expect(manager.getSubscribers('outages:github')).toEqual([]);
      expect(manager.getSubscribers('stats:global')).toEqual([]);
      expect(manager.getSubscribers('map:reports')).toEqual([]);
      expect(manager.getClientChannels('client-1')).toEqual([]);
    });

    it('does not affect other clients', () => {
      manager.subscribe('client-1', 'outages:github');
      manager.subscribe('client-2', 'outages:github');

      manager.unsubscribeAll('client-1');

      expect(manager.getSubscribers('outages:github')).toEqual(['client-2']);
    });

    it('handles client with no subscriptions', () => {
      expect(() => manager.unsubscribeAll('nonexistent')).not.toThrow();
    });
  });

  describe('broadcast', () => {
    it('sends to all subscribers of a channel', () => {
      const c1 = createMockClient('client-1');
      const c2 = createMockClient('client-2');

      manager.registerConnection(c1);
      manager.registerConnection(c2);
      manager.subscribe('client-1', 'outages:github');
      manager.subscribe('client-2', 'outages:github');

      const sent = manager.broadcast('outages:github', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      expect(sent).toBe(2);
      expect(c1.sent.length).toBe(1);
      expect(c2.sent.length).toBe(1);

      const parsed1 = JSON.parse(c1.sent[0]!);
      expect(parsed1.type).toBe('data');
      expect(parsed1.channel).toBe('outages:github');
    });

    it('does not send to non-subscribers', () => {
      const c1 = createMockClient('client-1');
      const c2 = createMockClient('client-2');

      manager.registerConnection(c1);
      manager.registerConnection(c2);
      manager.subscribe('client-1', 'outages:github');
      // client-2 does NOT subscribe

      const sent = manager.broadcast('outages:github', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      expect(sent).toBe(1);
      expect(c1.sent.length).toBe(1);
      expect(c2.sent.length).toBe(0);
    });

    it('returns 0 when channel has no subscribers', () => {
      const sent = manager.broadcast('outages:unknown', {
        type: MessageType.DATA,
        payload: {},
      });
      expect(sent).toBe(0);
    });

    it('skips clients with closed sockets', () => {
      const c1 = createMockClient('client-1');
      c1.socket.readyState = 3; // CLOSED

      manager.registerConnection(c1);
      manager.subscribe('client-1', 'outages:github');

      const sent = manager.broadcast('outages:github', {
        type: MessageType.DATA,
        payload: {},
      });

      expect(sent).toBe(0);
      expect(c1.sent.length).toBe(0);
    });
  });

  describe('broadcastToPattern', () => {
    it('sends to wildcard subscribers', () => {
      const c1 = createMockClient('client-1');
      manager.registerConnection(c1);
      manager.subscribe('client-1', 'outages:*');

      const sent = manager.broadcastToPattern('outages:*', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      expect(sent).toBe(1);
      expect(c1.sent.length).toBe(1);
    });

    it('sends to both wildcard and specific subscribers without duplication', () => {
      const c1 = createMockClient('client-1');
      const c2 = createMockClient('client-2');

      manager.registerConnection(c1);
      manager.registerConnection(c2);
      manager.subscribe('client-1', 'outages:*');
      manager.subscribe('client-2', 'outages:github');

      const sent = manager.broadcastToPattern('outages:*', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      expect(sent).toBe(2);
      expect(c1.sent.length).toBe(1);
      expect(c2.sent.length).toBe(1);
    });

    it('does not send duplicate to a client on both wildcard and specific', () => {
      const c1 = createMockClient('client-1');
      manager.registerConnection(c1);
      manager.subscribe('client-1', 'outages:*');
      manager.subscribe('client-1', 'outages:github');

      const sent = manager.broadcastToPattern('outages:*', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      // Client should receive only once
      expect(sent).toBe(1);
      expect(c1.sent.length).toBe(1);
    });

    it('non-wildcard pattern matches only exact channel', () => {
      const c1 = createMockClient('client-1');
      const c2 = createMockClient('client-2');

      manager.registerConnection(c1);
      manager.registerConnection(c2);
      manager.subscribe('client-1', 'outages:github');
      manager.subscribe('client-2', 'outages:aws');

      const sent = manager.broadcastToPattern('outages:github', {
        type: MessageType.DATA,
        payload: {},
      });

      expect(sent).toBe(1);
      expect(c1.sent.length).toBe(1);
      expect(c2.sent.length).toBe(0);
    });
  });

  describe('getSubscriptionStats', () => {
    it('returns counts per channel', () => {
      manager.subscribe('c1', 'outages:github');
      manager.subscribe('c2', 'outages:github');
      manager.subscribe('c1', 'stats:global');

      const stats = manager.getSubscriptionStats();
      expect(stats['outages:github']).toBe(2);
      expect(stats['stats:global']).toBe(1);
    });

    it('returns empty object when no subscriptions', () => {
      expect(manager.getSubscriptionStats()).toEqual({});
    });
  });

  describe('multiple clients on same channel', () => {
    it('all receive broadcast', () => {
      const clients = Array.from({ length: 5 }, (_, i) =>
        createMockClient(`client-${i}`),
      );

      for (const c of clients) {
        manager.registerConnection(c);
        manager.subscribe(c.id, 'outages:github');
      }

      const sent = manager.broadcast('outages:github', {
        type: MessageType.DATA,
        payload: { test: true },
      });

      expect(sent).toBe(5);
      for (const c of clients) {
        expect(c.sent.length).toBe(1);
      }
    });
  });
});
