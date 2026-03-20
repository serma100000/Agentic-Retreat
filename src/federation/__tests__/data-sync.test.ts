import { describe, expect, it, beforeEach } from 'vitest';
import { DataSync, type RawOutageData } from '../data-sync.js';
import { FederationCrypto } from '../crypto.js';
import type { PeerConnection, SharedOutageData, SyncMessage } from '../types.js';
import { PeerStatus, SyncMessageType } from '../types.js';

function makeRawOutage(overrides: Partial<RawOutageData> = {}): RawOutageData {
  return {
    id: 'outage-1',
    serviceName: 'Acme API Gateway',
    serviceCategory: 'api',
    region: 'us-east-1',
    severity: 'major',
    reportCount: 42,
    reporterEmails: ['alice@acme.com', 'bob@acme.com'],
    internalNotes: 'CPU spike on node-7, investigating root cause',
    firstDetectedAt: new Date('2026-03-20T10:00:00Z'),
    lastUpdatedAt: new Date('2026-03-20T10:05:00Z'),
    resolvedAt: null,
    ...overrides,
  };
}

function makePeer(publicKey: string, overrides: Partial<PeerConnection> = {}): PeerConnection {
  return {
    instanceId: 'peer-1',
    url: 'https://peer-1.openpulse.io',
    publicKey,
    status: PeerStatus.CONNECTED,
    latencyMs: 15,
    lastHeartbeat: new Date(),
    ...overrides,
  };
}

function makeSharedOutage(overrides: Partial<SharedOutageData> = {}): SharedOutageData {
  return {
    outageId: 'outage-1',
    serviceCategory: 'api',
    region: 'us-east-1',
    severity: 'major',
    reportCount: 42,
    firstDetectedAt: new Date('2026-03-20T10:00:00Z'),
    lastUpdatedAt: new Date('2026-03-20T10:05:00Z'),
    resolvedAt: null,
    vectorClock: { 'inst-1': 1 },
    ...overrides,
  };
}

describe('DataSync', () => {
  let dataSync: DataSync;
  let crypto: FederationCrypto;
  let senderKeys: { publicKey: string; privateKey: string };
  let peerKeys: { publicKey: string; privateKey: string };

  beforeEach(() => {
    crypto = new FederationCrypto();
    senderKeys = crypto.generateKeyPair();
    peerKeys = crypto.generateKeyPair();

    dataSync = new DataSync(
      { instanceId: 'inst-1', privateKey: senderKeys.privateKey, maxHistoryEntries: 100 },
      crypto,
    );
  });

  describe('prepareOutageForSync', () => {
    it('strips PII fields from raw outage data', () => {
      const raw = makeRawOutage();
      const prepared = dataSync.prepareOutageForSync(raw);

      expect(prepared.outageId).toBe('outage-1');
      expect(prepared.serviceCategory).toBe('api');
      expect(prepared.region).toBe('us-east-1');
      expect(prepared.severity).toBe('major');
      expect(prepared.reportCount).toBe(42);

      // PII must not appear
      expect(JSON.stringify(prepared)).not.toContain('alice@acme.com');
      expect(JSON.stringify(prepared)).not.toContain('bob@acme.com');
      expect(JSON.stringify(prepared)).not.toContain('CPU spike');
      expect(JSON.stringify(prepared)).not.toContain('Acme API Gateway');
    });

    it('increments the vector clock for the local instance', () => {
      const raw = makeRawOutage();
      const prepared = dataSync.prepareOutageForSync(raw, { 'inst-1': 3 });
      expect(prepared.vectorClock['inst-1']).toBe(4);
    });

    it('initializes vector clock when none exists', () => {
      const raw = makeRawOutage();
      const prepared = dataSync.prepareOutageForSync(raw);
      expect(prepared.vectorClock['inst-1']).toBe(1);
    });
  });

  describe('sendSync', () => {
    it('sends a signed sync message to a peer', async () => {
      const sentMessages: SyncMessage[] = [];
      dataSync.setSendFunction(async (_peer, msg) => {
        sentMessages.push(msg);
      });

      const peer = makePeer(peerKeys.publicKey);
      const outage = makeSharedOutage();
      const msg = await dataSync.sendSync(peer, outage);

      expect(msg.sourceInstance).toBe('inst-1');
      expect(msg.targetInstance).toBe('peer-1');
      expect(msg.type).toBe(SyncMessageType.OUTAGE_REPORT);
      expect(msg.signature).toBeTruthy();

      // Verify the signature is valid
      const isValid = crypto.verify(msg.payload, msg.signature, senderKeys.publicKey);
      expect(isValid).toBe(true);
    });

    it('logs successful sends in sync history', async () => {
      dataSync.setSendFunction(async () => {});
      const peer = makePeer(peerKeys.publicKey);
      await dataSync.sendSync(peer, makeSharedOutage());

      const history = dataSync.getSyncHistory('peer-1');
      expect(history).toHaveLength(1);
      expect(history[0]!.direction).toBe('outbound');
      expect(history[0]!.success).toBe(true);
    });

    it('logs failed sends in sync history', async () => {
      dataSync.setSendFunction(async () => {
        throw new Error('timeout');
      });
      const peer = makePeer(peerKeys.publicKey);

      await expect(dataSync.sendSync(peer, makeSharedOutage())).rejects.toThrow('timeout');

      const history = dataSync.getSyncHistory('peer-1');
      expect(history).toHaveLength(1);
      expect(history[0]!.success).toBe(false);
      expect(history[0]!.errorMessage).toBe('timeout');
    });
  });

  describe('receiveSync', () => {
    it('validates signature and returns outage data', () => {
      const outage = makeSharedOutage();
      const payload = JSON.stringify(outage);
      const signature = crypto.sign(payload, peerKeys.privateKey);

      const message: SyncMessage = {
        id: 'msg-1',
        sourceInstance: 'peer-1',
        targetInstance: 'inst-1',
        type: SyncMessageType.OUTAGE_REPORT,
        payload,
        signature,
        timestamp: new Date(),
      };

      const result = dataSync.receiveSync(message, peerKeys.publicKey);
      expect(result.outageId).toBe('outage-1');
    });

    it('rejects messages with invalid signatures', () => {
      const outage = makeSharedOutage();
      const payload = JSON.stringify(outage);

      const message: SyncMessage = {
        id: 'msg-2',
        sourceInstance: 'peer-1',
        targetInstance: 'inst-1',
        type: SyncMessageType.OUTAGE_REPORT,
        payload,
        signature: 'invalid-signature-data',
        timestamp: new Date(),
      };

      expect(() => dataSync.receiveSync(message, peerKeys.publicKey)).toThrow(
        'signature verification failed',
      );
    });

    it('rejects tampered payloads', () => {
      const outage = makeSharedOutage();
      const payload = JSON.stringify(outage);
      const signature = crypto.sign(payload, peerKeys.privateKey);

      const tamperedPayload = JSON.stringify({ ...outage, reportCount: 9999 });

      const message: SyncMessage = {
        id: 'msg-3',
        sourceInstance: 'peer-1',
        targetInstance: 'inst-1',
        type: SyncMessageType.OUTAGE_REPORT,
        payload: tamperedPayload,
        signature,
        timestamp: new Date(),
      };

      expect(() => dataSync.receiveSync(message, peerKeys.publicKey)).toThrow(
        'signature verification failed',
      );
    });
  });

  describe('resolveConflicts', () => {
    it('picks remote when remote clock dominates', () => {
      const local = makeSharedOutage({ vectorClock: { 'inst-1': 1 } });
      const remote = makeSharedOutage({
        vectorClock: { 'inst-1': 2 },
        reportCount: 100,
      });

      const result = dataSync.resolveConflicts(local, remote);
      expect(result.reportCount).toBe(100);
    });

    it('picks local when local clock dominates', () => {
      const local = makeSharedOutage({
        vectorClock: { 'inst-1': 3, 'peer-1': 1 },
        reportCount: 50,
      });
      const remote = makeSharedOutage({
        vectorClock: { 'inst-1': 2, 'peer-1': 1 },
        reportCount: 30,
      });

      const result = dataSync.resolveConflicts(local, remote);
      expect(result.reportCount).toBe(50);
    });

    it('merges clocks on concurrent updates, picks later timestamp', () => {
      const local = makeSharedOutage({
        vectorClock: { 'inst-1': 2, 'peer-1': 1 },
        lastUpdatedAt: new Date('2026-03-20T10:00:00Z'),
        reportCount: 40,
      });
      const remote = makeSharedOutage({
        vectorClock: { 'inst-1': 1, 'peer-1': 2 },
        lastUpdatedAt: new Date('2026-03-20T10:10:00Z'),
        reportCount: 60,
      });

      const result = dataSync.resolveConflicts(local, remote);
      // Remote has later timestamp, wins
      expect(result.lastUpdatedAt).toEqual(new Date('2026-03-20T10:10:00Z'));
      // But report count is max of both
      expect(result.reportCount).toBe(60);
      // Merged clock
      expect(result.vectorClock['inst-1']).toBe(2);
      expect(result.vectorClock['peer-1']).toBe(2);
    });
  });

  describe('getSyncHistory', () => {
    it('returns empty when no history exists', () => {
      expect(dataSync.getSyncHistory('peer-1')).toEqual([]);
    });

    it('filters by peer id', async () => {
      dataSync.setSendFunction(async () => {});

      const peer1 = makePeer(peerKeys.publicKey, { instanceId: 'peer-1' });
      const peer2 = makePeer(peerKeys.publicKey, { instanceId: 'peer-2' });

      await dataSync.sendSync(peer1, makeSharedOutage());
      await dataSync.sendSync(peer2, makeSharedOutage());
      await dataSync.sendSync(peer1, makeSharedOutage());

      const history = dataSync.getSyncHistory('peer-1');
      expect(history).toHaveLength(2);
      expect(history.every((e) => e.peerId === 'peer-1')).toBe(true);
    });

    it('respects the limit parameter', async () => {
      dataSync.setSendFunction(async () => {});
      const peer = makePeer(peerKeys.publicKey);

      for (let i = 0; i < 5; i++) {
        await dataSync.sendSync(peer, makeSharedOutage());
      }

      const history = dataSync.getSyncHistory('peer-1', 3);
      expect(history).toHaveLength(3);
    });
  });
});
