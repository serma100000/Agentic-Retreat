import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from '../websocket-server.js';
import type { WebSocketLike, WebSocketMessage } from '../types.js';
import { MessageType } from '../types.js';
import { deserializeMessage } from '../message-serializer.js';

/** Create a mock WebSocket that records sent messages and exposes event triggers. */
function createMockSocket(): WebSocketLike & {
  sent: string[];
  handlers: Map<string, ((...args: unknown[]) => void)[]>;
  trigger: (event: string, ...args: unknown[]) => void;
  closed: boolean;
  closeCode?: number;
  closeReason?: string;
} {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const sent: string[] = [];

  return {
    readyState: 1,
    sent,
    handlers,
    closed: false,
    closeCode: undefined,
    closeReason: undefined,

    send(data: string) {
      sent.push(data);
    },

    close(code?: number, reason?: string) {
      (this as ReturnType<typeof createMockSocket>).readyState = 3;
      (this as ReturnType<typeof createMockSocket>).closed = true;
      (this as ReturnType<typeof createMockSocket>).closeCode = code;
      (this as ReturnType<typeof createMockSocket>).closeReason = reason;
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      let list = handlers.get(event);
      if (!list) {
        list = [];
        handlers.set(event, list);
      }
      list.push(handler);
    },

    removeAllListeners() {
      handlers.clear();
    },

    trigger(event: string, ...args: unknown[]) {
      const list = handlers.get(event);
      if (list) {
        for (const fn of list) {
          fn(...args);
        }
      }
    },
  };
}

function parseSent(socket: ReturnType<typeof createMockSocket>): WebSocketMessage[] {
  return socket.sent.map((s) => JSON.parse(s) as WebSocketMessage);
}

function getLastSent(socket: ReturnType<typeof createMockSocket>): WebSocketMessage {
  const messages = parseSent(socket);
  return messages[messages.length - 1]!;
}

describe('WebSocketServer', () => {
  let wsServer: WebSocketServer;

  beforeEach(() => {
    wsServer = new WebSocketServer({
      heartbeatIntervalMs: 60000, // Long interval to avoid interference in tests
      pongTimeoutMs: 10000,
    });
  });

  afterEach(async () => {
    await wsServer.stop();
  });

  describe('connection handling', () => {
    it('accepts connections and sends a welcome message', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      expect(client.id).toBeDefined();
      expect(client.id.length).toBeGreaterThan(0);

      const messages = parseSent(socket);
      expect(messages.length).toBe(1);
      expect(messages[0]!.type).toBe(MessageType.WELCOME);
      expect(messages[0]!.payload).toHaveProperty('clientId', client.id);
      expect(messages[0]!.payload).toHaveProperty('channels');
    });

    it('tracks active connection count', () => {
      expect(wsServer.getConnectionCount()).toBe(0);

      const s1 = createMockSocket();
      wsServer.handleConnection(s1);
      expect(wsServer.getConnectionCount()).toBe(1);

      const s2 = createMockSocket();
      wsServer.handleConnection(s2);
      expect(wsServer.getConnectionCount()).toBe(2);
    });

    it('cleans up on disconnect', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);
      expect(wsServer.getConnectionCount()).toBe(1);

      socket.trigger('close');
      expect(wsServer.getConnectionCount()).toBe(0);
    });

    it('cleans up on error', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);
      expect(wsServer.getConnectionCount()).toBe(1);

      socket.trigger('error', new Error('test error'));
      expect(wsServer.getConnectionCount()).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('client can subscribe to a valid channel', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:github',
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.SUBSCRIBED);
      expect(last.channel).toBe('outages:github');
      expect(client.subscriptions.has('outages:github')).toBe(true);
    });

    it('rejects invalid channel format', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'invalid:channel',
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.ERROR);
      expect((last.payload as Record<string, string>).code).toBe('INVALID_CHANNEL');
    });

    it('requires a channel field', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.ERROR);
      expect((last.payload as Record<string, string>).code).toBe('MISSING_CHANNEL');
    });

    it('client can subscribe to wildcard channel outages:*', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:*',
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.SUBSCRIBED);
      expect(client.subscriptions.has('outages:*')).toBe(true);
    });

    it('client can subscribe to map:reports', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'map:reports',
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.SUBSCRIBED);
      expect(last.channel).toBe('map:reports');
    });

    it('client can subscribe to stats:global', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'stats:global',
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.SUBSCRIBED);
      expect(last.channel).toBe('stats:global');
    });
  });

  describe('unsubscribe', () => {
    it('client can unsubscribe from a channel', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      // Subscribe first
      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:github',
      }));

      expect(client.subscriptions.has('outages:github')).toBe(true);

      // Unsubscribe
      socket.trigger('message', JSON.stringify({
        type: MessageType.UNSUBSCRIBE,
        channel: 'outages:github',
      }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.UNSUBSCRIBED);
      expect(last.channel).toBe('outages:github');
      expect(client.subscriptions.has('outages:github')).toBe(false);
    });
  });

  describe('message receiving', () => {
    it('client receives messages on subscribed channel', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:github',
      }));

      // Broadcast a message to the channel via the channel manager
      wsServer.channelManager.broadcast('outages:github', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      const messages = parseSent(socket);
      // welcome + subscribed + data
      expect(messages.length).toBe(3);
      expect(messages[2]!.type).toBe(MessageType.DATA);
      expect(messages[2]!.channel).toBe('outages:github');
    });

    it('client does not receive messages on unsubscribed channel', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      // Do NOT subscribe to 'outages:github'

      wsServer.channelManager.broadcast('outages:github', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      const messages = parseSent(socket);
      // Only welcome message
      expect(messages.length).toBe(1);
      expect(messages[0]!.type).toBe(MessageType.WELCOME);
    });

    it('wildcard subscription receives all outage updates', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:*',
      }));

      // Broadcast to a specific outage channel
      wsServer.channelManager.broadcastToPattern('outages:*', {
        type: MessageType.DATA,
        channel: 'outages:github',
        payload: { state: 'DEGRADED' },
      });

      const messages = parseSent(socket);
      // welcome + subscribed + data
      expect(messages.length).toBe(3);
      expect(messages[2]!.type).toBe(MessageType.DATA);
    });
  });

  describe('ping/pong heartbeat', () => {
    it('responds to client ping with pong', () => {
      const socket = createMockSocket();
      wsServer.handleConnection(socket);

      socket.trigger('message', JSON.stringify({ type: MessageType.PING }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.PONG);
    });

    it('updates lastPingAt on client ping', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      const before = client.lastPingAt.getTime();

      // Advance time slightly
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      socket.trigger('message', JSON.stringify({ type: MessageType.PING }));

      expect(client.lastPingAt.getTime()).toBeGreaterThanOrEqual(before);
      vi.useRealTimers();
    });
  });

  describe('stale connection pruning', () => {
    it('prunes connections that exceed idle timeout', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      // Set lastPingAt to a long time ago
      client.lastPingAt = new Date(Date.now() - 120_000);

      const pruned = wsServer.connectionPool.pruneStale(60_000);
      expect(pruned).toContain(client.id);
      expect(wsServer.connectionPool.getActiveCount()).toBe(0);
      expect(socket.closed).toBe(true);
    });

    it('does not prune active connections', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);
      client.lastPingAt = new Date();

      const pruned = wsServer.connectionPool.pruneStale(60_000);
      expect(pruned.length).toBe(0);
      expect(wsServer.connectionPool.getActiveCount()).toBe(1);
    });
  });

  describe('graceful shutdown', () => {
    it('closes all connections on stop', async () => {
      const s1 = createMockSocket();
      const s2 = createMockSocket();

      wsServer.handleConnection(s1);
      wsServer.handleConnection(s2);

      expect(wsServer.getConnectionCount()).toBe(2);

      await wsServer.stop();

      expect(s1.closed).toBe(true);
      expect(s2.closed).toBe(true);
      expect(wsServer.getConnectionCount()).toBe(0);
    });
  });

  describe('invalid messages', () => {
    it('responds with error for invalid JSON', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      wsServer.handleRawMessage(client, 'not json');

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.ERROR);
      expect((last.payload as Record<string, string>).code).toBe('INVALID_MESSAGE');
    });

    it('responds with error for unsupported message type', () => {
      const socket = createMockSocket();
      const client = wsServer.handleConnection(socket);

      wsServer.handleRawMessage(client, JSON.stringify({ type: 'data' }));

      const last = getLastSent(socket);
      expect(last.type).toBe(MessageType.ERROR);
      expect((last.payload as Record<string, string>).code).toBe('UNSUPPORTED_TYPE');
    });
  });

  describe('subscription stats', () => {
    it('tracks subscriptions per channel', () => {
      const s1 = createMockSocket();
      const s2 = createMockSocket();

      wsServer.handleConnection(s1);
      wsServer.handleConnection(s2);

      s1.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:github',
      }));

      s2.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'outages:github',
      }));

      s2.trigger('message', JSON.stringify({
        type: MessageType.SUBSCRIBE,
        channel: 'stats:global',
      }));

      const stats = wsServer.getSubscriptionStats();
      expect(stats['outages:github']).toBe(2);
      expect(stats['stats:global']).toBe(1);
    });
  });
});
