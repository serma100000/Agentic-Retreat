-- OpenPulse Initial Schema Migration
-- Creates all tables, TimescaleDB hypertables, continuous aggregates, and indexes.

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;

-- ============================================================
-- service_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS service_categories (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  slug      VARCHAR(100) NOT NULL UNIQUE,
  icon      VARCHAR(50)  NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS service_categories_slug_idx ON service_categories (slug);

-- ============================================================
-- services
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(200) NOT NULL UNIQUE,
  name            VARCHAR(200) NOT NULL,
  category_id     INTEGER NOT NULL REFERENCES service_categories(id),
  url             TEXT NOT NULL,
  icon_url        TEXT,
  description     TEXT,
  status_page_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS services_slug_idx ON services (slug);
CREATE INDEX IF NOT EXISTS services_category_id_idx ON services (category_id);

-- ============================================================
-- service_regions
-- ============================================================
CREATE TABLE IF NOT EXISTS service_regions (
  id          SERIAL PRIMARY KEY,
  service_id  UUID NOT NULL REFERENCES services(id),
  region_code VARCHAR(10) NOT NULL,
  is_primary  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS service_regions_service_id_idx ON service_regions (service_id);
CREATE INDEX IF NOT EXISTS service_regions_region_code_idx ON service_regions (region_code);

-- ============================================================
-- reports (will become hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id              UUID NOT NULL REFERENCES services(id),
  report_type             VARCHAR(20) NOT NULL,
  region_code             VARCHAR(10),
  city                    VARCHAR(100),
  latitude                NUMERIC,
  longitude               NUMERIC,
  device_fingerprint_hash VARCHAR(64),
  source                  VARCHAR(20) NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_service_id_idx ON reports (service_id);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_report_type_idx ON reports (report_type);

-- Convert to hypertable (7-day chunks)
SELECT create_hypertable('reports', 'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- ============================================================
-- probe_results (will become hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS probe_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id    UUID NOT NULL REFERENCES services(id),
  region_code   VARCHAR(10) NOT NULL,
  probe_type    VARCHAR(10) NOT NULL,
  status_code   INTEGER,
  latency_ms    NUMERIC NOT NULL,
  is_success    BOOLEAN NOT NULL,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS probe_results_service_id_idx ON probe_results (service_id);
CREATE INDEX IF NOT EXISTS probe_results_created_at_idx ON probe_results (created_at DESC);
CREATE INDEX IF NOT EXISTS probe_results_probe_type_idx ON probe_results (probe_type);

-- Convert to hypertable (7-day chunks)
SELECT create_hypertable('probe_results', 'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- ============================================================
-- outages
-- ============================================================
CREATE TABLE IF NOT EXISTS outages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id          UUID NOT NULL REFERENCES services(id),
  status              VARCHAR(20) NOT NULL,
  confidence_score    NUMERIC NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ,
  peak_reports_per_min INTEGER NOT NULL DEFAULT 0,
  affected_regions    JSONB NOT NULL DEFAULT '[]'::jsonb,
  detection_signals   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outages_service_id_status_idx ON outages (service_id, status);

-- ============================================================
-- outage_timeline (will become hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS outage_timeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outage_id   UUID NOT NULL REFERENCES outages(id),
  event_type  VARCHAR(30) NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outage_timeline_outage_id_created_at_idx
  ON outage_timeline (outage_id, created_at DESC);

-- Convert to hypertable (7-day chunks)
SELECT create_hypertable('outage_timeline', 'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash    VARCHAR(64) UNIQUE,
  display_name  VARCHAR(100),
  auth_provider VARCHAR(20),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx ON users (email_hash);

-- ============================================================
-- api_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  key_hash        VARCHAR(64) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  scopes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_tier VARCHAR(20) NOT NULL DEFAULT 'free',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys (user_id);

-- ============================================================
-- notification_preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id       SERIAL PRIMARY KEY,
  user_id  UUID NOT NULL REFERENCES users(id),
  channel  VARCHAR(20) NOT NULL,
  config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled  BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx ON notification_preferences (user_id);

-- ============================================================
-- Continuous Aggregates for reports
-- ============================================================

-- 1-minute rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS reports_1min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', created_at) AS bucket,
  service_id,
  report_type,
  COUNT(*)                            AS report_count,
  COUNT(DISTINCT region_code)         AS unique_regions
FROM reports
GROUP BY bucket, service_id, report_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('reports_1min',
  start_offset    => INTERVAL '10 minutes',
  end_offset      => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists   => TRUE
);

-- 5-minute rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS reports_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', created_at) AS bucket,
  service_id,
  report_type,
  COUNT(*)                             AS report_count,
  COUNT(DISTINCT region_code)          AS unique_regions
FROM reports
GROUP BY bucket, service_id, report_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('reports_5min',
  start_offset    => INTERVAL '30 minutes',
  end_offset      => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists   => TRUE
);

-- 1-hour rollup
CREATE MATERIALIZED VIEW IF NOT EXISTS reports_1hr
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', created_at) AS bucket,
  service_id,
  report_type,
  COUNT(*)                          AS report_count,
  COUNT(DISTINCT region_code)       AS unique_regions
FROM reports
GROUP BY bucket, service_id, report_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('reports_1hr',
  start_offset    => INTERVAL '4 hours',
  end_offset      => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists   => TRUE
);

-- ============================================================
-- Migration tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS _migrations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
