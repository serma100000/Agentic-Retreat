/**
 * Types for the OpenPulse federation module.
 *
 * Covers federated instances, peer connections, sync messages,
 * shared outage data, and federation metrics.
 */

export const InstanceStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SYNCING: 'syncing',
  DEGRADED: 'degraded',
} as const;

export type InstanceStatusType = (typeof InstanceStatus)[keyof typeof InstanceStatus];

export const DataSharingLevel = {
  FULL: 'full',
  AGGREGATE: 'aggregate',
  NONE: 'none',
} as const;

export type DataSharingLevelType = (typeof DataSharingLevel)[keyof typeof DataSharingLevel];

export const SyncMessageType = {
  OUTAGE_REPORT: 'outage_report',
  OUTAGE_UPDATE: 'outage_update',
  OUTAGE_RESOLVED: 'outage_resolved',
  HEARTBEAT: 'heartbeat',
  PEER_ANNOUNCE: 'peer_announce',
  PEER_LEAVE: 'peer_leave',
} as const;

export type SyncMessageTypeValue = (typeof SyncMessageType)[keyof typeof SyncMessageType];

export const PeerStatus = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  UNREACHABLE: 'unreachable',
} as const;

export type PeerStatusType = (typeof PeerStatus)[keyof typeof PeerStatus];

export const OutageSeverity = {
  MINOR: 'minor',
  MAJOR: 'major',
  CRITICAL: 'critical',
} as const;

export type OutageSeverityType = (typeof OutageSeverity)[keyof typeof OutageSeverity];

export interface FederatedInstance {
  id: string;
  name: string;
  url: string;
  publicKey: string;
  lastSyncAt: Date | null;
  status: InstanceStatusType;
}

export interface FederationConfig {
  instanceId: string;
  instanceName: string;
  instanceUrl: string;
  networkUrl: string;
  syncIntervalMs: number;
  dataSharing: DataSharingLevelType;
  privateKey: string;
  publicKey: string;
}

export interface SyncMessage {
  id: string;
  sourceInstance: string;
  targetInstance: string;
  type: SyncMessageTypeValue;
  payload: string;
  signature: string;
  timestamp: Date;
}

export interface PeerConnection {
  instanceId: string;
  url: string;
  publicKey: string;
  status: PeerStatusType;
  latencyMs: number;
  lastHeartbeat: Date;
}

export interface SharedOutageData {
  outageId: string;
  serviceCategory: string;
  region: string;
  severity: OutageSeverityType;
  reportCount: number;
  firstDetectedAt: Date;
  lastUpdatedAt: Date;
  resolvedAt: Date | null;
  vectorClock: Record<string, number>;
}

export interface FederationMetrics {
  instanceId: string;
  peers: number;
  syncsPerHour: number;
  dataSharedBytes: number;
  lastSyncAt: Date | null;
  uptimeSeconds: number;
  syncErrors: number;
}

export interface SyncLogEntry {
  id: string;
  peerId: string;
  direction: 'inbound' | 'outbound';
  messageType: SyncMessageTypeValue;
  payloadSizeBytes: number;
  success: boolean;
  errorMessage: string | null;
  timestamp: Date;
}

export interface VectorClock {
  [instanceId: string]: number;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  encryptionPublicKey: string;
  encryptionPrivateKey: string;
}
