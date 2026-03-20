/**
 * Central orchestrator for federation operations.
 *
 * Manages instance registration, peer discovery,
 * outage data synchronization, and federation health metrics.
 */

import { randomUUID } from 'node:crypto';

import type {
  FederationConfig,
  FederationMetrics,
  SharedOutageData,
  SyncMessage,
  PeerConnection,
  FederatedInstance,
} from './types.js';
import { InstanceStatus, SyncMessageType } from './types.js';
import { PeerDiscovery } from './peer-discovery.js';
import { DataSync, type RawOutageData } from './data-sync.js';
import { FederationCrypto } from './crypto.js';

export interface FederationManagerDeps {
  peerDiscovery?: PeerDiscovery;
  dataSync?: DataSync;
  crypto?: FederationCrypto;
}

export class FederationManager {
  private config: FederationConfig | null = null;
  private registered = false;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private syncCount = 0;
  private syncErrors = 0;
  private startedAt: Date | null = null;
  private lastSyncAt: Date | null = null;
  private dataSharedBytes = 0;

  private readonly peerDiscovery: PeerDiscovery;
  private readonly dataSync: DataSync;
  private readonly crypto: FederationCrypto;

  /** Local outage store keyed by outageId */
  private readonly outageStore: Map<string, SharedOutageData> = new Map();

  constructor(deps?: FederationManagerDeps) {
    this.crypto = deps?.crypto ?? new FederationCrypto();
    this.peerDiscovery = deps?.peerDiscovery ?? new PeerDiscovery();
    this.dataSync =
      deps?.dataSync ??
      new DataSync(
        { instanceId: 'unregistered', privateKey: '', maxHistoryEntries: 1000 },
        this.crypto,
      );
  }

  /**
   * Register this instance with the federation network.
   * Starts peer discovery and periodic sync.
   */
  async registerInstance(config: FederationConfig): Promise<FederatedInstance> {
    if (this.registered) {
      throw new Error('Instance is already registered in the federation');
    }

    this.config = config;
    this.registered = true;
    this.startedAt = new Date();

    // Discover initial peers from the network
    await this.peerDiscovery.discoverPeers(config.networkUrl);

    // Start heartbeat monitoring
    this.peerDiscovery.startHeartbeat();

    // Start periodic sync
    if (config.syncIntervalMs > 0) {
      this.syncTimer = setInterval(() => {
        void this.syncOutageData();
      }, config.syncIntervalMs);
    }

    const instance: FederatedInstance = {
      id: config.instanceId,
      name: config.instanceName,
      url: config.instanceUrl,
      publicKey: config.publicKey,
      lastSyncAt: null,
      status: InstanceStatus.ONLINE,
    };

    return instance;
  }

  /**
   * Deregister this instance from the federation network.
   * Stops all timers and disconnects from peers.
   */
  async deregister(): Promise<void> {
    if (!this.registered) {
      throw new Error('Instance is not registered in the federation');
    }

    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.peerDiscovery.stopHeartbeat();
    this.registered = false;
    this.config = null;
    this.startedAt = null;
  }

  /**
   * List all connected peers.
   */
  getPeers(): PeerConnection[] {
    return this.peerDiscovery.getAllPeers();
  }

  /**
   * Get current federation health status.
   */
  getStatus(): FederationMetrics {
    const now = new Date();
    const uptimeSeconds = this.startedAt
      ? Math.floor((now.getTime() - this.startedAt.getTime()) / 1000)
      : 0;

    const uptimeHours = uptimeSeconds / 3600;
    const syncsPerHour = uptimeHours > 0 ? this.syncCount / uptimeHours : 0;

    return {
      instanceId: this.config?.instanceId ?? 'unregistered',
      peers: this.peerDiscovery.getAllPeers().length,
      syncsPerHour: Math.round(syncsPerHour * 100) / 100,
      dataSharedBytes: this.dataSharedBytes,
      lastSyncAt: this.lastSyncAt,
      uptimeSeconds,
      syncErrors: this.syncErrors,
    };
  }

  /**
   * Push all local outage data to all healthy peers.
   */
  async syncOutageData(): Promise<number> {
    this.assertRegistered();

    const peers = this.peerDiscovery.getHealthyPeers();
    if (peers.length === 0 || this.outageStore.size === 0) return 0;

    let syncedCount = 0;

    for (const peer of peers) {
      for (const outage of this.outageStore.values()) {
        try {
          const msg = await this.dataSync.sendSync(peer, outage, SyncMessageType.OUTAGE_REPORT);
          this.dataSharedBytes += Buffer.byteLength(msg.payload, 'utf-8');
          syncedCount++;
        } catch {
          this.syncErrors++;
        }
      }
    }

    this.syncCount++;
    this.lastSyncAt = new Date();
    return syncedCount;
  }

  /**
   * Process an incoming sync message from a peer.
   * Validates signature and applies conflict resolution.
   */
  receiveSync(message: SyncMessage): SharedOutageData {
    this.assertRegistered();

    const peer = this.peerDiscovery.getPeer(message.sourceInstance);
    if (!peer) {
      throw new Error(`Unknown peer: ${message.sourceInstance}`);
    }

    const remoteOutage = this.dataSync.receiveSync(message, peer.publicKey);

    const existingOutage = this.outageStore.get(remoteOutage.outageId);
    if (existingOutage) {
      const resolved = this.dataSync.resolveConflicts(existingOutage, remoteOutage);
      this.outageStore.set(resolved.outageId, resolved);
      return resolved;
    }

    this.outageStore.set(remoteOutage.outageId, remoteOutage);
    return remoteOutage;
  }

  /**
   * Broadcast a new outage detection to all healthy peers.
   */
  async broadcastOutage(outage: RawOutageData): Promise<number> {
    this.assertRegistered();

    if (this.config?.dataSharing === 'none') {
      return 0;
    }

    const existing = this.outageStore.get(outage.id);
    const prepared = this.dataSync.prepareOutageForSync(
      outage,
      existing?.vectorClock ?? {},
    );

    this.outageStore.set(prepared.outageId, prepared);

    const peers = this.peerDiscovery.getHealthyPeers();
    let sentCount = 0;

    for (const peer of peers) {
      try {
        const msg = await this.dataSync.sendSync(peer, prepared, SyncMessageType.OUTAGE_REPORT);
        this.dataSharedBytes += Buffer.byteLength(msg.payload, 'utf-8');
        sentCount++;
      } catch {
        this.syncErrors++;
      }
    }

    this.syncCount++;
    this.lastSyncAt = new Date();
    return sentCount;
  }

  /**
   * Check whether this instance is currently registered.
   */
  isRegistered(): boolean {
    return this.registered;
  }

  /**
   * Get the stored outage data for the local instance.
   */
  getLocalOutages(): SharedOutageData[] {
    return [...this.outageStore.values()];
  }

  private assertRegistered(): void {
    if (!this.registered || !this.config) {
      throw new Error('Instance is not registered in the federation');
    }
  }
}
