# Bounded Context: Active Probing

## Purpose

The Active Probing context manages a globally distributed fleet of health check probes
that execute HTTP, DNS, TCP, ICMP, and TLS checks against monitored service endpoints.
Unlike crowdsourced reports which are reactive, probes provide objective, machine-generated
signal data on a continuous schedule. Probes run from 10+ geographically distributed
vantage points, enabling detection of regional outages and latency degradation.

---

## Aggregate: ProbeFleet

The ProbeFleet aggregate manages the collection of probes assigned to a set of
vantage points and their scheduling configuration.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  ProbeFleet                               |
|---------------------------------------------------------------|
|  id: FleetId                                                  |
|  region: GeoRegion                                            |
|  vantagePoints: List<VantagePoint>                            |
|  targets: List<ProbeTarget>                                   |
|  schedule: ScheduleConfig                                     |
|  status: FleetStatus                                          |
|---------------------------------------------------------------|
|  addTarget(target) -> void                                    |
|  removeTarget(targetId) -> void                               |
|  adjustSchedule(config) -> void                               |
|  executeProbes() -> List<ProbeExecuted>                       |
+---------------------------------------------------------------+
         |
         v
+---------------------------+
| VantagePoint              |
|---------------------------|
| id: VantagePointId        |
| region: GeoRegion         |
| provider: string          |
| ipAddress: string         |
| healthy: bool             |
| lastHeartbeat: Timestamp  |
+---------------------------+
```

## Aggregate: ProbeTarget

The ProbeTarget aggregate defines what is being probed and tracks recent results.

```
+---------------------------------------------------------------+
|  <<Aggregate Root>>  ProbeTarget                              |
|---------------------------------------------------------------|
|  id: ProbeTargetId                                            |
|  serviceId: ServiceId                                         |
|  endpoint: string (URL/host)                                  |
|  probeType: ProbeType                                         |
|  expectedStatus: int | null                                   |
|  frequency: Duration                                          |
|  adaptiveMode: bool                                           |
|  recentResults: CircularBuffer<ProbeResult>                   |
|---------------------------------------------------------------|
|  execute(vantagePoint) -> ProbeResult                         |
|  escalateFrequency() -> void                                  |
|  resetFrequency() -> void                                     |
|  getLatencyTrend() -> LatencyTrend                            |
+---------------------------------------------------------------+
         |
         v
+---------------------------+
| ProbeResult               |
|---------------------------|
| id: ProbeResultId         |
| targetId: ProbeTargetId   |
| vantagePointId: Id        |
| probeType: ProbeType      |
| status: ProbeStatus       |
| latency: Latency          |
| httpStatusCode: int|null  |
| dnsResolveTime: Duration  |
| tlsHandshakeTime: Duration|
| errorMessage: string|null |
| executedAt: Timestamp     |
+---------------------------+
```

### Entities

| Entity | Description |
|--------|-------------|
| **ProbeFleet** | Aggregate root. A logical grouping of vantage points and their assigned targets in a region. |
| **ProbeTarget** | Aggregate root. Defines a specific endpoint to probe with its type, frequency, and recent history. |
| **Probe** | A single execution instance: one check of one target from one vantage point. |
| **ProbeResult** | The outcome of a single probe execution including latency, status, and error data. |
| **VantagePoint** | A geographic location (edge node) from which probes are dispatched. |

### Value Objects

| Value Object | Description |
|--------------|-------------|
| **ProbeType** | Enum: `HTTP`, `DNS`, `TCP`, `ICMP`, `TLS`. The protocol used for health checking. |
| **Latency** | Duration in milliseconds. Immutable measurement from a single probe. |
| **ProbeStatus** | Enum: `SUCCESS`, `TIMEOUT`, `CONNECTION_REFUSED`, `DNS_FAILURE`, `TLS_ERROR`, `HTTP_ERROR`. |
| **GeoRegion** | Identifier for a geographic region (e.g., `us-east`, `eu-west`, `ap-southeast`). |
| **LatencyTrend** | Computed value: direction (increasing/stable/decreasing) and magnitude over a time window. |

---

## Domain Events

| Event | Payload | Trigger |
|-------|---------|---------|
| **ProbeExecuted** | targetId, vantagePointId, probeType, status, latency, timestamp | A probe completes (success or failure) |
| **ProbeSucceeded** | targetId, vantagePointId, latency | Probe returns expected result within timeout |
| **ProbeFailed** | targetId, vantagePointId, status, errorMessage | Probe returns error or exceeds timeout |
| **LatencyAnomaly** | targetId, region, currentLatency, baselineLatency, deviation | Latency exceeds 3x baseline for the region |

### Event Flow

```
ScheduleConfig triggers
        |
        v
  ProbeFleet.executeProbes()
        |
        +---> VantagePoint A ---> ProbeTarget ---> ProbeExecuted
        |                                              |
        +---> VantagePoint B ---> ProbeTarget ---> ProbeExecuted
        |                                              |
        +---> VantagePoint C ---> ProbeTarget ---> ProbeExecuted
                                                       |
                                                       v
                                            Publish to Kafka: "probes.results"
                                                       |
                                                       v
                                            Detection Engine consumes
```

---

## Scheduling Strategy

### Normal Mode
- Each service probed every 30 seconds from each vantage point
- 15,000 services x 10 regions x 2 probes/minute = ~5,000 probes/second

### Adaptive Escalation
When the Detection Engine emits an `AnomalyDetected` or `OutageConfirmed` event
for a service, the Active Probing context escalates probe frequency:

| Detection State | Probe Frequency | Duration |
|----------------|-----------------|----------|
| OPERATIONAL | Every 30 seconds | Continuous |
| INVESTIGATING | Every 10 seconds | Until state changes |
| DEGRADED | Every 5 seconds | Until state changes |
| MAJOR_OUTAGE | Every 5 seconds | Until RECOVERING |
| RECOVERING | Every 10 seconds | Until RESOLVED |

Escalation is triggered by subscribing to the `detections.outages` Kafka topic.

---

## Geographic Distribution

Target deployment across 10+ regions:

```
+----------+  +----------+  +----------+  +----------+
| us-east  |  | us-west  |  | eu-west  |  | eu-central|
| (Virginia)|  | (Oregon) |  | (Ireland)|  | (Frankfurt)|
+----------+  +----------+  +----------+  +----------+

+----------+  +----------+  +----------+  +----------+
| ap-south |  | ap-south |  | ap-north |  | sa-east  |
| east     |  | (Mumbai) |  | east     |  | (Sao    |
| (Sydney) |  |          |  | (Tokyo)  |  |  Paulo)  |
+----------+  +----------+  +----------+  +----------+

+----------+  +----------+
| af-south |  | me-south |
| (Cape    |  | (Bahrain)|
|  Town)   |  |          |
+----------+  +----------+
```

Probes run as lightweight Rust workers deployed on Fly.io or equivalent edge
compute platform, ensuring low-latency execution close to target infrastructure.

---

## Integration Points

| Direction | Context | Mechanism | Data |
|-----------|---------|-----------|------|
| **Downstream** | Detection Engine | Kafka topic `probes.results` | All probe results |
| **Upstream** | Detection Engine | Kafka topic `detections.outages` | Outage events (for adaptive scheduling) |
| **Reference** | Service Catalog | Cached lookup | Service endpoints and probe configuration |

---

## Invariants

1. Every probe MUST execute from a healthy vantage point.
2. Probe results MUST include vantage point ID for geographic correlation.
3. Adaptive frequency escalation MUST NOT exceed 1 probe/second per target per region.
4. Vantage points MUST be health-checked via heartbeat; unhealthy points are excluded.
5. Probe timeout MUST be configured per ProbeType (HTTP: 10s, DNS: 5s, TCP: 5s, ICMP: 3s, TLS: 10s).
