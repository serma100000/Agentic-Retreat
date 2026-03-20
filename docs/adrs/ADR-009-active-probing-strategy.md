# ADR-009: Distributed Active Probing with Rust Workers on Fly.io Edge

## Status

**Accepted** -- March 2026

## Context

Crowdsourced user reports are the foundational signal for outage detection, but they have inherent limitations:

1. **Reactive latency**: Users must notice a problem, navigate to the platform, and submit a report. For services with smaller user bases or during off-peak hours, this can take minutes.

2. **Noise and bias**: Reports are susceptible to mob effects (viral social media posts triggering "me too" reports), geographic bias (overrepresentation of regions with higher platform adoption), and manipulation (coordinated false reporting).

3. **No baseline measurement**: Reports only indicate "something is wrong" but provide no quantitative measurement of response times, error rates, or partial degradation.

4. **Cannot detect silent failures**: Services that fail in ways users do not immediately notice (e.g., a payment processing service returning incorrect results, a CDN serving stale content) generate no user reports.

Existing platforms illustrate these limitations. Downdetector relies exclusively on crowdsourced reports and social media, with no active probing capability. IsItDownRightNow performs active checks but only from limited geographic locations and only when a user queries a specific service. Uptime Kuma provides self-hosted monitoring but is designed for known endpoints, not platform-scale outage detection.

Active probing provides an independent, objective signal source that complements crowdsourced reports:
- **Speed**: Probes detect failures within seconds, independent of user reporting behavior
- **Objectivity**: Probe results are deterministic measurements, not subjective reports
- **Coverage**: Probes run continuously, detecting off-peak failures that users might not report
- **Quantification**: Probe data provides latency measurements and error classification, not just binary up/down

OpenPulse targets monitoring 15,000 services across 10+ geographic regions with 30-second probe intervals per service per region, producing approximately 5,000 probes/second sustained throughput.

## Decision

We will deploy a **distributed fleet of active probers** running as **Rust workers on Fly.io edge** locations, executing multi-protocol health checks and publishing results to the Redpanda streaming backbone.

### Probe Architecture

**Deployment**: Lightweight Rust worker processes deployed on Fly.io in 10+ geographic regions:
- North America (US-East, US-West, Canada)
- Europe (London, Frankfurt, Amsterdam)
- Asia-Pacific (Tokyo, Singapore, Sydney)
- South America (Sao Paulo)
- Additional regions added based on user demand and service coverage

Each region runs 2-3 worker instances for redundancy. Workers are stateless and pull their probe schedules from a central coordination service.

**Why Fly.io**: Fly.io provides lightweight, globally distributed compute with sub-second cold start. Probers benefit from Fly.io's Anycast networking and geographic distribution without the overhead of managing full Kubernetes clusters in 10+ regions. The always-on cost for probe workers across 10 regions is approximately $500/month, far less than running dedicated instances in 10 cloud provider regions.

### Protocol Support

Each probe supports multiple health check protocols:

| Protocol | Check Type | What It Detects | Latency |
|----------|-----------|-----------------|---------|
| **HTTP/HTTPS** | Full request with status code, headers, body validation | Service availability, response errors, content serving issues | 50-2000ms |
| **DNS** | Resolution of service domain from multiple resolvers | DNS infrastructure failures, propagation issues, hijacking | 10-200ms |
| **TCP** | Connection establishment to service ports | Network-level reachability, firewall issues, port closures | 10-500ms |
| **ICMP** | Ping/traceroute to service IP addresses | Network path issues, routing problems | 10-100ms |
| **TLS** | Certificate validation, expiry check, chain verification | Certificate expiry (precursor to outages), misconfiguration | 50-500ms |

**Why Rust**: The probing workers must execute thousands of concurrent network operations with predictable latency. Rust's async runtime (Tokio) provides efficient non-blocking I/O. Rust's zero-cost abstractions and absence of garbage collection pauses ensure that probe timing measurements are accurate (GC pauses in Java/Node.js would introduce measurement noise). Raw socket access for ICMP and TCP probes is more ergonomic in Rust than in higher-level languages.

### Probe Configuration

Each monitored service has a probe configuration defining:

```yaml
service: github.com
probes:
  - protocol: https
    url: https://github.com
    method: GET
    expected_status: [200]
    timeout_ms: 5000
    interval_sec: 30
    regions: all

  - protocol: dns
    domain: github.com
    record_type: A
    resolvers: [8.8.8.8, 1.1.1.1, system]
    timeout_ms: 2000
    interval_sec: 60
    regions: all

  - protocol: tls
    host: github.com
    port: 443
    warn_expiry_days: 14
    interval_sec: 300
    regions: [us-east, eu-west]

  - protocol: tcp
    host: github.com
    port: 443
    timeout_ms: 3000
    interval_sec: 60
    regions: all
```

### Adaptive Probing

During suspected or confirmed outages (when the Detection Consensus Engine transitions a service to INVESTIGATING or higher), probe behavior adapts:

- **Increased frequency**: Probe interval reduces from 30 seconds to 5 seconds for the affected service
- **Expanded regions**: Probes activate in all available regions, not just the configured subset
- **Additional protocols**: If only HTTP probing is configured, DNS and TCP probes are automatically added during investigation
- **Traceroute activation**: Network path tracing is triggered to identify the failure point

This adaptive behavior is triggered by consuming `detections` events from the Redpanda backbone. The probe coordination service updates worker schedules in real time.

### Probe Result Processing

Each probe result is published to the `probes` Kafka topic with:

- Service ID
- Region
- Protocol
- Timestamp (with nanosecond precision for latency accuracy)
- Status (success/failure/timeout/degraded)
- Latency (milliseconds)
- HTTP status code (for HTTP probes)
- DNS resolution time and resolved addresses (for DNS probes)
- TLS certificate details and expiry (for TLS probes)
- Error classification (connection refused, timeout, DNS NXDOMAIN, TLS expired, etc.)

The Detection Engine consumes these results alongside report data for multi-signal anomaly detection (ADR-002).

### Probe Scheduling

- **Jittered intervals**: Probes are jittered within their interval window to avoid synchronized bursts (e.g., all 15,000 services probed at exactly the same second)
- **Priority scheduling**: Higher-tier services (major cloud providers, social media platforms) receive more frequent probing
- **Backoff**: Services consistently returning healthy results may have their probe frequency reduced during low-activity periods to conserve resources
- **Load balancing**: Probe assignments are distributed across workers in each region using consistent hashing, with automatic rebalancing when workers join or leave

### Ethical Probing

- **robots.txt compliance**: HTTP probes respect robots.txt directives
- **Rate limiting**: No more than 2 requests per minute per service per region to avoid being perceived as abusive
- **User-Agent identification**: Probes identify themselves via User-Agent header: `OpenPulse-Prober/1.0 (+https://openpulse.io/about/probing)`
- **Opt-out mechanism**: Service operators can request their service be removed from active probing via a documented process
- **Non-destructive**: Probes only perform read operations (GET requests, DNS lookups); no write operations that could affect service state

## Consequences

### Positive

1. **Objective measurements**: Probe data provides quantitative, verifiable latency and availability measurements that complement the subjective nature of user reports.

2. **Faster detection**: Probes detect failures within seconds (probe interval + processing latency), independent of user reporting behavior. For services with few users or during off-peak hours, probes may be the first signal.

3. **Geographic precision**: Probes from 10+ regions enable distinguishing between regional and global outages. If US-East probes fail but EU probes succeed, the outage is localized to a specific region.

4. **Precursor detection**: Increasing probe latency trends often precede full outages. This data feeds the Layer 4 predictive model (ADR-002), enabling proactive alerting.

5. **Baseline establishment**: Continuous probe data provides a quantitative baseline for each service's normal response time, enabling detection of performance degradations that would not trigger user reports.

6. **Independent signal**: Probe results are immune to the mob effects and manipulation that affect crowdsourced reports, strengthening multi-signal consensus (ADR-005).

7. **Low infrastructure cost**: Fly.io edge deployment at approximately $500/month for 10 regions is dramatically cheaper than running dedicated monitoring infrastructure in each region.

### Negative

1. **Limited to configured services**: Unlike crowdsourced reports that can cover any service, probes only monitor services explicitly configured in the service catalog. Long-tail service coverage depends on community contributions to the catalog.

2. **Surface-level checks**: Probes verify that a service's public endpoint responds, but cannot detect internal degradations (e.g., a social media service that loads but does not display new content, or a payment service that accepts requests but fails to process them).

3. **Potential for being blocked**: Services may block probe traffic via IP blocklists or rate limiting. IP rotation and cooperative relationships with service operators mitigate this, but some services will inevitably block probing.

4. **Ethical considerations**: Continuously probing third-party services raises ethical questions about consent and resource consumption. The ethical probing guidelines (robots.txt compliance, User-Agent identification, opt-out mechanism) address these concerns but may not satisfy all service operators.

5. **Network path dependency**: Probes measure the network path from Fly.io edge locations to services. These paths may differ from end-user paths, meaning a service could appear healthy from probe perspectives while users on specific ISPs experience failures.

6. **Fly.io dependency**: The probing fleet depends on Fly.io's infrastructure availability. If Fly.io experiences an outage, probing capability is degraded. Multi-provider probe deployment (Fly.io + Cloudflare Workers + backup cloud instances) may be added as a future mitigation.

## Alternatives Considered

### Alternative 1: Synthetic Monitoring SaaS (Datadog, Pingdom, UptimeRobot)

Use a commercial synthetic monitoring service for active probing.

**Rejected because:**
- Vendor lock-in conflicts with the open-source, self-hostable philosophy
- Cost at scale: monitoring 15,000 services at 30-second intervals from 10 regions exceeds the pricing tiers of most commercial monitoring services (typically $10,000-50,000+/month)
- Cannot customize probe behavior, adaptive frequency, or protocol support
- Data remains proprietary to the monitoring provider
- However, integrations with these services may be offered for organizations that prefer managed monitoring alongside OpenPulse

### Alternative 2: Centralized Probing from Origin Infrastructure

Run probers on the same Kubernetes cluster as core services, probing from a single cloud region.

**Rejected because:**
- Single geographic vantage point cannot distinguish between regional and global outages
- Probing from a single cloud provider's region creates a dependency: if that region experiences issues, both the probing infrastructure and potentially the monitored services are affected simultaneously
- Network paths from a single origin do not represent the diversity of end-user network paths
- Does not provide the geographic precision that multi-region probing enables

### Alternative 3: Browser-Based Probing (Real User Monitoring Approach)

Embed a JavaScript snippet in the OpenPulse web app that performs probe-like checks from users' browsers.

**Rejected because:**
- Privacy concerns: executing network requests from users' browsers to third-party services raises consent and data collection issues
- Unreliable: browser-based probing is blocked by CORS, mixed-content policies, and browser security restrictions for many check types (DNS, TCP, ICMP are impossible from browsers)
- Availability dependent on user traffic: during off-peak hours when fewer users visit the platform, probe coverage drops precisely when it is most needed
- Measurement noise: user network conditions (WiFi quality, ISP issues, VPNs) introduce noise that degrades probe accuracy
- However, a lightweight client-side connectivity check (testing the user's own connection) may be offered optionally to help users distinguish "is it me or is it the service?"

## References

- OpenPulse Research Document, Section 3.3 (Service Decomposition -- Active Probing Context)
- OpenPulse Research Document, Section 5.1 (Data Ingestion Pipeline)
- OpenPulse Research Document, Section 6.4 (Capacity Planning -- Active Probes)
- OpenPulse Research Document, Section 4.1 (Technology Stack -- Active Probing: Rust workers on Fly.io)
- OpenPulse Research Document, Section 2.3 (IsItDownRightNow -- Active Check Approach)
- OpenPulse Research Document, Section 2.4 (Uptime Kuma -- Self-Hosted Monitoring)
