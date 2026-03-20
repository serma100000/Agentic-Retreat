/**
 * Business logic for OpenPulse analytics queries.
 *
 * Provides methods for outage history, category summaries, trend analysis,
 * service reliability rankings, and correlation detection.
 */

import type { ClickHouseClient } from './clickhouse-client.js';
import type {
  AnalyticsQuery,
  CategorySummary,
  CorrelationResult,
  OutageHistoryRecord,
  PercentileMetrics,
  ServiceReliability,
  TrendData,
} from './types.js';

export class AnalyticsService {
  private readonly client: ClickHouseClient;

  constructor(client: ClickHouseClient) {
    this.client = client;
  }

  /**
   * Query outage history with filters and pagination.
   * Results sorted by started_at descending.
   */
  async getOutageHistory(query: AnalyticsQuery): Promise<OutageHistoryRecord[]> {
    const conditions: string[] = [];

    if (query.serviceSlug) {
      conditions.push(`service_slug = '${query.serviceSlug}'`);
    }
    if (query.category) {
      conditions.push(`category = '${query.category}'`);
    }
    if (query.startDate) {
      conditions.push(`started_at >= '${query.startDate.toISOString()}'`);
    }
    if (query.endDate) {
      conditions.push(`started_at <= '${query.endDate.toISOString()}'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const sql = `
      SELECT * FROM outage_events
      ${whereClause}
      ORDER BY started_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `.trim();

    const rows = await this.client.query<Record<string, unknown>>(sql);
    return rows.map(row => this.mapOutageRecord(row));
  }

  /**
   * Get category summary with aggregated statistics.
   */
  async getCategorySummary(
    category: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<CategorySummary> {
    const conditions: string[] = [`category = '${category}'`];

    if (startDate) {
      conditions.push(`started_at >= '${startDate.toISOString()}'`);
    }
    if (endDate) {
      conditions.push(`started_at <= '${endDate.toISOString()}'`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const sql = `
      SELECT * FROM outage_events
      ${whereClause}
      ORDER BY started_at DESC
    `.trim();

    const rows = await this.client.query<Record<string, unknown>>(sql);

    if (rows.length === 0) {
      return {
        category,
        totalOutages: 0,
        avgDurationMs: 0,
        avgMttd: 0,
        avgMttr: 0,
        topAffectedServices: [],
        outagesByMonth: [],
      };
    }

    // Compute aggregates
    const totalOutages = rows.length;
    const avgDurationMs = this.average(rows.map(r => Number(r['duration_ms'] ?? 0)));
    const avgMttd = this.average(rows.map(r => Number(r['mttd'] ?? 0)));
    const avgMttr = this.average(rows.map(r => Number(r['mttr'] ?? 0)));

    // Top affected services
    const serviceCounts = new Map<string, { slug: string; name: string; count: number }>();
    for (const row of rows) {
      const slug = String(row['service_slug'] ?? '');
      const name = String(row['service_name'] ?? '');
      const existing = serviceCounts.get(slug);
      if (existing) {
        existing.count++;
      } else {
        serviceCounts.set(slug, { slug, name, count: 1 });
      }
    }

    const topAffectedServices = Array.from(serviceCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(s => ({
        serviceSlug: s.slug,
        serviceName: s.name,
        outageCount: s.count,
      }));

    // Outages by month
    const monthCounts = new Map<string, number>();
    for (const row of rows) {
      const startedAt = this.parseDate(row['started_at']);
      const monthKey = `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    }

    const outagesByMonth = Array.from(monthCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    return {
      category,
      totalOutages,
      avgDurationMs,
      avgMttd,
      avgMttr,
      topAffectedServices,
      outagesByMonth,
    };
  }

  /**
   * Get platform-wide trends over time.
   */
  async getTrends(
    period: 'weekly' | 'monthly' | 'quarterly',
    months = 12,
  ): Promise<TrendData[]> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const sql = `
      SELECT * FROM outage_events
      WHERE started_at >= '${cutoff.toISOString()}'
      ORDER BY started_at ASC
    `.trim();

    const rows = await this.client.query<Record<string, unknown>>(sql);

    if (rows.length === 0) return [];

    // Group by period
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const startedAt = this.parseDate(row['started_at']);
      const periodKey = this.getPeriodKey(startedAt, period);
      if (!groups.has(periodKey)) {
        groups.set(periodKey, []);
      }
      groups.get(periodKey)!.push(row);
    }

    // Build trend data for each period
    const trends: TrendData[] = [];
    for (const [periodKey, periodRows] of groups) {
      const serviceSet = new Set<string>();
      const byCategory: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};

      for (const row of periodRows) {
        serviceSet.add(String(row['service_id'] ?? ''));

        const cat = String(row['category'] ?? 'unknown');
        byCategory[cat] = (byCategory[cat] ?? 0) + 1;

        const state = String(row['state'] ?? 'unknown');
        bySeverity[state] = (bySeverity[state] ?? 0) + 1;
      }

      trends.push({
        period: periodKey,
        totalOutages: periodRows.length,
        avgDuration: this.average(periodRows.map(r => Number(r['duration_ms'] ?? 0))),
        serviceCount: serviceSet.size,
        byCategory,
        bySeverity,
      });
    }

    return trends.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Get service reliability metrics ranked within an optional category.
   */
  async getServiceReliability(
    category?: string,
    limit = 50,
  ): Promise<ServiceReliability[]> {
    const conditions: string[] = [];
    if (category) {
      conditions.push(`category = '${category}'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const sql = `
      SELECT * FROM outage_events
      ${whereClause}
      ORDER BY started_at DESC
    `.trim();

    const rows = await this.client.query<Record<string, unknown>>(sql);

    // Group by service
    const serviceMap = new Map<string, {
      slug: string;
      name: string;
      durations: number[];
      mttrs: number[];
      mttds: number[];
      totalDurationMs: number;
    }>();

    for (const row of rows) {
      const slug = String(row['service_slug'] ?? '');
      const name = String(row['service_name'] ?? '');
      const duration = Number(row['duration_ms'] ?? 0);
      const mttr = Number(row['mttr'] ?? 0);
      const mttd = Number(row['mttd'] ?? 0);

      const existing = serviceMap.get(slug);
      if (existing) {
        existing.durations.push(duration);
        existing.mttrs.push(mttr);
        existing.mttds.push(mttd);
        existing.totalDurationMs += duration;
      } else {
        serviceMap.set(slug, {
          slug,
          name,
          durations: [duration],
          mttrs: [mttr],
          mttds: [mttd],
          totalDurationMs: duration,
        });
      }
    }

    // Compute reliability per service
    // Assume a 30-day window for uptime calculation
    const windowMs = 30 * 24 * 60 * 60 * 1000;

    const reliabilities: ServiceReliability[] = Array.from(serviceMap.values()).map(s => ({
      serviceSlug: s.slug,
      serviceName: s.name,
      uptimePercent: Math.max(0, ((windowMs - s.totalDurationMs) / windowMs) * 100),
      totalOutages: s.durations.length,
      avgDuration: this.average(s.durations),
      mttr: this.average(s.mttrs),
      mttd: this.average(s.mttds),
      rank: 0,
    }));

    // Sort by uptime descending and assign ranks
    reliabilities.sort((a, b) => b.uptimePercent - a.uptimePercent);
    for (let i = 0; i < reliabilities.length; i++) {
      reliabilities[i]!.rank = i + 1;
    }

    return reliabilities.slice(0, limit);
  }

  /**
   * Find services that frequently have outages within the same time window.
   * Useful for dependency inference.
   */
  async getCorrelations(
    serviceSlug: string,
    timeWindowMs = 30 * 60 * 1000, // 30 minutes default
  ): Promise<CorrelationResult[]> {
    // Get all outages for the target service
    const targetSql = `
      SELECT * FROM outage_events
      WHERE service_slug = '${serviceSlug}'
      ORDER BY started_at ASC
    `.trim();

    const targetOutages = await this.client.query<Record<string, unknown>>(targetSql);

    if (targetOutages.length === 0) return [];

    // Get all outages from other services
    const allSql = `
      SELECT * FROM outage_events
      ORDER BY started_at ASC
    `.trim();

    const allOutages = await this.client.query<Record<string, unknown>>(allSql);

    // Find co-occurrences
    const coOccurrences = new Map<string, {
      serviceSlug: string;
      count: number;
      totalTimeDiff: number;
    }>();

    for (const targetOutage of targetOutages) {
      const targetStart = this.parseDate(targetOutage['started_at']).getTime();

      for (const otherOutage of allOutages) {
        const otherSlug = String(otherOutage['service_slug'] ?? '');
        if (otherSlug === serviceSlug) continue;

        const otherStart = this.parseDate(otherOutage['started_at']).getTime();
        const timeDiff = Math.abs(targetStart - otherStart);

        if (timeDiff <= timeWindowMs) {
          const existing = coOccurrences.get(otherSlug);
          if (existing) {
            existing.count++;
            existing.totalTimeDiff += timeDiff;
          } else {
            coOccurrences.set(otherSlug, {
              serviceSlug: otherSlug,
              count: 1,
              totalTimeDiff: timeDiff,
            });
          }
        }
      }
    }

    // Compute correlation scores
    const results: CorrelationResult[] = Array.from(coOccurrences.values())
      .map(co => {
        // Score based on frequency and temporal proximity
        const avgTimeDiff = co.totalTimeDiff / co.count;
        const proximityScore = 1 - (avgTimeDiff / timeWindowMs);
        const frequencyScore = Math.min(1, co.count / targetOutages.length);
        const correlationScore = (proximityScore * 0.6) + (frequencyScore * 0.4);

        return {
          serviceA: serviceSlug,
          serviceB: co.serviceSlug,
          correlationScore: Math.max(0, Math.min(1, correlationScore)),
          coOccurrences: co.count,
          timeWindowMs,
        };
      })
      .filter(r => r.coOccurrences > 0)
      .sort((a, b) => b.correlationScore - a.correlationScore);

    return results;
  }

  /**
   * Get MTTR percentile metrics for a service.
   */
  async getMTTR(serviceSlug: string): Promise<PercentileMetrics> {
    const sql = `
      SELECT * FROM outage_events
      WHERE service_slug = '${serviceSlug}'
      ORDER BY started_at DESC
    `.trim();

    const rows = await this.client.query<Record<string, unknown>>(sql);
    const values = rows.map(r => Number(r['mttr'] ?? 0)).filter(v => v > 0);
    return this.computePercentiles(values);
  }

  /**
   * Get MTTD percentile metrics for a service.
   */
  async getMTTD(serviceSlug: string): Promise<PercentileMetrics> {
    const sql = `
      SELECT * FROM outage_events
      WHERE service_slug = '${serviceSlug}'
      ORDER BY started_at DESC
    `.trim();

    const rows = await this.client.query<Record<string, unknown>>(sql);
    const values = rows.map(r => Number(r['mttd'] ?? 0)).filter(v => v > 0);
    return this.computePercentiles(values);
  }

  // --- Private helpers ---

  private computePercentiles(values: number[]): PercentileMetrics {
    if (values.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const avg = this.average(sorted);
    const p50 = this.percentile(sorted, 50);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    return { avg, p50, p95, p99 };
  }

  private percentile(sorted: number[], pct: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0]!;

    const index = (pct / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const fraction = index - lower;

    if (lower === upper) return sorted[lower]!;
    return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private mapOutageRecord(row: Record<string, unknown>): OutageHistoryRecord {
    return {
      outageId: String(row['outage_id'] ?? ''),
      serviceId: String(row['service_id'] ?? ''),
      serviceSlug: String(row['service_slug'] ?? ''),
      serviceName: String(row['service_name'] ?? ''),
      category: String(row['category'] ?? ''),
      state: String(row['state'] ?? ''),
      confidence: Number(row['confidence'] ?? 0),
      startedAt: this.parseDate(row['started_at']),
      resolvedAt: row['resolved_at'] ? this.parseDate(row['resolved_at']) : null,
      durationMs: Number(row['duration_ms'] ?? 0),
      peakReportsPerMin: Number(row['peak_reports_per_min'] ?? 0),
      affectedRegions: this.parseArray(row['affected_regions']),
      detectionSignals: this.parseArray(row['detection_signals']),
      mttr: Number(row['mttr'] ?? 0),
      mttd: Number(row['mttd'] ?? 0),
    };
  }

  private parseDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    return new Date();
  }

  private parseArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        return [value];
      }
    }
    return [];
  }

  private getPeriodKey(date: Date, period: 'weekly' | 'monthly' | 'quarterly'): string {
    const year = date.getFullYear();
    const month = date.getMonth();

    switch (period) {
      case 'weekly': {
        // ISO week number
        const janFirst = new Date(year, 0, 1);
        const dayOfYear = Math.floor((date.getTime() - janFirst.getTime()) / 86400000) + 1;
        const week = Math.ceil(dayOfYear / 7);
        return `${year}-W${String(week).padStart(2, '0')}`;
      }
      case 'monthly':
        return `${year}-${String(month + 1).padStart(2, '0')}`;
      case 'quarterly': {
        const quarter = Math.floor(month / 3) + 1;
        return `${year}-Q${quarter}`;
      }
    }
  }
}
