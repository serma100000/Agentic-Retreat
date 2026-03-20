/**
 * Business logic for outage queries.
 * Handles listing active outages and retrieving outage detail with timeline.
 */

import type { AppDatabase } from '../plugins/database.js';
import { outages, outageTimeline } from '@openpulse/db/schema';
import { services } from '@openpulse/db/schema';
import { eq, sql, desc } from 'drizzle-orm';

export interface ActiveOutage {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly serviceSlug: string;
  readonly status: string;
  readonly confidenceScore: number;
  readonly startedAt: string;
  readonly peakReportsPerMin: number;
  readonly affectedRegions: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TimelineEvent {
  readonly id: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export interface OutageDetail {
  readonly id: string;
  readonly serviceId: string;
  readonly serviceName: string;
  readonly serviceSlug: string;
  readonly status: string;
  readonly confidenceScore: number;
  readonly startedAt: string;
  readonly resolvedAt: string | null;
  readonly peakReportsPerMin: number;
  readonly affectedRegions: unknown;
  readonly detectionSignals: unknown;
  readonly timeline: TimelineEvent[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class OutageService {
  constructor(private readonly db: AppDatabase) {}

  async listActive(): Promise<ActiveOutage[]> {
    const rows = await this.db
      .select({
        id: outages.id,
        serviceId: outages.serviceId,
        serviceName: services.name,
        serviceSlug: services.slug,
        status: outages.status,
        confidenceScore: outages.confidenceScore,
        startedAt: outages.startedAt,
        peakReportsPerMin: outages.peakReportsPerMin,
        affectedRegions: outages.affectedRegions,
        createdAt: outages.createdAt,
        updatedAt: outages.updatedAt,
      })
      .from(outages)
      .innerJoin(services, eq(outages.serviceId, services.id))
      .where(sql`${outages.status} NOT IN ('OPERATIONAL', 'RESOLVED')`)
      .orderBy(desc(outages.confidenceScore));

    return rows.map((row) => ({
      id: row.id,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      serviceSlug: row.serviceSlug,
      status: row.status,
      confidenceScore: Number(row.confidenceScore),
      startedAt: row.startedAt.toISOString(),
      peakReportsPerMin: row.peakReportsPerMin,
      affectedRegions: row.affectedRegions,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getById(id: string): Promise<OutageDetail | null> {
    const rows = await this.db
      .select({
        id: outages.id,
        serviceId: outages.serviceId,
        serviceName: services.name,
        serviceSlug: services.slug,
        status: outages.status,
        confidenceScore: outages.confidenceScore,
        startedAt: outages.startedAt,
        resolvedAt: outages.resolvedAt,
        peakReportsPerMin: outages.peakReportsPerMin,
        affectedRegions: outages.affectedRegions,
        detectionSignals: outages.detectionSignals,
        createdAt: outages.createdAt,
        updatedAt: outages.updatedAt,
      })
      .from(outages)
      .innerJoin(services, eq(outages.serviceId, services.id))
      .where(eq(outages.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const timelineRows = await this.db
      .select({
        id: outageTimeline.id,
        eventType: outageTimeline.eventType,
        payload: outageTimeline.payload,
        createdAt: outageTimeline.createdAt,
      })
      .from(outageTimeline)
      .where(eq(outageTimeline.outageId, id))
      .orderBy(outageTimeline.createdAt);

    return {
      id: row.id,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      serviceSlug: row.serviceSlug,
      status: row.status,
      confidenceScore: Number(row.confidenceScore),
      startedAt: row.startedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      peakReportsPerMin: row.peakReportsPerMin,
      affectedRegions: row.affectedRegions,
      detectionSignals: row.detectionSignals,
      timeline: timelineRows.map((t) => ({
        id: t.id,
        eventType: t.eventType,
        payload: t.payload,
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
