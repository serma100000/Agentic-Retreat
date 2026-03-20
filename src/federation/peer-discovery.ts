/**
 * Peer discovery and health monitoring for the federation network.
 *
 * Maintains a registry of known peers, performs periodic heartbeat
 * checks, and provides methods for manual peer management.
 */

import { randomUUID } from 'node:crypto';

import type { PeerConnection, FederatedInstance } from './types.js';
import { PeerStatus, InstanceStatus } from './types.js';

export interface PeerDiscoveryOptions {
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxRetries: number;
}

const DEFAULT_OPTIONS: PeerDiscoveryOptions = {
  heartbeatIntervalMs: 30_000,
  heartbeatTimeoutMs: 5_000,
  maxRetries: 3,
};

export class PeerDiscovery {
  private readonly peers: Map<string, PeerConnection> = new Map();
  private readonly retryCount: Map<string, number> = new Map();
  private readonly options: PeerDiscoveryOptions;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pingFn: (url: string) => Promise<number>;

  constructor(
    pingFn?: (url: string) => Promise<number>,
    options?: Partial<PeerDiscoveryOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.pingFn = pingFn ?? PeerDiscovery.defaultPing;
  }

  /**
   * Query a network URL for available federation peers
   * and add them to the local peer registry.
   */
  async discoverPeers(
    networkUrl: string,
    fetchFn?: (url: string) => Promise<FederatedInstance[]>,
  ): Promise<PeerConnection[]> {
    const fetcher = fetchFn ?? PeerDiscovery.defaultFetch;
    const instances = await fetcher(`${networkUrl}/peers`);

    const added: PeerConnection[] = [];
    for (const instance of instances) {
      if (!this.peers.has(instance.id)) {
        const peer = this.createPeerConnection(instance.id, instance.url, instance.publicKey);
        this.peers.set(instance.id, peer);
        added.push(peer);
      }
    }

    return added;
  }

  /**
   * Manually add a peer to the registry.
   */
  addPeer(url: string, publicKey: string): PeerConnection {
    const instanceId = randomUUID();
    const peer = this.createPeerConnection(instanceId, url, publicKey);
    this.peers.set(instanceId, peer);
    this.retryCount.set(instanceId, 0);
    return peer;
  }

  /**
   * Remove a peer from the registry.
   */
  removePeer(instanceId: string): boolean {
    this.retryCount.delete(instanceId);
    return this.peers.delete(instanceId);
  }

  /**
   * Ping a specific peer and update its connection status.
   * @returns the measured latency in ms, or -1 if unreachable
   */
  async pingPeer(instanceId: string): Promise<number> {
    const peer = this.peers.get(instanceId);
    if (!peer) {
      throw new Error(`Unknown peer: ${instanceId}`);
    }

    try {
      const latency = await this.pingFn(peer.url);
      peer.latencyMs = latency;
      peer.status = PeerStatus.CONNECTED;
      peer.lastHeartbeat = new Date();
      this.retryCount.set(instanceId, 0);
      return latency;
    } catch {
      const retries = (this.retryCount.get(instanceId) ?? 0) + 1;
      this.retryCount.set(instanceId, retries);

      if (retries >= this.options.maxRetries) {
        peer.status = PeerStatus.UNREACHABLE;
      } else {
        peer.status = PeerStatus.DISCONNECTED;
      }
      return -1;
    }
  }

  /**
   * Return all peers currently in a connected state.
   */
  getHealthyPeers(): PeerConnection[] {
    return [...this.peers.values()].filter((p) => p.status === PeerStatus.CONNECTED);
  }

  /**
   * Return all known peers.
   */
  getAllPeers(): PeerConnection[] {
    return [...this.peers.values()];
  }

  /**
   * Get a single peer by id.
   */
  getPeer(instanceId: string): PeerConnection | undefined {
    return this.peers.get(instanceId);
  }

  /**
   * Start the periodic heartbeat loop.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(async () => {
      const peerIds = [...this.peers.keys()];
      await Promise.allSettled(peerIds.map((id) => this.pingPeer(id)));
    }, this.options.heartbeatIntervalMs);
  }

  /**
   * Stop the periodic heartbeat loop.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private createPeerConnection(instanceId: string, url: string, publicKey: string): PeerConnection {
    return {
      instanceId,
      url,
      publicKey,
      status: PeerStatus.DISCONNECTED,
      latencyMs: 0,
      lastHeartbeat: new Date(),
    };
  }

  /**
   * Default fetch implementation (placeholder -- real impl uses HTTP).
   */
  private static async defaultFetch(_url: string): Promise<FederatedInstance[]> {
    return [];
  }

  /**
   * Default ping implementation (placeholder -- real impl uses HTTP HEAD).
   */
  private static async defaultPing(_url: string): Promise<number> {
    return 0;
  }
}
