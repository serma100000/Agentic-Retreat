# ADR-004: Edge-First Processing for Report Ingestion

## Status

**Accepted** -- March 2026

## Context

OpenPulse faces a scaling challenge unique to outage monitoring platforms: traffic demand is inversely correlated with the broader internet's health. When a major service experiences an outage, millions of users simultaneously attempt to confirm the disruption by visiting the platform and submitting reports. Historical data from Downdetector shows surges of millions of simultaneous users during events such as the Facebook/Instagram/WhatsApp outage of October 2021 and the Cloudflare outage of June 2022.

This creates an anti-correlated scaling pattern with specific characteristics:

1. **Traffic surges of 10-100x baseline**: Steady-state load of approximately 100,000 daily active users can spike to 5,000,000 concurrent users within minutes of a major outage.

2. **Report ingestion burst**: Normal ingestion rate of 10,000 reports/second must scale to 500,000 reports/second burst capacity.

3. **Latency sensitivity**: Users submitting outage reports expect near-instant acknowledgment. Slow or failed report submission directly undermines the platform's crowdsourced data quality -- frustrated users abandon the platform.

4. **Infrastructure irony**: The platform must scale massively precisely when internet infrastructure may be partially degraded. If OpenPulse's origin infrastructure shares dependencies with the service experiencing the outage (e.g., a cloud region failure), the platform could become unavailable when it is most needed.

5. **Geographic distribution**: Users reporting outages are geographically distributed. A user in Tokyo reporting a service outage should experience the same submission latency as a user in New York.

The performance target for report submission is **sub-100ms p99 latency** from the user's perspective, measured from request initiation to acknowledgment.

## Decision

We will process report ingestion at the edge using **Cloudflare Workers** as the primary ingestion tier, performing validation, geo-enrichment, rate limiting, and initial deduplication before forwarding validated events to the origin streaming backbone.

### Edge Processing Pipeline

When a user submits an outage report, the following processing occurs at the Cloudflare Worker edge node closest to the user:

**Step 1: Request Validation (< 1ms)**
- JSON Schema validation of the report payload
- Required fields: service ID, report type (outage/degraded/operational)
- Payload size limits enforced
- Content-Type and encoding validation

**Step 2: Rate Limiting (< 1ms)**
- Per-IP rate limiting: 10 reports/minute (using Cloudflare Durable Objects for distributed state)
- Per-device-fingerprint rate limiting: 20 reports/hour
- Adaptive rate limiting: thresholds increase automatically during confirmed outages to accommodate legitimate surge traffic

**Step 3: Bot Detection (< 5ms)**
- Proof-of-work verification: anonymous report submissions include a solution to a lightweight computational challenge (Hashcash-style), preventing automated mass reporting
- Behavioral fingerprinting: request timing patterns, header analysis
- Known bot/proxy IP range checking against maintained blocklists

**Step 4: Geo-Enrichment (< 2ms)**
- Cloudflare provides the requesting IP's geographic data (country, region, city, ASN) as part of the request context, eliminating the need for a separate geo-IP lookup
- Accuracy metadata is attached based on resolution method (Cloudflare geo-IP is typically city-level accurate)
- GPS coordinates from mobile apps (with consent) take precedence when available

**Step 5: Deduplication Check (< 5ms)**
- Bloom filter check against recent report hashes (device fingerprint + service ID + time window) stored in Cloudflare Workers KV or Durable Objects
- Prevents duplicate submissions from the same device within a configurable window (default: 5 minutes)

**Step 6: Event Forwarding (async)**
- Validated, enriched report events are forwarded to the origin Redpanda cluster via an async HTTP call
- The user receives an immediate acknowledgment after Step 5; forwarding happens asynchronously
- If the origin is temporarily unreachable, events are buffered in Cloudflare Queues (durable message queue) with retry semantics

**Total edge processing time**: < 15ms typical, < 50ms p99
**End-to-end report submission latency (user perspective)**: < 100ms p99 globally

### Static Asset Serving

Beyond report ingestion, the edge tier handles:

- **CDN caching** of static assets (JavaScript, CSS, images) with immutable content hashing
- **Stale-while-revalidate** semantics for dashboard pages, ensuring users see cached content immediately while background revalidation occurs
- **ISR page serving**: Next.js Incremental Static Regeneration pages for service status are served from CDN cache with 10-30 second staleness tolerance

### WebSocket Termination

- WebSocket connections for live dashboard updates are terminated at the edge
- Edge nodes maintain persistent connections to origin WebSocket gateways
- Connection multiplexing reduces the number of connections reaching origin infrastructure
- During surges, edge-level connection limits protect origin infrastructure from connection exhaustion

### DDoS Protection

Cloudflare's built-in DDoS mitigation provides:
- Layer 3/4 attack absorption at the network edge
- Layer 7 rate limiting and challenge pages
- Bot management for sophisticated automated attacks
- This is critical because the platform's traffic pattern (sudden massive surges) resembles a DDoS attack, and the system must distinguish legitimate outage-driven traffic from actual attacks

## Consequences

### Positive

1. **Global sub-100ms latency**: Edge processing eliminates round-trip time to origin. A user in Singapore submits a report that is validated and acknowledged at the Singapore Cloudflare PoP in under 50ms, versus 200-400ms if routed to a US-based origin.

2. **Origin protection**: The edge tier absorbs 80%+ of traffic, including all static asset requests and cached page loads. Origin servers only process validated report events, reducing their load by an order of magnitude during surges.

3. **Surge resilience**: Cloudflare Workers scale automatically to handle any traffic volume. There is no auto-scaling lag, no cold start delay, and no capacity planning required for the edge ingestion tier.

4. **Infrastructure independence**: Edge processing at Cloudflare PoPs operates independently of any single cloud provider. If AWS us-east-1 is experiencing an outage (which may be the very outage users are reporting), the edge ingestion tier continues functioning from 300+ global PoPs.

5. **Reduced data transfer costs**: Geo-enrichment at the edge uses Cloudflare-provided geographic data, eliminating the need for origin-based MaxMind lookups. Deduplication at the edge reduces the volume of events forwarded to origin.

6. **DDoS resilience**: Cloudflare's DDoS mitigation is inherent in the edge deployment, protecting the origin without additional infrastructure.

### Negative

1. **Vendor coupling**: Heavy reliance on Cloudflare Workers for the critical ingestion path. While the logic is portable JavaScript/TypeScript, migration to another edge platform (Fastly Compute, Deno Deploy, AWS CloudFront Functions) requires adaptation.

2. **Edge state limitations**: Cloudflare Workers KV and Durable Objects have eventual consistency semantics. Rate limiting and deduplication at the edge are best-effort rather than perfectly precise. This is acceptable for the use case (slightly relaxed rate limits during cross-PoP propagation delay).

3. **Debugging complexity**: Issues in edge-deployed code are harder to reproduce and debug than origin-deployed code. Cloudflare's logging and tracing capabilities are less mature than origin-based observability stacks.

4. **Cost at extreme scale**: Cloudflare Workers pricing is based on request count. At 500,000 reports/second burst, the per-request cost is nominal but accumulates. The Cloudflare Pro plan ($20/month) plus Workers usage provides strong value, but costs should be monitored during sustained surge events.

5. **Limited compute capabilities**: Edge workers have execution time limits (typically 50ms for free tier, higher for paid) and memory constraints. Complex processing must remain on origin. The edge tier is deliberately limited to validation, enrichment, and forwarding.

6. **Async forwarding risk**: If the origin is unreachable for an extended period, Cloudflare Queues provide durability, but there is a finite buffer. Extremely prolonged origin outages could result in event loss. Monitoring and alerting on queue depth mitigates this.

## Alternatives Considered

### Alternative 1: Origin-Only Processing

All report ingestion is handled by origin API servers behind a simple CDN/load balancer.

**Rejected because:**
- Round-trip latency to origin (100-400ms depending on user location) violates the sub-100ms p99 target
- Origin auto-scaling (Kubernetes HPA) has a 30-60 second lag, insufficient for the sudden 10-100x traffic surges
- No geographic distribution of processing; all load hits a single or dual region
- Origin infrastructure shares cloud provider dependencies with potentially affected services
- However, origin processing remains the fallback: if edge processing fails, clients can submit directly to origin API endpoints

### Alternative 2: Regional Load Balancers with Multi-Region Origin

Deploy origin API servers in 3-5 regions with geographic DNS routing and regional load balancers.

**Rejected because:**
- Still requires auto-scaling at each region, with the same lag problem during surges
- 3-5 regions provide coarse geographic distribution compared to Cloudflare's 300+ PoPs
- Significant infrastructure cost to maintain idle capacity in 5 regions for surge readiness
- Operational complexity of managing identical deployments across multiple regions
- Does not provide the same DDoS resilience as a dedicated edge network

### Alternative 3: Multi-Region Origin with Pre-Provisioned Surge Capacity

Maintain warm standby capacity in multiple regions, pre-scaled for expected surge traffic.

**Rejected because:**
- Extremely expensive: maintaining 50x steady-state capacity across multiple regions for events that occur sporadically (major outages happen a few times per month)
- Capacity planning is inherently inaccurate; the next major outage may exceed any pre-provisioned capacity
- Does not solve the latency problem for geographically distant users
- Wasteful of compute resources during the 99%+ of time when traffic is at steady state
- The edge-first approach provides effectively unlimited surge capacity at pay-per-use pricing

## References

- OpenPulse Research Document, Section 6.1 (Scaling Challenges)
- OpenPulse Research Document, Section 6.2 (Scaling Strategy -- Edge Layer Absorption)
- OpenPulse Research Document, Section 6.3 (Performance Targets)
- OpenPulse Research Document, Section 6.4 (Capacity Planning)
- Downdetector AWS Case Study (Multi-Region Serverless Architecture)
