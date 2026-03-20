# ADR-003: Core Technology Stack Selection

## Status

**Accepted** -- March 2026

## Context

OpenPulse requires a technology stack that balances two competing concerns:

1. **Developer velocity**: The platform must be built by a small team on a startup timeline (12-month phased roadmap). Rapid iteration, a large ecosystem of libraries, and broad hiring availability are essential for the application layer, API development, and frontend.

2. **Hot-path performance**: Certain critical paths -- active probing workers, report ingestion validation, and real-time event processing -- demand low-latency, memory-safe, high-throughput execution that dynamic languages cannot reliably deliver under surge load.

The platform spans multiple technical domains:

- **Frontend**: Server-rendered web application with real-time dashboards, live outage maps with WebGL rendering, and streaming time-series charts
- **API layer**: REST and GraphQL APIs serving both human users and machine clients, with rate limiting and authentication
- **Event processing**: High-throughput stream processing consuming from Redpanda topics
- **Active probing**: Globally distributed workers executing multi-protocol health checks (HTTP, DNS, TCP, ICMP, TLS) with sub-second cadence
- **ML inference**: Real-time anomaly detection model serving
- **Data tier**: Multiple specialized databases (see ADR-008)
- **Edge compute**: Report ingestion and validation at CDN edge nodes

The team's existing expertise spans TypeScript/Node.js and Rust, with Python for ML workloads.

## Decision

We will adopt a polyglot technology stack optimized for each tier's requirements.

### Frontend: Next.js 15 (React, TypeScript)

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Framework | Next.js 15 | SSR for SEO on service catalog pages, ISR for near-real-time status pages (10-30s refresh), React Server Components for streaming |
| Language | TypeScript | Type safety, shared types with API layer |
| State Management | Zustand | Lightweight, supports differential updates from WebSocket |
| Real-Time | WebSocket + SSE | Persistent connections for live dashboards, SSE for lighter integrations |
| Mapping | Mapbox GL JS | WebGL-powered live outage maps capable of rendering thousands of geo-located markers with smooth animations |
| Charts | Custom canvas renderer | Streaming data updates without full re-renders, built on lightweight charting primitives |

The frontend employs a three-tier rendering strategy:
1. **Static Generation (SSG)** for service catalog pages, documentation, and marketing content -- served from CDN with sub-50ms TTFB globally
2. **Incremental Static Regeneration (ISR)** for service status pages updating every 10-30 seconds
3. **Client-Side Streaming** via WebSocket for real-time outage dashboards and live maps

### Mobile: React Native / Expo

Code sharing with the web frontend via shared TypeScript types and business logic. Native performance for push notifications and GPS-based geo-enrichment (with user consent).

### API Layer: Node.js (Fastify) + Rust (Axum)

The API layer uses a dual-language approach:

**Fastify (Node.js/TypeScript)** for the majority of API endpoints:
- REST API v1 (service catalog, outage history, user management)
- GraphQL API with subscriptions
- Webhook management
- Authentication and authorization (OAuth 2.0, API keys)
- Rate limiting via token bucket algorithms

**Rationale for Fastify over Express/Koa**: Fastify's schema-based validation, built-in serialization, and plugin architecture deliver 2-3x higher throughput than Express with less boilerplate. The JSON Schema validation at the route level aligns with the input validation requirements.

**Rust (Axum)** for hot-path services:
- Report ingestion validation and deduplication (500,000 reports/second burst target)
- Active prober workers (multi-protocol health checks)
- WebSocket gateway for real-time delivery (5,000,000 concurrent connections target)
- Event stream processing where per-message latency is critical

**Rationale for Rust hot paths**: The report ingestion path must handle 500,000 reports/second during surge events. Rust's zero-cost abstractions, absence of garbage collection pauses, and memory safety guarantees make it the right choice for these latency-sensitive, high-throughput paths. Axum (built on Tokio) provides an ergonomic async HTTP framework.

### Event Streaming: Redpanda

Kafka-compatible streaming backbone (see ADR-001 for detailed rationale). Single-binary deployment with lower operational overhead than Apache Kafka, thread-per-core architecture for predictable latency.

### ML Platform: Python (PyTorch) + ONNX Runtime

- **Training**: Python with PyTorch for LSTM autoencoder (Layer 3) and scikit-learn/XGBoost for predictive model (Layer 4). Training runs on GPU spot instances.
- **Inference**: ONNX Runtime for cross-platform model serving. Models are exported from PyTorch/XGBoost to ONNX format, enabling inference in Rust or Node.js processes without Python runtime dependencies.
- **NLP**: Fine-tuned DistilBERT for social media outage classification, served via ONNX Runtime.

### Edge Compute: Cloudflare Workers + R2 + D1

- Report submission endpoint at the edge for sub-100ms p99 latency globally
- Geo-IP resolution, rate limiting, bot detection at the edge before forwarding to origin
- Static asset serving and DDoS protection
- Stale-while-revalidate CDN semantics for dashboard pages

### Infrastructure: Kubernetes (k3s) + Serverless Overflow

- **Core services**: Kubernetes with HPA on CPU and custom metrics (Kafka consumer lag)
- **Burst overflow**: Serverless functions for traffic that exceeds Kubernetes auto-scaling capacity
- **Active probers**: Rust workers on Fly.io edge (10+ geographic regions)
- **ML training**: GPU spot instances, isolated from production inference

### Observability: OpenTelemetry + Grafana + Prometheus

- Distributed tracing via OpenTelemetry across all services
- Metrics collection via Prometheus with Grafana dashboards
- Log aggregation via structured JSON logging

### CI/CD: GitHub Actions + ArgoCD

- GitOps deployment model via ArgoCD
- Container image builds and vulnerability scanning in GitHub Actions
- Automated testing pipeline (unit, integration, contract tests)

### Data Tier

See ADR-008 for detailed rationale on polyglot persistence. Summary:

| Store | Purpose |
|-------|---------|
| TimescaleDB | Time-series metrics, report counts, probe latencies |
| PostgreSQL 17 | Service catalog, user accounts, configuration |
| ClickHouse | Historical analytics, columnar analytical queries |
| Redis 8 | Real-time counters, caching, pub/sub backplane |
| Elasticsearch 8 | Full-text search, geo-queries on social data |
| S3/R2 | ML model artifacts, raw event archives |

## Consequences

### Positive

1. **Optimized per-tier performance**: Rust handles the hot paths (probing, ingestion, WebSocket) where performance is critical, while TypeScript/Fastify accelerates development of the broader API surface.

2. **Shared type system**: TypeScript across frontend, API, and build tooling enables shared type definitions, reducing integration errors.

3. **Strong ML ecosystem**: Python/PyTorch provides access to the richest ML ecosystem for model development, while ONNX Runtime bridges the gap to production serving without Python runtime dependencies.

4. **Edge-first latency**: Cloudflare Workers provide global edge presence for the most latency-sensitive operation (report submission).

5. **Self-hostable**: All chosen technologies are open source or have open-source alternatives. No vendor lock-in to a specific cloud provider.

6. **Hiring flexibility**: TypeScript and Python have large talent pools. Rust is more specialized but the scope of Rust code is limited to well-defined hot paths.

### Negative

1. **Polyglot complexity**: Three primary languages (TypeScript, Rust, Python) require diverse tooling, CI pipelines, and developer expertise.

2. **Rust learning curve**: Rust's ownership model and borrow checker have a steep learning curve. The team must invest in Rust proficiency, though the scope is limited.

3. **Operational breadth**: Running Kubernetes, Redpanda, five databases, edge workers, and ML infrastructure is a significant operational surface area. Comprehensive observability and automation are essential.

4. **Build system complexity**: Coordinating builds across TypeScript (npm), Rust (cargo), and Python (pip/conda) requires a well-designed CI/CD pipeline.

## Alternatives Considered

### Alternative 1: All-Rust Stack

Rust for API (Axum), frontend (Leptos/Yew), and ML inference.

**Rejected because:**
- Rust frontend frameworks are immature compared to React/Next.js ecosystem
- Development velocity for CRUD API endpoints, authentication, and admin interfaces is significantly slower in Rust
- ML ecosystem in Rust is nascent; training and experimenting with models in Rust adds substantial friction
- Hiring Rust developers for all positions dramatically narrows the talent pool
- However, Rust is used strategically for the specific paths where its performance characteristics are essential

### Alternative 2: All-Node.js/TypeScript Stack

Node.js everywhere: Next.js frontend, Fastify API, Node.js workers for probing and stream processing.

**Rejected because:**
- Node.js single-threaded event loop with garbage collection pauses cannot reliably deliver the 500,000 reports/second burst ingestion target
- Active probing workers require multi-protocol (ICMP, raw TCP) capabilities that are awkward in Node.js
- WebSocket gateway at 5,000,000 concurrent connections requires memory efficiency that V8's per-connection overhead makes costly
- However, Node.js/TypeScript is used for the majority of the codebase where its developer velocity advantages outweigh performance concerns

### Alternative 3: Django/Python Stack

Python (Django/FastAPI) for backend, Python for ML, React frontend.

**Rejected because:**
- Python's GIL and interpreted nature make it unsuitable for the high-throughput hot paths
- Even with async frameworks (FastAPI), Python's per-request overhead is 5-10x higher than Fastify and 20-50x higher than Rust
- Django's ORM and monolithic patterns conflict with the event-driven microservices architecture
- However, Python is used where it excels: ML model training and experimentation

### Alternative 4: Go Stack

Go for all backend services, React frontend.

**Rejected because:**
- Go's type system (even with generics) is less expressive than TypeScript for complex API contracts and domain modeling
- Go's garbage collector, while excellent, still introduces latency variance that Rust avoids on the hottest paths
- Go's ML ecosystem is limited; would still need Python for model training
- Go is a reasonable choice and may be adopted for specific internal services in the future, but the TypeScript + Rust combination better matches the team's expertise and the performance requirements

## References

- OpenPulse Research Document, Section 4.1 (Technology Stack)
- OpenPulse Research Document, Section 6 (Scalability and Performance Analysis)
- OpenPulse Research Document, Section 4.2 (Frontend Architecture)
- OpenPulse Research Document, Section 4.3 (API Design)
