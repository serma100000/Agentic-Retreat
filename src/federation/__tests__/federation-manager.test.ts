import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { FederationManager } from '../federation-manager.js';
import { PeerDiscovery } from '../peer-discovery.js';
import { DataSync } from '../data-sync.js';
import { FederationCrypto } from '../crypto.js';
import type {
  FederationConfig,
  PeerConnection,
  SyncMessage,
  SharedOutageData,
} from '../types.js';
import { PeerStatus, SyncMessageType } from '../types.js';
import type { RawOutageData } from '../data-sync.js';

function makeConfig(overrides: Partial<FederationConfig> = {}): FederationConfig {
  const crypto = new FederationCrypto();
  const keys = crypto.generateKeyPair();
  return {
    instanceId: 'inst-1',
    instanceName: 'Test Instance',
    instanceUrl: 'https://instance-1.openpulse.io',
    networkUrl: 'https://federation.openpulse.io',
    syncIntervalMs: 0,
    dataSharing: 'full',
    privateKey: keys.privateKey,
    publicKey: keys.publicKey,
    ...overrides,
  };
}

function makeRawOutage(overrides: Partial<RawOutageData> = {}): RawOutageData {
  return {
    id: 'outage-1',
    serviceName: 'Acme API',
    serviceCategory: 'api',
    region: 'us-east-1',
    severity: 'major',
    reportCount: 42,
    reporterEmails: ['alice@acme.com', 'bob@acme.com'],
    internalNotes: 'Internal debug data',
    firstDetectedAt: new Date('2026-03-20T10:00:00Z'),
    lastUpdatedAt: new Date('2026-03-20T10:05:00Z'),
    resolvedAt: null,
    ...overrides,
  };
}

function makePeer(overrides: Partial<PeerConnection> = {}): PeerConnection {
  return {
    instanceId: 'peer-1',
    url: 'https://peer-1.openpulse.io',
    publicKey: 'fakepubkey',
    status: PeerStatus.CONNECTED,
    latencyMs: 25,
    lastHeartbeat: new Date(),
    ...overrides,
  };
}

describe('FederationManager', () => {
  let manager: FederationManager;
  let peerDiscovery: PeerDiscovery;
  let crypto: FederationCrypto;
  let dataSync: DataSync;
  let config: FederationConfig;

  beforeEach(() => {
    crypto = new FederationCrypto();
    const keys = crypto.generateKeyPair();
    config = makeConfig({ privateKey: keys.privateKey, publicKey: keys.publicKey });

    peerDiscovery = new PeerDiscovery(async () => 10);
    dataSync = new DataSync(
      { instanceId: config.instanceId, privateKey: config.privateKey, maxHistoryEntries: 100 },
      crypto,
    );

    manager = new FederationManager({ peerDiscovery, dataSync, crypto });
  });

  afterEach(async () => {
    if (manager.isRegistered()) {
      await manager.deregister();
    }
  });

  describe('registerInstance', () => {
    it('registers and returns a FederatedInstance', async () => {
      const instance = await manager.registerInstance(config);

      expect(instance.id).toBe(config.instanceId);
      expect(instance.name).toBe(config.instanceName);
      expect(instance.url).toBe(config.instanceUrl);
      expect(instance.status).toBe('online');
      expect(manager.isRegistered()).toBe(true);
    });

    it('throws if already registered', async () => {
      await manager.registerInstance(config);
      await expect(manager.registerInstance(config)).rejects.toThrow('already registered');
    });
  });

  describe('deregister', () => {
    it('deregisters a registered instance', async () => {
      await manager.registerInstance(config);
      await manager.deregister();
      expect(manager.isRegistered()).toBe(false);
    });

    it('throws if not registered', async () => {
      await expect(manager.deregister()).rejects.toThrow('not registered');
    });
  });

  describe('getPeers', () => {
    it('returns an empty array when no peers exist', async () => {
      await manager.registerInstance(config);
      expect(manager.getPeers()).toEqual([]);
    });

    it('returns peers after adding them', async () => {
      await manager.registerInstance(config);
      peerDiscovery.addPeer('https://peer-1.openpulse.io', 'pk1');
      peerDiscovery.addPeer('https://peer-2.openpulse.io', 'pk2');
      expect(manager.getPeers()).toHaveLength(2);
    });
  });

  describe('getStatus', () => {
    it('returns metrics for an unregistered instance', () => {
      const status = manager.getStatus();
      expect(status.instanceId).toBe('unregistered');
      expect(status.peers).toBe(0);
      expect(status.uptimeSeconds).toBe(0);
    });

    it('returns metrics for a registered instance', async () => {
      await manager.registerInstance(config);
      const status = manager.getStatus();
      expect(status.instanceId).toBe(config.instanceId);
      expect(status.peers).toBe(0);
      expect(status.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(status.syncErrors).toBe(0);
    });

    it('tracks sync errors', async () => {
      await manager.registerInstance(config);
      // Add a connected peer that will fail on send
      const peerKeys = crypto.generateKeyPair();
      const peer = peerDiscovery.addPeer('https://peer-fail.io', peerKeys.publicKey);
      await peerDiscovery.pingPeer(peer.instanceId); // marks as connected

      dataSync.setSendFunction(async () => {
        throw new Error('network failure');
      });

      await manager.broadcastOutage(makeRawOutage());
      const status = manager.getStatus();
      expect(status.syncErrors).toBeGreaterThan(0);
    });
  });

  describe('syncOutageData', () => {
    it('returns 0 when no peers are connected', async () => {
      await manager.registerInstance(config);
      const count = await manager.syncOutageData();
      expect(count).toBe(0);
    });

    it('returns 0 when no outages exist', async () => {
      await manager.registerInstance(config);
      const peerKeys = crypto.generateKeyPair();
      const peer = peerDiscovery.addPeer('https://peer.io', peerKeys.publicKey);
      await peerDiscovery.pingPeer(peer.instanceId);

      const count = await manager.syncOutageData();
      expect(count).toBe(0);
    });

    it('throws when not registered', async () => {
      await expect(manager.syncOutageData()).rejects.toThrow('not registered');
    });
  });

  describe('receiveSync', () => {
    it('processes a valid incoming sync message', async () => {
      await manager.registerInstance(config);

      const peerKeys = crypto.generateKeyPair();
      const peer = peerDiscovery.addPeer('https://peer.io', peerKeys.publicKey);
      await peerDiscovery.pingPeer(peer.instanceId);

      const outageData: SharedOutageData = {
        outageId: 'remote-outage-1',
        serviceCategory: 'cdn',
        region: 'eu-west-1',
        severity: 'critical',
        reportCount: 100,
        firstDetectedAt: new Date('2026-03-20T08:00:00Z'),
        lastUpdatedAt: new Date('2026-03-20T08:30:00Z'),
        resolvedAt: null,
        vectorClock: { 'peer-inst': 1 },
      };

      const payload = JSON.stringify(outageData);
      const signature = crypto.sign(payload, peerKeys.privateKey);

      const message: SyncMessage = {
        id: 'msg-1',
        sourceInstance: peer.instanceId,
        targetInstance: config.instanceId,
        type: SyncMessageType.OUTAGE_REPORT,
        payload,
        signature,
        timestamp: new Date(),
      };

      const result = manager.receiveSync(message);
      expect(result.outageId).toBe('remote-outage-1');
      expect(result.serviceCategory).toBe('cdn');
    });

    it('throws for unknown peer', async () => {
      await manager.registerInstance(config);

      const message: SyncMessage = {
        id: 'msg-1',
        sourceInstance: 'unknown-peer',
        targetInstance: config.instanceId,
        type: SyncMessageType.OUTAGE_REPORT,
        payload: '{}',
        signature: 'bad',
        timestamp: new Date(),
      };

      expect(() => manager.receiveSync(message)).toThrow('Unknown peer');
    });
  });

  describe('broadcastOutage', () => {
    it('broadcasts to all healthy peers', async () => {
      await manager.registerInstance(config);

      const sentMessages: SyncMessage[] = [];
      dataSync.setSendFunction(async (_peer, msg) => {
        sentMessages.push(msg);
      });

      const peerKeys1 = crypto.generateKeyPair();
      const peerKeys2 = crypto.generateKeyPair();
      const p1 = peerDiscovery.addPeer('https://peer-1.io', peerKeys1.publicKey);
      const p2 = peerDiscovery.addPeer('https://peer-2.io', peerKeys2.publicKey);
      await peerDiscovery.pingPeer(p1.instanceId);
      await peerDiscovery.pingPeer(p2.instanceId);

      const count = await manager.broadcastOutage(makeRawOutage());
      expect(count).toBe(2);
      expect(sentMessages).toHaveLength(2);
    });

    it('returns 0 when data sharing is none', async () => {
      const noShareConfig = makeConfig({ dataSharing: 'none' });
      const noShareManager = new FederationManager({ peerDiscovery, dataSync, crypto });
      await noShareManager.registerInstance(noShareConfig);

      const count = await noShareManager.broadcastOutage(makeRawOutage());
      expect(count).toBe(0);

      await noShareManager.deregister();
    });

    it('handles peer send failure gracefully', async () => {
      await manager.registerInstance(config);

      dataSync.setSendFunction(async () => {
        throw new Error('connection reset');
      });

      const peerKeys = crypto.generateKeyPair();
      const peer = peerDiscovery.addPeer('https://peer-fail.io', peerKeys.publicKey);
      await peerDiscovery.pingPeer(peer.instanceId);

      const count = await manager.broadcastOutage(makeRawOutage());
      expect(count).toBe(0);
    });

    it('stores the outage locally after broadcast', async () => {
      await manager.registerInstance(config);
      await manager.broadcastOutage(makeRawOutage({ id: 'outage-local' }));

      const outages = manager.getLocalOutages();
      expect(outages).toHaveLength(1);
      expect(outages[0]!.outageId).toBe('outage-local');
    });
  });
});
