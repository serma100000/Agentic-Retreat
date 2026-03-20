/**
 * WebSocket gateway for real-time outage updates and live map data.
 *
 * Manages client connections, subscription handling, heartbeat,
 * and graceful shutdown. Delegates pub/sub to ChannelManager
 * and connection tracking to ConnectionPool.
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import { ChannelManager } from './channel-manager.js';
import { ConnectionPool } from './connection-pool.js';
import { deserializeMessage, serializeMessage } from './message-serializer.js';
import type { ClientConnection, WebSocketLike, WebSocketMessage } from './types.js';
import { MessageType, SubscriptionChannelPattern } from './types.js';

/** Minimal server-side WebSocket server interface. */
export interface WebSocketServerAdapter {
  on(event: 'connection', handler: (socket: WebSocketLike) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'close', handler: () => void): void;
  close(callback?: (err?: Error) => void): void;
  clients?: Set<WebSocketLike>;
}

/** Factory for creating a WS server on a given port. */
export type WebSocketServerFactory = (port: number) => WebSocketServerAdapter;

export interface WebSocketServerOptions {
  /** Heartbeat ping interval in ms. Default: 30000. */
  heartbeatIntervalMs?: number;
  /** Max time to wait for pong before disconnecting. Default: 10000. */
  pongTimeoutMs?: number;
  /** Factory to create the underlying WS server. */
  serverFactory?: WebSocketServerFactory;
}

/** Valid channel prefixes and exact channels for subscription validation. */
const VALID_CHANNEL_PREFIXES = ['outages:', 'reports:'] as const;
const VALID_EXACT_CHANNELS = new Set(['map:reports', 'stats:global']);

function isValidChannel(channel: string): boolean {
  if (VALID_EXACT_CHANNELS.has(channel)) return true;
  return VALID_CHANNEL_PREFIXES.some((prefix) => channel.startsWith(prefix));
}

export class WebSocketServer extends EventEmitter {
  readonly channelManager: ChannelManager;
  readonly connectionPool: ConnectionPool;

  private server: WebSocketServerAdapter | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs: number;
  private readonly pongTimeoutMs: number;
  private readonly serverFactory: WebSocketServerFactory | undefined;
  private readonly pongTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: WebSocketServerOptions = {}) {
    super();
    this.channelManager = new ChannelManager();
    this.connectionPool = new ConnectionPool();
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
    this.pongTimeoutMs = options.pongTimeoutMs ?? 10000;
    this.serverFactory = options.serverFactory;
  }

  /** Start the WebSocket server on the given port. */
  start(port: number): void {
    if (!this.serverFactory) {
      throw new Error('No serverFactory provided. Supply one in options or use startWithServer().');
    }
    const server = this.serverFactory(port);
    this.startWithServer(server);
  }

  /** Start using an already-created WS server adapter. */
  startWithServer(server: WebSocketServerAdapter): void {
    this.server = server;

    server.on('connection', (socket: WebSocketLike) => {
      this.handleConnection(socket);
    });

    server.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.startHeartbeat();
    this.emit('started');
  }

  /** Gracefully shut down the server, closing all connections. */
  stop(): Promise<void> {
    this.stopHeartbeat();

    // Clear all pong timers
    for (const timer of this.pongTimers.values()) {
      clearTimeout(timer);
    }
    this.pongTimers.clear();

    // Close all client connections
    for (const client of this.connectionPool.getAll()) {
      try {
        client.socket.close(1001, 'Server shutting down');
      } catch {
        // Ignore close errors during shutdown
      }
      this.cleanupClient(client.id);
    }

    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.emit('stopped');
          resolve();
        });
      } else {
        this.emit('stopped');
        resolve();
      }
    });
  }

  /** Handle a new incoming WebSocket connection. */
  handleConnection(socket: WebSocketLike): ClientConnection {
    const clientId = randomUUID();
    const client: ClientConnection = {
      id: clientId,
      socket,
      subscriptions: new Set<string>(),
      lastPingAt: new Date(),
    };

    this.connectionPool.addConnection(client);
    this.channelManager.registerConnection(client);

    // Send welcome message
    const welcome: WebSocketMessage = {
      type: MessageType.WELCOME,
      payload: {
        clientId,
        channels: Object.values(SubscriptionChannelPattern),
      },
    };
    this.safeSend(client, welcome);

    // Wire up socket events
    if (socket.on) {
      socket.on('message', (data: unknown) => {
        this.handleRawMessage(client, String(data));
      });

      socket.on('close', () => {
        this.cleanupClient(clientId);
      });

      socket.on('error', () => {
        this.cleanupClient(clientId);
      });

      socket.on('pong', () => {
        this.handlePong(clientId);
      });
    }

    this.emit('connection', client);
    return client;
  }

  /** Process a raw incoming message string from a client. */
  handleRawMessage(client: ClientConnection, data: string): void {
    let message: WebSocketMessage;
    try {
      message = deserializeMessage(data);
    } catch {
      this.safeSend(client, {
        type: MessageType.ERROR,
        payload: { code: 'INVALID_MESSAGE', message: 'Could not parse message' },
      });
      return;
    }

    switch (message.type) {
      case MessageType.SUBSCRIBE:
        if (message.channel) {
          this.handleSubscribe(client, message.channel);
        } else {
          this.safeSend(client, {
            type: MessageType.ERROR,
            payload: { code: 'MISSING_CHANNEL', message: 'Subscribe requires a channel' },
          });
        }
        break;

      case MessageType.UNSUBSCRIBE:
        if (message.channel) {
          this.handleUnsubscribe(client, message.channel);
        } else {
          this.safeSend(client, {
            type: MessageType.ERROR,
            payload: { code: 'MISSING_CHANNEL', message: 'Unsubscribe requires a channel' },
          });
        }
        break;

      case MessageType.PING:
        client.lastPingAt = new Date();
        this.safeSend(client, { type: MessageType.PONG });
        break;

      default:
        this.safeSend(client, {
          type: MessageType.ERROR,
          payload: { code: 'UNSUPPORTED_TYPE', message: `Unsupported message type: ${message.type}` },
        });
    }
  }

  /** Subscribe a client to a channel after validating the channel format. */
  handleSubscribe(client: ClientConnection, channel: string): void {
    if (!isValidChannel(channel)) {
      this.safeSend(client, {
        type: MessageType.ERROR,
        payload: { code: 'INVALID_CHANNEL', message: `Invalid channel: ${channel}` },
      });
      return;
    }

    client.subscriptions.add(channel);
    this.channelManager.subscribe(client.id, channel);

    this.safeSend(client, {
      type: MessageType.SUBSCRIBED,
      channel,
    });

    this.emit('subscribe', { clientId: client.id, channel });
  }

  /** Unsubscribe a client from a channel. */
  handleUnsubscribe(client: ClientConnection, channel: string): void {
    client.subscriptions.delete(channel);
    this.channelManager.unsubscribe(client.id, channel);

    this.safeSend(client, {
      type: MessageType.UNSUBSCRIBED,
      channel,
    });

    this.emit('unsubscribe', { clientId: client.id, channel });
  }

  /** Get the current number of active connections. */
  getConnectionCount(): number {
    return this.connectionPool.getActiveCount();
  }

  /** Get subscription stats: channel -> number of subscribers. */
  getSubscriptionStats(): Record<string, number> {
    return this.channelManager.getSubscriptionStats();
  }

  /** Send a message to a client, catching send errors. */
  private safeSend(client: ClientConnection, message: WebSocketMessage): void {
    try {
      if (client.socket.readyState === 1) {
        client.socket.send(serializeMessage(message));
      }
    } catch {
      // Client may have disconnected; ignore
    }
  }

  /** Clean up a disconnected client. */
  private cleanupClient(clientId: string): void {
    this.channelManager.unsubscribeAll(clientId);
    this.channelManager.deregisterConnection(clientId);
    this.connectionPool.removeConnection(clientId);

    const pongTimer = this.pongTimers.get(clientId);
    if (pongTimer) {
      clearTimeout(pongTimer);
      this.pongTimers.delete(clientId);
    }

    this.emit('disconnect', clientId);
  }

  /** Handle a pong response from a client. */
  private handlePong(clientId: string): void {
    const client = this.connectionPool.getConnection(clientId);
    if (client) {
      client.lastPingAt = new Date();
    }

    const timer = this.pongTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.pongTimers.delete(clientId);
    }
  }

  /** Start the heartbeat interval: ping all clients periodically. */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.pingAllClients();
    }, this.heartbeatIntervalMs);
  }

  /** Stop the heartbeat interval. */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Send a ping to every connected client and set a pong timeout. */
  private pingAllClients(): void {
    const pingMessage = serializeMessage({ type: MessageType.PING });

    for (const client of this.connectionPool.getAll()) {
      try {
        if (client.socket.readyState === 1) {
          client.socket.send(pingMessage);

          // Set a timeout: if no pong comes back, disconnect
          const timer = setTimeout(() => {
            this.pongTimers.delete(client.id);
            try {
              client.socket.close(4000, 'Pong timeout');
            } catch {
              // Ignore
            }
            this.cleanupClient(client.id);
          }, this.pongTimeoutMs);

          this.pongTimers.set(client.id, timer);
        }
      } catch {
        this.cleanupClient(client.id);
      }
    }
  }
}
