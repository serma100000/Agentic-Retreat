/**
 * Comprehensive health check system for OpenPulse.
 *
 * Checks PostgreSQL, Redis, Kafka, and ClickHouse connectivity
 * with 5-second result caching to prevent check storms.
 */

import type { HealthCheck, HealthCheckReport, HealthStatusType } from './types.js';
import { HealthStatus } from './types.js';

const CACHE_TTL_MS = 5_000;
const APP_VERSION = '0.1.0';

export interface HealthCheckerDeps {
  pgPool?: { query: (sql: string) => Promise<unknown> };
  redisClient?: { ping: () => Promise<string> };
  kafkaAdmin?: { describeCluster: () => Promise<{ brokers: unknown[] }> };
  clickhouseClient?: { query: (opts: { query: string }) => Promise<unknown> };
}

export class HealthChecker {
  private readonly deps: HealthCheckerDeps;
  private readonly startedAt: number;
  private cachedReport: HealthCheckReport | null = null;
  private cachedAt = 0;

  constructor(deps: HealthCheckerDeps = {}) {
    this.deps = deps;
    this.startedAt = Date.now();
  }

  async checkAll(): Promise<HealthCheckReport> {
    const now = Date.now();
    if (this.cachedReport && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedReport;
    }

    const services = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkKafka(),
      this.checkClickHouse(),
    ]);

    const hasDown = services.some((s) => s.status === HealthStatus.DOWN);
    const hasDegraded = services.some((s) => s.status === HealthStatus.DEGRADED);

    let status: HealthStatusType = HealthStatus.HEALTHY;
    if (hasDown) {
      status = HealthStatus.DOWN;
    } else if (hasDegraded) {
      status = HealthStatus.DEGRADED;
    }

    const report: HealthCheckReport = {
      status,
      services,
      uptime: now - this.startedAt,
      version: APP_VERSION,
    };

    this.cachedReport = report;
    this.cachedAt = now;

    return report;
  }

  async checkDatabase(): Promise<HealthCheck> {
    return this.timedCheck('postgresql', async () => {
      if (!this.deps.pgPool) {
        return { details: { error: 'PostgreSQL pool not configured' } };
      }
      await this.deps.pgPool.query('SELECT 1');
      return {};
    });
  }

  async checkRedis(): Promise<HealthCheck> {
    return this.timedCheck('redis', async () => {
      if (!this.deps.redisClient) {
        return { details: { error: 'Redis client not configured' } };
      }
      const pong = await this.deps.redisClient.ping();
      return { details: { response: pong } };
    });
  }

  async checkKafka(): Promise<HealthCheck> {
    return this.timedCheck('kafka', async () => {
      if (!this.deps.kafkaAdmin) {
        return { details: { error: 'Kafka admin not configured' } };
      }
      const cluster = await this.deps.kafkaAdmin.describeCluster();
      return { details: { brokers: cluster.brokers.length } };
    });
  }

  async checkClickHouse(): Promise<HealthCheck> {
    return this.timedCheck('clickhouse', async () => {
      if (!this.deps.clickhouseClient) {
        return { details: { error: 'ClickHouse client not configured' } };
      }
      await this.deps.clickhouseClient.query({ query: 'SELECT 1' });
      return {};
    });
  }

  async isHealthy(): Promise<boolean> {
    const report = await this.checkAll();
    return report.status === HealthStatus.HEALTHY;
  }

  private async timedCheck(
    service: string,
    fn: () => Promise<{ details?: Record<string, unknown> }>,
  ): Promise<HealthCheck> {
    const start = performance.now();
    try {
      const result = await fn();
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;

      const status: HealthStatusType = latencyMs > 1000
        ? HealthStatus.DEGRADED
        : HealthStatus.HEALTHY;

      return {
        service,
        status,
        latencyMs,
        lastCheckedAt: new Date(),
        details: result.details,
      };
    } catch (error) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      return {
        service,
        status: HealthStatus.DOWN,
        latencyMs,
        lastCheckedAt: new Date(),
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}
