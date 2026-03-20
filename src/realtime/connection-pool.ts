/**
 * Connection pool for managing active WebSocket client connections.
 *
 * Tracks connections, provides stats, and prunes stale connections
 * that have not sent a ping within the configured idle threshold.
 */

import type { ClientConnection } from './types.js';

export interface ConnectionPoolStats {
  activeConnections: number;
  peakConnections: number;
  totalConnectionsServed: number;
  subscriptionDistribution: Record<number, number>;
}

export class ConnectionPool {
  private readonly connections = new Map<string, ClientConnection>();
  private peakConnections = 0;
  private totalConnectionsServed = 0;

  /** Add a new client connection to the pool. */
  addConnection(client: ClientConnection): void {
    this.connections.set(client.id, client);
    this.totalConnectionsServed++;
    if (this.connections.size > this.peakConnections) {
      this.peakConnections = this.connections.size;
    }
  }

  /** Remove a client connection by ID. */
  removeConnection(clientId: string): void {
    this.connections.delete(clientId);
  }

  /** Get a client connection by ID, or undefined if not found. */
  getConnection(clientId: string): ClientConnection | undefined {
    return this.connections.get(clientId);
  }

  /** Get the current number of active connections. */
  getActiveCount(): number {
    return this.connections.size;
  }

  /** Get all active connections. */
  getAll(): ClientConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Remove connections that have not pinged within the given idle threshold.
   * Returns the IDs of pruned connections.
   */
  pruneStale(maxIdleMs: number): string[] {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [id, client] of this.connections) {
      const idleMs = now - client.lastPingAt.getTime();
      if (idleMs > maxIdleMs) {
        pruned.push(id);
        try {
          client.socket.close(4001, 'Idle timeout');
        } catch {
          // Socket may already be closed
        }
        this.connections.delete(id);
      }
    }

    return pruned;
  }

  /** Get pool statistics. */
  getStats(): ConnectionPoolStats {
    const subscriptionDistribution: Record<number, number> = {};
    for (const client of this.connections.values()) {
      const count = client.subscriptions.size;
      subscriptionDistribution[count] = (subscriptionDistribution[count] ?? 0) + 1;
    }

    return {
      activeConnections: this.connections.size,
      peakConnections: this.peakConnections,
      totalConnectionsServed: this.totalConnectionsServed,
      subscriptionDistribution,
    };
  }

  /** Check if a connection exists. */
  has(clientId: string): boolean {
    return this.connections.has(clientId);
  }

  /** Clear all connections (used in shutdown). */
  clear(): void {
    this.connections.clear();
  }
}
