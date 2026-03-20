# Bounded Context: Service Catalog

## Purpose

The Service Catalog context maintains the registry of all monitored internet services,
their metadata, endpoints, dependencies, and categorization taxonomy. It serves as the
shared reference data consumed by every other bounded context. The catalog supports
community contribution via pull requests for adding new services.

---

## Aggregate: MonitoredService

The MonitoredService aggregate is the central registry entry for a service being
monitored by OpenPulse.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  MonitoredService                         |
|---------------------------------------------------------------|
|  id: ServiceId (UUID)                                         |
|  slug: ServiceSlug                                            |
|  name: string                                                 |
|  description: string                                          |
|  category: ServiceCategory                                    |
|  tier: ServiceTier                                            |
|  healthStatus: HealthStatus                                   |
|  endpoints: List<ServiceEndpoint>                             |
|  dependencies: List<ServiceDependency>                        |
|  logoUrl: string                                              |
|  websiteUrl: string                                           |
|  statusPageUrl: string | null                                 |
|  createdAt: Timestamp                                         |
|  updatedAt: Timestamp                                         |
|---------------------------------------------------------------|
|  register(command) -> ServiceRegistered                       |
|  update(command) -> ServiceUpdated                            |
|  deprecate(reason) -> ServiceDeprecated                       |
|  addEndpoint(endpoint) -> void                                |
|  addDependency(dep) -> void                                   |
|  updateHealth(status) -> void                                 |
+---------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+----------------+  +-------------------+  +-------------------+
| ServiceEndpoint|  | ServiceDependency |  | ServiceCategory   |
|----------------|  |-------------------|  |-------------------|
| id: EndpointId |  | dependsOn:        |  | id: CategoryId    |
| url: string    |  |   ServiceId       |  | name: string      |
| probeType:     |  | type: HARD | SOFT |  | slug: string      |
|   ProbeType    |  | description:      |  | parent:           |
| region: Geo    |  |   string          |  |   CategoryId|null |
|   Region|null  |  +-------------------+  | taxonomy:         |
| expectedStatus:|                         |   CategoryTaxonomy|
|   int | null   |                         +-------------------+
+----------------+
```

## Aggregate: ServiceCategory

The ServiceCategory aggregate manages the hierarchical taxonomy for classifying
monitored services.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  ServiceCategory                          |
|---------------------------------------------------------------|
|  id: CategoryId                                               |
|  name: string                                                 |
|  slug: string                                                 |
|  parent: CategoryId | null                                    |
|  children: List<CategoryId>                                   |
|  serviceCount: int                                            |
|---------------------------------------------------------------|
|  create(name, parent) -> void                                 |
|  rename(name) -> void                                         |
|  reparent(newParent) -> void                                  |
+---------------------------------------------------------------+
```

### Entities

| Entity | Description |
|--------|-------------|
| **MonitoredService** | Aggregate root. The primary registry entry for a monitored service. |
| **ServiceEndpoint** | A specific URL or host that the Active Probing context checks. A service may have multiple endpoints. |
| **ServiceDependency** | A declared dependency between two services (e.g., Slack depends on AWS). Used for cascade analysis. |
| **ServiceCategory** | Aggregate root. A node in the hierarchical service taxonomy. |

### Value Objects

| Value Object | Description |
|--------------|-------------|
| **ServiceSlug** | URL-safe unique identifier (e.g., `aws-us-east-1`, `gmail`, `discord`). Immutable after creation. |
| **ServiceTier** | Enum: `TIER_1` (top 100, critical infrastructure), `TIER_2` (top 1000), `TIER_3` (long tail). Determines probe frequency and detection sensitivity. |
| **CategoryTaxonomy** | Hierarchical path string (e.g., `cloud/iaas`, `social/messaging`, `gaming/mmo`). |
| **HealthStatus** | Enum: `HEALTHY`, `DEGRADED`, `OUTAGE`, `UNKNOWN`. Current status as determined by the Detection Engine. |

---

## Category Taxonomy

```
Services
  +-- Cloud Providers
  |     +-- IaaS (AWS, GCP, Azure)
  |     +-- PaaS (Heroku, Vercel, Netlify)
  |     +-- SaaS (Salesforce, Workday)
  +-- Social Media
  |     +-- Messaging (WhatsApp, Telegram, Signal)
  |     +-- Networks (Facebook, Instagram, Twitter/X)
  |     +-- Video (YouTube, TikTok)
  +-- Gaming
  |     +-- Platforms (Steam, Xbox Live, PSN)
  |     +-- MMO (WoW, FF14)
  +-- Streaming
  |     +-- Video (Netflix, Disney+, Hulu)
  |     +-- Music (Spotify, Apple Music)
  +-- Financial
  |     +-- Banking (Chase, BoA)
  |     +-- Payments (Stripe, PayPal, Square)
  |     +-- Crypto (Coinbase, Binance)
  +-- ISP / Telecom
  |     +-- Broadband (Comcast, AT&T, Verizon)
  |     +-- Mobile (T-Mobile, Vodafone)
  +-- Productivity
  |     +-- Email (Gmail, Outlook)
  |     +-- Collaboration (Slack, Teams, Zoom)
  +-- Developer Tools
        +-- Code Hosting (GitHub, GitLab)
        +-- CI/CD (CircleCI, Actions)
        +-- Registry (npm, Docker Hub)
```

---

## Domain Events

| Event | Payload | Trigger |
|-------|---------|---------|
| **ServiceRegistered** | serviceId, slug, name, category, tier, endpoints | New service added to the catalog |
| **ServiceUpdated** | serviceId, changedFields | Service metadata modified |
| **ServiceDeprecated** | serviceId, reason, deprecatedAt | Service removed from active monitoring |

---

## Community Contribution Workflow

```
Contributor submits PR to service-catalog repo
        |
        v
  Automated validation:
    - Slug uniqueness check
    - Endpoint reachability test
    - Category exists in taxonomy
    - Required fields present
        |
        v
  Community maintainer review
        |
        +---> Approved ---> Merged ---> ServiceRegistered event
        |
        +---> Changes requested ---> Contributor updates PR
        |
        +---> Rejected ---> PR closed with explanation
```

Services are defined as YAML files in the catalog repository:

```yaml
slug: discord
name: Discord
description: Voice, video, and text communication platform
category: social/messaging
tier: TIER_1
website: https://discord.com
status_page: https://discordstatus.com
endpoints:
  - url: https://discord.com
    probe_type: HTTP
    expected_status: 200
  - url: https://gateway.discord.gg
    probe_type: TCP
    region: global
dependencies:
  - service: gcp
    type: HARD
  - service: cloudflare
    type: SOFT
```

---

## Integration Points

| Direction | Context | Mechanism | Data |
|-----------|---------|-----------|------|
| **Downstream** | All Contexts | Cached read API / Shared Kernel | Service metadata, slugs, endpoints, categories |
| **Upstream** | Detection Engine | Kafka topic `detections.outages` | Health status updates |
| **External** | GitHub Repository | Git-based workflow | Community service contributions |

---

## Invariants

1. ServiceSlug MUST be unique across the entire catalog and immutable after creation.
2. Every service MUST belong to exactly one category in the taxonomy.
3. Every service MUST have at least one probe endpoint defined.
4. ServiceTier MUST be assigned and determines monitoring intensity.
5. Dependency cycles MUST be detected and rejected.
6. Health status updates MUST only come from the Detection Engine, not from external sources.
