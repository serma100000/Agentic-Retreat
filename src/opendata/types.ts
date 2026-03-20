/**
 * Types for the OpenPulse Open Data API (Sprint 19).
 *
 * Covers anonymized outage data, reliability statistics, trend analysis,
 * bulk export formats, data licensing, rate limiting, and developer keys.
 * All outage data is aggregated to 5-minute windows and city-level geography
 * to ensure no PII leakage.
 */

/** Query parameters for filtering open data outage results. */
export interface OpenDataQuery {
  serviceSlug?: string;
  category?: string;
  city?: string;
  region?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/** An outage record with all PII stripped and data aggregated. */
export interface AnonymizedOutage {
  /** Unique identifier for the anonymized outage record. */
  id: string;
  /** Service slug (e.g. "github", "aws"). */
  serviceSlug: string;
  /** Service display name. */
  serviceName: string;
  /** Service category (e.g. "devtools", "cloud"). */
  category: string;
  /** Outage state (e.g. "RESOLVED", "ONGOING"). */
  state: string;
  /** Detection confidence score 0-1. */
  confidence: number;
  /** Start time rounded to 5-minute window. */
  windowStart: Date;
  /** End time rounded to 5-minute window, null if ongoing. */
  windowEnd: Date | null;
  /** Duration in milliseconds (aggregated). */
  durationMs: number;
  /** City-level geographic area. */
  city: string;
  /** Region or state. */
  region: string;
  /** Country code. */
  country: string;
  /** Aggregated report count for this window. */
  reportCount: number;
  /** Detection signal types used (no raw data). */
  detectionSignals: string[];
}

/** Reliability statistics for a single service. */
export interface ReliabilityStats {
  serviceSlug: string;
  serviceName: string;
  /** Uptime percentage (0-100). */
  uptimePercent: number;
  /** Total number of outages in the measurement period. */
  totalOutages: number;
  /** Mean time to resolve in milliseconds. */
  mttrMs: number;
  /** Average outage frequency per month. */
  outagesPerMonth: number;
  /** Measurement period start. */
  periodStart: Date;
  /** Measurement period end. */
  periodEnd: Date;
}

/** Trend data for platform-wide analysis. */
export interface TrendData {
  period: string;
  totalOutages: number;
  avgDurationMs: number;
  serviceCount: number;
  byCategory: Record<string, number>;
  byRegion: Record<string, number>;
  reportVolume: number;
}

/** Supported export formats. */
export type ExportFormat = 'json' | 'csv' | 'parquet';

/** Options for bulk data export. */
export interface ExportOptions {
  format: ExportFormat;
  query: OpenDataQuery;
  includeHeaders?: boolean;
  compress?: boolean;
}

/** CC-BY-4.0 data license constant. */
export const DATA_LICENSE = 'CC-BY-4.0' as const;

/** Full license metadata. */
export interface DataLicense {
  identifier: typeof DATA_LICENSE;
  name: string;
  url: string;
  attribution: string;
}

export const LICENSE_INFO: DataLicense = {
  identifier: DATA_LICENSE,
  name: 'Creative Commons Attribution 4.0 International',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'OpenPulse Open Data API',
};

/** Rate limit tiers for API access. */
export type RateLimitTier = 'free' | 'registered' | 'enterprise';

/** Rate limit configuration per tier. */
export interface RateLimitConfig {
  tier: RateLimitTier;
  requestsPerDay: number;
  burstLimit: number;
}

export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  free: { tier: 'free', requestsPerDay: 1000, burstLimit: 50 },
  registered: { tier: 'registered', requestsPerDay: 10000, burstLimit: 200 },
  enterprise: { tier: 'enterprise', requestsPerDay: 100000, burstLimit: 1000 },
};

/** Developer API key for tracking usage and rate limiting. */
export interface DeveloperKey {
  key: string;
  name: string;
  tier: RateLimitTier;
  createdAt: Date;
  lastUsedAt: Date | null;
  dailyUsage: number;
  isActive: boolean;
}

/** Raw outage record before anonymization (internal use only). */
export interface RawOutageRecord {
  outageId: string;
  serviceId: string;
  serviceSlug: string;
  serviceName: string;
  category: string;
  state: string;
  confidence: number;
  startedAt: Date;
  resolvedAt: Date | null;
  durationMs: number;
  peakReportsPerMin: number;
  reporterEmail?: string;
  reporterIp?: string;
  deviceId?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  region?: string;
  country?: string;
  detectionSignals: string[];
  rawReportData?: Record<string, unknown>;
}

/** Schema descriptor for SDK generation. */
export interface ApiSchema {
  endpoints: ApiEndpoint[];
  types: ApiTypeDefinition[];
  baseUrl: string;
  version: string;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  queryParams: ApiParam[];
  pathParams: ApiParam[];
  responseType: string;
}

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiTypeDefinition {
  name: string;
  fields: ApiTypeField[];
}

export interface ApiTypeField {
  name: string;
  type: string;
  optional: boolean;
  description: string;
}
