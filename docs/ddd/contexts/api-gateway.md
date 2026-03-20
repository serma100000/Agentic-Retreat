# Bounded Context: API and Query Gateway

## Purpose

The API Gateway context serves as the public interface for all external consumers of
OpenPulse data. It exposes REST, GraphQL, and WebSocket APIs with authentication,
authorization, rate limiting, and query optimization. This is a generic domain --
the gateway infrastructure is standard API management, not unique to outage detection.

---

## REST API v1

### Endpoints

```
GET  /api/v1/services                     List monitored services
GET  /api/v1/services/{slug}/status       Current status with confidence score
GET  /api/v1/services/{slug}/reports      Report time-series data
GET  /api/v1/services/{slug}/history      Historical outage data
POST /api/v1/reports                      Submit an outage report
GET  /api/v1/outages/active               All currently active outages
GET  /api/v1/outages/{id}                 Outage detail with timeline
GET  /api/v1/map/reports                  Geo-aggregated report data for map
WS   /api/v1/stream                       WebSocket for real-time updates
```

### Request/Response Pattern

```
Client Request
     |
     v
+------------------+
| Edge / CDN       |  Static responses served from cache
| (Cloudflare)     |  Rate limiting (per-IP)
+--------+---------+
         |
         v
+------------------+
| API Gateway      |  Authentication, authorization
| (Kong)           |  Rate limiting (per-API-key)
+--------+---------+  Request/response transformation
         |
         v
+------------------+
| Route Handler    |  Input validation (JSON Schema)
| (Fastify)        |  Query parameter parsing
+--------+---------+
         |
    +----+----+
    |         |
    v         v
 [Read]    [Write]
 (CQRS)    (CQRS)
    |         |
    v         v
 Redis     Kafka
 Cache     Producer
 / DB      (reports topic)
```

### Response Format

All REST responses follow a consistent envelope:

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-03-20T12:00:00Z",
    "requestId": "uuid",
    "rateLimit": {
      "remaining": 95,
      "limit": 100,
      "resetAt": "2026-03-20T12:01:00Z"
    }
  }
}
```

Error responses:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded",
    "retryAfter": 60
  },
  "meta": { ... }
}
```

---

## GraphQL Schema Overview

```graphql
type Query {
  service(slug: String!): Service
  services(category: String, limit: Int): [Service!]!
  outage(id: ID!): Outage
  activeOutages(severity: Severity): [Outage!]!
  reportTimeSeries(
    serviceSlug: String!
    from: DateTime!
    to: DateTime!
    granularity: Granularity
  ): [TimeSeriesPoint!]!
}

type Mutation {
  submitReport(input: ReportInput!): ReportResult!
}

type Subscription {
  outageUpdated(serviceSlug: String): OutageEvent!
  serviceStatusChanged(serviceSlug: String): StatusEvent!
}

type Service {
  id: ID!
  slug: String!
  name: String!
  category: Category!
  status: ServiceStatus!
  confidence: Float!
  activeOutage: Outage
  endpoints: [Endpoint!]!
}

type Outage {
  id: ID!
  service: Service!
  state: OutageState!
  confidence: Float!
  detectedAt: DateTime!
  resolvedAt: DateTime
  timeline: [StateTransition!]!
  affectedRegions: [GeoRegion!]!
}

enum OutageState {
  OPERATIONAL
  INVESTIGATING
  DEGRADED
  MAJOR_OUTAGE
  RECOVERING
  RESOLVED
}
```

---

## WebSocket Subscription Model

Clients connect to `WS /api/v1/stream` and subscribe to channels:

```
Client connects
     |
     v
  Authenticate (API key or OAuth token in handshake)
     |
     v
  Subscribe to channels:
     +---> "outages:*"              All outage events
     +---> "outages:{serviceSlug}"  Events for a specific service
     +---> "reports:{serviceSlug}"  Live report counts
     +---> "map:global"             Geo-aggregated report stream
     |
     v
  Receive differential updates as JSON messages:
  {
    "channel": "outages:discord",
    "event": "state_changed",
    "data": {
      "outageId": "uuid",
      "state": "DEGRADED",
      "confidence": 0.82,
      "timestamp": "2026-03-20T12:05:00Z"
    }
  }
```

### WebSocket Infrastructure

```
+----------+  +----------+  +----------+
| Client A |  | Client B |  | Client C |
+----+-----+  +----+-----+  +----+-----+
     |             |             |
     v             v             v
+----+-------------+-------------+------+
|        WebSocket Gateway Cluster      |
|  (Multiple instances behind LB)       |
+-------------------+-------------------+
                    |
                    v
          +---------+---------+
          | Redis Pub/Sub     |  Backplane for multi-instance
          | (fan-out)         |  message distribution
          +---------+---------+
                    |
                    v
          +---------+---------+
          | Kafka Consumer    |  Reads from detections.outages
          | (bridge)          |  and publishes to Redis Pub/Sub
          +-------------------+
```

Target: 5,000,000 concurrent WebSocket connections distributed across 50+ edge nodes.

---

## Authentication

| Method | Use Case | Details |
|--------|----------|---------|
| **API Key** | Machine-to-machine API access | Passed via `X-API-Key` header. Scoped to specific endpoints and rate tiers. |
| **OAuth 2.0** | Third-party integrations, user-facing apps | PKCE flow for SPAs and mobile. Scopes: `read:services`, `read:outages`, `write:reports`, `manage:subscriptions`. |
| **WebAuthn / Passkeys** | User account authentication | Passwordless authentication for the web dashboard. No password-based auth supported. |
| **Anonymous** | Report submission, public read endpoints | No authentication required. Subject to stricter rate limits and proof-of-work for writes. |

---

## Rate Limiting Tiers

Rate limiting uses token bucket algorithm applied at three levels:

| Tier | Scope | Read Limit | Write Limit | Burst |
|------|-------|------------|-------------|-------|
| **Anonymous** | Per-IP | 60 req/min | 10 reports/min | 2x |
| **Free API Key** | Per-Key | 300 req/min | 30 reports/min | 3x |
| **Team Plan** | Per-Key | 3,000 req/min | 300 reports/min | 5x |
| **Enterprise** | Per-Key | 30,000 req/min | 3,000 reports/min | 10x |
| **Per-Device** | Per-Fingerprint | N/A | 20 reports/hour | 1x |

During confirmed major outages, anonymous and free-tier read limits are temporarily
relaxed by 2x to accommodate legitimate surge traffic.

---

## Integration Points

| Direction | Context | Mechanism | Data |
|-----------|---------|-----------|------|
| **Upstream** | Detection Engine | Kafka consumer / cached query | Outage states, confidence scores |
| **Upstream** | Service Catalog | Cached read | Service metadata |
| **Upstream** | Report Ingestion | Kafka producer (for POST /reports) | New report commands |
| **Internal** | User Management | Database query | API keys, OAuth tokens, user accounts |
| **Downstream** | Clients | REST / GraphQL / WebSocket | Outage data, real-time updates |

---

## CQRS Implementation

The API Gateway implements Command Query Responsibility Segregation:

- **Write Path**: `POST /reports` and GraphQL mutations produce commands published
  to Kafka topics. The response is an acknowledgment, not the processed result.
- **Read Path**: All GET endpoints and GraphQL queries read from pre-materialized
  views in Redis (hot data) or TimescaleDB/ClickHouse (historical data).
- **Real-Time Path**: WebSocket subscriptions consume from Redis Pub/Sub, which
  is fed by a Kafka-to-Redis bridge consumer.

---

## Invariants

1. All write operations MUST require authentication (API key or OAuth token).
2. Public read endpoints MUST be cacheable at the CDN layer.
3. Rate limits MUST be enforced at both the edge and gateway layers.
4. WebSocket connections MUST be authenticated during the handshake.
5. API responses MUST include rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`).
6. GraphQL queries MUST enforce depth and complexity limits to prevent abuse.
