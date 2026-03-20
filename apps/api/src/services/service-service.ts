/**
 * Business logic for service CRUD operations.
 * Handles listing, retrieval by slug, and status computation.
 */

import type { AppDatabase } from '../plugins/database.js';
import type { Redis } from 'ioredis';
import {
  services,
  serviceCategories,
  serviceRegions,
} from '@openpulse/db/schema';
import { reports } from '@openpulse/db/schema';
import { outages } from '@openpulse/db/schema';
import { eq, and, sql, desc, gte, ilike } from 'drizzle-orm';

export interface ServiceListItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly iconUrl: string | null;
  readonly currentStatus: string;
  readonly reportCount: number;
}

export interface ServiceDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly url: string;
  readonly iconUrl: string | null;
  readonly description: string | null;
  readonly statusPageUrl: string | null;
  readonly regions: string[];
  readonly currentStatus: string;
  readonly reportCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ServiceStatus {
  readonly serviceId: string;
  readonly slug: string;
  readonly status: string;
  readonly confidenceScore: number;
  readonly activeOutageId: string | null;
  readonly reportCount1h: number;
  readonly lastReportAt: string | null;
}

export interface ServiceListResult {
  readonly items: ServiceListItem[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export class ServiceService {
  constructor(
    private readonly db: AppDatabase,
    private readonly redis: Redis,
  ) {}

  async list(
    page: number,
    limit: number,
    category?: string,
    search?: string,
  ): Promise<ServiceListResult> {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (category) {
      conditions.push(eq(serviceCategories.slug, category));
    }
    if (search) {
      conditions.push(ilike(services.name, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalResult = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(services)
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(whereClause);

    const total = Number(totalResult[0]?.count ?? 0);

    const rows = await this.db
      .select({
        id: services.id,
        name: services.name,
        slug: services.slug,
        category: serviceCategories.name,
        iconUrl: services.iconUrl,
      })
      .from(services)
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(whereClause)
      .orderBy(services.name)
      .limit(limit)
      .offset(offset);

    const items: ServiceListItem[] = await Promise.all(
      rows.map(async (row) => {
        const reportCount = await this.getReportCountFromRedis(row.id);
        const currentStatus = await this.getCurrentStatusForService(row.id);
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          category: row.category ?? 'other',
          iconUrl: row.iconUrl,
          currentStatus,
          reportCount,
        };
      }),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBySlug(slug: string): Promise<ServiceDetail | null> {
    const rows = await this.db
      .select({
        id: services.id,
        name: services.name,
        slug: services.slug,
        category: serviceCategories.name,
        url: services.url,
        iconUrl: services.iconUrl,
        description: services.description,
        statusPageUrl: services.statusPageUrl,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
      })
      .from(services)
      .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
      .where(eq(services.slug, slug))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const regions = await this.db
      .select({ regionCode: serviceRegions.regionCode })
      .from(serviceRegions)
      .where(eq(serviceRegions.serviceId, row.id));

    const reportCount = await this.getReportCountFromRedis(row.id);
    const currentStatus = await this.getCurrentStatusForService(row.id);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category ?? 'other',
      url: row.url,
      iconUrl: row.iconUrl,
      description: row.description,
      statusPageUrl: row.statusPageUrl,
      regions: regions.map((r) => r.regionCode),
      currentStatus,
      reportCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getStatus(slug: string): Promise<ServiceStatus | null> {
    const svcRows = await this.db
      .select({ id: services.id, slug: services.slug })
      .from(services)
      .where(eq(services.slug, slug))
      .limit(1);

    const svc = svcRows[0];
    if (!svc) return null;

    const activeOutage = await this.db
      .select({
        id: outages.id,
        status: outages.status,
        confidenceScore: outages.confidenceScore,
      })
      .from(outages)
      .where(
        and(
          eq(outages.serviceId, svc.id),
          sql`${outages.status} NOT IN ('OPERATIONAL', 'RESOLVED')`,
        ),
      )
      .orderBy(desc(outages.createdAt))
      .limit(1);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentReports = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(reports)
      .where(and(eq(reports.serviceId, svc.id), gte(reports.createdAt, oneHourAgo)));

    const lastReport = await this.db
      .select({ createdAt: reports.createdAt })
      .from(reports)
      .where(eq(reports.serviceId, svc.id))
      .orderBy(desc(reports.createdAt))
      .limit(1);

    const outageRow = activeOutage[0];

    return {
      serviceId: svc.id,
      slug: svc.slug,
      status: outageRow?.status ?? 'operational',
      confidenceScore: outageRow ? Number(outageRow.confidenceScore) : 0,
      activeOutageId: outageRow?.id ?? null,
      reportCount1h: Number(recentReports[0]?.count ?? 0),
      lastReportAt: lastReport[0]?.createdAt?.toISOString() ?? null,
    };
  }

  async slugExists(slug: string): Promise<string | null> {
    const cacheKey = `service_slug:${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const rows = await this.db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.slug, slug))
      .limit(1);

    const id = rows[0]?.id ?? null;
    if (id) {
      await this.redis.setex(cacheKey, 300, id);
    }
    return id;
  }

  private async getReportCountFromRedis(serviceId: string): Promise<number> {
    const now = Math.floor(Date.now() / 60000);
    const keys: string[] = [];
    for (let i = 0; i < 60; i++) {
      keys.push(`report_count:${serviceId}:${now - i}`);
    }

    try {
      const values = await this.redis.mget(...keys);
      return values.reduce((sum: number, v: string | null) => sum + (v ? parseInt(v, 10) : 0), 0);
    } catch {
      return 0;
    }
  }

  private async getCurrentStatusForService(serviceId: string): Promise<string> {
    const activeOutage = await this.db
      .select({ status: outages.status })
      .from(outages)
      .where(
        and(
          eq(outages.serviceId, serviceId),
          sql`${outages.status} NOT IN ('OPERATIONAL', 'RESOLVED')`,
        ),
      )
      .orderBy(desc(outages.createdAt))
      .limit(1);

    return activeOutage[0]?.status ?? 'operational';
  }
}
