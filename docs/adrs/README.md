# OpenPulse Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for the OpenPulse project -- a next-generation, open-source service outage detection and monitoring platform.

ADRs document the significant architectural decisions made during the design and implementation of OpenPulse, including the context that led to each decision, the alternatives considered, and the expected consequences.

## ADR Index

| ADR | Title | Status | Summary |
|-----|-------|--------|---------|
| [ADR-001](ADR-001-event-driven-architecture.md) | Event-Driven Microservices Architecture | Accepted | Adopt event-driven microservices with Redpanda/Kafka as the streaming backbone, enabling elastic scaling during outage surges, CQRS, polyglot persistence, and independent service evolution. |
| [ADR-002](ADR-002-multi-signal-detection.md) | Multi-Signal Ensemble Detection | Accepted | Implement a 4-layer ensemble detection approach (statistical thresholds, CUSUM change-point, LSTM autoencoder, XGBoost predictive) to reduce false positives and enable predictive outage detection. |
| [ADR-003](ADR-003-technology-stack.md) | Core Technology Stack | Accepted | Select a polyglot stack -- Next.js frontend, Fastify + Rust API layer, TimescaleDB, ClickHouse, Redis, Elasticsearch -- optimizing for developer velocity and hot-path performance. |
| [ADR-004](ADR-004-edge-first-processing.md) | Edge-First Processing | Accepted | Process report ingestion at the edge via Cloudflare Workers to achieve sub-100ms p99 report submission latency and absorb 10-100x traffic surges during outage events. |
| [ADR-005](ADR-005-bayesian-consensus-engine.md) | Bayesian Consensus Engine | Accepted | Use weighted Bayesian fusion with a deterministic state machine to combine crowdsourced reports, probes, social signals, and status pages into a unified, explainable confidence score. |
| [ADR-006](ADR-006-privacy-by-design.md) | Privacy by Design | Accepted | Implement GDPR-by-design data minimization: no PII required for reports, transient IP usage, hashed device fingerprints with 24h TTL, and optional accounts. |
| [ADR-007](ADR-007-open-source-open-data.md) | Open Source and Open Data | Accepted | Release under AGPL-3.0 with CC BY 4.0 open data to democratize outage intelligence, enable academic research, and build community contributions while preventing proprietary forks. |
| [ADR-008](ADR-008-polyglot-persistence.md) | Polyglot Persistence | Accepted | Use multiple specialized databases (TimescaleDB, PostgreSQL, ClickHouse, Redis, Elasticsearch) rather than a single database, with the event streaming backbone as the source of truth. |
| [ADR-009](ADR-009-active-probing-strategy.md) | Active Probing Strategy | Accepted | Deploy distributed probers on Fly.io edge with Rust workers for multi-protocol health checks (HTTP, DNS, TCP, ICMP, TLS) to provide objective, fast, and geographically precise outage signals. |
| [ADR-010](ADR-010-abuse-prevention.md) | Abuse Prevention | Accepted | Implement proof-of-work, behavioral analysis, reputation scoring, and canary services for anti-manipulation, compatible with the privacy-by-design architecture. |

## ADR Format

Each ADR follows a standard format:

- **Title**: A short descriptive name for the decision
- **Status**: The current status (Proposed, Accepted, Deprecated, Superseded)
- **Context**: The circumstances and forces that led to this decision
- **Decision**: The architectural choice that was made
- **Consequences**: The positive and negative results of the decision
- **Alternatives Considered**: Other options that were evaluated and why they were rejected
- **References**: Links to source materials and related documents

## Related Documents

- [Research Document: Outage Detection Platform Rebuild](../research/outage-detection-platform-rebuild.md) -- The foundational research paper that informs all ADRs
