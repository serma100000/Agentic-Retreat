/**
 * Manages pub/sub channels for the WebSocket gateway.
 *
 * Maintains a bidirectional index between clients and channels
 * for efficient subscription lookups, broadcasts, and wildcard pattern matching.
 */

import type { ClientConnection, WebSocketMessage } from './types.js';
import { serializeMessage } from './message-serializer.js';

export class ChannelManager {
  /** channel -> set of clientIds */
  private readonly channelToClients = new Map<string, Set<string>>();

  /** clientId -> set of channels */
  private readonly clientToChannels = new Map<string, Set<string>>();

  /** clientId -> ClientConnection (for sending messages) */
  private readonly connections = new Map<string, ClientConnection>();

  /** Register a connection so broadcast can reach it. */
  registerConnection(client: ClientConnection): void {
    this.connections.set(client.id, client);
  }

  /** Remove a connection reference. */
  deregisterConnection(clientId: string): void {
    this.connections.delete(clientId);
  }

  /** Subscribe a client to a channel. */
  subscribe(clientId: string, channel: string): void {
    let clients = this.channelToClients.get(channel);
    if (!clients) {
      clients = new Set<string>();
      this.channelToClients.set(channel, clients);
    }
    clients.add(clientId);

    let channels = this.clientToChannels.get(clientId);
    if (!channels) {
      channels = new Set<string>();
      this.clientToChannels.set(clientId, channels);
    }
    channels.add(channel);
  }

  /** Unsubscribe a client from a channel. */
  unsubscribe(clientId: string, channel: string): void {
    const clients = this.channelToClients.get(channel);
    if (clients) {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.channelToClients.delete(channel);
      }
    }

    const channels = this.clientToChannels.get(clientId);
    if (channels) {
      channels.delete(channel);
      if (channels.size === 0) {
        this.clientToChannels.delete(clientId);
      }
    }
  }

  /** Remove a client from all channels. */
  unsubscribeAll(clientId: string): void {
    const channels = this.clientToChannels.get(clientId);
    if (!channels) return;

    for (const channel of channels) {
      const clients = this.channelToClients.get(channel);
      if (clients) {
        clients.delete(clientId);
        if (clients.size === 0) {
          this.channelToClients.delete(channel);
        }
      }
    }

    this.clientToChannels.delete(clientId);
  }

  /** Get all subscriber IDs for a specific channel. */
  getSubscribers(channel: string): string[] {
    const clients = this.channelToClients.get(channel);
    return clients ? Array.from(clients) : [];
  }

  /** Get all channels a client is subscribed to. */
  getClientChannels(clientId: string): string[] {
    const channels = this.clientToChannels.get(clientId);
    return channels ? Array.from(channels) : [];
  }

  /**
   * Broadcast a message to all subscribers of a specific channel.
   * Returns the number of clients the message was sent to.
   */
  broadcast(channel: string, message: WebSocketMessage): number {
    const serialized = serializeMessage(message);
    const clientIds = this.channelToClients.get(channel);
    if (!clientIds) return 0;

    let sentCount = 0;
    for (const clientId of clientIds) {
      const conn = this.connections.get(clientId);
      if (conn && conn.socket.readyState === 1) {
        try {
          conn.socket.send(serialized);
          sentCount++;
        } catch {
          // Connection may have dropped; ignore send errors
        }
      }
    }
    return sentCount;
  }

  /**
   * Broadcast to all channels that match a pattern.
   * Supports wildcard patterns like 'outages:*' which matches any 'outages:{slug}'.
   *
   * Also sends to clients subscribed to the wildcard channel itself.
   * Returns the total number of unique clients the message was sent to.
   */
  broadcastToPattern(pattern: string, message: WebSocketMessage): number {
    const serialized = serializeMessage(message);
    const sentClientIds = new Set<string>();

    // Determine which channels match the pattern
    const matchingChannels = this.getMatchingChannels(pattern);

    for (const channel of matchingChannels) {
      const clientIds = this.channelToClients.get(channel);
      if (!clientIds) continue;

      for (const clientId of clientIds) {
        if (sentClientIds.has(clientId)) continue;

        const conn = this.connections.get(clientId);
        if (conn && conn.socket.readyState === 1) {
          try {
            conn.socket.send(serialized);
            sentClientIds.add(clientId);
          } catch {
            // Connection may have dropped; ignore send errors
          }
        }
      }
    }

    return sentClientIds.size;
  }

  /** Get subscription stats: channel -> subscriber count. */
  getSubscriptionStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [channel, clients] of this.channelToClients) {
      stats[channel] = clients.size;
    }
    return stats;
  }

  /**
   * Find all channels matching a pattern.
   * 'outages:*' matches 'outages:*' itself plus any 'outages:{slug}'.
   * A specific channel like 'outages:github' matches only itself.
   */
  private getMatchingChannels(pattern: string): string[] {
    if (!pattern.endsWith(':*')) {
      return [pattern];
    }

    const prefix = pattern.slice(0, -1); // 'outages:*' -> 'outages:'
    const matched: string[] = [];

    for (const channel of this.channelToClients.keys()) {
      if (channel === pattern || channel.startsWith(prefix)) {
        matched.push(channel);
      }
    }

    return matched;
  }
}
