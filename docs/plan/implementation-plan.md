# OpenPulse Implementation Plan

## Sprint-by-Sprint Development Guide

---

## Overview

### Project Summary

OpenPulse is an open-source, API-first service outage detection platform that combines crowdsourced user reports, active probing, social media NLP, official status page aggregation, and predictive machine learning models into a unified detection engine. The platform targets superior detection accuracy and latency compared to existing commercial solutions like Downdetector, while democratizing outage intelligence through open data and open source.

### Timeline

- **Duration**: 12 months
- **Phases**: 4 (Foundation, Intelligence, Scale and Polish, Ecosystem)
- **Sprint cadence**: 2-week sprints, 24 sprints total
- **Team assumption**: 3-5 full-stack engineers, 1 ML engineer, 1 DevOps/SRE, 1 designer (scaling up in Phase 2+)

### Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15, TypeScript, Zustand, Mapbox GL JS | SSR/ISR web app with real-time dashboards |
| Mobile | React Native / Expo | iOS and Android apps |
| API | Fastify (Node.js), Rust (Axum) for hot paths | REST v1, GraphQL, WebSocket gateway |
| Event Streaming | Redpanda (Kafka-compatible) | Distributed event log for all signal streams |
| Time-Series DB | TimescaleDB | Report counts, probe metrics, time-series queries |
| Relational DB | PostgreSQL 17 | Service catalog, user accounts, configuration |
| Cache / Pub-Sub | Redis 8 (Cluster + Streams) | Real-time counters, caching, WebSocket backplane |
| Analytics DB | ClickHouse | Historical analytical queries, columnar storage |
| Search | Elasticsearch 8 / OpenSearch | Full-text search, geo queries on social data |
| ML Platform | Python (PyTorch), ONNX Runtime | Model training and portable inference |
| Active Probing | Rust workers on Fly.io | Globally distributed health checks |
| CDN / Edge | Cloudflare (Workers + R2 + D1) | Edge compute, DDoS protection, static assets |
| Infrastructure | Kubernetes (k3s) + serverless overflow | Core services on K8s, burst on Lambda/Workers |
| Observability | OpenTelemetry, Prometheus, Grafana | Traces, metrics, dashboards, alerting |
| CI/CD | GitHub Actions, ArgoCD | Automated testing, GitOps deployment |

### Prerequisites and Dev Environment Setup Checklist

Before Sprint 1 begins, the following must be in place:

- [ ] GitHub organization created, monorepo initialized
- [ ] All team members have local Docker Desktop / Podman installed
- [ ] Node.js 22 LTS, Rust toolchain (rustup), Python 3.12+ installed
- [ ] IDE configuration standardized (ESLint, Prettier, Rust Analyzer, Black/Ruff)
- [ ] Cloud accounts provisioned: AWS (or GCP), Cloudflare, Fly.io
- [ ] External service accounts: MaxMind GeoLite2 license key, Mapbox API token
- [ ] Social media API access: Twitter/X API (Basic tier minimum), Reddit API credentials
- [ ] Communication channels set up (Slack/Discord for team, GitHub Discussions for community)
- [ ] Jira/Linear/GitHub Projects board configured with sprint structure
- [ ] Design system started (Figma) with basic component library
- [ ] Domain name registered and DNS configured
- [ ] Architecture Decision Record (ADR) template established

---

## Phase 1: Foundation (Sprints 1-6, Months 1-3)

**Phase Objective**: Deliver a functional MVP with core outage detection, report ingestion, active probing, and a public-facing web frontend. Establish the foundational infrastructure, data model, and CI/CD pipeline that all subsequent work builds on.

---

### Sprint 1: Repository Structure and Infrastructure Scaffolding

**Goal**: Establish the monorepo, CI/CD pipeline, local development environment, and containerized infrastructure so the team can begin feature development immediately in Sprint 2.

**Tasks**:

1. **Monorepo initialization**
   - Initialize Turborepo (or Nx) monorepo with the following workspace structure:
     - `apps/web` -- Next.js 15 frontend
     - `apps/api` -- Fastify API server
     - `apps/prober` -- Rust active prober (cargo workspace member)
     - `packages/shared` -- Shared TypeScript types, constants, utilities
     - `packages/db` -- Database schema, migrations, seed scripts (Drizzle ORM or Prisma)
     - `packages/config` -- Shared ESLint, TypeScript, and Prettier configurations
     - `infra/` -- Docker Compose files, Kubernetes manifests, Terraform/Pulumi IaC
     - `ml/` -- Python ML training pipelines and model artifacts
   - Configure TypeScript project references for cross-package type safety
   - Set up pnpm as the package manager with workspace protocol

2. **CI/CD pipeline (GitHub Actions)**
   - Workflow: `ci.yml` -- runs on every PR and push to main
     - Lint (ESLint + Prettier check for TS, clippy for Rust, ruff for Python)
     - Type check (tsc --noEmit)
     - Unit tests (Vitest for TS, cargo test for Rust, pytest for Python)
     - Build all packages and apps
     - Docker image builds (no push on PR, push on main)
   - Workflow: `deploy-staging.yml` -- deploys to staging on merge to main
   - Workflow: `deploy-production.yml` -- manual trigger with approval gate
   - Branch protection rules: require CI pass, 1 review, no force push to main

3. **Local development environment (Docker Compose)**
   - `docker-compose.yml` with the following services:
     - PostgreSQL 17 with TimescaleDB extension
     - Redpanda (single node, Kafka-compatible)
     - Redis 8
     - Redpanda Console (Kafka UI for debugging)
     - MailHog (email testing)
   - `docker-compose.dev.yml` override for volume mounts and debug ports
   - Makefile or `justfile` with common commands: `make up`, `make down`, `make reset-db`, `make seed`

4. **Linting and code quality tooling**
   - Husky + lint-staged for pre-commit hooks
   - Commitlint with Conventional Commits specification
   - Changesets for versioning and changelogs
   - EditorConfig for cross-editor consistency

**Dependencies**: None (first sprint).

**Acceptance Criteria**:
- [ ] `pnpm install` succeeds from a fresh clone
- [ ] `docker compose up` starts all infrastructure services and they pass health checks
- [ ] CI pipeline runs green on a trivial PR (add a README or placeholder file)
- [ ] Each workspace package has a passing placeholder test
- [ ] Rust prober workspace compiles with `cargo build`
- [ ] Python ML workspace has a working virtual environment with `pytest` passing

---

### Sprint 2: Database Schema and Data Model

**Goal**: Design and implement the PostgreSQL + TimescaleDB schema for the service catalog, outage reports, and probe results. Seed the database with 500 initial services.

**Tasks**:

1. **PostgreSQL schema design**
   - `services` table: id (UUID), slug (unique), name, category, url, icon_url, description, status_page_url, alexa_rank, created_at, updated_at
   - `service_categories` table: id, name, slug, icon (enum: cloud, social, gaming, streaming, banking, isp, email, productivity, ecommerce, other)
   - `service_regions` table: service_id, region_code, is_primary (which regions a service operates in)
   - `users` table: id (UUID), email_hash, display_name, auth_provider, created_at (optional accounts)
   - `api_keys` table: id, user_id, key_hash, name, scopes (JSONB), rate_limit_tier, created_at, expires_at, revoked_at
   - `notification_preferences` table: user_id, channel (email/webhook/slack/etc), config (JSONB), enabled

2. **TimescaleDB hypertable design**
   - `reports` hypertable: id, service_id, report_type (outage/degraded/operational), region_code, city, latitude, longitude, device_fingerprint_hash, ip_hash (transient), source (web/mobile/api), created_at
     - Partitioned by time (1-day chunks) and service_id
     - Continuous aggregates: 1-min, 5-min, 1-hour, 1-day rollups per service per region
   - `probe_results` hypertable: id, service_id, region_code, probe_type (http/https/dns/tcp), status_code, latency_ms, is_success, error_message, created_at
     - Partitioned by time (1-day chunks)
     - Continuous aggregates: 1-min, 5-min averages per service per region
   - `outages` table: id (UUID), service_id, status (state machine enum), confidence_score, started_at, resolved_at, peak_reports_per_min, affected_regions (JSONB), detection_signals (JSONB)
   - `outage_timeline` hypertable: outage_id, event_type (state_change/signal/note), payload (JSONB), created_at

3. **Migration tooling**
   - Set up Drizzle ORM (or Prisma) with migration support
   - Write initial migration: `001_initial_schema.sql`
   - Write rollback migration
   - Add migration CI step that validates migrations run cleanly against a fresh database

4. **Service catalog seed data**
   - Curate a list of 500 services across categories:
     - Cloud/Infrastructure (50): AWS, GCP, Azure, Cloudflare, Vercel, Netlify, DigitalOcean, etc.
     - Social Media (40): Twitter/X, Facebook, Instagram, TikTok, Reddit, Mastodon, Bluesky, etc.
     - Gaming (50): Steam, Xbox Live, PSN, Epic, Riot, Blizzard, etc.
     - Streaming (40): Netflix, YouTube, Twitch, Spotify, Disney+, etc.
     - Banking/Finance (50): major US/EU banks, payment processors (Stripe, PayPal, Square)
     - ISPs (60): major ISPs per country (US, UK, DE, FR, AU, CA, etc.)
     - Email (20): Gmail, Outlook, Yahoo Mail, ProtonMail, etc.
     - Productivity (40): Slack, Zoom, Teams, Notion, Figma, GitHub, etc.
     - E-commerce (30): Amazon, Shopify, eBay, Walmart, etc.
     - Other (120): various popular services
   - Seed script (`packages/db/seed.ts`) that inserts all services with metadata
   - Include status page URLs where known (Atlassian Statuspage, custom)

5. **Database connection pooling**
   - Configure PgBouncer or built-in connection pooling
   - Set up read replicas configuration (preparatory, not deployed yet)

**Dependencies**: Sprint 1 (monorepo, Docker Compose with PostgreSQL).

**Acceptance Criteria**:
- [ ] Migrations run cleanly: `make migrate` creates all tables and hypertables
- [ ] `make seed` populates 500 services with complete metadata
- [ ] Continuous aggregates are created and can be queried
- [ ] Rollback migration drops schema cleanly
- [ ] Database schema diagram is generated and committed to `docs/`
- [ ] All seed services have a valid category, slug, and URL
- [ ] Integration test verifies schema creation and seed data integrity

---

### Sprint 3: Report Ingestion API

**Goal**: Build the core report submission and retrieval API with validation, rate limiting, geo-enrichment, and device fingerprinting. This is the primary write path for crowdsourced data.

**Tasks**:

1. **Fastify API server scaffold** (`apps/api`)
   - Fastify 5 with TypeScript
   - Plugin architecture: auth, rate-limit, swagger/OpenAPI, cors, helmet
   - Request validation using JSON Schema (Fastify's built-in TypeBox or Zod)
   - Structured logging (pino) with request ID correlation
   - Health check endpoint: `GET /health`
   - OpenAPI spec auto-generation via `@fastify/swagger`

2. **Report submission endpoint**: `POST /api/v1/reports`
   - Request body: `{ service_slug, report_type, latitude?, longitude?, source }`
   - Validation: service_slug must exist, report_type in enum, coordinates in valid range
   - Rate limiting: 10 reports/minute per IP, 20 reports/hour per device fingerprint
   - Device fingerprinting: generate fingerprint hash from User-Agent + Accept-Language + screen resolution (sent by client) -- one-way hash, 24h TTL in Redis
   - Geo-enrichment: resolve IP to city/region/country using MaxMind GeoLite2 (mmdb reader)
   - Deduplication: same device + same service + same type within 5 minutes is deduplicated
   - Publish validated report to Redpanda topic `reports.raw`
   - Return: `{ id, service_slug, status: "accepted", timestamp }`

3. **Report retrieval endpoints**
   - `GET /api/v1/services` -- list services with current report counts (paginated, filterable by category)
   - `GET /api/v1/services/{slug}` -- service detail with current status
   - `GET /api/v1/services/{slug}/reports` -- time-series report counts (query params: interval, start, end)
   - `GET /api/v1/outages/active` -- all currently active outages with confidence scores

4. **Redpanda topic configuration**
   - Topic: `reports.raw` (32 partitions, 7-day retention, keyed by service_id)
   - Topic: `reports.enriched` (32 partitions, 7-day retention)
   - Topic: `detections.raw` (16 partitions, 30-day retention)
   - Consumer group configuration and offset management

5. **Report consumer service**
   - Kafka consumer that reads from `reports.raw`
   - Persists enriched reports to TimescaleDB `reports` hypertable
   - Updates Redis counters: `report_count:{service_id}:{minute_bucket}`
   - Publishes to `reports.enriched` for downstream detection consumers

6. **MaxMind GeoLite2 integration**
   - Download and cache GeoLite2-City.mmdb
   - IP-to-location lookup with accuracy metadata
   - Automatic database update check (weekly)
   - Fallback when geolocation fails: use timezone-based approximation

**Dependencies**: Sprint 1 (infrastructure), Sprint 2 (database schema, service catalog).

**Acceptance Criteria**:
- [ ] `POST /api/v1/reports` accepts valid reports and returns 202 Accepted within 50ms
- [ ] Invalid reports return 400 with descriptive error messages
- [ ] Rate limiting enforces 10/min per IP (returns 429 when exceeded)
- [ ] Geo-enrichment resolves test IPs to correct city/country
- [ ] Reports appear in `reports.raw` Redpanda topic within 100ms
- [ ] Consumer persists reports to TimescaleDB within 1 second
- [ ] Redis counters increment correctly and can be queried
- [ ] `GET /api/v1/services` returns paginated service list with report counts
- [ ] `GET /api/v1/services/{slug}/reports` returns correct time-series data
- [ ] OpenAPI spec is generated and accessible at `/docs`
- [ ] Unit tests cover validation logic, rate limiting, and geo-enrichment
- [ ] Integration tests cover the full report submission flow (API to DB)

---

### Sprint 4: Statistical Detection Engine (Layer 1)

**Goal**: Implement the baseline anomaly detection algorithm (z-score threshold detection) that consumes enriched reports and produces detection events. This is the fastest detection layer with sub-10ms latency per evaluation.

**Tasks**:

1. **Detection engine service** (`apps/api/src/detection/` or separate service)
   - Kafka consumer reading from `reports.enriched`
   - Per-service sliding window statistics maintained in Redis:
     - 7-day rolling baseline of report rates (hourly granularity)
     - Day-of-week seasonality adjustment
     - Standard deviation with minimum floor to prevent division-by-zero
   - Z-score calculation: `(current_rate - expected_rate) / max(std_dev, min_floor)`
   - Configurable threshold (default: 3.0) with per-service-tier overrides
   - When threshold exceeded, publish detection event to `detections.raw` topic

2. **Detection event schema**
   - `{ service_id, detection_layer: "statistical", anomaly_score, current_rate, expected_rate, std_dev, threshold, confidence, region_breakdown, timestamp }`

3. **Baseline computation**
   - Background job that recalculates baselines every hour
   - Stores baselines in Redis with 8-day TTL (7 days + 1 day buffer)
   - Handles cold-start for new services: use category-average baseline until enough data

4. **Detection consumer and state management**
   - Consumer reads `detections.raw` and updates outage state
   - Simple state machine (initial version, expanded in Phase 2):
     - OPERATIONAL -> INVESTIGATING: any detection event with score > 3.0
     - INVESTIGATING -> OPERATIONAL: no detection events for 10 minutes
     - INVESTIGATING -> DEGRADED: detection sustained for 5+ minutes
     - DEGRADED -> MAJOR_OUTAGE: score > 5.0 sustained for 3+ minutes
     - MAJOR_OUTAGE -> RECOVERING: score dropping below 3.0
     - RECOVERING -> RESOLVED: score below 1.5 for 15+ minutes
   - Hysteresis: state transitions require sustained signals to prevent flapping
   - Outage records created/updated in `outages` table
   - Timeline events logged to `outage_timeline` hypertable

5. **Detection dashboard data endpoints**
   - `GET /api/v1/outages/active` -- enhanced with detection metadata
   - `GET /api/v1/outages/{id}` -- outage detail with timeline
   - `GET /api/v1/services/{slug}/status` -- current status with confidence score

6. **Alerting foundation**
   - When outage state changes, publish to `notifications.outage_state_change` topic
   - No notification dispatch yet (Sprint 12), but the event pipeline is established

**Dependencies**: Sprint 3 (report ingestion, Kafka topics, Redis counters).

**Acceptance Criteria**:
- [ ] Detection engine processes enriched reports with < 10ms latency per evaluation
- [ ] Z-score anomaly detection correctly identifies simulated outage spikes
- [ ] False positives stay below 5% on synthetic test data with known outage windows
- [ ] State machine transitions follow defined rules with hysteresis
- [ ] Outage records are created and updated correctly in the database
- [ ] Timeline events capture all state transitions with metadata
- [ ] Baseline computation handles cold-start services gracefully
- [ ] `GET /api/v1/outages/active` returns current outages with confidence scores
- [ ] Unit tests cover z-score calculation, state machine transitions, and hysteresis
- [ ] Integration test simulates a full outage lifecycle: report surge -> detection -> state transitions -> resolution

---

### Sprint 5: Frontend MVP

**Goal**: Build the public-facing Next.js web application with service listing, service detail pages, basic charts, and an active outage dashboard.

**Tasks**:

1. **Next.js application scaffold** (`apps/web`)
   - Next.js 15 with App Router, TypeScript, Tailwind CSS
   - Layout: header (logo, nav, search), main content, footer
   - Dark mode support (system preference + toggle)
   - SEO: meta tags, Open Graph, structured data (JSON-LD) for service pages
   - Responsive design: mobile-first, breakpoints at 640px, 768px, 1024px, 1280px

2. **Service listing page** (`/services`)
   - Server-rendered grid/list of all 500 services
   - Category filter sidebar/tabs
   - Search bar with instant filtering (client-side for MVP)
   - Each service card shows: icon, name, category, current status indicator (green/yellow/red)
   - Pagination (50 per page) with URL-based page state

3. **Service detail page** (`/services/{slug}`)
   - Service header: icon, name, category, current status badge, confidence score
   - Report count chart: 24-hour time-series line chart (canvas-based, e.g., Chart.js or lightweight alternative)
   - "Report a Problem" button with report type selector (Outage / Degraded / Operational)
   - Active outage banner when status is not OPERATIONAL
   - Report submission calls `POST /api/v1/reports` directly
   - ISR with 30-second revalidation for status data

4. **Active outages dashboard** (`/` or `/outages`)
   - List of all currently active outages sorted by confidence score
   - Each outage card: service name/icon, status, confidence, started_at, affected regions
   - Auto-refresh every 30 seconds (polling for MVP, WebSocket in Sprint 11)
   - Empty state when no outages active

5. **API client layer**
   - Typed API client (`packages/shared/api-client.ts`) using fetch
   - Server-side data fetching in RSC components
   - Client-side SWR or TanStack Query for polling and cache management
   - Error boundary components for API failures

6. **Component library foundation**
   - StatusBadge component (OPERATIONAL/INVESTIGATING/DEGRADED/MAJOR_OUTAGE/RECOVERING/RESOLVED)
   - ServiceCard component
   - OutageCard component
   - TimeSeriesChart component (report counts over time)
   - SearchInput component
   - Skeleton loading states for all data-dependent components

**Dependencies**: Sprint 3 (API endpoints for services and reports), Sprint 4 (outage status data).

**Acceptance Criteria**:
- [ ] Service listing page renders 500 services with correct status indicators
- [ ] Service detail page shows accurate 24-hour report chart
- [ ] "Report a Problem" button successfully submits reports and shows confirmation
- [ ] Active outages page displays current outages when they exist
- [ ] Pages are server-rendered with proper SEO meta tags
- [ ] Lighthouse score > 90 for Performance, Accessibility, Best Practices, SEO
- [ ] Responsive layout works on mobile (375px), tablet (768px), and desktop (1280px)
- [ ] Dark mode toggles correctly
- [ ] Page load time < 1.5 seconds on simulated 3G connection (for SSR pages)
- [ ] E2E test (Playwright): navigate to service, submit report, verify chart updates

---

### Sprint 6: Active Probing and Staging Deployment

**Goal**: Implement the active HTTP/HTTPS probing system from 5 geographic regions, integrate probe results into the detection pipeline, and deploy the complete MVP to a staging environment.

**Tasks**:

1. **Active prober service** (`apps/prober` -- Rust)
   - HTTP/HTTPS probe: send GET request, measure TTFB, total time, status code, TLS handshake time
   - DNS probe: resolve A/AAAA records, measure resolution time
   - TCP probe: establish connection, measure handshake time
   - Configuration: probe targets loaded from service catalog (URL, probe types, interval)
   - Default interval: every 30 seconds per service per region
   - Adaptive frequency: increase to every 10 seconds during suspected outages
   - Results published to Redpanda topic `probes.results`
   - Structured result: `{ service_id, region, probe_type, status_code, latency_ms, is_success, error, tls_expiry_days, timestamp }`

2. **Prober deployment on Fly.io** (5 initial regions)
   - Regions: us-east (iad), us-west (sjc), eu-west (ams), ap-southeast (sin), ap-northeast (nrt)
   - Each region runs a prober instance pulling service catalog from API
   - Health check and auto-restart configuration
   - Probe scheduling: stagger probes across the 30-second interval to avoid bursts

3. **Probe result consumer**
   - Kafka consumer reading from `probes.results`
   - Persists to TimescaleDB `probe_results` hypertable
   - Updates Redis with latest probe status per service per region
   - Feeds into detection engine: probe failures and latency spikes contribute to anomaly scoring
   - Detection engine update: incorporate probe success rate and latency into z-score (weighted signal)

4. **Probe data API endpoints**
   - `GET /api/v1/services/{slug}/probes` -- latest probe results per region
   - `GET /api/v1/services/{slug}/probes/history` -- probe latency time-series

5. **Frontend: probe data on service detail page**
   - Region-by-region probe status indicators (green check / red X)
   - Probe latency chart (line chart, one line per region)

6. **Staging deployment**
   - Docker Compose deployment on a VPS (Hetzner, DigitalOcean, or similar) or lightweight K8s (k3s)
   - Services: API, web frontend, PostgreSQL+TimescaleDB, Redpanda, Redis
   - Nginx or Caddy as reverse proxy with TLS (Let's Encrypt)
   - Basic monitoring: Prometheus scraping API metrics, Grafana dashboard
   - Staging URL accessible to team for manual testing

7. **REST API v1 documentation**
   - OpenAPI 3.1 spec finalized for all implemented endpoints
   - Swagger UI hosted at staging `/api/docs`
   - API versioning strategy documented (URL path versioning: `/api/v1/`)

**Dependencies**: Sprint 3 (API), Sprint 4 (detection engine), Sprint 5 (frontend).

**Acceptance Criteria**:
- [ ] Prober successfully probes 500 services from 5 regions every 30 seconds
- [ ] Probe results appear in TimescaleDB within 2 seconds of execution
- [ ] Probe failures correctly influence detection engine anomaly scores
- [ ] Service detail page shows probe status per region and latency chart
- [ ] Staging deployment is accessible via HTTPS with all services running
- [ ] Staging passes smoke test: submit report, view service page, see probe data, verify outage detection
- [ ] Prober handles service timeouts gracefully (30-second timeout, no hanging)
- [ ] Rust prober binary size < 20MB, memory usage < 50MB per instance
- [ ] Monitoring dashboard shows API request rates, error rates, and probe success rates
- [ ] All CI pipelines pass; staging deployment is automated via GitHub Actions

---

## Phase 2: Intelligence (Sprints 7-12, Months 4-6)

**Phase Objective**: Add multi-signal intelligence through social media NLP, advanced ML detection layers, the multi-signal consensus engine, real-time WebSocket delivery, user accounts, and production deployment. Transform the MVP into a production-grade platform with ML-enhanced detection accuracy.

---

### Sprint 7: Social Media Pipeline -- Twitter/X Integration

**Goal**: Build the social media ingestion pipeline starting with Twitter/X. Collect outage-related tweets, extract service mentions, and feed signals into the detection pipeline.

**Tasks**:

1. **Twitter/X streaming client**
   - Connect to Twitter/X Filtered Stream API (v2)
   - Filter rules: service names, common outage phrases ("is down", "outage", "not working", "having issues")
   - Handle rate limits, reconnection, and backfill on disconnect
   - Publish raw tweets to Redpanda topic `social.twitter.raw`

2. **Tweet preprocessing pipeline**
   - Kafka consumer on `social.twitter.raw`
   - Text cleaning: remove URLs, mentions, hashtags (preserve content words)
   - Language detection: filter to English initially (expand later)
   - Deduplication: ignore retweets and near-duplicate text (MinHash similarity)
   - Entity extraction (rule-based for MVP): match service names from catalog against tweet text
   - Publish enriched tweets to `social.enriched`

3. **Social signal aggregation**
   - Count tweet volume per service per 5-minute window in Redis
   - Calculate tweet velocity (rate of change)
   - Feed social mention counts into detection engine as an additional signal

4. **Reddit integration** (parallel with Twitter)
   - Reddit API client monitoring relevant subreddits: r/technology, r/sysadmin, r/outages, service-specific subreddits
   - Poll new posts every 60 seconds (Reddit API rate limits)
   - Same preprocessing pipeline as Twitter
   - Publish to `social.reddit.raw`, then enriched to `social.enriched`

5. **Social data storage**
   - Store enriched social signals in Elasticsearch for full-text search and geo queries
   - TimescaleDB: aggregate counts per service per minute (no raw social post text stored long-term for privacy)

6. **Admin dashboard: social signal monitoring**
   - Internal page showing real-time social mention rates per service
   - Useful for debugging and tuning social signal weights

**Dependencies**: Sprint 4 (detection engine to consume social signals).

**Acceptance Criteria**:
- [ ] Twitter stream connects and receives tweets matching filter rules
- [ ] Entity extraction correctly identifies service names in tweet text (>80% precision on test set)
- [ ] Retweets and near-duplicates are filtered (dedup rate >90%)
- [ ] Reddit posts from target subreddits are ingested within 2 minutes of posting
- [ ] Social mention counts appear in Redis and are queryable
- [ ] Detection engine incorporates social signals into anomaly scoring
- [ ] Elasticsearch contains searchable social signal data
- [ ] Pipeline recovers gracefully from Twitter API disconnection (auto-reconnect within 30 seconds)
- [ ] Integration test: simulate social media surge for a service, verify detection engine picks it up

---

### Sprint 8: NLP Model for Outage Classification

**Goal**: Train and deploy a transformer-based NLP model that classifies social media posts as outage-related or not, with entity extraction and sentiment scoring.

**Tasks**:

1. **Training data collection and labeling**
   - Collect 10,000+ tweets/posts mentioning services (from Sprint 7 pipeline + historical data)
   - Label dataset with categories: outage-complaint, question, humor/meme, unrelated, service-announcement
   - Use Label Studio or similar for annotation
   - Train/validation/test split: 70/15/15

2. **Model training pipeline** (`ml/social_classifier/`)
   - Base model: DistilBERT (smaller, faster than full BERT)
   - Fine-tune on labeled outage classification dataset
   - Output: multi-class classification (5 categories) + confidence score
   - Training infrastructure: single GPU (cloud spot instance or local)
   - Track experiments with MLflow or Weights & Biases

3. **Entity extraction model**
   - Named Entity Recognition (NER) fine-tuned for service names and error codes
   - Training data: annotated tweets with service name spans
   - Fallback: rule-based matching when NER confidence is low

4. **Sentiment scoring**
   - Classify outage-complaint tweets by severity: mild frustration, moderate complaint, severe/angry
   - Map to urgency score (0.0 to 1.0)
   - Use as weighting factor in detection engine

5. **ONNX export and inference service**
   - Export fine-tuned model to ONNX format
   - Create inference service (Python FastAPI or Node.js with ONNX Runtime)
   - Batch inference: process 64 posts at a time, < 100ms per batch on CPU
   - Deploy as a sidecar or standalone service

6. **Integration with social pipeline**
   - Update `social.enriched` consumer to call NLP inference service
   - Add classification, entity extraction, and sentiment to enriched social events
   - Filter out non-outage posts before feeding into detection engine
   - Publish classified outage signals to `social.classified`

**Dependencies**: Sprint 7 (social media pipeline, raw data for training).

**Acceptance Criteria**:
- [ ] Classification model achieves > 85% F1 score on test set for outage-complaint class
- [ ] Entity extraction identifies correct service name in > 80% of outage-complaint tweets
- [ ] ONNX inference processes 64 posts in < 100ms on CPU
- [ ] End-to-end pipeline: tweet ingestion -> NLP classification -> detection engine in < 5 seconds
- [ ] Non-outage posts are filtered out, reducing noise in detection signal by > 60%
- [ ] Model artifacts are versioned and stored in object storage (S3/R2)
- [ ] Model retraining script is reproducible and documented

---

### Sprint 9: Advanced Detection Layers (2 and 3)

**Goal**: Implement CUSUM change-point detection (Layer 2) and LSTM autoencoder anomaly detection (Layer 3) to improve detection accuracy beyond simple threshold-based approaches.

**Tasks**:

1. **Layer 2: CUSUM change-point detection**
   - Implement CUSUM algorithm for each service's report rate stream
   - Parameters: target mean (from baseline), allowable slack (k), decision interval (h)
   - Detect sustained shifts in mean report rate, even when individual points stay below z-score threshold
   - Especially effective for gradual degradations that escalate
   - Implementation in TypeScript (runs in detection engine service)
   - Publish Layer 2 detection events to `detections.raw` with `detection_layer: "cusum"`

2. **Layer 3: LSTM autoencoder anomaly detection**
   - Model architecture (PyTorch):
     - Input: 60-minute sliding window of 4 features (report rate, probe latency, probe success rate, social mention rate)
     - Encoder: 3 LSTM layers with attention, compressing to 32-dimensional latent space
     - Decoder: mirror architecture reconstructing input window
     - Anomaly signal: mean squared reconstruction error
   - Training pipeline:
     - Train per-service-category (e.g., all social media services share a model)
     - Training data: 30+ days of normal operation data per category
     - Threshold: 99th percentile of training-set reconstruction errors
   - ONNX export for inference
   - Inference service: evaluate every 5 minutes per service (sliding window)
   - Publish Layer 3 detection events to `detections.raw` with `detection_layer: "autoencoder"`

3. **Feature store**
   - Redis-based feature store for real-time features:
     - Report rate (1-min, 5-min windows)
     - Probe latency (mean, p95, p99 per region)
     - Probe success rate per region
     - Social mention rate
   - Features updated by respective consumers in near-real-time
   - Feature retrieval API for ML inference services

4. **Detection engine: multi-layer aggregation**
   - Update detection consumer to process events from all three layers
   - Weighted scoring: Layer 1 (0.3), Layer 2 (0.3), Layer 3 (0.4)
   - Any single layer can trigger INVESTIGATING state
   - Multiple layers agreeing increases confidence score

5. **Model training automation**
   - Scheduled training pipeline (weekly) that retrains autoencoder models on latest data
   - Model versioning and A/B evaluation
   - Automatic rollback if new model performs worse than production model

**Dependencies**: Sprint 4 (Layer 1 detection), Sprint 7-8 (social signals for multi-variate features).

**Acceptance Criteria**:
- [ ] CUSUM detects gradual degradations that Layer 1 z-score misses (test with synthetic ramp-up data)
- [ ] Autoencoder achieves < 5% false positive rate on test data with known outage windows
- [ ] Autoencoder detects anomalies in combined signals that no single signal reveals alone
- [ ] Feature store provides features with < 5ms latency
- [ ] Multi-layer aggregation reduces overall false positive rate by > 30% compared to Layer 1 alone
- [ ] Model training pipeline completes in < 2 hours for all service categories
- [ ] ONNX inference for Layer 3 completes in < 200ms per service evaluation

---

### Sprint 10: Multi-Signal Consensus Engine

**Goal**: Implement the full consensus state machine that fuses all detection layers, probe data, social signals, and status page data into a unified outage status with Bayesian confidence scoring.

**Tasks**:

1. **Consensus state machine** (full implementation)
   - States: OPERATIONAL, INVESTIGATING, DEGRADED, MAJOR_OUTAGE, RECOVERING, RESOLVED
   - Transition rules (from research doc):
     - OPERATIONAL -> INVESTIGATING: any single detector exceeds threshold
     - INVESTIGATING -> DEGRADED: 2+ independent signals confirm; confidence > 0.7
     - INVESTIGATING -> OPERATIONAL: all signals return to normal for 10 minutes
     - DEGRADED -> MAJOR_OUTAGE: 3+ signals; confidence > 0.9; geographic spread confirmed
     - MAJOR_OUTAGE -> RECOVERING: report rate declining; probe success improving
     - RECOVERING -> RESOLVED: all signals return to baseline for 15+ minutes
     - RECOVERING -> MAJOR_OUTAGE: signals re-escalate during recovery
   - Hysteresis: all transitions require sustained signal change (configurable per transition)
   - Every transition logged as immutable event in `outage_timeline`

2. **Bayesian confidence scoring**
   - Prior: base rate of outages for this service (historical frequency)
   - Likelihood: P(observed signals | outage) from historical outage signal profiles
   - Posterior: P(outage | observed signals)
   - Separate confidence scores per signal type, combined into overall confidence
   - Confidence updates as new signals arrive (streaming Bayesian update)

3. **Status page aggregation** (initial implementation)
   - Scraper for Atlassian Statuspage format (JSON API: `{url}/api/v2/summary.json`)
   - Monitor top 200 services' official status pages
   - Polling interval: every 60 seconds
   - Normalize status to OpenPulse states (operational, degraded, major outage, etc.)
   - Publish to Redpanda topic `statuspage.updates`
   - Incorporate as a signal in consensus engine (high weight when available)

4. **Geographic spread analysis**
   - Analyze report and probe data by region
   - Classify outages as: localized (1 region), regional (2-3 regions), global (4+ regions)
   - Geographic classification influences state transitions (global outages escalate faster)
   - Store affected regions in outage record

5. **Consensus engine API endpoints**
   - `GET /api/v1/services/{slug}/status` -- enhanced: returns consensus status, confidence, contributing signals, affected regions
   - `GET /api/v1/outages/{id}` -- enhanced: full timeline with signal breakdown
   - `GET /api/v1/outages/{id}/signals` -- raw signal history for an outage

**Dependencies**: Sprint 9 (multi-layer detection), Sprint 7-8 (social signals).

**Acceptance Criteria**:
- [ ] State machine correctly transitions through full outage lifecycle on synthetic data
- [ ] Bayesian confidence score > 0.9 when 3+ independent signals confirm outage
- [ ] False positive rate < 2% with multi-signal consensus (measured over 1 week of production data)
- [ ] Status page scraper correctly parses Atlassian Statuspage format for 200 services
- [ ] Geographic classification correctly identifies localized vs. global outages
- [ ] Outage timeline contains complete signal history for debugging
- [ ] Hysteresis prevents flapping: rapid signal fluctuation does not cause state oscillation
- [ ] API returns complete consensus data with signal breakdown

---

### Sprint 11: Real-Time WebSocket Gateway and Live Map

**Goal**: Build the WebSocket gateway for real-time dashboard updates and implement the live outage map with geographic heatmaps.

**Tasks**:

1. **WebSocket gateway service**
   - Fastify WebSocket plugin or standalone ws/uWebSockets.js server
   - Connection management: authenticate via API key or session token
   - Subscription model: clients subscribe to channels
     - `outages:*` -- all outage state changes
     - `outages:{service_slug}` -- specific service updates
     - `reports:{service_slug}` -- real-time report count updates
     - `map:reports` -- geo-located report stream for live map
   - Redis Pub/Sub backplane for multi-instance fan-out
   - Heartbeat/ping-pong for connection health
   - Graceful reconnection support (send missed events on reconnect using event sequence IDs)

2. **Event publishing to WebSocket**
   - Kafka consumer reads outage state changes, report aggregates, and detection events
   - Publishes formatted events to Redis Pub/Sub channels
   - WebSocket servers subscribe to Redis and fan out to connected clients
   - Message format: `{ type, channel, data, sequence, timestamp }`

3. **Frontend: real-time updates**
   - Replace polling with WebSocket connection on outage dashboard and service detail pages
   - Zustand store for client-side state management
   - Differential updates: only update changed data, not full page refresh
   - Connection status indicator in UI (connected/reconnecting/offline)
   - Fallback to SSE or polling if WebSocket fails

4. **Live outage map** (`/map`)
   - Mapbox GL JS integration
   - Report markers: geo-located reports rendered as points, color-coded by service
   - Heatmap layer: aggregate report density visualization
   - Cluster markers when zoomed out, individual markers when zoomed in
   - Real-time updates via WebSocket: new reports appear on map as they arrive
   - Outage polygons: highlight affected regions for active outages
   - Sidebar: list of active outages, click to zoom to affected region
   - Performance: handle 10,000+ concurrent markers with WebGL rendering

5. **Frontend: service detail real-time enhancements**
   - Live-updating report count chart (new data points stream in)
   - Live-updating probe status indicators
   - Outage status badge updates in real-time

**Dependencies**: Sprint 5 (frontend), Sprint 10 (consensus engine events).

**Acceptance Criteria**:
- [ ] WebSocket connects and receives events within 500ms
- [ ] Outage state changes propagate to all connected clients within 1 second
- [ ] Live map renders 5,000+ markers without frame drops (> 30fps)
- [ ] Heatmap layer updates in real-time as new reports arrive
- [ ] WebSocket reconnects automatically after disconnect, catching up on missed events
- [ ] Redis Pub/Sub backplane supports 2+ WebSocket server instances
- [ ] Fallback to polling works when WebSocket is unavailable
- [ ] Load test: 10,000 concurrent WebSocket connections sustained for 1 hour

---

### Sprint 12: User Accounts, Notifications, and Production Deployment

**Goal**: Add optional user accounts with OAuth/passkey authentication, notification preferences, API key management, and deploy to production infrastructure.

**Tasks**:

1. **User authentication**
   - OAuth 2.0 with PKCE: Google, GitHub, Discord providers
   - WebAuthn/passkey support for passwordless login
   - Session management: JWT access tokens (15 min) + HTTP-only refresh tokens (7 days)
   - Anonymous usage remains fully supported (no account required for browsing or reporting)
   - User profile page: display name, notification preferences, API keys

2. **API key management**
   - Users can create/revoke API keys from their profile
   - API keys scoped to endpoints and rate limit tiers
   - Key hash stored in database (never store raw keys)
   - Rate limiting tiers: Free (100 req/min), Pro (1,000 req/min), Enterprise (10,000 req/min)

3. **Notification system**
   - Notification preferences: per-service or global, per-channel
   - Channels (initial): email, webhooks
   - Notification dispatcher service:
     - Kafka consumer on `notifications.outage_state_change`
     - Lookup subscriber preferences
     - Dispatch via appropriate channel
   - Email: transactional email via Resend, Postmark, or SES
   - Webhooks: POST to user-configured URLs with HMAC signature verification
   - Delivery tracking: log send attempts, retries, failures

4. **Multi-region active probing expansion**
   - Expand from 5 to 10 Fly.io regions:
     - Add: eu-central (fra), sa-east (gru), af-south (jnb), ap-south (bom), oc-south (syd)
   - Verify probe scheduling handles 10 regions without overloading services

5. **Production deployment**
   - Kubernetes cluster (k3s or managed K8s) in a single region (us-east initially)
   - Multi-AZ for database and Redis
   - Cloudflare in front for CDN, DDoS protection, and edge caching
   - ArgoCD for GitOps deployment from main branch
   - Secrets management: Kubernetes secrets or Vault
   - Horizontal Pod Autoscaler for API and WebSocket services
   - Database backups: automated daily with 30-day retention
   - SSL/TLS certificates via cert-manager

6. **Production observability**
   - OpenTelemetry instrumentation on all services (traces + metrics)
   - Prometheus scraping all service endpoints
   - Grafana dashboards: request rates, error rates, latencies, Kafka consumer lag, detection accuracy
   - Alerting: PagerDuty or Opsgenie for production incidents
   - Structured logging shipped to Grafana Loki or similar

**Dependencies**: Sprint 10 (consensus engine for notification triggers), Sprint 11 (WebSocket gateway).

**Acceptance Criteria**:
- [ ] OAuth login works with Google, GitHub, and Discord
- [ ] Passkey registration and authentication works on supported browsers
- [ ] API keys can be created, listed, and revoked from user profile
- [ ] Rate limiting enforces tier-based limits per API key
- [ ] Email notifications delivered within 60 seconds of outage state change
- [ ] Webhook notifications delivered with valid HMAC signature
- [ ] Production deployment accessible at production domain with valid TLS
- [ ] Auto-scaling handles 10x traffic surge in load test
- [ ] Database backups verified restorable
- [ ] Grafana dashboards show all key metrics
- [ ] 10-region probing operational with < 1% probe scheduling failures
- [ ] Zero-downtime deployment verified (rolling update)

---

## Phase 3: Scale and Polish (Sprints 13-18, Months 7-9)

**Phase Objective**: Add predictive detection (Layer 4), historical analytics, mobile apps, comprehensive notification integrations, enterprise features, multi-region deployment, and performance hardening. Make the platform enterprise-ready and community-friendly.

---

### Sprint 13: Predictive Detection (Layer 4) and ClickHouse Analytics

**Goal**: Train and deploy the XGBoost predictive model that forecasts outage probability, and integrate ClickHouse for historical analytical queries.

**Tasks**:

1. **ClickHouse cluster setup**
   - Deploy 3-node ClickHouse cluster (ReplicatedMergeTree engine)
   - Schema: denormalized outage events, report aggregates, probe aggregates, social signal aggregates
   - ETL pipeline: Kafka consumer writes enriched events to ClickHouse
   - Retention policy: raw data 1 year, aggregates indefinitely
   - Materialized views for common query patterns

2. **XGBoost predictive model (Layer 4)**
   - Feature engineering from historical data:
     - Report velocity and acceleration (rate of change of report rate)
     - Probe latency trend (slope over last 30 minutes)
     - Social mention sentiment shift
     - DNS resolution time anomalies
     - TLS certificate expiry proximity
     - Historical outage patterns (time-of-day, day-of-week recurrence)
     - Service category baseline deviation
   - Training data: historical outages with labels (outage onset within 5/15/60 minutes)
   - XGBoost model outputs: P(outage in 5 min), P(outage in 15 min), P(outage in 60 min)
   - Evaluation: AUC-ROC, precision-recall curves
   - ONNX export for inference

3. **Predictive alert integration**
   - Layer 4 inference runs every 5 minutes per service
   - When P(outage in 15 min) > 0.7, publish predictive alert to `detections.raw`
   - Consensus engine: predictive signals can trigger INVESTIGATING state
   - Predictive alerts shown differently in UI (warning icon, "Potential issue detected")

4. **Historical analytics dashboard** (`/analytics`)
   - Service outage history: timeline view of past outages with duration and severity
   - Category analytics: which categories have most outages, average duration
   - Trend analysis: outage frequency over time (monthly/quarterly)
   - Comparison: service reliability ranking within category
   - Powered by ClickHouse queries via API

5. **Analytics API endpoints**
   - `GET /api/v1/analytics/services/{slug}/history` -- outage history with filters
   - `GET /api/v1/analytics/categories/{category}/summary` -- category-level statistics
   - `GET /api/v1/analytics/trends` -- platform-wide trend data

**Dependencies**: Sprint 9-10 (historical outage data from Layers 1-3 for training), Sprint 4 (detection engine).

**Acceptance Criteria**:
- [ ] ClickHouse cluster operational with data flowing from Kafka ETL
- [ ] XGBoost model achieves AUC-ROC > 0.85 on test set
- [ ] Predictive alerts fire 5-15 minutes before confirmed outage onset in > 60% of cases
- [ ] False predictive alert rate < 10%
- [ ] Historical analytics dashboard loads within 2 seconds for any query
- [ ] Analytics API returns data for all implemented endpoints
- [ ] ClickHouse queries on 1-year historical data complete in < 5 seconds

---

### Sprint 14: GraphQL API and Enhanced Analytics

**Goal**: Launch the GraphQL API with subscriptions for complex dashboard integrations, and enhance the analytics dashboard with advanced visualizations.

**Tasks**:

1. **GraphQL API** (`/api/graphql`)
   - Schema covering: services, outages, reports, probes, analytics
   - Queries: flexible filtering, pagination, nested relationships
   - Mutations: submit reports, manage notification preferences
   - Subscriptions: real-time outage updates via WebSocket transport (graphql-ws)
   - Authentication: API key or OAuth token
   - Rate limiting: query complexity analysis to prevent abuse
   - DataLoader pattern for N+1 query prevention

2. **Enhanced analytics visualizations**
   - Outage correlation: show services that frequently go down together (dependency inference)
   - Geographic heatmap history: playback of report density over time
   - MTTR (Mean Time To Recovery) and MTTD (Mean Time To Detect) metrics per service
   - Comparison charts: service vs. category average vs. platform average

3. **API documentation site**
   - REST API: interactive Swagger UI
   - GraphQL: GraphQL Playground or Apollo Studio integration
   - Code examples in JavaScript, Python, Go, Ruby
   - Rate limiting and authentication documentation

**Dependencies**: Sprint 13 (ClickHouse analytics data).

**Acceptance Criteria**:
- [ ] GraphQL queries return correct data for all schema types
- [ ] GraphQL subscriptions deliver real-time updates within 1 second
- [ ] Query complexity limiter rejects overly expensive queries
- [ ] API documentation site is public and contains working code examples
- [ ] MTTR and MTTD metrics calculated correctly from historical data
- [ ] Correlation analysis identifies known service dependencies (e.g., AWS and dependent services)

---

### Sprint 15: Mobile Application Foundation

**Goal**: Build and deploy React Native / Expo mobile apps for iOS and Android with core functionality: service browsing, outage dashboard, and push notifications.

**Tasks**:

1. **React Native / Expo project setup** (`apps/mobile`)
   - Expo managed workflow for faster development
   - Shared types from `packages/shared`
   - Navigation: React Navigation with bottom tabs
   - State management: Zustand (shared patterns with web)

2. **Core mobile screens**
   - Home / Active Outages: list of current outages
   - Service Directory: searchable, filterable service list
   - Service Detail: status, report chart, probe status, "Report a Problem" button
   - Map: Mapbox integration with outage heatmap
   - Profile: login, notification preferences, API keys

3. **Push notifications**
   - FCM (Android) and APNs (iOS) integration via Expo Notifications
   - Backend: notification dispatcher extended to send push via FCM/APNs
   - User registers device token on login
   - Push notification payload: service name, status change, confidence

4. **App Store preparation**
   - App icons, splash screens, store listing assets
   - Privacy policy and terms of service pages
   - TestFlight (iOS) and Internal Testing Track (Android) builds

**Dependencies**: Sprint 12 (user accounts, notification system, API authentication).

**Acceptance Criteria**:
- [ ] App runs on iOS simulator and Android emulator
- [ ] All core screens render correctly with live API data
- [ ] "Report a Problem" submits reports successfully
- [ ] Push notifications arrive within 30 seconds of outage state change
- [ ] Map renders heatmap with acceptable performance on mid-range devices
- [ ] TestFlight and Internal Testing builds available for team testing

---

### Sprint 16: Multi-Channel Notifications

**Goal**: Expand the notification system to support SMS, Slack, Discord, Microsoft Teams, and PagerDuty integrations.

**Tasks**:

1. **SMS notifications (Twilio)**
   - User adds phone number (verified via OTP)
   - SMS dispatched for high-severity outages only (DEGRADED, MAJOR_OUTAGE for subscribed services)
   - SMS content: "{Service} is experiencing {status}. Confidence: {score}%. Details: {url}"
   - Opt-out link in every SMS

2. **Slack integration**
   - Slack app with incoming webhook
   - User installs app to their workspace, selects channel
   - Rich message format with service icon, status, confidence, and action buttons
   - `/openpulse status {service}` slash command

3. **Discord integration**
   - Discord bot with webhook support
   - Rich embeds with status colors and service details
   - Channel subscription management

4. **Microsoft Teams integration**
   - Teams connector via incoming webhook
   - Adaptive Card format for rich notifications

5. **PagerDuty integration**
   - PagerDuty Events API v2 integration
   - Create/resolve incidents based on outage state changes
   - Severity mapping: DEGRADED -> warning, MAJOR_OUTAGE -> critical

6. **Notification routing engine**
   - Rules engine: users define routing rules (e.g., "SMS only for MAJOR_OUTAGE on AWS services")
   - Notification deduplication: don't re-notify for same outage within cooldown period
   - Notification digest: option to batch notifications (every 5/15/60 minutes)
   - Delivery status tracking and retry logic for all channels

**Dependencies**: Sprint 12 (notification dispatcher foundation), Sprint 15 (push notifications).

**Acceptance Criteria**:
- [ ] SMS delivered within 30 seconds via Twilio
- [ ] Slack messages render with correct formatting and action buttons
- [ ] Discord embeds display correctly with status colors
- [ ] Teams Adaptive Cards render in Teams client
- [ ] PagerDuty incidents created and auto-resolved correctly
- [ ] Routing rules correctly filter notifications by service, severity, and channel
- [ ] Notification deduplication prevents duplicate alerts
- [ ] All integrations handle API failures gracefully with retry logic

---

### Sprint 17: Enterprise Features

**Goal**: Add enterprise capabilities: custom service monitors, team dashboards, SLA tracking, and role-based access for organizations.

**Tasks**:

1. **Organizations and teams**
   - Organization model: name, billing plan, members with roles (owner, admin, member, viewer)
   - Invite flow: email invitation with role assignment
   - Team model: subset of org members grouped for notification routing
   - Organization-level API keys

2. **Custom service monitors**
   - Enterprise users can add custom services (internal URLs, B2B services)
   - Custom probe configuration: URL, probe type, interval, expected status code
   - Private services: visible only to organization members
   - Custom detection thresholds per service

3. **Team dashboards**
   - Customizable dashboard showing only the services relevant to a team
   - Service dependency graph: visual map of how monitored services relate
   - Organization-wide outage feed
   - Dashboard sharing via URL with optional authentication

4. **SLA tracking**
   - Define SLA targets per service (e.g., 99.9% uptime monthly)
   - Calculate actual uptime from probe and outage data
   - SLA dashboard: current month status, historical compliance, burn rate
   - SLA breach alerts

5. **Audit logging**
   - Log all administrative actions: user invites, role changes, service additions, preference changes
   - Audit log queryable via API and admin UI
   - 1-year retention

**Dependencies**: Sprint 12 (user accounts), Sprint 13 (ClickHouse for SLA calculations).

**Acceptance Criteria**:
- [ ] Organization CRUD with member management works correctly
- [ ] Custom service monitors probe private URLs and report status
- [ ] Team dashboards show only subscribed services with correct data
- [ ] SLA calculations match expected uptime percentages (verified with known outage data)
- [ ] SLA breach alerts fire correctly when threshold crossed
- [ ] Audit log captures all administrative actions
- [ ] Role-based access control prevents unauthorized actions

---

### Sprint 18: Performance, Security, and Service Catalog Expansion

**Goal**: Production hardening: multi-region deployment, edge caching, load testing, security audit, and expansion of the service catalog to 5,000+ services.

**Tasks**:

1. **Multi-region active-active deployment**
   - Deploy second Kubernetes cluster in eu-west region
   - GeoDNS routing (Cloudflare Load Balancing) to nearest region
   - Database replication: PostgreSQL streaming replication, Redis cross-region sync
   - Redpanda MirrorMaker for cross-region topic replication
   - Write affinity: writes go to nearest region, replicate asynchronously

2. **Edge caching (Cloudflare Workers)**
   - Cache service status responses at edge (30-second TTL, stale-while-revalidate)
   - Cache service listing pages (5-minute TTL)
   - Cache analytics responses (1-hour TTL)
   - Bypass cache for authenticated requests and report submissions
   - Expected result: 80%+ of read traffic served from edge

3. **Load testing**
   - k6 or Artillery load test scripts for all critical paths
   - Test scenarios:
     - Steady state: 100,000 concurrent users, 1,000 reports/second
     - Outage surge: ramp to 5,000,000 concurrent users in 5 minutes
     - WebSocket storm: 100,000 concurrent connections
   - Performance targets from research doc (see targets table)
   - Identify and fix bottlenecks

4. **Security audit**
   - OWASP Top 10 review of all API endpoints
   - Dependency vulnerability scan (npm audit, cargo audit, pip-audit)
   - Secret scanning in CI (gitleaks or similar)
   - Penetration testing (external firm or thorough self-assessment)
   - Rate limiting verification under adversarial conditions
   - Input validation fuzzing

5. **Service catalog expansion to 5,000+ services**
   - Community contribution workflow: PR template for adding services
   - Automated validation: verify URL is reachable, check for duplicate slugs
   - Bulk import script for service lists from public sources
   - Status page URL discovery automation (check common paths like /status, /health)

**Dependencies**: Sprint 12 (production deployment), Sprint 13-17 (all features to test).

**Acceptance Criteria**:
- [ ] Multi-region deployment serves traffic from both regions with < 100ms latency for each region's users
- [ ] Failover test: one region goes down, other region handles all traffic within 30 seconds
- [ ] Edge caching hit rate > 80% for read traffic
- [ ] Load test passes all performance targets from research doc
- [ ] Report submission < 100ms p99 under load
- [ ] Detection latency < 5 seconds under load
- [ ] Zero critical or high-severity security vulnerabilities
- [ ] All dependencies are free of known critical CVEs
- [ ] Service catalog contains 5,000+ services with valid metadata
- [ ] Community contribution PR template and validation automation in place

---

## Phase 4: Ecosystem (Sprints 19-24, Months 10-12)

**Phase Objective**: Build the developer ecosystem, open data platform, browser extension, community tools, and prepare for public launch. Transform OpenPulse from a product into a platform and community.

---

### Sprint 19: Open Data API

**Goal**: Launch the Open Data API providing anonymized, aggregated outage intelligence data for researchers, developers, and third-party applications.

**Tasks**:

1. **Open Data API design and implementation**
   - `GET /api/v1/open/outages` -- historical outage data (anonymized, aggregated)
   - `GET /api/v1/open/services/{slug}/reliability` -- uptime statistics, MTTR, outage frequency
   - `GET /api/v1/open/trends` -- platform-wide trend data
   - `GET /api/v1/open/export` -- bulk data export in JSON, CSV, Parquet formats
   - Rate limiting: generous free tier (1,000 requests/day), higher for registered API keys
   - Data license: Creative Commons Attribution (CC-BY 4.0)

2. **Data anonymization pipeline**
   - Strip all PII before data enters Open Data tables
   - Aggregate to minimum granularity: 5-minute windows, city-level geography
   - No individual report data exposed; only aggregate counts and statistics
   - Automated compliance checks in pipeline

3. **Developer portal**
   - API documentation with interactive examples
   - SDKs: JavaScript/TypeScript, Python, Go (auto-generated from OpenAPI spec)
   - Quickstart guides and tutorials
   - API key self-service registration

**Dependencies**: Sprint 13-14 (ClickHouse analytics, API infrastructure).

**Acceptance Criteria**:
- [ ] Open Data API returns anonymized aggregate data with no PII leakage
- [ ] Bulk export generates valid JSON, CSV, and Parquet files
- [ ] Rate limiting enforces daily request quotas
- [ ] Developer portal has working code examples in 3 languages
- [ ] Data license terms are clearly displayed on all API responses and portal

---

### Sprint 20: Developer Tools and Browser Extension

**Goal**: Build the Terraform/Pulumi provider for IaC integration and a browser extension that shows inline outage indicators.

**Tasks**:

1. **Terraform provider**
   - Provider for monitoring custom services via OpenPulse
   - Resources: `openpulse_service_monitor`, `openpulse_notification_rule`, `openpulse_team_dashboard`
   - Data sources: `openpulse_service_status`, `openpulse_active_outages`
   - Published to Terraform Registry

2. **Pulumi provider**
   - Mirror Terraform provider capabilities for Pulumi users
   - TypeScript, Python, Go SDKs

3. **Browser extension** (Chrome + Firefox)
   - Manifest V3 (Chrome), WebExtensions API (Firefox)
   - Features:
     - Toolbar icon shows current outage count (badge number)
     - Popup: list of active outages affecting user's subscribed services
     - Content script: inline outage indicator on service login pages (e.g., show banner on twitter.com if Twitter is experiencing issues)
     - Notification when subscribed service status changes
   - Uses OpenPulse REST API for data
   - Privacy-preserving: no browsing history sent to servers

**Dependencies**: Sprint 17 (custom service monitors API), Sprint 19 (Open Data API).

**Acceptance Criteria**:
- [ ] Terraform provider creates and manages service monitors via `terraform apply`
- [ ] Pulumi provider works with TypeScript and Python
- [ ] Browser extension installs on Chrome and Firefox
- [ ] Toolbar badge shows correct active outage count
- [ ] Inline outage indicator appears on affected service websites
- [ ] Extension does not track browsing history or send PII

---

### Sprint 21: Community Features and Plugin System

**Goal**: Build the community contribution infrastructure, public outage database with historical analysis tools, and a plugin system for custom detection rules.

**Tasks**:

1. **Public outage database** (`/database`)
   - Searchable archive of all detected outages
   - Filters: service, category, date range, severity, duration, region
   - Each outage page: timeline, affected regions, detection signals, duration, impact estimate
   - Comparison tools: compare outage patterns across services
   - Export outage data in CSV/JSON

2. **Community contribution workflows**
   - Service addition via GitHub PR with automated validation
   - Detection rule proposals via GitHub Issues template
   - Community voting on feature requests
   - Contributor recognition (leaderboard, badges)
   - Contributing guide and Code of Conduct

3. **Plugin system for custom detection rules**
   - Plugin API: define custom detection logic in JavaScript/TypeScript
   - Plugin lifecycle: install, configure, enable, disable, uninstall
   - Plugin types:
     - Custom signal source (e.g., integrate with internal monitoring)
     - Custom detection rule (e.g., service-specific threshold logic)
     - Custom notification channel (e.g., internal chat system)
   - Plugin registry: community-submitted plugins reviewed and published
   - Sandboxed execution: plugins run in isolated V8 contexts (e.g., isolated-vm)

4. **Federated deployment support**
   - Helm chart for self-hosted OpenPulse deployment
   - Configuration for organizations to run private instances
   - Federation protocol: instances can optionally share anonymized aggregate data
   - Federation API: query outage status across federated instances

**Dependencies**: Sprint 19 (Open Data API for public database), Sprint 17 (enterprise features for federation).

**Acceptance Criteria**:
- [ ] Public outage database is searchable and returns results within 2 seconds
- [ ] Service addition PRs trigger automated validation (URL reachable, no duplicates)
- [ ] At least 3 example plugins demonstrate the plugin API
- [ ] Plugins execute in sandboxed environment with no access to host system
- [ ] Helm chart deploys a functional OpenPulse instance on a fresh K8s cluster
- [ ] Federation protocol enables data sharing between two test instances

---

### Sprint 22: Advanced NLP and Detection Improvements

**Goal**: Improve detection accuracy with foundation model fine-tuning for zero-shot detection on new services, and expand social media coverage.

**Tasks**:

1. **Foundation model fine-tuning**
   - Fine-tune a small language model (e.g., Phi-3 or similar) on outage discourse corpus
   - Zero-shot capability: detect outages for new services without service-specific training
   - Few-shot learning: quickly adapt to new services with minimal labeled data
   - ONNX export for efficient inference

2. **Expanded social media coverage**
   - Add Mastodon and Bluesky monitoring
   - Hacker News monitoring (front page outage posts)
   - News feed monitoring (Google News, RSS feeds for tech news sites)
   - Multi-language support: add German, French, Spanish, Japanese outage classification

3. **Detection accuracy improvements**
   - A/B testing framework for detection algorithm changes
   - Automated detection accuracy reporting (daily precision/recall metrics)
   - Feedback loop: users can confirm or deny detected outages, feeding back into model training
   - Reduced false positive target: < 1% for MAJOR_OUTAGE classification

4. **DNS and BGP signal integration** (exploratory)
   - Monitor DNS resolution anomalies as additional signal source
   - BGP route change monitoring via RIPE RIS or RouteViews
   - Integrate as additional signals in consensus engine

**Dependencies**: Sprint 8 (NLP model), Sprint 10 (consensus engine).

**Acceptance Criteria**:
- [ ] Zero-shot model correctly classifies outage posts for services not in training data (>75% F1)
- [ ] Mastodon and Bluesky pipelines ingest posts within 2 minutes
- [ ] Multi-language classification achieves >80% F1 for supported languages
- [ ] A/B testing framework can run concurrent detection algorithm versions
- [ ] User feedback loop collects and stores feedback, available for model retraining
- [ ] Detection false positive rate for MAJOR_OUTAGE < 1% over 30-day measurement period

---

### Sprint 23: Documentation and Launch Preparation

**Goal**: Create comprehensive documentation, finalize all features, conduct final security audit, and prepare marketing materials for public launch.

**Tasks**:

1. **Documentation site** (Docusaurus, Nextra, or similar)
   - Getting Started guide
   - Architecture overview with diagrams
   - API reference (REST + GraphQL)
   - Self-hosting guide (Docker Compose + Kubernetes)
   - Plugin development guide
   - Contributing guide
   - FAQ and troubleshooting

2. **Final security audit**
   - Full penetration test (external firm)
   - GDPR compliance review
   - Data retention policy review and enforcement verification
   - Incident response plan documented
   - Security disclosure policy (security.txt, bug bounty consideration)

3. **Performance validation**
   - Re-run full load test suite with all Phase 3-4 features enabled
   - Verify all performance targets from research doc are met
   - Optimize any regressions found

4. **Launch readiness checklist**
   - All services green in production
   - Monitoring and alerting verified
   - Runbooks for common operational scenarios
   - On-call rotation established
   - Status page for OpenPulse itself (meta!)
   - Backup and disaster recovery tested

5. **Academic research data access program**
   - Application process for researchers to access enhanced data feeds
   - Data sharing agreements template
   - IRB (Institutional Review Board) guidance for researchers

**Dependencies**: All prior sprints.

**Acceptance Criteria**:
- [ ] Documentation site covers all features with accurate, tested code examples
- [ ] Security audit report has zero critical findings
- [ ] Load test passes all targets with Phase 4 features enabled
- [ ] Runbooks exist for: deployment, rollback, database recovery, outage response
- [ ] Disaster recovery drill completed successfully
- [ ] Academic data access program has published application form and guidelines

---

### Sprint 24: Launch and Community Building

**Goal**: Public launch of OpenPulse with marketing push, community building activities, and transition to ongoing maintenance and iteration.

**Tasks**:

1. **Public launch**
   - Production deployment finalized and verified
   - Domain and DNS cutover to production
   - CDN warming for all static assets
   - Monitoring scaled up for launch traffic

2. **Launch marketing**
   - Blog post: "Introducing OpenPulse: Open-Source Outage Detection for Everyone"
   - Hacker News, Reddit r/programming, r/selfhosted, r/sysadmin submissions
   - Twitter/X, Mastodon, Bluesky announcements
   - Product Hunt launch
   - Dev.to and Hashnode cross-posts
   - Demo video walkthrough

3. **Community building**
   - GitHub Discussions enabled for support and feature requests
   - Discord or Slack community server for real-time discussion
   - Good First Issues labeled in GitHub for new contributors
   - Contributor recognition program launched
   - Monthly community call scheduled

4. **Post-launch monitoring and iteration**
   - 24/7 monitoring for first week post-launch
   - Rapid response to reported bugs
   - Collect user feedback for Phase 5 planning (if applicable)
   - Performance monitoring under real-world traffic
   - Detection accuracy measurement with real outage events

5. **Sustainability setup**
   - GitHub Sponsors page
   - Open Collective for financial transparency
   - Infrastructure sponsorship applications (cloud credits programs)
   - Enterprise tier pricing and billing integration (Stripe)

**Dependencies**: Sprint 23 (all features complete, documentation ready).

**Acceptance Criteria**:
- [ ] Production site live and accessible globally
- [ ] Launch blog post published and shared across channels
- [ ] Community channels active with team presence
- [ ] No critical bugs in first 48 hours post-launch
- [ ] Detection accuracy validated against 3+ real-world outage events
- [ ] At least 10 Good First Issues available for community contributors

---

## Cross-Cutting Concerns (Ongoing Every Sprint)

### Testing Strategy

| Test Type | Tool | Coverage Target | Run Frequency |
|-----------|------|----------------|---------------|
| Unit tests | Vitest (TS), cargo test (Rust), pytest (Python) | >80% line coverage for business logic | Every commit (CI) |
| Integration tests | Vitest + Testcontainers | All API endpoints, all Kafka consumers | Every PR (CI) |
| E2E tests | Playwright | Critical user journeys (10+ scenarios) | Nightly + pre-deploy |
| Load tests | k6 or Artillery | Performance targets met | Weekly (staging), pre-release |
| Contract tests | Pact or similar | API backward compatibility | Every PR that changes API |
| ML model tests | pytest + custom metrics | Accuracy thresholds met | On model retrain |

### Observability

- **Traces**: OpenTelemetry SDK in all services, exported to Grafana Tempo or Jaeger
- **Metrics**: Prometheus scraping with Grafana dashboards covering:
  - Request rates, error rates, latency percentiles (RED metrics)
  - Kafka consumer lag per topic/consumer group
  - Detection engine: anomaly scores, state transitions, false positive rate
  - Database: connection pool utilization, query latency, replication lag
  - Prober: success rate per region, latency per region
- **Logs**: Structured JSON logging (pino for Node.js), shipped to Grafana Loki
- **Alerting**: Grafana alerting or Alertmanager for critical metrics

### Security (Every Sprint)

- OWASP dependency check in CI (npm audit, cargo audit, pip-audit)
- Secret scanning (gitleaks) in pre-commit hooks and CI
- Container image vulnerability scanning (Trivy)
- Input validation review for any new API endpoints
- CORS and CSP headers reviewed for any frontend changes

### Documentation (Every Sprint)

- OpenAPI spec updated for any API changes (auto-generated from code)
- Architecture Decision Records (ADRs) for significant technical decisions
- Runbook updates for new operational procedures
- Sprint retrospective notes captured

### Code Review Process

- All changes via pull request (no direct commits to main)
- Minimum 1 approval required; 2 for security-sensitive or architectural changes
- CI must pass before merge
- Squash merge to main for clean history
- PR template includes: description, testing done, rollback plan, documentation updates

### Definition of Done (Per Sprint)

- [ ] All acceptance criteria met
- [ ] Unit test coverage >= 80% for new code
- [ ] Integration tests pass
- [ ] No linting errors
- [ ] OpenAPI spec updated if API changed
- [ ] Code reviewed and approved
- [ ] Deployed to staging and smoke tested
- [ ] No new critical or high-severity security findings
- [ ] Sprint demo completed

---

## Risk Register

### Phase 1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| TimescaleDB performance issues with high write throughput | High | Medium | Benchmark early in Sprint 2; fall back to plain PostgreSQL with manual partitioning if needed; consider QuestDB as alternative |
| Redpanda operational complexity exceeds team experience | Medium | Medium | Start with single-node Redpanda; use managed Kafka (Confluent Cloud or AWS MSK) as fallback; invest in team training |
| MaxMind GeoLite2 accuracy insufficient for city-level resolution | Medium | Low | Test accuracy against known IP-location pairs; supplement with browser Geolocation API (with consent) on web/mobile clients |
| Scope creep in service catalog curation | Low | High | Automate validation; accept community PRs early; start with top 200, expand incrementally |
| Rust prober development slower than expected | Medium | Medium | Keep prober interface simple; have Node.js fallback implementation ready; Rust benefits (performance, safety) justify investment |

### Phase 2 Risks

| Risk | Impact | Likelihood | Likelihood | Mitigation |
|------|--------|------------|------------|------------|
| Twitter/X API access revoked or pricing increased | High | Medium | Abstract social media client behind interface; prioritize Reddit and Bluesky (more stable API access); cache historical data |
| NLP model accuracy insufficient for production use | High | Medium | Start with rule-based classification as fallback; use pre-trained models before fine-tuning; iterative improvement with production data |
| LSTM autoencoder training data insufficient (need 30+ days) | Medium | High | Use synthetic data generation for initial training; category-level models reduce per-service data needs; fall back to Layers 1-2 until enough data |
| WebSocket scaling at 10K+ connections per node | Medium | Medium | Use uWebSockets.js for performance; Redis Pub/Sub backplane tested early; SSE fallback available |
| Multi-signal consensus engine complexity leads to bugs | High | Medium | Extensive state machine unit testing; property-based testing for transition logic; observability into every state transition |

### Phase 3 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| XGBoost predictive model has high false positive rate | High | Medium | Conservative thresholds initially; predictive alerts shown as "potential" not "confirmed"; human review during tuning period |
| Mobile app store review delays | Medium | High | Submit early; follow all guidelines strictly; have web PWA as fallback for mobile users |
| Multi-region database replication lag causes inconsistencies | High | Medium | Accept eventual consistency for reads; writes routed to primary region for critical operations; conflict resolution strategy documented |
| Third-party notification integrations break due to API changes | Medium | Medium | Abstract behind notification provider interface; automated integration tests; feature flags to disable broken channels |
| Security audit reveals significant vulnerabilities | High | Low | Security-first development practices throughout; automated security scanning in CI; budget for remediation sprint if needed |

### Phase 4 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Plugin system introduces security vulnerabilities | High | Medium | Sandboxed execution (isolated-vm); strict capability model; code review for published plugins; security scanning |
| Open Data API abused for competitive intelligence | Medium | Low | Aggregation minimums (no per-user data); rate limiting; terms of service prohibiting reverse engineering |
| Federation protocol design complexity | Medium | High | Start with one-way data sharing (publish only); defer full bidirectional federation; learn from ActivityPub patterns |
| Launch does not generate sufficient community adoption | Medium | Medium | Pre-launch community building; compelling demo content; solve real pain points; iterate based on feedback |
| Sustainability: infrastructure costs exceed revenue | High | Medium | Cost-optimized architecture from day 1; cloud credits programs; enterprise tier revenue; community fundraising |

---

## Dependencies and Prerequisites

### External Service Accounts

| Service | Purpose | When Needed | Lead Time |
|---------|---------|-------------|-----------|
| Cloudflare (Pro plan) | CDN, DDoS protection, Workers | Sprint 6 (staging), Sprint 12 (production) | 1 day |
| Fly.io | Active prober deployment (global regions) | Sprint 6 | 1 day |
| MaxMind GeoLite2 | IP geolocation for report enrichment | Sprint 3 | 1 day (free license key) |
| Twitter/X API (Basic tier) | Social media monitoring | Sprint 7 | 1-2 weeks (approval process) |
| Reddit API | Social media monitoring | Sprint 7 | 1 day |
| Mapbox | Live outage map rendering | Sprint 11 | 1 day |
| Twilio | SMS notifications | Sprint 16 | 1 day |
| Resend / Postmark / SES | Transactional email | Sprint 12 | 1-3 days |
| Google OAuth, GitHub OAuth, Discord OAuth | User authentication | Sprint 12 | 1 day each |
| PagerDuty | Enterprise notification integration | Sprint 16 | 1 day |
| Stripe | Billing for enterprise tier | Sprint 24 | 1-3 days |
| MLflow or Weights and Biases | ML experiment tracking | Sprint 8 | 1 day |

### Infrastructure Provisioning Timeline

| Milestone | Infrastructure | Sprint |
|-----------|---------------|--------|
| Local dev environment | Docker Compose (local machines) | Sprint 1 |
| Staging environment | VPS or k3s cluster (single region) | Sprint 6 |
| Production v1 | Kubernetes cluster (single region, multi-AZ) | Sprint 12 |
| Production v2 | Multi-region K8s (us-east + eu-west) | Sprint 18 |
| ClickHouse cluster | 3-node cluster (added to production K8s) | Sprint 13 |
| GPU instance for ML | Spot/preemptible instance for training | Sprint 8 |

### Data Licensing Considerations

| Data Source | License/Terms | Constraints |
|-------------|--------------|-------------|
| MaxMind GeoLite2 | Creative Commons Attribution-ShareAlike 4.0 | Must attribute; update database regularly; cannot redistribute raw database |
| Twitter/X API | Developer Agreement and Policy | Cannot display more than 100K tweets/day; must delete tweets removed by users; attribution required |
| Reddit API | Reddit API Terms | Rate limited; must identify as bot; cannot use for surveillance |
| Mapbox | Mapbox Terms of Service | Attribution required on map; tile caching restrictions; pricing based on map loads |
| Atlassian Statuspage (scraping) | Public data; respect robots.txt | No explicit API license; rely on public JSON endpoints; respect rate limits |

---

## Success Metrics

### Phase 1 Success Metrics (End of Month 3)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Services monitored | 500 | Count in service catalog |
| Active probe regions | 5 | Fly.io deployment verification |
| Report submission latency (p99) | < 100ms | API monitoring |
| Detection latency (Layer 1) | < 5 seconds | Synthetic outage test |
| False positive rate (Layer 1) | < 10% | Manual review of detections over 2 weeks |
| Frontend Lighthouse score | > 90 (all categories) | Lighthouse CI |
| CI pipeline reliability | > 98% green | GitHub Actions metrics |
| Test coverage (TypeScript) | > 80% | Vitest coverage report |

### Phase 2 Success Metrics (End of Month 6)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Detection accuracy (precision) | > 90% | Manual review of all detected outages over 1 month |
| Detection accuracy (recall) | > 80% | Compare detected outages against known outage reports |
| False positive rate (consensus engine) | < 2% | Automated measurement |
| Detection latency (ML layers) | < 30 seconds | Production monitoring |
| WebSocket message delivery latency (p99) | < 1 second | Client-side measurement |
| NLP outage classification F1 | > 85% | Model evaluation on test set |
| Concurrent WebSocket connections supported | 10,000+ | Load test |
| Registered users | 500+ | Database count |
| API keys issued | 100+ | Database count |

### Phase 3 Success Metrics (End of Month 9)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Services monitored | 5,000+ | Service catalog count |
| Predictive detection lead time | 5-15 minutes before confirmed outage | Historical analysis |
| Predictive detection AUC-ROC | > 0.85 | Model evaluation |
| Mobile app rating | > 4.0 stars | App Store / Google Play |
| Multi-region failover time | < 30 seconds | Failover drill |
| Edge cache hit rate | > 80% | Cloudflare analytics |
| API response time (p95, cached) | < 50ms | Production monitoring |
| API response time (p95, non-cached) | < 200ms | Production monitoring |
| System availability | > 99.9% | Uptime monitoring |
| Enterprise organizations | 10+ | Database count |

### Phase 4 Success Metrics (End of Month 12)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Monthly active users (web + mobile) | 50,000+ | Analytics |
| Open Data API consumers | 100+ API keys | Database count |
| Community contributors | 50+ | GitHub contributor count |
| GitHub stars | 5,000+ | GitHub metrics |
| Plugin ecosystem | 10+ published plugins | Plugin registry |
| Federated instances | 5+ | Federation network monitoring |
| Detection accuracy (overall precision) | > 95% | Automated measurement |
| Detection accuracy (overall recall) | > 90% | Comparison against known outages |
| System availability (annual) | > 99.99% | Uptime monitoring |
| Mean Time To Detect (MTTD) | < 2 minutes | Production metrics |
| Community NPS score | > 50 | User survey |
