/**
 * Core service for the OpenPulse Open Data API (Sprint 19).
 *
 * Provides anonymized historical outage data, service reliability metrics,
 * platform-wide trends, and bulk export capabilities. All responses are
 * stripped of PII and aggregated to protect user privacy.
 */

import type {
  AnonymizedOutage,
  OpenDataQuery,
  RawOutageRecord,
  ReliabilityStats,
  TrendData,
  ExportFormat,
  DeveloperKey,
  RateLimitTier,
} from './types.js';
import { RATE_LIMIT_TIERS } from './types.js';
import { DataAnonymizer } from './anonymizer.js';
import { ExportGenerator } from './export-generator.js';

/** In-memory store for outage records (replace with real DB in production). */
export interface OutageDataStore {
  getOutages(query: OpenDataQuery): Promise<RawOutageRecord[]>;
  getOutageCount(query: OpenDataQuery): Promise<number>;
  getServiceOutages(serviceSlug: string): Promise<RawOutageRecord[]>;
  getAllOutages(): Promise<RawOutageRecord[]>;
}

/**
 * Simple in-memory implementation of OutageDataStore for testing
 * and local development.
 */
export class InMemoryOutageStore implements OutageDataStore {
  private records: RawOutageRecord[] = [];

  insert(records: RawOutageRecord[]): void {
    this.records.push(...records);
  }

  clear(): void {
    this.records = [];
  }

  async getOutages(query: OpenDataQuery): Promise<RawOutageRecord[]> {
    let filtered = [...this.records];

    if (query.serviceSlug) {
      filtered = filtered.filter(r => r.serviceSlug === query.serviceSlug);
    }
    if (query.category) {
      filtered = filtered.filter(r => r.category === query.category);
    }
    if (query.city) {
      filtered = filtered.filter(r => r.city === query.city);
    }
    if (query.region) {
      filtered = filtered.filter(r => r.region === query.region);
    }
    if (query.startDate) {
      const start = query.startDate.getTime();
      filtered = filtered.filter(r => r.startedAt.getTime() >= start);
    }
    if (query.endDate) {
      const end = query.endDate.getTime();
      filtered = filtered.filter(r => r.startedAt.getTime() <= end);
    }

    // Sort by startedAt descending
    filtered.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return filtered.slice(offset, offset + limit);
  }

  async getOutageCount(query: OpenDataQuery): Promise<number> {
    const all = await this.getOutages({ ...query, limit: Number.MAX_SAFE_INTEGER, offset: 0 });
    return all.length;
  }

  async getServiceOutages(serviceSlug: string): Promise<RawOutageRecord[]> {
    return this.records.filter(r => r.serviceSlug === serviceSlug);
  }

  async getAllOutages(): Promise<RawOutageRecord[]> {
    return [...this.records];
  }
}

/** Daily usage tracker for rate limiting. */
interface UsageEntry {
  date: string;
  count: number;
}

/**
 * Service layer for the Open Data API.
 */
export class OpenDataService {
  private readonly anonymizer: DataAnonymizer;
  private readonly exportGenerator: ExportGenerator;
  private readonly usageTracker: Map<string, UsageEntry> = new Map();
  private readonly developerKeys: Map<string, DeveloperKey> = new Map();

  constructor(
    private readonly store: OutageDataStore,
    anonymizer?: DataAnonymizer,
    exportGenerator?: ExportGenerator,
  ) {
    this.anonymizer = anonymizer ?? new DataAnonymizer();
    this.exportGenerator = exportGenerator ?? new ExportGenerator();
  }

  /**
   * Register a developer key for rate-limited access.
   */
  registerKey(key: DeveloperKey): void {
    this.developerKeys.set(key.key, key);
  }

  /**
   * Get anonymized historical outages with pagination and filters.
   */
  async getOutages(query: OpenDataQuery): Promise<{
    data: AnonymizedOutage[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const [raw, total] = await Promise.all([
      this.store.getOutages(query),
      this.store.getOutageCount(query),
    ]);

    const anonymized = raw.map(r => this.anonymizer.anonymizeOutage(r));

    return {
      data: anonymized,
      total,
      limit: query.limit ?? 100,
      offset: query.offset ?? 0,
    };
  }

  /**
   * Get reliability statistics for a specific service.
   */
  async getServiceReliability(serviceSlug: string): Promise<ReliabilityStats> {
    const outages = await this.store.getServiceOutages(serviceSlug);

    if (outages.length === 0) {
      return {
        serviceSlug,
        serviceName: serviceSlug,
        uptimePercent: 100,
        totalOutages: 0,
        mttrMs: 0,
        outagesPerMonth: 0,
        periodStart: new Date(),
        periodEnd: new Date(),
      };
    }

    const sorted = [...outages].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
    );

    const periodStart = sorted[0]!.startedAt;
    const periodEnd = sorted[sorted.length - 1]!.resolvedAt ?? new Date();
    const periodMs = periodEnd.getTime() - periodStart.getTime();

    const totalDowntimeMs = outages.reduce((sum, o) => sum + o.durationMs, 0);
    const uptimePercent = periodMs > 0
      ? Math.round(((periodMs - totalDowntimeMs) / periodMs) * 10000) / 100
      : 100;

    const resolvedOutages = outages.filter(o => o.resolvedAt !== null);
    const mttrMs = resolvedOutages.length > 0
      ? Math.round(
          resolvedOutages.reduce((sum, o) => sum + o.durationMs, 0) /
          resolvedOutages.length,
        )
      : 0;

    const periodMonths = Math.max(1, periodMs / (30 * 24 * 60 * 60 * 1000));
    const outagesPerMonth = Math.round((outages.length / periodMonths) * 100) / 100;

    return {
      serviceSlug,
      serviceName: outages[0]!.serviceName,
      uptimePercent: Math.max(0, Math.min(100, uptimePercent)),
      totalOutages: outages.length,
      mttrMs,
      outagesPerMonth,
      periodStart,
      periodEnd,
    };
  }

  /**
   * Get platform-wide outage trends for a given period granularity.
   */
  async getTrends(
    period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  ): Promise<TrendData[]> {
    const allOutages = await this.store.getAllOutages();

    if (allOutages.length === 0) {
      return [];
    }

    const buckets = new Map<string, {
      outages: RawOutageRecord[];
      services: Set<string>;
    }>();

    for (const outage of allOutages) {
      const key = this.getPeriodKey(outage.startedAt, period);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.outages.push(outage);
        bucket.services.add(outage.serviceSlug);
      } else {
        buckets.set(key, {
          outages: [outage],
          services: new Set([outage.serviceSlug]),
        });
      }
    }

    const trends: TrendData[] = [];
    for (const [periodKey, bucket] of buckets) {
      const byCategory: Record<string, number> = {};
      const byRegion: Record<string, number> = {};
      let totalDuration = 0;
      let totalReports = 0;

      for (const outage of bucket.outages) {
        byCategory[outage.category] = (byCategory[outage.category] ?? 0) + 1;
        const region = outage.region ?? 'Unknown';
        byRegion[region] = (byRegion[region] ?? 0) + 1;
        totalDuration += outage.durationMs;
        totalReports += outage.peakReportsPerMin;
      }

      trends.push({
        period: periodKey,
        totalOutages: bucket.outages.length,
        avgDurationMs: Math.round(totalDuration / bucket.outages.length),
        serviceCount: bucket.services.size,
        byCategory,
        byRegion,
        reportVolume: totalReports,
      });
    }

    return trends.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Generate a bulk data export in the requested format.
   */
  async getExport(
    format: ExportFormat,
    query: OpenDataQuery,
  ): Promise<string> {
    const raw = await this.store.getOutages({
      ...query,
      limit: query.limit ?? 10000,
    });
    const anonymized = raw.map(r => this.anonymizer.anonymizeOutage(r));

    switch (format) {
      case 'json':
        return this.exportGenerator.toJSON(anonymized);
      case 'csv':
        return this.exportGenerator.toCSV(anonymized);
      case 'parquet':
        return this.exportGenerator.toParquet(anonymized);
      default: {
        const _exhaustive: never = format;
        throw new Error(`Unsupported export format: ${_exhaustive}`);
      }
    }
  }

  /**
   * Get daily quota usage for a developer API key.
   */
  getDailyQuotaUsage(apiKey: string): {
    used: number;
    limit: number;
    remaining: number;
    tier: RateLimitTier;
    resetAt: Date;
  } {
    const today = new Date().toISOString().slice(0, 10);
    const usageKey = `${apiKey}:${today}`;
    const entry = this.usageTracker.get(usageKey);
    const used = entry?.count ?? 0;

    const devKey = this.developerKeys.get(apiKey);
    const tier: RateLimitTier = devKey?.tier ?? 'free';
    const tierConfig = RATE_LIMIT_TIERS[tier];

    // Reset at midnight UTC
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    return {
      used,
      limit: tierConfig.requestsPerDay,
      remaining: Math.max(0, tierConfig.requestsPerDay - used),
      tier,
      resetAt: tomorrow,
    };
  }

  /**
   * Increment usage counter for a developer key. Returns true if within limit.
   */
  trackRequest(apiKey: string): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const usageKey = `${apiKey}:${today}`;

    const entry = this.usageTracker.get(usageKey);
    const currentCount = entry?.count ?? 0;

    const devKey = this.developerKeys.get(apiKey);
    const tier: RateLimitTier = devKey?.tier ?? 'free';
    const tierConfig = RATE_LIMIT_TIERS[tier];

    if (currentCount >= tierConfig.requestsPerDay) {
      return false;
    }

    this.usageTracker.set(usageKey, { date: today, count: currentCount + 1 });
    return true;
  }

  private getPeriodKey(date: Date, period: 'daily' | 'weekly' | 'monthly'): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    switch (period) {
      case 'daily':
        return `${year}-${month}-${day}`;
      case 'weekly': {
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const dayOfYear = Math.floor(
          (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
        );
        const week = String(Math.ceil((dayOfYear + 1) / 7)).padStart(2, '0');
        return `${year}-W${week}`;
      }
      case 'monthly':
        return `${year}-${month}`;
    }
  }
}
