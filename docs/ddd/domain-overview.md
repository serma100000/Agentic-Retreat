# OpenPulse Domain Overview

## Domain Classification

### Core Domain: Outage Detection

The Detection Engine is the primary competitive advantage of OpenPulse. It implements
multi-signal fusion, multi-layer anomaly detection (statistical, CUSUM, LSTM, XGBoost),
and a state machine that produces high-confidence outage determinations. This is the
domain where OpenPulse differentiates itself from all competitors and where the most
investment in modeling accuracy should be directed.

### Supporting Domains

These domains feed signals into the core domain or provide essential functionality
that enables detection but are not themselves the competitive differentiator.

- **Report Ingestion** - Intake, validation, deduplication, and geo-enrichment of
  crowdsourced user reports. Produces the primary signal stream consumed by detection.
- **Active Probing** - Distributed fleet of health check probes executing HTTP, DNS,
  TCP, ICMP, and TLS checks from globally distributed vantage points. Produces
  objective, machine-generated signal data.
- **Social Intelligence** - NLP pipeline monitoring Twitter/X, Reddit, Mastodon, and
  Bluesky for outage-related posts. Produces sentiment and mention-rate signals.
- **Status Page Aggregation** - Scrapes and normalizes official provider status pages.
  Produces authoritative (but often delayed) status signals.

### Generic Domains

Standard infrastructure concerns that are important but not unique to outage detection.

- **Notification** - Multi-channel alert dispatch (email, SMS, push, webhook, Slack,
  Discord, Teams, PagerDuty).
- **API Gateway** - REST v1, GraphQL, WebSocket APIs with authentication and rate limiting.
- **User Management** - Accounts, preferences, API keys, OAuth integration.
- **Visualization** - Dashboards, outage maps, time-series charts, and analytics.

---

## Context Map

```
+------------------+     +-------------------+     +--------------------+
|                  |     |                   |     |                    |
| Report Ingestion |---->|                   |<----| Active Probing     |
|                  |     |                   |     |                    |
+------------------+     |                   |     +--------------------+
                         |    DETECTION      |
+------------------+     |    ENGINE         |     +--------------------+
|                  |     |    (Core)         |     |                    |
| Social           |---->|                   |---->| Notification       |
| Intelligence     |     |                   |     |                    |
+------------------+     |                   |     +--------------------+
                         |                   |
+------------------+     |                   |     +--------------------+
|                  |     |                   |     |                    |
| Status Page      |---->|                   |---->| API Gateway        |
| Aggregation      |     |                   |     | (Query/Subscribe)  |
+------------------+     +--------+----------+     +--------------------+
                                  |
                                  v
                         +--------+----------+
                         |                   |
                         | Service Catalog   |
                         | (Reference Data)  |
                         |                   |
                         +-------------------+
```

### Relationship Types

| Upstream | Downstream | Relationship |
|----------|------------|--------------|
| Report Ingestion | Detection Engine | Published Language (events on Kafka) |
| Active Probing | Detection Engine | Published Language (events on Kafka) |
| Social Intelligence | Detection Engine | Published Language (events on Kafka) |
| Status Page Aggregation | Detection Engine | Published Language (events on Kafka) |
| Detection Engine | Notification | Published Language (events on Kafka) |
| Detection Engine | API Gateway | Open Host Service / Published Language |
| Service Catalog | All Contexts | Shared Kernel (service registry reference data) |
| Edge/CDN | Report Ingestion | Anti-Corruption Layer (edge gateway translation) |
| External Social APIs | Social Intelligence | Anti-Corruption Layer (API adapters) |
| External Status Pages | Status Page Aggregation | Anti-Corruption Layer (scraper/parser) |

### Integration Patterns

- **Event Streaming**: All inter-context communication uses Kafka/Redpanda topics
  as the primary integration backbone. Contexts publish domain events and subscribe
  to events from other contexts.
- **Shared Kernel**: The Service Catalog provides reference data (service IDs, slugs,
  categories) used by all contexts. Changes are versioned and backward-compatible.
- **Anti-Corruption Layers**: External systems (social APIs, status pages, CDN/edge)
  are isolated behind translation layers that convert external models into internal
  domain models.

---

## Ubiquitous Language Glossary

| Term | Definition |
|------|------------|
| **Report** | A user-submitted signal indicating a service is experiencing issues. Contains service ID, report type, timestamp, and approximate location. |
| **Outage** | A confirmed disruption to a monitored service, determined by the Detection Engine after multi-signal consensus. Has a lifecycle from detection through resolution. |
| **Signal** | Any input data point consumed by the Detection Engine: a report, probe result, social mention, or status page update. |
| **Confidence Score** | A value between 0.0 and 1.0 representing the Detection Engine's certainty that an outage is occurring, derived from Bayesian fusion of all available signals. |
| **Detection Event** | An event emitted by the Detection Engine when it determines a state change has occurred for a monitored service. |
| **Probe** | An active health check executed against a service endpoint from a specific vantage point. Types include HTTP, DNS, TCP, ICMP, and TLS. |
| **Vantage Point** | A geographic location from which probes are executed. OpenPulse targets 10+ globally distributed regions. |
| **Service** | A monitored internet service or platform (e.g., "AWS us-east-1", "Gmail", "Discord"). Identified by a unique slug. |
| **Service Slug** | A URL-safe unique identifier for a monitored service (e.g., `aws-us-east-1`, `gmail`, `discord`). |
| **Anomaly Score** | A numeric measure of how far a signal deviates from its expected baseline. Higher scores indicate stronger anomaly evidence. |
| **Outage State** | The current lifecycle phase of an outage: OPERATIONAL, INVESTIGATING, DEGRADED, MAJOR_OUTAGE, RECOVERING, or RESOLVED. |
| **State Transition** | A change from one outage state to another, governed by transition rules and hysteresis requirements. |
| **Hysteresis** | A sustained signal change threshold required before a state transition is permitted, preventing rapid flapping between states. |
| **Device Fingerprint** | A one-way hashed identifier derived from device characteristics, used for anti-abuse detection. Stored with a 24-hour TTL. |
| **IP Reputation** | A score assigned to an IP address based on known VPN/proxy status and historical behavior, used to weight report credibility. |
| **Report Type** | The classification of a user report: outage, degraded, or operational. |
| **Signal Weight** | The relative importance assigned to a signal source when computing consensus confidence scores. |
| **Detection Layer** | One of the four anomaly detection algorithms: statistical threshold, CUSUM change-point, LSTM autoencoder, or XGBoost predictive. |
| **Consensus Engine** | The component that fuses outputs from all detection layers into a unified outage state using weighted Bayesian inference. |
| **Surge** | A rapid increase in report volume or concurrent users, typically triggered by a major outage event. |
| **Canary Service** | A fictional service monitored to detect automated reporting tools and manipulation attempts. |
| **Proof-of-Work** | A lightweight computational challenge required for anonymous report submission, preventing automated mass reporting. |
| **Mention** | A social media post identified as referencing a monitored service in an outage-related context. |
| **Urgency Score** | A numeric estimate of outage severity derived from language intensity and specificity in social media posts. |
