/**
 * Types for the OpenPulse GraphQL API layer (Sprint 14).
 *
 * Covers GraphQL context, query complexity analysis,
 * subscription events, and DataLoader key types.
 */

export interface DatabaseLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  del(key: string): Promise<number>;
}

export const ApiTier = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

export type ApiTierType = (typeof ApiTier)[keyof typeof ApiTier];

export interface GraphQLContext {
  db: DatabaseLike;
  redis: RedisLike;
  userId?: string;
  apiKey?: string;
  apiTier: ApiTierType;
  rateLimitRemaining: number;
  loaders: DataLoaders;
}

export interface DataLoaders {
  serviceLoader: DataLoaderLike<string, ServiceRow | null>;
  outageLoader: DataLoaderLike<string, OutageRow[]>;
  timelineLoader: DataLoaderLike<string, TimelineEntry[]>;
  probeStatusLoader: DataLoaderLike<string, ProbeStatusRow | null>;
  reportCountLoader: DataLoaderLike<string, number>;
}

export interface DataLoaderLike<K, V> {
  load(key: K): Promise<V>;
  loadMany(keys: K[]): Promise<V[]>;
  clear(key: K): void;
  clearAll(): void;
}

export interface QueryComplexity {
  score: number;
  maxAllowed: number;
  fields: string[];
}

export interface SubscriptionEvent {
  type: 'outage_updated' | 'report_received' | 'global_stats';
  serviceSlug?: string;
  data: unknown;
  timestamp: Date;
}

export interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  url: string;
  created_at: Date;
  updated_at: Date;
}

export interface OutageRow {
  id: string;
  service_id: string;
  status: string;
  confidence: number;
  started_at: Date;
  resolved_at: Date | null;
  affected_regions: string[];
  detection_signals: string;
}

export interface TimelineEntry {
  id: string;
  outage_id: string;
  state: string;
  confidence: number;
  created_at: Date;
  message?: string;
}

export interface ProbeStatusRow {
  service_id: string;
  success: boolean;
  latency_ms: number;
  status_code: number;
  checked_at: Date;
}

export interface ReportInput {
  serviceSlug: string;
  type: string;
  description?: string;
  region?: string;
}

export interface NotificationPreferenceInput {
  channel: string;
  enabled: boolean;
  serviceFilters?: string[];
  minSeverity?: string;
}

export interface ApiKeyInput {
  name: string;
  tier?: ApiTierType;
  expiresInDays?: number;
}

export const OutageStatus = {
  ACTIVE: 'ACTIVE',
  INVESTIGATING: 'INVESTIGATING',
  RESOLVED: 'RESOLVED',
} as const;

export type OutageStatusType = (typeof OutageStatus)[keyof typeof OutageStatus];

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface ServiceConnection {
  nodes: ServiceRow[];
  totalCount: number;
  pageInfo: PageInfo;
}

export interface OutageConnection {
  nodes: OutageRow[];
  totalCount: number;
  pageInfo: PageInfo;
}
