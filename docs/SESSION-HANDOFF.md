# OpenPulse — Session Handoff Document

## Date: March 20, 2026

## Repository

- **GitHub**: https://github.com/serma100000/Agentic-Retreat
- **Local Path**: `C:\Users\mschiaramonte\AI Projects\ClaudeCode\Agentic-Retreat`
- **Branch**: `main`
- **Latest Commit**: `338324c` — "Implement OpenPulse Phase 4 Ecosystem (Sprints 19-24) — Project Complete"

---

## What Was Built

**OpenPulse** — a complete, open-source service outage detection and monitoring platform (like Downdetector but better). Built from scratch in a single session using multi-agent swarms.

### Project Stats

| Metric | Value |
|--------|-------|
| TypeScript Lines | ~64,200 |
| Total Files | ~342 |
| Test Files | 59 |
| Tests Passing | 906 |
| Commits | 6 |
| Phases Completed | 4/4 (all 24 sprints) |
| Swarm Agents Spawned | 24 total (6 per phase) |

---

## Architecture Overview

### Tech Stack (per ADR-003)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS, Chart.js |
| Mobile | React Native / Expo |
| API | Fastify (Node.js) + GraphQL |
| Event Streaming | Redpanda (Kafka-compatible) |
| Time-Series DB | PostgreSQL 17 + TimescaleDB |
| Analytics DB | ClickHouse |
| Cache | Redis 8 |
| ML | Custom LSTM autoencoder + XGBoost (TypeScript) |
| Edge | Cloudflare Workers (designed for) |
| Infrastructure | Kubernetes (k3s), Docker Compose for local |
| CI/CD | GitHub Actions |

### Monorepo Structure

```
Agentic-Retreat/
├── apps/
│   ├── api/          # Fastify REST API server (19 files)
│   ├── web/          # Next.js 15 frontend (~50 files, 20+ pages, 25+ components)
│   ├── mobile/       # React Native/Expo app (16 files, 5 screens)
│   └── prober/       # Active HTTP/DNS/TCP probing service (9 files)
├── packages/
│   ├── shared/       # Shared TypeScript types and constants
│   ├── db/           # Drizzle ORM schemas, migrations, 500-service seed
│   └── config/       # Shared ESLint, TypeScript, Prettier configs
├── src/
│   ├── detection/    # 4-layer anomaly detection engine (12 files, 67 tests)
│   ├── social/       # Twitter/Reddit NLP pipeline (12 files, 86 tests)
│   ├── ml/           # LSTM autoencoder + XGBoost (12 files, 59 tests)
│   ├── consensus/    # Bayesian multi-signal consensus (10 files, 79 tests)
│   ├── realtime/     # WebSocket gateway (9 files, 54 tests)
│   ├── notifications/# Multi-channel dispatch (14 files, 60 tests)
│   ├── analytics/    # ClickHouse ETL + analytics service (11 files, 48 tests)
│   ├── graphql/      # GraphQL API with subscriptions (14 files, 45 tests)
│   ├── enterprise/   # OAuth, JWT, API keys, SLA tracking (13 files, 56 tests)
│   ├── infrastructure/# Circuit breaker, cache, rate limiter, metrics (12 files, 39 tests)
│   ├── opendata/     # Anonymized open data API (10 files, 61 tests)
│   ├── extension/    # Chrome/Firefox browser extension (10 files)
│   ├── iac/          # Terraform/Pulumi providers (6 files, 32 tests)
│   ├── plugins/      # Plugin system with sandbox (9 files, 50 tests)
│   ├── community/    # Contribution workflow + outage DB (7 files, 43 tests)
│   ├── federation/   # Federated deployment + crypto (10 files, 43 tests)
│   └── docs/         # OpenAPI generator, doc site, changelog (8 files, 39 tests)
├── tests/            # Integration + E2E tests (6 files, ~40 tests)
├── scripts/          # Health check, benchmark, changelog, service validator (5 files)
├── infra/
│   ├── docker-compose.yml      # PostgreSQL+TimescaleDB, Redpanda, Redis, MailHog
│   ├── docker-compose.dev.yml  # Dev overrides with persistent volumes
│   └── k8s/                    # Kubernetes manifests (8 files)
├── docs/
│   ├── research/     # Academic research paper (706 lines)
│   ├── adrs/         # 10 Architecture Decision Records (1,843 lines)
│   ├── ddd/          # 7 DDD bounded context docs (1,624 lines)
│   └── plan/         # 24-sprint implementation plan (590 lines)
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
├── Makefile
└── vitest.config.ts
```

---

## Detection Engine (Core Innovation)

4-layer ensemble anomaly detection:

| Layer | Algorithm | Latency Target | Status |
|-------|-----------|---------------|--------|
| 1 | Z-score statistical threshold | <10ms | Implemented + tested |
| 2 | CUSUM change-point detection | <50ms | Implemented + tested |
| 3 | LSTM autoencoder reconstruction error | <200ms | Implemented + tested |
| 4 | XGBoost gradient-boosted predictor | <500ms | Implemented + tested |

**Consensus Engine**: Bayesian fusion with 6-state machine (OPERATIONAL → INVESTIGATING → DEGRADED → MAJOR_OUTAGE → RECOVERING → RESOLVED), hysteresis on all transitions, geographic spread analysis.

**Signal Sources**: User reports, active probes, social media NLP, official status pages, ML autoencoder, ML predictive.

---

## What Each Phase Delivered

### Phase 1: Foundation (Sprints 1-6)
- Monorepo scaffolding (Turborepo, pnpm, Docker Compose, GitHub Actions CI)
- Database schemas (Drizzle ORM, TimescaleDB hypertables, continuous aggregates)
- 500 real-world services seeded across 10 categories
- Fastify API (report ingestion, rate limiting, GeoIP, Kafka producer/consumer)
- Statistical + CUSUM detection with consensus state machine
- Next.js frontend (service listing, detail pages, report submission, dark mode)
- Active HTTP/DNS/TCP probers

### Phase 2: Intelligence (Sprints 7-12)
- Social media pipeline (Twitter/Reddit clients, text preprocessing, MinHash dedup)
- NLP classification (entity extraction, sentiment scoring, urgency scoring)
- LSTM autoencoder (custom matrix ops, LSTM cells, training pipeline)
- XGBoost predictor (decision tree ensemble, gradient boosting)
- Enhanced Bayesian consensus with geographic analysis
- Status page scraper (Atlassian format)
- WebSocket gateway with channel management
- Notifications (email, webhook/HMAC, Slack Block Kit, Discord, PagerDuty)
- Frontend: live outage map, timeline, signal breakdown, notification settings

### Phase 3: Scale & Polish (Sprints 13-18)
- ClickHouse analytics (ETL pipeline, MTTR/MTTD, correlation detection)
- GraphQL API (subscriptions, DataLoaders, query complexity limiting)
- React Native mobile app (5 screens, push notifications)
- Enterprise (OAuth/PKCE, JWT sessions, API key tiers, SLA tracking)
- Infrastructure (circuit breaker, multi-layer cache, rate limiter, Prometheus metrics)
- Kubernetes manifests (deployments, HPA, ingress, configmap)
- Frontend: analytics dashboard, enterprise UI, login, API docs

### Phase 4: Ecosystem (Sprints 19-24)
- Open Data API (anonymizer, JSON/CSV/Parquet export, SDK generator)
- Browser extension (Chrome/Firefox, Manifest V3, inline banners)
- Terraform + Pulumi IaC providers
- Plugin system (loader, sandbox, registry, detection runner)
- Community features (contribution workflow, service validator, outage database)
- Federation (peer discovery, Ed25519 crypto, vector clock sync, Helm charts)
- Documentation (OpenAPI 3.1 generator, doc site, changelog, benchmarks)
- Frontend: open data explorer, plugin marketplace, community hub, status page

---

## Submodule

- **RuVector**: `ruvnet/RuVector` is added as a git submodule at `/RuVector`

---

## How to Run Locally

### Prerequisites
- Node.js 22+, pnpm, Docker Desktop

### Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure
cd infra && docker compose up -d && cd ..

# 3. Run migrations and seed
pnpm db:migrate
pnpm db:seed

# 4. Start dev servers
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:3000
```

### Run Tests
```bash
pnpm test              # All 906 tests
npx vitest run         # Same, verbose
```

### Run Benchmarks
```bash
npx tsx scripts/benchmark-detection.ts
npx tsx scripts/health-check.ts
npx tsx scripts/validate-services.ts
```

---

## Docker from WSL Issue

Docker Compose fails from WSL because the Docker daemon socket isn't accessible. To fix:

1. **Docker Desktop** → Settings → Resources → WSL Integration → Enable for your distro
2. Or run `docker compose up -d` from **PowerShell** in `C:\Users\mschiaramonte\AI Projects\ClaudeCode\Agentic-Retreat\infra\`

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `package.json` | Root workspace config with all scripts |
| `turbo.json` | Build pipeline configuration |
| `infra/docker-compose.yml` | Local infrastructure (PG, Redis, Redpanda) |
| `packages/db/src/migrations/001_initial_schema.sql` | Full database schema |
| `packages/db/src/seed/index.ts` | 500-service seed data |
| `apps/api/src/index.ts` | Fastify API entry point |
| `apps/web/src/app/layout.tsx` | Next.js root layout |
| `src/detection/detection-pipeline.ts` | Detection orchestrator |
| `src/consensus/enhanced-consensus.ts` | Multi-signal consensus engine |
| `vitest.config.ts` | Test configuration |
| `docs/plan/implementation-plan.md` | Full 24-sprint plan |
| `docs/adrs/` | 10 Architecture Decision Records |

---

## Next Steps (if continuing)

1. **Deploy**: Get Docker Compose running (PowerShell), verify smoke tests pass
2. **Load test**: Use the benchmark scripts to validate detection latency targets
3. **Production**: Apply K8s manifests (`infra/k8s/`) to a cluster
4. **Polish**: Wire up remaining integrations (real Twitter API keys, MaxMind GeoIP DB, Mapbox token)
5. **Community**: Set up GitHub Discussions, contribution guidelines

---

## Git History

```
338324c Phase 4 Ecosystem (77 files, 18,648 lines)
a7b92af Phase 3 Scale & Polish (86 files, 17,674 lines)
38535a4 Phase 2 Intelligence (71 files, 15,978 lines)
f7dcd8b Phase 1 Foundation (108 files, 11,023 lines)
e8d1454 Docs: ADRs, DDD, implementation plan, research paper
062efdf Initial commit
```
