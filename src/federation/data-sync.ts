/**
 * Data synchronization engine for federation.
 *
 * Handles anonymization of outage data before sharing,
 * message signing/verification, conflict resolution via
 * vector clocks, and sync history tracking.
 */

import { randomUUID } from 'node:crypto';

import type {
  SharedOutageData,
  SyncMessage,
  PeerConnection,
  SyncLogEntry,
  VectorClock,
  SyncMessageTypeValue,
} from './types.js';
import { SyncMessageType } from './types.js';
import { FederationCrypto } from './crypto.js';

export interface RawOutageData {
  id: string;
  serviceName: string;
  serviceCategory: string;
  region: string;
  severity: 'minor' | 'major' | 'critical';
  reportCount: number;
  reporterEmails: string[];
  internalNotes: string;
  firstDetectedAt: Date;
  lastUpdatedAt: Date;
  resolvedAt: Date | null;
}

export interface DataSyncOptions {
  instanceId: string;
  privateKey: string;
  maxHistoryEntries: number;
}

export class DataSync {
  private readonly crypto: FederationCrypto;
  private readonly syncLog: SyncLogEntry[] = [];
  private readonly options: DataSyncOptions;
  private sendFn: ((peer: PeerConnection, message: SyncMessage) => Promise<void>) | null = null;

  constructor(options: DataSyncOptions, crypto?: FederationCrypto) {
    this.options = options;
    this.crypto = crypto ?? new FederationCrypto();
  }

  /**
   * Override the default send implementation for testing or custom transports.
   */
  setSendFunction(fn: (peer: PeerConnection, message: SyncMessage) => Promise<void>): void {
    this.sendFn = fn;
  }

  /**
   * Strip PII and sensitive fields from raw outage data,
   * producing an anonymized SharedOutageData suitable for federation.
   */
  prepareOutageForSync(
    outage: RawOutageData,
    currentClock: VectorClock = {},
  ): SharedOutageData {
    const nextClock = { ...currentClock };
    nextClock[this.options.instanceId] =
      (nextClock[this.options.instanceId] ?? 0) + 1;

    return {
      outageId: outage.id,
      serviceCategory: outage.serviceCategory,
      region: outage.region,
      severity: outage.severity,
      reportCount: outage.reportCount,
      firstDetectedAt: outage.firstDetectedAt,
      lastUpdatedAt: outage.lastUpdatedAt,
      resolvedAt: outage.resolvedAt,
      vectorClock: nextClock,
    };
  }

  /**
   * Send anonymized outage data to a peer with a cryptographic signature.
   */
  async sendSync(
    peer: PeerConnection,
    data: SharedOutageData,
    type: SyncMessageTypeValue = SyncMessageType.OUTAGE_REPORT,
  ): Promise<SyncMessage> {
    const payload = JSON.stringify(data);
    const signature = this.crypto.sign(payload, this.options.privateKey);

    const message: SyncMessage = {
      id: randomUUID(),
      sourceInstance: this.options.instanceId,
      targetInstance: peer.instanceId,
      type,
      payload,
      signature,
      timestamp: new Date(),
    };

    try {
      if (this.sendFn) {
        await this.sendFn(peer, message);
      }

      this.addLogEntry({
        peerId: peer.instanceId,
        direction: 'outbound',
        messageType: type,
        payloadSizeBytes: Buffer.byteLength(payload, 'utf-8'),
        success: true,
        errorMessage: null,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.addLogEntry({
        peerId: peer.instanceId,
        direction: 'outbound',
        messageType: type,
        payloadSizeBytes: Buffer.byteLength(payload, 'utf-8'),
        success: false,
        errorMessage: errMsg,
      });
      throw error;
    }

    return message;
  }

  /**
   * Validate an incoming sync message and extract the outage data.
   * Rejects messages with invalid signatures.
   */
  receiveSync(message: SyncMessage, senderPublicKey: string): SharedOutageData {
    const isValid = this.crypto.verify(message.payload, message.signature, senderPublicKey);

    if (!isValid) {
      this.addLogEntry({
        peerId: message.sourceInstance,
        direction: 'inbound',
        messageType: message.type,
        payloadSizeBytes: Buffer.byteLength(message.payload, 'utf-8'),
        success: false,
        errorMessage: 'Invalid signature',
      });
      throw new Error('Sync message signature verification failed');
    }

    const data = JSON.parse(message.payload) as SharedOutageData;

    this.addLogEntry({
      peerId: message.sourceInstance,
      direction: 'inbound',
      messageType: message.type,
      payloadSizeBytes: Buffer.byteLength(message.payload, 'utf-8'),
      success: true,
      errorMessage: null,
    });

    return data;
  }

  /**
   * Resolve conflicts between local and remote outage data
   * using vector clocks (latest-write-wins with causal ordering).
   *
   * If the remote clock dominates the local clock, the remote version wins.
   * If the local clock dominates, the local version wins.
   * If concurrent (neither dominates), the version with the later
   * lastUpdatedAt timestamp wins, and the vector clocks are merged.
   */
  resolveConflicts(local: SharedOutageData, remote: SharedOutageData): SharedOutageData {
    const comparison = this.compareVectorClocks(local.vectorClock, remote.vectorClock);

    if (comparison === 'before') {
      return remote;
    }

    if (comparison === 'after') {
      return local;
    }

    // Concurrent -- merge clocks and pick latest timestamp
    const mergedClock = this.mergeVectorClocks(local.vectorClock, remote.vectorClock);

    const winner =
      remote.lastUpdatedAt.getTime() > local.lastUpdatedAt.getTime() ? remote : local;

    return {
      ...winner,
      reportCount: Math.max(local.reportCount, remote.reportCount),
      vectorClock: mergedClock,
    };
  }

  /**
   * Return sync history for a specific peer, most recent first.
   */
  getSyncHistory(peerId: string, limit: number = 50): SyncLogEntry[] {
    return this.syncLog
      .filter((entry) => entry.peerId === peerId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Return the full sync log, most recent first.
   */
  getFullSyncHistory(limit: number = 100): SyncLogEntry[] {
    return this.syncLog.slice(-limit).reverse();
  }

  /**
   * Compare two vector clocks.
   * - 'before': a happened before b (a < b)
   * - 'after': a happened after b (a > b)
   * - 'concurrent': neither dominates
   */
  private compareVectorClocks(a: VectorClock, b: VectorClock): 'before' | 'after' | 'concurrent' {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let aBeforeB = false;
    let bBeforeA = false;

    for (const key of allKeys) {
      const aVal = a[key] ?? 0;
      const bVal = b[key] ?? 0;

      if (aVal < bVal) aBeforeB = true;
      if (aVal > bVal) bBeforeA = true;
    }

    if (aBeforeB && !bBeforeA) return 'before';
    if (bBeforeA && !aBeforeB) return 'after';
    return 'concurrent';
  }

  private mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
    const merged: VectorClock = { ...a };
    for (const [key, val] of Object.entries(b)) {
      merged[key] = Math.max(merged[key] ?? 0, val ?? 0);
    }
    return merged;
  }

  private addLogEntry(
    entry: Omit<SyncLogEntry, 'id' | 'timestamp'>,
  ): void {
    this.syncLog.push({
      ...entry,
      id: randomUUID(),
      timestamp: new Date(),
    });

    if (this.syncLog.length > this.options.maxHistoryEntries) {
      this.syncLog.splice(0, this.syncLog.length - this.options.maxHistoryEntries);
    }
  }
}
