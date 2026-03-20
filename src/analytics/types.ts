/**
 * Types for the OpenPulse analytics and ClickHouse integration (Sprint 13).
 *
 * Covers ClickHouse configuration, outage history, category summaries,
 * trend analysis, service reliability, correlation detection, ETL events,
 * and predictive analytics.
 */

export interface ClickHouseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  maxConnections?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export const DEFAULT_CLICKHOUSE_CONFIG: ClickHouseConfig = {
  host: 'localhost',
  port: 8123,
  database: 'openpulse',
  username: 'default',
  password: '',
  maxConnections: 10,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

export interface OutageHistoryRecord {
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
  affectedRegions: string[];
  detectionSignals: string[];
  mttr: number;
  mttd: number;
}

export interface CategorySummary {
  category: string;
  totalOutages: number;
  avgDurationMs: number;
  avgMttd: number;
  avgMttr: number;
  topAffectedServices: { serviceSlug: string; serviceName: string; outageCount: number }[];
  outagesByMonth: { month: string; count: number }[];
}

export interface TrendData {
  period: string;
  totalOutages: number;
  avgDuration: number;
  serviceCount: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
}

export interface AnalyticsQuery {
  serviceSlug?: string;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ServiceReliability {
  serviceSlug: string;
  serviceName: string;
  uptimePercent: number;
  totalOutages: number;
  avgDuration: number;
  mttr: number;
  mttd: number;
  rank: number;
}

export interface CorrelationResult {
  serviceA: string;
  serviceB: string;
  correlationScore: number;
  coOccurrences: number;
  timeWindowMs: number;
}

export interface ETLEvent {
  type: 'outage' | 'report_aggregate' | 'probe_aggregate' | 'social_aggregate';
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface PercentileMetrics {
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}
