# Bounded Context: Report Ingestion

## Purpose

The Report Ingestion context handles the intake, validation, deduplication, and
geo-enrichment of crowdsourced outage reports submitted by end users. It is the
primary interface between the public internet and the detection pipeline, responsible
for transforming raw, untrusted user input into validated signal data suitable for
anomaly detection.

---

## Aggregate: Report

The Report aggregate is the central consistency boundary. Each report is independently
validated and enriched before being published as a domain event.

```
+-------------------------------------------------------+
|  <<Aggregate Root>>  OutageReport                     |
|-------------------------------------------------------|
|  id: ReportId (UUID)                                  |
|  serviceId: ServiceId                                 |
|  reportType: ReportType                               |
|  geoLocation: GeoCoordinates                          |
|  deviceFingerprint: DeviceHash                        |
|  ipReputation: IPReputation                           |
|  validation: ReportValidation                         |
|  submittedAt: Timestamp                               |
|-------------------------------------------------------|
|  submit(command) -> ReportSubmitted                   |
|  validate() -> ReportValidated | ReportRejected       |
|  enrichGeo(resolver) -> void                          |
|  checkDuplicate(store) -> DuplicateDetected | null    |
+-------------------------------------------------------+
         |                      |
         v                      v
+------------------+  +---------------------+
| ReportValidation |  | DeviceFingerprint   |
|------------------|  |---------------------|
| isValid: bool    |  | hash: DeviceHash    |
| rejectReason?    |  | firstSeen: Timestamp|
| proofOfWork: bool|  | reportCount: int    |
| rateCheck: bool  |  | reputation: float   |
| botScore: float  |  +---------------------+
+------------------+
```

### Entities

| Entity | Description |
|--------|-------------|
| **OutageReport** | Aggregate root. Represents a single user-submitted report with all enrichment data attached. |
| **ReportValidation** | Tracks the outcome of all validation checks (proof-of-work, rate limit, bot score, temporal pattern). |
| **DeviceFingerprint** | Represents a hashed device identity used for anti-abuse tracking. Linked to report history. |

### Value Objects

| Value Object | Description |
|--------------|-------------|
| **GeoCoordinates** | Latitude/longitude pair with accuracy metadata and resolution method (GPS, IP, user-provided). |
| **ReportType** | Enum: `OUTAGE`, `DEGRADED`, `OPERATIONAL`. Classifies the nature of the user report. |
| **DeviceHash** | One-way hash of device characteristics. Immutable, 24-hour TTL. |
| **IPReputation** | Score (0.0-1.0) derived from VPN/proxy detection, historical behavior, and known bad IP ranges. |
| **ReportId** | UUID identifier for a report. |
| **ServiceId** | Reference to a service in the Service Catalog context. |

---

## Domain Events

```
OutageReport submitted
        |
        v
  +-- validate() --+
  |                 |
  v                 v
ReportValidated   ReportRejected
  |                 (reason: string)
  v
checkDuplicate()
  |         |
  v         v
(unique)  DuplicateDetected
  |
  v
Published to Kafka topic: "reports.validated"
```

| Event | Payload | Trigger |
|-------|---------|---------|
| **ReportSubmitted** | reportId, serviceId, reportType, geo, timestamp | User submits a report via edge endpoint |
| **ReportValidated** | reportId, serviceId, reportType, geo, ipReputation, deviceHash | All validation checks pass |
| **ReportRejected** | reportId, reason (bot_detected, rate_limited, invalid_pow, invalid_service) | Any validation check fails |
| **DuplicateDetected** | reportId, originalReportId, deviceHash | Same device reports same service within dedup window |

---

## Anti-Corruption Layers

### Edge Gateway Translation

The edge layer (Cloudflare Workers) receives raw HTTP requests from browsers and
mobile apps. The ACL translates these into internal Report commands:

```
External (Edge)                    Internal (Report Ingestion)
+-----------------------+          +---------------------------+
| POST /report          |   ACL    | SubmitReportCommand       |
| {                     |  ----->  | {                         |
|   service: "gmail",   |          |   serviceId: UUID,        |
|   type: "down",       |          |   reportType: OUTAGE,     |
|   lat: 40.7, lng:-74  |          |   geo: GeoCoordinates,    |
| }                     |          |   deviceHash: DeviceHash, |
| Headers: User-Agent,  |          |   ipReputation: Score,    |
|   CF-IPCountry, ...   |          |   proofOfWork: Token      |
+-----------------------+          | }                         |
                                   +---------------------------+
```

The edge layer performs:
- Slug-to-UUID resolution for service identifiers
- Geo-IP resolution via MaxMind/Cloudflare headers
- Device fingerprint computation and hashing
- Proof-of-work token validation
- Initial rate limiting (per-IP: 10 reports/minute)

### Rate Limiter

Multi-tier rate limiting acts as a protective boundary:
- Per-IP: 10 reports/minute (edge-enforced)
- Per-device: 20 reports/hour (application-enforced)
- Per-service: adaptive ceiling during confirmed outages
- Global: circuit breaker at 500,000 reports/second

---

## Integration Points

| Direction | Context | Mechanism | Data |
|-----------|---------|-----------|------|
| **Upstream** | Edge/CDN | HTTP POST via ACL | Raw report requests |
| **Downstream** | Detection Engine | Kafka topic `reports.validated` | Validated report events |
| **Reference** | Service Catalog | Synchronous lookup (cached) | Service ID resolution |
| **Downstream** | Analytics (ClickHouse) | Kafka topic `reports.raw` | All reports for historical analysis |

---

## Invariants

1. A report MUST reference a valid service in the Service Catalog.
2. A report MUST pass proof-of-work validation if submitted anonymously.
3. A device MUST NOT exceed the per-device rate limit within the dedup window.
4. IP addresses MUST NOT be persisted beyond the validation pipeline.
5. Device fingerprints MUST be one-way hashed before storage.
6. Geo-coordinates MUST be truncated to city-level precision before downstream publication.
