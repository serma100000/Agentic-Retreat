/**
 * Business logic layer for report operations.
 * Handles report creation, time-series queries, and count aggregation.
 */

import type { AppDatabase } from '../plugins/database.js';
import type { Redis } from 'ioredis';
import { reports } from '@openpulse/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface CreateReportInput {
  readonly id: string;
  readonly serviceId: string;
  readonly reportType: string;
  readonly regionCode: string | null;
  readonly city: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly deviceFingerprintHash: string;
  readonly source: string;
}

export interface TimeSeriesPoint {
  readonly bucket: string;
  readonly count: number;
  readonly report_type: string;
}

export interface ReportCounts {
  total: number;
  outage: number;
  degraded: number;
  operational: number;
}

const INTERVAL_TO_BUCKET: Record<string, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '1h': '1 hour',
  '1d': '1 day',
};

export class ReportService {
  constructor(
    private readonly db: AppDatabase,
    private readonly redis: Redis,
  ) {}

  async create(input: CreateReportInput): Promise<void> {
    await this.db.insert(reports).values({
      id: input.id,
      serviceId: input.serviceId,
      reportType: input.reportType,
      regionCode: input.regionCode,
      city: input.city,
      latitude: input.latitude?.toString() ?? null,
      longitude: input.longitude?.toString() ?? null,
      deviceFingerprintHash: input.deviceFingerprintHash,
      source: input.source,
    });
  }

  async getTimeSeries(
    serviceId: string,
    interval: string,
    start: Date,
    end: Date,
  ): Promise<TimeSeriesPoint[]> {
    const bucketSize = INTERVAL_TO_BUCKET[interval] ?? '1 hour';

    const result = await this.db.execute(
      sql`SELECT
            time_bucket(${bucketSize}::interval, created_at) AS bucket,
            report_type,
            COUNT(*)::int AS count
          FROM reports
          WHERE service_id = ${serviceId}
            AND created_at >= ${start}
            AND created_at <= ${end}
          GROUP BY bucket, report_type
          ORDER BY bucket ASC`,
    );

    return (result as unknown as TimeSeriesPoint[]).map((row) => ({
      bucket: String(row.bucket),
      count: Number(row.count),
      report_type: String(row.report_type),
    }));
  }

  async getRecentCounts(serviceId: string): Promise<ReportCounts> {
    const cacheKey = `report_counts:${serviceId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as ReportCounts;
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await this.db
      .select({
        reportType: reports.reportType,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(reports)
      .where(and(eq(reports.serviceId, serviceId), gte(reports.createdAt, oneHourAgo)))
      .groupBy(reports.reportType);

    const counts: ReportCounts = {
      total: 0,
      outage: 0,
      degraded: 0,
      operational: 0,
    };

    for (const row of result) {
      const count = Number(row.count);
      const type = row.reportType;
      if (type === 'outage' || type === 'degraded' || type === 'operational') {
        counts[type] = count;
      }
      counts.total += count;
    }

    await this.redis.setex(cacheKey, 30, JSON.stringify(counts));
    return counts;
  }

  async incrementRedisCounter(serviceId: string): Promise<void> {
    const minuteBucket = Math.floor(Date.now() / 60000);
    const key = `report_count:${serviceId}:${minuteBucket}`;
    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, 86400); // 24h TTL
    await pipeline.exec();
  }
}
