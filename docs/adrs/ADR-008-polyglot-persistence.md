# ADR-008: Polyglot Persistence with Specialized Databases

## Status

**Accepted** -- March 2026

## Context

OpenPulse processes and stores several fundamentally different categories of data, each with distinct access patterns, query requirements, throughput characteristics, and retention needs:

1. **Time-series metrics** (report counts, probe latencies, detection scores): High-volume append-only writes (tens of thousands per second), time-range queries with aggregation, downsampling for historical data, per-service partitioning.

2. **Relational entities** (service catalog, user accounts, notification preferences, API keys): ACID transactions, complex joins (service-to-category, user-to-notification-channels), moderate read/write volume, strong consistency requirements.

3. **Analytical queries** (historical outage analysis, cross-service correlation, trend analysis): Columnar scans over large datasets, complex aggregations, ad-hoc queries, batch-oriented reads, write-once-read-many.

4. **Real-time counters and caching** (active report counts, rate limit state, session data, pub/sub for WebSocket fan-out): Sub-millisecond reads and writes, volatile data, TTL-based expiration, pub/sub messaging.

5. **Full-text search and geo-queries** (social media post search, geographic report aggregation, service name search): Inverted index for text search, geo-spatial indexing for location-based queries, faceted search.

6. **Blob storage** (ML model artifacts, raw event archives, Parquet data exports): Large object storage, infrequent access, cost optimization for cold data.

No single database technology excels at all of these access patterns. Using a single database forces compromises that degrade performance, increase cost, or limit functionality in at least some dimensions.

## Decision

We will use **multiple specialized databases**, each selected for a specific data access pattern, with the event streaming backbone (Redpanda) as the source of truth that feeds materialized views in each store.

### Database Selection

| Database | Version | Purpose | Access Pattern | Data Retention |
|----------|---------|---------|----------------|----------------|
| **TimescaleDB** | Latest | Time-series metrics and report counts | Hypertable partitioned by time and service ID; continuous aggregation for rollups (1-min, 5-min, 1-hour, 1-day) | Hot: 24 hours full resolution; Warm: 90 days at 5-min granularity; Cold: indefinite at 1-hour granularity |
| **PostgreSQL 17** | 17 | Service catalog, user accounts, configuration, API keys | Normalized relational schema; ACID transactions; complex joins | Indefinite for service catalog; user-controlled for account data |
| **ClickHouse** | Latest | Historical analytics, cross-service correlation, trend reports | Columnar storage with ReplicatedMergeTree engine; distributed tables for query parallelism | 2+ years of aggregated data |
| **Redis 8** | 8 | Real-time counters, caching, pub/sub backplane, rate limit state | In-memory key-value with Redis Streams; sub-millisecond operations | Volatile (TTL-based); counters: 24h; cache: 5-15 min; sessions: until expiry |
| **Elasticsearch 8** | 8 | Full-text search on social data, geo-queries for outage maps, service name search | Inverted index; geo-point and geo-shape queries; ILM for index lifecycle | Index-per-day with automatic rollover; 30-day retention for raw social data |
| **S3 / Cloudflare R2** | -- | ML model artifacts, raw event archives, Parquet data exports | Write-once, read-occasionally; bulk download for data exports | Indefinite for archives; model artifacts retained for 6 months |

### Data Flow Architecture

The event streaming backbone (Redpanda) is the single source of truth. Each database is populated by dedicated consumer services that read from relevant Kafka topics and write to their target store:

```
Redpanda Topics
    |
    +---> TimescaleDB Writer (consumes: reports, probes, detections)
    |         Writes: time-series metrics, report counts, probe latencies
    |
    +---> PostgreSQL Writer (consumes: state-transitions, service-catalog-updates)
    |         Writes: outage records, service metadata updates
    |
    +---> ClickHouse Writer (consumes: reports, probes, social, detections)
    |         Writes: append-only analytical tables for historical queries
    |
    +---> Redis Writer (consumes: reports, detections, state-transitions)
    |         Writes: real-time counters, cached status, pub/sub notifications
    |
    +---> Elasticsearch Writer (consumes: social, reports)
    |         Writes: searchable social media documents, geo-indexed reports
    |
    +---> S3 Archiver (consumes: all topics)
              Writes: raw event archives in Parquet format
```

**Consistency model**: The system is eventually consistent across stores. Redpanda topic offsets provide ordering guarantees. Each writer tracks its consumer offset, enabling replay if a store needs to be rebuilt or backfilled. The typical propagation delay from event publication to availability in all stores is < 5 seconds.

### TimescaleDB Details

- **Hypertable partitioning**: Primary partitioning by time (1-hour chunks), secondary partitioning by service ID for query locality
- **Continuous aggregation**: Pre-computed rollups at 1-minute, 5-minute, 1-hour, and 1-day granularities, computed incrementally as new data arrives
- **Compression**: Automated compression of chunks older than 24 hours, achieving 10-20x storage reduction for time-series data
- **Retention policy**: Automated data lifecycle -- full-resolution data retained for 24 hours, then downsampled to 5-minute resolution for 90 days, then 1-hour resolution indefinitely

### ClickHouse Details

- **Engine**: ReplicatedMergeTree for fault tolerance; 3 replicas
- **Schema**: Append-only wide tables optimized for analytical queries (denormalized)
- **Materialized views**: Pre-aggregated views for common dashboard queries (outage duration distribution, service reliability rankings, geographic heat maps)
- **Query performance**: Sub-second response for aggregation queries over billions of rows due to columnar compression and vectorized execution

### Redis Details

- **Real-time counters**: Atomic increment/decrement for per-service report counts, used by the detection engine for threshold checks
- **Caching**: Service status cache (5-minute TTL), API response cache (configurable TTL per endpoint), session cache
- **Pub/Sub**: Backplane for WebSocket gateway instances; when a state transition occurs, it is published to a Redis channel and fanned out to all connected WebSocket clients
- **Redis Streams**: Used for lightweight internal event queues where Redpanda's overhead is unnecessary
- **Cluster mode**: Sharded by service ID for counter operations; read replicas for pub/sub fan-out

### Elasticsearch Details

- **Social media indexing**: Each social media post processed by the NLP pipeline is indexed with service entity, sentiment, geographic location, and timestamp
- **Geo-queries**: Report locations are indexed as geo-points, enabling geographic aggregation for the live outage map (geo-hash grid aggregation, bounding box queries)
- **Index lifecycle management (ILM)**: Automatic index rollover (daily), with hot-warm-cold tiering and automatic deletion after retention period
- **Service search**: Full-text search across the service catalog for user-facing search functionality

## Consequences

### Positive

1. **Optimized query performance**: Each access pattern is served by a database designed for that pattern. Time-series queries run on TimescaleDB with native time-series optimizations. Analytical queries run on ClickHouse with columnar compression and vectorized execution. Real-time counters run on Redis with sub-millisecond latency.

2. **Independent scaling**: Each database scales according to its own load profile. During an outage surge, Redis handles the counter increment storm while ClickHouse (used for historical analytics) remains at baseline load.

3. **Fault isolation**: A failure in Elasticsearch (full-text search) does not affect time-series queries (TimescaleDB) or real-time counters (Redis). The system degrades gracefully.

4. **Cost optimization**: Hot data lives in expensive, high-performance stores (Redis, TimescaleDB). Warm data migrates to cost-effective columnar storage (ClickHouse). Cold data archives to object storage (S3/R2) at minimal cost.

5. **Replay and rebuild**: Because Redpanda is the source of truth, any materialized view in any database can be rebuilt from scratch by replaying events from the beginning of the retention window. This enables schema migrations, new database additions, and disaster recovery.

6. **Technology evolution**: If a better time-series database emerges, TimescaleDB can be replaced by adding a new writer consuming from the same Redpanda topics, running both in parallel during migration, and switching over when the new store is caught up.

### Negative

1. **Operational complexity**: Six different database technologies require six different sets of operational expertise: monitoring, backup, upgrade, tuning, and incident response procedures. This is the most significant cost of the polyglot approach.

2. **Eventual consistency**: Data propagation delay between stores means a report submitted at time T may be visible in Redis counters within 1 second but not available in ClickHouse analytics for 5 seconds. Application code must be designed for this.

3. **Cross-store queries are impossible**: A query that needs both time-series data (TimescaleDB) and social media text (Elasticsearch) requires application-level joins, which are slower and more complex than database-level joins.

4. **Storage cost duplication**: The same logical data (e.g., report events) is stored in multiple forms across multiple databases. This increases total storage cost compared to a single-database approach.

5. **Schema coordination**: Schema changes that span multiple stores require coordinated updates to multiple writer services and their target schemas.

6. **Monitoring overhead**: Each database requires its own monitoring, alerting, and dashboarding. The observability stack (Prometheus, Grafana) must be configured with database-specific exporters and alert rules for all six stores.

## Alternatives Considered

### Alternative 1: PostgreSQL-Only

Use PostgreSQL with extensions (TimescaleDB extension, pg_trgm for text search, PostGIS for geo-queries) as the single database for all data.

**Rejected because:**
- PostgreSQL cannot match Redis's sub-millisecond latency for real-time counters and pub/sub
- PostgreSQL's row-oriented storage is 10-100x slower than ClickHouse's columnar engine for analytical aggregation queries over billions of rows
- Full-text search in PostgreSQL (pg_trgm) is significantly less capable than Elasticsearch for complex NLP-processed social media search with faceting and geo-aggregation
- A single PostgreSQL instance becomes a scaling bottleneck under surge load; read replicas help but do not solve write throughput limits
- However, TimescaleDB (a PostgreSQL extension) is used for time-series data, leveraging PostgreSQL compatibility while gaining time-series optimizations

### Alternative 2: DynamoDB Single-Table Design

Use AWS DynamoDB with a single-table design pattern, following the Downdetector architecture.

**Rejected because:**
- Vendor lock-in to AWS conflicts with the open-source, self-hostable philosophy
- DynamoDB's key-value access pattern makes complex analytical queries expensive (requires full table scans or maintaining many GSIs)
- No native time-series optimization; time-range queries require careful partition key design
- No full-text search capability; requires a separate Elasticsearch deployment anyway
- Cost unpredictability during surge events (DynamoDB on-demand pricing can spike dramatically)
- Downdetector uses DynamoDB as a caching layer alongside OpenSearch; their architecture actually confirms the need for multiple specialized stores

### Alternative 3: Managed All-in-One Platform (e.g., Supabase, PlanetScale + Upstash)

Use a managed database platform that provides PostgreSQL, real-time subscriptions, and caching in a unified offering.

**Rejected because:**
- No managed platform provides the combination of time-series optimization, columnar analytics, full-text search, and sub-millisecond caching needed
- Managed platforms add cost margins on top of the underlying infrastructure
- Vendor coupling conflicts with self-hosting requirements
- Performance characteristics of managed platforms are often opaque and harder to optimize
- However, managed versions of the selected databases (e.g., Timescale Cloud, Redis Cloud, Elastic Cloud) may be used in the hosted SaaS deployment for operational convenience

## References

- OpenPulse Research Document, Section 3.1 (Architecture Philosophy -- Polyglot Persistence)
- OpenPulse Research Document, Section 3.2 (High-Level Architecture -- Data Tier)
- OpenPulse Research Document, Section 6.2 (Scaling Strategy -- Database Scaling)
- OpenPulse Research Document, Section 8.1 (Infrastructure Cost Model)
- OpenPulse Research Document, Section 8.2 (Cost Optimization Strategies -- Tiered Storage)
