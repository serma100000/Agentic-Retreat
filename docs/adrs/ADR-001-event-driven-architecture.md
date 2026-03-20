# ADR-001: Event-Driven Microservices Architecture

## Status

**Accepted** -- March 2026

## Context

OpenPulse is a next-generation, open-source service outage detection platform that must combine crowdsourced user reports, active probing, social media NLP, and official status page aggregation into a unified detection system. The platform faces a unique scaling challenge: traffic demand is inversely correlated with the broader internet's health. When a major service goes down, millions of users simultaneously flood the platform to confirm the outage, producing 10-100x normal traffic precisely when infrastructure providers may themselves be experiencing issues.

The system must handle multiple independent data streams (user reports, probe results, social signals, status page updates) that converge into a detection engine and then fan out to notifications, dashboards, and APIs. Each of these streams has distinct throughput characteristics, latency requirements, and processing semantics.

Key requirements driving this decision:

1. **Elastic scaling during outage surges**: The platform must scale from a steady-state load of 100,000 daily active users to 5,000,000 concurrent users during major outages, with report ingestion scaling from 10,000 reports/second sustained to 500,000 reports/second burst.

2. **Sub-second update propagation**: Detection events must propagate from signal ingestion to client-rendered dashboard updates in under one second.

3. **Independent service evolution**: Signal sources (crowdsourced reports, probes, social media, status pages) have fundamentally different operational characteristics and must evolve, scale, and fail independently.

4. **CQRS pattern**: Write paths (high-throughput report ingestion, probe result recording) and read paths (dashboard queries, API responses, historical analytics) have drastically different performance profiles and must be optimized independently.

5. **Polyglot persistence**: Each bounded context requires a data store optimized for its access patterns -- TimescaleDB for time-series metrics, PostgreSQL for the service catalog, ClickHouse for analytical queries, Redis for real-time counters, and Elasticsearch for geo-queries and full-text search.

6. **Graceful degradation**: The system must continue operating with reduced functionality during partial failures. If the social media pipeline goes down, report-based and probe-based detection must continue unaffected.

## Decision

We will adopt an **event-driven microservices architecture** with **Redpanda (Kafka-compatible)** as the central streaming backbone.

### Core Architectural Principles

- **Events as first-class citizens**: Every state change in the system is represented as an immutable event in a distributed log. Report submissions, probe results, detection signals, state transitions, and notifications are all events flowing through the streaming backbone.

- **Streaming backbone**: Redpanda serves as the central nervous system. All inter-service communication for data processing flows through Kafka-compatible topics: `reports`, `probes`, `social`, `status-pages`, `detections`, `notifications`, and `state-transitions`.

- **CQRS everywhere**: Write-optimized services (Report Ingestion, Active Prober, Social Listener) publish events to the streaming backbone. Read-optimized services (API/Query, Visualization) consume events and maintain materialized views in stores optimized for their query patterns.

- **Polyglot persistence**: Each bounded context owns its data store. No shared databases between services.

- **Edge-first processing**: Data ingestion and initial processing (validation, geo-enrichment, deduplication) occur at the edge via Cloudflare Workers before events enter the core streaming backbone.

### Service Decomposition

The system is decomposed into the following bounded contexts, each implemented as one or more independently deployable services:

| Bounded Context | Responsibility | Publishes To | Consumes From |
|----------------|---------------|-------------|--------------|
| Report Ingestion | Intake, validation, dedup, geo-enrichment of user reports | `reports` | -- |
| Active Probing | Distributed HTTP/DNS/TCP/ICMP/TLS health checks | `probes` | `detections` (adaptive frequency) |
| Social Intelligence | NLP-based social media monitoring | `social` | -- |
| Status Page Aggregation | Scraping and normalizing official status pages | `status-pages` | -- |
| Anomaly Detection Engine | Multi-layer anomaly detection (statistical, CUSUM, LSTM, XGBoost) | `detections` | `reports`, `probes`, `social`, `status-pages` |
| Detection Consensus | Multi-signal Bayesian fusion and state machine | `state-transitions` | `detections` |
| Notification Dispatcher | Multi-channel alert delivery | -- | `state-transitions` |
| API and Query | REST/GraphQL API serving | -- | Materialized views |
| Visualization | Real-time dashboards, outage maps | -- | WebSocket/SSE from `state-transitions` |

### Streaming Backbone Configuration

Redpanda is chosen over Apache Kafka for the following reasons:

- **Lower operational overhead**: Single binary deployment versus Kafka's ZooKeeper/KRaft dependency
- **Kafka API compatibility**: All existing Kafka client libraries and tooling work without modification
- **Lower tail latency**: Redpanda's thread-per-core architecture (built on Seastar) delivers more predictable latency under load
- **Reduced infrastructure cost**: Fewer nodes required for equivalent throughput

Topic configuration for outage surge handling:

- Report topics: 64+ partitions, allowing parallel consumption by dynamically scaled consumer groups
- Retention: 7 days for raw events, indefinite for aggregated state transitions
- Compaction: Enabled for state topics (latest service status per key)

### Real-Time Delivery

The real-time delivery tier uses:

- **WebSocket Gateway**: Persistent connections for live dashboard updates, backed by Redis Pub/Sub as the multi-instance fan-out backplane
- **Server-Sent Events (SSE)**: Lightweight server-push for simpler dashboard integrations
- **Redis Pub/Sub**: Backplane enabling horizontal scaling of WebSocket gateway instances

### Compute Orchestration

- Core services run on Kubernetes with Horizontal Pod Autoscaler (HPA) configured on both CPU utilization and custom metrics (Kafka consumer lag)
- Burst workloads overflow to serverless functions (AWS Lambda / Cloudflare Workers)
- Event streaming elasticity is achieved through automatic Redpanda partition rebalancing

## Consequences

### Positive

1. **Independent scaling**: Each service scales based on its own load profile. During an outage surge, Report Ingestion and WebSocket Gateway scale aggressively while Status Page Aggregation remains at baseline.

2. **Fault isolation**: A failure in the Social Intelligence service does not affect report-based or probe-based detection. The streaming backbone provides natural buffering -- if a consumer falls behind, events queue in Redpanda until the consumer recovers.

3. **Temporal decoupling**: Producers and consumers operate at their own pace. The Detection Engine can process a burst of reports at its own rate, smoothing out traffic spikes.

4. **Auditability and replay**: The immutable event log provides a complete audit trail of every signal and state transition. Events can be replayed to debug detection logic, retrain ML models on historical data, or rebuild materialized views.

5. **Technology flexibility**: New signal sources can be added by implementing a new producer that publishes to a new topic. New consumers (e.g., a future causal outage graph service) can be added without modifying existing services.

6. **CQRS optimization**: Write paths are optimized for throughput (append-only event publishing), while read paths are optimized for query performance (materialized views in purpose-built stores).

### Negative

1. **Operational complexity**: Running and monitoring Redpanda, multiple databases, and many independent services requires mature DevOps practices and comprehensive observability (addressed via OpenTelemetry, Grafana, and Prometheus).

2. **Eventual consistency**: The system is eventually consistent by design. A report submitted at the edge may take up to 5 seconds to be reflected in the detection engine's state. This is acceptable given the detection latency targets but must be communicated clearly in API documentation.

3. **Debugging difficulty**: Tracing a request across multiple services and event streams is harder than in a monolith. Distributed tracing (OpenTelemetry) and correlation IDs on all events are essential mitigations.

4. **Data duplication**: Materialized views mean the same logical data may exist in multiple stores (TimescaleDB, Redis, ClickHouse, Elasticsearch). Consistency between these stores is maintained via the event log as the source of truth but adds storage cost and reconciliation complexity.

5. **Higher initial development cost**: Building event-driven services with proper schema evolution, dead-letter queues, and idempotent consumers requires more upfront engineering than a monolithic approach.

6. **Team skill requirements**: The team must be proficient with event-driven patterns, streaming systems, and distributed systems concepts. This raises the hiring bar.

## Alternatives Considered

### Alternative 1: Monolithic Architecture

A single deployable application handling all concerns (ingestion, detection, API, notifications).

**Rejected because:**
- Cannot scale individual components independently; during an outage surge, the entire monolith must scale even though only ingestion and real-time delivery are under pressure
- A bug or resource exhaustion in one module (e.g., ML inference) affects all other functionality
- Technology choices are constrained to a single runtime; cannot use Rust for hot-path probing alongside Node.js for API development
- Deployment coupling means every change requires full redeployment, increasing blast radius

### Alternative 2: Request-Driven (Synchronous) Microservices

Microservices communicating via synchronous HTTP/gRPC calls rather than an event streaming backbone.

**Rejected because:**
- Tight temporal coupling: if the Detection Engine is slow or down, the Report Ingestion service blocks or fails, creating cascading failures during precisely the moments the system is under highest load
- No natural buffering mechanism for traffic surges; every service in the call chain must handle peak load simultaneously
- Loses the replay and audit capability of an event log
- Fan-out patterns (one report triggering detection, consensus, notification, and materialized view updates) become complex chains of synchronous calls with distributed transaction concerns

### Alternative 3: Serverless-Only (AWS Lambda + Kinesis)

A fully serverless architecture following the Downdetector model (Lambda functions + Kinesis streams + DynamoDB).

**Rejected because:**
- Cold start latency is incompatible with sub-second detection propagation requirements, particularly for ML inference workloads
- Vendor lock-in conflicts with the open-source, self-hostable philosophy; a Lambda-based architecture cannot be self-hosted
- Cost at scale: serverless pricing becomes expensive at sustained high throughput (500,000 reports/second burst would generate significant Lambda invocation costs)
- Limited control over resource allocation for ML inference workloads that benefit from GPU acceleration
- However, serverless is used selectively for burst overflow and edge processing (Cloudflare Workers), combining the best of both approaches

## References

- OpenPulse Research Document, Section 3 (System Architecture and Design)
- OpenPulse Research Document, Section 6 (Scalability and Performance Analysis)
- Confluent, "Event-Driven Architecture: A Complete Introduction"
- MIT Technology Review, "Enabling Real-Time Responsiveness with Event-Driven Architecture," October 2025
- Growin, "Event Driven Architecture Done Right: How to Scale Systems with Quality in 2025"
