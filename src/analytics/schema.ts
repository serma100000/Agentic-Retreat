/**
 * ClickHouse table DDL definitions for OpenPulse analytics.
 *
 * Defines all tables, materialized views, and the schema initialization
 * routine used by the ETL pipeline and analytics service.
 */

import type { ClickHouseClient } from './clickhouse-client.js';

export const TABLES = {
  outage_events: `
    CREATE TABLE IF NOT EXISTS outage_events (
      outage_id String,
      service_id String,
      service_slug String,
      service_name String,
      category String,
      state String,
      confidence Float64,
      started_at DateTime64(3),
      resolved_at Nullable(DateTime64(3)),
      duration_ms UInt64,
      peak_reports_per_min UInt32,
      affected_regions Array(String),
      detection_signals Array(String),
      mttr UInt64,
      mttd UInt64,
      inserted_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/outage_events', '{replica}')
    PARTITION BY toYYYYMM(started_at)
    ORDER BY (service_id, started_at)
    SETTINGS index_granularity = 8192
  `,

  report_aggregates: `
    CREATE TABLE IF NOT EXISTS report_aggregates (
      service_id String,
      service_slug String,
      minute DateTime,
      report_count UInt32,
      unique_reporters UInt32,
      avg_severity Float32,
      regions Array(String),
      inserted_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/report_aggregates', '{replica}')
    PARTITION BY toYYYYMM(minute)
    ORDER BY (service_id, minute)
    SETTINGS index_granularity = 8192
  `,

  probe_aggregates: `
    CREATE TABLE IF NOT EXISTS probe_aggregates (
      service_id String,
      service_slug String,
      region String,
      minute DateTime,
      probe_count UInt32,
      success_count UInt32,
      avg_latency_ms Float32,
      p95_latency_ms Float32,
      p99_latency_ms Float32,
      error_count UInt32,
      inserted_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/probe_aggregates', '{replica}')
    PARTITION BY toYYYYMM(minute)
    ORDER BY (service_id, region, minute)
    SETTINGS index_granularity = 8192
  `,

  social_aggregates: `
    CREATE TABLE IF NOT EXISTS social_aggregates (
      service_id String,
      service_slug String,
      minute DateTime,
      mention_count UInt32,
      complaint_count UInt32,
      avg_urgency Float32,
      avg_sentiment Float32,
      platforms Array(String),
      inserted_at DateTime64(3) DEFAULT now64(3)
    )
    ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/social_aggregates', '{replica}')
    PARTITION BY toYYYYMM(minute)
    ORDER BY (service_id, minute)
    SETTINGS index_granularity = 8192
  `,
} as const;

export const MATERIALIZED_VIEWS = {
  service_reliability: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_service_reliability
    ENGINE = AggregatingMergeTree()
    ORDER BY (service_slug)
    AS SELECT
      service_slug,
      service_name,
      count() AS total_outages,
      avg(duration_ms) AS avg_duration_ms,
      avg(mttr) AS avg_mttr,
      avg(mttd) AS avg_mttd,
      min(started_at) AS first_outage,
      max(started_at) AS last_outage
    FROM outage_events
    GROUP BY service_slug, service_name
  `,

  hourly_outage_counts: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_hourly_outage_counts
    ENGINE = AggregatingMergeTree()
    ORDER BY (category, hour)
    AS SELECT
      category,
      toStartOfHour(started_at) AS hour,
      count() AS outage_count,
      avg(duration_ms) AS avg_duration,
      uniq(service_id) AS affected_services
    FROM outage_events
    GROUP BY category, hour
  `,

  monthly_trends: `
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_trends
    ENGINE = AggregatingMergeTree()
    ORDER BY (month)
    AS SELECT
      toStartOfMonth(started_at) AS month,
      count() AS total_outages,
      avg(duration_ms) AS avg_duration,
      uniq(service_id) AS service_count,
      category,
      state
    FROM outage_events
    GROUP BY month, category, state
  `,
} as const;

/**
 * Initialize the ClickHouse schema by creating all tables and materialized views.
 */
export async function initializeSchema(client: ClickHouseClient): Promise<void> {
  // Create base tables first
  for (const [name, ddl] of Object.entries(TABLES)) {
    try {
      await client.createTable(ddl);
    } catch (err) {
      throw new Error(
        `Failed to create table '${name}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Create materialized views
  for (const [name, ddl] of Object.entries(MATERIALIZED_VIEWS)) {
    try {
      await client.createTable(ddl);
    } catch (err) {
      throw new Error(
        `Failed to create materialized view '${name}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
