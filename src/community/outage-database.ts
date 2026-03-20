/**
 * Public historical outage database for the OpenPulse platform.
 *
 * Provides query, timeline, statistics, and export capabilities
 * for resolved and ongoing outage records.
 */

import type {
  ExportFormat,
  HistoricalQuery,
  OutageReport,
  OutageSeverityType,
  OutageStatistics,
  OutageTimelineEvent,
} from './types.js';
import { OutageSeverity } from './types.js';

export class OutageDatabase {
  private readonly outages = new Map<string, OutageReport>();

  /**
   * Add an outage report to the database.
   */
  addOutage(outage: OutageReport): void {
    this.outages.set(outage.id, outage);
  }

  /**
   * Get a single outage by ID.
   */
  getOutage(id: string): OutageReport | undefined {
    return this.outages.get(id);
  }

  /**
   * Query outages with filters.
   */
  query(filters: HistoricalQuery): OutageReport[] {
    let results = [...this.outages.values()];

    if (filters.serviceSlug) {
      results = results.filter((o) => o.serviceSlug === filters.serviceSlug);
    }

    if (filters.severity) {
      results = results.filter((o) => o.severity === filters.severity);
    }

    if (filters.startDate) {
      const startMs = filters.startDate.getTime();
      results = results.filter((o) => o.startedAt.getTime() >= startMs);
    }

    if (filters.endDate) {
      const endMs = filters.endDate.getTime();
      results = results.filter((o) => o.startedAt.getTime() <= endMs);
    }

    if (filters.region) {
      results = results.filter((o) =>
        o.affectedRegions.some(
          (r) => r.toLowerCase() === filters.region!.toLowerCase(),
        ),
      );
    }

    // Sort by start time descending (most recent first)
    results.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    if (filters.offset && filters.offset > 0) {
      results = results.slice(filters.offset);
    }

    if (filters.limit && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * Get the full event timeline for an outage.
   */
  getTimeline(outageId: string): OutageTimelineEvent[] {
    const outage = this.outages.get(outageId);
    if (!outage) {
      return [];
    }
    return [...outage.timeline].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Get aggregate statistics for a service.
   */
  getStatistics(serviceSlug: string): OutageStatistics {
    const serviceOutages = [...this.outages.values()].filter(
      (o) => o.serviceSlug === serviceSlug,
    );

    const outageBySeverity: Record<OutageSeverityType, number> = {
      [OutageSeverity.MINOR]: 0,
      [OutageSeverity.MAJOR]: 0,
      [OutageSeverity.CRITICAL]: 0,
    };

    let totalDurationMs = 0;
    let resolvedCount = 0;
    let longestOutageMs = 0;
    const regionCounts = new Map<string, number>();

    for (const outage of serviceOutages) {
      outageBySeverity[outage.severity] =
        (outageBySeverity[outage.severity] ?? 0) + 1;

      if (outage.durationMs !== null) {
        totalDurationMs += outage.durationMs;
        resolvedCount++;
        if (outage.durationMs > longestOutageMs) {
          longestOutageMs = outage.durationMs;
        }
      }

      for (const region of outage.affectedRegions) {
        regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      }
    }

    let mostAffectedRegion: string | null = null;
    let maxRegionCount = 0;
    for (const [region, count] of regionCounts) {
      if (count > maxRegionCount) {
        maxRegionCount = count;
        mostAffectedRegion = region;
      }
    }

    const averageDurationMs =
      resolvedCount > 0 ? totalDurationMs / resolvedCount : 0;

    // Calculate uptime percentage based on total monitoring time
    const uptimePercentage = this.calculateUptime(serviceOutages);

    return {
      serviceSlug,
      totalOutages: serviceOutages.length,
      averageDurationMs,
      mttr: averageDurationMs, // MTTR equals average duration for resolved outages
      longestOutageMs,
      mostAffectedRegion,
      outageBySeverity,
      uptimePercentage,
    };
  }

  /**
   * Export outage data in the specified format.
   */
  exportData(format: ExportFormat, filters: HistoricalQuery = {}): string {
    const results = this.query(filters);

    if (format === 'json') {
      return JSON.stringify(
        results.map((o) => ({
          ...o,
          startedAt: o.startedAt.toISOString(),
          resolvedAt: o.resolvedAt?.toISOString() ?? null,
          timeline: o.timeline.map((t) => ({
            ...t,
            timestamp: t.timestamp.toISOString(),
          })),
        })),
        null,
        2,
      );
    }

    // CSV format
    const headers = [
      'id',
      'serviceSlug',
      'serviceName',
      'title',
      'severity',
      'startedAt',
      'resolvedAt',
      'durationMs',
      'affectedRegions',
      'peakAnomalyScore',
      'peakConfidence',
    ];

    const rows = results.map((o) =>
      [
        o.id,
        o.serviceSlug,
        o.serviceName,
        `"${o.title.replace(/"/g, '""')}"`,
        o.severity,
        o.startedAt.toISOString(),
        o.resolvedAt?.toISOString() ?? '',
        o.durationMs?.toString() ?? '',
        `"${o.affectedRegions.join(', ')}"`,
        o.peakAnomalyScore.toString(),
        o.peakConfidence.toString(),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Get the most recent resolved outages.
   */
  getRecentOutages(limit: number): OutageReport[] {
    return [...this.outages.values()]
      .filter((o) => o.resolvedAt !== null)
      .sort((a, b) => {
        const aResolved = a.resolvedAt?.getTime() ?? 0;
        const bResolved = b.resolvedAt?.getTime() ?? 0;
        return bResolved - aResolved;
      })
      .slice(0, limit);
  }

  /**
   * Get count of all outages in the database.
   */
  count(): number {
    return this.outages.size;
  }

  // ---- Private ----

  private calculateUptime(outages: OutageReport[]): number {
    if (outages.length === 0) return 100;

    const resolvedOutages = outages.filter(
      (o) => o.durationMs !== null && o.startedAt && o.resolvedAt,
    );

    if (resolvedOutages.length === 0) return 100;

    // Find the total monitoring window
    const earliest = Math.min(...outages.map((o) => o.startedAt.getTime()));
    const latest = Math.max(
      ...outages.map((o) =>
        o.resolvedAt ? o.resolvedAt.getTime() : Date.now(),
      ),
    );

    const totalWindowMs = latest - earliest;
    if (totalWindowMs <= 0) return 100;

    const totalDowntimeMs = resolvedOutages.reduce(
      (sum, o) => sum + (o.durationMs ?? 0),
      0,
    );

    const uptime = ((totalWindowMs - totalDowntimeMs) / totalWindowMs) * 100;
    return Math.max(0, Math.min(100, Number(uptime.toFixed(4))));
  }
}
